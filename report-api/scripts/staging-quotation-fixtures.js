"use strict";

const {applicationDefault, getApps, initializeApp} = require("firebase-admin/app");
const {getFirestore, Timestamp} = require("firebase-admin/firestore");
const {addDays, dateKey, normalizeStoredDate, utcBounds} = require("../src/master-ai-dates");
const {DATE_FIELDS} = require("../src/master-ai-schema");

const STAGING_PROJECT_ID = "a-to-z-gps-staging";
const FIXTURE_VERSION = "master-ai-live-reports-v1";

function selectedProject() {
  return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || process.env.STAGING_PROJECT_ID || "";
}

function stagingDatabase() {
  const projectId = selectedProject();
  if (projectId !== STAGING_PROJECT_ID) throw new Error(`Safety stop: expected ${STAGING_PROJECT_ID}, received ${projectId || "no project"}.`);
  const app = getApps()[0] || initializeApp({credential: applicationDefault(), projectId});
  return getFirestore(app);
}

function instant(date, hoursAfterIndiaMidnight) {
  const start = utcBounds({from: date, to: date}).start.getTime();
  return new Date(start + hoursAfterIndiaMidnight * 60 * 60 * 1000);
}

function displayDate(date, separator) {
  const [year, month, day] = date.split("-");
  return [day, month, year].join(separator);
}

function baseRecord(index, date, status) {
  return {
    quotation_number: `STAGE-Q-${date.replaceAll("-", "")}-${index}`,
    customer_name: `Sanitized Staging Customer ${index}`,
    party_mobile: "0000000000",
    from_location: "Staging Origin",
    to_location: "Staging Destination",
    total_amount: 1000 * index,
    status,
    stagingFixture: true,
    fixtureVersion: FIXTURE_VERSION,
  };
}

function fixturePlan(now = new Date()) {
  const today = dateKey(now);
  const yesterday = addDays(today, -1);
  const oldDates = [addDays(today, -7), addDays(today, -31), addDays(today, -370)];
  const records = [
    {id: "master-ai-fixture-today-timestamp", expectedDate: today, data: {...baseRecord(1, today, "confirmed"), createdAt: Timestamp.fromDate(instant(today, 10))}},
    {id: "master-ai-fixture-today-iso", expectedDate: today, data: {...baseRecord(2, today, "pending"), created_at: instant(today, 15).toISOString()}},
    {id: "master-ai-fixture-yesterday-canonical", expectedDate: yesterday, data: {...baseRecord(3, yesterday, "follow_up"), quotation_date: yesterday}},
    {id: "master-ai-fixture-old-dd-mm", expectedDate: oldDates[0], data: {...baseRecord(4, oldDates[0], "cancelled"), quotation_date: displayDate(oldDates[0], "-")}},
    {id: "master-ai-fixture-old-dd-slash", expectedDate: oldDates[1], data: {...baseRecord(5, oldDates[1], "pending"), quotation_date: displayDate(oldDates[1], "/")}},
    {id: "master-ai-fixture-old-yyyy-slash", expectedDate: oldDates[2], data: {...baseRecord(6, oldDates[2], "confirmed"), quotation_date: oldDates[2].replaceAll("-", "/")}},
  ];
  records.push({
    id: "master-ai-fixture-duplicate-quotation-id",
    expectedDate: oldDates[0],
    data: {...records[3].data, duplicateFixture: true},
  });
  return {today, yesterday, oldDates, records};
}

function quotationCreatedDate(data) {
  for (const field of DATE_FIELDS.quotationCreated) {
    const normalized = normalizeStoredDate(data[field]);
    if (normalized) return normalized;
  }
  return "";
}

function uniqueQuotationCount(rows, date) {
  const identities = new Set();
  rows.forEach((row) => {
    if (quotationCreatedDate(row) !== date) return;
    identities.add(String(row.quotation_number || row.quotationNo || row.quotationId || row.id));
  });
  return identities.size;
}

module.exports = {FIXTURE_VERSION, STAGING_PROJECT_ID, fixturePlan, quotationCreatedDate, stagingDatabase, uniqueQuotationCount};
