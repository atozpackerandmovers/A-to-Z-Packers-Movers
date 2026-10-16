"use strict";

const CONFIG = Object.freeze({
  firebase: {
    apiKey: "AIzaSyC4I13JSUkhun5DgpgLlnyiimTzdPobT14",
    authDomain: "az-packers-quotation.firebaseapp.com",
    databaseURL: "https://az-packers-quotation-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "az-packers-quotation",
    storageBucket: "az-packers-quotation.firebasestorage.app",
    messagingSenderId: "682004383688",
    appId: "1:682004383688:web:19356c30fd90e66812a2fd"
  },
  root: "gpsProduction/v1",
  adminUid: "88IIhxscilQqcT0XsHqRpE0JC0V2",
  driverUid: "WoVSnY7tchXAVWFeP7UgJEuwlHu2",
  driverId: "DRIVER_MAHESH_001",
  vehicleId: "VEHICLE_OD33AR8855",
  rtdbConnectionTimeoutMs: 20000
});

const DRIVERS = Object.freeze([
  Object.freeze({
    name: "Mahesh",
    uid: "WoVSnY7tchXAVWFeP7UgJEuwlHu2",
    driverId: "DRIVER_MAHESH_001",
    vehicleId: "VEHICLE_OD33AR8855",
    vehicleNumber: "OD-33-AR-8855"
  }),
  Object.freeze({
    name: "Ajay",
    uid: "RpLO7VqVUaUBWc4XsBcMGYwYWqP2",
    driverId: "DRIVER_AJAY_001",
    vehicleId: "VEHICLE_OD05BD8855",
    vehicleNumber: "OD-05-BD-8855"
  })
]);

const BUILD_VERSION = "2026-10-16-status-read-errors-staging-v9.0.2";
const DASHBOARD_STORAGE_PREFIX = "az-gps-admin:";
const DASHBOARD_CACHE_MATCH = /(?:az-gps|gps-admin|dashboard|workbox|precache|runtime)/i;
const indexBuildVersion = document.querySelector('meta[name="application-version"]')?.content || "";
const linkedBuildVersions = Array.from(document.querySelectorAll("[data-dashboard-build]"))
  .map((element) => element.dataset.dashboardBuild || "");
const buildMarkersMatch = indexBuildVersion === BUILD_VERSION &&
  linkedBuildVersions.length === 2 &&
  linkedBuildVersions.every((version) => version === BUILD_VERSION);
let selectedDriver = DRIVERS[0];
let firebaseApp;
let auth;
let db;
let firebaseInitializationError = null;
try {
  if (!buildMarkersMatch) throw new Error("Dashboard HTML, JavaScript and CSS build markers do not match.");
  firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(CONFIG.firebase);
  auth = firebaseApp.auth();
} catch (error) {
  firebaseInitializationError = error;
  console.error("Firebase initializeApp failed", error);
}
const refs = [];
let trips = {};
const fleetLive = {};
const dataReadErrors = {};
const HISTORY_UNAVAILABLE = "History unavailable under current permissions; trip-list loading is suspended. No trip records were changed.";
const LIVE_FRESHNESS_MS = 120000;
const approval = {
  environmentEnabled: null,
  pilotMode: null,
  driverAccessEnabled: null,
  driverPilotEnabled: null,
  fullRolloutApproved: null,
  resetEnabled: null,
  profileResetEnabled: null
};
const diagnostics = {};
const buildApprovalPaths = (driver) => Object.freeze({
  environmentEnabled: "environment/enabled",
  pilotMode: "environment/pilotMode",
  driverAccessEnabled: `access/${driver.uid}/enabled`,
  driverPilotEnabled: `drivers/${driver.driverId}/profile/pilotEnabled`,
  fullRolloutApproved: "environment/fullRolloutApproved",
  resetEnabled: "environment/resetEnabled",
  profileResetEnabled: `drivers/${driver.driverId}/profile/resetEnabled`
});
let APPROVAL_PATHS = buildApprovalPaths(selectedDriver);
let commandPending = false;
let authInitialized = false;
let sessionGeneration = 0;
let approvalRun = 0;
let approvalAttempts = 0;
let reconnectRetryUsed = false;
let authRestorationRetryUsed = false;
let rtdbConnected = null;
let connectionState = "INITIALIZING";
let persistenceReady = Promise.resolve();
let connectionSequence = 0;
let connectionRecoveryUsed = false;
let transportMode = "INITIALIZING";
let transportConfigured = false;

const $ = (id) => document.getElementById(id);
const first = (obj, keys, fallback = null) => {
  for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  return fallback;
};
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const date = (value) => {
  const ms = number(value);
  return ms > 0 ? new Date(ms).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
};
const km = (meters) => `${(number(meters) / 1000).toFixed(2)} km`;
const listen = (path, callback, onUnavailable = () => {}) => {
  if (!db) return;
  const generation = sessionGeneration;
  const ref = db.ref(`${CONFIG.root}/${path}`);
  const onValue = (snapshot) => {
    if (generation !== sessionGeneration) return;
    delete dataReadErrors[path];
    renderDataReadErrors();
    callback(snapshot);
  };
  const onError = (error) => {
    if (generation !== sessionGeneration) return;
    dataReadErrors[path] = firebaseErrorLabel(error);
    renderDataReadErrors();
    onUnavailable();
  };
  ref.on("value", onValue, onError);
  refs.push(() => ref.off("value", onValue));
};
const clearListeners = () => refs.splice(0).forEach((off) => off());
const emptyRow = (message, columns = 5) => `<tr><td class="empty" colspan="${columns}">${message}</td></tr>`;

