"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {parseRange, normalizeStoredDate, utcBounds} = require("../src/master-ai-dates");
const {parseCommand, buildReport} = require("../src/master-ai-report");
const {createMasterAiHandler} = require("../src/master-ai-handler");
const {legacyDateCandidates, queryField, uniqueRows} = require("../src/master-ai-repository");
const {fixturePlan, uniqueQuotationCount} = require("../scripts/staging-quotation-fixtures");

const NOW = new Date("2026-09-02T18:45:00Z"); // 03-Sep-2026 00:15 in India.
const DIAGNOSTIC = {collection: "quotations", dateFields: ["createdAt", "created_at", "quotation_date"], totalRecords: 2, invalidRecords: 0, invalidCountComplete: true, scannedForQuality: 2, truncated: false, errors: []};

function quotation(id, date, status = "follow_up") {
  return {id, _collection: "quotations", quotation_number: id, customer_name: `Customer ${id}`, party_mobile: "9000000000", from_location: "Bhubaneswar", to_location: "Cuttack", total_amount: 1000, quotation_date: date, created_at: `${date}T05:30:00.000Z`, status};
}

function responseMock() {
  return {statusCode: 0, headers: {}, body: null, status(code) { this.statusCode = code; return this; }, set(headers) { Object.assign(this.headers, headers); return this; }, json(body) { this.body = body; return this; }, send() { return this; }};
}

function fakeCollection(records) {
  function query(filters = []) {
    return {
      where(field, operator, expected) { return query([...filters, {field, operator, expected}]); },
      orderBy() { return this; },
      limit() { return this; },
      startAfter() { return this; },
      async get() {
        const matches = records.filter(({data}) => filters.every(({field, operator, expected}) => {
          const actual = data[field];
          if (operator === "in") return expected.includes(actual);
          if (operator === ">=") return actual >= expected;
          if (operator === "<") return actual < expected;
          throw new Error(`Unsupported fake operator: ${operator}`);
        }));
        const docs = matches.map(({id, data}) => ({id, data: () => data}));
        return {docs, size: docs.length};
      },
    };
  }
  return query();
}

async function call(handler, {token = "token", command = "today quotation report", origin = "https://andmovers.github.io"} = {}) {
  const response = responseMock();
  await handler({method: "POST", headers: {authorization: token ? `Bearer ${token}` : "", origin}, body: {command}, get(name) { return this.headers[String(name).toLowerCase()] || ""; }}, response);
  return response;
}

