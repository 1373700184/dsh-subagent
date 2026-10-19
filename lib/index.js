import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { SessionId } from "@deepseek-ai/dsh-session";
import {
	NO_START_CAPABILITIES,
	assertUsableCwd,
	settleRunResult,
	subprocessRunHandle,
} from "@deepseek-ai/dsh-subagent";

//#region metadata
/**
* Aggregate external subscription CLIs as dsh subagent providers.
* Each configured backend becomes a named `SubagentProvider` on `ctx.subagents`;
* a matching `@deepseek-ai/dsh-tool-subagent` instance (see cordis.patch.yml)
* exposes it to the model. Backends run one-shot: the CLI child is spawned, the
* prompt is delivered over stdin, and the Claude-style `stream-json` transcript
* is folded into a `SubagentResult`.
* @module dsh-subagent
*/
const name = "dsh-subagent";
const inject = ["subagents"];
//#endregion

//#region binary discovery
const platform = process.platform;
/** Candidate executable paths per built-in backend, most specific first. */
const KNOWN_BINARIES = {
	qoder: [
		join(homedir(), ".qoder", "bin", "qodercli", platform === "win32" ? "qodercli.exe" : "qodercli"),
	],
	qodercn: [
		join(homedir(), ".qoder-cn", "bin", "qoderclicn", platform === "win32" ? "qoderclicn.exe" : "qoderclicn"),
	],
};
/**
* Resolve a backend executable: an explicit config path wins; otherwise the
* first existing built-in candidate. A name with no built-in entry and no
* explicit binary is a configuration error surfaced at start, not load.
* @param providerName - registry name of the backend.
* @param explicit - configured binary path, if any.
* @returns an absolute path, or `undefined` when nothing is installed yet.
*/
function resolveBinary(providerName, explicit) {
	if (explicit) return explicit;
	for (const candidate of KNOWN_BINARIES[providerName] ?? []) {
		try {
			// eslint-disable-next-line no-empty
			if (existsSync(candidate)) return candidate;
		} catch {}
	}
	return undefined;
}
//#endregion

//#region config schema
const ProviderConfig = z.object({
	/** Registry name; must match a `dsh-tool-subagent` provider in the patch. */
	name: z.string().required(),
	/** Transport driver. Only `qoder-json` is implemented so far. */
	driver: z.string().default("qoder-json"),
	/** Absolute CLI path; omit to auto-detect built-in backends by name. */
	binary: z.string(),
	/** CLI permission mode for headless runs; cannot prompt, so default bypasses. */
	permissionMode: z.string().default("bypass_permissions"),
	/** Force a model id; omit to use the CLI's own default (e.g. a free tier). */
	model: z.string(),
	/** Reasoning effort passed to the CLI: auto|none|low|medium|high|xhigh|max|ultracode. */
	reasoningEffort: z.string().default("auto"),
	/** Explicit context window (positive integer tokens); omit for the CLI default. */
	contextWindow: z.number().min(1),
	/** Optional wall-clock cap per delegation, in seconds. */
	timeoutSeconds: z.number().min(1),
	/** Extra CLI args appended verbatim (advanced overrides). */
	extraArgs: z.array(z.string()).default([]),
});
const Config = z.object({
	providers: z
		.array(ProviderConfig)
		.default([
			{ name: "qoder", driver: "qoder-json" },
			{ name: "qodercn", driver: "qoder-json" },
		]),
});
//#endregion

//#region qoder-json driver
/**
* One-shot provider for a CLI that speaks the Claude-style `stream-json`
* protocol (`qodercli`, `qoderclicn`, ...): prompt on stdin, transcript events
* on stdout, terminating in a `result` event. Advertises no start-time
* capabilities and inherits no parent context, so the model tool uses the
* "does not see this conversation" wording.
*/
class QoderJsonProvider {
	name;
	capabilities = NO_START_CAPABILITIES;
	inheritsParentContext = false;
	#binary;
	#permissionMode;
	#model;
	#reasoningEffort;
	#contextWindow;
	#timeoutSeconds;
	#extraArgs;

