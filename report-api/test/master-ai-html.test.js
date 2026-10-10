"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const htmlPath = path.resolve(__dirname, "../../staging/test.driver.master-ai-staging.html");
const html = fs.readFileSync(htmlPath, "utf8");
const block = html.slice(html.indexOf("/* MASTER AI"), html.indexOf("async function boot()"));

test("staging build is locked to the non-production Firebase project", () => {
  assert.match(html, /EXPECTED_STAGING_PROJECT='a-to-z-gps-staging'/);
  assert.match(html, /__AZP_STAGING_FIREBASE_CONFIG__/);
  assert.doesNotMatch(html, /projectId:'az-packers-quotation'/);
  assert.doesNotMatch(html, /asia-south1-az-packers-quotation\.cloudfunctions\.net/);
});

test("Master AI uses secure server report API and Firebase ID token", () => {
  assert.match(block, /authUser\.getIdToken\(true\)/);
  assert.match(block, /X-Firebase-Authorization/);
  assert.match(block, /'Authorization'/);
  assert.match(block, /\[authHeader\]:`Bearer \$\{token\}`/);
  assert.match(block, /masterAiReport/);
});

test("Master AI does not write production data", () => {
  assert.doesNotMatch(block, /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\s*\(/);
});

test("Admin gate requires Firebase UID and custom claim verification", () => {
  assert.match(html, /masterAiClaimVerified===true/);
  assert.match(html, /claims\?\.masterAiAdmin!==true/);
  assert.match(html, /firebaseUid.*authUser\.uid/);
});

test("generic word report cannot become a quotation identifier", () => {
  assert.match(block, /generic=new Set\(\['report','quotation report'/);
  assert.doesNotMatch(block, /\(\?:party\|customer\|quotation\|booking\|job\|for\|of\)/);
});

test("all quick actions are mobile-safe buttons and one new command clears prior result", () => {
  const quick = block.match(/<div class="azp-master-ai-quick">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.ok((quick.match(/<button /g) || []).length >= 8);
  assert.equal((quick.match(/<button /g) || []).length, (quick.match(/<button data-master-ai-q=/g) || []).length);
  assert.match(block, /maiMessages\.length=0;maiMessages\.push\(\{role:'user'/);
});

test("Master AI repository source contains no Firestore mutation method", () => {
  const repository = fs.readFileSync(path.resolve(__dirname, "../src/master-ai-repository.js"), "utf8");
  assert.doesNotMatch(repository, /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/);
  assert.doesNotMatch(repository, /\.doc\([^)]*\)\.(?:set|create|update|delete)\s*\(/);
});
