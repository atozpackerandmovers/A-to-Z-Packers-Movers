"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {MODULES} = require("../src/constants");
const {createFirestoreRepository, DataVolumeLimitError} = require("../src/firestore-repository");
const {buildDailyOperationsReport} = require("../src/report-builder");
const {createDailyOperationsHandler} = require("../src/http-handler");

const TOKEN = crypto.randomBytes(32).toString("hex");
const REPORT_DATE = "2026-09-03";

function emptySource() {
  return Object.fromEntries(Object.values(MODULES).map((moduleName) => [moduleName, []]));
}

function baseSource() {
  const source = emptySource();
  source.driverMaster = [
    {id: "driver-1", module: "driverMaster", driver_name: "Driver One", joining_date: "2026-01-01", status: "Active", mobile: "9000000001", login_password: "private-driver-password"},
    {id: "driver-2", module: "driverMaster", driver_name: "Inactive Driver", joining_date: "2026-01-01", inactive_date: "2026-08-31", status: "Inactive"}
  ];
  source.workerMaster = [
    {id: "worker-1", module: "workerMaster", worker_name: "Worker One", joining_date: "2026-01-01", status: "Active"},
    {id: "worker-2", module: "workerMaster", worker_name: "Blacklisted Worker", joining_date: "2026-01-01", inactive_date: "2026-09-01", status: "Blacklist"}
  ];
  source.indoorStaffMaster = [
    {id: "office-1", module: "indoorStaffMaster", indoor_staff_name: "Office One", joining_date: "2026-01-01", status: "Active", fooding_applicable: "No"}
  ];
  source.attendance = [
    {id: "att-1", module: "attendance", master_id: "driver-1", employee_name: "Driver One", role: "Driver", date: REPORT_DATE, attendance_status: "Present", fooding_eligible: "Yes", punch_in: "09:05"},
    {id: "att-2", module: "attendance", master_id: "worker-1", employee_name: "Worker One", role: "Worker", date: REPORT_DATE, attendance_status: "Absent", fooding_eligible: "No"}
  ];
  source.staffSalaryMaster = [
    {id: "salary-driver-1", module: "staffSalaryMaster", master_id: "driver-1", employee_name: "Driver One", role: "Driver", fooding_rate: 250, status: "Active"},
    {id: "salary-worker-1", module: "staffSalaryMaster", master_id: "worker-1", employee_name: "Worker One", role: "Worker", fooding_rate: 150, status: "Active"},
    {id: "salary-office-1", module: "staffSalaryMaster", master_id: "office-1", employee_name: "Office One", role: "Indoor Staff", fooding_rate: 0, status: "Active"}
  ];
  source.materialStock = [
    {id: "stock-1", module: "materialStock", item_name: "Cartons", unit_name: "Quantity", date: "2026-09-01", opening_stock: "10", purchase_qty: "5", used_qty: "1", reorder_level: "3"}
  ];
  source.material = [
    {id: "issue-1", module: "material", date: REPORT_DATE, cartons_qty: 2, job_id: "JOB-1", driver_name: "Driver One", issued_by: "Store Admin", createdAt: new Date("2026-09-03T06:00:00Z"), customer_name: "Private Customer", from_location: "Private Address"}
  ];
  source.jobs = [
    {id: "job-1", module: "jobs", work_date: REPORT_DATE, driver: "Driver One", status: "Assigned", mobile: "9000000000", from_location: "Private Address"}
  ];
  return source;
}

function responseMock() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    set(headers) { Object.assign(this.headers, headers); return this; },
    json(body) { this.body = body; return this; }
  };
}

function request({method = "GET", token = TOKEN, date = REPORT_DATE} = {}) {
  const headers = token === null ? {} : {authorization: `Bearer ${token}`};
  return {method, headers, query: date === null ? {} : {date}, get: (name) => headers[String(name).toLowerCase()]};
}

function handlerFor(source, options = {}) {
  const repository = options.repository || {loadReportSource: async () => source};
  return createDailyOperationsHandler({
    repository,
    tokenProvider: () => TOKEN,
    clock: options.clock || (() => new Date("2026-09-03T12:00:00Z")),
    logger: {info() {}, error() {}}
  });
}

async function call(handler, req) {
  const res = responseMock();
  await handler(req, res);
  return res;
}