async function prepareBrowserRuntime() {
  try {
    sessionStorage.setItem(`${DASHBOARD_STORAGE_PREFIX}build`, BUILD_VERSION);
  } catch (error) {
    console.warn("Dashboard build marker could not be stored", error);
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const currentUrl = new URL(location.href);
      await Promise.all(registrations
        .filter((registration) => {
          try {
            const scope = new URL(registration.scope);
            return scope.origin === currentUrl.origin && currentUrl.pathname.startsWith(scope.pathname);
          } catch (error) {
            return false;
          }
        })
        .map((registration) => registration.unregister()));
    }
  } catch (error) {
    console.warn("Obsolete dashboard service worker cleanup failed", error);
  }

  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => DASHBOARD_CACHE_MATCH.test(name)).map((name) => caches.delete(name)));
    }
  } catch (error) {
    console.warn("Obsolete dashboard cache cleanup failed", error);
  }

  const cleanUrl = new URL(location.href);
  if (cleanUrl.searchParams.has("_gpsAdminBuild") || cleanUrl.searchParams.has("_gpsAdminLive")) {
    cleanUrl.searchParams.delete("_gpsAdminBuild");
    cleanUrl.searchParams.delete("_gpsAdminLive");
    history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }
}

function refreshRestoredBrowserPage(event) {
  if (!event.persisted && !document.wasDiscarded) return;
  const freshUrl = new URL(location.href);
  freshUrl.searchParams.set("_gpsAdminLive", String(Date.now()));
  location.replace(freshUrl.toString());
}

function setConnected(ok, message) {
  $("connectionDot").className = ok ? "ok" : "bad";
  $("connectionText").textContent = message;
}
function renderDataReadErrors() {
  const errors = Object.entries(dataReadErrors);
  $("dataReadStatus").textContent = errors.length
    ? errors.map(([path, error]) => `Data panel unavailable: /${CONFIG.root}/${path} — ${error}`).join(" | ")
    : "No live-data or acknowledgement read errors reported. Approval reads are listed separately below.";
}

function renderEnvironmentDiagnostics() {
  const runtimeOptions = firebaseApp?.options || CONFIG.firebase;
  $("projectId").textContent = runtimeOptions.projectId || "—";
  $("databaseUrl").textContent = runtimeOptions.databaseURL || "—";
  $("firebaseAppName").textContent = firebaseApp?.name || "—";
  $("browserOnline").textContent = navigator.onLine ? "true" : "false";
  $("rtdbConnected").textContent = connectionState;
  $("buildVersion").textContent = BUILD_VERSION;
  $("transportMode").textContent = transportMode;
}

function logRuntimeConfiguration(stage) {
  const runtimeOptions = firebaseApp?.options || {};
  console.info(`[${BUILD_VERSION}] ${stage}`, {
    appName: firebaseApp?.name || null,
    projectId: runtimeOptions.projectId || null,
    databaseURL: runtimeOptions.databaseURL || null,
    authUid: auth?.currentUser?.uid || null,
    authEmail: auth?.currentUser?.email || null,
    navigatorOnline: navigator.onLine,
    databaseUsesSameApp: db ? db.app === firebaseApp : null
  });
}

function firebaseErrorLabel(error) {
  const code = String(error?.code || error?.name || "unknown-error");
  const message = String(error?.message || "No Firebase SDK error message supplied");
  return `${code}: ${message}`;
}

function valueLabel(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === null || value === undefined) return "null";
  return `${typeof value}: ${String(value)}`;
}

function renderDiagnostics() {
  $("diagnosticRows").innerHTML = Object.entries(APPROVAL_PATHS).map(([key, path]) => {
    const item = diagnostics[key] || { status: "pending", value: undefined, error: "none" };
    const shownValue = item.status === "pending" ? "pending" : valueLabel(item.value);
    return `<tr><td><code>/${esc(CONFIG.root)}/${esc(path)}</code></td><td>${esc(shownValue)}</td><td>${esc(item.error)}</td></tr>`;
  }).join("");
}

function resetDiagnosticState(status = "waiting-for-auth", error = "none") {
  Object.keys(APPROVAL_PATHS).forEach((key) => {
    approval[key] = null;
    diagnostics[key] = { status, value: undefined, error };
  });
  renderDiagnostics();
  renderApproval();
}

