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
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

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
  zh: { meta: { title: "自由子代理", description: "把任务委派给本机已登录的外部 CLI 子代理,消耗各自会员额度。" }, nav: "自由子代理" },
  en: { meta: { title: "Free Subagents", description: "Delegate tasks to local external CLI subagents and spend their subscription quotas." }, nav: "Free Subagents" }
};
var STYLE = `
.qsub-card { border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
.qsub-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.qsub-field { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; min-height: 32px; }
.qsub-label { width: 130px; flex: none; color: var(--dsw-alias-label-primary); opacity: .7; font-size: 13px; }
.qsub-control { height: 32px; padding: 0 10px; border-radius: 8px; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 13px; outline: none; transition: border-color .15s, box-shadow .15s; }
.qsub-control:hover { border-color: var(--dsw-alias-border-l3); }
.qsub-control:focus { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
.qsub-control:disabled { opacity: .45; cursor: not-allowed; background: var(--dsw-alias-bg-overlay); }
.qsub-btn:disabled { opacity: .45; cursor: not-allowed; }
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
.qsub-toolbar { display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 10px; }
.qsub-active-btn { background: var(--dsw-alias-bg-overlay); border-color: var(--dsw-alias-border-l3); font-weight: 600; }
.qsub-tabs { display: flex; gap: 2px; margin-bottom: 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.qsub-tab { background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; padding: 8px 14px; color: var(--dsw-alias-label-primary); opacity: .6; font-size: 13px; cursor: pointer; }
.qsub-tab:hover { opacity: .85; }
.qsub-tab-on { opacity: 1; font-weight: 600; border-bottom-color: var(--dsw-alias-brand-primary); }
.qsub-model-list { flex: 1; min-width: 0; }
.qsub-model-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
.qsub-model-name { flex: 1; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qsub-model-rate { font-size: 12px; opacity: .55; flex: none; }
.qsub-icon-btn { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 12px; line-height: 1; }
.qsub-icon-btn:hover:not(:disabled) { background: var(--dsw-alias-bg-overlay); }
.qsub-icon-btn:disabled { opacity: .3; cursor: not-allowed; }
.qsub-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; z-index: 3000; }
.qsub-toast { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l3); border-radius: 10px; padding: 10px 20px; font-size: 15px; font-weight: 700; box-shadow: 0 8px 24px rgba(0,0,0,.18); z-index: 3100; }
.qsub-modal { width: 520px; max-width: calc(100vw - 40px); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 20px; box-shadow: 0 10px 40px rgba(0,0,0,.25); }
`;
var REASONING_EFFORTS = ["auto", "none", "low", "medium", "high", "xhigh", "max", "ultracode"];
var BUILTIN_BACKENDS = [
  { name: "qoder", driver: "qoder-json" },
  { name: "qodercn", driver: "qoder-json" },
  { name: "opencode", driver: "opencode-json" },
  { name: "pi", driver: "pi-json" },
  { name: "codebuddy", driver: "codebuddy-json" },
  { name: "codex", driver: "codex-json" },
  { name: "claude", driver: "claude-json" }
];
var RESUME_COMMANDS = {
  qoder: (id) => `qodercli --resume ${id}`,
  qodercn: (id) => `qoderclicn --resume ${id}`,
  codebuddy: (id) => `codebuddy --resume ${id}`,
  claude: (id) => `claude --resume ${id}`,
  codex: (id) => `codex resume ${id}`
};
var PERMISSION_MODES = [
  ["bypass_permissions", "完全放行(跳过权限检查)"],
  ["auto", "自动判断"],
  ["accept_edits", "自动接受编辑"],
  ["dont_ask", "不询问"],
  ["default", "默认"]
];
var h = import_react.default.createElement;
function callRpc(connection, endpoint, payload, timeout = 6e4) {
  return connection.rpc.call("/api", `qoder-subagent/${endpoint}`, payload, AbortSignal.timeout(timeout)).then((result) => {
    if (!result?.ok) throw new Error(result?.error?.message ?? "probe failed");
    return result.value;
  });
}
function ProviderCard({ spec, index, form, connection, onRemove, onMove, canUp, canDown, removingName, probeCache }) {
  const [probe, setProbe] = import_react.default.useState({ status: "idle" });
  const [saving, setSaving] = import_react.default.useState(0);
  const [saveError, setSaveError] = import_react.default.useState("");
  const [updating, setUpdating] = import_react.default.useState(false);
  const [updateMsg, setUpdateMsg] = import_react.default.useState("");
  const mountedRef = import_react.default.useRef(true);
  import_react.default.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const probeKey = `${spec.name}|${spec.binary ?? ""}`;
  import_react.default.useEffect(() => {
    let alive = true;
    const hit = probeCache?.current?.get(probeKey);
    if (hit?.value) {
      setProbe({ status: "ready", value: hit.value });
    } else if (hit?.promise) {
      setProbe({ status: "loading" });
      hit.promise.then((value) => alive && setProbe({ status: "ready", value })).catch((error) => alive && setProbe({ status: "error", message: String(error?.message ?? error) }));
    } else {
      setProbe({ status: "loading" });
      const promise = callRpc(connection, "probe", { name: spec.name });
      probeCache?.current?.set(probeKey, { promise });
      promise.then((value) => {
        probeCache?.current?.set(probeKey, { value });
        if (alive) setProbe({ status: "ready", value });
      }).catch((error) => {
        probeCache?.current?.delete(probeKey);
        if (alive) setProbe({ status: "error", message: String(error?.message ?? error) });
      });
    }
    return () => {
      alive = false;
    };
  }, [probeKey, connection, probeCache]);
  const write = (patch) => {
    const current = form.getSnapshot().value ?? {};
    const providers = (current.providers ?? []).map((entry, i) => i === index ? { ...entry, ...patch } : entry);
    setSaving((n) => n + 1);
    setSaveError("");
    form.set("providers", providers).then((ok) => {
      if (!ok) setSaveError("保存被拒绝");
    }).catch((error) => setSaveError(`保存失败: ${String(error?.message ?? error).slice(0, 120)}`)).finally(() => setSaving((n) => Math.max(0, n - 1)));
  };
  const setField = (key) => (event) => {
    const raw = event.target.value;
    write({ [key]: raw === "" ? void 0 : raw });
  };
  const [drafts, setDrafts] = import_react.default.useState({});
  const draftProps = (key, commit) => ({
    value: drafts[key] ?? (spec[key] ?? ""),
    onChange: (event) => setDrafts((current) => ({ ...current, [key]: event.target.value })),
    onBlur: () => {
      if (drafts[key] === void 0) return;
      commit(drafts[key]);
      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    onKeyDown: (event) => {
      if (event.key === "Enter") event.currentTarget.blur();
    }
  });
  const commitNumber = (key, min = 1) => (raw) => {
    const text = String(raw).trim();
    if (text === "") return write({ [key]: void 0 });
    const value = Number(text);
    if (!Number.isFinite(value) || value < min) return;
    write({ [key]: value });
  };
  const updateCli = () => {
    if (updating) return;
    setUpdating(true);
    setUpdateMsg("");
    callRpc(connection, "update", { name: spec.name }, 19e4).then((value) => {
      probeCache?.current?.set(probeKey, { value });
      if (mountedRef.current) {
        setProbe({ status: "ready", value });
        setUpdateMsg(`CLI 已更新到 v${value.version ?? "最新版"}`);
      }
    }).catch((error) => {
      if (mountedRef.current) setUpdateMsg(`更新失败: ${String(error?.message ?? error).slice(0, 200)}`);
    }).finally(() => {
      if (mountedRef.current) setUpdating(false);
    });
  };
  const refresh = () => {
    setProbe({ status: "loading" });
    setUpdateMsg("");
    const promise = callRpc(connection, "refresh", { name: spec.name });
    probeCache?.current?.set(probeKey, { promise });
    promise.then((value) => {
      probeCache?.current?.set(probeKey, { value });
      if (mountedRef.current) setProbe({ status: "ready", value });
    }).catch((error) => {
      probeCache?.current?.delete(probeKey);
      if (mountedRef.current) setProbe({ status: "error", message: String(error?.message ?? error) });
    });
  };
  const info = probe.value;
  const disabled = probe.status === "loading";
  const models = Array.isArray(spec.models) && spec.models.length > 0 ? spec.models : spec.model ? [spec.model] : [];
  const writeModels = (next) => write({ models: next, model: void 0 });
  const moveModel = (index2, delta) => {
    const target = index2 + delta;
    if (target < 0 || target >= models.length) return;
    const next = [...models];
    [next[index2], next[target]] = [next[target], next[index2]];
    writeModels(next);
  };
  const field = (name2, control, hint) => h(
    "div",
    { className: "qsub-field", style: { alignItems: "flex-start" } },
    h("span", { className: "qsub-label", style: { paddingTop: 6 } }, name2),
    control,
    hint ? h("span", { className: "qsub-hint", style: { paddingTop: 6 } }, hint) : null
  );
  return h(
    "section",
    { key: spec.name, className: "qsub-card" },
    h(
      "div",
      { className: "qsub-head" },
      h("strong", { style: { fontSize: 15 } }, spec.name),
      probe.status === "loading" && h("span", { className: "qsub-hint" }, "检测中…"),
      probe.status === "error" && h("span", { className: "qsub-bad" }, `检测失败: ${probe.message}`),
      probe.status === "ready" && (info.exists ? h("span", { className: "qsub-ok" }, `已安装 · v${info.version ?? "?"}`) : h("span", { className: "qsub-bad" }, "未找到 CLI")),
      saving > 0 && h("span", { className: "qsub-hint", style: { color: "var(--dsw-alias-brand-primary)" } }, "保存中…"),
      saveError && h("span", { className: "qsub-bad" }, saveError),
      onMove && h("button", { type: "button", onClick: () => onMove(-1), className: "qsub-btn", disabled: disabled || !canUp, title: "上移(提高优先级)" }, "↑"),
      onMove && h("button", { type: "button", onClick: () => onMove(1), className: "qsub-btn", disabled: disabled || !canDown, title: "下移(降低优先级)" }, "↓"),
      info?.updateAvailable && h("button", {
        type: "button",
        onClick: updateCli,
        className: "qsub-btn qsub-active-btn",
        disabled: disabled || updating,
        title: `更新 CLI 到 v${info.latestVersion}`,
        style: { marginLeft: "auto" }
      }, updating ? "更新中…" : `更新 CLI v${info.latestVersion}`),
      h("button", { type: "button", onClick: refresh, className: "qsub-btn", disabled, style: info?.updateAvailable ? void 0 : { marginLeft: "auto" } }, "刷新"),
      onRemove && h("button", { type: "button", onClick: onRemove, className: "qsub-btn", disabled: disabled || Boolean(removingName), title: "停用此后端(从配置移除)" }, removingName === spec.name ? "停用中…" : "停用")
    ),
    probe.status === "ready" && h("div", { className: "qsub-hint qsub-mono", style: { marginBottom: 12, wordBreak: "break-all" } }, info.binary ?? "未解析到路径"),
    updateMsg && h("div", { className: updateMsg.startsWith("更新失败") ? "qsub-bad" : "qsub-ok", style: { marginBottom: 8 } }, updateMsg),
    field(
      "模型顺序",
      h(
        "div",
        { className: "qsub-model-list" },
        models.length === 0 && h("div", { className: "qsub-hint", style: { marginBottom: 6 } }, "未指定(用 CLI 默认模型);没有备用模型可切换"),
        models.map((model, position) => h(
          "div",
          { key: `${model}:${position}`, className: "qsub-model-row" },
          h("span", { className: "qsub-model-name" }, `${position + 1}. ${model}`),
          h("span", { className: "qsub-model-rate" }, info?.rates?.[model] ? `${info.rates[model]} 额度` : ""),
          h("button", { type: "button", className: "qsub-icon-btn", title: "上移", disabled: disabled || position === 0, onClick: () => moveModel(position, -1) }, "↑"),
          h("button", { type: "button", className: "qsub-icon-btn", title: "下移", disabled: disabled || position === models.length - 1, onClick: () => moveModel(position, 1) }, "↓"),
          h("button", { type: "button", className: "qsub-icon-btn", title: "移除", disabled, onClick: () => writeModels(models.filter((_, i) => i !== position)) }, "✕")
        )),
        h(
          "select",
          {
            className: "qsub-control qsub-select",
            style: { marginTop: 6, width: "100%" },
            value: "",
            disabled,
            onChange: (event) => {
              const model = event.target.value;
              event.target.value = "";
              if (model) writeModels([...models, model]);
            }
          },
          h("option", { value: "" }, "+ 添加模型…"),
          (info?.models ?? []).filter((model) => !models.includes(model)).map((model) => h("option", { key: model, value: model }, info?.rates?.[model] ? `${model} · ${info.rates[model]} 额度` : model))
        ),
        h("div", { className: "qsub-hint", style: { marginTop: 6 } }, "按顺序尝试,卡住自动切换下一个")
      )
    ),
    field("并发上限", h("input", { className: "qsub-control qsub-number", type: "number", min: 1, step: 1, placeholder: "2", ...draftProps("maxConcurrency", commitNumber("maxConcurrency")), disabled }), "个,同时最多执行几个子代理;超出排队"),
    field("思考程度", h(
      "select",
      { className: "qsub-control qsub-select", value: spec.reasoningEffort ?? "auto", onChange: setField("reasoningEffort"), disabled },
      REASONING_EFFORTS.map((level) => h("option", { key: level, value: level }, level))
    )),
    field("上下文大小", h("input", { className: "qsub-control qsub-number", type: "number", min: 1e3, step: 1e3, placeholder: "默认", ...draftProps("contextWindow", commitNumber("contextWindow")), disabled }), "tokens,留空用默认"),
    field("权限模式", h(
      "select",
      { className: "qsub-control qsub-select", value: spec.permissionMode ?? "bypass_permissions", onChange: setField("permissionMode"), disabled },
      PERMISSION_MODES.map(([value, label]) => h("option", { key: value, value }, `${label}(${value})`))
    )),
    field("单模型等待", h("input", { className: "qsub-control qsub-number", type: "number", min: 0, placeholder: "90", ...draftProps("stallWarnSeconds", commitNumber("stallWarnSeconds", 0)), disabled }), "秒无输出则切换下一个模型,0 关闭"),
    field("允许等待", h("input", { className: "qsub-control qsub-number", type: "number", min: 1, placeholder: "300", ...draftProps("allowedWaitSeconds", commitNumber("allowedWaitSeconds")), disabled }), "秒,整条链共用;超时直接上报主任务"),
    field("超时", h("input", { className: "qsub-control qsub-number", type: "number", min: 1, placeholder: "不限", ...draftProps("timeoutSeconds", commitNumber("timeoutSeconds")), disabled }), "秒"),
    field("CLI 路径", h("input", { className: "qsub-control qsub-path", type: "text", placeholder: "自动探测(含 PATH)", ...draftProps("binary", (raw) => write({ binary: String(raw).trim() || void 0 })), disabled }))
  );
}
function AddBackend({ options, form, connection, onCustom }) {
  const [probes, setProbes] = import_react.default.useState({});
  const [saving, setSaving] = import_react.default.useState(false);
  const [saveError, setSaveError] = import_react.default.useState("");
  const names = options.map((option) => option.name).join(",");
  import_react.default.useEffect(() => {
    let alive = true;
    setProbes({});
    for (const option of options) {
      callRpc(connection, "probe", { name: option.name }).then((value) => alive && setProbes((current) => ({ ...current, [option.name]: value }))).catch(() => alive && setProbes((current) => ({ ...current, [option.name]: { unavailable: true } })));
    }
    return () => {
      alive = false;
    };
  }, [names, connection]);
  const label = (option) => {
    const info = probes[option.name];
    if (!info) return `${option.name} · 检测中…`;
    if (info.unavailable) return `${option.name} · 无法检测`;
    if (!info.exists) return `${option.name} · 未找到 CLI`;
    return `${option.name} · 已安装${info.version ? ` v${info.version}` : ""}`;
  };
  const add = (name2) => {
    const option = options.find((candidate) => candidate.name === name2);
    if (!option) return;
    const current = form.getSnapshot().value ?? {};
    const providers = [...current.providers ?? [], { name: option.name, driver: option.driver }];
    setSaving(true);
    setSaveError("");
    form.set("providers", providers).then((ok) => {
      if (!ok) setSaveError("保存被拒绝");
    }).catch((error) => setSaveError(`保存失败: ${String(error?.message ?? error).slice(0, 120)}`)).finally(() => setSaving(false));
  };
  return h(
    import_react.default.Fragment,
    null,
    h(
      "select",
      {
        className: "qsub-control qsub-select",
        style: { minWidth: 190 },
        value: "",
        disabled: saving,
        title: "只注册已添加的后端;装了但没添加的 CLI 不会出现在工具和指令里",
        onChange: (event) => {
          const name2 = event.target.value;
          event.target.value = "";
          if (name2 === "__custom__") onCustom?.();
          else if (name2) add(name2);
        }
      },
      h("option", { value: "" }, saving ? "添加中…" : "+ 选择要启用的后端…"),
      options.map((option) => h("option", { key: option.name, value: option.name }, label(option))),
      h("option", { value: "__custom__" }, "添加自定义后端…")
    ),
    saveError ? h("span", { className: "qsub-bad" }, saveError) : null
  );
}
var DRIVER_OPTIONS = [
  ["qoder-json", "qoder-json(Claude 风格 stream-json)"],
  ["codebuddy-json", "codebuddy-json(腾讯 CodeBuddy)"],
  ["claude-json", "claude-json(Claude Code)"],
  ["codex-json", "codex-json(OpenAI Codex)"],
  ["opencode-json", "opencode-json(OpenCode)"],
  ["pi-json", "pi-json(Pi)"]
];
function CustomBackendModal({ form, onClose }) {
  const open = true;
  const setOpen = (value) => {
    if (!value) onClose?.();
  };
  const [name2, setName] = import_react.default.useState("");
  const [driver, setDriver] = import_react.default.useState("qoder-json");
  const [binary, setBinary] = import_react.default.useState("");
  const [error, setError] = import_react.default.useState("");
  const [saving, setSaving] = import_react.default.useState(false);
  import_react.default.useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const close = () => {
    setOpen(false);
    setError("");
  };
  const add = () => {
    const trimmed = name2.trim();
    if (!trimmed) return setError("请填写后端名称,例如 mycli");
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return setError("名称只能包含字母、数字、- 和 _");
    const latest = form.getSnapshot().value?.providers ?? [];
    if (latest.some((entry2) => entry2.name === trimmed)) return setError("该名称已存在");
    const entry = { name: trimmed, driver, permissionMode: "bypass_permissions", models: [], extraArgs: [] };
    if (binary.trim()) entry.binary = binary.trim();
    setSaving(true);
    setError("");
    form.set("providers", [...latest, entry]).then((ok) => {
      if (!ok) setError("添加被拒绝");
      else {
        setName("");
        setBinary("");
        setOpen(false);
      }
    }).catch((reason) => setError(`添加失败: ${String(reason?.message ?? reason).slice(0, 120)}`)).finally(() => setSaving(false));
  };
  return h(
    import_react.default.Fragment,
    null,
    open && h(
      "div",
      { className: "qsub-modal-mask", onClick: close },
      h(
        "div",
        { className: "qsub-modal", onClick: (event) => event.stopPropagation() },
        h("h3", { style: { margin: "0 0 12px", fontSize: 16 } }, "添加自定义后端"),
        h(
          "div",
          { className: "qsub-field" },
          h("span", { className: "qsub-label" }, "名称"),
          h("input", { className: "qsub-control", style: { width: 300 }, placeholder: "只能包含字母、数字、- 和 _,例如 mycli", value: name2, disabled: saving, autoFocus: true, onChange: (event) => setName(event.target.value) })
        ),
        h(
          "div",
          { className: "qsub-field" },
          h("span", { className: "qsub-label" }, "驱动"),
          h(
            "select",
            { className: "qsub-control qsub-select", value: driver, disabled: saving, onChange: (event) => setDriver(event.target.value) },
            DRIVER_OPTIONS.map(([value, label]) => h("option", { key: value, value }, label))
          )
        ),
        h(
          "div",
          { className: "qsub-field" },
          h("span", { className: "qsub-label" }, "CLI 路径"),
          h("input", { className: "qsub-control", style: { width: 380 }, placeholder: "可留空自动探测", value: binary, disabled: saving, onChange: (event) => setBinary(event.target.value) })
        ),
        error ? h("div", { className: "qsub-bad", style: { marginBottom: 8 } }, error) : null,
        h("div", { className: "qsub-hint", style: { marginBottom: 12 } }, "驱动须与 CLI 的 JSON 协议一致;添加后会生成同名工具、/指令,并出现在预设与状态列表里。"),
        h(
          "div",
          { style: { display: "flex", justifyContent: "flex-end", gap: 8 } },
          h("button", { type: "button", className: "qsub-btn", disabled: saving, onClick: close }, "取消"),
          h("button", { type: "button", className: "qsub-btn qsub-active-btn", disabled: saving, onClick: add }, saving ? "添加中…" : "添加")
        )
      )
    )
  );
}
var LAYOUT_KEY = "qsub.layout";
function QoderSection({ form, connection }) {
  const subscribe = import_react.default.useCallback((cb) => form.subscribe(cb), [form]);
  const getSnapshot = import_react.default.useCallback(() => form.getSnapshot(), [form]);
  const snapshot = import_react.default.useSyncExternalStore(subscribe, getSnapshot);
  const [layout, setLayout] = import_react.default.useState(() => {
    try {
      return localStorage.getItem(LAYOUT_KEY) === "tabs" ? "tabs" : "stack";
    } catch {
      return "stack";
    }
  });
  const [active, setActive] = import_react.default.useState(0);
  const [limitDraft, setLimitDraft] = import_react.default.useState(null);
  const [customOpen, setCustomOpen] = import_react.default.useState(false);
  const [toast, setToast] = import_react.default.useState("");
  const [toastPos, setToastPos] = import_react.default.useState(null);
  const toastTimer = import_react.default.useRef(0);
  const [modeDraft, setModeDraft] = import_react.default.useState(null);
  const [modeSaving, setModeSaving] = import_react.default.useState(false);
  const [modeError, setModeError] = import_react.default.useState("");
  const modeTimer = import_react.default.useRef(0);
  const [removing, setRemoving] = import_react.default.useState("");
  const removingRef = import_react.default.useRef(false);
  const probeCache = import_react.default.useRef(/* @__PURE__ */ new Map());
  const rootRef = import_react.default.useRef(null);
  const showToast = (text) => {
    const rect = rootRef.current?.closest?.('[role="dialog"]')?.getBoundingClientRect?.();
    setToastPos(rect ? { left: Math.round(rect.left + rect.width / 2), top: Math.round(rect.top + 34) } : null);
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2500);
  };
  import_react.default.useEffect(() => () => clearTimeout(modeTimer.current), []);
  const limitTimer = import_react.default.useRef(0);
  const statusLimit = Number(snapshot.value?.statusListLimit ?? 16);
  const scheduleMode = modeDraft ?? (snapshot.value?.scheduleMode === "balanced" ? "balanced" : "priority");
  const changeMode = (value) => {
    setModeDraft(value);
    setModeError("");
    clearTimeout(modeTimer.current);
    modeTimer.current = setTimeout(async () => {
      setModeSaving(true);
      try {
        const ok = await form.set("scheduleMode", value);
        if (!ok) setModeError("保存被拒绝");
      } catch (error) {
        setModeError(`保存失败: ${String(error?.message ?? error).slice(0, 80)}`);
      } finally {
        setModeSaving(false);
        setModeDraft(null);
      }
    }, 400);
  };
  const chooseLayout = (value) => {
    setLayout(value);
    try {
      localStorage.setItem(LAYOUT_KEY, value);
    } catch {
    }
  };
  const changeLimit = (raw) => {
    const value = Number(raw);
    setLimitDraft(raw);
    clearTimeout(limitTimer.current);
    if (!Number.isFinite(value) || value < 1 || value > 24) return;
    limitTimer.current = setTimeout(() => {
      void form.set("statusListLimit", value);
      setLimitDraft(null);
    }, 500);
  };
  if (snapshot.status === "loading") return h("div", { style: { opacity: 0.6 } }, "加载配置…");
  if (snapshot.status === "unavailable") return h("div", null, "dsh-subagent 配置未挂载(检查 profile bundles)。");
  const providers = snapshot.value?.providers ?? [];
  const configured = new Set(providers.map((spec) => spec.name));
  const missing = BUILTIN_BACKENDS.filter((entry) => !configured.has(entry.name));
  const current = Math.min(active, Math.max(0, providers.length - 1));
  const removeProvider = (index) => {
    if (removingRef.current) return;
    const latest = form.getSnapshot().value?.providers ?? providers;
    const name2 = latest[index]?.name ?? "";
    if (!name2) return;
    removingRef.current = true;
    setRemoving(name2);
    form.set("providers", latest.filter((entry) => entry.name !== name2)).then((ok) => {
      showToast(ok ? `✅ 已停用后端 ${name2}` : "停用失败,请重试");
    }).catch(() => showToast("停用失败,请重试")).finally(() => {
      removingRef.current = false;
      setRemoving("");
    });
  };
  const moveProvider = (index, delta) => {
    const latest = form.getSnapshot().value?.providers ?? providers;
    const target = index + delta;
    if (target < 0 || target >= latest.length) return;
    const next = [...latest];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    void form.set("providers", next);
    setActive(target);
  };
  const layoutButton = (value, label) => h("button", {
    type: "button",
    className: `qsub-btn${layout === value ? " qsub-active-btn" : ""}`,
    onClick: () => chooseLayout(value)
  }, label);
  return h(
    "div",
    { style: { maxWidth: 640 }, ref: rootRef },
    h("h2", null, "自由子代理"),
    h("p", { className: "qsub-hint", style: { fontSize: 13 } }, `把任务委派给本机已登录的外部 CLI 子代理(当前启用:${providers.map((spec) => spec.name).join(" / ") || "无"}),消耗各自会员额度。子代理看不到当前对话,委派内容需自带完整上下文。`),
    h(
      "div",
      { className: "qsub-toolbar" },
      providers.length > 0 && layoutButton("stack", "堆叠"),
      providers.length > 0 && layoutButton("tabs", "标签页"),
      h(AddBackend, { options: missing, form, connection, onCustom: () => setCustomOpen(true) })
    ),
    h(
      "div",
      { className: "qsub-field", style: { marginBottom: 12 } },
      h("span", { className: "qsub-label" }, "状态列表条数"),
      h("input", {
        className: "qsub-control qsub-number",
        type: "number",
        min: 1,
        max: 24,
        value: limitDraft ?? statusLimit,
        onChange: (event) => changeLimit(event.target.value)
      }),
      h("span", { className: "qsub-hint" }, "1-24,/sub_agent_status 列出最近 N 次运行")
    ),
    h(
      "div",
      { className: "qsub-field", style: { marginBottom: 12 } },
      h("span", { className: "qsub-label" }, "调度模式"),
      h(
        "select",
        { className: "qsub-control qsub-select", value: scheduleMode, disabled: modeSaving, onChange: (event) => changeMode(event.target.value) },
        h("option", { value: "priority" }, "优先启动(按后端顺序)"),
        h("option", { value: "balanced" }, "平均分配(轮流使用)")
      ),
      h("span", { className: modeError ? "qsub-bad" : "qsub-hint", style: modeSaving ? { color: "var(--dsw-alias-brand-primary)" } : void 0 }, modeSaving ? "保存中…" : modeError || (scheduleMode === "priority" ? "从所选后端开始(↑↓ 调整顺序),满后自动转给下一个;全部满则等待" : "插件自动选择当前任务最少的后端,并遵守并发上限"))
    ),
    providers.length === 0 && h("div", { className: "qsub-hint", style: { marginBottom: 12 } }, "当前没有启用任何后端,从下方添加一个内置后端。"),
    providers.length > 0 && layout === "tabs" && h(
      "div",
      { className: "qsub-tabs" },
      providers.map((spec, index) => h("button", {
        key: `${spec.name}:${index}`,
        type: "button",
        className: `qsub-tab${index === current ? " qsub-tab-on" : ""}`,
        onClick: () => setActive(index)
      }, spec.name))
    ),
    providers.length > 0 && (layout === "tabs" ? h(ProviderCard, { key: `${providers[current].name}:${current}`, spec: providers[current], index: current, form, connection, onRemove: () => removeProvider(current), onMove: (delta) => moveProvider(current, delta), canUp: current > 0, canDown: current < providers.length - 1, removingName: removing, probeCache }) : providers.map((spec, index) => h(ProviderCard, { key: `${spec.name}:${index}`, spec, index, form, connection, onRemove: () => removeProvider(index), onMove: (delta) => moveProvider(index, delta), canUp: index > 0, canDown: index < providers.length - 1, removingName: removing, probeCache }))),
    customOpen && h(CustomBackendModal, { form, onClose: () => setCustomOpen(false) }),
    toast ? h("div", { className: "qsub-toast", style: toastPos ? { left: toastPos.left, top: toastPos.top, transform: "translate(-50%, 0)" } : void 0 }, toast) : null
  );
}
function QoderToolView({ block, connection }) {
  const settled = block?.kind === "tool-result";
  const resultText = settled ? (block.content ?? []).find?.((item) => item?.type === "text")?.text ?? "" : "";
  const runId = /started subagent ([0-9a-fA-F-]{36})/.exec(resultText)?.[1];
  const [run, setRun] = import_react.default.useState(null);
  const [open, setOpen] = import_react.default.useState(false);
  const [, setTick] = import_react.default.useState(0);
  const bodyRef = import_react.default.useRef(null);
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
  import_react.default.useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [open, run?.events?.length]);
  if (!settled) return h("div", { style: { opacity: 0.6, fontSize: 13 } }, "正在启动子代理…");
  if (!runId) return h("div", { style: { fontSize: 13 } }, resultText || "子代理");
  const status = run?.status ?? "running";
  const seconds = run ? Math.max(0, Math.round(((run.endedAt ?? Date.now()) - run.startedAt) / 1e3)) : 0;
  const badge = { running: ["运行中", "#b8860b"], completed: ["已完成", "#3f9d5a"], error: ["出错", "#e5533c"], aborted: ["已取消", "#8a8a8a"] }[status] ?? ["…", "#8a8a8a"];
  const allEvents = run?.events ?? [];
  const shown = open ? allEvents : allEvents.slice(-6);
  const kindIcon = { tool: "⚙", text: "▸", think: "◎", result: "✔", error: "✖" };
  const creditsText = run?.credits ? run.credits.total > 0 ? `${run.credits.total.toFixed(4)} 额度` : run.credits.billable === false ? "免费" : "0 额度" : typeof run?.costUsd === "number" ? `$${run.costUsd.toFixed(4)}` : null;
  const idleSeconds = run && running ? Math.max(0, Math.round((Date.now() - (allEvents.at(-1)?.t ?? run.startedAt)) / 1e3)) : 0;
  const stallLimit = run?.stallWarnSeconds ?? 90;
  const stalled = running && stallLimit > 0 && idleSeconds >= stallLimit;
  return h(
    "div",
    { style: { fontSize: 13, lineHeight: 1.5 } },
    h(
      "div",
      {
        style: { display: "flex", gap: 8, alignItems: "baseline", cursor: "pointer", userSelect: "none" },
        onClick: () => setOpen((x) => !x),
        title: open ? "收起详情" : "展开全部过程"
      },
      h("span", { style: { display: "inline-block", transform: `rotate(${open ? 90 : 0}deg)`, transition: "transform .15s" } }, "▸"),
      h("span", { style: { fontWeight: 600 } }, run?.provider ?? "qoder"),
      h("span", { style: { color: badge[1] } }, badge[0]),
      h("span", { style: { opacity: 0.55 } }, `${seconds}s`),
      stalled ? h("span", { style: { color: "#e5533c" } }, `· 静默 ${idleSeconds}s`) : null,
      creditsText ? h("span", { style: { opacity: 0.55 } }, `· ${creditsText}`) : null,
      run?.label ? h("span", { style: { opacity: 0.55 } }, `· ${run.label}`) : null,
      h("span", { style: { opacity: 0.45, marginLeft: "auto" } }, `${allEvents.length} 步`)
    ),
    shown.length > 0 && h(
      "div",
      {
        ref: bodyRef,
        style: {
          marginTop: 4,
          paddingLeft: 10,
          borderLeft: "2px solid rgba(128,128,128,0.25)",
          maxHeight: open ? 420 : "none",
          overflowY: open ? "auto" : "hidden"
        }
      },
      shown.map((event, index) => h("div", {
        key: index,
        style: {
          whiteSpace: open ? "pre-wrap" : "nowrap",
          overflow: open ? "visible" : "hidden",
          textOverflow: open ? void 0 : "ellipsis",
          maxWidth: 620,
          fontFamily: event.kind === "tool" ? "ui-monospace, Consolas, monospace" : void 0,
          opacity: event.kind === "think" ? 0.7 : 0.9
        }
      }, `${kindIcon[event.kind] ?? "·"} ${event.text}`)),
      open && run?.sessionId && RESUME_COMMANDS[run.provider] && h(
        "div",
        { style: { marginTop: 8, opacity: 0.55, fontSize: 12 } },
        "完整记录已存 CLI 会话: ",
        h("code", null, RESUME_COMMANDS[run.provider](run.sessionId))
      )
    )
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
    inject: () => ({ form, connection: ctx.get("connection") })
  }, QoderSection));
  for (const toolName of BUILTIN_BACKENDS.map((backend) => backend.name)) {
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
