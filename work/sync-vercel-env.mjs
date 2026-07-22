import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const defaultKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "OPENAI_API_KEY",
];
const keys = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultKeys;

function parseEnv(text) {
  const result = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    result.set(key, value);
  }
  return result;
}

const values = parseEnv(readFileSync(".env.local", "utf8"));

function redact(text) {
  let output = text;
  for (const key of keys) {
    const value = values.get(key);
    if (value) output = output.split(value).join("[redacted]");
  }
  return output;
}

async function addEnv(key) {
  const value = values.get(key);
  if (!value) throw new Error(`Missing ${key} in .env.local`);

  const child = spawn("npx", ["vercel@latest", "env", "add", key, "production"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stdin.write(`${value}\n`);
  child.stdin.end();

  const code = await new Promise((resolve) => child.on("close", resolve));
  process.stdout.write(redact(output));
  if (code !== 0) throw new Error(`vercel env add failed for ${key}`);
}

for (const key of keys) {
  console.log(`Adding ${key} to production...`);
  await addEnv(key);
}
