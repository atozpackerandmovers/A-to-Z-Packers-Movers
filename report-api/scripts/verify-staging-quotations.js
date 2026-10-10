"use strict";

const {createMasterAiRepository} = require("../src/master-ai-repository");
const {FIXTURE_VERSION, fixturePlan, stagingDatabase, uniqueQuotationCount} = require("./staging-quotation-fixtures");

async function main() {
  const db = stagingDatabase();
  const repository = createMasterAiRepository(db);
  const plan = fixturePlan();
  const fixtureSnapshot = await db.collection("quotations").where("fixtureVersion", "==", FIXTURE_VERSION).get();
  const fixtureRows = fixtureSnapshot.docs.map((document) => ({id: document.id, ...document.data()}));
  const dates = [plan.today, plan.yesterday, ...plan.oldDates];
  const results = [];

  for (const date of dates) {
    const manual = uniqueQuotationCount(fixtureRows, date);
    const report = await repository.queryIntent("quotation", {from: date, to: date, label: date}, {dateBasis: "created"});
    const masterAi = report.rows.filter((row) => row.fixtureVersion === FIXTURE_VERSION).length;
    results.push({date, manual, masterAi, result: manual === masterAi ? "PASS" : "FAIL"});
  }

  console.log("STAGING QUOTATION COUNT COMPARISON");
  console.table(results);
  console.log(`Fixture documents read: ${fixtureRows.length}; unique quotations: ${new Set(fixtureRows.map((row) => row.quotation_number)).size}`);
  if (results.some((row) => row.result !== "PASS")) process.exitCode = 1;
}

main().catch((error) => {
  console.error("STAGING VERIFY FAILED:", error.code || error.message);
  process.exitCode = 1;
});