test("today uses Asia/Kolkata after UTC date boundary", () => assert.deepEqual(parseRange("today", NOW), {from: "2026-09-03", to: "2026-09-03", label: "Today"}));
test("yesterday, kal and Hindi कल select the previous India day", () => {
  for (const command of ["yesterday quotation report", "kal kitne quote diye the", "कल कितने quotation दिए गए थे"]) assert.equal(parseRange(command, NOW).from, "2026-09-02");
});
test("DD-MM-YYYY, DD/MM/YYYY and YYYY-MM-DD are parsed", () => {
  assert.equal(parseRange("01-09-2026 quotation", NOW).from, "2026-09-01");
  assert.equal(parseRange("01/09/2026 quotation", NOW).from, "2026-09-01");
  assert.equal(parseRange("2026-09-01 quotation", NOW).from, "2026-09-01");
});
test("range works across month and year boundary", () => assert.deepEqual(parseRange("31-12-2025 to 02-01-2026 quotation", NOW), {from: "2025-12-31", to: "2026-01-02", label: "2025-12-31 to 2026-01-02"}));
test("India midnight produces exact UTC query boundaries", () => {
  const bounds = utcBounds({from: "2026-09-03", to: "2026-09-03"});
  assert.equal(bounds.start.toISOString(), "2026-09-02T18:30:00.000Z");
  assert.equal(bounds.end.toISOString(), "2026-09-03T18:30:00.000Z");
});
test("Timestamp, ISO, epoch and legacy date strings normalize", () => {
  assert.equal(normalizeStoredDate({seconds: Date.parse("2026-09-02T18:45:00Z") / 1000}), "2026-09-03");
  assert.equal(normalizeStoredDate("2026-09-02T18:45:00Z"), "2026-09-03");
  assert.equal(normalizeStoredDate(Date.parse("2026-09-02T18:45:00Z")), "2026-09-03");
  assert.equal(normalizeStoredDate("03/09/2026"), "2026-09-03");
});
test("legacy date query candidates include padded and unpadded stored formats", () => {
  const candidates = legacyDateCandidates({from: "2026-09-03", to: "2026-09-03"});
  assert.equal(candidates.complete, true);
  for (const value of ["03-09-2026", "03/09/2026", "2026/09/03", "3-9-2026", "3/9/2026", "2026/9/3", "2026-9-3"]) assert.ok(candidates.values.includes(value));
});
test("repository query fetches canonical, ISO and legacy string dates", async () => {
  const base = fakeCollection([
    {id: "canonical", data: {quotation_date: "2026-09-03"}},
    {id: "iso", data: {quotation_date: "2026-09-03T14:30:00+05:30"}},
    {id: "dash", data: {quotation_date: "03-09-2026"}},
    {id: "slash", data: {quotation_date: "03/09/2026"}},
    {id: "old", data: {quotation_date: "02/09/2026"}},
  ]);
  const result = await queryField(base, "quotations", "quotation_date", {from: "2026-09-03", to: "2026-09-03"});
  assert.deepEqual([...new Set(result.rows.map((row) => row.id))].sort(), ["canonical", "dash", "iso", "slash"]);
  assert.deepEqual(result.errors, []);
});
test("quotation defaults to created date and shifting only when requested", () => {
  assert.equal(parseCommand("01-09-2026 quotation report", NOW).dateBasis, "created");
  assert.equal(parseCommand("01-09-2026 shifting date quotation report", NOW).dateBasis, "shifting");
});
test("Hindi, Hinglish and English quotation synonyms route to quotation", () => {
  for (const command of ["आज कितने quotation दिए गए?", "aaj estimate count", "today quote report"]) assert.equal(parseCommand(command, NOW).intent, "quotation");
});
test("fixture manual quotation count equals report count and duplicates are removed", () => {
  const duplicate = {...quotation("Q-1-copy", "2026-09-03"), id: "different-document", quotation_number: "Q-1"};
  const rows = uniqueRows([quotation("Q-1", "2026-09-03"), duplicate, quotation("Q-2", "2026-09-03")]);
  assert.equal(rows.length, 2);
  const report = buildReport(parseCommand("today quotation report", NOW), {rows, diagnostics: [DIAGNOSTIC]}, NOW);
  assert.equal(report.records.length, 2);
  assert.match(report.reportText, /Total Matching Records: 2/);
});
test("sanitized staging plan covers today, yesterday, three old dates and duplicate prevention", () => {
  const plan = fixturePlan(NOW);
  const rows = plan.records.map((record) => ({id: record.id, ...record.data}));
  assert.equal(uniqueQuotationCount(rows, plan.today), 2);
  assert.equal(uniqueQuotationCount(rows, plan.yesterday), 1);
  plan.oldDates.forEach((date) => assert.equal(uniqueQuotationCount(rows, date), 1));
  assert.equal(rows.length, 7);
  assert.equal(new Set(rows.map((row) => row.quotation_number)).size, 6);
});
test("zero-record result includes collection, date field, bounds and invalid count", () => {
  const report = buildReport(parseCommand("01-09-2026 quotation report", NOW), {rows: [], diagnostics: [DIAGNOSTIC]}, NOW);
  assert.match(report.reportText, /NO MATCHING LIVE RECORD/);
  assert.match(report.reportText, /createdAt, created_at, quotation_date/);
  assert.match(report.reportText, /Missing\/invalid date records: 0/);
});
test("comments stay attached to their own module and identifier", () => {
  const row = {...quotation("Q-1", "2026-09-03"), _intent: "quotation", comments: [{text: "Call after 4 PM", author: "Manoj", status: "Pending"}]};
  const report = buildReport(parseCommand("today all comments", NOW), {rows: [row], diagnostics: [DIAGNOSTIC]}, NOW);
  assert.equal(report.comments[0].reference, "Q-1");
  assert.equal(report.comments[0].module, "quotation");
});
test("valid Firebase custom claim is accepted", async () => {
  const repository = {queryIntent: async () => ({rows: [quotation("Q-1", "2026-09-03")], diagnostics: [DIAGNOSTIC]}), queryComments: async () => ({rows: [], diagnostics: []})};
  const handler = createMasterAiHandler({repository, verifyToken: async () => ({uid: "manoj-uid", masterAiAdmin: true}), clock: () => NOW});
  const response = await call(handler);
  assert.equal(response.statusCode, 200);
});
test("another authenticated staff member is denied", async () => {
  const repository = {queryIntent: async () => { throw new Error("must not query"); }, queryComments: async () => { throw new Error("must not query"); }};
  const handler = createMasterAiHandler({repository, verifyToken: async () => ({uid: "staff-uid"}), clock: () => NOW});
  const response = await call(handler);
  assert.equal(response.statusCode, 403);
});
test("missing token, wrong origin and non-POST requests are rejected", async () => {
  const repository = {queryIntent: async () => ({rows: [], diagnostics: []}), queryComments: async () => ({rows: [], diagnostics: []})};
  const handler = createMasterAiHandler({repository, verifyToken: async () => ({uid: "manoj", masterAiAdmin: true}), clock: () => NOW});
  assert.equal((await call(handler, {token: ""})).statusCode, 401);
  assert.equal((await call(handler, {origin: "https://evil.example"})).statusCode, 403);
  const response = responseMock(); await handler({method: "GET", headers: {}, body: {}, get() { return ""; }}, response); assert.equal(response.statusCode, 405);
});