test("01 correct token is accepted", async () => {
  const res = await call(handlerFor(baseSource()), request());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test("02 missing token returns 401", async () => {
  const res = await call(handlerFor(baseSource()), request({token: null}));
  assert.equal(res.statusCode, 401);
});

test("03 incorrect token returns 401", async () => {
  const res = await call(handlerFor(baseSource()), request({token: "wrong"}));
  assert.equal(res.statusCode, 401);
});

test("04 valid GET request returns JSON", async () => {
  const res = await call(handlerFor(baseSource()), request({method: "GET"}));
  assert.equal(res.headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(res.headers["Cache-Control"], "no-store, max-age=0");
});

test("05 POST request is rejected with 405", async () => {
  const res = await call(handlerFor(baseSource()), request({method: "POST"}));
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
});

test("06 invalid date is rejected", async () => {
  const res = await call(handlerFor(baseSource()), request({date: "2026-02-30"}));
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "Invalid date. Use YYYY-MM-DD.");
});

test("07 omitted date uses the current India date", async () => {
  const clock = () => new Date("2026-09-02T18:45:00Z");
  const res = await call(handlerFor(baseSource(), {clock}), request({date: null}));
  assert.equal(res.body.reportDate, "2026-09-03");
});

test("08 past report date is supported", async () => {
  const res = await call(handlerFor(baseSource()), request({date: "2026-09-01"}));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.reportDate, "2026-09-01");
});

test("09 no records returns empty, consistent report", () => {
  const report = buildDailyOperationsReport(emptySource(), REPORT_DATE, new Date("2026-09-03T12:00:00Z"));
  assert.equal(report.summary.activeStaff, 0);
  assert.deepEqual(report.attendance.present, []);
  assert.deepEqual(report.materialStock, []);
});

test("10 present employee is listed", () => {
  const report = buildDailyOperationsReport(baseSource(), REPORT_DATE);
  assert.equal(report.attendance.present.some((row) => row.employeeName === "Driver One"), true);
});

test("11 absent employee is listed", () => {
  const report = buildDailyOperationsReport(baseSource(), REPORT_DATE);
  assert.equal(report.attendance.absent.some((row) => row.employeeName === "Worker One"), true);
});

test("12 approved leave is listed", () => {
  const source = baseSource();
  source.attendance = source.attendance.filter((row) => row.master_id !== "worker-1");
  source.leaveApproval = [{id: "leave-1", module: "leaveApproval", master_id: "worker-1", employee_name: "Worker One", role: "Worker", leave_from: REPORT_DATE, leave_to: REPORT_DATE, approval_status: "Approved"}];
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  assert.equal(report.attendance.leave.some((row) => row.employeeName === "Worker One"), true);
});

test("13 attendance not marked is listed", () => {
  const report = buildDailyOperationsReport(baseSource(), REPORT_DATE);
  assert.equal(report.attendance.notMarked.some((row) => row.employeeName === "Office One"), true);
});

test("14 duplicate attendance is warned", () => {
  const source = baseSource();
  source.attendance.push({...source.attendance[0], id: "att-duplicate"});
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  assert.equal(report.warnings.some((item) => item.code === "DUPLICATE_ATTENDANCE"), true);
});

test("15 conflicting present and absent is warned", () => {
  const source = baseSource();
  source.attendance.push({...source.attendance[0], id: "att-conflict", attendance_status: "Absent", updatedAtMs: 2});
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  assert.equal(report.warnings.some((item) => item.code === "CONFLICTING_ATTENDANCE"), true);
});

test("16 inactive employee is excluded unless attendance needs investigation", () => {
  const source = baseSource();
  let report = buildDailyOperationsReport(source, REPORT_DATE);
  assert.equal(Object.values(report.attendance).flat().some((row) => row.employeeName === "Inactive Driver"), false);
  source.attendance.push({id: "att-inactive", module: "attendance", master_id: "driver-2", employee_name: "Inactive Driver", role: "Driver", date: REPORT_DATE, attendance_status: "Present"});
  report = buildDailyOperationsReport(source, REPORT_DATE);
  assert.equal(report.warnings.some((item) => item.code === "INACTIVE_STAFF_ATTENDANCE"), true);
});

test("17 blacklisted employee is excluded unless attendance needs investigation", () => {
  const source = baseSource();
  source.attendance.push({id: "att-blacklisted", module: "attendance", master_id: "worker-2", employee_name: "Blacklisted Worker", role: "Worker", date: REPORT_DATE, attendance_status: "Present"});
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  assert.equal(report.warnings.some((item) => item.code === "INACTIVE_STAFF_ATTENDANCE" && item.context.employeeName === "Blacklisted Worker"), true);
});

test("18 missing fooding rate is warned without a configured Driver/Worker rate", () => {
  const source = baseSource();
  source.staffSalaryMaster = source.staffSalaryMaster.filter((row) => row.master_id !== "driver-1");
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  const driver = report.foodingEligibility.find((item) => item.employeeName === "Driver One");
  assert.equal(driver.applicableFoodingRate, null);
  assert.equal(driver.missingRateWarning, true);
  assert.equal(report.warnings.some((item) => item.code === "MISSING_FOODING_RATE" && item.context.employeeName === "Driver One"), true);
});

test("19 absent person incorrectly marked for fooding is warned", () => {
  const source = baseSource();
  source.attendance.find((row) => row.master_id === "worker-1").fooding_eligible = "Yes";
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  assert.equal(report.warnings.some((item) => item.code === "FOODING_FOR_ABSENT_STAFF"), true);
});

test("20 material received contributes to stock", () => {
  const report = buildDailyOperationsReport(baseSource(), REPORT_DATE);
  const cartons = report.materialStock.find((row) => row.materialName === "Cartons");
  assert.equal(cartons.totalReceived, 5);
});

test("21 material dispatched appears in selected date report", () => {
  const report = buildDailyOperationsReport(baseSource(), REPORT_DATE);
  assert.equal(report.todayDispatch.length, 1);
  assert.equal(report.todayDispatch[0].materialName, "Cartons");
  assert.equal(report.todayDispatch[0].quantity, 2);
});

test("22 negative stock is retained and warned", () => {
  const source = baseSource();
  source.material[0].cartons_qty = 99;
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  assert.equal(report.materialStock.find((row) => row.materialName === "Cartons").availableBalance < 0, true);
  assert.equal(report.warnings.some((item) => item.code === "NEGATIVE_STOCK"), true);
});

test("23 material issue without quantity is warned", () => {
  const source = baseSource();
  source.material.push({id: "issue-empty", module: "material", date: REPORT_DATE, job_id: "JOB-EMPTY"});
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  assert.equal(report.warnings.some((item) => item.code === "DISPATCH_WITHOUT_MATERIAL"), true);
});

test("24 Firestore read failure returns safe 500", async () => {
  const repository = {loadReportSource: async () => { throw new Error("private stack and credentials"); }};
  const res = await call(handlerFor(emptySource(), {repository}), request());
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.stringify(res.body).includes("private stack"), false);
});

