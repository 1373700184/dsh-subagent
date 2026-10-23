import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { createUserMessage, boundContextSummary } from "@deepseek-ai/dsh-llm";
import * as ToolSubagentPlugin from "@deepseek-ai/dsh-tool-subagent";
import { SessionId } from "@deepseek-ai/dsh-session";
import {
	NO_START_CAPABILITIES,
	assertUsableCwd,
	settleRunResult,
	subprocessRunHandle,
} from "@deepseek-ai/dsh-subagent";

//#region 元数据
/**
* 把外部订阅制 CLI 聚合为 dsh 子代理提供方。
* 每个已配置后端都会在 `ctx.subagents` 上注册为具名 `SubagentProvider`;
* 配套的 `@deepseek-ai/dsh-tool-subagent` 实例(见 cordis.patch.yml)
* 把它暴露给模型。后端均一次性执行:启动 CLI 子进程,
* 通过 stdin 送入提示词,再把 Claude 风格的 `stream-json` 事件流
* 收敛为 `SubagentResult`。
*/
const name = "dsh-subagent";
const inject = ["subagents", "tools", "commands"];
//#endregion

//#region CLI 路径探测
const platform = process.platform;
/** 每个内置后端的候选可执行文件路径,越具体的越靠前。 */
const KNOWN_BINARIES = {
	qoder: [
		join(homedir(), ".qoder", "bin", "qodercli", platform === "win32" ? "qodercli.exe" : "qodercli"),
	],
	qodercn: [
		join(homedir(), ".qoder-cn", "bin", "qoderclicn", platform === "win32" ? "qoderclicn.exe" : "qoderclicn"),
	],
	opencode: [
		join(homedir(), ".opencode", "bin", platform === "win32" ? "opencode.exe" : "opencode"),
	],
	pi: [
		join(homedir(), ".pi", "agent", "bin", "pi-launcher.js"),
	],
	codebuddy: [
		join(homedir(), "AppData", "Roaming", "npm", "node_modules", "@tencent-ai", "codebuddy-code", "bin", "codebuddy"),
	],
	codex: [
		// 优先原生 exe:cmd 包装脚本在 detached 模式下会静默退出
		join(
			homedir(), "AppData", "Roaming", "npm", "node_modules", "@openai", "codex", "node_modules", "@openai",
			process.arch === "arm64" ? "codex-win32-arm64" : "codex-win32-x64",
			"vendor", process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc",
			"bin", "codex.exe",
		),
		join(homedir(), "AppData", "Roaming", "npm", "codex.cmd"),
		join(homedir(), "AppData", "Roaming", "npm", "codex"),
	],
	claude: [
		join(homedir(), "AppData", "Roaming", "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
		join(homedir(), "AppData", "Roaming", "npm", "claude.cmd"),
		join(homedir(), "AppData", "Roaming", "npm", "claude"),
	],
};
/** 设置页可添加的内置后端;是否启用由用户显式选择。 */
const BUILTIN_PROVIDERS = [
	{ name: "qoder", driver: "qoder-json" },
	{ name: "qodercn", driver: "qoder-json" },
	{ name: "opencode", driver: "opencode-json" },
	{ name: "pi", driver: "pi-json" },
	{ name: "codebuddy", driver: "codebuddy-json" },
	{ name: "codex", driver: "codex-json" },
	{ name: "claude", driver: "claude-json" },
];
/** 预设 persona 中每个内置后端的一句话说明。 */
const BACKEND_GUIDES = {
	qoder: "Qoder 国际版订阅额度,适合强推理与长任务",
	qodercn: "Qoder 国内版订阅额度,适合强推理与长任务",
	opencode: "OpenCode,优先使用免费的 *-free 模型,适合常规编码与批量工作",
	pi: "Pi 编码代理,适合需要工具链配合的实现任务",
	codebuddy: "腾讯 CodeBuddy Code,模型目录丰富,适合中文任务与常规编码",
	codex: "OpenAI Codex CLI 订阅,适合代码实现、重构与审查",
	claude: "Claude Code CLI,按本机 Claude 配置(如 Anthropic/DeepSeek 网关)运行,适合长上下文编码",
};
/** pi 的受管安装根目录。 */
function piInstallRoot() {
	return join(homedir(), ".pi", "agent", "install");
}
/**
* 直接解析 pi 的实际 CLI 入口,绕过 `pi-launcher.js`。
* 启动器的内部 spawnSync 没有 windowsHide,会让 Windows 11
* 为真正的 CLI 新开一个终端窗口。
*/
function resolvePiCli() {
	try {
		const installRoot = piInstallRoot();
		const version = readFileSync(join(installRoot, "current-version"), "utf8").trim();
		if (!version || version === "." || version === ".." || !/^[0-9A-Za-z._+-]+$/.test(version)) return undefined;
		const packageDir = join(installRoot, "releases", version, "node_modules", "@earendil-works", "pi-coding-agent");
		const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
		const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.pi;
		if (!bin) return undefined;
		const cli = join(packageDir, bin);
		return existsSync(cli) ? cli : undefined;
	} catch {
		return undefined;
	}
}
/**
* Claude Code 没有模型目录命令,优先读取本机 settings/env
* 中实际映射的模型;没有自定义映射时才退回官方别名。
*/
function claudeModels() {
	let settings = {};
	try {
		settings = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8"));
	} catch {}
	const env = { ...process.env, ...(settings.env ?? {}) };
	const keys = ["ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL"];
	const models = [...new Set(keys
		.map((key) => env[key])
		.filter((value) => typeof value === "string" && value.trim())
		.map((value) => value.trim()))];
	return models.length > 0 ? models : ["default", "fable", "opus", "sonnet", "haiku", "opusplan"];
}
/** 为 `{{subagent_backends}}` 提示词变量渲染当前启用的后端、调度模式和并发上限。 */
function backendGuide(providers, mode, runningOf) {
	if (providers.length === 0) return "(当前没有启用外部 CLI 后端,不要调用不存在的委派工具)";
	const header = mode === "balanced"
		? "调度模式: 平均分配(任务尽量轮流分给下列后端,并遵守各自并发上限)"
		: "调度模式: 优先启动(按下列顺序,前一个达到并发上限再用下一个)";
	const lines = providers.map((entry) => {
		const limit = Math.max(1, Number(entry.maxConcurrency) || 2);
		const running = runningOf?.(entry.name) ?? 0;
		return `- ${entry.name}:${BACKEND_GUIDES[entry.name] ?? "外部 CLI 子代理,按需选用"} (并发上限 ${limit},当前运行 ${running})`;
	});
	return [header, ...lines].join("\n");
}
/**
* 解析后端可执行文件:显式配置的路径优先;否则取
* 第一个存在的内置候选。既无内置条目又无显式路径的名称
* 属于配置错误,在启动时而不是加载时暴露。
* @param providerName - 后端注册名。
* @param explicit - 配置中的可执行文件路径(如有)。
* @returns 绝对路径;尚未安装时返回 `undefined`。
*/
function resolveBinary(providerName, explicit) {
	if (explicit) return explicit;
	if (providerName === "pi") {
		const cli = resolvePiCli();
		if (cli) return cli;
	}
	for (const candidate of KNOWN_BINARIES[providerName] ?? []) {
		try {
			// eslint-disable-next-line no-empty -- 探测路径读取失败时允许空 catch
			if (existsSync(candidate)) return candidate;
		} catch {}
	}
	return undefined;
}
//#endregion

//#region 配置结构
const ProviderConfig = z.object({
	/** 注册名;必须与 patch 中 `dsh-tool-subagent` 的 provider 一致。 */
	name: z.string().required(),
	/** 传输驱动:qoder-json | opencode-json | pi-json | codebuddy-json | codex-json | claude-json。 */
	driver: z.string().default("qoder-json"),
	/** CLI 绝对路径;省略则按内置名称自动探测。 */
	binary: z.string(),
	/** 无头运行的 CLI 权限模式;无法弹窗询问,故默认放行。 */
	permissionMode: z.string().default("bypass_permissions"),
	/** 强制指定模型 id;省略则使用 CLI 自己的默认值(如免费额度)。 */
	model: z.string(),
	/** 有序的模型回退链;非空时覆盖 `model`。 */
	models: z.array(z.string()).default([]),
	/** 整条回退链共用的总等待预算,单位秒。 */
	allowedWaitSeconds: z.number().min(1),
	/** 传给 CLI 的思考程度:auto|none|low|medium|high|xhigh|max|ultracode。 */
	reasoningEffort: z.string().default("auto"),
	/** 显式上下文窗口(正整数 token);省略则使用 CLI 默认值。 */
	contextWindow: z.number().min(1),
	/** 单次委派的墙钟上限(秒),可选。 */
	timeoutSeconds: z.number().min(1),
	/** CLI 连续无输出的秒数,达到后提醒父 agent;0 表示关闭。 */
	stallWarnSeconds: z.number().min(0),
	/** 原样追加的额外 CLI 参数(高级覆盖项)。 */
	extraArgs: z.array(z.string()).default([]),
	/** 同时最多执行几个该后端子代理;超出后排队。 */
	maxConcurrency: z.number().min(1).default(2),
});
const Config = z.object({
	/** 调度模式:priority(按后端顺序优先启动)或 balanced(平均分配)。 */
	scheduleMode: z.string().default("priority").volatile(),
	/** `/sub_agent_status` 列出最近运行的数量(1-24)。 */
	statusListLimit: z.number().min(1).max(24).default(16).volatile(),
	providers: z
		.array(ProviderConfig)
		.default(BUILTIN_PROVIDERS.map(({ name, driver }) => ({ name, driver })))
		.volatile(),
});
//#endregion

/**
* 按后端限制同时运行数;超出上限时 FIFO 排队,
* 取消时从队列移除。返回的 release 必须在使用结束后调用。
*/
class ProviderGate {
	#states = new Map();
	acquire(name, limit, signal) {
		let state = this.#states.get(name);
		if (!state) {
			state = { active: 0, limit: Math.max(1, limit), queue: [] };
			this.#states.set(name, state);
		}
		state.limit = Math.max(1, limit);
		this.#drain(state);
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(new Error("cancelled"));
				return;
			}
			const grant = () => {
				state.active += 1;
				let released = false;
				resolve(() => {
					if (released) return;
					released = true;
					state.active = Math.max(0, state.active - 1);
					this.#drain(state);
				});
			};
			if (state.active < state.limit && state.queue.length === 0) {
				grant();
				return;
			}
			const waiter = { grant, signal, onAbort: undefined };
			waiter.onAbort = () => {
				const at = state.queue.indexOf(waiter);
				if (at >= 0) state.queue.splice(at, 1);
				reject(new Error("cancelled"));
			};
			signal?.addEventListener("abort", waiter.onAbort, { once: true });
			state.queue.push(waiter);
		});
	}
	/** 当前已占用槽位的运行数(不含排队)。 */
	active(name) {
		return this.#states.get(name)?.active ?? 0;
	}
	/** 接管一条宿主机重启前遗留的运行,直接占用一个槽位。 */
	reserve(name) {
		let state = this.#states.get(name);
		if (!state) {
			state = { active: 0, limit: 2, queue: [] };
			this.#states.set(name, state);
		}
		state.active += 1;
		let released = false;
		return () => {
			if (released) return;
			released = true;
			state.active = Math.max(0, state.active - 1);
			this.#drain(state);
		};
	}
	#drain(state) {
		while (state.active < state.limit && state.queue.length > 0) {
			const waiter = state.queue.shift();
			waiter.signal?.removeEventListener("abort", waiter.onAbort);
			waiter.grant();
		}
	}
}
const providerGate = new ProviderGate();

