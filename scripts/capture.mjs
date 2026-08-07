import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(root, "output");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function argument(name, fallback = "") {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
}
function safeName(value) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "region";
}
async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Local Cesium server did not start: ${url}`);
}

async function main() {
  const points = argument("points");
  if (!points) throw new Error("Use --points=\"latitude,longitude;latitude,longitude\"");
  const buffer = Math.max(0, Math.min(100000, Number(argument("buffer", "500"))));
  const width = Math.max(640, Math.min(7680, Number(argument("width", "3840"))));
  const height = Math.max(480, Math.min(4320, Number(argument("height", "2160"))));
  const name = safeName(argument("name", "region"));
  const noServer = process.argv.includes("--no-server");
  const baseUrl = process.env.CESIUM_CAPTURE_URL || "http://127.0.0.1:3300/";
  let server;
  if (!noServer) {
    server = spawn(process.execPath, ["server.mjs"], {
      cwd:root, env:{ ...process.env, PORT:"3300" }, stdio:["ignore", "pipe", "pipe"],
    });
  }
  try {
    await waitForServer(baseUrl);
    mkdirSync(outputRoot, { recursive:true });
    const browser = await chromium.launch({
      headless:true, executablePath:chrome,
      args:["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=metal", "--hide-scrollbars"],
    });
    const page = await browser.newPage({ viewport:{ width, height }, deviceScaleFactor:1 });
    page.on("console", (message) => {
      if (message.type() === "error" && !message.text().includes("404")) process.stderr.write(`Browser: ${message.text()}\n`);
    });
    const query = new URLSearchParams({
      capture:"1", points, buffer:String(buffer), width:String(width), height:String(height), name,
    });
    await page.goto(`${baseUrl}?${query}`, { waitUntil:"domcontentloaded", timeout:60000 });
    await page.waitForFunction(() => window.__CESIUM_CAPTURE_READY === true, undefined, { timeout:180000 });
    await page.waitForTimeout(3500);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = resolve(outputRoot, `${name}_top_view_${width}x${height}_${timestamp}.png`);
    await page.screenshot({ path:outputPath, type:"png" });
    await browser.close();
    console.log(`CAPTURE=${outputPath}`);
  } finally {
    if (server) {
      server.kill("SIGTERM");
      await once(server, "close").catch(() => {});
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