async function readApprovalFlag(key, expectedPath, generation, runId) {
  if (!auth.currentUser || auth.currentUser.uid !== CONFIG.adminUid) {
    approval[key] = null;
    diagnostics[key] = { status: "complete", value: null, error: "auth/no-current-user" };
    renderDiagnostics();
    renderApproval();
    return false;
  }
  diagnostics[key] = { status: "pending", value: undefined, error: "none" };
  renderDiagnostics();
  const readRef = db.ref(`${CONFIG.root}/${expectedPath}`);
  let slowTimerId;
  try {
    slowTimerId = window.setTimeout(() => {
      if (generation !== sessionGeneration || runId !== approvalRun) return;
      diagnostics[key] = {
        status: "waiting-for-response",
        value: undefined,
        error: "slow-response (secondary diagnostic; connection state remains authoritative)"
      };
      renderDiagnostics();
      renderApproval();
    }, 30000);
    const snap = await readRef.once("value");
    if (generation !== sessionGeneration || runId !== approvalRun) return false;
    const rawValue = snap.val();
    approval[key] = rawValue;
    diagnostics[key] = { status: "complete", value: rawValue, error: "none" };
    return true;
  } catch (error) {
    if (generation !== sessionGeneration || runId !== approvalRun) return false;
    console.error(`Firebase approval read failed: ${expectedPath}`, error);
    approval[key] = null;
    if (rtdbConnected === false) {
      diagnostics[key] = { status: "waiting-for-rtdb", value: undefined, error: "none" };
    } else {
      diagnostics[key] = { status: "complete", value: null, error: firebaseErrorLabel(error) };
      // A rejected data read does not mean the RTDB transport is disconnected.
    }
    return false;
  } finally {
    window.clearTimeout(slowTimerId);
    renderDiagnostics();
    renderApproval();
  }
}

function renderLiveStatus(live = {}) {
  const status = String(first(live, ["status", "trip_status"], "OFFLINE")).toUpperCase();
  const freshness = liveFreshness(live);
  const unavailable = dataReadErrors[`drivers/${selectedDriver.driverId}/live`];
  $("liveFreshness").textContent = unavailable ? "Live panel unavailable; see the read error above." : freshness.label;
  $("tripStatus").textContent = unavailable ? "UNAVAILABLE" : freshness.fresh ? status : `STALE — last reported ${status}`;
  $("gpsStatus").textContent = unavailable ? "Unavailable" : freshness.fresh ? (["RUNNING", "STARTING"].includes(status) ? "Running" : status === "OFFLINE" ? "Offline" : "Stopped") : "Stale / current GPS unverified";
}
function pilotActive() {
  return approval.environmentEnabled === true &&
    approval.pilotMode === true &&
    approval.driverAccessEnabled === true &&
    approval.driverPilotEnabled === true &&
    approval.fullRolloutApproved === false &&
    approval.resetEnabled === false &&
    approval.profileResetEnabled === false;
}

function renderApproval() {
  const active = pilotActive();
  const checked = Object.keys(APPROVAL_PATHS).every((key) => diagnostics[key]?.status === "complete");
  const readErrors = Object.values(diagnostics).filter((item) => item?.error && item.error !== "none");
  const authenticatedAdmin = authInitialized && auth?.currentUser?.uid === CONFIG.adminUid;
  $("startCommand").disabled = !authenticatedAdmin || !checked || !active || commandPending;
  $("stopCommand").disabled = !authenticatedAdmin || !checked || !active || commandPending;
  $("resetCommand").disabled = true;
  $("productionGate").textContent = `Production: ${approval.environmentEnabled === true ? "Enabled" : approval.environmentEnabled === false ? "Disabled" : "Checking"}`;
  $("pilotGate").textContent = `Pilot: ${approval.pilotMode === true && approval.driverAccessEnabled === true && approval.driverPilotEnabled === true ? `${selectedDriver.name} enabled` : checked ? "Disabled" : "Checking"}`;
  $("pilotLockTitle").textContent = active ? "Production Pilot active" : checked ? "Pilot safety lock active" : "Checking pilot approval…";
  $("pilotBanner").classList.toggle("blocked", !active);
  $("pilotBanner").textContent = rtdbConnected === false
    ? "This device is not connected to Firebase Realtime Database."
    : active
    ? `Production Pilot is active for ${selectedDriver.name}. START and STOP commands are enabled. RESET remains permanently disabled.`
    : checked && readErrors.length
      ? `Production Pilot check failed: ${readErrors.length} Firebase read error(s). See diagnostics below. Commands remain disabled.`
    : checked
      ? "Production Pilot approval is incomplete. Commands remain disabled."
      : "Checking Production Pilot approval…";
  if (!commandPending) {
    $("commandStatus").textContent = active
      ? `Authorized for ${selectedDriver.name} · ${selectedDriver.vehicleNumber}.`
      : "Waiting for all four Production Pilot approval flags.";
  }
}

