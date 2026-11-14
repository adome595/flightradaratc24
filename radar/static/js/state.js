// state.js - the single place where live data and UI state are stored.

export const state = {
  server: "main",     // "main" or "event"
  main: {},           // aircraft on the main server, keyed by callsign
  event: {},          // aircraft on the event server
  ws: false,          // is the Python server connected to 24data's WebSocket?
  streamOk: false,    // is this browser connected to the Python server?
  selected: null,     // callsign of the selected aircraft
};

export const meta = {
  controllers: [],
  atis: {},
  flightPlans: [],
};

// Aircraft for whichever server (Main / Event) is currently shown.
export const currentAircraft = () =>
  (state.server === "event" ? state.event : state.main) || {};
