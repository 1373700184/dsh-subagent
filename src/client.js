import React from "react";

/**
* Browser-side settings page for the dsh-subagent plugin: one settings section
* listing every configured Qoder-family backend with live CLI probe (existence,
* version, model catalog) and form controls that write straight back to the
* host plugin config through ctx.configForms.
* @module dsh-subagent/client
*/
const name = "qoder-subagent-client";
const inject = ["slots", "locale", "configForms", "connection"];
const ENTRY_ID = "subagent-cli";
const LOCALE_NS = "settings.qoderSubagent";
const LOCALES = {
	zh: { meta: { title: "自由子代理", description: "把任务委派给本机已登录的外部 CLI 子代理,消耗各自会员额度。" }, nav: "自由子代理" },
	en: { meta: { title: "Free Subagents", description: "Delegate tasks to local external CLI subagents and spend their subscription quotas." }, nav: "Free Subagents" },
};
/** Host-matched controls: only --dsw-alias-* tokens, plugin-prefixed classes. */
const STYLE = `
.qsub-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.qsub-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.qsub-field { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; min-height: 32px; }
.qsub-label { width: 130px; flex: none; color: var(--dsw-alias-label-primary); opacity: .7; font-size: 13px; }
.qsub-control { height: 32px; padding: 0 10px; border-radius: 8px; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 13px; outline: none; transition: border-color .15s, box-shadow .15s; }
.qsub-control:hover { border-color: var(--dsw-alias-border-l3); }
.qsub-control:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
.qsub-control::placeholder { color: var(--dsw-alias-label-primary); opacity: .35; }
.qsub-select { min-width: 220px; padding-right: 6px; }
.qsub-number { width: 140px; }
.qsub-path { width: 380px; max-width: 100%; }
.qsub-btn { height: 30px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font-size: 13px; cursor: pointer; transition: background .15s, border-color .15s; }
.qsub-btn:hover { background: var(--dsw-alias-bg-overlay); border-color: var(--dsw-alias-border-l3); }
.qsub-hint { color: var(--dsw-alias-label-primary); opacity: .55; font-size: 12px; }
.qsub-ok { color: #3f9d5a; }
.qsub-bad { color: #e5533c; }
.qsub-mono { font-family: ui-monospace, Consolas, monospace; }
`;
const REASONING_EFFORTS = ["auto", "none", "low", "medium", "high", "xhigh", "max", "ultracode"];
const PERMISSION_MODES = ["bypass_permissions", "dont_ask", "auto", "accept_edits", "default"];

const h = React.createElement;

function callRpc(connection, endpoint, payload) {
	return connection.rpc.call("/api", `qoder-subagent/${endpoint}`, payload, AbortSignal.timeout(60000)).then((result) => {
		if (!result?.ok) throw new Error(result?.error?.message ?? "probe failed");
		return result.value;
	});
}

