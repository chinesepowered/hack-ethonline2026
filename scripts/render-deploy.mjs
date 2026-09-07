#!/usr/bin/env node
/**
 * Trigger a Render deploy of the latest commit on main and wait for it to go live.
 * Render's auto-deploy needs its GitHub app; this workspace uses the API instead.
 * Usage: pnpm render:deploy      (env: RENDER_API_KEY, RENDER_SERVICE_ID in .env)
 */
import { readFileSync } from "node:fs";

const envText = (() => {
  try {
    return readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return "";
  }
})();
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const key = process.env.RENDER_API_KEY;
const service = process.env.RENDER_SERVICE_ID;
if (!key || !service) throw new Error("Set RENDER_API_KEY and RENDER_SERVICE_ID in .env");
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json", accept: "application/json" };
const API = "https://api.render.com/v1";

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Reuse an in-flight deploy if one exists; otherwise start one.
const recent = await api("GET", `/services/${service}/deploys?limit=1`);
let deploy = recent[0]?.deploy;
if (deploy && /in_progress|created|queued/.test(deploy.status)) {
  console.log(`deploy ${deploy.id} already ${deploy.status} (${(deploy.commit?.id ?? "").slice(0, 7)}) — waiting for it`);
} else {
  deploy = await api("POST", `/services/${service}/deploys`, { clearCache: "do_not_clear" });
  console.log(`deploy ${deploy.id} started (${(deploy.commit?.id ?? "").slice(0, 7)})`);
}

for (;;) {
  await sleep(20_000);
  const d = await api("GET", `/services/${service}/deploys/${deploy.id}`);
  console.log(`  ${new Date().toLocaleTimeString()} ${d.status}`);
  if (d.status === "live") break;
  if (/failed|canceled|deactivated/.test(d.status)) throw new Error(`deploy ended with status ${d.status}`);
}

const svc = await api("GET", `/services/${service}`);
const url = svc.serviceDetails?.url;
console.log(`✓ live at ${url}`);
if (url) console.log(await (await fetch(`${url}/health`)).text());
process.exit(0);
