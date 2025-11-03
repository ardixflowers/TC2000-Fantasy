// admin.js - logic exclusivo para admin page (verifica rol con /me y fallback a JWT)
import { toast, showSpinner, createPilotCard } from './components.js';

const API_BASE = "http://localhost:5000";
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function decodeJwtPayload(jwt) {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadB64.padEnd(Math.ceil(payloadB64.length/4)*4, "=");
    const json = atob(padded);
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

async function fetchMe(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/me`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  let token = localStorage.getItem("tc2000_token") || null;
  let userInfo = JSON.parse(localStorage.getItem("tc2000_user") || "null");

  // primero intentar /me
  let me = null;
  if (token) me = await fetchMe(token);

  let isAdmin = false;
  if (me && me.role === "admin") {
    isAdmin = true;
    userInfo = { username: me.username, role: me.role };
    localStorage.setItem("tc2000_user", JSON.stringify(userInfo));
  } else if (userInfo && userInfo.role === "admin") {
    isAdmin = true;
  } else if (!me && token) {
    // fallback: decodificar token
    const payload = decodeJwtPayload(token);
    if (payload && (payload.role === "admin" || (payload.roles && payload.roles.includes("admin")))) {
      isAdmin = true;
      userInfo = { username: payload.username || (userInfo && userInfo.username) || "admin", role: "admin" };
      localStorage.setItem("tc2000_user", JSON.stringify(userInfo));
    }
  }

  if (!isAdmin) {
    alert("Acceso denegado: Solo administradores.");
    window.location.href = "index.html";
    return;
  }

  // bind elements
  const createPilotBtn = $("#createPilotBtn");
  const createTeamBtn = $("#createTeamBtn");
  const teamNameInput = $("#team_name");
  const teamCountryInput = $("#team_country");
  const teamsList = $("#teamsList");
  const pilotsList = $("#pilotsList");
  const backBtn = $("#backBtn");
  const logoutBtn = $("#logoutBtn");
  const avatarImg = $("#avatarImg");
  const userLabel = $("#userLabel");

  // mostrar usuario
  if (userLabel) userLabel.textContent = userInfo?.username || "admin";
  if (avatarImg) { avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo?.username||"Admin")}&background=c5121b&color=fff`; avatarImg.classList.remove("hidden"); }
  if (logoutBtn) logoutBtn.classList.remove("hidden");

  backBtn && backBtn.addEventListener("click", () => { window.location.href = "index.html"; });

  logoutBtn && logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("tc2000_token");
    localStorage.removeItem("tc2000_user");
    toast("Sesión cerrada");
    window.location.href = "index.html";
  });

  // Load teams
  async function loadTeams() {
    if (!teamsList) return;
    teamsList.innerHTML = "<div class='card'>Cargando equipos...</div>";
    try {
      const res = await fetch(`${API_BASE}/teams`, { headers: { "Authorization": "Bearer " + token }});
      if (!res.ok) {
        teamsList.innerHTML = `<div class='card'>No se pueden cargar equipos (error).</div>`;
        return;
      }
      const teams = await res.json();
      renderTeams(teams || []);
    } catch (err) {
      teamsList.innerHTML = `<div class='card'>Error: ${err.message}</div>`;
    }
  }

  function renderTeams(teams) {
    teamsList.innerHTML = "";
    if (!teams.length) { teamsList.innerHTML = `<div class='card'>No hay equipos.</div>`; return; }
    teams.forEach(t => {
      const div = document.createElement("div");
      div.className = "card";
      div.style.display = "flex";
      div.style.justifyContent = "space-between";
      div.style.alignItems = "center";
      div.innerHTML = `<div><strong>${escapeHtml(t.name)}</strong><div style="font-size:13px;color:var(--muted)">${escapeHtml(t.base_country||"")}</div></div>
                       <div><button class="btn small secondary" data-teamid="${t._id}">Eliminar</button></div>`;
      teamsList.appendChild(div);
      const delBtn = div.querySelector("button");
      delBtn && delBtn.addEventListener("click", async () => {
        if (!confirm("Eliminar equipo?")) return;
        try {
          const res = await fetch(`${API_BASE}/teams/${t._id}`, {
            method: "DELETE",
            headers: { "Authorization": "Bearer " + token }
          });
          if (!res.ok) { toast("Error eliminando equipo"); return; }
          toast("Equipo eliminado");
          loadTeams();
        } catch (err) { toast("Error de red"); }
      });
    });
  }

  // create team
  createTeamBtn && createTeamBtn.addEventListener("click", async () => {
    const name = teamNameInput?.value?.trim() || "";
    const base_country = teamCountryInput?.value?.trim() || "";
    if (!name) { toast("Nombre del equipo requerido"); return; }
    try {
      const res = await fetch(`${API_BASE}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ name, base_country })
      });
      if (!res.ok) {
        const data = await res.json().catch(()=>({}));
        toast("Error creando equipo: " + (data.error || res.status));
        return;
      }
      toast("Equipo creado");
      teamNameInput.value = ""; teamCountryInput.value = "";
      loadTeams();
    } catch (err) {
      toast("Error de red: " + err.message);
    }
  });

  // Load pilots for admin view
  async function loadPilotsAdmin() {
    if (!pilotsList) return;
    pilotsList.innerHTML = "<div class='card'>Cargando pilotos...</div>";
    try {
      const res = await fetch(`${API_BASE}/pilots`, { headers: { "Authorization": "Bearer " + token }});
      if (!res.ok) { pilotsList.innerHTML = `<div class='card'>Error cargando pilotos.</div>`; return; }
      const pilots = await res.json();
      renderPilotsAdmin(pilots || []);
    } catch (err) {
      pilotsList.innerHTML = `<div class='card'>Error: ${err.message}</div>`;
    }
  }

  function renderPilotsAdmin(pilots) {
    pilotsList.innerHTML = "";
    if (!pilots.length) { pilotsList.innerHTML = `<div class='card'>No hay pilotos.</div>`; return; }
    pilots.forEach(p => {
      pilotsList.appendChild(createPilotCard(p));
    });
  }

  // create pilot
  const pilotNameInput = $("#pilot_name");
  const pilotTeamInput = $("#pilot_team");
  const pilotNumberInput = $("#pilot_number");

  createPilotBtn && createPilotBtn.addEventListener("click", async () => {
    const name = pilotNameInput?.value?.trim() || "";
    const team = pilotTeamInput?.value?.trim() || "";
    const car_number = pilotNumberInput?.value || "";
    if (!name) { toast("Nombre requerido"); return; }
    try {
      const res = await fetch(`${API_BASE}/pilots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ name, team, car_number })
      });
      if (!res.ok) {
        const data = await res.json().catch(()=>({}));
        toast("Error creando piloto: " + (data.error || res.status));
        return;
      }
      toast("Piloto creado");
      pilotNameInput.value = ""; pilotTeamInput.value = ""; pilotNumberInput.value = "";
      loadPilotsAdmin();
    } catch (err) {
      toast("Error de red: " + err.message);
    }
  });

  function escapeHtml(s){ return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'", "&#39;"); }

  // initial load
  loadTeams();
  loadPilotsAdmin();
});
