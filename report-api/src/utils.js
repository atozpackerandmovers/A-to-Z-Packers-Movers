"use strict";

const crypto = require("node:crypto");
const {TIME_ZONE} = require("./constants");

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function finiteNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function firstText(source, keys) {
  for (const key of keys) {
    const value = normalizeText(source?.[key]);
    if (value) return value;
  }
  return "";
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const raw = source?.[key];
    if (raw === "" || raw === null || raw === undefined) continue;
    const number = Number(raw);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function indiaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseOperationalDate(value) {
  const text = normalizeText(value);
  if (validIsoDate(text)) return text;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const iso = `${slash[3]}-${String(slash[2]).padStart(2, "0")}-${String(slash[1]).padStart(2, "0")}`;
    return validIsoDate(iso) ? iso : "";
  }
  return "";
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return asDate(value.toDate());
  if (Number.isFinite(Number(value?._seconds))) return new Date(Number(value._seconds) * 1000);
  if (Number.isFinite(Number(value?.seconds))) return new Date(Number(value.seconds) * 1000);
  if (typeof value === "number") return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoTimestamp(value) {
  const date = asDate(value);
  return date ? date.toISOString() : null;
}

function indiaDateFromTimestamp(value) {
  const date = asDate(value);
  return date ? indiaDate(date) : "";
}

function utcDateFromTimestamp(value) {
  const date = asDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function recordTimestamp(record) {
  return record?.dispatch_time || record?.issue_time || record?.createdAt || record?.updatedAt || record?.updated_at || null;
}

function compareToken(provided, expected) {
  if (!provided || !expected) return false;
  const a = crypto.createHash("sha256").update(String(provided)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function stableNameSort(a, b) {
  return normalizeText(a?.employeeName || a?.materialName || a?.name)
    .localeCompare(normalizeText(b?.employeeName || b?.materialName || b?.name), "en", {sensitivity: "base"});
}

function severityRank(severity) {
  return {critical: 0, error: 1, warning: 2, info: 3}[severity] ?? 4;
}

function warning(severity, code, message, context = undefined) {
  const output = {severity, code, message};
  if (context !== undefined) output.context = context;
  return output;
}

function uniqueById(records) {
  const byId = new Map();
  records.forEach((record, index) => {
    const id = normalizeText(record?.id) || `index:${index}`;
    const previous = byId.get(id);
    const previousTime = asDate(previous?.updatedAt)?.getTime() || finiteNumber(previous?.updatedAtMs);
    const nextTime = asDate(record?.updatedAt)?.getTime() || finiteNumber(record?.updatedAtMs);
    if (!previous || nextTime >= previousTime) byId.set(id, record);
  });
  return [...byId.values()];
}

module.exports = {
  asDate,
  compareToken,
  finiteNumber,
  firstNumber,
  firstText,
  indiaDate,
  indiaDateFromTimestamp,
  isoTimestamp,
  normalizeKey,
  normalizeText,
  parseOperationalDate,
  recordTimestamp,
  severityRank,
  stableNameSort,
  uniqueById,
  utcDateFromTimestamp,
  validIsoDate,
  warning
};
