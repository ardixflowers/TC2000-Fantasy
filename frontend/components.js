// components.js
export function toast(message, opts = {}) {
  const toasts = document.getElementById("toasts");
  if (!toasts) {
    console.warn("toasts container not found");
    return;
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  toasts.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(8px)";
    setTimeout(() => el.remove(), 400);
  }, opts.duration || 3500);
}

export function showModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.remove("hidden");
  m.setAttribute("aria-hidden", "false");
}
export function hideModal(id) {
  const m = document.getElementById(id);
  if (!m) return;
  m.classList.add("hidden");
  m.setAttribute("aria-hidden", "true");
}

export function showSpinner(elOrSelector, show = true) {
  let el = null;
  if (!elOrSelector) return;
  if (typeof elOrSelector === "string") el = document.querySelector(elOrSelector);
  else el = elOrSelector;
  if (!el) return;
  if (show) el.classList.remove("hidden"); else el.classList.add("hidden");
}

export function createPilotCard(pilot = {}) {
  const div = document.createElement("div");
  div.className = "pilot-card card";
  const initials = (pilot.name || "?")
    .split(" ")
    .map(s => (s || "")[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
  div.innerHTML = `
    <div class="pilot-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
    <div class="pilot-body">
      <div class="pilot-head">
        <strong class="pilot-name">${escapeHtml(pilot.name || "Sin nombre")}</strong>
        <span class="pilot-number">#${escapeHtml(String(pilot.car_number || "?"))}</span>
      </div>
      <div class="pilot-team muted">${escapeHtml(pilot.team || "Sin equipo")}</div>
    </div>
  `;
  return div;
}

export function createTeamCard(team = {}) {
  const div = document.createElement("div");
  div.className = "team-card card";
  div.innerHTML = `
    <div class="team-logo" aria-hidden="true">${(team.name||"E")[0].toUpperCase()}</div>
    <div class="team-body">
      <strong class="team-name">${escapeHtml(team.name || "Sin nombre")}</strong>
      <div class="muted">${escapeHtml(team.base_country || "")}</div>
    </div>
  `;
  return div;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
