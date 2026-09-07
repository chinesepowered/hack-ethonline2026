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
const headers = { authorization: `Bearer ${key}`, "content-type": "application/json" };

const res = await fetch(`https://api.render.com/v1/services/${service}/deploys`, { method: "POST", headers, body: JSON.stringify({ clearCache: "do_not_clear" }) });
if (!res.ok) throw new Error(`deploy request failed: ${res.status} ${await res.text()}`);
const deploy = await res.json();
console.log(`deploy ${deploy.id} started (${(deploy.commit?.id ?? "").slice(0, 7)})`);

for (;;) {
  await new Promise((r) => setTimeout(r, 20_000));
  const d = await (await fetch(`https://api.render.com/v1/services/${service}/deploys/${deploy.id}`, { headers })).json();
  process.stdout.write(`  ${new Date().toLocaleTimeString()} ${d.status}\n`);
  if (d.status === "live") break;
  if (/failed|canceled|deactivated/.test(d.status)) throw new Error(`deploy ended with status ${d.status}`);
}
const svc = await (await fetch(`https://api.render.com/v1/services/${service}`, { headers })).json();
const url = svc.serviceDetails?.url;
console.log(`✓ live at ${url}`);
if (url) console.log(await (await fetch(`${url}/health`)).text());
