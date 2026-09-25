"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");

process.env.FUNCTIONS_EMULATOR = "true";
process.env.REPORT_API_USE_LOCAL_FIXTURE = "true";
process.env.DAILY_REPORT_API_TOKEN = crypto.randomBytes(32).toString("hex");

const {dailyOperationsReport} = require("../src/index");

async function main() {
  const app = express();
  app.use(dailyOperationsReport);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });

  try {
    const {port} = server.address();
    const endpoint = `http://127.0.0.1:${port}?date=2026-09-03`;
    const request = (options = {}) => fetch(endpoint, {
      method: options.method || "GET",
      headers: options.token === null ? {} : {
        Authorization: `Bearer ${options.token || process.env.DAILY_REPORT_API_TOKEN}`
      }
    });

    assert.equal((await request({token: null})).status, 401);
    assert.equal((await request({token: "wrong"})).status, 401);
    assert.equal((await request({method: "POST"})).status, 405);

    const response = await request();
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.success, true);
    assert.equal(report.reportDate, "2026-09-03");
    assert.equal(report.attendance.present[0].employeeName, "Emulator Driver");
    assert.equal(report.todayDispatch[0].materialName, "Cartons");
    assert.equal(report.todayDispatch[0].quantity, 1);
    assert.equal(JSON.stringify(report).includes("password"), false);
    console.log("Local Functions runtime smoke test passed: auth, GET-only, fixture reads, report mapping, and privacy.");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(`Local Functions runtime smoke test failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
