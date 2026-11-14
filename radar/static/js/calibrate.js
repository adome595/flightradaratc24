// calibrate.js - lets you align the background image with game coordinates.
//
// How it works: you pick an aircraft whose real location you know (its game
// position comes from the API), then click that same spot on the image.
// Doing this twice, on two different islands, is enough to work out the
// scale and offset of the image.

import { map } from "./map.js";
import { currentAircraft } from "./state.js";
import { setClickInterceptor } from "./aircraft.js";
import { getCalibration, applyCalibration, resetCalibration, latLngToImagePx } from "./background.js";
import { $, esc } from "./utils.js";

const STEPS = [
  { kind: "aircraft", text: "Click an aircraft (on the map or in the list) whose real location you know, for example one parked at an airport." },
  { kind: "point",    text: "Now click where that aircraft really is on the background image." },
  { kind: "aircraft", text: "Pick a second aircraft on a different island, far away from the first." },
  { kind: "point",    text: "Click where that second aircraft really is on the image." },
];

let step = -1;          // -1 = not calibrating
let pairs = [];         // [{ studs: {x, y}, px: {x, y} }, ...]
let pendingStuds = null;
let pins = [];          // temporary markers showing the picked aircraft positions
let message = "";       // error or result text
let result = null;      // finished calibration, shown until closed

const panel = () => $("#calibrate");
const mapEl = () => $("#map");

// ---------- public API ----------
export const isCalibrating = () => step >= 0;

export function startCalibration() {
  step = 0;
  pairs = [];
  pendingStuds = null;
  message = "";
  result = null;
  clearPins();
  setClickInterceptor(onAircraftClick);
  render();
}

// Called by main.js for every click on empty map. Returns true if we used it.
export function handleMapClick(e) {
  if (step < 0) return false;
  if (STEPS[step].kind !== "point") return true;   // ignore stray clicks while picking an aircraft

  pairs.push({ studs: pendingStuds, px: latLngToImagePx(e.latlng) });
  pendingStuds = null;
  step++;

  if (step >= STEPS.length) finish();
  else render();
  return true;
}

// ---------- internals ----------
function onAircraftClick(cs) {
  if (step < 0) return false;
  if (STEPS[step].kind !== "aircraft") return true;

  const ac = currentAircraft()[cs];
  if (!ac || !ac.position) return true;

  pendingStuds = { x: ac.position.x, y: ac.position.y };
  pins.push(
    L.circleMarker([-ac.position.y, ac.position.x], { radius: 9, color: "#ffb400", weight: 2, fillOpacity: 0.15 }).addTo(map)
  );
  step++;
  render();
  return true;
}

function finish() {
  const [a, b] = pairs;
  const distPx = Math.hypot(b.px.x - a.px.x, b.px.y - a.px.y);
  const distStuds = Math.hypot(b.studs.x - a.studs.x, b.studs.y - a.studs.y);

  if (distPx < 30 || distStuds < 1000) {
    message = "Those two points were too close together. Let's try again with aircraft on different islands.";
    step = 0;
    pairs = [];
    clearPins();
    render();
    return;
  }

  // Uniform scale (the image is not stretched), averaged origin from both points.
  const scale = distStuds / distPx;
  const originX = ((a.studs.x - a.px.x * scale) + (b.studs.x - b.px.x * scale)) / 2;
  const originY = ((a.studs.y - a.px.y * scale) + (b.studs.y - b.px.y * scale)) / 2;

  result = { scale: +scale.toFixed(3), originX: Math.round(originX), originY: Math.round(originY) };
  applyCalibration(result, true);   // true = save in this browser

  step = -1;
  pairs = [];
  setClickInterceptor(null);
  clearPins();
  render();
}

function cancel() {
  step = -1;
  pairs = [];
  pendingStuds = null;
  message = "";
  result = null;
  setClickInterceptor(null);
  clearPins();
  render();
}

function reset() {
  resetCalibration();
  cancel();
}

function clearPins() {
  pins.forEach((p) => map.removeLayer(p));
  pins = [];
}

function render() {
  const el = panel();
  const m = mapEl();
  m.classList.toggle("calibrating", step >= 0);
  m.classList.toggle("pick-point", step >= 0 && STEPS[step].kind === "point");

  // ----- finished -----
  if (result) {
    const snippet =
      `DEFAULT_CALIBRATION: { scale: ${result.scale}, originX: ${result.originX}, originY: ${result.originY} },`;
    el.className = "calibrate open";
    el.innerHTML = `
      <div class="calibrate__title">Map calibrated</div>
      <div class="calibrate__text">Saved in this browser. To make it permanent for everyone, replace the
        <code>DEFAULT_CALIBRATION</code> line in <code>static/js/config.js</code> with:</div>
      <code class="calibrate__code">${esc(snippet)}</code>
      <div class="calibrate__actions">
        <button class="btn btn--primary" id="calCopy">Copy line</button>
        <button class="btn" id="calAgain">Redo</button>
        <button class="btn" id="calReset">Reset to default</button>
        <button class="btn" id="calClose">Close</button>
      </div>`;
    $("#calCopy").onclick = () => navigator.clipboard?.writeText(snippet);
    $("#calAgain").onclick = startCalibration;
    $("#calReset").onclick = reset;
    $("#calClose").onclick = cancel;
    return;
  }

  // ----- idle -----
  if (step < 0) {
    el.className = "calibrate";
    el.innerHTML = "";
    return;
  }

  // ----- running -----
  el.className = "calibrate open";
  el.innerHTML = `
    <div class="calibrate__title">Calibrate map</div>
    <div class="calibrate__step">Step ${step + 1} of ${STEPS.length}</div>
    ${message ? `<p class="calibrate__error">${esc(message)}</p>` : ""}
    <p class="calibrate__text">${esc(STEPS[step].text)}</p>
    <div class="calibrate__actions">
      <button class="btn" id="calCancel">Cancel</button>
      <button class="btn" id="calReset">Reset to default</button>
    </div>`;
  $("#calCancel").onclick = cancel;
  $("#calReset").onclick = reset;
}

// Show current calibration values in the console for debugging.
export const debugCalibration = () => console.table(getCalibration());
