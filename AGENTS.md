# AGENTS.md

## 主动性

不要等用户逐条提醒。能安全完成的后续动作直接做完：

- 改完代码后主动构建、测试（涉及 UI 就做真实浏览器验证）、更新本地 profile、用中文提交信息提交并推送、清理临时文件，最后简短汇报。
- 发现配置、文档、依赖或运行实例需要同步时，直接处理或给出明确结论，不要反问“要不要”。
- 破坏性、不可逆或影响共享状态的操作（结束进程、重启用户应用、删除数据、force push）仍先确认。

## 完成改动后的固定动作

本仓库是本地 dsh 插件 `dsh-subagent`。每次修改完成后，默认自动执行以下动作，不要再询问用户是否更新本地插件。

1. 重新构建客户端：

```sh
node scripts/build-client.mjs
```

2. 更新本地 dsh 的 web profile：

```sh
dsh plugin --profile web update dsh-subagent
```

如果 `~/.dsh/profiles/web/node_modules/dsh-subagent/lib/index.js` 中仍没有 `BUILTIN_PROVIDERS`，说明 pnpm 没有刷新 GitHub 依赖，改为强制重装：

```sh
dsh plugin --profile web remove dsh-subagent
dsh plugin --profile web add github:1373700184/dsh-subagent
```

3. 更新本地 dsh 的 headless profile（该 profile 使用本地 tgz）：

```sh
rm -f dsh-subagent-*.tgz
TGZ=$(npm pack --silent | tail -n1)
dsh plugin --profile headless remove dsh-subagent
dsh plugin --profile headless add "file:C:/Users/a1373/DshSubAgent/$TGZ"
```

pnpm 对相同的 `file:` 依赖可能提示 “Already up to date” 而不替换文件，因此必须先 remove 再 add。

4. 校验两个 profile 都已装上新代码：

```sh
grep -c BUILTIN_PROVIDERS ~/.dsh/profiles/{web,headless}/node_modules/dsh-subagent/lib/index.js
grep -c 添加内置后端 ~/.dsh/profiles/{web,headless}/node_modules/dsh-subagent/lib/client.js
dsh --profile web --dump-config | grep -c subagentBackends
dsh --profile headless --dump-config | grep -c subagentBackends
```

以上命令的期望结果均非 0。

5. 如果用户正在运行 dsh，提醒重启对应实例使插件生效；不要自行结束用户进程。

`desktop` profile 未安装此插件，不需要更新。

## 代码约定

- 所有人工注释一律使用中文，包括构建产物中的注释；构建脚本会自动过滤纯英文行注释。
- Git 提交信息一律使用中文。
- 涉及设置页等功能改动时，先做真实浏览器 UI 测试，再更新本地插件。
