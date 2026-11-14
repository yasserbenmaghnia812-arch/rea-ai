import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 10000);
const REA_PORT = Number(process.env.REA_PORT || 8766);
const MCP_BEARER_TOKEN = process.env.MCP_BEARER_TOKEN || "";
if (MCP_BEARER_TOKEN.length < 32) {
  throw new Error("MCP_BEARER_TOKEN must be configured with at least 32 characters; refusing to start an unprotected gateway.");
}

function hasValidBearer(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(MCP_BEARER_TOKEN);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const rea = spawn("rea", ["mcp", "--http", "--host", "127.0.0.1", "--port", String(REA_PORT)], {
  env: { ...process.env, MCP_HOST: "127.0.0.1", MCP_PORT: String(REA_PORT) },
  stdio: ["ignore", "ignore", "inherit"]
});

let reaExited = false;
let shuttingDown = false;

rea.on("exit", (code, signal) => {
  reaExited = true;
  console.error("REA exited", code, signal);
  if (!shuttingDown) process.exitCode = 1;
});

function stop(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!reaExited) rea.kill(signal);
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

function waitReady() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const probe = () => {
      if (reaExited) return reject(Error("REA exited"));
      const socket = net.createConnection({ host: "127.0.0.1", port: REA_PORT });
      socket.setTimeout(1500);
      socket.once("connect", () => { socket.destroy(); resolve(); });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start > 90000) reject(Error("REA startup timeout"));
        else setTimeout(probe, 500);
      });
      socket.once("timeout", () => socket.destroy());
    };
    probe();
  });
}

await waitReady();

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(reaExited ? 503 : 200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ status: reaExited ? "unavailable" : "ok", service: "rea-cloud-mcp" }));
  }

  if ((req.url || "").split("?")[0] !== "/mcp") {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end('{"error":"Not found"}');
  }
  if (!hasValidBearer(req)) {
    res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store", "www-authenticate": 'Bearer realm="REA MCP"' });
    return res.end('{"error":"A valid Bearer token is required"}');
  }
  if (reaExited) {
    res.writeHead(503, { "content-type": "application/json", "retry-after": "5" });
    return res.end('{"error":"REA unavailable"}');
  }

  const headers = { ...req.headers };
  delete headers.origin;
  delete headers.connection;
  delete headers.authorization;
  headers.host = "127.0.0.1:" + REA_PORT;

  const upstream = http.request({ host: "127.0.0.1", port: REA_PORT, path: req.url, method: req.method, headers }, u => {
    res.writeHead(u.statusCode || 502, u.headers);
    u.pipe(res);
  });
  upstream.on("error", e => {
    console.error("upstream", e.message);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end('{"error":"MCP upstream unavailable"}');
    } else res.destroy(e);
  });
  req.on("aborted", () => upstream.destroy());
  res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
  req.pipe(upstream);
});

server.listen(PORT, "0.0.0.0", () => console.log("Protected REA MCP gateway listening; /mcp requires Bearer authentication"));
server.on("error", e => { console.error(e); process.exit(1); });
