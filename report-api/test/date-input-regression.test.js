"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {parseRange} = require("../src/master-ai-dates");
const {createMasterAiHandler} = require("../src/master-ai-handler");
const {buildReport, parseCommand} = require("../src/master-ai-report");
const now = new Date("2026-09-11T08:00:00Z");
test("punctuation after numeric Hindi dates does not fall back to today", () => {
  assert.equal(parseRange("२७/०८/२०२६? कोटेशन", now).from, "2026-08-27");
  assert.equal(parseRange("quotations 27-08-2026.", now).from, "2026-08-27");
});
test("invalid dates fail rather than silently returning today's records", () => {
  assert.throws(() => parseRange("quotation 31/02/2026", now), RangeError);
  assert.throws(() => parseRange("quotation 01/02/2026 to 31/02/2026", now), RangeError);
});
test("between and spaced-hyphen ranges include both endpoints", () => {
  for (const command of ["quotations between 01/08/2026 and 27/08/2026", "quotations 01/08/2026 - 27/08/2026"]) {
    assert.deepEqual(parseRange(command, now), {from: "2026-08-01", to: "2026-08-27", label: "2026-08-01 to 2026-08-27"});
  }
});
test("invalid date returns HTTP 400 without a database query", async () => {
  let reads=0;
  const handler=createMasterAiHandler({repository:{queryIntent:()=>{reads++;},queryComments:()=>{reads++;}},verifyToken:async()=>({uid:"test-admin",masterAiAdmin:true}),clock:()=>now});
  const response={status(code){this.code=code;return this;},set(){return this;},json(body){this.body=body;return this;}};
  await handler({method:"POST",headers:{authorization:"Bearer local-test"},body:{command:"quotation 31/02/2026"}},response);
  assert.equal(response.code,400);assert.equal(reads,0);assert.match(response.body.error,/Invalid calendar date/);
});
test("query failure or truncation never reports a verified zero", () => {
  for (const diagnostic of [{errors:[{code:"permission-denied"}]},{truncated:true}]) {
    assert.throws(()=>buildReport(parseCommand("today quotations",now),{rows:[],diagnostics:[diagnostic]},now),/could not be verified/);
  }
});
test("created timestamp takes precedence over a conflicting quotation date", () => {
  const row={id:"test",quotation_number:"TEST-1",created_at:"2026-09-10T09:00:00Z",quotation_date:"2026-09-11"};
  const diagnostic={collection:"quotations",dateFields:["created_at","quotation_date"],errors:[]};
  assert.equal(buildReport(parseCommand("today quotations",now),{rows:[row],diagnostics:[diagnostic]},now).records.length,0);
  assert.equal(buildReport(parseCommand("yesterday quotations",now),{rows:[row],diagnostics:[diagnostic]},now).records.length,1);
});
