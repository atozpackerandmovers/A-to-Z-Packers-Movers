"use strict";

const {Timestamp} = require("firebase-admin/firestore");
const {normalizeStoredDate, utcBounds} = require("./master-ai-dates");
const {DATE_FIELDS, DIRECT_COLLECTIONS, EXECUTION_MODULES, MAIN_COLLECTION} = require("./master-ai-schema");

const PAGE_SIZE = 100;
const MAX_MATCHES_PER_SOURCE = 1000;
const MAX_QUALITY_SCAN = 2000;
const TIMESTAMP_FIELDS = new Set(["createdAt", "updatedAt", "savedAt", "timestamp"]);
const INSTANT_STRING_FIELDS = new Set(["created_at", "updated_at", "createdAtText", "updatedAtText"]);
const EPOCH_FIELDS = new Set(["sortTime", "createdAtMs", "updatedAtMs"]);

function row(document, collection) { return {id: document.id, _collection: collection, ...document.data()}; }
function uniqueRows(rows) { return [...new Map(rows.map((item) => [`${item._collection}/${item.id}`, item])).values()]; }

function rangeQuery(base, field, range, mode) {
  const bounds = utcBounds(range);
  if (mode === "timestamp") return base.where(field, ">=", Timestamp.fromDate(bounds.start)).where(field, "<", Timestamp.fromDate(bounds.end)).orderBy(field);
  if (mode === "instant") return base.where(field, ">=", bounds.start.toISOString()).where(field, "<", bounds.end.toISOString()).orderBy(field);
  if (mode === "epoch-ms") return base.where(field, ">=", bounds.start.getTime()).where(field, "<", bounds.end.getTime()).orderBy(field);
  if (mode === "epoch-seconds") return base.where(field, ">=", Math.floor(bounds.start.getTime() / 1000)).where(field, "<", Math.floor(bounds.end.getTime() / 1000)).orderBy(field);
  return base.where(field, ">=", range.from).where(field, "<=", range.to).orderBy(field);
}

