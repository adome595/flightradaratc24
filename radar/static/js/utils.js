// utils.js - small helpers shared by every module.

import { CONFIG } from "./config.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Escape text before putting it into innerHTML.
export const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 12345.6 -> "12,346"
export const fmt = (n) => Math.round(n || 0).toLocaleString();

// "5m", "1h 20m" since a Unix-ms timestamp
export function ago(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export const gameToRealKnots = (kts) => kts * CONFIG.REAL_KNOTS;