	constructor(spec) {
		this.name = spec.name;
		this.#binary = spec.binary;
		this.#permissionMode = spec.permissionMode;
		this.#model = spec.model;
		this.#reasoningEffort = spec.reasoningEffort;
		this.#contextWindow = spec.contextWindow;
		this.#timeoutSeconds = spec.timeoutSeconds;
		this.#extraArgs = spec.extraArgs;
	}

	async start(request) {
		assertUsableCwd(this.name, "cwd", request.cwd);
		if (!this.#binary) {
			throw new Error(
				`${this.name}: no CLI binary resolved. Install the CLI or set a \`binary\` path in the dsh-subagent config.`,
			);
		}
		const prompt = promptText(request.prompt);
		const run = new QoderJsonRun({
			binary: this.#binary,
			args: this.#buildArgs(),
			cwd: request.cwd,
			prompt,
			signal: request.signal,
			timeoutMs: this.#timeoutSeconds ? this.#timeoutSeconds * 1000 : 0,
		});
		return run.handle();
	}

	#buildArgs() {
		const args = [
			"-p",
			"--input-format",
			"text",
			"--output-format",
			"stream-json",
			"--permission-mode",
			this.#permissionMode,
		];
		if (this.#model) args.push("--model", this.#model);
		if (this.#reasoningEffort && this.#reasoningEffort !== "auto") args.push("--reasoning-effort", this.#reasoningEffort);
		if (this.#contextWindow) args.push("--context-window", String(this.#contextWindow));
		args.push(...this.#extraArgs);
		return args;
	}
}

/** Join text blocks of a request prompt into a single stdin payload. */
function promptText(blocks) {
	return blocks
		.map((block) => (block && block.type === "text" ? block.text : ""))
		.filter(Boolean)
		.join("\n");
}

/**
* Owns one spawned CLI child and its lifecycle: line-buffered stdout parsing,
* cancellation/timeout teardown, and result settlement. Kept separate from the
* provider so distinct starts stay independent.
*/
class QoderJsonRun {
	#child;
	#signal;
	#timeoutMs;
	#stdoutBuf = "";
	#stderrTail = "";
	#assistantText = [];
	#resultEvent;
	#spawnError;
	#exitInfo;
	#timedOut = false;
	#cancelled = false;
	#settledText = "";
	#timeoutTimer;
	#onAbort;

	constructor(opts) {
		this.#signal = opts.signal;
		this.#timeoutMs = opts.timeoutMs;
		this.#child = spawn(opts.binary, opts.args, {
			cwd: opts.cwd,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		this.#child.stdin.on("error", () => {});
		this.#child.stdin.write(opts.prompt);
		this.#child.stdin.end();
		this.#child.stdout.setEncoding("utf8");
		this.#child.stdout.on("data", (chunk) => this.#onStdout(chunk));
		this.#child.stderr.setEncoding("utf8");
		this.#child.stderr.on("data", (chunk) => this.#appendStderr(chunk));
		this.#child.on("error", (error) => {
			this.#spawnError = error;
		});
		this.#child.on("close", (code, signal) => {
			this.#exitInfo = { code, signal };
		});
		if (this.#timeoutMs > 0) {
			this.#timeoutTimer = setTimeout(() => {
				this.#timedOut = true;
				this.#killTree();
			}, this.#timeoutMs);
		}
		this.#onAbort = () => {
			this.#cancelled = true;
			this.#killTree();
		};
		this.#signal.addEventListener("abort", this.#onAbort, { once: true });
	}

	handle() {
		const result = settleRunResult({
			attempt: () => this.#attempt(),
			collectOutput: () => this.#collectOutput(),
			collectDiagnostic: () => this.#collectDiagnostic(),
			cancelled: () => this.#cancelled,
			signal: this.#signal,
			onAbort: this.#onAbort,
		});
		return subprocessRunHandle({
			id: SessionId(randomUUID()),
			result,
			signal: this.#signal,
			onAbort: this.#onAbort,
			requestCancel: () => {
				this.#cancelled = true;
				this.#killTree();
			},
			teardown: () => this.#waitForExit(),
		});
	}

	#onStdout(chunk) {
		this.#stdoutBuf += chunk;
		let newline;
		while ((newline = this.#stdoutBuf.indexOf("\n")) >= 0) {
			const line = this.#stdoutBuf.slice(0, newline).trim();
			this.#stdoutBuf = this.#stdoutBuf.slice(newline + 1);
			if (line) this.#consumeEvent(line);
		}
	}

	#consumeEvent(line) {
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		if (event.type === "result") {
			this.#resultEvent = event;
			this.#settledText = typeof event.result === "string" ? event.result : "";
			return;
		}
		if (event.type === "assistant" && event.message?.content) {
			for (const block of event.message.content) {
				if (block.type === "text" && block.text) this.#assistantText.push(block.text);
			}
		}
	}

	#appendStderr(chunk) {
		this.#stderrTail = (this.#stderrTail + chunk).slice(-4096);
	}

	/** Wait for the child to settle, then map the transcript to a result. */
	async #attempt() {
		try {
			await this.#waitForExit();
			if (this.#spawnError) throw this.#spawnError;
			if (this.#resultEvent) {
				if (this.#resultEvent.is_error) {
					return {
						output: this.#collectOutput(),
						diagnostic: this.#resultDiagnostic(),
						stopReason: "error",
					};
				}
				return { output: this.#collectOutput(), stopReason: "completed" };
			}
			if (this.#timedOut) throw new Error(`timed out after ${this.#timeoutMs / 1000}s`);
			throw new Error(
				`CLI exited (code=${this.#exitInfo?.code} signal=${this.#exitInfo?.signal}) without a result event`,
			);
		} finally {
			if (this.#timeoutTimer) clearTimeout(this.#timeoutTimer);
		}
	}

	#collectOutput() {
		const text = this.#settledText || this.#assistantText.join("");
		return text ? [{ type: "text", text }] : [];
	}

	#collectDiagnostic() {
		const pieces = [this.#stderrTail, this.#exitInfo && `exit code=${this.#exitInfo.code} signal=${this.#exitInfo.signal}`].filter(Boolean);
		return pieces.join("\n") || undefined;
	}

	#resultDiagnostic() {
		const subtype = this.#resultEvent?.subtype ?? "error";
		const errors = Array.isArray(this.#resultEvent?.errors) ? this.#resultEvent.errors.join("; ") : "";
		const result = this.#settledText;
		return [subtype, result, errors, this.#stderrTail].filter(Boolean).join(" — ");
	}

	#waitForExit() {
		if (this.#exitInfo) return Promise.resolve();
		return new Promise((resolve) => this.#child.once("close", resolve));
	}

	#killTree() {
		if (this.#child.exitCode !== null || this.#child.signalCode !== null) return;
		if (platform === "win32") {
			const killer = spawn("taskkill", ["/pid", String(this.#child.pid), "/T", "/F"], {
				stdio: "ignore",
				windowsHide: true,
			});
			killer.on("error", () => this.#child.kill("SIGKILL"));
			return;
		}
		try {
			this.#child.kill("SIGKILL");
		} catch {}
	}
}
//#endregion

//#region probe (settings-page RPC)
const PROBE_TTL_MS = 5 * 60 * 1000;
const probeCache = new Map();

/** Run a short-lived CLI query and resolve with trimmed stdout. */
function runCli(binary, args, timeoutMs = 30000) {
	return new Promise((resolve, reject) => {
		const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			reject(new Error(`timed out: ${args.join(" ")}`));
		}, timeoutMs);
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => (stdout += chunk));
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve(stdout);
			else reject(new Error(stderr.trim() || `exit code ${code}`));
		});
	});
}

