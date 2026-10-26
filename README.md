# dsh-subagent

把外部 CLI 子代理(Qoder、QoderCN、Codex、Claude、OpenCode、Pi、CodeBuddy,可继续扩展)注册成 dsh(DeepSeek Harness)的**子代理提供方**,让父 agent 通过委派工具把任务交给这些 CLI 跑,消耗各自的订阅/API 额度。

每个后端都是**一次性执行**:插件 spawn CLI 子进程,提示词经 stdin 送入,读取各自的 JSON 事件流(`qoder-json` / `claude-json` / `codex-json` / `codebuddy-json` / `opencode-json` / `pi-json` 驱动),收敛到最终结果。子代理**看不到父会话上下文**,所以委派任务里要自带完整上下文。

## 安装

```sh
dsh plugin --profile web add github:1373700184/dsh-subagent
```

装好后插件的 `cordis.patch.yml` 会向 profile 树插入提供方 `dsh-subagent` 和 Agent 预设;委派工具、斜杠指令随**已启用的后端**动态挂载(启用几个后端就有几个工具/指令)。重启 dsh 生效。

前置条件:对应 CLI 已安装且已登录——`qodercli`(`~/.qoder/bin/qodercli/`)、`qoderclicn`(`~/.qoder-cn/bin/qoderclicn/`)、`codex`(npm 全局)、`claude`(npm 全局,沿用 `~/.claude/settings.json` 的模型/网关配置;设置页的模型列表也从这里读取)、`opencode`(`~/.opencode/bin/`)、`pi`(`~/.pi/agent/`,优先通过 node 直接启动受管安装的 CLI,避免 Windows 弹终端窗口)、`codebuddy`(npm 全局 `@tencent-ai/codebuddy-code`,通过 node 启动)。上述目录都找不到时,会按 PATH 搜索命令名(`qodercli` / `qoderclicn` / `opencode` / `pi` / `codebuddy` / `codex` / `claude`);CLI 路径里填裸命令名也会走 PATH。

## 使用

在 dsh 会话里让父 agent 调用工具即可,例如:

```
用 qoder 子代理:在这个仓库里找出所有 TODO 注释并汇总
```

父 agent 会调用 `qoder` 工具,插件 spawn `qodercli -p ...` 并返回子代理的最终文本。`qodercn` 工具走国内版 CLI。

### 斜杠指令

输入框里直接敲:

```
/sub_qoder 统计当前目录每个顶层目录的文件数并汇总
/sub_qodercn 把 README 翻成英文
/sub_codex 检查这个仓库最近的改动
```

所有委派指令统一使用 `sub_` 前缀(`/sub_<后端名>`),查进度用 `/sub_agent_status`。指令是**快捷方式**:把任务作为消息交给当前会话,由 agent 调用对应工具发起委派——所以实时进度面板、扣费显示、完成通知与普通工具调用完全一致。指令名跟随 `providers` 配置自动注册。

### 模型故障转移(免费模型排队也不怕)

设置页的"模型顺序"是一个**有序多选链**:按顺序尝试,某个模型超过"单模型等待"(默认 90 秒,0 关闭)没有任何输出就杀掉换下一个;整条链共用"允许等待"预算(默认 300 秒),全部模型都失败或预算耗尽时,插件直接把失败结论(含每个模型的尝试记录)通过完成通知上报主任务。工具行与事件流会记录每次切换,`sub_agent_status` 也能看到。

### 崩溃恢复(重启后续上子代理)

子代理进程以 **detached + 输出落盘** 方式启动,不依赖 dsh 的管道:

- dsh 崩溃不会打断正在跑的 CLI,也不会丢日志(`$DSH_HOME/storages/dsh-subagent/runs/`)
- Windows 下 CLI 通过隐藏控制台包装启动:子代理执行的 shell 命令不会弹黑框,同时保持 detached 的崩溃存活能力
- dsh 重启后插件自动重新接管:恢复运行记录与完整过程;仍在跑的继续跟踪,已在停机期间完成的直接补全状态
- 父会话在线时会收到迟到的完成通知(含结果摘要),同一结果只通知一次;用 `/sub_agent_status` 可随时查看

### 进度随时可查(像本地子任务)

- **对话内实时面板**:委派工具行显示状态徽章(运行中/已完成/出错)、计时、子代理动作流(思考 ◎、工具调用 ⚙、输出 ▸),点击展开完整过程,运行中每 2 秒刷新;结束后面板给出对应 CLI 的续接命令(如 `qodercli --resume <id>`、`codex resume <id>`、`claude --resume <id>`),可回看/继续该子会话。
- **父 agent 查询工具 `sub_agent_status`**:随时可查任意委派的进度——省略 `run_id` 列出最近运行及最新动作,传 `run_id`(`started subagent <id>` 里的那个)返回事件转录。
- **斜杠指令 `/sub_agent_status`**:直接在输入框查进度,结果立即回显(不经过模型)——`/sub_agent_status` 列出最近运行,`/sub_agent_status <run_id>` 查看某次运行的详细事件。
- **卡住自动提醒**:子代理超过设定时间(默认 90 秒,设置页"卡住提醒"可调,0 关闭)没有任何输出时,插件会主动唤醒父 agent 并送去一条警戒通知(含运行 id 与建议动作),同时工具行显示红色的"静默 Ns"、事件流记录 `no output ... — warned the parent`。免费模型排队、网络断了、CLI 挂住都不会再让主任务无限干等。

