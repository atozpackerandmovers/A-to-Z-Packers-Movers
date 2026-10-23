"use strict";

const {PRIVATE_KEY_PATTERN} = require("./constants");
const {buildDailyOperationsReport} = require("./report-builder");
const {DataVolumeLimitError} = require("./firestore-repository");
const {compareToken, indiaDate, validIsoDate} = require("./utils");

function sendJson(response, status, body, extraHeaders = {}) {
  response.status(status);
  response.set({
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  return response.json(body);
}

function bearerToken(request) {
  const header = String(request.get?.("authorization") || request.headers?.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function assertNoPrivateKeys(value, path = "response") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, child]) => {
    if (PRIVATE_KEY_PATTERN.test(key)) throw new Error(`Private field attempted in API response at ${path}.${key}`);
    assertNoPrivateKeys(child, `${path}.${key}`);
  });
}

function createDailyOperationsHandler({repository, tokenProvider, clock = () => new Date(), logger = console}) {
  if (!repository || typeof repository.loadReportSource !== "function") throw new TypeError("A read-only report repository is required.");
  if (typeof tokenProvider !== "function") throw new TypeError("A token provider is required.");

  return async function dailyOperationsHandler(request, response) {
    const startedAt = Date.now();
    if (String(request.method || "").toUpperCase() !== "GET") {
      return sendJson(response, 405, {success: false, error: "Method Not Allowed"}, {Allow: "GET"});
    }

    const expectedToken = tokenProvider();
    if (!expectedToken || !compareToken(bearerToken(request), expectedToken)) {
      return sendJson(response, 401, {success: false, error: "Unauthorized"});
    }

    const now = clock();
    const requestedDate = request.query?.date === undefined ? indiaDate(now) : String(request.query.date);
    if (!validIsoDate(requestedDate)) {
      return sendJson(response, 400, {success: false, error: "Invalid date. Use YYYY-MM-DD."});
    }

    try {
      const source = await repository.loadReportSource();
      const report = buildDailyOperationsReport(source, requestedDate, now);
      assertNoPrivateKeys(report);
      logger.info?.("daily_operations_report_generated", {
        reportDate: requestedDate,
        durationMs: Date.now() - startedAt,
        activeStaff: report.summary.activeStaff,
        materialRows: report.materialStock.length,
        dispatchRows: report.todayDispatch.length,
        warningCount: report.warnings.length
      });
      return sendJson(response, 200, report);
    } catch (error) {
      const safeCode = error instanceof DataVolumeLimitError ? "DATA_VOLUME_LIMIT" : "INTERNAL_ERROR";
      logger.error?.("daily_operations_report_failed", {
        reportDate: requestedDate,
        durationMs: Date.now() - startedAt,
        errorCode: safeCode
      });
      return sendJson(response, 500, {
        success: false,
        error: safeCode === "DATA_VOLUME_LIMIT" ? "Report data exceeds the safe read limit." : "Unable to generate the report safely."
      });
    }
  };
}

module.exports = {assertNoPrivateKeys, bearerToken, createDailyOperationsHandler};
