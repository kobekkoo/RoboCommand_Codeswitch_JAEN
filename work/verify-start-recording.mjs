import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await page.goto("http://127.0.0.1:8000/", { waitUntil: "networkidle" });
await page.getByRole("link", { name: /^Start recording$/ }).first().click();
await page.waitForURL("**/consent", { timeout: 10_000 });
await page.waitForLoadState("networkidle");

const title = await page.locator("h1").first().textContent();
console.log(JSON.stringify({ url: page.url(), title, errors }, null, 2));

await browser.close();
