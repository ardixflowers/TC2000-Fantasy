// components.js
// Exporta utilidades UI reutilizables:
//  - toast(message, opts)
//  - showModal(id), hideModal(id)
//  - showSpinner(el, show)
//  - createPilotCard(pilot)

// Toast manager simple
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

// Modal helpers (actúan sobre id del modal)
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

// Spinner helper: recibe el elemento DOM (o selector) y lo muestra/oculta
export function showSpinner(elOrSelector, show = true) {
  let el = null;
  if (!elOrSelector) return;
  if (typeof elOrSelector === "string") el = document.querySelector(elOrSelector);
  else el = elOrSelector;
  if (!el) return;
  if (show) el.classList.remove("hidden"); else el.classList.add("hidden");
}

// Factory: tarjeta de piloto (devuelve HTMLElement)
export function createPilotCard(pilot = {}) {
  const div = document.createElement("div");
  div.className = "pilot-card";

  const initials = (pilot.name || "?")
    .split(" ")
    .map(s => (s || "")[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  div.innerHTML = `
    <div class="pilot-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
    <div style="flex:1">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <strong style="color:var(--yellow)">${escapeHtml(pilot.name || "Sin nombre")}</strong>
        <span style="font-size:13px;color:var(--muted)">#${escapeHtml(String(pilot.car_number || "?"))}</span>
      </div>
      <div style="font-size:13px;color:var(--muted)">${escapeHtml(pilot.team || "Sin equipo")}</div>
    </div>
  `;
  return div;
}

// pequeño helper para evitar inyección accidental
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
