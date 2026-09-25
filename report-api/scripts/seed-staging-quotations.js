"use strict";

const {fixturePlan, STAGING_PROJECT_ID, stagingDatabase} = require("./staging-quotation-fixtures");

async function main() {
  const db = stagingDatabase();
  const plan = fixturePlan();
  const batch = db.batch();
  plan.records.forEach((record) => batch.set(db.collection("quotations").doc(record.id), record.data));
  await batch.commit();
  console.log("SANITIZED STAGING FIXTURES WRITTEN");
  console.log(`Project: ${STAGING_PROJECT_ID}`);
  console.log("Collection: quotations");
  console.log(`Documents written: ${plan.records.length} (includes one intentional duplicate quotation ID)`);
  console.log(`Expected unique counts: today ${plan.today}=2; yesterday ${plan.yesterday}=1; ${plan.oldDates.map((date) => `${date}=1`).join("; ")}`);
}

main().catch((error) => {
  console.error("STAGING SEED FAILED:", error.code || error.message);
  process.exitCode = 1;
});
