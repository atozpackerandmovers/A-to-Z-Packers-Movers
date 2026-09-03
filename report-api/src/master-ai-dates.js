"use strict";

const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const HINDI_DIGITS = {"०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9"};
const MONTHS = {
  january: 1, jan: 1, "जनवरी": 1,
  february: 2, feb: 2, "फरवरी": 2, "फ़रवरी": 2,
  march: 3, mar: 3, "मार्च": 3,
  april: 4, apr: 4, "अप्रैल": 4,
  may: 5, "मई": 5,
  june: 6, jun: 6, "जून": 6,
  july: 7, jul: 7, "जुलाई": 7,
  august: 8, aug: 8, "अगस्त": 8,
  september: 9, sept: 9, sep: 9, "सितंबर": 9, "सितम्बर": 9,
  october: 10, oct: 10, "अक्टूबर": 10,
  november: 11, nov: 11, "नवंबर": 11, "नवम्बर": 11,
  december: 12, dec: 12, "दिसंबर": 12, "दिसम्बर": 12,
};
const MONTH_PATTERN = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

function normalizeDigits(value) {
  return String(value || "").replace(/[०-९]/g, (digit) => HINDI_DIGITS[digit]);
}

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
  const text = normalizeDigits(value).toLowerCase().trim().replace(/,/g, " ").replace(/\s+/g, " ");
  let match = text.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) return validDate(match[1], match[2], match[3]);
  match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](20\d{2})$/);
  if (match) return validDate(match[3], match[2], match[1]);
  match = text.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH_PATTERN})\\s+(20\\d{2})$`, "u"));
  if (match) return validDate(match[3], MONTHS[match[2]], match[1]);
  match = text.match(new RegExp(`^(${MONTH_PATTERN})\\s+(\\d{1,2})\\s+(20\\d{2})$`, "u"));
  return match ? validDate(match[3], MONTHS[match[1]], match[2]) : "";
}

function addDays(iso, amount) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function explicitDateTokens(text) {
  const candidates = [];
  const patterns = [
    /(?:^|\s)(20\d{2}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2})(?=\s|$)/gu,
    new RegExp(`(?:^|\\s)(\\d{1,2}\\s+(?:${MONTH_PATTERN})\\s+20\\d{2})(?=\\s|$|[?.!,।])`, "gu"),
    new RegExp(`(?:^|\\s)((?:${MONTH_PATTERN})\\s+\\d{1,2},?\\s+20\\d{2})(?=\\s|$|[?.!,।])`, "gu"),
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const date = parseDateToken(match[1]);
      if (date) candidates.push({date, index: match.index + match[0].indexOf(match[1])});
    }
  }
  return candidates.sort((a, b) => a.index - b.index).map(({date}) => date);
}

function parseRange(command, now = new Date()) {
  const text = normalizeDigits(command).toLowerCase().replace(/\s+/g, " ").trim();
  const today = dateKey(now);
  const tokens = explicitDateTokens(text);
  if (tokens.length >= 2 && /\bto\b|\bse\b|से|–|—/.test(text)) {
    const [from, to] = tokens[0] <= tokens[1] ? [tokens[0], tokens[1]] : [tokens[1], tokens[0]];
    return {from, to, label: `${from} to ${to}`};
  }
  if (tokens.length) return {from: tokens[0], to: tokens[0], label: tokens[0]};
  if (/\btoday\b|\baaj\b|आज/.test(text)) return {from: today, to: today, label: "Today"};
  if (/\btomorrow\b|आने वाला कल/.test(text)) { const date = addDays(today, 1); return {from: date, to: date, label: "Tomorrow"}; }
  if (/\byesterday\b|\bkal\b|कल|बीता कल/.test(text)) { const date = addDays(today, -1); return {from: date, to: date, label: "Yesterday"}; }
  return null;
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
