"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const HOST = "0.0.0.0";
const PORT = Number(process.argv[2] || process.env.STAGING_UI_PORT || 8080);
const ROOT = path.resolve(__dirname, "../../staging");
const HTML = path.join(ROOT, "test.driver.master-ai-staging.html");
const CONFIG = path.join(ROOT, "firebase-staging-config.js");
const FUNCTION_PATH = "/a-to-z-gps-staging/asia-south1/masterAiReport";

function send(response, status, type, body) {
  response.writeHead(status, {"Cache-Control": "no-store", "Content-Type": type, "X-Content-Type-Options": "nosniff"});
  response.end(body);
}

function proxyReport(request, response) {
  const headers = {"content-type": request.headers["content-type"] || "application/json"};
  const authorization = request.headers["x-firebase-authorization"] || request.headers.authorization;
  if (authorization) headers.authorization = authorization;
  const upstream = http.request({host: "127.0.0.1", port: 5001, path: FUNCTION_PATH, method: request.method, headers}, (result) => {
    response.writeHead(result.statusCode || 502, {"Cache-Control": "no-store", "Content-Type": result.headers["content-type"] || "application/json"});
    result.pipe(response);
  });
  upstream.on("error", () => send(response, 502, "application/json", JSON.stringify({success: false, error: "Local function emulator unavailable"})));
  request.pipe(upstream);
}

function handler(request, response) {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;
  if (pathname === "/masterAiReport") return proxyReport(request, response);
  if (pathname === "/" || pathname === "/test.driver.master-ai-staging.html") {
    return send(response, 200, "text/html; charset=utf-8", fs.readFileSync(HTML));
  }
  if (pathname === "/firebase-staging-config.js") {
    if (!fs.existsSync(CONFIG)) return send(response, 503, "application/javascript", "throw new Error('Staging Firebase configuration is missing');");
    const configured = `${fs.readFileSync(CONFIG, "utf8")}\nwindow.__AZP_MASTER_AI_API_URL__ = "/masterAiReport";\n`;
    return send(response, 200, "application/javascript; charset=utf-8", configured);
  }
  return send(response, 404, "text/plain; charset=utf-8", "Not found");
}

if (require.main === module) {
  http.createServer(handler).listen(PORT, HOST, () => {
    console.log(`STAGING UI READY ON PORT ${PORT}`);
    console.log(`Open Cloud Shell Web Preview for port ${PORT}. No deployment was performed.`);
  });
}

module.exports = {handler};