function renderLive(live = {}) {
  const status = String(first(live, ["status", "trip_status"], "OFFLINE")).toUpperCase();
  const tripId = first(live, ["activeTripId", "trip_id"], "");
  const lat = number(first(live, ["latitude", "lat"], 0));
  const lng = number(first(live, ["longitude", "lng"], 0));
  const accuracy = first(live, ["accuracyMeters", "gps_accuracy_m", "accuracy_m"]);
  const speedMps = number(first(live, ["speedMps", "speed_mps"], 0));
  const distance = first(live, ["distanceMeters", "estimated_total_m", "gps_tracked_distance_m"], 0);
  const lastSync = first(live, ["lastSyncAt", "last_sync_ms"], 0);
  const lastUpdate = first(live, ["lastUpdateAt", "last_update_ms"], lastSync);

  renderLiveStatus(live);
  $("tripId").textContent = tripId || "No active trip";
  $("distance").textContent = km(distance);
  $("accuracy").textContent = accuracy === null ? "—" : `${number(accuracy).toFixed(1)} m`;
  $("speed").textContent = `${(speedMps * 3.6).toFixed(1)} km/h`;
  $("queue").textContent = String(number(first(live, ["queuePending", "queue_pending"], 0)));
  $("lastSync").textContent = date(lastSync);
  $("lastUpdate").textContent = date(lastUpdate);

  const valid = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
  $("coordinates").textContent = valid ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "No GPS fix";
  $("address").textContent = first(live, ["currentAddress", "current_address", "address"], valid ? `GPS coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}` : "Waiting for location data");
  if (valid) {
    const delta = 0.008;
    $("mapFrame").src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-delta}%2C${lat-delta}%2C${lng+delta}%2C${lat+delta}&layer=mapnik&marker=${lat}%2C${lng}`;
    $("mapFrame").classList.remove("hidden");
    $("mapPlaceholder").classList.add("hidden");
    $("openMap").href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
    $("openMap").classList.remove("disabled");
  } else {
    $("mapFrame").removeAttribute("src");
    $("mapFrame").classList.add("hidden");
    $("mapPlaceholder").classList.remove("hidden");
    $("openMap").removeAttribute("href");
    $("openMap").classList.add("disabled");
  }
}

function normalizedTrips(raw) {
  return Object.entries(raw || {}).map(([key, value]) => ({ id: first(value, ["tripId", "trip_id"], key), ...value }))
    .sort((a, b) => number(first(b, ["startedAtMs", "started_at_ms", "updated_at_ms"])) - number(first(a, ["startedAtMs", "started_at_ms", "updated_at_ms"])));
}
function renderTrips() {
  // Parent-level trip enumeration is not granted by the current deployed rules.
  $("tripRows").innerHTML = emptyRow(HISTORY_UNAVAILABLE);
  $("routeTripSelect").innerHTML = '<option value="">History unavailable</option>';
  $("routeTripSelect").disabled = true;
  renderRoute("");
  return;
}
function routePointsFor(tripId) {
  const fromTrip = trips[tripId]?.routePoints || trips[tripId]?.route || trips[tripId]?.points || {};
  return Object.entries(fromTrip || {}).map(([key, p]) => ({ id: first(p, ["pointId", "point_id"], key), ...p }))
    .sort((a, b) => number(first(a, ["timestampMs", "timestamp_ms"])) - number(first(b, ["timestampMs", "timestamp_ms"])));
}
function renderRoute(tripId) {
  $("routeTripLabel").textContent = tripId || "History unavailable under current permissions";
  const points = tripId ? routePointsFor(tripId) : [];
  $("routeRows").innerHTML = points.length ? points.map((p) => {
    const lat = number(first(p, ["latitude", "lat"])); const lng = number(first(p, ["longitude", "lng"]));
    return `<tr><td>${date(first(p, ["timestampMs", "timestamp_ms"]))}</td><td>${lat.toFixed(6)}, ${lng.toFixed(6)}</td><td>${number(first(p, ["accuracyMeters", "accuracy_m"])).toFixed(1)} m</td><td>${(number(first(p, ["speedMps", "speed_mps"])) * 3.6).toFixed(1)} km/h</td><td>${km(first(p, ["accumulatedDistanceMeters", "accumulated_distance_m"]))}</td></tr>`;
  }).join("") : emptyRow(tripId ? "No route points are stored for this trip." : HISTORY_UNAVAILABLE);
  const map = $("routeMap");
  const last = points.at(-1);
  if (last) {
    const lat = number(first(last, ["latitude", "lat"])); const lng = number(first(last, ["longitude", "lng"]));
    map.classList.remove("empty");
    map.style.backgroundImage = `url("https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=13&size=900x230&markers=${lat},${lng},red-pushpin")`;
  } else {
    map.classList.add("empty"); map.style.backgroundImage = "";
  }
}
function renderAcks(raw) {
  const list = Object.entries(raw || {}).map(([key, value]) => ({ id: first(value, ["commandId", "appliedTripCommandId", "applied_trip_command_id"], key), ...value }))
    .sort((a, b) => number(first(b, ["appliedAtMs", "applied_at_ms", "timestampMs"])) - number(first(a, ["appliedAtMs", "applied_at_ms", "timestampMs"])));
  $("ackRows").innerHTML = list.length ? list.map((ack) => `<tr><td>${esc(ack.id)}</td><td>${esc(first(ack, ["status", "result", "outcome"], "—"))}</td><td>${esc(first(ack, ["commandType", "command_type", "type"], "—"))}</td><td>${date(first(ack, ["appliedAtMs", "applied_at_ms", "timestampMs"]))}</td><td>${esc(first(ack, ["resultingTripStatus", "resulting_trip_status", "message"], "—"))}</td></tr>`).join("") : emptyRow("No command acknowledgements are available.");
}

function clearRenderedFirebaseData() {
  trips = {};
  Object.keys(dataReadErrors).forEach((key) => delete dataReadErrors[key]);
  renderDataReadErrors();
  Object.keys(fleetLive).forEach((key) => delete fleetLive[key]);
  renderLive({});
  renderTrips();
  renderAcks({});
  renderFleetCards();
}

function esc(value) {
  return String(value ?? "—").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function liveFreshness(live = {}) {
  // Prefer the sync timestamp shown on the card; fall back only if absent.
  const timestamp = Number(first(live, ["lastSyncAt", "lastSyncAtMs", "last_sync_ms", "lastUpdateAt", "lastUpdateAtMs", "last_update_ms", "updatedAtMs", "timestampMs"], 0));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { fresh: false, label: "Snapshot age unknown — missing or invalid timestamp" };
  const age = Date.now() - timestamp;
  if (age < 0) return { fresh: false, label: "Snapshot age unknown — device timestamp is in the future" };
  const seconds = Math.floor(age / 1000);
  const elapsed = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m` : `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h`;
  return { fresh: age <= LIVE_FRESHNESS_MS, label: `Snapshot age: ${elapsed} ago${age > LIVE_FRESHNESS_MS ? " — historical data; current GPS unverified" : ""}` };
}
function fleetStatus(live = {}) {
  const status = String(first(live, ["status", "tripStatus", "trip_status"], "OFFLINE")).toUpperCase();
  const lastUpdate = number(first(live, ["lastUpdateAt", "lastUpdateAtMs", "last_update_ms", "updatedAtMs", "timestampMs", "lastSyncAt", "last_sync_ms"], 0));
  if (!liveFreshness(live).fresh) return "STALE";
  if (["RUNNING", "STARTING"].includes(status)) return "RUNNING";
  if (lastUpdate > 0 && Date.now() - lastUpdate <= 120000) return "ONLINE";
  return status === "OFFLINE" ? "OFFLINE" : "STOPPED";
}

