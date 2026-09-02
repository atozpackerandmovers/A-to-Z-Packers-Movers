"use strict";

const {dateKey, normalizeStoredDate, parseRange, TIME_ZONE, utcBounds} = require("./master-ai-dates");
const {COMMENT_FIELDS} = require("./master-ai-schema");

function text(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function first(row, keys) { for (const key of keys) if (text(row?.[key])) return row[key]; return ""; }
function number(value) { const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed : 0; }
function money(value) { return `₹${Math.round(number(value)).toLocaleString("en-IN")}`; }
function key(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, ""); }

const INTENTS = [
  ["comments", /comments?|notes?|remarks?|follow.?up comments?|टिप्पणी|कमेंट/],
  ["quotation", /quotations?|quotes?|estimates?|कोटेशन/],
  ["attendance", /attendance|present|absent|not marked|हाजिरी|अनुपस्थित/],
  ["fooding", /fooding|meal|food report|भोजन|खाना/],
  ["material", /material|stock|inward|dispatch|सामग्री|स्टॉक/],
  ["payment", /payments?|90%|10%|balance|pending amount|बकाया|पेमेंट/],
  ["vendor", /vendors?|party pending|वेंडर/],
  ["fuel", /fuel|diesel|petrol|mileage|ईंधन/],
  ["vehicle", /vehicle|repair|service|document expiry|insurance|fitness|permit|गाड़ी|मरम्मत/],
  ["gps", /gps|trip status|live location|लोकेशन/],
  ["task", /tasks?|overdue|unresolved task|टास्क/],
  ["complaint", /complaints?|grievance|शिकायत/],
  ["feedback", /feedback|online review|rating|फीडबैक/],
  ["salary", /salary|bonus|extra work|uniform|black.?white|वेतन/],
  ["planning", /planning sheet|planning|योजना/],
  ["jobs", /execution jobs?|jobs?|shifting jobs?|काम/]
];

function parseCommand(command, now = new Date()) {
  const normalized = text(command).toLowerCase();
  const intent = INTENTS.find(([, pattern]) => pattern.test(normalized))?.[0] || (/business report|today report|complete report|पूरी.*रिपोर्ट/.test(normalized) ? "business" : "unknown");
  const range = parseRange(normalized, now) || {from: dateKey(now), to: dateKey(now), label: "Today"};
  const statuses = [];
  const add = (pattern, value) => { if (pattern.test(normalized) && !statuses.includes(value)) statuses.push(value); };
  add(/confirmed|booked|approved|पक्का/, "confirmed");
  add(/pending|open|बाकी/, "pending");
  add(/follow.?up|फॉलो/, "follow_up");
  add(/rejected|cancelled|canceled|रद्द/, "cancelled");
  add(/running|in progress|ongoing|चल रहा/, "running");
  add(/upcoming|scheduled|आने वाला/, "upcoming");
  add(/completed|complete|done|पूरा/, "completed");
  add(/unresolved/, "unresolved");
  return {command: text(command), normalized, intent, range, statuses, dateBasis: /shifting date|moving date|शिफ्टिंग/.test(normalized) ? "shifting" : "created"};
}

function recordStatus(row, intent) {
  const raw = text(first(row, ["quotation_status", "quotationStatus", "followUpStatus", "follow_up_status", "job_status", "work_status", "task_status", "payment_status", "approval_status", "status"]));
  const normalized = key(raw);
  if (intent === "quotation") {
    if (/confirmed|booked|approved|won|converted/.test(normalized)) return "confirmed";
    if (/rejected|cancelled|canceled|lost/.test(normalized)) return "cancelled";
    if (/pending|open/.test(normalized)) return "pending";
    return "follow_up";
  }
  if (intent === "jobs" || intent === "planning") {
    if (/completed|complete|done|delivered|closed/.test(normalized)) return "completed";
    if (/cancelled|canceled|rejected/.test(normalized)) return "cancelled";
    if (/running|inprogress|ongoing|started/.test(normalized)) return "running";
    if (/upcoming|scheduled|assigned/.test(normalized)) return "upcoming";
  }
  return raw || "Not recorded";
}

