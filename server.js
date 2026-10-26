import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 8088);
const types = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

export function createAppServer(assist = async () => ({ error: "AI advisory is not configured." })) {
  return createServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("cache-control", "no-store");
    if (req.url === "/api/assist" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 12_000) { res.writeHead(413); res.end("Payload too large"); return; }
      }
      try {
        const result = await assist(JSON.parse(body));
        res.writeHead(result.error ? 503 : 200, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result));
      } catch {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: "Invalid advisory request." }));
      }
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
    catch { res.writeHead(400); res.end(); return; }
    if (pathname === "/") pathname = "/index.html";
    if (!/^\/(?:index\.html|build\.html|src\/[a-zA-Z0-9._-]+\.(?:js|mjs|css))$/.test(pathname)) { res.writeHead(404); res.end(); return; }
    const path = resolve(root, `.${pathname}`);
    if (!path.startsWith(root)) { res.writeHead(404); res.end(); return; }
    try {
      const data = await readFile(path);
      res.writeHead(200, { "content-type": types[path.slice(path.lastIndexOf("."))] || "application/octet-stream" });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch { res.writeHead(404); res.end(); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createAppServer().listen(port, "127.0.0.1", () => console.log(`MerchantHandoff Voice at http://127.0.0.1:${port}`));
}
