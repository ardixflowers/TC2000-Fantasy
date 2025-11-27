// components.js
export function toast(message, opts = {}) {
    const toasts = document.getElementById("toasts");
    // verifica si el contenedor de toasts existe
    if (!toasts) {
        console.warn("toasts container not found");
        return;
    }
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    toasts.appendChild(el);
    // temporizador para ocultar y eliminar el toast
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(8px)";
        setTimeout(() => el.remove(), 400);
    }, opts.duration || 3500);
}

export function showModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    // muestra el modal quitando hidden
    m.classList.remove("hidden");
    m.setAttribute("aria-hidden", "false");
}
export function hideModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    // oculta el modal anadiendo hidden
    m.classList.add("hidden");
    m.setAttribute("aria-hidden", "true");
}

export function showSpinner(elOrSelector, show = true) {
    let el = null;
    if (!elOrSelector) return;
    // soporta elemento o selector de string
    if (typeof elOrSelector === "string") el = document.querySelector(elOrSelector);
    else el = elOrSelector;
    if (!el) return;
    // muestra u oculta el spinner
    if (show) el.classList.remove("hidden"); else el.classList.add("hidden");
}

/**
 * devuelve la url de la imagen, si es invalida o null, usa la default.
 */
function resolveImageUrl(url) {
    const defaultPath = './resources/uploads/default-avatar.png';
    if (!url) return defaultPath;
    // si el string es "null" lo trata como default
    if (typeof url === 'string' && url.trim().toLowerCase() === 'null') return defaultPath;
    return url;
}

export function createPilotCard(pilot = {}) {
    const div = document.createElement("div");
    div.className = "pilot-card card";
    if (pilot && pilot._id) div.dataset.id = pilot._id;

    // escapa valores para evitar inyeccion xss
    const name = escapeHtml(pilot.name || "sin nombre");
    const number = escapeHtml(String(pilot.car_number || "?"));
    const teamName = escapeHtml(pilot.team || "sin equipo");

    // obtiene la url del avatar con fallback
    const avatarSrc = resolveImageUrl(pilot.avatar_png);

    // crea el html de la tarjeta, incluye onerror para fallback de imagen
    div.innerHTML = `
    <img class="pilot-avatar" src="${avatarSrc}" alt="avatar ${name}" width="80" height="80"
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

    // escapa valores del equipo
    const name = escapeHtml(team.name || "sin nombre");
    const country = escapeHtml(team.base_country || "");

    // obtiene la url del logo con fallback
    const logoSrc = resolveImageUrl(team.logo_png);

    // crea el html de la tarjeta de equipo con fallback de imagen
    div.innerHTML = `
    <img class="team-logo" src="${logoSrc}" alt="logo ${name}" width="64" height="64"
         onerror="this.onerror=null; this.src='./resources/uploads/default-avatar.png';" />
    <div class="team-body">
      <strong class="team-name">${name}</strong>
      <div class="muted">${country}</div>
    </div>
  `;
    return div;
}

// funcion para escapar html y prevenir xss
function escapeHtml(str) {
    return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}