function matchesStatuses(row, parsed) {
  if (!parsed.statuses.length) return true;
  const status = key(recordStatus(row, parsed.intent));
  return parsed.statuses.some((wanted) => status.includes(key(wanted)) || (wanted === "unresolved" && !/resolved|closed|completed|cancelled/.test(status)));
}

function reference(row) { return text(first(row, ["quotation_number", "quotationNo", "quotationId", "planning_no", "planningNo", "job_id", "jobId", "invoice_no", "agreement_id", "task_id", "complaint_number"])) || row.id; }
function customer(row) { return text(first(row, ["customer_name", "customerName", "party_name", "partyName", "client_name", "name"])); }
function mobile(row) { return text(first(row, ["party_mobile", "partyMobile", "customer_mobile", "customerMobile", "mobile", "phone"])).replace(/\D/g, "").slice(-10); }
function createdTime(row) { const value = first(row, ["createdAt", "created_at", "createdAtText", "savedAt", "timestamp", "updatedAt", "updated_at", "updatedAtText", "dateText"]); try { const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value); return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString("en-IN", {timeZone: TIME_ZONE}); } catch { return "Not recorded"; } }

function normalizeRecord(row, parsed) {
  const status = recordStatus(row, parsed.intent);
  return {
    module: row._intent || row.module || row.collection || parsed.intent,
    collection: row._collection,
    id: row.id,
    reference: reference(row),
    customer: customer(row),
    mobile: mobile(row),
    from: text(first(row, ["from_location", "fromLocation", "pickup_location", "origin", "from"])),
    to: text(first(row, ["to_location", "toLocation", "delivery_location", "destination", "to"])),
    amount: number(first(row, ["total_amount", "totalAmount", "quotation_amount", "final_amount", "grand_total", "balance_due", "pending_amount", "amount"])),
    createdTime: createdTime(row),
    operationDate: normalizeStoredDate(first(row, ["work_start_date", "work_date", "shifting_date", "shiftingDate", "date"])),
    status,
    driver: text(first(row, ["driver_name", "driverName", "assigned_driver", "driver", "team_leader"])),
    workers: text(first(row, ["workers_name", "worker_names", "assigned_workers", "workers", "team_members"])),
    vehicle: text(first(row, ["vehicle_number", "vehicleNumber", "vehicle_no", "assigned_vehicle"])),
    staff: text(first(row, ["staff_name", "employee_name", "assigned_staff", "assigned_to", "author_name", "created_by_name"])),
    raw: row
  };
}

function commentItems(record) {
  const rows = [];
  COMMENT_FIELDS.forEach((field) => {
    const value = record.raw?.[field];
    const add = (entry) => {
      const content = typeof entry === "object" && entry ? text(first(entry, ["comment", "text", "note", "remark", "message", "resolutionSummary"])) : text(entry);
      if (!content) return;
      const dateValue = typeof entry === "object" ? first(entry, ["createdAt", "updatedAt", "createdAtText", "updatedAtText", "dateText", "date", "timestamp"]) : first(record.raw, ["updatedAt", "updatedAtText", "createdAt", "created_at", "date"]);
      rows.push({module: record.module, collection: record.collection, reference: record.reference, customer: record.customer, text: content, author: typeof entry === "object" ? text(first(entry, ["author", "authorName", "staff_name", "employee_name", "updatedBy", "createdBy"])) : record.staff, dateTime: typeof entry === "object" ? createdTime(entry) : record.createdTime, dateKey: normalizeStoredDate(dateValue), status: typeof entry === "object" ? text(first(entry, ["status", "state"])) || record.status : record.status});
    };
    if (Array.isArray(value)) value.forEach(add); else add(value);
  });
  return rows;
}

function safeDiagnostics(diagnostics, range) {
  const bounds = utcBounds(range);
  return diagnostics.map((item) => ({collection: item.collection, module: item.module || null, discriminator: item.discriminator || null, dateFields: item.dateFields, start: bounds.start.toISOString(), endExclusive: bounds.end.toISOString(), totalRecords: item.totalRecords, invalidRecords: item.invalidRecords, invalidCountComplete: item.invalidCountComplete, scannedForQuality: item.scannedForQuality, truncated: item.truncated, queryErrors: (item.errors || []).map((error) => ({field: error.field, mode: error.mode, code: error.code}))}));
}