function renderFleetCards() {
  const host = $("fleetCards");
  if (!host) return;
  host.innerHTML = DRIVERS.map((driver) => {
    const live = fleetLive[driver.driverId] || {};
    const unavailable = dataReadErrors[`drivers/${driver.driverId}/live`];
    const status = unavailable ? "UNAVAILABLE" : fleetStatus(live);
    const reportedStatus = String(first(live, ["status", "tripStatus", "trip_status"], "UNKNOWN")).toUpperCase();
    const statusLabel = status === "STALE" ? `STALE — last reported ${reportedStatus}` : status;
    const freshness = liveFreshness(live);
    const tripId = first(live, ["activeTripId", "trip_id"], "No active trip");
    const accuracy = first(live, ["accuracyMeters", "gps_accuracy_m", "accuracy_m"]);
    const speedKmh = number(first(live, ["speedKmh", "speedKmph"], number(first(live, ["speedMps", "speed_mps"], 0)) * 3.6));
    const distance = first(live, ["distanceMeters", "tripDistanceMeters", "estimated_total_m", "gps_tracked_distance_m"], 0);
    const queue = number(first(live, ["queuePending", "queue_pending"], 0));
    const lastSync = first(live, ["lastSyncAt", "lastSyncAtMs", "last_sync_ms", "timestampMs"], 0);
    const latitude = number(first(live, ["latitude", "lat"], 0));
    const longitude = number(first(live, ["longitude", "lng"], 0));
    const validLocation = latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && !(latitude === 0 && longitude === 0);
    const location = first(live, ["currentAddress", "current_address", "address"], validLocation ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : "No GPS fix");
    const selected = driver.driverId === selectedDriver.driverId;
    return `<article class="fleet-card ${selected ? "selected" : ""}">
      <div class="fleet-card-head">
        <div><span>Driver</span><strong>${esc(driver.name)}</strong><small>${esc(driver.driverId)}</small></div>
        <span class="fleet-state ${status.toLowerCase()}">${esc(statusLabel)}</span>
      </div>
      <div class="fleet-card-vehicle">${esc(driver.vehicleNumber)} <small>${esc(driver.vehicleId)}</small></div>
      <div class="fleet-metrics">
        <div><span>Last reported GPS accuracy</span><strong>${accuracy == null ? "—" : `${number(accuracy).toFixed(1)} m`}</strong></div>
        <div><span>Speed</span><strong>${speedKmh.toFixed(1)} km/h</strong></div>
        <div><span>Distance</span><strong>${km(distance)}</strong></div>
        <div><span>Last reported trip</span><strong>${esc(tripId)}</strong></div>
        <div><span>Pending queue</span><strong>${queue}</strong></div>
        <div><span>Last sync</span><strong>${date(lastSync)}</strong><small>${esc(unavailable ? "Live panel unavailable; see read error above." : freshness.label)}</small></div>
        <div class="fleet-location"><span>Last reported location</span><strong>${esc(location)}</strong></div>
      </div>
      <button class="manage-driver" type="button" data-driver-id="${esc(driver.driverId)}">${selected ? "Selected for START / STOP" : `Manage ${esc(driver.name)}`}</button>
    </article>`;
  }).join("");
}

function updateSelectedDriverUi() {
  $("driverSelect").value = selectedDriver.driverId;
  $("commandOwner").textContent = `${selectedDriver.name.toUpperCase()} REMOTE COMMANDS`;
  $("driverName").textContent = selectedDriver.name;
  $("driverIdLabel").textContent = selectedDriver.driverId;
  $("vehicleNumber").textContent = selectedDriver.vehicleNumber;
  $("vehicleIdLabel").textContent = selectedDriver.vehicleId;
  $("tripHistoryDriver").textContent = `${selectedDriver.name} · ${selectedDriver.vehicleNumber}`;
  $("ackDriver").textContent = `${selectedDriver.name} command audit trail`;
  renderFleetCards();
}

function selectDriver(driverId) {
  const nextDriver = DRIVERS.find((driver) => driver.driverId === driverId);
  if (!nextDriver || nextDriver.driverId === selectedDriver.driverId) return;
  selectedDriver = nextDriver;
  APPROVAL_PATHS = buildApprovalPaths(selectedDriver);
  updateSelectedDriverUi();
  const user = auth?.currentUser;
  if (user?.uid === CONFIG.adminUid) {
    clearSessionState();
    startAuthenticatedSession(user);
  }
}