//#region qoder-json 驱动
/**
* 面向使用 Claude 风格 `stream-json` 协议的 CLI
* (`qodercli`、`qoderclicn` 等)的一次性提供方:提示词经 stdin 送入,
* 转录事件从 stdout 读取,以 `result` 事件结束。不声明启动期
* 能力,也不继承父上下文,因此模型工具会使用
* “看不到当前对话”的措辞。
*/
class QoderJsonProvider {
	name;
	capabilities = NO_START_CAPABILITIES;
	inheritsParentContext = false;
	#getSpec;
	#getAgent;

	constructor(name, getSpec, getAgent) {
		this.name = name;
		this.#getSpec = getSpec;
		this.#getAgent = getAgent;
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
		const activity = activityLedger.begin({ id, provider: this.name, label: request.label ?? "", prompt: prompt.slice(0, 160), stallWarnSeconds: spec.stallWarnSeconds });
		const chain = spec.models.length > 0 ? spec.models : [undefined];
		let currentRun;
		let cancelled = false;
		let lastDiagnostic;
		const aborted = new Promise((resolve) => request.signal.addEventListener("abort", () => resolve("aborted"), { once: true }));
		const onAbort = () => {
			cancelled = true;
			void currentRun?.dispose();
		};

		const runChain = async () => {
			const deadline = Date.now() + spec.allowedWaitSeconds * 1000;
			const tried = [];
			for (const model of chain) {
				if (cancelled) throw new Error("cancelled");
				const label = model ?? "(CLI 默认)";
				activity.record("model", `正在尝试模型 ${label}`);
				const driver = DRIVERS[spec.driver];
				const spawnSpec = spawnCommand(spec.driver, spec);
				const run = new QoderJsonRun({
					id,
					activity,
					parentAgent: this.#getAgent?.(request.parent?.id),
					stallWarnSeconds: spec.stallWarnSeconds,
					warnAfterFirstEvent: true,
					driver,
					driverName: spec.driver,
					provider: this.name,
					label: request.label ?? "",
					promptSummary: prompt.slice(0, 160),
					parentId: request.parent?.id,
					command: spawnSpec.command,
					args: [...spawnSpec.prefix, ...driver.buildArgs(spec, model)],
					env: spawnSpec.env,
					cwd: request.cwd,
					prompt,
					signal: request.signal,
					timeoutMs: spec.timeoutSeconds ? spec.timeoutSeconds * 1000 : 0,
				});
				currentRun = run;
				const remaining = Math.max(0, deadline - Date.now());
				const waitMs = spec.stallWarnSeconds > 0 ? Math.min(spec.stallWarnSeconds * 1000, remaining) : remaining;
				const first = await Promise.race([
					run.firstEvent.then(() => "ready"),
					new Promise((resolve) => setTimeout(() => resolve("timeout"), waitMs)),
					aborted,
				]);
				if (first === "aborted" || cancelled) {
					await run.dispose();
					throw new Error("cancelled");
				}
				if (first === "ready") {
					const result = await run.handle().result;
					await run.dispose();
					if (result.stopReason === "completed") return result;
					if (cancelled) throw new Error("cancelled");
					tried.push(`${label}: ${result.stopReason}${result.diagnostic ? ` — ${result.diagnostic.slice(0, 160)}` : ""}`);
					activity.record("error", `${label} 失败(${result.stopReason}),尝试下一个模型`);
					if (Date.now() >= deadline) break;
					continue;
				}
				tried.push(`${label}: ${Math.round(waitMs / 1000)} 秒无输出`);
				activity.record("error", `${label} ${Math.round(waitMs / 1000)} 秒无输出,切换下一个模型`);
				await run.dispose();
				if (Date.now() >= deadline) break;
			}
			lastDiagnostic = `所有模型均失败或超过允许等待时间(${spec.allowedWaitSeconds}s)。尝试记录:\n${tried.join("\n")}`;
			activity.record("error", lastDiagnostic);
			throw new Error(lastDiagnostic);
		};

		const attempt = async () => {
			const limit = Math.max(1, Number(spec.maxConcurrency) || 2);
			activity.record("queue", `等待 ${this.name} 并发槽(上限 ${limit})`);
			let release;
			try {
				release = await providerGate.acquire(this.name, limit, request.signal);
				activity.record("queue", `已获得并发槽(上限 ${limit})`);
				return await runChain();
			} finally {
				release?.();
			}
		};

		const result = settleRunResult({
			attempt,
			collectOutput: () => [],
			collectDiagnostic: () => lastDiagnostic,
			cancelled: () => cancelled,
			signal: request.signal,
			onAbort,
		});
		return subprocessRunHandle({
			id,
			result,
			signal: request.signal,
			onAbort,
			requestCancel: () => {
				cancelled = true;
				void currentRun?.dispose();
			},
			teardown: async () => {
				await currentRun?.dispose();
			},
		});
	}
}

