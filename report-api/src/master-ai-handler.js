"use strict";

const {buildReport, parseCommand} = require("./master-ai-report");

const DEFAULT_ORIGINS = new Set(["https://andmovers.github.io", "https://ozpackersmovers.in", "https://www.ozpackersmovers.in"]);

function bearerToken(request) {
  const header = String(request.get?.("authorization") || request.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function send(response, status, body, origin = "") {
  const headers = {"Cache-Control": "no-store, max-age=0", "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Vary": "Origin"};
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  response.status(status).set(headers);
  return response.json(body);
}

function createMasterAiHandler({repository, verifyToken, allowedUidsProvider = () => "", clock = () => new Date(), logger = console, allowedOrigins = DEFAULT_ORIGINS}) {
  if (!repository?.queryIntent || !repository?.queryComments) throw new TypeError("Master AI read-only repository is required.");
  if (typeof verifyToken !== "function") throw new TypeError("Firebase token verifier is required.");

  return async function masterAiHandler(request, response) {
    const origin = String(request.get?.("origin") || request.headers?.origin || "");
    const acceptedOrigin = !origin || allowedOrigins.has(origin) ? origin : "";
    if (origin && !acceptedOrigin) return send(response, 403, {success: false, error: "Origin not allowed"});
    if (String(request.method).toUpperCase() === "OPTIONS") {
      response.status(204).set({"Access-Control-Allow-Origin": acceptedOrigin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "600", "Vary": "Origin"});
      return response.send?.("");
    }
    if (String(request.method).toUpperCase() !== "POST") return send(response, 405, {success: false, error: "Method Not Allowed"}, acceptedOrigin);

    const token = bearerToken(request);
    if (!token) return send(response, 401, {success: false, error: "Unauthorized"}, acceptedOrigin);
    let decoded;
    try { decoded = await verifyToken(token, true); } catch { return send(response, 401, {success: false, error: "Unauthorized"}, acceptedOrigin); }
    const allowedUids = new Set(String(allowedUidsProvider() || "").split(",").map((value) => value.trim()).filter(Boolean));
    if (decoded?.masterAiAdmin !== true && !allowedUids.has(String(decoded?.uid || ""))) return send(response, 403, {success: false, error: "Master AI access denied"}, acceptedOrigin);

    const command = String(request.body?.command || "").trim();
    if (!command || command.length > 500) return send(response, 400, {success: false, error: "A command of 1-500 characters is required."}, acceptedOrigin);
    const parsed = parseCommand(command, clock());
    if (parsed.intent === "unknown") return send(response, 400, {success: false, error: "Command module could not be identified."}, acceptedOrigin);

    try {
      let result;
      if (parsed.intent === "comments") result = await repository.queryComments(parsed.range);
      else if (parsed.intent === "business") {
        const intents = ["quotation", "jobs", "attendance", "fooding", "material", "payment", "task", "complaint"];
        const reports = await Promise.all(intents.map(async (intent) => ({intent, report: await repository.queryIntent(intent, parsed.range, {dateBasis: parsed.dateBasis})})));
        result = {rows: reports.flatMap(({intent, report}) => report.rows.map((row) => ({...row, _intent: row._intent || row.module || intent}))), diagnostics: reports.flatMap(({report}) => report.diagnostics)};
      } else result = await repository.queryIntent(parsed.intent, parsed.range, {dateBasis: parsed.dateBasis});
      const report = buildReport(parsed, result, clock());
      logger.info?.("master_ai_report_generated", {uid: decoded.uid, intent: parsed.intent, from: parsed.range.from, to: parsed.range.to, matches: report.records.length + report.comments.length});
      return send(response, 200, report, acceptedOrigin);
    } catch (error) {
      logger.error?.("master_ai_report_failed", {uid: decoded.uid, intent: parsed.intent, code: String(error?.code || error?.message || "INTERNAL_ERROR").slice(0, 100)});
      return send(response, 500, {success: false, error: "Data could not be verified"}, acceptedOrigin);
    }
  };
}

module.exports = {bearerToken, createMasterAiHandler};
