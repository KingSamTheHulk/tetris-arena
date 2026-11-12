import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getState, recordResult, resetState } from "./lib/store.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function serveStatic(pathname, res) {
  let relative = "/";
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  if (relative === "/") relative = "/index.html";
  const filePath = path.join(PUBLIC_DIR, path.normalize(relative));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    const isText = type.startsWith("text/") || type.endsWith("json") || type.endsWith("javascript");
    res.writeHead(200, {
      "content-type": isText ? `${type}; charset=utf-8` : type,
      "cache-control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/state" && req.method === "GET") {
      sendJson(res, 200, await getState());
      return;
    }

    if (url.pathname === "/api/result" && req.method === "POST") {
      const payload = await readBody(req);
      if (payload.winner !== "player" && payload.winner !== "ai") {
        sendJson(res, 400, { error: "winner must be 'player' or 'ai'" });
        return;
      }
      const state = await recordResult({
        winner: payload.winner,
        playerLines: payload.playerLines,
        aiLines: payload.aiLines,
      });
      sendJson(res, 200, state);
      return;
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      sendJson(res, 200, await resetState());
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: "method not allowed" });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: "internal error" });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Tetris Arena running at http://${HOST}:${PORT}`);
  console.log("Level 15 gravity · first to 15 lines · ratings start at 100");
});
