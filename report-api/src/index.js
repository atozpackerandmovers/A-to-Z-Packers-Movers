"use strict";

const {getApps, initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {defineSecret} = require("firebase-functions/params");
const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {createFirestoreRepository} = require("./firestore-repository");
const {createEmulatorFixtureRepository} = require("./emulator-fixture-repository");
const {createDailyOperationsHandler} = require("./http-handler");

if (!getApps().length) initializeApp();

const DAILY_REPORT_API_TOKEN = defineSecret("DAILY_REPORT_API_TOKEN");
const useSafeEmulatorFixture = process.env.FUNCTIONS_EMULATOR === "true" && process.env.REPORT_API_USE_LOCAL_FIXTURE === "true";
const repository = useSafeEmulatorFixture ? createEmulatorFixtureRepository() : createFirestoreRepository(getFirestore());
const handler = createDailyOperationsHandler({
  repository,
  tokenProvider: () => DAILY_REPORT_API_TOKEN.value(),
  logger
});

exports.dailyOperationsReport = onRequest({
  region: "asia-south1",
  memory: "256MiB",
  timeoutSeconds: 60,
  minInstances: 0,
  maxInstances: 2,
  concurrency: 20,
  cors: false,
  secrets: [DAILY_REPORT_API_TOKEN]
}, handler);