/**
* 每个 CLI 的传输驱动。驱动负责构造 argv、把原始
* JSON 事件追踪到共享运行状态,并列出可用模型 id。完成信号是
* CLI 的 `result` 事件(qoder)或进程以 0 退出(opencode/pi)。
*/
const DRIVERS = {
	"qoder-json": {
		buildArgs(spec, model) {
			const args = ["-p", "--input-format", "text", "--output-format", "stream-json", "--permission-mode", spec.permissionMode];
			if (model) args.push("--model", model);
			if (spec.reasoningEffort && spec.reasoningEffort !== "auto") args.push("--reasoning-effort", spec.reasoningEffort);
			if (spec.contextWindow) args.push("--context-window", String(spec.contextWindow));
			args.push(...(spec.extraArgs ?? []));
			return args;
		},
		consume(event, sink) {
			sink.session(event.session_id);
			if (event.type === "result") {
				sink.credits({ total: typeof event.total_credits === "number" ? event.total_credits : 0, billable: sink.billable(), model: sink.modelName() });
				sink.result(typeof event.result === "string" ? event.result : "", event.is_error === true);
				return;
			}
			if (event.type === "assistant" && event.message?.usage) {
				const usage = event.message.usage;
				sink.usage({ billable: usage.billable, model: event.message.model });
			}
			if ((event.type === "assistant" || event.type === "user") && event.message?.content) {
				for (const block of event.message.content) {
					if (block.type === "text" && block.text) sink.text(block.text, event.type === "assistant");
					else if (block.type === "thinking" && block.thinking) sink.record("think", block.thinking);
					else if (block.type === "tool_use") sink.tool(block.name, block.input);
				}
			}
		},
		modelArgs: () => ["--list-models"],
		parseModels: (out) => out.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && line !== "MODEL"),
		usesResultEvent: true,
	},
	"codebuddy-json": {
		buildArgs(spec, model) {
			const modes = { bypass_permissions: "bypassPermissions", accept_edits: "acceptEdits", dont_ask: "dontAsk", auto: "auto", default: "default", plan: "plan" };
			const args = ["-p", "--input-format", "text", "--output-format", "stream-json", "--permission-mode", modes[spec.permissionMode] ?? "bypassPermissions"];
			if (model) args.push("--model", model);
			if (spec.reasoningEffort && spec.reasoningEffort !== "auto") args.push("--effort", spec.reasoningEffort);
			args.push(...(spec.extraArgs ?? []));
			return args;
		},
		consume(event, sink) {
			sink.session(event.session_id);
			if (event.type === "result") {
				if (typeof event.total_credits === "number") {
					sink.credits({ total: event.total_credits, billable: sink.billable(), model: sink.modelName() });
				} else if (typeof event.total_cost_usd === "number" && event.total_cost_usd > 0) {
					sink.cost(event.total_cost_usd);
				}
				sink.result(typeof event.result === "string" ? event.result : "", event.is_error === true);
				return;
			}
			if (event.type === "assistant" && event.message?.usage) {
				sink.usage({ billable: event.message.usage.billable, model: event.message.model });
			}
			if (event.type === "assistant" && event.message?.content) {
				for (const block of event.message.content) {
					if (block.type === "text" && block.text) sink.text(block.text, true);
					else if (block.type === "thinking" && block.thinking) sink.record("think", block.thinking);
					else if (block.type === "tool_use") sink.tool(block.name, block.input);
				}
			}
		},
		modelArgs: () => ["--help"],
		parseModels: (out) => {
			const match = /Currently supported:\s*\(([^)]+)\)/.exec(out);
			return match ? match[1].split(",").map((model) => model.trim()).filter(Boolean) : [];
		},
		usesResultEvent: true,
	},
	"claude-json": {
		buildArgs(spec, model) {
			const modes = { accept_edits: "acceptEdits", auto: "auto", dont_ask: "dontAsk", plan: "plan", bypass_permissions: "bypassPermissions" };
			const args = ["-p", "--input-format", "text", "--output-format", "stream-json", "--verbose"];
			if (modes[spec.permissionMode]) args.push("--permission-mode", modes[spec.permissionMode]);
			if (model) args.push("--model", model);
			const effort = { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max", ultracode: "max" }[spec.reasoningEffort];
			if (effort) args.push("--effort", effort);
			args.push(...(spec.extraArgs ?? []));
			return args;
		},
		consume(event, sink) {
			sink.session(event.session_id);
			if (event.type === "system" && event.subtype === "init") {
				if (event.model) sink.usage({ model: event.model });
				return;
			}
			if (event.type === "result") {
				if (typeof event.total_cost_usd === "number" && event.total_cost_usd > 0) sink.cost(event.total_cost_usd);
				const models = event.modelUsage ? Object.keys(event.modelUsage) : [];
				if (models.length > 0) sink.usage({ model: models[0] });
				sink.result(typeof event.result === "string" ? event.result : "", event.is_error === true);
				return;
			}
			if (event.type === "assistant" && event.message?.content) {
				if (event.message.model) sink.usage({ model: event.message.model });
				for (const block of event.message.content) {
					if (block.type === "text" && block.text) sink.text(block.text, true);
					else if (block.type === "thinking" && block.thinking) sink.record("think", block.thinking);
					else if (block.type === "tool_use") sink.tool(block.name, block.input);
				}
			}
		},
		models: claudeModels,
		usesResultEvent: true,
	},
	"codex-json": {
		buildArgs(spec, model) {
			const sandbox = { accept_edits: ["--approve-for-me"], auto: ["-s", "workspace-write"], dont_ask: ["-s", "workspace-write"], default: ["-s", "read-only"], plan: ["-s", "read-only"] };
			const access = spec.permissionMode === "bypass_permissions"
				? ["--dangerously-bypass-approvals-and-sandbox"]
				: sandbox[spec.permissionMode] ?? ["-s", "workspace-write"];
			const args = ["exec", "--json", "--skip-git-repo-check", "--color", "never", ...access];
			if (model) args.push("--model", model);
			const effort = { low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max", ultracode: "ultra" }[spec.reasoningEffort];
			if (effort) args.push("-c", `model_reasoning_effort="${effort}"`);
			if (spec.contextWindow) args.push("-c", `model_context_window=${spec.contextWindow}`);
			args.push(...(spec.extraArgs ?? []));
			return args;
		},
		consume(event, sink) {
			if (event.type === "thread.started") {
				sink.session(event.thread_id);
				return;
			}
			if (event.type === "item.started") {
				const item = event.item ?? {};
				if (item.type === "command_execution") sink.tool("shell", { command: item.command ?? "" });
				else if (item.type === "mcp_tool_call") sink.tool(`${item.server ?? "mcp"}.${item.tool ?? "tool"}`, item.arguments);
				else if (item.type === "web_search") sink.tool("web_search", { pattern: item.query ?? "" });
				return;
			}
			if (event.type === "item.completed") {
				const item = event.item ?? {};
				if (item.type === "agent_message" && item.text) sink.text(item.text, true);
				else if (item.type === "reasoning" && item.text) sink.record("think", item.text);
				else if (item.type === "command_execution") {
					const output = String(item.aggregated_output ?? "").trim();
					sink.record("tool", `exit ${item.exit_code ?? "?"}${output ? `: ${output.slice(0, 500)}` : ""}`);
				} else if (item.type === "file_change") {
					const files = (item.changes ?? []).map((change) => change.path).filter(Boolean).join(", ");
					if (files) sink.record("tool", `file_change ${files}`);
				} else if (item.type === "todo_list") {
					const todos = (item.items ?? []).map((todo) => `${todo.completed ? "✔" : "·"} ${todo.text ?? ""}`).join("\n");
					if (todos) sink.record("todo", todos);
				} else if (item.type === "error" && item.message) {
					sink.record("error", item.message);
				}
				return;
			}
			if (event.type === "turn.completed") {
				const usage = event.usage;
				if (usage) sink.record("usage", `in ${usage.input_tokens ?? 0} / out ${usage.output_tokens ?? 0} tokens`);
				sink.result("", false);
				return;
			}
			if (event.type === "turn.failed") {
				sink.result(event.error?.message ?? event.message ?? "codex turn failed", true);
				return;
			}
			if (event.type === "error" && event.message) sink.record("error", event.message);
		},
		modelArgs: () => ["debug", "models"],
		parseModels: (out) => {
			try {
				const catalog = JSON.parse(out);
				return (catalog.models ?? []).filter((model) => model.visibility === "list").map((model) => model.slug).filter(Boolean);
			} catch {
				return [];
			}
		},
		usesResultEvent: true,
	},
	"opencode-json": {
		buildArgs(spec, model) {
			const args = ["run", "--standalone", "--auto", "--format", "json"];
			if (model) args.push("--model", model);
			args.push(...(spec.extraArgs ?? []));
			return args;
		},
		consume(event, sink) {
			sink.session(event.sessionID);
			const part = event.part ?? {};
			if (event.type === "text" && part.text) sink.text(part.text, true);
			else if (event.type === "reasoning" && part.text) sink.record("think", part.text);
			else if (event.type === "tool_use") sink.tool(part.tool ?? part.name ?? "tool", part.state?.input ?? part.input ?? part.args);
			else if (event.type === "error") sink.record("error", part.message ?? part.error ?? JSON.stringify(part).slice(0, 300));
			else if (event.type === "step_finish" && part.cost) sink.cost(part.cost);
		},
		modelArgs: () => ["models"],
		parseModels: (out) => out.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/\s/.test(line)),
		usesResultEvent: false,
	},
	"pi-json": {
		buildArgs(spec, model) {
			const args = ["-p", "--mode", "json"];
			if (model) args.push("--model", model);
			if (spec.reasoningEffort && spec.reasoningEffort !== "auto") args.push("--thinking", spec.reasoningEffort);
			args.push(...(spec.extraArgs ?? []));
			return args;
		},
		consume(event, sink) {
			sink.session(event.id);
			if (event.type === "message_end" && event.message?.role === "assistant") {
				const message = event.message;
				for (const block of message.content ?? []) {
					if (block.type === "text" && block.text) sink.text(block.text, true);
					else if (block.type === "thinking" && block.thinking) sink.record("think", block.thinking);
					else if (block.type === "toolCall") sink.tool(block.name, block.arguments);
				}
				if (typeof message.usage?.cost?.total === "number" && message.usage.cost.total > 0) sink.cost(message.usage.cost.total);
			} else if (event.type === "tool_execution_start") {
				sink.tool(event.toolName, event.args);
			} else if (event.type === "agent_settled") {
				sink.result("", event.aborted === true);
			}
		},
		modelArgs: () => ["--list-models"],
		parseModels: (out) => out.split(/\r?\n/).slice(1).map((line) => line.trim().split(/\s+/)).filter((cells) => cells.length >= 2).map((cells) => `${cells[0]}/${cells[1]}`),
		usesResultEvent: false,
	},
};

