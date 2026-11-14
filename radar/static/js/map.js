// map.js - creates the Leaflet map, the grid, airport labels and the cursor HUD.
//
// Coordinate convention used everywhere:
//   game position (x, y) in studs  ->  Leaflet [lat, lng] = [-y, x]
// (-y is north in the game, so north ends up at the top of the screen.)

import { CONFIG } from "./config.js";
import { $ } from "./utils.js";

export const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: CONFIG.MAP_ZOOM.min,
  maxZoom: CONFIG.MAP_ZOOM.max,
  zoomControl: false,
  attributionControl: false,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelPxPerZoomLevel: 90,
}).setView([0, 0], CONFIG.MAP_ZOOM.initial);

L.control.zoom({ position: "bottomleft" }).addTo(map);

// The background image gets its own pane so it always sits below the grid.
map.createPane("background").style.zIndex = 150;

// ---------- coordinate grid (drawn in studs) ----------
const GridLayer = L.GridLayer.extend({
  createTile(coords) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 256;
    const g = tile.getContext("2d");

    const scale = Math.pow(2, coords.z);  // pixels per stud
    const span = 256 / scale;             // studs covered by one tile
    const steps = [250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
    const step = steps.find((s) => s * scale >= 90) || 50000;
    const x0 = coords.x * span;
    const y0 = coords.y * span;

    const line = (k, vertical) => {
      const p = (k * step - (vertical ? x0 : y0)) * scale + 0.5;
      g.strokeStyle = k % 5 === 0 ? "rgba(140,170,220,.22)" : "rgba(140,170,220,.09)";
      g.beginPath();
      if (vertical) { g.moveTo(p, 0); g.lineTo(p, 256); }
      else { g.moveTo(0, p); g.lineTo(256, p); }
      g.stroke();
    };

    for (let k = Math.ceil(x0 / step); k * step <= x0 + span; k++) line(k, true);
    for (let k = Math.ceil(y0 / step); k * step <= y0 + span; k++) line(k, false);
    return tile;
  },
});
new GridLayer({ tileSize: 256, updateWhenZooming: false }).addTo(map);

// ---------- callsign labels only when zoomed in ----------
function updateLabelVisibility() {
  $("#map").classList.toggle("show-labels", map.getZoom() >= CONFIG.LABEL_MIN_ZOOM);
}
map.on("zoomend", updateLabelVisibility);
updateLabelVisibility();

// ---------- cursor position (studs) ----------
map.on("mousemove", (e) => {
  $("#coords").textContent = `x ${Math.round(e.latlng.lng)}   y ${Math.round(-e.latlng.lat)}`;
});

// ---------- airport markers (from CONFIG.AIRPORTS) ----------
export function drawAirports() {
  for (const [icao, [x, y]] of Object.entries(CONFIG.AIRPORTS)) {
    L.marker([-y, x], {
      icon: L.divIcon({ className: "apt", html: `<span>${icao}</span>`, iconSize: [0, 0] }),
      interactive: false,
    }).addTo(map);
  }
}
