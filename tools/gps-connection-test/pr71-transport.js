'use strict';
window.configurePr71Transport=function(db){
  let transportConfigured=false,transportMode='INITIALIZING';
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
  return transportMode;
};