function startLiveData() {
  DRIVERS.forEach((driver) => {
    listen(`drivers/${driver.driverId}/live`, (snap) => {
      fleetLive[driver.driverId] = snap.val() || {};
      renderFleetCards();
      if (driver.driverId === selectedDriver.driverId) renderLive(fleetLive[driver.driverId]);
    }, () => {
      delete fleetLive[driver.driverId];
      renderFleetCards();
      if (driver.driverId === selectedDriver.driverId) renderLive({});
    });
  });
  renderTrips(); // No parent trip-list read under current permissions.
  listen(`drivers/${selectedDriver.driverId}/acknowledgements`, (snap) => renderAcks(snap.val() || {}), () => {
    $("ackRows").innerHTML = emptyRow("Acknowledgements unavailable; see the read error above.");
  });
}

async function runApprovalDiagnostics(generation, allowRetry = true) {
  if (!db || rtdbConnected !== true || !auth.currentUser || auth.currentUser.uid !== CONFIG.adminUid || generation !== sessionGeneration) return;
  approvalAttempts += 1;
  const runId = ++approvalRun;
  const results = await Promise.all(
    Object.entries(APPROVAL_PATHS).map(([key, path]) => readApprovalFlag(key, path, generation, runId))
  );
  if (generation !== sessionGeneration || runId !== approvalRun) return;
  const failed = results.some((ok) => !ok);
  if (failed && allowRetry && auth.currentUser?.uid === CONFIG.adminUid) {
    $("commandStatus").textContent = "Approval reads did not complete. Waiting for one Firebase reconnect retry…";
  }
}

function clearSessionState() {
  sessionGeneration += 1;
  approvalRun += 1;
  clearListeners();
  try {
    db?.goOffline();
  } catch (error) {
    console.warn("Firebase connection could not be stopped during session cleanup", error);
  }
  db = undefined;
  commandPending = false;
  approvalAttempts = 0;
  reconnectRetryUsed = false;
  authRestorationRetryUsed = false;
  connectionRecoveryUsed = false;
  rtdbConnected = null;
  connectionState = "INITIALIZING";
  transportMode = transportConfigured ? transportMode : "INITIALIZING";
  resetDiagnosticState();
  clearRenderedFirebaseData();
  $("adminUid").textContent = "—";
  $("adminEmail").textContent = "—";
  $("connectionText").textContent = authInitialized ? "Signed out" : "Waiting for Firebase Auth";
  $("connectionDot").className = "bad";
  $("sdkStatus").textContent = authInitialized ? "Auth ready; database stopped" : "Initializing";
  renderEnvironmentDiagnostics();
}

function showLogin(message = "") {
  $("app").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("loginError").textContent = message;
  if (location.hash !== "#login") history.replaceState(null, "", `${location.pathname}${location.search}#login`);
}

