import { build } from "esbuild";
import { readFile, writeFile, rm } from "node:fs/promises";

await build({
	entryPoints: ["src/client.js"],
	outfile: "lib/client.raw.cjs",
	bundle: true,
	format: "cjs",
	platform: "browser",
	external: ["react"],
	target: "es2022",
	charset: "utf8",
});

const raw = await readFile("lib/client.raw.cjs", "utf8");
await rm("lib/client.raw.cjs");

// 构建产物只保留中文行注释，去掉 esbuild 自动生成的英文说明。
const code = raw
	.split("\n")
	.filter((line) => {
		const trimmed = line.trimStart();
		return !(trimmed.startsWith("//") && !/[\u4e00-\u9fff]/.test(trimmed));
	})
	.join("\n");

await writeFile(
	"lib/client.js",
	`window.__ModuleLoader__.load({
	id: "dsh-subagent",
	factory: (require) => {
		var module = { exports: {} };
		(function (module, exports) {
${code}		})(module, module.exports);
		return module.exports;
	},
});
`,
);
console.log("built lib/client.js");
