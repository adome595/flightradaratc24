// config.js - all the settings you may want to change live here.

export const CONFIG = {
  // ---------- background image ----------
  MAP_IMAGE: {
    url: "/static/img/ptfsmap.png",
    width: 999,    // pixel size of the image
    height: 954,
    opacity: 0.95,
  },

  // Where the image sits in game space (studs).
  //   scale   = studs per image pixel
  //   originX = game x of the image's left edge
  //   originY = game y of the image's top edge   (-y is north)
  //
  // These are a starting guess (image centred on 0,0 at 100 studs per pixel).
  // Use the "Calibrate map" button in the page to fix them, then paste the
  // values it prints here to make them permanent.
  DEFAULT_CALIBRATION: { scale: 100, originX: -49950, originY: -47700 },
  CALIBRATION_STORAGE_KEY: "atc24radar.calibration",

  // ---------- map behaviour ----------
  MAP_ZOOM: { min: -8, max: 2, initial: -4 },
  LABEL_MIN_ZOOM: -3,   // callsign labels show at this zoom or closer
  TRAIL_LENGTH: 80,     // points kept per aircraft trail

  // ---------- airports (game coordinates in studs: [x, y]) ----------
  // Fill these in to get labelled airport markers, e.g.:
  //   IRFD: [-12000, 5000],
  AIRPORTS: {},

  // ---------- unit conversion ----------
  REAL_KNOTS: 0.592172785,    // game knots -> real knots
  STUDS_PER_NM: 3307.14286,
};