function startAuthenticatedSession(user) {
  if (!auth.currentUser || auth.currentUser.uid !== user.uid || user.uid !== CONFIG.adminUid) return;
  const generation = ++sessionGeneration;
  try {
    // Use the databaseURL already bound to this exact Firebase app. Passing a
    // second URL here can create an unnecessary named database instance and
    // makes cross-device configuration harder to audit.
    db = firebaseApp.database();
    if (db.app !== firebaseApp) throw new Error("RTDB and Auth do not belong to the same Firebase app.");
    if (firebaseApp.options.projectId !== CONFIG.firebase.projectId) throw new Error("Runtime Firebase projectId mismatch.");
    if (firebaseApp.options.databaseURL !== CONFIG.firebase.databaseURL) throw new Error("Runtime Firebase databaseURL mismatch.");
    if (!transportConfigured) {
      if (typeof db.INTERNAL?.forceWebSockets !== "function") {
        throw new Error("RTDB WebSocket transport is unavailable in this Firebase SDK.");
      }
      // Configure before the first RTDB reference/listener. Keep the existing
      // CSP: long-poll script injection is blocked; WebSocket origins are allowed.
      db.INTERNAL.forceWebSockets();
      transportMode = "WEBSOCKET";
      transportConfigured = true;
    }
    db.goOnline();
    console.info(`[${BUILD_VERSION}] RTDB transport: ${transportMode}`);
    connectionState = "CONNECTING";
    $("sdkStatus").textContent = "Firebase app, Auth and RTDB initialized";
    logRuntimeConfiguration("RTDB initialized after Auth");
  } catch (error) {
    $("sdkStatus").textContent = `RTDB initialization failed: ${firebaseErrorLabel(error)}`;
    setConnected(false, "Firebase Realtime Database initialization failed");
    resetDiagnosticState("complete", firebaseErrorLabel(error));
    return;
  }
  $("adminUid").textContent = user.uid;
  $("adminEmail").textContent = user.email || "No email";
  $("loginScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  history.replaceState(null, "", `${location.pathname}${location.search}#dashboard`);
  resetDiagnosticState("waiting-for-rtdb");
  const connectedRef = db.ref(".info/connected");
  let connectionRecoveryTimerId = null;
  let goOnlineTimerId = null;
  const clearConnectionRecoveryTimer = () => {
    if (connectionRecoveryTimerId !== null) {
      window.clearTimeout(connectionRecoveryTimerId);
      connectionRecoveryTimerId = null;
    }
  };
  const scheduleConnectionRecovery = () => {
    if (connectionRecoveryUsed || connectionRecoveryTimerId !== null) return;
    connectionRecoveryTimerId = window.setTimeout(() => {
      connectionRecoveryTimerId = null;
      if (generation !== sessionGeneration || rtdbConnected === true || !db || !navigator.onLine) return;
      connectionRecoveryUsed = true;
      connectionState = "RECOVERING";
      setConnected(false, "Refreshing Firebase live connection…");
      renderEnvironmentDiagnostics();
      try {
        db.goOffline();
        goOnlineTimerId = window.setTimeout(() => {
          goOnlineTimerId = null;
          if (generation === sessionGeneration && db && auth?.currentUser?.uid === CONFIG.adminUid) db.goOnline();
        }, 250);
      } catch (error) {
        setConnected(false, `Firebase recovery failed: ${firebaseErrorLabel(error)}`);
      }
    }, CONFIG.rtdbConnectionTimeoutMs);
  };
  scheduleConnectionRecovery();
  const onConnection = (snapshot) => {
    if (generation !== sessionGeneration) return;
    const wasConnected = rtdbConnected;
    rtdbConnected = snapshot.val() === true;
    connectionState = rtdbConnected ? "CONNECTED" : (navigator.onLine ? "CONNECTING" : "DISCONNECTED");
    connectionSequence += 1;
    console.info(`[${BUILD_VERSION}] /.info/connected change #${connectionSequence}`, {
      value: snapshot.val(),
      interpretedConnected: rtdbConnected,
      navigatorOnline: navigator.onLine,
      authUid: auth.currentUser?.uid || null,
      appName: firebaseApp.name,
      projectId: firebaseApp.options.projectId,
      databaseURL: firebaseApp.options.databaseURL
    });
    renderEnvironmentDiagnostics();
    if (!rtdbConnected) {
      clearRenderedFirebaseData();
      scheduleConnectionRecovery();
      setConnected(false, "This device is not connected to Firebase Realtime Database.");
      $("pilotBanner").classList.add("blocked");
      $("pilotBanner").textContent = "This device is not connected to Firebase Realtime Database.";
      $("startCommand").disabled = true;
      $("stopCommand").disabled = true;
      $("resetCommand").disabled = true;
      Object.keys(APPROVAL_PATHS).forEach((key) => {
        if (diagnostics[key]?.status !== "complete") {
          diagnostics[key] = { status: "waiting-for-rtdb", value: undefined, error: "none" };
        }
      });
      renderDiagnostics();
      return;
    }
    clearConnectionRecoveryTimer();
    setConnected(true, "Firebase Realtime Database connected");
    if (approvalAttempts === 0) {
      resetDiagnosticState("pending");
      startLiveData();
      runApprovalDiagnostics(generation, true);
      if (!authRestorationRetryUsed) {
        authRestorationRetryUsed = true;
        window.setTimeout(() => {
          if (generation !== sessionGeneration || rtdbConnected !== true || pilotActive()) return;
          resetDiagnosticState("auth-restoration-retry");
          runApprovalDiagnostics(generation, false);
        }, 1000);
      }
    } else if (wasConnected === false && !reconnectRetryUsed) {
      reconnectRetryUsed = true;
      resetDiagnosticState("retry-pending");
      runApprovalDiagnostics(generation, false);
    }
  };
  const onConnectionError = (error) => {
    if (generation !== sessionGeneration) return;
    rtdbConnected = false;
    connectionState = "DISCONNECTED";
    console.error(`[${BUILD_VERSION}] /.info/connected listener failed`, {
      code: error?.code || "unknown-error",
      message: error?.message || "No Firebase SDK error message supplied"
    });
    renderEnvironmentDiagnostics();
    setConnected(false, `Firebase connection diagnostic failed: ${firebaseErrorLabel(error)}`);
  };
  connectedRef.on("value", onConnection, onConnectionError);
  refs.push(() => {
    clearConnectionRecoveryTimer();
    if (goOnlineTimerId !== null) window.clearTimeout(goOnlineTimerId);
    connectedRef.off("value", onConnection);
  });
}

function retryFirebaseConnection() {
  if (!authInitialized || !auth?.currentUser) {
    clearSessionState();
    showLogin("Please sign in before retrying Firebase.");
    return;
  }
  if (auth.currentUser.uid !== CONFIG.adminUid) {
    clearSessionState();
    showLogin("This Firebase account is not authorized.");
    return;
  }
  const user = auth.currentUser;
  clearSessionState();
  $("commandStatus").textContent = "Retrying Firebase connection…";
  startAuthenticatedSession(user);
}
async function sendCommand(type) {
  if (!pilotActive() || commandPending || !["START", "STOP"].includes(type)) return;
  const targetDriver = selectedDriver;
  commandPending = true;
  renderApproval();
  const commandRef = db.ref(`${CONFIG.root}/drivers/${targetDriver.driverId}/commands`).push();
  const commandId = commandRef.key;
  $("commandStatus").textContent = `Sending ${type} command to ${targetDriver.name} · ${targetDriver.vehicleNumber}…`;
  try {
    await commandRef.set({
      commandId,
      type,
      driverId: targetDriver.driverId,
      vehicleId: targetDriver.vehicleId,
      issuedAtMs: firebase.database.ServerValue.TIMESTAMP,
      issuedByUid: CONFIG.adminUid
    });
    $("commandStatus").textContent = `${type} command sent only to ${targetDriver.name}. Command ID: ${commandId}`;
  } catch (error) {
    $("commandStatus").textContent = `${type} for ${targetDriver.name} failed: ${error?.code || error?.message || "Unknown error"}`;
  } finally {
    commandPending = false;
    $("startCommand").disabled = !pilotActive();
    $("stopCommand").disabled = !pilotActive();
    $("resetCommand").disabled = true;
  }
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault(); $("loginError").textContent = "";
  try {
    await persistenceReady;
    const credential = await auth.signInWithEmailAndPassword($("email").value.trim(), $("password").value);
    if (credential.user.uid !== CONFIG.adminUid) {
      await auth.signOut();
      throw new Error("This account is not authorized for the Production Admin Dashboard.");
    }
  } catch (error) {
    $("loginError").textContent = error.message.replace(/^Firebase: /, "");
  }
});
$("logout").addEventListener("click", async () => {
  clearSessionState();
  try {
    await auth.signOut();
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
  } finally {
    showLogin("Signed out. The Firebase Auth session and dashboard diagnostics were cleared.");
  }
});
$("startCommand").addEventListener("click", () => sendCommand("START"));
$("stopCommand").addEventListener("click", () => sendCommand("STOP"));
$("driverSelect").addEventListener("change", (event) => selectDriver(event.target.value));
$("fleetCards").addEventListener("click", (event) => {
  const button = event.target.closest("[data-driver-id]");
  if (button) selectDriver(button.dataset.driverId);
});
$("retryFirebase").addEventListener("click", retryFirebaseConnection);
$("routeTripSelect").addEventListener("change", (event) => renderRoute(event.target.value));
document.querySelectorAll("nav button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b === button));
  document.querySelectorAll(".view").forEach((view) => view.classList.add("hidden"));
  $(`${button.dataset.view}View`).classList.remove("hidden");
  $("viewTitle").textContent = ({ fleet: "Live Fleet", overview: "Selected Driver", route: "Route history", trips: "Trip history", acks: "Command acknowledgements" })[button.dataset.view];
}));
// Age displayed snapshots even when the device sends no new event. No network writes.
window.setInterval(() => {
  if (document.visibilityState !== "visible" || auth?.currentUser?.uid !== CONFIG.adminUid) return;
  renderFleetCards();
  renderLiveStatus(fleetLive[selectedDriver.driverId] || {});
}, 15000);
window.addEventListener("pageshow", refreshRestoredBrowserPage);
window.addEventListener("online", () => {
  renderEnvironmentDiagnostics();
  if (db && auth?.currentUser?.uid === CONFIG.adminUid) {
    try {
      db.goOnline();
    } catch (error) {
      console.warn("Firebase could not resume after browser online event", error);
    }
  }
});
window.addEventListener("offline", renderEnvironmentDiagnostics);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !navigator.onLine || rtdbConnected === true) return;
  if (db && auth?.currentUser?.uid === CONFIG.adminUid) {
    try {
      db.goOnline();
    } catch (error) {
      console.warn("Firebase could not resume after page visibility change", error);
    }
  }
});
prepareBrowserRuntime();
renderEnvironmentDiagnostics();
updateSelectedDriverUi();

