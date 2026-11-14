// stream.js - receives live data from the Python server over Server-Sent Events.
//
//   event "state" (every second)   -> aircraft for the Main and Event servers
//   event "meta"  (every 5 seconds) -> controllers, ATIS, flight plans

import { state, meta } from "./state.js";

export function startStream({ onState, onMeta, onStatus }) {
  const source = new EventSource("/api/stream");

  source.onopen = () => { state.streamOk = true; onStatus(); };
  source.onerror = () => { state.streamOk = false; onStatus(); };   // EventSource retries by itself

  source.addEventListener("state", (e) => {
    const data = JSON.parse(e.data);
    state.main = data.main || {};
    state.event = data.event || {};
    state.ws = data.ws;
    state.streamOk = true;
    onStatus();
    onState();
  });

  source.addEventListener("meta", (e) => {
    const data = JSON.parse(e.data);
    meta.controllers = data.controllers || [];
    meta.atis = data.atis || {};
    meta.flightPlans = data.flight_plans || [];
    onMeta();
  });
}