/** Existence, version, and model catalog for one backend, TTL-cached. */
async function probeBackend(spec) {
	const hit = probeCache.get(spec.name);
	if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.value;
	const value = { name: spec.name, binary: spec.binary ?? null, exists: false, version: null, models: [], error: null };
	if (!spec.binary || !existsSync(spec.binary)) {
		value.error = "CLI binary not found. Install the Qoder CLI or set a binary path.";
	} else {
		try {
			value.version = (await runCli(spec.binary, ["--version"])).trim().split(/\r?\n/)[0];
			const listing = (await runCli(spec.binary, ["--list-models"])).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
			value.models = listing.filter((line) => line !== "MODEL");
			value.exists = true;
		} catch (error) {
			value.error = String(error?.message ?? error).slice(0, 512);
		}
	}
	probeCache.set(spec.name, { at: Date.now(), value });
	return value;
}

/**
* Serve the settings page over the same authenticated /api bridge the Codex
* subscription plugin uses: one POST route per endpoint, `{type,rpcId,result}`
* envelope. Absent in credential-less hosts (headless), where the page is moot.
*/
function registerProbeRoutes(connection, registry) {
	const route = (endpoint, handle) => connection.fetch.register({
		path: `/api/qoder-subagent/${endpoint}`,
		methods: ["POST"],
		requestBody: "buffered",
		async fetch(request) {
			const method = `qoder-subagent/${endpoint}`;
			let envelope;
			try {
				envelope = await request.json();
			} catch {
				return Response.json({ type: "server-response", rpcId: null, result: { ok: false, error: { code: "invalid", message: "invalid JSON", details: { issues: [] } } } });
			}
			let result;
			try {
				if (envelope?.method !== method) throw new Error("method mismatch");
				result = { ok: true, value: await handle(envelope.payload ?? {}, request.signal) };
			} catch (error) {
				result = { ok: false, error: { code: "internal", message: "qoder-subagent probe failed", details: { issues: [String(error?.message ?? error).slice(0, 256)] } } };
			}
			return Response.json({ type: "server-response", rpcId: envelope?.rpcId ?? null, result });
		},
	});
	return [
		route("probe", (payload) => {
			const spec = registry.get(String(payload?.name ?? ""));
			if (!spec) throw new Error("unknown provider");
			return probeBackend(spec);
		}),
		route("refresh", (payload) => {
			probeCache.delete(String(payload?.name ?? ""));
			const spec = registry.get(String(payload?.name ?? ""));
			if (!spec) throw new Error("unknown provider");
			return probeBackend(spec);
		}),
	];
}
//#endregion

