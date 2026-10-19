# dsh-subagent

把外部订阅版 CLI(Qoder / QoderCN,以后可加更多)注册成 dsh(DeepSeek Harness)的**子代理提供方**,让父 agent 通过委派工具把任务交给这些 CLI 跑,消耗各自的订阅额度。

每个后端都是**一次性执行**:插件 spawn CLI 子进程,提示词经 stdin 送入,读取 Claude 风格的 `stream-json` 事件流,收敛到最终结果。子代理**看不到父会话上下文**,所以委派任务里要自带完整上下文。

## 安装

```sh
dsh plugin --profile web add github:1373700184/dsh-subagent
```

装好后插件的 `cordis.patch.yml` 会向 profile 树插入三个节点:提供方 `dsh-subagent`,以及两个委派工具 `qoder`、`qodercn`(各绑一个 `@deepseek-ai/dsh-tool-subagent` 实例)。重启 dsh 生效。

前置条件:对应 CLI 已安装且已登录(`qodercli` 在 `~/.qoder/bin/qodercli/`,`qoderclicn` 在 `~/.qoder-cn/bin/qoderclicn/`)。

## 使用

在 dsh 会话里让父 agent 调用工具即可,例如:

```
用 qoder 子代理:在这个仓库里找出所有 TODO 注释并汇总
```

父 agent 会调用 `qoder` 工具,插件 spawn `qodercli -p ...` 并返回子代理的最终文本。`qodercn` 工具走国内版 CLI。

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
| `driver` | `qoder-json` | 传输驱动;目前仅实现 `qoder-json` |
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
