# dsh-subagent

把外部 CLI 子代理(Qoder、QoderCN、OpenCode、Pi、CodeBuddy,可继续扩展)注册成 dsh(DeepSeek Harness)的**子代理提供方**,让父 agent 通过委派工具把任务交给这些 CLI 跑,消耗各自的订阅额度。

每个后端都是**一次性执行**:插件 spawn CLI 子进程,提示词经 stdin 送入,读取各自的 JSON 事件流(`qoder-json` / `codebuddy-json` / `opencode-json` / `pi-json` 驱动),收敛到最终结果。子代理**看不到父会话上下文**,所以委派任务里要自带完整上下文。

## 安装

```sh
dsh plugin --profile web add github:1373700184/dsh-subagent
```

装好后插件的 `cordis.patch.yml` 会向 profile 树插入三个节点:提供方 `dsh-subagent`,以及两个委派工具 `qoder`、`qodercn`(各绑一个 `@deepseek-ai/dsh-tool-subagent` 实例)。重启 dsh 生效。

前置条件:对应 CLI 已安装且已登录——`qodercli`(`~/.qoder/bin/qodercli/`)、`qoderclicn`(`~/.qoder-cn/bin/qoderclicn/`)、`opencode`(`~/.opencode/bin/`)、`pi`(`~/.pi/agent/bin/`,通过 node + `pi-launcher.js` 启动)、`codebuddy`(npm 全局 `@tencent-ai/codebuddy-code`,通过 node 启动)。

## 使用

在 dsh 会话里让父 agent 调用工具即可,例如:

```
用 qoder 子代理:在这个仓库里找出所有 TODO 注释并汇总
```

父 agent 会调用 `qoder` 工具,插件 spawn `qodercli -p ...` 并返回子代理的最终文本。`qodercn` 工具走国内版 CLI。

### 斜杠指令

输入框里直接敲:

```
/qoder 统计当前目录每个顶层目录的文件数并汇总
/qodercn 把 README 翻成英文
```

指令是**快捷方式**:把任务作为消息交给当前会话,由 agent 调用对应工具发起委派——所以实时进度面板、扣费显示、完成通知与普通工具调用完全一致。指令名跟随 `providers` 配置自动注册。

### 模型故障转移(免费模型排队也不怕)

设置页的"模型顺序"是一个**有序多选链**:按顺序尝试,某个模型超过"单模型等待"(默认 90 秒,0 关闭)没有任何输出就杀掉换下一个;整条链共用"允许等待"预算(默认 300 秒),全部模型都失败或预算耗尽时,插件直接把失败结论(含每个模型的尝试记录)通过完成通知上报主任务。工具行与事件流会记录每次切换,`free_subagent_status` 也能看到。

### 进度随时可查(像本地子任务)

- **对话内实时面板**:委派工具行显示状态徽章(运行中/已完成/出错)、计时、子代理动作流(思考 ◎、工具调用 ⚙、输出 ▸),点击展开完整过程,运行中每 2 秒刷新;结束后面板给出 `qodercli --resume <id>` 命令,可在 CLI 回看/继续该子会话。
- **父 agent 查询工具 `free_subagent_status`**:随时可查任意委派的进度——省略 `run_id` 列出最近运行及最新动作,传 `run_id`(`started subagent <id>` 里的那个)返回事件转录。
- **斜杠指令 `/free_subagent_status`**:直接在输入框查进度,结果立即回显(不经过模型)——`/free_subagent_status` 列出最近运行,`/free_subagent_status <run_id>` 查看某次运行的详细事件。
- **卡住自动提醒**:子代理超过设定时间(默认 90 秒,设置页"卡住提醒"可调,0 关闭)没有任何输出时,插件会主动唤醒父 agent 并送去一条警戒通知(含运行 id 与建议动作),同时工具行显示红色的"静默 Ns"、事件流记录 `no output ... — warned the parent`。免费模型排队、网络断了、CLI 挂住都不会再让主任务无限干等。

## Agent 预设:自由子代理

安装插件即注册一个 **"自由子代理"** Agent 预设(设置 → Agent 预设)。选它开会话后,dsh 本地模型扮演**子代理指挥官**:

- 规划任务、拆成可独立验收的子任务
- 按性价比把子任务分派给 `qoder` / `qodercn` / `opencode` / `pi` / `codebuddy`(独立任务并行、有依赖的串行)
- 用 `free_subagent_status` 随时查进度,静默/失败时换模型或改派
- 汇总产出、独立核验关键结论,再向用户汇报分工与风险

预设沿用标准模式的全部工具(fs/终端/todo/计划/压缩/网页等),只替换了 persona 与工作流。

## 设置页

web 版 dsh 的 **设置 → Qoder 子代理** 页面可以直接:

- 检测每个后端 CLI 是否存在、版本号、模型列表(走 `/api/qoder-subagent/probe`,5 分钟缓存,可手动刷新)
- 切换默认模型、思考程度(`--reasoning-effort`)、上下文大小(`--context-window`)、权限模式、超时、CLI 路径

写回即生效(host 配置热更新),无需改 YAML。

## 配置

在 profile 里覆盖 `dsh-subagent` 节点的 `config`(`providers` 数组,每项一个后端):

| 字段 | 默认 | 说明 |
|---|---|---|
| `name` | 必填 | 提供方名,须与 patch 里 `dsh-tool-subagent` 的 `provider` 一致 |
| `driver` | `qoder-json` | 传输驱动:`qoder-json` / `codebuddy-json` / `opencode-json` / `pi-json` |
| `binary` | 自动探测 | CLI 绝对路径;内置名(qoder/qodercn)可省略 |
| `permissionMode` | `bypass_permissions` | headless 无法弹权限确认,故默认放行 |
| `model` | 沿用 CLI 默认 | 强制模型 id;留空用 CLI 默认(如免费模型) |
| `reasoningEffort` | `auto` | `auto/none/low/medium/high/xhigh/max/ultracode` |
| `contextWindow` | CLI 默认 | 正整数 token 数 |
| `timeoutSeconds` | 无上限 | 单次委派墙钟上限 |
| `extraArgs` | `[]` | 追加的 CLI 参数 |

默认 `providers` 为 `[{name:"qoder"},{name:"qodercn"}]`。

## 加更多后端

1. 在 `Config` 默认或 profile 配置里加一个 `providers` 条目(不同 `name`)。
2. 在 `cordis.patch.yml` 里加一个对应的 `@deepseek-ai/dsh-tool-subagent` 节点(`provider` = 那个 name,`toolName` 唯一)。
3. 若该 CLI 不是 `stream-json` 协议,再实现一个新 `driver` 类并在 `apply` 里分发。

## 限制

- 一次性执行:不支持续话、结构化输出、model-selection(外部后端能力全部关闭)。
- 子代理不继承父上下文,委派任务需自带上下文。