async function readPages(query, collectionName, cap = MAX_MATCHES_PER_SOURCE) {
  const rows = [];
  let cursor = null;
  while (rows.length < cap) {
    let page = query.limit(Math.min(PAGE_SIZE, cap - rows.length));
    if (cursor) page = page.startAfter(cursor);
    const snapshot = await page.get();
    snapshot.docs.forEach((document) => rows.push(row(document, collectionName)));
    if (snapshot.size < Math.min(PAGE_SIZE, cap - rows.length + snapshot.size) || !snapshot.docs.length) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
  return {rows, truncated: rows.length >= cap};
}

async function queryField(base, collectionName, field, range) {
  const modes = TIMESTAMP_FIELDS.has(field) ? ["timestamp", "instant", "epoch-ms", "epoch-seconds"] : EPOCH_FIELDS.has(field) ? ["epoch-ms", "epoch-seconds"] : INSTANT_STRING_FIELDS.has(field) ? ["instant"] : ["date"];
  const output = [];
  const errors = [];
  let truncated = false;
  for (const mode of modes) {
    try {
      const result = await readPages(rangeQuery(base, field, range, mode), collectionName);
      output.push(...result.rows); truncated ||= result.truncated;
    } catch (error) {
      errors.push({field, mode, code: String(error?.code || error?.message || "query-failed").slice(0, 120)});
    }
  }
  return {rows: output, errors, truncated};
}

async function sourceTotal(base) {
  try { return (await base.count().get()).data().count; } catch { return null; }
}

async function dateQuality(base, dateFields, total) {
  try {
    const snapshot = await base.select(...dateFields.slice(0, 10)).limit(MAX_QUALITY_SCAN).get();
    let missingOrInvalid = 0;
    snapshot.docs.forEach((document) => {
      const data = document.data();
      if (!dateFields.some((field) => normalizeStoredDate(data[field]))) missingOrInvalid += 1;
    });
    return {missingOrInvalid, scanned: snapshot.size, complete: total !== null && total <= snapshot.size};
  } catch { return {missingOrInvalid: null, scanned: 0, complete: false}; }
}

async function queryDirect(db, definition, range) {
  const base = db.collection(definition.collection);
  const total = await sourceTotal(base);
  const results = await Promise.all(definition.dateFields.map((field) => queryField(base, definition.collection, field, range)));
  const quality = await dateQuality(base, definition.dateFields, total);
  return {
    rows: uniqueRows(results.flatMap((result) => result.rows)),
    diagnostic: {collection: definition.collection, dateFields: definition.dateFields, totalRecords: total, invalidRecords: quality.missingOrInvalid, invalidCountComplete: quality.complete, scannedForQuality: quality.scanned, truncated: results.some((result) => result.truncated), errors: results.flatMap((result) => result.errors)}
  };
}

async function queryExecutionModule(db, moduleName, dateFields, range) {
  const collection = db.collection(MAIN_COLLECTION);
  const rows = [];
  const diagnostics = [];
  for (const discriminator of ["module", "collection"]) {
    const base = collection.where(discriminator, "==", moduleName);
    const total = await sourceTotal(base);
    const results = await Promise.all(dateFields.map((field) => queryField(base, MAIN_COLLECTION, field, range)));
    const quality = await dateQuality(base, dateFields, total);
    rows.push(...results.flatMap((result) => result.rows));
    diagnostics.push({collection: MAIN_COLLECTION, discriminator, module: moduleName, dateFields, totalRecords: total, invalidRecords: quality.missingOrInvalid, invalidCountComplete: quality.complete, scannedForQuality: quality.scanned, truncated: results.some((result) => result.truncated), errors: results.flatMap((result) => result.errors)});
  }
  return {rows: uniqueRows(rows), diagnostics};
}

function executionDateFields(intent) {
  if (intent === "jobs" || intent === "planning") return DATE_FIELDS.jobOperation;
  if (intent === "attendance") return DATE_FIELDS.attendance;
  return DATE_FIELDS.operational;
}

function compact(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function quoteReference(row) { return row.quotation_number || row.quotationNo || row.quotationId || row.id || ""; }
function rowTime(row) {
  for (const field of ["updatedAt", "updatedAtText", "createdAt", "created_at"]) {
    const value = row?.[field];
    if (typeof value?.toMillis === "function") return value.toMillis();
    const parsed = Date.parse(String(value || ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

async function quotationStatusOverlays(db, quotationRows) {
  const references = [...new Set(quotationRows.map(quoteReference).map(String).filter(Boolean))];
  const overlays = [];
  const errors = [];
  for (let index = 0; index < references.length; index += 30) {
    const chunk = references.slice(index, index + 30);
    for (const field of ["quotationId", "quotation_id", "quotation_number", "quotationNo"]) {
      try {
        const snapshot = await db.collection("quotationStatuses").where(field, "in", chunk).limit(1000).get();
        snapshot.docs.forEach((document) => overlays.push(row(document, "quotationStatuses")));
      } catch (error) { errors.push({field, mode: "identifier-join", code: String(error?.code || error?.message || "query-failed").slice(0, 120)}); }
    }
  }
  const latest = new Map();
  overlays.forEach((overlay) => {
    const reference = compact(quoteReference(overlay));
    if (!reference) return;
    const prior = latest.get(reference);
    if (!prior || rowTime(overlay) >= rowTime(prior)) latest.set(reference, overlay);
  });
  const rows = quotationRows.map((quote) => {
    const overlay = latest.get(compact(quoteReference(quote)));
    return overlay ? {...quote, status: overlay.status || quote.status, followUpStatus: overlay.followUpStatus || overlay.follow_up_status || quote.followUpStatus, confirmedDate: overlay.confirmedDate || quote.confirmedDate, cancelledDate: overlay.cancelledDate || quote.cancelledDate, _statusSource: "quotationStatuses"} : quote;
  });
  return {rows, diagnostic: {collection: "quotationStatuses", dateFields: ["updatedAt", "updatedAtText"], totalRecords: overlays.length, invalidRecords: null, invalidCountComplete: false, scannedForQuality: 0, truncated: overlays.length >= 1000, errors, join: "quotation identifier"}};
}

function createMasterAiRepository(db) {
  async function queryIntent(intent, range, options = {}) {
    const directDefinitions = intent === "quotation" && options.dateBasis === "shifting" ? [{collection: "quotations", dateFields: DATE_FIELDS.quotationShifting}] : (DIRECT_COLLECTIONS[intent] || []);
    const direct = await Promise.all(directDefinitions.map((definition) => queryDirect(db, definition, range)));
    const execution = await Promise.all((EXECUTION_MODULES[intent] || []).map((moduleName) => queryExecutionModule(db, moduleName, executionDateFields(intent), range)));
    let rows = uniqueRows([...direct.flatMap((result) => result.rows), ...execution.flatMap((result) => result.rows)]);
    const diagnostics = [...direct.map((result) => result.diagnostic), ...execution.flatMap((result) => result.diagnostics)];
    if (intent === "quotation" && rows.length) {
      const status = await quotationStatusOverlays(db, rows);
      rows = status.rows;
      diagnostics.push(status.diagnostic);
    }
    return {rows, diagnostics};
  }

  async function queryComments(range) {
    const intents = ["quotation", "planning", "payment", "agreement", "complaint", "task", "attendance", "fooding", "material", "fuel", "vehicle", "feedback", "salary"];
    const results = await Promise.all(intents.map(async (intent) => ({intent, result: await queryIntent(intent, range)})));
    return {rows: uniqueRows(results.flatMap(({intent, result}) => result.rows.map((item) => ({...item, _intent: intent})))), diagnostics: results.flatMap(({result}) => result.diagnostics)};
  }

  return Object.freeze({queryComments, queryIntent});
}

module.exports = {createMasterAiRepository, uniqueRows};
