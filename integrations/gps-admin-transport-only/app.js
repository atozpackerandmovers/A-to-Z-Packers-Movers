"use strict";

// Compatibility bootstrap for a browser that still holds the unversioned v8
// index. The current v9 index loads app.v9.0.0.js and never executes this file.
(async () => {
  const targetBuild = "2026-07-30-production-multidriver-browser-stable-v9.0.0";
  const guardKey = "az-gps-admin:legacy-refresh-v9";

  try {
    if (sessionStorage.getItem(guardKey) === targetBuild) return;
    sessionStorage.setItem(guardKey, targetBuild);
  } catch (error) {
    console.warn("Legacy dashboard refresh guard is unavailable", error);
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch (error) {
    console.warn("Legacy dashboard service worker cleanup failed", error);
  }

  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch (error) {
    console.warn("Legacy dashboard cache cleanup failed", error);
  }

  const freshUrl = new URL("/", location.origin);
  freshUrl.searchParams.set("_gpsAdminBuild", targetBuild);
  freshUrl.hash = "dashboard";
  location.replace(freshUrl.toString());
})();
