// aircraft.js - everything about aircraft: map markers, trails, sidebar list, detail panel.

import { CONFIG } from "./config.js";
import { state, meta, currentAircraft } from "./state.js";
import { map } from "./map.js";
import { $, esc, fmt, gameToRealKnots } from "./utils.js";

const markers = new Map();   // callsign -> Leaflet marker
const trails = new Map();    // callsign -> [[lat, lng], ...]
const trailLine = L.polyline([], { color: "#ffb400", weight: 2, opacity: 0.7 }).addTo(map);

// Other modules (the calibration helper) can intercept aircraft clicks.
let interceptor = null;
export const setClickInterceptor = (fn) => { interceptor = fn; };

const planeSvg = (heading) =>
  `<svg class="pl" viewBox="0 0 24 24" width="26" height="26" style="transform:rotate(${heading || 0}deg)">` +
  `<path d="M12 1.5c.9 0 1.5.8 1.5 1.8V9l8.5 5v2l-8.5-2.4v4.4l2.3 1.7V22L12 21l-3.8 1v-1.3l2.3-1.7v-4.4L2 16v-2l8.5-5V3.3c0-1 .6-1.8 1.5-1.8z"/></svg>`;

// Latest flight plan filed by this callsign on the server being shown.
const planFor = (cs) =>
  [...meta.flightPlans].reverse().find((fp) =>
    (fp.callsign === cs || fp.realcallsign === cs) && !!fp.event === (state.server === "event"));

// ---------- click handling ----------
// Use this for every "user clicked an aircraft" action.
export function activate(cs, fly = false) {
  if (interceptor && interceptor(cs)) return;
  select(cs, fly);
}

// ---------- map markers ----------
function createMarker(cs, ac, latlng) {
  const marker = L.marker(latlng, {
    icon: L.divIcon({
      className: "acft",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: planeSvg(ac.heading) + `<span class="lbl">${esc(cs)}</span>`,
    }),
    keyboard: false,
  }).addTo(map);
  marker.on("click", () => activate(cs, false));
  return marker;
}

export function renderMap() {
  const seen = new Set();

  for (const [cs, ac] of Object.entries(currentAircraft())) {
    if (!ac.position) continue;
    seen.add(cs);
    const latlng = [-ac.position.y, ac.position.x];

    let marker = markers.get(cs);
    if (!marker) {
      marker = createMarker(cs, ac, latlng);
      markers.set(cs, marker);
    } else {
      marker.setLatLng(latlng);
      const plane = marker.getElement().querySelector(".pl");
      if (plane) plane.style.transform = `rotate(${ac.heading || 0}deg)`;
    }

    const el = marker.getElement();
    el.classList.toggle("emerg", !!ac.isEmergencyOccuring);
    el.classList.toggle("ground", ac.isOnGround === true);
    el.classList.toggle("sel", cs === state.selected);

    // remember the path for the trail
    let trail = trails.get(cs);
    if (!trail) trails.set(cs, (trail = []));
    const last = trail[trail.length - 1];
    if (!last || last[0] !== latlng[0] || last[1] !== latlng[1]) {
      trail.push(latlng);
      if (trail.length > CONFIG.TRAIL_LENGTH) trail.shift();
    }
  }

  // remove aircraft that left
  for (const [cs, marker] of markers) {
    if (!seen.has(cs)) {
      map.removeLayer(marker);
      markers.delete(cs);
      trails.delete(cs);
    }
  }

  if (state.selected) trailLine.setLatLngs(trails.get(state.selected) || []);
}

// Remove every marker (used when switching Main <-> Event).
export function clearAircraft() {
  for (const marker of markers.values()) map.removeLayer(marker);
  markers.clear();
  trails.clear();
}