if (firebaseInitializationError || !auth || !firebaseApp) {
  $("loginError").textContent = `Firebase initialization failed: ${firebaseErrorLabel(firebaseInitializationError)}`;
  setConnected(false, "Firebase initialization failed");
  Object.keys(APPROVAL_PATHS).forEach((key) => {
    diagnostics[key] = { status: "complete", value: null, error: "initialization-failed" };
  });
  renderDiagnostics();
  renderApproval();
} else {
  resetDiagnosticState();
  $("sdkStatus").textContent = "Firebase app and Auth initialized; setting session persistence";
  persistenceReady = auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
    .then(() => {
      $("sdkStatus").textContent = "Firebase Auth session persistence ready";
    })
    .catch((error) => {
      // Firefox privacy/storage settings can reject SESSION persistence. Auth
      // must still initialize so the user can sign in for the current page.
      $("sdkStatus").textContent = `Auth persistence unavailable; current-page session only: ${firebaseErrorLabel(error)}`;
      console.warn("Firebase Auth persistence unavailable", error);
    });

  auth.onAuthStateChanged(async (user) => {
    authInitialized = true;
    console.info(`[${BUILD_VERSION}] onAuthStateChanged`, {
      uid: user?.uid || null,
      email: user?.email || null
    });
    clearSessionState();
    if (!user) {
      showLogin("Please sign in with the authorized Production Admin account.");
      return;
    }
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
      showLogin("Firebase Auth session is not ready. Please sign in again.");
      return;
    }
    if (user.uid !== CONFIG.adminUid) {
      await auth.signOut();
      showLogin("This Firebase account is not authorized for the Production Admin Dashboard.");
      return;
    }
    console.info(`Production Admin Dashboard ${BUILD_VERSION}: authenticated admin UID verified`);
    logRuntimeConfiguration("Auth initialized");
    startAuthenticatedSession(user);
  }, (error) => {
    authInitialized = true;
    clearSessionState();
    showLogin(`Firebase Auth initialization failed: ${firebaseErrorLabel(error)}`);
  });
}
