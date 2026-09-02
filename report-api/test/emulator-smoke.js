"use strict";

const assert = require("node:assert/strict");

const projectId = process.env.GCLOUD_PROJECT || "demo-az-packers-quotation";
const reportDate = "2026-09-03";
const token = "emulator-only-daily-report-token";
const endpoint = `http://127.0.0.1:5001/${projectId}/asia-south1/dailyOperationsReport`;

async function request(path = `?date=${reportDate}`, options = {}) {
  return fetch(`${endpoint}${path}`, {
    method: options.method || "GET",
    headers: options.token === null ? {} : {Authorization: `Bearer ${options.token || token}`}
  });
}

async function main() {
  assert.equal(process.env.REPORT_API_USE_LOCAL_FIXTURE, "true", "Safe emulator fixture must be enabled.");
  const unauthorized = await request(`?date=${reportDate}`, {token: null});
  assert.equal(unauthorized.status, 401);
  const wrong = await request(`?date=${reportDate}`, {token: "wrong"});
  assert.equal(wrong.status, 401);
  const post = await request(`?date=${reportDate}`, {method: "POST"});
  assert.equal(post.status, 405);
  const response = await request();
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.success, true);
  assert.equal(report.reportDate, reportDate);
  assert.equal(report.attendance.present[0].employeeName, "Emulator Driver");
  assert.equal(report.todayDispatch[0].materialName, "Cartons");
  assert.equal(report.todayDispatch[0].quantity, 1);
  assert.equal(JSON.stringify(report).includes("password"), false);
  console.log("Functions Emulator smoke test passed: auth, GET-only, safe fixture reads, attendance, material dispatch, and privacy.");
}

main().catch((error) => {
  console.error(`Emulator smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
