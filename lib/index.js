import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
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
const inject = ["subagents", "tools", "commands"];
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
		])
		.volatile(),
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
	#getSpec;

	constructor(name, getSpec) {
		this.name = name;
		this.#getSpec = getSpec;
	}

	async start(request) {
		assertUsableCwd(this.name, "cwd", request.cwd);
		const spec = this.#getSpec();
		if (!spec) {
			throw new Error(`${this.name}: provider is no longer present in the dsh-subagent config.`);
		}
		if (!spec.binary) {
			throw new Error(
				`${this.name}: no CLI binary resolved. Install the CLI or set a \`binary\` path in the dsh-subagent config.`,
			);
		}
		const prompt = promptText(request.prompt);
		const id = SessionId(randomUUID());
		const activity = activityLedger.begin({ id, provider: this.name, label: request.label ?? "", prompt: prompt.slice(0, 160) });
		const run = new QoderJsonRun({
			id,
			activity,
			binary: spec.binary,
			args: buildArgs(spec),
			cwd: request.cwd,
			prompt,
			signal: request.signal,
			timeoutMs: spec.timeoutSeconds ? spec.timeoutSeconds * 1000 : 0,
		});
		return run.handle();
	}
}

/** Assemble CLI headless args from a resolved provider spec. */
function buildArgs(spec) {
	const args = [
		"-p",
		"--input-format",
		"text",
		"--output-format",
		"stream-json",
		"--permission-mode",
		spec.permissionMode,
	];
	if (spec.model) args.push("--model", spec.model);
	if (spec.reasoningEffort && spec.reasoningEffort !== "auto") args.push("--reasoning-effort", spec.reasoningEffort);
	if (spec.contextWindow) args.push("--context-window", String(spec.contextWindow));
	args.push(...(spec.extraArgs ?? []));
	return args;
}

/** Join text blocks of a request prompt into a single stdin payload. */
function promptText(blocks) {
	return blocks
		.map((block) => (block && block.type === "text" ? block.text : ""))
		.filter(Boolean)
		.join("\n");
}

//#region activity ledger (live progress for the chat toolview)
const MAX_RUNS = 24;
const MAX_EVENTS = 200;
const MAX_EVENT_TEXT = 1500;

