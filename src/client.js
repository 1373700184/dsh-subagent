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
	zh: { meta: { title: "Qoder 子代理", description: "把任务委派给本机 Qoder 系 CLI,消耗会员额度。" }, nav: "Qoder 子代理" },
	en: { meta: { title: "Qoder Subagents", description: "Delegate tasks to local Qoder CLIs and spend their subscription quotas." }, nav: "Qoder Subagents" },
};
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
	const label = { width: 130, display: "inline-block", opacity: 0.75 };
	const row = { marginBottom: 10 };
	const select = { minWidth: 220 };
	return h("section", { key: spec.name, style: { border: "1px solid rgba(128,128,128,0.3)", borderRadius: 10, padding: 16, marginBottom: 16 } },
		h("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } },
			h("strong", { style: { fontSize: 16 } }, spec.name),
			probe.status === "loading" && h("span", { style: { opacity: 0.6 } }, "检测中…"),
			probe.status === "error" && h("span", { style: { color: "#e5533c" } }, `检测失败: ${probe.message}`),
			probe.status === "ready" && (info.exists
				? h("span", { style: { color: "#3f9d5a" } }, `已安装 · v${info.version ?? "?"}`)
				: h("span", { style: { color: "#e5533c" } }, "未找到 CLI")),
			h("button", { type: "button", onClick: refresh, style: { marginLeft: "auto" } }, "刷新"),
		),
		probe.status === "ready" && h("div", { style: { ...row, opacity: 0.6, fontSize: 12, wordBreak: "break-all" } }, info.binary ?? "未解析到路径"),
		probe.status === "error" && info === undefined && null,
		h("div", { style: row },
			h("label", null,
				h("span", { style: label }, "模型"),
				h("select", { style: select, value: spec.model ?? "", onChange: setField("model") },
					h("option", { value: "" }, "(CLI 默认)"),
					(info?.models ?? (spec.model ? [spec.model] : [])).map((model) => h("option", { key: model, value: model }, model)),
				),
			),
		),
		h("div", { style: row },
			h("label", null,
				h("span", { style: label }, "思考程度"),
				h("select", { style: select, value: spec.reasoningEffort ?? "auto", onChange: setField("reasoningEffort") },
					REASONING_EFFORTS.map((level) => h("option", { key: level, value: level }, level)),
				),
			),
		),
		h("div", { style: row },
			h("label", null,
				h("span", { style: label }, "上下文大小"),
				h("input", { style: { width: 140 }, type: "number", min: 1000, step: 1000, placeholder: "默认", value: spec.contextWindow ?? "", onChange: setField("contextWindow") }),
				h("span", { style: { marginLeft: 8, opacity: 0.6, fontSize: 12 } }, "tokens,留空用默认"),
			),
		),
		h("div", { style: row },
			h("label", null,
				h("span", { style: label }, "权限模式"),
				h("select", { style: select, value: spec.permissionMode ?? "bypass_permissions", onChange: setField("permissionMode") },
					PERMISSION_MODES.map((mode) => h("option", { key: mode, value: mode }, mode)),
				),
			),
		),
		h("div", { style: row },
			h("label", null,
				h("span", { style: label }, "超时"),
				h("input", { style: { width: 140 }, type: "number", min: 1, placeholder: "不限", value: spec.timeoutSeconds ?? "", onChange: setField("timeoutSeconds") }),
				h("span", { style: { marginLeft: 8, opacity: 0.6, fontSize: 12 } }, "秒"),
			),
		),
		h("div", { style: row },
			h("label", null,
				h("span", { style: label }, "CLI 路径"),
				h("input", { style: { width: 360 }, type: "text", placeholder: "自动探测", value: spec.binary ?? "", onChange: setField("binary") }),
			),
		),
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
		h("h2", null, "Qoder 子代理"),
		h("p", { style: { opacity: 0.65, fontSize: 13 } }, "把任务委派给本机已登录的 Qoder 系 CLI,消耗各自会员额度。子代理看不到当前对话,委派内容需自带完整上下文。"),
		providers.map((spec, index) => h(ProviderCard, { key: `${spec.name}:${index}`, spec, index, form, connection })),
	);
}

function apply(ctx) {
	const form = ctx.configForms.get(ENTRY_ID);
	ctx.effect(() => ctx.locale.register(LOCALE_NS, LOCALES), "qoder-subagent: copy");
	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: "qoder-subagent",
		order: 16,
		locale: LOCALE_NS,
		label: () => "Qoder 子代理",
		inject: () => ({ form, connection: ctx.get("connection") }),
	}, QoderSection));
}

export { apply, inject, name };
