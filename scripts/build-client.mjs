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

const code = await readFile("lib/client.raw.cjs", "utf8");
await rm("lib/client.raw.cjs");
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
