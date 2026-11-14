// background.js - places the PTFS map image in game space and stores its calibration.
//
// A calibration is { scale, originX, originY }:
//   image pixel (px, py)  ->  game studs (originX + px * scale, originY + py * scale)

import { CONFIG } from "./config.js";
import { map } from "./map.js";

const { width: IMG_W, height: IMG_H } = CONFIG.MAP_IMAGE;
const KEY = CONFIG.CALIBRATION_STORAGE_KEY;

let calibration = loadCalibration();
let overlay = null;

function isValid(c) {
  return !!c && [c.scale, c.originX, c.originY].every(Number.isFinite) && c.scale > 0;
}

function loadCalibration() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (isValid(saved)) return saved;
    }
  } catch { /* storage unavailable: fall through to the default */ }
  return { ...CONFIG.DEFAULT_CALIBRATION };
}

// Leaflet bounds [[south-west], [north-east]] for a calibration.
function boundsFor(cal) {
  const west = cal.originX;
  const north = cal.originY;
  const east = west + IMG_W * cal.scale;
  const south = north + IMG_H * cal.scale;
  return L.latLngBounds([-south, west], [-north, east]);
}

export const getCalibration = () => ({ ...calibration });

export function applyCalibration(cal, save = false) {
  calibration = { ...cal };
  const bounds = boundsFor(calibration);

  if (overlay) overlay.setBounds(bounds);
  else {
    overlay = L.imageOverlay(CONFIG.MAP_IMAGE.url, bounds, {
      pane: "background",
      opacity: CONFIG.MAP_IMAGE.opacity,
      interactive: false,
    }).addTo(map);
  }

  if (save) {
    try { localStorage.setItem(KEY, JSON.stringify(calibration)); } catch { /* ignore */ }
  }
}

export function resetCalibration() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  applyCalibration(CONFIG.DEFAULT_CALIBRATION);
}

export function fitToBackground() {
  map.fitBounds(boundsFor(calibration), { animate: false });
}

// Where on the image (in pixels) is this Leaflet position?
export function latLngToImagePx(latlng) {
  return {
    x: (latlng.lng - calibration.originX) / calibration.scale,
    y: (-latlng.lat - calibration.originY) / calibration.scale,
  };
}

applyCalibration(calibration);
