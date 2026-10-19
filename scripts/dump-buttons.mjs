import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.argv[2];
const shots = "shots";
mkdirSync(shots, { recursive: true });

const browser = await puppeteer.launch({
	executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	headless: true,
	args: ["--no-first-run"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const btns = await page.evaluate(() => [...document.querySelectorAll("button,[role=button],a")].map((e) => ((e.textContent || "").trim().slice(0, 16)) + " |aria:" + (e.getAttribute("aria-label") || "") + " |title:" + (e.getAttribute("title") || "")));
writeFileSync(`${shots}/buttons.txt`, btns.join("\n"));
console.log("buttons:", btns.length);
console.log(btns.filter((b) => /设置|setting/i.test(b)).join("\n") || "(no 设置 match)");
await browser.close();
