# AGENTS.md

## 主动性

不要等用户逐条提醒。能安全完成的后续动作直接做完：

- 改完代码后主动升补丁版本号、构建、测试（涉及 UI 就做真实浏览器验证）、更新本地 profile、重启 dsh、用中文提交信息提交并推送、清理临时文件，最后简短汇报。
- 发现配置、文档、依赖或运行实例需要同步时，直接处理或给出明确结论，不要反问“要不要”。
- 重启 dsh web 属于固定收尾动作，直接执行；结束 DshManger 本身、删除数据、force push 等仍需确认。

## 完成改动后的固定动作

本仓库是本地 dsh 插件 `dsh-subagent`。每次修改完成后，默认自动执行以下动作，不要再询问用户。

1. 升补丁版本号（例如 `0.9.0` → `0.9.1`），不要复用旧版本号。

2. 重新构建客户端：

```sh
node scripts/build-client.mjs
```

3. 重新生成本地 tgz：

```sh
rm -f dsh-subagent-*.tgz
TGZ=$(npm pack --silent | tail -n1)
```

4. 更新 `web` 和 `headless` 两个 profile（两者都使用本地 tgz）：

```sh
for p in web headless; do
  dsh plugin --profile $p remove dsh-subagent
  dsh plugin --profile $p add "file:C:/Users/a1373/DshSubAgent/$TGZ"
done
```

pnpm 对相同的 `file:` 依赖可能提示 “Already up to date” 而不替换文件，因此必须先 remove 再 add。

5. 校验两个 profile 的版本和内容：

```sh
for p in web headless; do
  grep -m1 '"version"' ~/.dsh/profiles/$p/node_modules/dsh-subagent/package.json
  grep -c BUILTIN_PROVIDERS ~/.dsh/profiles/$p/node_modules/dsh-subagent/lib/index.js
  grep -c 添加内置后端 ~/.dsh/profiles/$p/node_modules/dsh-subagent/lib/client.js
  dsh --profile $p --dump-config | grep -c subagentBackends
done
```

以上结果必须与刚打的版本号一致，且计数均非 0。

6. 用 DshManger 命令行重启 dsh web：

- 执行 `"D:/DshManger/DshManger.exe" --restart` 重启；随后用 `--status --json` 校验 `running:true`、`managed:true`，并确认 `127.0.0.1:3080` 处于监听状态。
- 若提示“外部启动的 dsh 正在运行，无法重启”，依次执行 `--stop`、`--run`，不要自己结束进程。
- **不要结束 `DshManger.exe`，也不要自己用 cmd 或 Start-Process 再起一个 dsh**：DshManger 启动的进程树应只有 cmd → node，避免在用户桌面上留下多余的常驻 `cmd.exe` 窗口。
- 仅当 DshManger 不可用时，才直接以 node 启动（不经过 cmd），并用 WMI `Win32_Process.Create` 脱离当前进程树启动 `node "C:\Users\a1373\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\bin.js" web`。
- 校验 `127.0.0.1:3080` 重新进入监听状态，且进程树符合上述结构。

`desktop` profile 未安装此插件，不需要更新。

## 代码约定

- 所有人工注释一律使用中文，包括构建产物中的注释；构建脚本会自动过滤纯英文行注释。
- Git 提交信息一律使用中文。
- 涉及设置页等功能改动时，先做真实浏览器 UI 测试，再更新本地插件。
