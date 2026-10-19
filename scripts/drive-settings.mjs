import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2];
const shots = "shots";
mkdirSync(shots, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
	executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
	headless: true,
	args: ["--no-first-run"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => { const t = m.text(); if (/qoder|subagent|slot|configForm|Error/i.test(t)) console.log(`[console.${m.type()}]`, t.slice(0, 300)); });

await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
await wait(3000);

const clickText = async (text) => page.evaluate((t) => {
	const els = [...document.querySelectorAll("button,[role=button],[role=menuitem],a,div,span,li")];
	const hit = els.find((el) => (el.textContent || "").trim() === t && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
	if (hit) hit.click();
	return Boolean(hit);
}, text);

console.log("open account menu:", await page.evaluate(() => { const b = document.querySelector('[aria-label="账号菜单"]'); if (b) { b.click(); return true; } return false; }));
await wait(1200);
await page.screenshot({ path: `${shots}/2-account-menu.png` });

console.log("click 设置:", await clickText("设置"));
await wait(2000);
await page.screenshot({ path: `${shots}/3-settings.png` });

console.log("click Qoder 子代理:", await clickText("Qoder 子代理"));
await wait(4000);
await page.screenshot({ path: `${shots}/4-qoder-section.png` });

const text = await page.evaluate(() => {
	const dlg = document.querySelector('[role=dialog]') ?? document.body;
	return dlg.innerText.slice(0, 3500);
});
console.log("---- section text ----");
console.log(text);
await browser.close();