/** One backend card: probe facts plus config controls writing to `providers[i]`. */
function ProviderCard({ spec, index, form, connection }) {
	const [probe, setProbe] = React.useState({ status: "idle" });
	const probeKey = `${spec.name}|${spec.binary ?? ""}`;
	React.useEffect(() => {
		let alive = true;
		setProbe({ status: "loading" });
		callRpc(connection, "probe", { name: spec.name })
			.then((value) => alive && setProbe({ status: "ready", value }))
			.catch((error) => alive && setProbe({ status: "error", message: String(error?.message ?? error) }));
		return () => {
			alive = false;
		};
	}, [probeKey, connection]);

	const write = (patch) => {
		const current = form.getSnapshot().value ?? {};
		const providers = (current.providers ?? []).map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
		void form.set("providers", providers);
	};
	const setField = (key) => (event) => {
		const raw = event.target.value;
		if (key === "contextWindow" || key === "timeoutSeconds") write({ [key]: raw === "" ? undefined : Number(raw) });
		else write({ [key]: raw === "" ? undefined : raw });
	};
	const refresh = () => {
		setProbe({ status: "loading" });
		callRpc(connection, "refresh", { name: spec.name })
			.then((value) => setProbe({ status: "ready", value }))
			.catch((error) => setProbe({ status: "error", message: String(error?.message ?? error) }));
	};

	const info = probe.value;
	const field = (name, control, hint) => h("div", { className: "qsub-field" },
		h("span", { className: "qsub-label" }, name),
		control,
		hint ? h("span", { className: "qsub-hint" }, hint) : null,
	);
	return h("section", { key: spec.name, className: "qsub-card" },
		h("div", { className: "qsub-head" },
			h("strong", { style: { fontSize: 15 } }, spec.name),
			probe.status === "loading" && h("span", { className: "qsub-hint" }, "检测中…"),
			probe.status === "error" && h("span", { className: "qsub-bad" }, `检测失败: ${probe.message}`),
			probe.status === "ready" && (info.exists
				? h("span", { className: "qsub-ok" }, `已安装 · v${info.version ?? "?"}`)
				: h("span", { className: "qsub-bad" }, "未找到 CLI")),
			h("button", { type: "button", onClick: refresh, className: "qsub-btn", style: { marginLeft: "auto" } }, "刷新"),
		),
		probe.status === "ready" && h("div", { className: "qsub-hint qsub-mono", style: { marginBottom: 12, wordBreak: "break-all" } }, info.binary ?? "未解析到路径"),
		field("模型", h("select", { className: "qsub-control qsub-select", value: spec.model ?? "", onChange: setField("model") },
			h("option", { value: "" }, "(CLI 默认)"),
			(info?.models ?? (spec.model ? [spec.model] : [])).map((model) => {
				const rate = info?.rates?.[model];
				return h("option", { key: model, value: model }, rate ? `${model}  ·  ${rate} 额度` : model);
			}),
		)),
		field("思考程度", h("select", { className: "qsub-control qsub-select", value: spec.reasoningEffort ?? "auto", onChange: setField("reasoningEffort") },
			REASONING_EFFORTS.map((level) => h("option", { key: level, value: level }, level)),
		)),
		field("上下文大小", h("input", { className: "qsub-control qsub-number", type: "number", min: 1000, step: 1000, placeholder: "默认", value: spec.contextWindow ?? "", onChange: setField("contextWindow") }), "tokens,留空用默认"),
		field("权限模式", h("select", { className: "qsub-control qsub-select", value: spec.permissionMode ?? "bypass_permissions", onChange: setField("permissionMode") },
			PERMISSION_MODES.map((mode) => h("option", { key: mode, value: mode }, mode)),
		)),
		field("超时", h("input", { className: "qsub-control qsub-number", type: "number", min: 1, placeholder: "不限", value: spec.timeoutSeconds ?? "", onChange: setField("timeoutSeconds") }), "秒"),
		field("CLI 路径", h("input", { className: "qsub-control qsub-path", type: "text", placeholder: "自动探测", value: spec.binary ?? "", onChange: setField("binary") })),
	);
}

function QoderSection({ form, connection }) {
	const subscribe = React.useCallback((cb) => form.subscribe(cb), [form]);
	const getSnapshot = React.useCallback(() => form.getSnapshot(), [form]);
	const snapshot = React.useSyncExternalStore(subscribe, getSnapshot);
	if (snapshot.status === "loading") return h("div", { style: { opacity: 0.6 } }, "加载配置…");
	if (snapshot.status === "unavailable") return h("div", null, "dsh-subagent 配置未挂载(检查 profile bundles)。");
	const providers = snapshot.value?.providers ?? [];
	if (providers.length === 0) return h("div", null, "未配置任何后端(配置 providers 数组)。");
	return h("div", { style: { maxWidth: 640 } },
		h("h2", null, "自由子代理"),
		h("p", { className: "qsub-hint", style: { fontSize: 13 } }, "把任务委派给本机已登录的外部 CLI 子代理(当前:qoder / qodercn),消耗各自会员额度。子代理看不到当前对话,委派内容需自带完整上下文。"),
		providers.map((spec, index) => h(ProviderCard, { key: `${spec.name}:${index}`, spec, index, form, connection })),
	);
}

