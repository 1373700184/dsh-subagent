window.__ModuleLoader__.load({
	id: "dsh-subagent",
	factory: (require) => {
		var module = { exports: {} };
		(function (module, exports) {
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.js
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var name = "qoder-subagent-client";
var inject = ["slots", "locale", "configForms", "connection"];
var ENTRY_ID = "subagent-cli";
var LOCALE_NS = "settings.qoderSubagent";
var LOCALES = {
  zh: { meta: { title: "Qoder 子代理", description: "把任务委派给本机 Qoder 系 CLI,消耗会员额度。" }, nav: "Qoder 子代理" },
  en: { meta: { title: "Qoder Subagents", description: "Delegate tasks to local Qoder CLIs and spend their subscription quotas." }, nav: "Qoder Subagents" }
};
var REASONING_EFFORTS = ["auto", "none", "low", "medium", "high", "xhigh", "max", "ultracode"];
var PERMISSION_MODES = ["bypass_permissions", "dont_ask", "auto", "accept_edits", "default"];
var h = import_react.default.createElement;
function callRpc(connection, endpoint, payload) {
  return connection.rpc.call("/api", `qoder-subagent/${endpoint}`, payload, AbortSignal.timeout(6e4)).then((result) => {
    if (!result?.ok) throw new Error(result?.error?.message ?? "probe failed");
    return result.value;
  });
}
function ProviderCard({ spec, index, form, connection }) {
  const [probe, setProbe] = import_react.default.useState({ status: "idle" });
  const probeKey = `${spec.name}|${spec.binary ?? ""}`;
  import_react.default.useEffect(() => {
    let alive = true;
    setProbe({ status: "loading" });
    callRpc(connection, "probe", { name: spec.name }).then((value) => alive && setProbe({ status: "ready", value })).catch((error) => alive && setProbe({ status: "error", message: String(error?.message ?? error) }));
    return () => {
      alive = false;
    };
  }, [probeKey, connection]);
  const write = (patch) => {
    const current = form.getSnapshot().value ?? {};
    const providers = (current.providers ?? []).map((entry, i) => i === index ? { ...entry, ...patch } : entry);
    void form.set("providers", providers);
  };
  const setField = (key) => (event) => {
    const raw = event.target.value;
    if (key === "contextWindow" || key === "timeoutSeconds") write({ [key]: raw === "" ? void 0 : Number(raw) });
    else write({ [key]: raw === "" ? void 0 : raw });
  };
  const refresh = () => {
    setProbe({ status: "loading" });
    callRpc(connection, "refresh", { name: spec.name }).then((value) => setProbe({ status: "ready", value })).catch((error) => setProbe({ status: "error", message: String(error?.message ?? error) }));
  };
  const info = probe.value;
  const label = { width: 130, display: "inline-block", opacity: 0.75 };
  const row = { marginBottom: 10 };
  const select = { minWidth: 220 };
  return h(
    "section",
    { key: spec.name, style: { border: "1px solid rgba(128,128,128,0.3)", borderRadius: 10, padding: 16, marginBottom: 16 } },
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12 } },
      h("strong", { style: { fontSize: 16 } }, spec.name),
      probe.status === "loading" && h("span", { style: { opacity: 0.6 } }, "检测中…"),
      probe.status === "error" && h("span", { style: { color: "#e5533c" } }, `检测失败: ${probe.message}`),
      probe.status === "ready" && (info.exists ? h("span", { style: { color: "#3f9d5a" } }, `已安装 · v${info.version ?? "?"}`) : h("span", { style: { color: "#e5533c" } }, "未找到 CLI")),
      h("button", { type: "button", onClick: refresh, style: { marginLeft: "auto" } }, "刷新")
    ),
    probe.status === "ready" && h("div", { style: { ...row, opacity: 0.6, fontSize: 12, wordBreak: "break-all" } }, info.binary ?? "未解析到路径"),
    probe.status === "error" && info === void 0 && null,
    h(
      "div",
      { style: row },
      h(
        "label",
        null,
        h("span", { style: label }, "模型"),
        h(
          "select",
          { style: select, value: spec.model ?? "", onChange: setField("model") },
          h("option", { value: "" }, "(CLI 默认)"),
          (info?.models ?? (spec.model ? [spec.model] : [])).map((model) => h("option", { key: model, value: model }, model))
        )
      )
    ),
    h(
      "div",
      { style: row },
      h(
        "label",
        null,
        h("span", { style: label }, "思考程度"),
        h(
          "select",
          { style: select, value: spec.reasoningEffort ?? "auto", onChange: setField("reasoningEffort") },
          REASONING_EFFORTS.map((level) => h("option", { key: level, value: level }, level))
        )
      )
    ),
    h(
      "div",
      { style: row },
      h(
        "label",
        null,
        h("span", { style: label }, "上下文大小"),
        h("input", { style: { width: 140 }, type: "number", min: 1e3, step: 1e3, placeholder: "默认", value: spec.contextWindow ?? "", onChange: setField("contextWindow") }),
        h("span", { style: { marginLeft: 8, opacity: 0.6, fontSize: 12 } }, "tokens,留空用默认")
      )
    ),
    h(
      "div",
      { style: row },
      h(
        "label",
        null,
        h("span", { style: label }, "权限模式"),
        h(
          "select",
          { style: select, value: spec.permissionMode ?? "bypass_permissions", onChange: setField("permissionMode") },
          PERMISSION_MODES.map((mode) => h("option", { key: mode, value: mode }, mode))
        )
      )
    ),
    h(
      "div",
      { style: row },
      h(
        "label",
        null,
        h("span", { style: label }, "超时"),
        h("input", { style: { width: 140 }, type: "number", min: 1, placeholder: "不限", value: spec.timeoutSeconds ?? "", onChange: setField("timeoutSeconds") }),
        h("span", { style: { marginLeft: 8, opacity: 0.6, fontSize: 12 } }, "秒")
      )
    ),
    h(
      "div",
      { style: row },
      h(
        "label",
        null,
        h("span", { style: label }, "CLI 路径"),
        h("input", { style: { width: 360 }, type: "text", placeholder: "自动探测", value: spec.binary ?? "", onChange: setField("binary") })
      )
    )
  );
}
function QoderSection({ form, connection }) {
  const subscribe = import_react.default.useCallback((cb) => form.subscribe(cb), [form]);
  const getSnapshot = import_react.default.useCallback(() => form.getSnapshot(), [form]);
  const snapshot = import_react.default.useSyncExternalStore(subscribe, getSnapshot);
  if (snapshot.status === "loading") return h("div", { style: { opacity: 0.6 } }, "加载配置…");
  if (snapshot.status === "unavailable") return h("div", null, "dsh-subagent 配置未挂载(检查 profile bundles)。");
  const providers = snapshot.value?.providers ?? [];
  if (providers.length === 0) return h("div", null, "未配置任何后端(配置 providers 数组)。");
  return h(
    "div",
    { style: { maxWidth: 640 } },
    h("h2", null, "Qoder 子代理"),
    h("p", { style: { opacity: 0.65, fontSize: 13 } }, "把任务委派给本机已登录的 Qoder 系 CLI,消耗各自会员额度。子代理看不到当前对话,委派内容需自带完整上下文。"),
    providers.map((spec, index) => h(ProviderCard, { key: `${spec.name}:${index}`, spec, index, form, connection }))
  );
}
function QoderToolView({ block, connection }) {
  const settled = block?.kind === "tool-result";
  const resultText = settled ? (block.content ?? []).find?.((item) => item?.type === "text")?.text ?? "" : "";
  const runId = /started subagent ([0-9a-fA-F-]{36})/.exec(resultText)?.[1];
  const [run, setRun] = import_react.default.useState(null);
  const [, setTick] = import_react.default.useState(0);
  const running = Boolean(runId) && (!run || run.status === "running");
  import_react.default.useEffect(() => {
    if (!runId || !connection) return;
    let alive = true;
    const poll = async () => {
      try {
        const next = await callRpc(connection, "activity", { runId });
        if (alive) setRun(next.run ?? null);
      } catch {
      }
    };
    poll();
    const timer = setInterval(poll, 2e3);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [runId, connection]);
  import_react.default.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((x) => x + 1), 1e3);
    return () => clearInterval(timer);
  }, [running]);
  if (!settled) return h("div", { style: { opacity: 0.6, fontSize: 13 } }, "正在启动 Qoder 子代理…");
  if (!runId) return h("div", { style: { fontSize: 13 } }, resultText || "Qoder 子代理");
  const status = run?.status ?? "running";
  const seconds = run ? Math.max(0, Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 1e3)) : 0;
  const badge = { running: ["运行中", "#b8860b"], completed: ["已完成", "#3f9d5a"], error: ["出错", "#e5533c"], aborted: ["已取消", "#8a8a8a"] }[status] ?? ["…", "#8a8a8a"];
  const events = (run?.events ?? []).slice(-6);
  const kindIcon = { tool: "⚙", text: "▸", result: "✔", error: "✖" };
  return h(
    "div",
    { style: { fontSize: 13, lineHeight: 1.5 } },
    h(
      "div",
      { style: { display: "flex", gap: 8, alignItems: "baseline" } },
      h("span", { style: { fontWeight: 600 } }, run?.provider ?? "qoder"),
      h("span", { style: { color: badge[1] } }, badge[0]),
      h("span", { style: { opacity: 0.55 } }, `${seconds}s`),
      run?.label ? h("span", { style: { opacity: 0.55 } }, `· ${run.label}`) : null
    ),
    events.length > 0 && h(
      "div",
      { style: { marginTop: 4, paddingLeft: 10, borderLeft: "2px solid rgba(128,128,128,0.25)", opacity: 0.85 } },
      events.map((event, index) => h(
        "div",
        { key: index, style: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 560, fontFamily: event.kind === "tool" ? "ui-monospace, Consolas, monospace" : void 0 } },
        `${kindIcon[event.kind] ?? "·"} ${event.text}`
      ))
    )
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
    inject: () => ({ form, connection: ctx.get("connection") })
  }, QoderSection));
  for (const toolName of ["qoder", "qodercn"]) {
    ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
      name: "tool.call.toolview",
      key: toolName,
      locale: LOCALE_NS,
      inject: () => ({ connection: ctx.get("connection") })
    }, QoderToolView));
  }
}
		})(module, module.exports);
		return module.exports;
	},
});