/**
* Bounded in-memory ledger of recent child runs with their parsed CLI events.
* The browser toolview polls it by run id (the same uuid `start()` mints and the
* delegation tool echoes in `started subagent <id>`), and the `qoder_subagent_status`
* tool exposes it to the parent agent, so a delegated child reads like a local
* subtask: live status, expandable transcript, and a queryable progress log.
*/
class ActivityLedger {
	runs = [];
	begin(meta) {
		const entry = { ...meta, sessionId: null, startedAt: Date.now(), endedAt: null, status: "running", events: [] };
		this.runs.unshift(entry);
		if (this.runs.length > MAX_RUNS) this.runs.length = MAX_RUNS;
		return {
			record(kind, text) {
				if (entry.events.length >= MAX_EVENTS) entry.events.shift();
				entry.events.push({ t: Date.now(), kind, text: String(text ?? "").slice(0, MAX_EVENT_TEXT) });
			},
			meta(key, value) {
				if (value != null && entry[key] == null) entry[key] = value;
			},
			finish(status, summary) {
				if (entry.status !== "running") return;
				entry.status = status;
				entry.endedAt = Date.now();
				if (summary) this.record("result", summary);
			},
		};
	}
	view(id) {
		const run = this.runs.find((candidate) => candidate.id === id);
		if (!run) return null;
		return { ...run, eventCount: run.events.length, events: run.events.slice() };
	}
	recent(limit) {
		return this.runs.slice(0, limit).map((run) => ({ ...run, eventCount: run.events.length, events: run.events.slice(-12) }));
	}
}
const activityLedger = new ActivityLedger();
//#endregion

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
	#id;
	#activity;
	#credits = { total: undefined, billable: undefined, model: undefined };

	constructor(opts) {
		this.#id = opts.id;
		this.#activity = opts.activity;
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
			this.#activity?.finish("error", `spawn failed: ${error?.message ?? error}`);
		});
		this.#child.on("close", (code, signal) => {
			this.#exitInfo = { code, signal };
			if (code !== 0 && !this.#resultEvent) this.#activity?.finish("error", `CLI exited with code ${code}`);
		});
		if (this.#timeoutMs > 0) {
			this.#timeoutTimer = setTimeout(() => {
				this.#timedOut = true;
				this.#activity?.record("error", `timed out after ${this.#timeoutMs / 1000}s`);
				this.#killTree();
			}, this.#timeoutMs);
		}
		this.#onAbort = () => {
			this.#cancelled = true;
			this.#activity?.finish("aborted");
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
			id: this.#id,
			result,
			signal: this.#signal,
			onAbort: this.#onAbort,
			requestCancel: () => {
				this.#cancelled = true;
				this.#activity?.finish("aborted");
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
		this.#activity?.meta("sessionId", event.session_id);
		if (event.type === "result") {
			this.#resultEvent = event;
			this.#settledText = typeof event.result === "string" ? event.result : "";
			this.#activity?.meta("credits", {
				total: typeof event.total_credits === "number" ? event.total_credits : 0,
				billable: this.#credits.billable,
				model: this.#credits.model,
			});
			this.#activity?.finish(event.is_error ? "error" : "completed", this.#settledText || undefined);
			return;
		}
		if (event.type === "assistant" && event.message?.usage) {
			const usage = event.message.usage;
			if (typeof usage.billable === "boolean") this.#credits.billable = usage.billable;
			if (typeof usage.original_credits === "number") this.#credits.original = usage.original_credits;
			if (typeof event.message.model === "string") this.#credits.model = event.message.model;
		}
		if ((event.type === "assistant" || event.type === "user") && event.message?.content) {
			for (const block of event.message.content) {
				if (block.type === "text" && block.text) {
					if (event.type === "assistant") this.#assistantText.push(block.text);
					this.#activity?.record("text", block.text);
				} else if (block.type === "thinking" && block.thinking) {
					this.#activity?.record("think", block.thinking);
				} else if (block.type === "tool_use") {
					const detail = typeof block.input?.command === "string" ? block.input.command : block.input?.file_path ?? block.input?.pattern ?? "";
					this.#activity?.record("tool", `${block.name ?? "tool"} ${detail}`.trim());
				}
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
/**
* Credit multiplier snapshot shown by the Qoder CLI model picker (2026-10).
* The CLI fetches this from its backend at runtime and keeps no local copy, so
* the plugin embeds the observed rates; unknown models simply show no suffix.
*/
const CREDIT_RATES = {
	"Qwen3.8-Flash": "0.10x–0.00x",
	"Qwen3.7-Max": "0.50x",
	"Qwen3.7-Plus": "0.16x",
	"Kimi-K3": "1.40x",
	"Kimi-K2.8-Preview": "0.80x",
	"GLM-5.3": "0.80x",
	"GLM-5.3-Flash": "0.10x",
	"DeepSeek-V4-Pro": "0.50x",
	"DeepSeek-Flash": "0.10x–0.00x",
	"MiniMax-M3.1-Flash": "0.16x",
};
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
	const value = { name: spec.name, binary: spec.binary ?? null, exists: false, version: null, models: [], rates: CREDIT_RATES, error: null };
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
			const name = String(payload?.name ?? "");
			probeCache.delete(name);
			const spec = registry.get(name);
			if (!spec) throw new Error("unknown provider");
			return probeBackend(spec);
		}),
		route("activity", (payload) => ({ run: activityLedger.view(String(payload?.runId ?? "")), now: Date.now() })),
	];
}
//#endregion

//#region wiring
/** Unwrap a possibly-volatile `providers` config field to a plain array. */
function readProviders(config) {
	const raw = typeof config?.providers?.get === "function" ? config.providers.get() : config?.providers;
	return Array.isArray(raw) ? raw : [];
}

/** Normalize one raw provider entry into a resolved spec (binary auto-detected). */
function normalizeSpec(entry) {
	return {
		name: entry.name,
		driver: entry.driver ?? "qoder-json",
		binary: resolveBinary(entry.name, entry.binary),
		permissionMode: entry.permissionMode ?? "bypass_permissions",
		model: entry.model ?? undefined,
		reasoningEffort: entry.reasoningEffort ?? "auto",
		contextWindow: entry.contextWindow ?? undefined,
		timeoutSeconds: entry.timeoutSeconds ?? undefined,
		extraArgs: entry.extraArgs ?? [],
	};
}