function recordLine(record, index) {
  return `${index + 1}. ${record.customer || record.reference || "Record"}\n   ID: ${record.reference || "Not recorded"}\n   Mobile: ${record.mobile || "Not recorded"}\n   Route: ${record.from || "Not recorded"} → ${record.to || "Not recorded"}\n   Amount: ${money(record.amount)}\n   Created: ${record.createdTime}\n   Execution/Shifting Date: ${record.operationDate || "Not recorded"}\n   Status: ${record.status}\n   Driver: ${record.driver || "Not recorded"}\n   Workers: ${record.workers || "Not recorded"}\n   Source: ${record.collection}/${record.id}`;
}

function buildReport(parsed, queryResult, refreshedAt = new Date()) {
  let records = queryResult.rows.map((row) => normalizeRecord(row, parsed)).filter((row) => matchesStatuses(row.raw, parsed));
  let comments = [];
  if (parsed.intent === "comments") { comments = records.flatMap(commentItems).filter((item) => !item.dateKey || (item.dateKey >= parsed.range.from && item.dateKey <= parsed.range.to)); records = []; }
  const total = parsed.intent === "comments" ? comments.length : records.length;
  const sources = [...new Set(queryResult.diagnostics.map((item) => item.module ? `${item.collection}(${item.discriminator}=${item.module})` : item.collection))];
  const header = `Report Name: ${parsed.intent === "comments" ? "Comments Report" : `${parsed.intent[0].toUpperCase()}${parsed.intent.slice(1)} Report`}\nApplied Date/Date Range: ${parsed.range.label} (${parsed.range.from} to ${parsed.range.to})\nData Source/Module: ${sources.join(", ") || "No source mapped"}\nTotal Matching Records: ${total}\nLast Refreshed Time: ${refreshedAt.toLocaleString("en-IN", {timeZone: TIME_ZONE})}`;
  const diagnostics = safeDiagnostics(queryResult.diagnostics, parsed.range);
  if (!total) {
    const lines = diagnostics.map((item) => `• ${item.collection}${item.module ? ` [${item.discriminator}=${item.module}]` : ""}\n  Date fields: ${item.dateFields.join(", ")}\n  Applied: ${item.start} → ${item.endExclusive}\n  Total records: ${item.totalRecords ?? "Unavailable"}\n  Missing/invalid date records: ${item.invalidRecords ?? "Unavailable"}${item.invalidCountComplete ? "" : " (bounded scan; exact total not verified)"}\n  Query errors: ${item.queryErrors.length ? item.queryErrors.map((error) => `${error.field}/${error.mode}:${error.code}`).join(", ") : "None"}`);
    return {success: true, reportText: `${header}\n\nStatus: NO MATCHING LIVE RECORD\nData could not be verified as a matching record; no value was fabricated.\n\nQUERY DIAGNOSTIC\n${lines.join("\n") || "No mapped collection was queried."}`, records: [], comments: [], diagnostics};
  }
  if (parsed.intent === "comments") {
    const lines = comments.slice(0, 100).map((item, index) => `${index + 1}. [${item.module}] ${item.reference || "No ID"} — ${item.customer || "No customer"}\n   Comment: ${item.text}\n   Author: ${item.author || "Not recorded"}\n   Date/Time: ${item.dateTime}\n   Status: ${item.status || "Not recorded"}\n   Source: ${item.collection}`);
    return {success: true, reportText: `${header}\n\nSUMMARY\n• Matching comments: ${comments.length}\n\nCOMMENTS\n${lines.join("\n\n")}`, records: [], comments, diagnostics};
  }
  const statusCounts = records.reduce((output, record) => { const value = text(record.status) || "Not recorded"; output[value] = (output[value] || 0) + 1; return output; }, {});
  return {success: true, reportText: `${header}\n\nSUMMARY\n${Object.entries(statusCounts).map(([status, count]) => `• ${status}: ${count}`).join("\n")}\n• Recorded amount: ${money(records.reduce((sum, record) => sum + record.amount, 0))}\n\nMATCHING RECORDS\n${records.slice(0, 100).map(recordLine).join("\n\n")}`, records, comments: [], diagnostics};
}

module.exports = {buildReport, parseCommand};
