"use strict";

const {Filter} = require("firebase-admin/firestore");
const {MAIN_COLLECTION, MAX_RECORDS_PER_MODULE, MODULES} = require("./constants");

class DataVolumeLimitError extends Error {
  constructor(moduleName, limit) {
    super(`Safe read limit reached for ${moduleName} (${limit} records).`);
    this.name = "DataVolumeLimitError";
    this.moduleName = moduleName;
    this.limit = limit;
  }
}

function snapshotRows(snapshot) {
  return snapshot.docs.map((document) => ({id: document.id, ...document.data()}));
}

function createFirestoreRepository(db, options = {}) {
  const limit = options.limit || MAX_RECORDS_PER_MODULE;
  const collection = db.collection(options.collectionName || MAIN_COLLECTION);

  async function moduleRows(moduleName) {
    const discriminator = Filter.or(
      Filter.where("module", "==", moduleName),
      Filter.where("collection", "==", moduleName)
    );
    const snapshot = await collection.where(discriminator).limit(limit).get();
    if (snapshot.size >= limit) throw new DataVolumeLimitError(moduleName, limit);
    return snapshotRows(snapshot);
  }

  async function loadReportSource() {
    const requested = Object.values(MODULES);
    const entries = await Promise.all(requested.map(async (moduleName) => [moduleName, await moduleRows(moduleName)]));
    return Object.fromEntries(entries);
  }

  return {loadReportSource, moduleRows};
}

module.exports = {createFirestoreRepository, DataVolumeLimitError};
