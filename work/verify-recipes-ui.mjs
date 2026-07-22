import { readFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

function readAdminPassword() {
  try {
    const envText = readFileSync(".env.local", "utf8");
    const line = envText
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().startsWith("ADMIN_PASSWORD="));
    if (!line) return "commandloop-admin";
    return line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  } catch {
    return "commandloop-admin";
  }
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});

await page.goto("http://127.0.0.1:8000/admin/login", { waitUntil: "networkidle" });
await page.locator("#password").fill(readAdminPassword());
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/admin", { timeout: 10_000 });

await page.goto("http://127.0.0.1:8000/admin/recipes", { waitUntil: "networkidle" });
await expect(page.getByRole("button", { name: /Create Recipe/ })).toBeVisible();
await expect(page.getByRole("button", { name: /Import Prompts/ })).toBeVisible();
await expect(page.getByRole("button", { name: /Existing Recipes/ })).toBeVisible();
await expect(page.getByRole("button", { name: /Prompts for Selected Recipe/ })).toBeVisible();

await expect(page.getByPlaceholder("Recipe name")).toHaveCount(0);
await page.getByRole("button", { name: /Create Recipe/ }).click();
await expect(page.getByPlaceholder("Recipe name")).toBeVisible();

await page.getByRole("button", { name: /Import Prompts/ }).click();
await expect(page.locator('textarea[name="json"]')).toHaveCount(0);
await expect(page.locator('input[name="jsonFile"][type="file"]')).toBeVisible();

await expect(page.getByText("Overview (dataset card)").first()).toBeVisible();
await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

await page.getByRole("button", { name: "Edit" }).first().click();
await expect(page.getByRole("button", { name: "Save prompt" }).first()).toBeVisible();

const firstDraftLink = page.getByRole("link", { name: "Edit draft" }).first();
await firstDraftLink.click();
await page.waitForURL("**/admin/recipes/**/edit", { timeout: 10_000 });
await expect(page.getByText("Prompt inventory")).toBeVisible();
await expect(page.getByRole("button", { name: "Edit" }).first()).toBeVisible();

console.log(JSON.stringify({ ok: true, errors }, null, 2));
await browser.close();