// ---------- sidebar list ----------
export function renderAircraftList() {
  const query = $("#filter").value.trim().toLowerCase();
  const rows = Object.entries(currentAircraft())
    .filter(([cs, ac]) => !query ||
      cs.toLowerCase().includes(query) ||
      String(ac.playerName || "").toLowerCase().includes(query) ||
      String(ac.aircraftType || "").toLowerCase().includes(query))
    .sort((a, b) => a[0].localeCompare(b[0]));

  $("#acList").innerHTML = rows.length
    ? rows.map(([cs, ac]) => `
      <div class="row ${cs === state.selected ? "active" : ""}" data-cs="${esc(cs)}">
        <div>
          <div class="row__title">${esc(cs)}${ac.isEmergencyOccuring ? '<span class="tag">EMERG</span>' : ""}</div>
          <div class="row__sub">${esc(ac.aircraftType)} &middot; ${esc(ac.playerName)}</div>
        </div>
        <div class="row__right">${fmt(ac.altitude)} ft<br>${fmt(ac.groundSpeed)} kt</div>
      </div>`).join("")
    : '<div class="empty">No aircraft online.</div>';

  $("#statAc").textContent = Object.keys(currentAircraft()).length;
}

// ---------- detail panel ----------
export function renderDetail() {
  const box = $("#detail");
  const cs = state.selected;
  const ac = cs && currentAircraft()[cs];
  if (!cs) return;

  if (!ac) {
    box.innerHTML = `
      <div class="detail__head">
        <button class="detail__close" id="detailClose">&times;</button>
        <div class="detail__title">${esc(cs)}</div>
        <div class="mute">Aircraft no longer online</div>
      </div>`;
    $("#detailClose").onclick = deselect;
    return;
  }

  const gs = ac.groundSpeed || 0;
  const plan = planFor(cs);
  const status = ac.isOnGround === undefined ? "Helicopter" : ac.isOnGround ? "On ground" : "Airborne";

  box.innerHTML = `
    <div class="detail__head">
      <button class="detail__close" id="detailClose">&times;</button>
      <div class="detail__title">${esc(cs)}</div>
      <div class="mute">${esc(ac.aircraftType)} &middot; ${esc(ac.playerName)}</div>
      ${plan ? `
        <div class="route">${esc(plan.departing)} <span class="route__arrow">&#10140;</span> ${esc(plan.arriving)}</div>
        <div class="mute">${esc(plan.flightrules)} &middot; FL${esc(plan.flightlevel)} &middot; ${esc(plan.route)}</div>` : ""}
    </div>
    ${ac.isEmergencyOccuring ? '<div class="detail__alert">EMERGENCY</div>' : ""}
    <div class="stats">
      <div><label>Altitude</label><span>${fmt(ac.altitude)} ft</span></div>
      <div><label>Heading</label><span>${fmt(ac.heading)}&deg;</span></div>
      <div><label>Ground speed</label><span>${fmt(gs)} kt</span></div>
      <div><label>Real kt (approx)</label><span>${fmt(gameToRealKnots(gs))} kt</span></div>
      <div><label>Airspeed</label><span>${fmt(ac.speed)} kt</span></div>
      <div><label>Wind</label><span>${esc(ac.wind)}</span></div>
      <div><label>Status</label><span>${status}</span></div>
      <div><label>Position (studs)</label><span>${fmt(ac.position.x)}, ${fmt(ac.position.y)}</span></div>
    </div>`;
  $("#detailClose").onclick = deselect;
}

// ---------- selection ----------
function unhighlightSelected() {
  const prev = state.selected && markers.get(state.selected);
  if (prev) {
    prev.getElement().classList.remove("sel");
    prev.setZIndexOffset(0);
  }
}

export function select(cs, fly = false) {
  unhighlightSelected();
  state.selected = cs;

  const marker = markers.get(cs);
  if (marker) {
    marker.getElement().classList.add("sel");
    marker.setZIndexOffset(1000);
    if (fly) map.setView(marker.getLatLng(), Math.max(map.getZoom(), -2));
  }

  trailLine.setLatLngs(trails.get(cs) || []);
  $("#detail").classList.add("open");
  renderDetail();
  renderAircraftList();
}

export function deselect() {
  unhighlightSelected();
  state.selected = null;
  trailLine.setLatLngs([]);
  $("#detail").classList.remove("open");
  renderAircraftList();
}