/** Render one ledger run as a compact, context-safe digest for the model. */
function digestRun(run, eventBudget) {
	const credits = run.credits
		? ` | credits: ${run.credits.total > 0 ? run.credits.total.toFixed(4) : run.credits.billable === false ? "free" : "0"}`
		: "";
	const head = `run ${run.id} | ${run.provider} | ${run.status} | ${Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 1000)}s | label: ${run.label || "(none)"}${run.sessionId ? ` | cli session: ${run.sessionId}` : ""}${credits}`;
	const events = run.events.slice(-eventBudget).map((event) => `  [+${Math.round((event.t - run.startedAt) / 1000)}s] ${event.kind}: ${event.text.slice(0, 200).replace(/\s+/g, " ")}`);
	const omitted = run.events.length - events.length;
	return [head, ...(omitted > 0 ? [`  … (${omitted} earlier events omitted)`] : []), ...events].join("\n");
}

/** Register every configured backend as a named provider on `ctx.subagents`. */
function apply(ctx, config) {
	// Provider specs are read live (volatile config), so settings-page edits take
	// effect on the next delegation without re-registering providers or restarting.
	const liveSpec = (name) => {
		const entry = readProviders(config).find((candidate) => candidate.name === name);
		return entry ? normalizeSpec(entry) : undefined;
	};
	const registry = {
		list: () => readProviders(config).map((entry) => entry.name),
		get: (name) => liveSpec(name),
	};
	for (const entry of readProviders(config)) {
		if ((entry.driver ?? "qoder-json") !== "qoder-json") {
			ctx.logger?.warn?.(`dsh-subagent: unknown driver "${entry.driver}" for provider "${entry.name}", skipped`);
			continue;
		}
		ctx.effect(() => {
			const dispose = ctx.subagents.registerProvider(new QoderJsonProvider(entry.name, () => liveSpec(entry.name)));
			return () => dispose?.();
		});
		ctx.effect(() => {
			const dispose = ctx.commands.register({
				name: entry.name,
				description: `把这一行任务交给 ${entry.name} 子代理(经由工具调用,实时进度/扣费/完成通知齐全)`,
				input: { hint: "任务描述" },
				handler(invocation) {
					const task = invocation.rawInput.trim();
					if (!task) return { kind: "error", text: `用法: /${entry.name} <任务描述>` };
					try {
						invocation.agent.followup(createUserMessage({
							content: [{ type: "text", text: `请使用 ${entry.name} 工具把以下任务委派给子代理(不要自己执行)。完成后把子代理的结果转述给我。\n\n任务:\n${task}` }],
							source: { kind: "user" },
						}));
						return { kind: "success", text: `已交给会话:即将用 ${entry.name} 工具委派,实时进度会显示在工具行里。` };
					} catch (error) {
						return { kind: "error", text: `${entry.name} 指令失败: ${String(error?.message ?? error).slice(0, 300)}` };
					}
				},
			});
			return () => dispose?.();
		});
	}
	ctx.effect(() => {
		const dispose = ctx.tools.register(defineTool({
			name: "qoder_subagent_status",
			description: "Check progress of background Qoder subagent delegations at any time. Omit run_id to list recent runs with their latest activity; pass the run id returned by a delegation (`started subagent <id>`) for that run's event transcript (thinking, tool calls, output). Use this instead of blind sleeping when asked how a delegated child is going.",
			parameters: {
				run_id: {
					type: "string",
					description: "Run id from a delegation tool result. Omit to list recent runs.",
				},
			},
			output: {
				schema: { type: "string" },
				render: (_args, result) => [{ type: "text", text: result }],
			},
			execute(args) {
				const runId = args?.run_id ? String(args.run_id) : undefined;
				if (runId) {
					const run = activityLedger.view(runId);
					return Promise.resolve(run ? digestRun(run, 40) : `unknown run id ${runId}; recent ids: ${activityLedger.runs.map((candidate) => candidate.id).join(", ") || "(none)"}`);
				}
				const runs = activityLedger.recent(6);
				if (runs.length === 0) return Promise.resolve("no Qoder subagent runs recorded yet");
				return Promise.resolve(runs.map((run) => digestRun(run, 5)).join("\n\n"));
			},
		}));
		return () => dispose?.();
	});
	ctx.inject(["connection"], (scoped) => {
		scoped.effect(() => {
			const disposers = registerProbeRoutes(scoped.connection, registry);
			return () => disposers.forEach((dispose) => dispose());
		});
	});
}
//#endregion

export { Config, apply, inject, name };