## Agent 预设:自由子代理

安装插件即注册一个 **"自由子代理"** Agent 预设(设置 → Agent 预设)。选它开会话后,dsh 本地模型扮演**子代理指挥官**:

- 规划任务、拆成可独立验收的子任务
- 按设置中的调度模式(优先启动 / 平均分配)把子任务分派给 `qoder` / `qodercn` / `codex` / `claude` / `opencode` / `pi` / `codebuddy`(独立任务并行、有依赖的串行),并遵守每个后端的并发上限
- 用 `sub_agent_status` 随时查进度,静默/失败时换模型或改派
- 汇总产出、独立核验关键结论,再向用户汇报分工与风险

预设沿用标准模式的全部工具(fs/终端/todo/计划/压缩/网页等),只替换了 persona 与工作流。

## 设置页

web 版 dsh 的 **设置 → 自由子代理** 页面可以直接:

- 检测每个后端 CLI 是否存在、版本号、模型列表(走 `/api/qoder-subagent/probe`,5 分钟缓存,可手动刷新)
- 切换默认模型、思考程度、上下文大小、权限模式、超时、CLI 路径(插件按各 CLI 的参数差异自动转换)
- 设置全局调度模式(优先启动 / 平均分配)、每个后端的并发上限,并用卡片上的 ↑↓ 调整优先顺序
- 并发上限由插件强制执行:优先模式下满了会自动转给下一个后端,全部满才等待;平均模式自动选择当前任务最少的后端。崩溃重启后遗留运行仍占位,状态/工具行会显示实际执行的后端
- CLI 有新版本时卡片显示“更新 CLI vX”:Qoder/QoderCN 用 `update --check` 检测,Codex/Claude/CodeBuddy/Pi 查 npm 最新版;有运行中的子代理时会拒绝更新

写回即生效(host 配置热更新),无需改 YAML。

## 配置

在 profile 里覆盖 `dsh-subagent` 节点的 `config`(`providers` 数组,每项一个后端):

| 字段 | 默认 | 说明 |
|---|---|---|
| `name` | 必填 | 提供方名,须与 patch 里 `dsh-tool-subagent` 的 `provider` 一致 |
| `driver` | `qoder-json` | 传输驱动:`qoder-json` / `claude-json` / `codex-json` / `codebuddy-json` / `opencode-json` / `pi-json` |
| `binary` | 自动探测 | CLI 绝对路径或 PATH 中的命令名;内置后端可省略 |
| `permissionMode` | `bypass_permissions` | headless 无法弹权限确认,故默认放行 |
| `model` | 沿用 CLI 默认 | 强制模型 id;留空用 CLI 默认(如免费模型) |
| `reasoningEffort` | `auto` | `auto/none/low/medium/high/xhigh/max/ultracode` |
| `contextWindow` | CLI 默认 | 正整数 token 数 |
| `timeoutSeconds` | 无上限 | 单次委派墙钟上限 |
| `extraArgs` | `[]` | 追加的 CLI 参数 |
| `maxConcurrency` | `2` | 同时最多执行几个该后端子代理;超出后 FIFO 排队 |

默认 `providers` 包含全部内置后端;实际启用哪些由 profile 的 `providers` 列表决定。全局字段 `scheduleMode` 控制调度:`priority`(从所调用的后端开始,按 `providers` 顺序自动溢出到下一个有空位的后端)或 `balanced`(插件自动选择当前任务最少者)。调度在插件层完成,工具名只是入口;状态与工具行会显示实际执行的后端。

## 加更多后端

1. 在设置页顶部的“选择要启用的后端…”下拉里选内置后端,或选“添加自定义后端…”填写名称 / 驱动 / CLI 路径。
2. 工具的挂载、斜杠指令和 Agent 预设里的后端说明会自动跟随已启用列表,无需改 YAML。
3. 若该 CLI 不是现有协议,再实现一个新 `driver` 并在 `DRIVERS` 里注册。
4. Windows 下自定义后端优先指向原生 `.exe`;npm 的 `.cmd` 包装脚本在后台分离启动时可能没有输出。

## 限制

- 一次性执行:不支持续话、结构化输出、model-selection(外部后端能力全部关闭)。
- 子代理不继承父上下文,委派任务需自带上下文。
