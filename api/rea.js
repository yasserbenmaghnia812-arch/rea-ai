import https from "node:https";

const UPSTREAM_HOST = "rea-cloud-mcp-unified.onrender.com";
const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade", "host"
]);

export const config = {
  api: { bodyParser: false }
};

export default function handler(req, res) {
  const token = process.env.REA_MCP_TOKEN;
  if (!token || token.length < 32) {
    res.statusCode = 503;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "REA MCP server credential is not configured." }));
    return;
  }

  const incomingUrl = req.url || "/api/rea";
  const queryIndex = incomingUrl.indexOf("?");
  const query = queryIndex >= 0 ? incomingUrl.slice(queryIndex) : "";
  const headers = {};

  for (const [name, value] of Object.entries(req.headers || {})) {
    const key = name.toLowerCase();
    if (!HOP_BY_HOP.has(key) && value !== undefined) headers[key] = value;
  }

  headers.host = UPSTREAM_HOST;
  headers.authorization = `Bearer ${token}`;
  headers["cache-control"] = "no-store";

  const upstream = https.request({
    hostname: UPSTREAM_HOST,
    port: 443,
    path: "/mcp" + query,
    method: req.method || "POST",
    headers
  }, upstreamResponse => {
    const responseHeaders = {};
    for (const [name, value] of Object.entries(upstreamResponse.headers)) {
      if (!HOP_BY_HOP.has(name.toLowerCase()) && value !== undefined) {
        responseHeaders[name] = value;
      }
    }
    res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
    upstreamResponse.pipe(res);
  });

  upstream.setTimeout(55000, () => upstream.destroy(new Error("REA MCP upstream timeout")));
  upstream.on("error", error => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "REA MCP gateway unavailable.", detail: error.message }));
    } else {
      res.destroy(error);
    }
  });

  req.on("aborted", () => upstream.destroy());
  res.on("close", () => {
    if (!res.writableEnded) upstream.destroy();
  });
  req.pipe(upstream);
}
