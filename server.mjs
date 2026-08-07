import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(root, "public");
const outputRoot = join(root, "output");
const port = Number(process.env.PORT || 3300);
await mkdir(outputRoot, { recursive: true });

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const split = line.indexOf("=");
      return [line.slice(0, split).trim(), line.slice(split + 1).trim().replace(/^(['"])(.*)\1$/, "$2")];
    }));
}

async function readToken() {
  if (process.env.CESIUM_ION_TOKEN) return process.env.CESIUM_ION_TOKEN;
  if (process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN) return process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;
  for (const path of [
    join(root, ".env.local"),
  ]) {
    try {
      const values = parseEnv(await readFile(path, "utf8"));
      const token = values.CESIUM_ION_TOKEN || values.NEXT_PUBLIC_CESIUM_ION_TOKEN;
      if (token) return token;
    } catch {}
  }
  return "";
}

const token = await readToken();
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function runCapture(config) {
  return new Promise((resolveCapture, rejectCapture) => {
    const args = [
      join(root, "scripts", "capture.mjs"),
      "--no-server",
      `--points=${config.points}`,
      `--buffer=${config.buffer}`,
      `--width=${config.width}`,
      `--height=${config.height}`,
      `--name=${config.name || "region"}`,
    ];
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: { ...process.env, CESIUM_CAPTURE_URL: `http://127.0.0.1:${port}/` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      if (code !== 0) rejectCapture(new Error(stderr || stdout || `Capture exited ${code}`));
      else {
        const marker = stdout.trim().split(/\r?\n/).findLast((line) => line.startsWith("CAPTURE="));
        if (!marker) rejectCapture(new Error("Capture path was not reported"));
        else resolveCapture(marker.slice("CAPTURE=".length));
      }
    });
  });
}

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  if (url.pathname === "/config.js") {
    response.writeHead(200, { "Content-Type": mime[".js"], "Cache-Control": "no-store" });
    response.end(`window.CESIUM_TOP_VIEW_CONFIG=${JSON.stringify({ ionToken: token })};`);
    return;
  }
  if (url.pathname === "/capture" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const width = Math.max(640, Math.min(7680, Number(body.width) || 3840));
      const height = Math.max(480, Math.min(4320, Number(body.height) || 2160));
      const buffer = Math.max(0, Math.min(100000, Number(body.buffer) || 0));
      const points = String(body.points || "").slice(0, 20000);
      const name = String(body.name || "region").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "region";
      const outputPath = await runCapture({ points, buffer, width, height, name });
      const filename = outputPath.split("/").pop();
      response.writeHead(200, { "Content-Type": mime[".json"], "Cache-Control": "no-store" });
      response.end(JSON.stringify({ filename, downloadUrl: `/output/${filename}` }));
    } catch (error) {
      response.writeHead(400, { "Content-Type": mime[".json"] });
      response.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  let path;
  if (url.pathname.startsWith("/output/")) {
    const filename = url.pathname.slice("/output/".length);
    if (!/^[a-z0-9_.-]+$/i.test(filename)) {
      response.writeHead(400).end("Invalid filename");
      return;
    }
    path = resolve(outputRoot, filename);
  } else {
    const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    path = normalize(join(publicRoot, relative));
    if (!path.startsWith(publicRoot)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
  }
  try {
    const info = await stat(path);
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": "no-cache",
    });
    createReadStream(path).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Cesium top-view capture utility: http://localhost:${port}`);
  if (!token) console.warn("Cesium ion token is missing.");
});
