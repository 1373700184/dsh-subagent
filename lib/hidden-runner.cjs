const { spawn } = require("node:child_process");
const { openSync } = require("node:fs");
const path = require("node:path");

// 以隐藏控制台托管 CLI:本进程保持 detached 以便 dsh 崩溃后继续运行,
// PowerShell 为 CLI 创建不可见控制台,避免其 shell 子进程弹黑框。
const configPath = process.argv[2];
const errPath = process.argv[3];
if (!configPath) process.exit(2);
let errFd = "ignore";
try {
	if (errPath) errFd = openSync(errPath, "a");
} catch {}
const child = spawn("powershell.exe", [
	"-NoProfile",
	"-ExecutionPolicy", "Bypass",
	"-File", path.join(__dirname, "hidden-runner.ps1"),
	"-ConfigPath", configPath,
], { windowsHide: true, stdio: ["ignore", "ignore", errFd] });
child.on("error", () => process.exit(1));
child.on("exit", (code) => process.exit(code ?? 0));