//#region wiring
/** Register every configured backend as a named provider on `ctx.subagents`. */
function apply(ctx, config) {
	const registry = new Map();
	for (const provider of config.providers ?? []) {
		const driver = provider.driver ?? "qoder-json";
		if (driver !== "qoder-json") {
			ctx.logger?.warn?.(`dsh-subagent: unknown driver "${driver}" for provider "${provider.name}", skipped`);
			continue;
		}
		const spec = {
			name: provider.name,
			binary: resolveBinary(provider.name, provider.binary),
			permissionMode: provider.permissionMode ?? "bypass_permissions",
			model: provider.model ?? undefined,
			reasoningEffort: provider.reasoningEffort ?? "auto",
			contextWindow: provider.contextWindow ?? undefined,
			timeoutSeconds: provider.timeoutSeconds ?? undefined,
			extraArgs: provider.extraArgs ?? [],
		};
		registry.set(spec.name, spec);
		ctx.subagents.registerProvider(new QoderJsonProvider(spec));
	}
	ctx.inject(["connection"], (scoped) => {
		scoped.effect(() => {
			const disposers = registerProbeRoutes(scoped.connection, registry);
			return () => disposers.forEach((dispose) => dispose());
		});
	});
}
//#endregion

export { Config, apply, inject, name };