/** Expandable live progress panel for one background Qoder child run. */
function QoderToolView({ block, connection }) {
	const settled = block?.kind === "tool-result";
	const resultText = settled ? (block.content ?? []).find?.((item) => item?.type === "text")?.text ?? "" : "";
	const runId = /started subagent ([0-9a-fA-F-]{36})/.exec(resultText)?.[1];
	const [run, setRun] = React.useState(null);
	const [open, setOpen] = React.useState(false);
	const [, setTick] = React.useState(0);
	const bodyRef = React.useRef(null);

	const running = Boolean(runId) && (!run || run.status === "running");
	React.useEffect(() => {
		if (!runId || !connection) return;
		let alive = true;
		const poll = async () => {
			try {
				const next = await callRpc(connection, "activity", { runId });
				if (alive) setRun(next.run ?? null);
			} catch {}
		};
		poll();
		const timer = setInterval(poll, 2000);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	}, [runId, connection]);
	React.useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => setTick((x) => x + 1), 1000);
		return () => clearInterval(timer);
	}, [running]);
	React.useEffect(() => {
		if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
	}, [open, run?.events?.length]);

	if (!settled) return h("div", { style: { opacity: 0.6, fontSize: 13 } }, "正在启动 Qoder 子代理…");
	if (!runId) return h("div", { style: { fontSize: 13 } }, resultText || "Qoder 子代理");

	const status = run?.status ?? "running";
	const seconds = run ? Math.max(0, Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 1000)) : 0;
	const badge = { running: ["运行中", "#b8860b"], completed: ["已完成", "#3f9d5a"], error: ["出错", "#e5533c"], aborted: ["已取消", "#8a8a8a"] }[status] ?? ["…", "#8a8a8a"];
	const allEvents = run?.events ?? [];
	const shown = open ? allEvents : allEvents.slice(-6);
	const kindIcon = { tool: "⚙", text: "▸", think: "◎", result: "✔", error: "✖" };
	const creditsText = run?.credits
		? run.credits.total > 0
			? `${run.credits.total.toFixed(4)} 额度`
			: run.credits.billable === false
				? "免费"
				: "0 额度"
		: null;
	return h("div", { style: { fontSize: 13, lineHeight: 1.5 } },
		h("div", {
			style: { display: "flex", gap: 8, alignItems: "baseline", cursor: "pointer", userSelect: "none" },
			onClick: () => setOpen((x) => !x),
			title: open ? "收起详情" : "展开全部过程",
		},
			h("span", { style: { display: "inline-block", transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform .15s" } }, "▸"),
			h("span", { style: { fontWeight: 600 } }, run?.provider ?? "qoder"),
			h("span", { style: { color: badge[1] } }, badge[0]),
			h("span", { style: { opacity: 0.55 } }, `${seconds}s`),
			creditsText ? h("span", { style: { opacity: 0.55 } }, `· ${creditsText}`) : null,
			run?.label ? h("span", { style: { opacity: 0.55 } }, `· ${run.label}`) : null,
			h("span", { style: { opacity: 0.45, marginLeft: "auto" } }, `${allEvents.length} 步`),
		),
		shown.length > 0 && h("div", {
			ref: bodyRef,
			style: {
				marginTop: 4, paddingLeft: 10, borderLeft: "2px solid rgba(128,128,128,0.25)",
				maxHeight: open ? 420 : "none", overflowY: open ? "auto" : "hidden",
			},
		},
			shown.map((event, index) => h("div", {
				key: index,
				style: {
					whiteSpace: open ? "pre-wrap" : "nowrap", overflow: open ? "visible" : "hidden",
					textOverflow: open ? undefined : "ellipsis", maxWidth: 620,
					fontFamily: event.kind === "tool" ? "ui-monospace, Consolas, monospace" : undefined,
					opacity: event.kind === "think" ? 0.7 : 0.9,
				},
			}, `${kindIcon[event.kind] ?? "·"} ${event.text}`)),
			open && run?.sessionId && h("div", { style: { marginTop: 8, opacity: 0.55, fontSize: 12 } },
				"完整记录已存 CLI 会话: ",
				h("code", null, `${run.provider === "qodercn" ? "qoderclicn" : "qodercli"} --resume ${run.sessionId}`),
			),
		),
	);
}

function apply(ctx) {
	const form = ctx.configForms.get(ENTRY_ID);
	ctx.effect(() => ctx.locale.register(LOCALE_NS, LOCALES), "qoder-subagent: copy");
	ctx.effect(() => {
		const tag = document.createElement("style");
		tag.dataset.plugin = "dsh-subagent";
		tag.textContent = STYLE;
		document.head.append(tag);
		return () => tag.remove();
	}, "qoder-subagent: styles");
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "qoder-subagent",
		order: 16,
		locale: LOCALE_NS,
		label: () => "自由子代理",
		inject: () => ({ form, connection: ctx.get("connection") }),
	}, QoderSection));
	for (const toolName of ["qoder", "qodercn"]) {
		ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
			name: "tool.call.toolview",
			key: toolName,
			locale: LOCALE_NS,
			inject: () => ({ connection: ctx.get("connection") }),
		}, QoderToolView));
	}
}

export { apply, inject, name };