/** 解析某个驱动的启动命令(pi/codebuddy 通过 node 启动;.cmd 通过 cmd.exe)。 */
function spawnCommand(driverName, spec) {
	if (spec.binary && /\.(cmd|bat)$/i.test(spec.binary)) {
		return { command: process.env.ComSpec || "cmd.exe", prefix: ["/c", spec.binary] };
	}
	if (driverName === "pi-json" && spec.binary && spec.binary.endsWith(".js")) {
		if (/[\\/]pi-launcher\.js$/i.test(spec.binary)) return { command: process.execPath, prefix: [spec.binary] };
		return {
			command: process.execPath,
			prefix: [spec.binary],
			env: { PI_MANAGED_INSTALL_ROOT: piInstallRoot() },
		};
	}
	if (driverName === "pi-json" && spec.binary) {
		const launcher = spec.binary.replace(/([\\/])pi$/, "$1pi-launcher.js");
		if (launcher !== spec.binary) return { command: process.execPath, prefix: [launcher] };
	}
	if (driverName === "codebuddy-json" && spec.binary && !/\.exe$/i.test(spec.binary)) {
		return { command: process.execPath, prefix: [spec.binary] };
	}
	return { command: spec.binary, prefix: [] };
}

/** 按 Windows 命令行规则给单个参数加引号。 */
function quoteWindowsArg(arg) {
	if (!arg) return '""';
	if (!/[\s"]/u.test(arg)) return arg;
	return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`;
}

/** 把请求提示词中的文本块拼接成单条 stdin 内容。 */
function promptText(blocks) {
	return blocks
		.map((block) => (block && block.type === "text" ? block.text : ""))
		.filter(Boolean)
		.join("\n");
}

//#region 活动账本(聊天工具行的实时进度)
const MAX_RUNS = 24;
const MAX_EVENTS = 200;
const MAX_EVENT_TEXT = 1500;

/**
* 有界的近期子运行内存账本,记录解析后的 CLI 事件。
* 浏览器工具视图按运行 id 轮询(该 uuid 由 `start()` 生成,
* 委派工具会在 `started subagent <id>` 中回显),`sub_agent_status`
* 工具则把它提供给父 agent,让委派出去的子代理读起来像
* 本地子任务:实时状态、可展开的转录和可查询的进度日志。
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
			snapshot() {
				return { status: entry.status, sessionId: entry.sessionId, credits: entry.credits, costUsd: entry.costUsd, startedAt: entry.startedAt };
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
	/** 接管一条持久化运行(同 id 会替换内存中的副本)。 */
	adopt(meta) {
		const entry = { events: [], sessionId: null, endedAt: null, ...meta };
		const at = this.runs.findIndex((run) => run.id === entry.id);
		if (at >= 0) this.runs.splice(at, 1);
		this.runs.push(entry);
		this.runs.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
		if (this.runs.length > MAX_RUNS) this.runs.length = MAX_RUNS;
		return entry;
	}
}
const activityLedger = new ActivityLedger();
//#endregion

//#region 持久化(崩溃后可恢复的运行)
const RUNS_DIR = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "storages", "dsh-subagent", "runs");
const INDEX_PATH = join(RUNS_DIR, "index.json");
const HIDDEN_RUNNER = fileURLToPath(new URL("./hidden-runner.cjs", import.meta.url));

function runPromptPath(id) {
	return join(RUNS_DIR, `${id}.prompt.txt`);
}
function runConfigPath(id) {
	return join(RUNS_DIR, `${id}.hide.json`);
}
function runRunnerErrPath(id) {
	return join(RUNS_DIR, `${id}.runner.err.log`);
}
function cleanupRunFiles(id) {
	try { rmSync(runPromptPath(id), { force: true }); } catch {}
	try { rmSync(runConfigPath(id), { force: true }); } catch {}
}

function ensureRunsDir() {
	try {
		mkdirSync(RUNS_DIR, { recursive: true });
	} catch {}
}
function readRunIndex() {
	try {
		const data = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
		return Array.isArray(data) ? data : [];
	} catch {
		return [];
	}
}
function writeRunIndex(runs) {
	try {
		ensureRunsDir();
		const tmp = `${INDEX_PATH}.tmp`;
		writeFileSync(tmp, JSON.stringify(runs.slice(0, MAX_RUNS), null, 1));
		renameSync(tmp, INDEX_PATH);
	} catch {}
}
function upsertRunIndex(meta) {
	const runs = readRunIndex();
	const at = runs.findIndex((run) => run.id === meta.id);
	if (at >= 0) runs[at] = { ...runs[at], ...meta };
	else runs.unshift(meta);
	writeRunIndex(runs);
}
function runLogPath(id) {
	return join(RUNS_DIR, `${id}.jsonl`);
}
function runErrPath(id) {
	return join(RUNS_DIR, `${id}.err.log`);
}
/** 读取文件自 `offset` 起新增的字节;返回文本和新偏移量。 */
function readAppended(path, offset) {
	let fd;
	try {
		fd = openSync(path, "r");
	} catch {
		return { text: "", offset };
	}
	try {
		const size = fstatSync(fd).size;
		if (size <= offset) return { text: "", offset };
		const buffer = Buffer.alloc(size - offset);
		readSync(fd, buffer, 0, buffer.length, offset);
		return { text: buffer.toString("utf8"), offset: size };
	} catch {
		return { text: "", offset };
	} finally {
		closeSync(fd);
	}
}
/** 文件末尾若干字节,用于诊断。 */
function readTail(path, max = 4096) {
	try {
		const text = readFileSync(path, "utf8");
		return text.slice(-max);
	} catch {
		return "";
	}
}
function pidAlive(pid) {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/** 把一条运行的持久化日志折叠进账本条目;返回新的字节偏移量。 */
function foldRunLog(meta, entry, offset, final = false) {
	const driver = DRIVERS[meta.driver];
	if (!driver) return offset;
	const { text, offset: next } = readAppended(meta.logPath ?? runLogPath(meta.id), offset);
	if (!text) return next;
	const lastNewline = text.lastIndexOf("\n");
	if (lastNewline < 0 && !final) return offset;
	const complete = lastNewline >= 0 ? text.slice(0, final ? text.length : lastNewline) : text;
	const consumed = final ? next : offset + Buffer.byteLength(text.slice(0, lastNewline + 1), "utf8");
	const sink = {
		record: (kind, value) => {
			entry.events.push({ t: Date.now(), kind, text: String(value ?? "").slice(0, MAX_EVENT_TEXT) });
			if (entry.events.length > MAX_EVENTS) entry.events.shift();
		},
		text: (value) => sink.record("text", value),
		tool: (name, input) => {
			const detail = typeof input?.command === "string" ? input.command : input?.file_path ?? input?.path ?? input?.pattern ?? "";
			sink.record("tool", `${name ?? "tool"} ${detail}`.trim());
		},
		session: (sessionId) => {
			if (sessionId && entry.sessionId == null) entry.sessionId = sessionId;
		},
		usage: (usage) => {
			if (typeof usage?.billable === "boolean") entry.billable = usage.billable;
			if (typeof usage?.model === "string") entry.model = usage.model;
		},
		billable: () => entry.billable,
		modelName: () => entry.model,
		credits: (credits) => {
			entry.credits = credits;
		},
		cost: (usd) => {
			entry.costUsd = usd;
		},
		result: (value, isError) => {
			entry.status = isError ? "error" : "completed";
			entry.endedAt = Date.now();
			if (value) sink.record("result", value);
		},
	};
	let buffer = "";
	for (const line of complete.split("\n")) {
		buffer = line.trim();
		if (!buffer) continue;
		try {
			driver.consume(JSON.parse(buffer), sink);
		} catch {}
	}
	return consumed;
}

/** 为主机停机或重启期间完成的运行生成提示文本。 */
function lateNoticeText(meta, entry) {
	const closing = [...entry.events].reverse().find((event) => event.kind === "result")?.text ?? "";
	const body = closing ? `
结果:
${closing.slice(0, 1500)}` : "";
	return `后台子代理 ${meta.provider} 已结束(dsh 重启前发起,CLI 未中断,状态:${entry.status})。运行 id: ${meta.id}。${body}
调用 sub_agent_status 可查看完整过程。`;
}

/**
* 重新接管上一个宿主进程持久化的运行:重建转录,
* 继续跟踪仍在运行的运行(其 CLI 在崩溃中存活),并在父 agent
* 恢复在线后补发完成通知。
*/
function resumePersistedRuns(ctx) {
	const getAgent = (id) => ctx.get("agents")?.get?.(id);
	const index = readRunIndex();
	for (const meta of index) {
		if (!meta?.id) continue;
		const entry = activityLedger.adopt(meta);
		let offset = foldRunLog(meta, entry, 0);
		if (entry.status === "running" && !pidAlive(meta.pid)) {
			// CLI 可能在宿主停机期间已经完成:先折叠日志尾部,
			// 只有仍未收敛的运行才判定为失败。
			offset = foldRunLog(meta, entry, offset, true);
			if (entry.status === "running") {
				entry.status = "error";
				entry.endedAt = Date.now();
			}
			upsertRunIndex({ id: meta.id, status: entry.status, endedAt: entry.endedAt ?? Date.now(), pid: null });
		}
		if (entry.status !== "running") {
			cleanupRunFiles(meta.id);
			upsertRunIndex({ id: meta.id, status: entry.status, endedAt: entry.endedAt ?? Date.now(), sessionId: entry.sessionId, credits: entry.credits, costUsd: entry.costUsd, pid: null });
			if (!meta.notified) {
				const agent = getAgent(meta.parentId);
				if (agent && typeof agent.followup === "function") {
					try {
						agent.followup(createUserMessage({
							content: [{ type: "text", text: lateNoticeText(meta, entry) }],
							source: { kind: "subagent-settled", form: "notice", summary: boundContextSummary(`重启前发起的子代理已结束`), senderSessionId: meta.id },
						}));
						upsertRunIndex({ id: meta.id, notified: true });
					} catch {}
				}
			}
			continue;
		}
		const releaseSlot = providerGate.reserve(meta.provider ?? "unknown");
		ctx.effect(() => {
			let deadTicks = 0;
			const timer = setInterval(() => {
				offset = foldRunLog(meta, entry, offset);
				if (entry.status === "running" && !pidAlive(meta.pid)) {
					deadTicks += 1;
					if (deadTicks >= 20) {
						offset = foldRunLog(meta, entry, offset, true);
						if (entry.status === "running") {
							entry.status = "error";
							entry.endedAt = Date.now();
						}
					}
				} else if (entry.status === "running") {
					deadTicks = 0;
				}
				if (entry.status === "running") return;
				clearInterval(timer);
				releaseSlot();
				cleanupRunFiles(meta.id);
				upsertRunIndex({ id: meta.id, status: entry.status, endedAt: entry.endedAt, sessionId: entry.sessionId, credits: entry.credits, costUsd: entry.costUsd, pid: null });
				const agent = getAgent(meta.parentId);
				if (agent && typeof agent.followup === "function") {
					try {
						agent.followup(createUserMessage({
							content: [{ type: "text", text: lateNoticeText(meta, entry) }],
							source: { kind: "subagent-settled", form: "notice", summary: boundContextSummary(`重启前发起的子代理已结束`), senderSessionId: meta.id },
						}));
						upsertRunIndex({ id: meta.id, notified: true });
					} catch {}
				}
			}, 500);
			return () => {
				clearInterval(timer);
				releaseSlot();
			};
		});
	}
}
//#endregion

/**
* 拥有一个已启动的 CLI 子进程及其生命周期:按行缓冲解析 stdout、
* 取消/超时清理,以及结果收敛。与提供方分离,
* 保证多次启动彼此独立。
*/
class QoderJsonRun {
	#child;
	#signal;
	#timeoutMs;
	#stdoutBuf = "";
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
	#parentAgent;
	#stallWarnSeconds;
	#lastEventAt;
	#stallWarned = false;
	#stallTimer;
	#warnAfterFirstEvent;
	#gotFirstEvent = false;
	#firstEventResolve;
	#firstEventPromise;
	#driver;
	#costUsd;
	#logPath;
	#errPath;
	#logOffset = 0;
	#tailTimer;
	#promptPath;
	#configPath;
	#runnerErrPath;
	#meta;

	constructor(opts) {
		this.#id = opts.id;
		this.#activity = opts.activity;
		this.#driver = opts.driver;
		this.#parentAgent = opts.parentAgent;
		this.#stallWarnSeconds = opts.stallWarnSeconds ?? 0;
		this.#warnAfterFirstEvent = opts.warnAfterFirstEvent === true;
		this.#firstEventPromise = new Promise((resolve) => {
			this.#firstEventResolve = resolve;
		});
		this.#lastEventAt = Date.now();
		this.#signal = opts.signal;
		this.#timeoutMs = opts.timeoutMs;
		// 输出持久化:子进程直接写文件并以 detached 方式运行,
		// 因此 dsh 崩溃既不会中断其 stdout,也不会丢失转录;宿主
		// 跟踪日志,并在重启后继续跟踪。
		ensureRunsDir();
		this.#logPath = runLogPath(this.#id);
		this.#errPath = runErrPath(this.#id);
		const useHiddenRunner = platform === "win32" && existsSync(HIDDEN_RUNNER);
		if (useHiddenRunner) {
			// Windows 下经隐藏控制台包装启动:detached 保证崩溃后存活,
			// 隐藏控制台避免 CLI 的 shell 子进程闪出黑框。
			this.#promptPath = runPromptPath(this.#id);
			this.#configPath = runConfigPath(this.#id);
			this.#runnerErrPath = runRunnerErrPath(this.#id);
			writeFileSync(this.#promptPath, opts.prompt);
			writeFileSync(this.#configPath, JSON.stringify({
				File: opts.command,
				Arguments: opts.args.map(quoteWindowsArg).join(" "),
				Stdin: this.#promptPath,
				Stdout: this.#logPath,
				Stderr: this.#errPath,
				Env: opts.env ?? {},
			}));
			this.#child = spawn(process.execPath, [HIDDEN_RUNNER, this.#configPath, this.#runnerErrPath], {
				cwd: opts.cwd,
				stdio: "ignore",
				windowsHide: true,
				detached: true,
			});
		} else {
			const outFd = openSync(this.#logPath, "a");
			const errFd = openSync(this.#errPath, "a");
			try {
				this.#child = spawn(opts.command, opts.args, {
					cwd: opts.cwd,
					stdio: ["pipe", outFd, errFd],
					windowsHide: true,
					detached: true,
					...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
				});
			} finally {
				closeSync(outFd);
				closeSync(errFd);
			}
			this.#child.stdin.on("error", () => {});
			this.#child.stdin.write(opts.prompt);
			this.#child.stdin.end();
		}
		this.#child.unref();
		this.#meta = {
			id: this.#id,
			provider: opts.provider ?? "",
			driver: opts.driverName ?? "",
			label: opts.label ?? "",
			prompt: opts.promptSummary ?? "",
			parentId: opts.parentId ?? "",
			pid: this.#child.pid ?? null,
			startedAt: Date.now(),
			status: "running",
			logPath: this.#logPath,
		};
		upsertRunIndex(this.#meta);
		this.#tailTimer = setInterval(() => this.#drainLog(), 250);
		this.#child.on("error", (error) => {
			this.#spawnError = error;
			this.#activity?.finish("error", `spawn failed: ${error?.message ?? error}`);
		});
		this.#child.on("close", (code, signal) => {
			this.#exitInfo = { code, signal };
			this.#drainLog(true);
			clearInterval(this.#stallTimer);
			if (code !== 0 && !this.#resultEvent) this.#activity?.finish("error", `CLI exited with code ${code}`);
			this.#persistFinish();
		});
		if (this.#stallWarnSeconds > 0) {
			this.#stallTimer = setInterval(() => this.#checkStall(), Math.min(15000, Math.max(2000, this.#stallWarnSeconds * 500)));
		}
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

	/**
	* 停止本次尝试并等待进程退出。幂等;供
	* 回退链清理从未发布句柄的尝试。
	*/
	async dispose() {
		this.#cancelled = true;
		if (this.#timeoutTimer) clearTimeout(this.#timeoutTimer);
		clearInterval(this.#stallTimer);
		clearInterval(this.#tailTimer);
		this.#signal.removeEventListener("abort", this.#onAbort);
		this.#killTree();
		await this.#waitForExit();
	}

	/**
	* 在解析到第一个 CLI 事件时完成,让模型回退链
	* 无需读取转录就能区分排队/卡住的模型与已接受的模型。
	*/
	get firstEvent() {
		return this.#firstEventPromise;
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

	/** 读取新追加的日志字节,把完整的 JSON 行折叠进状态。 */
	#drainLog(final = false) {
		const { text, offset } = readAppended(this.#logPath, this.#logOffset);
		if (!text) return;
		this.#logOffset = offset;
		this.#stdoutBuf += text;
		let newline;
		while ((newline = this.#stdoutBuf.indexOf("\n")) >= 0) {
			const line = this.#stdoutBuf.slice(0, newline).trim();
			this.#stdoutBuf = this.#stdoutBuf.slice(newline + 1);
			if (line) this.#consumeEvent(line);
		}
		if (final && this.#stdoutBuf.trim()) {
			const line = this.#stdoutBuf.trim();
			this.#stdoutBuf = "";
			this.#consumeEvent(line);
		}
	}

	/** 持久化本次运行的终态。 */
	#persistFinish() {
		clearInterval(this.#tailTimer);
		cleanupRunFiles(this.#id);
		const state = this.#activity?.snapshot?.() ?? {};
		let status = state.status ?? "completed";
		// 进程已退出但活动账本尚未收敛时在这里补终态,
		// 避免无 result 事件的驱动把索引永久留在 running。
		if (status === "running") {
			if (this.#driver.usesResultEvent) status = "error";
			else if (!this.#timedOut && this.#exitInfo?.code === 0) {
				this.#activity?.finish("completed", this.#assistantText.at(-1) || undefined);
				status = "completed";
			} else {
				status = "error";
			}
		}
		upsertRunIndex({
			id: this.#id,
			status,
			endedAt: Date.now(),
			sessionId: state.sessionId ?? null,
			credits: state.credits ?? null,
			costUsd: this.#costUsd ?? null,
			pid: null,
		});
	}

	#consumeEvent(line) {
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		this.#lastEventAt = Date.now();
		this.#stallWarned = false;
		if (!this.#gotFirstEvent) {
			this.#gotFirstEvent = true;
			this.#firstEventResolve?.();
		}
		const sink = {
			record: (kind, text) => this.#activity?.record(kind, text),
			text: (text, assistant) => {
				if (assistant) this.#assistantText.push(text);
				this.#activity?.record("text", text);
			},
			tool: (name, input) => {
				const detail = typeof input?.command === "string" ? input.command : input?.file_path ?? input?.path ?? input?.pattern ?? "";
				this.#activity?.record("tool", `${name ?? "tool"} ${detail}`.trim());
			},
			session: (sessionId) => this.#activity?.meta("sessionId", sessionId),
			usage: (usage) => {
				if (typeof usage?.billable === "boolean") this.#credits.billable = usage.billable;
				if (typeof usage?.model === "string") this.#credits.model = usage.model;
			},
			billable: () => this.#credits.billable,
			modelName: () => this.#credits.model,
			credits: (credits) => this.#activity?.meta("credits", credits),
			cost: (usd) => {
				this.#costUsd = usd;
				this.#activity?.meta("costUsd", usd);
			},
			result: (text, isError) => {
				this.#resultEvent = { text, isError };
				this.#settledText = text;
				this.#activity?.finish(isError ? "error" : "completed", text || (!isError ? this.#assistantText.at(-1) : undefined) || undefined);
			},
		};
		this.#driver.consume(event, sink);
	}

	/**
	* CLI 长时间无输出时,每个静默周期只唤醒父 agent 一次
	* (进程挂起、模型排队、网络中断)。父 agent 随后可以
	* 查询 sub_agent_status、继续等待或中断,而不是盲目挂着。
	*/
	#checkStall() {
		if (this.#stallWarned || this.#exitInfo || this.#cancelled) return;
		if (this.#warnAfterFirstEvent && !this.#gotFirstEvent) return;
		const idleSeconds = Math.round((Date.now() - this.#lastEventAt) / 1000);
		if (idleSeconds < this.#stallWarnSeconds) return;
		this.#stallWarned = true;
		this.#activity?.record("error", `no output for ${idleSeconds}s — warned the parent`);
		const agent = this.#parentAgent;
		if (!agent || typeof agent.followup !== "function") return;
		try {
			agent.followup(createUserMessage({
				content: [{
					type: "text",
					text: `⚠️ 子代理已 ${idleSeconds} 秒没有任何输出(可能卡住、网络不通或模型排队)。运行 id: ${this.#id}。你可以调用 sub_agent_status 查看详情并决定继续等待或中断。`,
				}],
				source: {
					kind: "subagent-settled",
					form: "notice",
					summary: boundContextSummary(`子代理无输出 ${idleSeconds} 秒`),
					senderSessionId: this.#id,
				},
			}));
		} catch {}
	}

	/** 等待子进程收敛,再把转录映射为结果。 */
	async #attempt() {
		try {
			await this.#waitForExit();
			if (this.#spawnError) throw this.#spawnError;
			if (this.#resultEvent) {
				if (this.#resultEvent.isError) {
					return {
						output: this.#collectOutput(),
						diagnostic: this.#resultDiagnostic(),
						stopReason: "error",
					};
				}
				return { output: this.#collectOutput(), stopReason: "completed" };
			}
			// 没有终止 result 事件的驱动(opencode/pi)以进程退出作为收敛信号。
			const exitCode = this.#exitInfo?.code;
			if (!this.#driver.usesResultEvent && !this.#timedOut && exitCode === 0) {
				this.#activity?.finish("completed", this.#assistantText.at(-1) || undefined);
				return { output: this.#collectOutput(), stopReason: "completed" };
			}
			if (this.#timedOut) throw new Error(`timed out after ${this.#timeoutMs / 1000}s`);
			throw new Error(
				`CLI exited (code=${exitCode} signal=${this.#exitInfo?.signal}) without a result event`,
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
		const runnerErr = this.#runnerErrPath ? readTail(this.#runnerErrPath, 2048) : "";
		const pieces = [readTail(this.#errPath), runnerErr, this.#exitInfo && `exit code=${this.#exitInfo.code} signal=${this.#exitInfo.signal}`].filter(Boolean);
		return pieces.join("\n") || undefined;
	}

	#resultDiagnostic() {
		const subtype = this.#resultEvent?.subtype ?? "error";
		const errors = Array.isArray(this.#resultEvent?.errors) ? this.#resultEvent.errors.join("; ") : "";
		const result = this.#settledText;
		return [subtype, result, errors, readTail(this.#errPath)].filter(Boolean).join(" — ");
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

//#region 探测(设置页 RPC)
/**
* Qoder CLI 模型选择器显示的额度倍率快照(2026-10)。
* CLI 在运行时从后端拉取,本地不保留副本,因此
* 插件内置了观测到的倍率;未知模型不显示后缀。
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

/** CodeBuddy 模型选择器中的额度倍率(2026-10 快照)。 */
const CODEBUDDY_RATES = {
	"hy4-preview": "0.29x",
	hy3: "0.00x",
	"hy3-x": "0.05x",
	"step-5-preview": "0.00x",
	"space-bunny": "0.08x",
	"deepseek-v4.1-flash": "0.11x",
	"glm-5.3": "0.69x",
	"glm-5.3-flash": "0.08x",
	"glm-5.2": "0.79x",
	"glm-5.1": "0.79x",
	"glm-5v-turbo": "0.71x",
	"minimax-m3.1-flash": "0.08x",
	"minimax-m3": "0.25x",
	"minimax-m2.7": "0.19x",
	"kimi-k3-1": "1.62x",
	"kimi-k2.8-preview": "0.77x",
	"kimi-k2.7": "0.57x",
	"kimi-k2.6": "0.52x",
	"deepseek-v4-pro": "0.51x",
	"mimo-v2.6-pro": "0.13x",
};

/** 运行一次短命的 CLI 查询,并以去除首尾空白的 stdout 完成。 */
function runCli(binary, args, timeoutMs = 30000, env) {
	return new Promise((resolve, reject) => {
		const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, ...(env ? { env } : {}) });
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

/** 某个后端的存在性、版本和模型目录,带 TTL 缓存。 */
async function probeBackend(spec) {
	const hit = probeCache.get(spec.name);
	if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.value;
	const rates = spec.driver === "qoder-json" ? CREDIT_RATES : spec.driver === "codebuddy-json" ? CODEBUDDY_RATES : undefined;
	const value = { name: spec.name, driver: spec.driver, binary: spec.binary ?? null, exists: false, version: null, models: [], rates, error: null };
	if (!spec.binary || !existsSync(spec.binary)) {
		value.error = "CLI binary not found. Install the CLI or set a binary path.";
	} else {
		try {
			const driver = DRIVERS[spec.driver] ?? DRIVERS["qoder-json"];
			const spawnSpec = spawnCommand(spec.driver, spec);
			const run = (args) => runCli(spawnSpec.command, [...spawnSpec.prefix, ...args], 30000, spawnSpec.env ? { ...process.env, ...spawnSpec.env } : undefined);
			const rawVersion = (await run(["--version"])).trim().split(/\r?\n/)[0];
			value.version = (/(\d+\.\d+\.\d+[\w.-]*)/.exec(rawVersion) ?? [rawVersion])[0];
			value.models = typeof driver.models === "function" ? driver.models() : driver.parseModels(await run(driver.modelArgs()));
			value.exists = true;
		} catch (error) {
			value.error = String(error?.message ?? error).slice(0, 512);
		}
	}
	probeCache.set(spec.name, { at: Date.now(), value });
	return value;
}

/**
* 通过 Codex 订阅插件所用的同一条已认证 /api 桥提供设置页接口:
* 每个端点一个 POST 路由,使用 `{type,rpcId,result}`
* 信封。无凭据宿主(headless)中不存在,设置页也无意义。
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
			const name = String(payload?.name ?? "");
			const spec = registry.get(name) ?? builtinSpec(name);
			if (!spec) throw new Error("unknown provider");
			return probeBackend(spec);
		}),
		route("refresh", (payload) => {
			const name = String(payload?.name ?? "");
			probeCache.delete(name);
			const spec = registry.get(name) ?? builtinSpec(name);
			if (!spec) throw new Error("unknown provider");
			return probeBackend(spec);
		}),
		route("activity", (payload) => ({ run: activityLedger.view(String(payload?.runId ?? "")), now: Date.now() })),
	];
}
//#endregion

//#region 装配
/** 把可能是 volatile 引用的 `providers` 配置字段展开为普通数组。 */
function readProviders(config) {
	const raw = typeof config?.providers?.get === "function" ? config.providers.get() : config?.providers;
	return Array.isArray(raw) ? raw : [];
}

/** 读取可能是 volatile 引用的标量配置字段。 */
function readScalar(value, fallback) {
	const raw = typeof value?.get === "function" ? value.get() : value;
	return raw ?? fallback;
}

/** 把一条原始后端配置规范化为解析后的 spec(自动探测可执行文件)。 */
function normalizeSpec(entry) {
	const models = Array.isArray(entry.models) && entry.models.length > 0
		? entry.models
		: entry.model
			? [entry.model]
			: [];
	return {
		name: entry.name,
		driver: entry.driver ?? "qoder-json",
		binary: resolveBinary(entry.name, entry.binary),
		permissionMode: entry.permissionMode ?? "bypass_permissions",
		models,
		allowedWaitSeconds: entry.allowedWaitSeconds ?? 300,
		reasoningEffort: entry.reasoningEffort ?? "auto",
		contextWindow: entry.contextWindow ?? undefined,
		timeoutSeconds: entry.timeoutSeconds ?? undefined,
		stallWarnSeconds: entry.stallWarnSeconds ?? 90,
		extraArgs: entry.extraArgs ?? [],
		maxConcurrency: entry.maxConcurrency ?? 2,
	};
}

/** 把一条内置配置解析为 spec,即使它当前尚未启用。 */
function builtinSpec(name) {
	const entry = BUILTIN_PROVIDERS.find((candidate) => candidate.name === name);
	return entry ? normalizeSpec(entry) : undefined;
}

/** 把一条账本运行渲染成紧凑、上下文安全的摘要,供模型读取。 */
function digestRun(run, eventBudget) {
	const credits = run.credits
		? ` | credits: ${run.credits.total > 0 ? run.credits.total.toFixed(4) : run.credits.billable === false ? "free" : "0"}`
		: typeof run.costUsd === "number"
			? ` | cost: $${run.costUsd.toFixed(4)}`
			: "";
	const idleSeconds = run.status === "running" ? Math.round((Date.now() - (run.events.at(-1)?.t ?? run.startedAt)) / 1000) : 0;
	const idle = run.status === "running" ? ` | idle: ${idleSeconds}s${run.stallWarnSeconds > 0 && idleSeconds >= run.stallWarnSeconds ? " (⚠️ possibly stalled)" : ""}` : "";
	const head = `run ${run.id} | ${run.provider} | ${run.status} | ${Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 1000)}s | label: ${run.label || "(none)"}${run.sessionId ? ` | cli session: ${run.sessionId}` : ""}${credits}${idle}`;
	const events = run.events.slice(-eventBudget).map((event) => `  [+${Math.round((event.t - run.startedAt) / 1000)}s] ${event.kind}: ${event.text.slice(0, 200).replace(/\s+/g, " ")}`);
	const omitted = run.events.length - events.length;
	return [head, ...(omitted > 0 ? [`  … (${omitted} earlier events omitted)`] : []), ...events].join("\n");
}

/** 把已配置后端注册为 `ctx.subagents` 上的具名提供方。 */
function apply(ctx, config) {
	// 提供方 spec 实时读取,提供方集合则在
	// volatile 配置更新时重新对齐,因此在设置页增删后端
	// 无需重新注册提供方,也无需重启宿主。
	const liveSpec = (name) => {
		const entry = readProviders(config).find((candidate) => candidate.name === name);
		return entry ? normalizeSpec(entry) : undefined;
	};
	const registry = {
		list: () => readProviders(config).map((entry) => entry.name),
		get: (name) => liveSpec(name),
	};
	const registrations = new Map();

	const buildCommand = (providerName) => ctx.commands.register({
		name: `sub_${providerName}`,
		description: `把这一行任务交给 ${providerName} 子代理(经由工具调用,实时进度/扣费/完成通知齐全)`,
		input: { hint: "任务描述" },
		handler(invocation) {
			const task = invocation.rawInput.trim();
			if (!task) return { kind: "error", text: `用法: /sub_${providerName} <任务描述>` };
			try {
				invocation.agent.followup(createUserMessage({
					content: [{ type: "text", text: `请调用名为 ${providerName} 的委派工具(外部 CLI 子代理工具,不是 LLM provider,不要调用 list_subagent_models;也不要改用 subagent/subagent_fork)把以下任务交给子代理(不要自己执行)。完成后把子代理的结果转述给我。\n\n任务:\n${task}` }],
					source: { kind: "user" },
				}));
				return { kind: "success", text: `已交给会话:即将用 ${providerName} 工具委派,实时进度会显示在工具行里。` };
			} catch (error) {
				return { kind: "error", text: `${providerName} 指令失败: ${String(error?.message ?? error).slice(0, 300)}` };
			}
		},
	});

	const syncBackends = () => {
		const entries = new Map();
		for (const entry of readProviders(config)) {
			if (!DRIVERS[entry.driver ?? "qoder-json"]) {
				ctx.logger?.warn?.(`dsh-subagent: unknown driver "${entry.driver}" for provider "${entry.name}", skipped`);
				continue;
			}
			if (!entries.has(entry.name)) entries.set(entry.name, entry);
		}
		for (const [providerName, record] of registrations) {
			if (entries.has(providerName)) continue;
			record.provider?.();
			record.command?.();
			record.tool?.();
			registrations.delete(providerName);
		}
		for (const [providerName, entry] of entries) {
			let record = registrations.get(providerName);
			if (!record) {
				record = { provider: undefined, command: undefined, tool: undefined };
				registrations.set(providerName, record);
			}
			if (!record.tool) {
				const fiber = ctx.plugin(ToolSubagentPlugin, { provider: providerName, toolName: providerName, maxDepth: "provider-managed" });
				record.tool = () => {
					void fiber.dispose?.();
				};
			}
			if (!record.provider) {
				record.provider = ctx.subagents.registerProvider(new QoderJsonProvider(
					providerName,
					() => liveSpec(providerName),
					(id) => ctx.get("agents")?.get?.(id),
				));
			}
			// 只有本机确实存在对应 CLI 时斜杠指令才有用;
			// 否则跳过,避免指令菜单出现死路。
			const commandBinary = resolveBinary(providerName, entry.binary);
			const commandAvailable = Boolean(commandBinary && existsSync(commandBinary));
			if (commandAvailable && !record.command) record.command = buildCommand(providerName);
			else if (!commandAvailable && record.command) {
				record.command();
				record.command = undefined;
			}
		}
	};
	ctx.effect(() => {
		syncBackends();
		const off = ctx.on("loader/volatile-update", (paths) => {
			if (paths.some((path) => path[0] === "providers")) syncBackends();
		});
		return () => {
			off?.();
			for (const record of registrations.values()) {
				record.provider?.();
				record.command?.();
				record.tool?.();
			}
			registrations.clear();
		};
	});
	ctx.effect(() => {
		const dispose = ctx.tools.register(defineTool({
			name: "sub_agent_status",
			description: "Check progress of background external-CLI subagent delegations at any time. Omit run_id to list recent runs with their latest activity; pass the run id returned by a delegation (`started subagent <id>`) for that run's event transcript (thinking, tool calls, output). Use this instead of blind sleeping when asked how a delegated child is going.",
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
				if (runs.length === 0) return Promise.resolve("no external subagent runs recorded yet");
				return Promise.resolve(runs.map((run) => digestRun(run, 5)).join("\n\n"));
			},
		}));
		return () => dispose?.();
	});
	ctx.effect(() => {
		const dispose = ctx.commands.register({
			name: "sub_agent_status",
			description: "查看已启用外包子代理的运行状态与最近事件",
			input: { hint: "run_id(可省略,默认列出最近运行)" },
			handler(invocation) {
				const runId = invocation.rawInput.trim();
				if (runId) {
					const run = activityLedger.view(runId);
					return {
						kind: "success",
						text: run ? digestRun(run, 40) : `未找到运行 ${runId};最近运行: ${activityLedger.runs.map((candidate) => candidate.id).join(", ") || "(无)"}`,
					};
				}
				const runs = activityLedger.recent(Math.min(24, Math.max(1, readScalar(config.statusListLimit, 16))));
				return { kind: "success", text: runs.length ? runs.map((run) => digestRun(run, 8)).join("\n\n") : "暂无外包子代理运行记录" };
			},
		});
		return () => dispose?.();
	});
	ctx.effect(() => {
		resumePersistedRuns(ctx);
		return () => {};
	});
	ctx.inject(["connection"], (scoped) => {
		scoped.effect(() => {
			const disposers = registerProbeRoutes(scoped.connection, registry);
			return () => disposers.forEach((dispose) => dispose());
		});
	});
	ctx.inject(["systemPrompt"], (scoped) => {
		scoped.effect(() => scoped.systemPrompt.variable("subagent_backends", () => backendGuide(
			readProviders(config),
			readScalar(config.scheduleMode, "priority"),
			(name) => providerGate.active(name),
		)), "dsh-subagent: backend guide");
	});
}
//#endregion

export { Config, apply, inject, name };
