// main.js - entry point. Connects the modules and handles the page's buttons.

import { state, currentAircraft } from "./state.js";
import { map, drawAirports } from "./map.js";
import { fitToBackground } from "./background.js";
import {
  renderMap, renderAircraftList, renderDetail,
  clearAircraft, activate, deselect,
} from "./aircraft.js";
import { renderATC, renderPlans, renderATIS } from "./panels.js";
import { startStream } from "./stream.js";
import { startCalibration, handleMapClick } from "./calibrate.js";
import { $, $$ } from "./utils.js";

// ---------- initial map view ----------
drawAirports();
fitToBackground();

// ---------- connection badge ----------
function updateStatus() {
  const badge = $("#status");
  badge.className = "status";
  const label = badge.querySelector("span");

  if (!state.streamOk) label.textContent = "OFFLINE";
  else if (state.ws) { badge.classList.add("live"); label.textContent = "LIVE"; }
  else { badge.classList.add("poll"); label.textContent = "POLLING"; }
}

// ---------- sidebar tabs ----------
$("#tabs").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  $$("#tabs button").forEach((b) => b.classList.toggle("on", b === button));
  $$(".tab").forEach((t) => t.classList.toggle("on", t.id === "tab-" + button.dataset.tab));
});

// ---------- Main / Event toggle ----------
$("#serverSeg").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button || button.dataset.server === state.server) return;

  state.server = button.dataset.server;
  $$("#serverSeg button").forEach((b) => b.classList.toggle("on", b === button));

  clearAircraft();
  deselect();
  renderMap();
  renderAircraftList();
  renderPlans();
});

// ---------- clicks in lists ----------
function onRowClick(e) {
  const row = e.target.closest(".row[data-cs]");
  if (!row) return;
  const cs = row.dataset.cs;
  if (currentAircraft()[cs]) activate(cs, true);
}
$("#acList").addEventListener("click", onRowClick);
$("#planList").addEventListener("click", onRowClick);

$("#filter").addEventListener("input", renderAircraftList);
$("#atisSel").addEventListener("change", renderATIS);

// ---------- clicks on the map ----------
map.on("click", (e) => {
  if (handleMapClick(e)) return;   // used by the calibration helper
  deselect();
});

$("#calibrateBtn").addEventListener("click", startCalibration);

// ---------- clock ----------
setInterval(() => {
  $("#clock").textContent = new Date().toISOString().slice(11, 19) + "Z";
}, 1000);

// ---------- live data ----------
startStream({
  onStatus: updateStatus,
  onState: () => {
    renderMap();
    renderAircraftList();
    if (state.selected) renderDetail();
  },
  onMeta: () => {
    renderATC();
    renderPlans();
    renderATIS();
  },
});
