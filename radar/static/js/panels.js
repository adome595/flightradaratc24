// panels.js - the ATC, Plans and ATIS sidebar tabs.

import { meta } from "./state.js";
import { $, esc, ago } from "./utils.js";

// ---------- ATC: active positions grouped by airport ----------
export function renderATC() {
  const online = meta.controllers.filter((p) => p.holder);
  $("#statAtc").textContent = online.length;

  if (!online.length) {
    $("#atcList").innerHTML = '<div class="empty">No controllers online.</div>';
    return;
  }

  const byAirport = {};
  online.forEach((p) => (byAirport[p.airport] ||= []).push(p));

  $("#atcList").innerHTML = Object.keys(byAirport).sort().map((airport) => `
    <div class="card">
      <h3 class="card__title">${esc(airport)}</h3>
      ${byAirport[airport].map((p) => `
        <div class="pos">
          <div class="pos__type">${esc(p.position)}</div>
          <div class="pos__who">${esc(p.holder)}
            ${p.queue && p.queue.length ? `<div class="mute">Queue: ${p.queue.map(esc).join(", ")}</div>` : ""}
          </div>
          <div class="mute">${p.heldSince ? ago(p.heldSince) : ""}</div>
        </div>`).join("")}
    </div>`).join("");
}

// ---------- Plans: recently filed flight plans ----------
export function renderPlans() {
  const plans = [...meta.flightPlans].reverse();

  $("#planList").innerHTML = plans.length
    ? plans.map((fp) => `
      <div class="row" data-cs="${esc(fp.realcallsign || fp.callsign)}">
        <div>
          <div class="row__title">${esc(fp.callsign)}${fp.event ? '<span class="tag tag--event">EVENT</span>' : ""}</div>
          <div class="row__sub">${esc(fp.aircraft)} &middot; ${esc(fp.robloxName)}</div>
        </div>
        <div class="row__right">
          <strong>${esc(fp.departing)} &#10140; ${esc(fp.arriving)}</strong><br>
          ${esc(fp.flightrules)} FL${esc(fp.flightlevel)}
        </div>
      </div>`).join("")
    : '<div class="empty">No flight plans filed since the server started.</div>';
}

// ---------- ATIS: one airport at a time ----------
export function renderATIS() {
  const select = $("#atisSel");
  const airports = Object.keys(meta.atis).sort();
  const keep = select.value;

  select.innerHTML = airports.map((a) => `<option>${esc(a)}</option>`).join("");
  if (airports.includes(keep)) select.value = keep;

  const atis = meta.atis[select.value];
  if (!atis) {
    $("#atisBox").innerHTML = '<div class="empty">No ATIS available.</div>';
    return;
  }

  $("#atisBox").innerHTML = `
    <div class="row row--static">
      <div class="row__title">${esc(atis.airport)} &mdash; Information ${esc(atis.letter)}</div>
      <div class="row__sub">${atis.editor ? "by " + esc(atis.editor) : ""}</div>
    </div>
    <pre class="atis"></pre>`;
  $("#atisBox .atis").textContent = (atis.content || "").trim();   // textContent = safe
}
