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

/**
 * Devuelve la URL a usar para avatar/logo.
 * Si el campo en la BD es falsy o la cadena 'null', devuelve la ruta del default.
 */
function resolveImageUrl(url) {
  const defaultPath = './resources/uploads/default-avatar.png';
  if (!url) return defaultPath;
  // a veces viene "null" como string; normalizamos
  if (typeof url === 'string' && url.trim().toLowerCase() === 'null') return defaultPath;
  return url;
}

export function createPilotCard(pilot = {}) {
  const div = document.createElement("div");
  div.className = "pilot-card card";
  if (pilot && pilot._id) div.dataset.id = pilot._id;

  // safe name / number
  const name = escapeHtml(pilot.name || "Sin nombre");
  const number = escapeHtml(String(pilot.car_number || "?"));
  const teamName = escapeHtml(pilot.team || "Sin equipo");

  // decide src (usa la URL de la BD si existe, si no el default local)
  const avatarSrc = resolveImageUrl(pilot.avatar_png);

  // img tag con onerror para fallback (si la URL falla)
  div.innerHTML = `
    <img class="pilot-avatar" src="${avatarSrc}" alt="Avatar ${name}" width="80" height="80"
         onerror="this.onerror=null; this.src='./resources/uploads/default-avatar.png';" />
    <div class="pilot-body">
      <div class="pilot-head">
        <strong class="pilot-name">${name}</strong>
        <span class="pilot-number">#${number}</span>
      </div>
      <div class="pilot-team muted">${teamName}</div>
    </div>
  `;
  return div;
}

export function createTeamCard(team = {}) {
  const div = document.createElement("div");
  div.className = "team-card card";
  if (team && team._id) div.dataset.id = team._id;

  const name = escapeHtml(team.name || "Sin nombre");
  const country = escapeHtml(team.base_country || "");

  const logoSrc = resolveImageUrl(team.logo_png);

  div.innerHTML = `
    <img class="team-logo" src="${logoSrc}" alt="Logo ${name}" width="64" height="64"
         onerror="this.onerror=null; this.src='./resources/uploads/default-avatar.png';" />
    <div class="team-body">
      <strong class="team-name">${name}</strong>
      <div class="muted">${country}</div>
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