test("25 India midnight transition does not use UTC date", async () => {
  const clock = () => new Date("2026-09-02T18:30:01Z");
  const res = await call(handlerFor(emptySource(), {clock}), request({date: null}));
  assert.equal(res.body.reportDate, "2026-09-03");
});

test("26 API response excludes phones, passwords, addresses and source private values", () => {
  const report = buildDailyOperationsReport(baseSource(), REPORT_DATE);
  const json = JSON.stringify(report);
  assert.equal(json.includes("9000000001"), false);
  assert.equal(json.includes("private-driver-password"), false);
  assert.equal(json.includes("Private Address"), false);
  assert.equal(json.includes("Private Customer"), false);
  assert.equal(/"(mobile|phone|address|password|apiKey|latitude|longitude)"\s*:/.test(json), false);
});

test("27 production report source contains no Firestore write operation", () => {
  const sourceDir = path.join(__dirname, "..", "src");
  const inspected = ["index.js", "firestore-repository.js"]
    .map((file) => fs.readFileSync(path.join(sourceDir, file), "utf8"))
    .join("\n");
  const forbidden = /\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b|\.(set|add|create|update|delete)\s*\(/;
  assert.equal(forbidden.test(inspected), false);
});

test("28 employee-specific fooding rate is used without a role fallback", () => {
  const source = baseSource();
  source.staffSalaryMaster.find((row) => row.master_id === "driver-1").fooding_rate = 200;
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  const driver = report.foodingEligibility.find((item) => item.employeeName === "Driver One");
  assert.equal(driver.applicableFoodingRate, 200);
  assert.equal(driver.calculatedFoodingAmount, 200);
});

test("29 Half Day honors saved attendance fooding eligibility before the default rule", () => {
  const source = baseSource();
  const attendance = source.attendance.find((row) => row.master_id === "driver-1");
  attendance.attendance_status = "Half Day";
  attendance.fooding_eligible = "No";
  const report = buildDailyOperationsReport(source, REPORT_DATE);
  const driver = report.foodingEligibility.find((item) => item.employeeName === "Driver One");
  assert.equal(driver.foodingEligible, "No");
  assert.equal(driver.calculatedFoodingAmount, 0);
  assert.match(driver.reason, /attendance\.fooding_eligible/);
});

test("30 bounded repository accepts 500 rows and fails safely when a query exceeds 500", async () => {
  function fakeDb(size) {
    const docs = Array.from({length: size}, (_, index) => ({
      id: `row-${index}`,
      data: () => ({module: "attendance"})
    }));
    return {
      collection: () => ({
        where: () => ({
          limit: () => ({get: async () => ({size, docs})})
        })
      })
    };
  }

  const atLimit = createFirestoreRepository(fakeDb(500), {limit: 500});
  assert.equal((await atLimit.moduleRows("attendance")).length, 500);
  const overLimit = createFirestoreRepository(fakeDb(501), {limit: 500});
  await assert.rejects(() => overLimit.moduleRows("attendance"), DataVolumeLimitError);
  const res = await call(handlerFor(emptySource(), {
    repository: {loadReportSource: () => overLimit.moduleRows("attendance")}
  }), request());
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, "Report data exceeds the safe read limit.");
});
