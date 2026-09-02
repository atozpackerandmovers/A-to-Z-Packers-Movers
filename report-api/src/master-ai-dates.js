"use strict";

const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function dateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function validDate(year, month, day) {
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const test = new Date(`${iso}T12:00:00Z`);
  return test.getUTCFullYear() === Number(year) && test.getUTCMonth() + 1 === Number(month) && test.getUTCDate() === Number(day) ? iso : "";
}

function parseDateToken(value) {
  const text = String(value || "").trim();
  let match = text.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) return validDate(match[1], match[2], match[3]);
  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](20\d{2})$/);
  return match ? validDate(match[3], match[2], match[1]) : "";
}

function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function parseRange(command, now = new Date()) {
  const text = String(command || "").toLowerCase().replace(/\s+/g, " ").trim();
  const today = dateKey(now);
  if (/\btoday\b|\baaj\b|आज/.test(text)) return {from: today, to: today, label: "Today"};
  if (/\btomorrow\b|आने वाला कल/.test(text)) { const date = addDays(today, 1); return {from: date, to: date, label: "Tomorrow"}; }
  if (/\byesterday\b|\bkal\b|कल|बीता कल/.test(text)) { const date = addDays(today, -1); return {from: date, to: date, label: "Yesterday"}; }
  const tokens = [...text.matchAll(/(?:^|\s)(20\d{2}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2})(?=\s|$)/g)].map((match) => parseDateToken(match[1])).filter(Boolean);
  if (tokens.length >= 2 && /\bto\b|\bse\b|से|–|—/.test(text)) {
    const [from, to] = tokens[0] <= tokens[1] ? [tokens[0], tokens[1]] : [tokens[1], tokens[0]];
    return {from, to, label: `${from} to ${to}`};
  }
  return tokens.length ? {from: tokens[0], to: tokens[0], label: tokens[0]} : null;
}

function utcBounds(range) {
  const start = new Date(Date.parse(`${range.from}T00:00:00Z`) - IST_OFFSET_MS);
  const end = new Date(Date.parse(`${addDays(range.to, 1)}T00:00:00Z`) - IST_OFFSET_MS);
  return {start, end};
}

function normalizeStoredDate(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value?.toDate === "function") return dateKey(value.toDate());
  if (typeof value?.seconds === "number") return dateKey(new Date(value.seconds * 1000));
  if (typeof value === "number") return dateKey(new Date(value < 1e11 ? value * 1000 : value));
  const text = String(value).trim();
  const token = parseDateToken(text);
  if (token) return token;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : dateKey(parsed);
}

module.exports = {TIME_ZONE, addDays, dateKey, normalizeStoredDate, parseDateToken, parseRange, utcBounds};
