// main.js (completo, consolidado y funcional)
// ------------------------------------------------------------------
// Usa helpers de components.js: toast, showModal, hideModal, showSpinner,
// createPilotCard, createTeamCard
import { toast, showModal, hideModal, showSpinner, createPilotCard, createTeamCard } from './components.js';

// ---------------- CONFIG ----------------
const API_BASE = "http://localhost:5000"; // Cambialo si tu backend corre en otro host/puerto
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// ---------------- APP STATE ----------------
let token = localStorage.getItem("tc2000_token") || null;
let userInfo = JSON.parse(localStorage.getItem("tc2000_user") || "null");

// ---------------- JWT / UTIL ----------------
function parseJwt(token) {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (err) { console.warn("parseJwt err", err); return null; }
}

function escapeHtml(s){ return String(s || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }

function isAdmin() { return userInfo && userInfo.role === "admin"; }

// ---------------- DOM REFERENCES (llenados on DOMContentLoaded) ----------------
let navLinks, navUnderline, siteNav, hamburger, drawer, drawerBackdrop, drawerClose, drawerLinks;
let openAuth, authModal, authClose, tabs, tabContents, loginForm, registerForm, loginSpinner, registerSpinner;
let loginError, registerError, userLabel, avatarImg, avatarBtn, logoutBtn, adminPanel;
let refreshPilotsBtn, pilotsGrid, refreshTeamsBtn, teamsGrid;
let createPilotBtn, pilotNameInput, pilotTeamInput, pilotNumberInput;
let teamListEl, createTeamBtn, teamNameInput, teamCountryInput;
let themeToggle, appRoot, dotSSE, dotWS, dotUser, toastsEl;
let navAdminLink;

// ---------------- ON DOM READY ----------------
document.addEventListener("DOMContentLoaded", () => {

  // ------- bind DOM -------
  navLinks = $$(".nav-link");
  navUnderline = $("#navUnderline");
  siteNav = $("#siteNav");
  hamburger = $("#hamburger");
  drawer = $("#drawer");
  drawerBackdrop = $("#drawerBackdrop");
  drawerClose = $("#drawerClose");
  drawerLinks = $$(".drawer-link");

  openAuth = $("#openAuth");
  authModal = $("#authModal");
  authClose = $("#authClose");
  tabs = $$(".tab");
  tabContents = $$(".tab-content");
  loginForm = $("#loginForm");
  registerForm = $("#registerForm");
  loginSpinner = $("#loginSpinner");
  registerSpinner = $("#registerSpinner");
  loginError = $("#loginError");
  registerError = $("#registerError");

  userLabel = $("#userLabel");
  avatarImg = $("#avatarImg");
  avatarBtn = $("#avatarBtn");
  logoutBtn = $("#logoutBtn");
  adminPanel = $("#admin");

  refreshPilotsBtn = $("#refreshPilots");
  pilotsGrid = $("#pilotsGrid");
  refreshTeamsBtn = $("#refreshTeams");
  teamsGrid = $("#teamsGrid");

  createPilotBtn = $("#createPilotBtn");
  pilotNameInput = $("#pilot_name");
  pilotTeamInput = $("#pilot_team");
  pilotNumberInput = $("#pilot_number");

  teamListEl = $("#teamsList");
  createTeamBtn = $("#createTeamBtn");
  teamNameInput = $("#team_name");
  teamCountryInput = $("#team_country");

  themeToggle = $("#themeToggle");
  appRoot = $("#app");
  dotSSE = document.querySelector("#dot-sse .dot");
  dotWS = document.querySelector("#dot-ws .dot");
  dotUser = document.querySelector("#dot-user .dot");
  toastsEl = $("#toasts");
  navAdminLink = document.querySelector(".nav-link.admin-only");

  // ------- NAV UNDERLINE animation -------
  function updateUnderline(targetLink) {
    if (!navUnderline || !siteNav) return;
    if (!targetLink) { navUnderline.style.width = "0"; return; }
    const rect = targetLink.getBoundingClientRect();
    const navRect = siteNav.getBoundingClientRect();
    const left = rect.left - navRect.left + siteNav.scrollLeft;
    navUnderline.style.width = `${rect.width}px`;
    navUnderline.style.transform = `translateX(${left}px)`;
    navLinks.forEach(a => a.classList.toggle("active", a === targetLink));
  }
  window.addEventListener("resize", () => {
    const active = document.querySelector(".nav-link.active");
    if (active) updateUnderline(active);
  });

  navLinks.forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const page = link.getAttribute("href");
      const target = document.querySelector(page);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      updateUnderline(link);
      history.replaceState(null, "", page);
    });
  });
  // initial underline selection
  const initialHash = window.location.hash || "#inicio";
  const initialLink = document.querySelector(`.nav-link[href="${initialHash}"]`) || document.querySelector(".nav-link");
  if (initialLink) updateUnderline(initialLink);

  // ------- DRAWER (mobile) -------
  function closeDrawer() {
    if (!drawer || !drawerBackdrop) return;
    drawer.classList.remove("open");
    drawerBackdrop.classList.add("hidden");
    drawer.setAttribute("aria-hidden", "true");
  }
  function openDrawer() {
    if (!drawer || !drawerBackdrop) return;
    drawer.classList.add("open");
    drawerBackdrop.classList.remove("hidden");
    drawer.setAttribute("aria-hidden", "false");
  }
  if (hamburger && drawer && drawerBackdrop) {
    hamburger.addEventListener("click", openDrawer);
    drawerClose && drawerClose.addEventListener("click", closeDrawer);
    drawerBackdrop && drawerBackdrop.addEventListener("click", closeDrawer);
    drawerLinks.forEach(l => l.addEventListener("click", e => {
      closeDrawer();
      const href = l.getAttribute("href");
      const t = document.querySelector(href);
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", href);
    }));
  }

  // ------- THEME -------
  function setTheme(theme) {
    if (!appRoot) return;
    if (theme === "dark") appRoot.classList.remove("theme-light"); else appRoot.classList.add("theme-light");
    localStorage.setItem("tc2000_theme", theme);
  }
  themeToggle && themeToggle.addEventListener("click", () => {
    const current = localStorage.getItem("tc2000_theme") || "dark";
    setTheme(current === "dark" ? "light" : "dark");
  });
  setTheme(localStorage.getItem("tc2000_theme") || "dark");

  // ------- AUTH MODAL -------
  function openAuthModal() {
    authModal && authModal.classList.remove("hidden");
    // show login tab by default
    const loginTab = document.querySelector('.tab[data-tab="login"]');
    if (loginTab) loginTab.click();
  }
  openAuth && openAuth.addEventListener("click", openAuthModal);
  avatarBtn && avatarBtn.addEventListener("click", openAuthModal);
  authClose && authClose.addEventListener("click", () => authModal && authModal.classList.add("hidden"));
  tabs.forEach(t => t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const target = t.dataset.tab;
    tabContents.forEach(tc => tc.classList.toggle("hidden", tc.id !== `tab-${target}`));
  }));

  // ------- REGISTER -------
  registerForm && registerForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    registerError && registerError.classList.add("hidden");
    const username = $("#reg_user").value.trim();
    const email = $("#reg_email").value.trim();
    const pass = $("#reg_pass").value;
    const pass2 = $("#reg_pass2").value;
    if (!username || !pass) { registerError && (registerError.textContent = "Usuario y contraseña requeridos.", registerError.classList.remove("hidden")); return; }
    if (pass.length < 6) { registerError && (registerError.textContent = "La contraseña debe tener al menos 6 caracteres.", registerError.classList.remove("hidden")); return; }
    if (pass !== pass2) { registerError && (registerError.textContent = "Las contraseñas no coinciden.", registerError.classList.remove("hidden")); return; }
    showSpinner(registerSpinner, true);
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password: pass, role: "user" })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) {
        registerError && (registerError.textContent = data.error || JSON.stringify(data), registerError.classList.remove("hidden"));
      } else {
        toast("Registro exitoso. Iniciá sesión.");
        document.querySelector('.tab[data-tab="login"]')?.click();
        $("#username") && ($("#username").value = username);
      }
    } catch (err) {
      registerError && (registerError.textContent = "Error de red: " + err.message, registerError.classList.remove("hidden"));
    } finally { showSpinner(registerSpinner, false); }
  });

  // ------- LOGIN -------
  loginForm && loginForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    loginError && loginError.classList.add("hidden");
    const username = $("#username").value.trim();
    const password = $("#password").value;
    if (!username || !password) { loginError && (loginError.textContent = "Completar usuario y contraseña.", loginError.classList.remove("hidden")); return; }
    showSpinner(loginSpinner, true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok || !data.token) {
        loginError && (loginError.textContent = data.error || "Credenciales inválidas", loginError.classList.remove("hidden"));
        return;
      }
      token = data.token;
      const payload = parseJwt(token);
      const role = (payload && payload.role) ? payload.role : (data.role || "user");
      userInfo = { username: username, role: role };
      localStorage.setItem("tc2000_token", token);
      localStorage.setItem("tc2000_user", JSON.stringify(userInfo));
      hydrateUserUI();
      authModal && authModal.classList.add("hidden");
      toast(`Bienvenido, ${username}`);
    } catch (err) {
      loginError && (loginError.textContent = "Error de red: " + err.message, loginError.classList.remove("hidden"));
    } finally { showSpinner(loginSpinner, false); }
  });

  // ------- HYDRATE UI (user info, admin panel visibility) -------
  function hydrateUserUI() {
    if (userInfo && token) {
      userLabel && (userLabel.textContent = userInfo.username);
      if (avatarImg) { avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.username)}&background=c5121b&color=fff`; avatarImg.classList.remove("hidden"); }
      logoutBtn && logoutBtn.classList.remove("hidden");
      if (adminPanel) adminPanel.hidden = userInfo.role !== "admin";
      if (navAdminLink) navAdminLink.classList.toggle("hidden", userInfo.role !== "admin");
      dotUser && (dotUser.classList.remove("off","err"), dotUser.classList.add("ok"));
    } else {
      userLabel && (userLabel.textContent = "Ingresar");
      avatarImg && avatarImg.classList.add("hidden");
      logoutBtn && logoutBtn.classList.add("hidden");
      if (adminPanel) adminPanel.hidden = true;
      if (navAdminLink) navAdminLink.classList.add("hidden");
      dotUser && (dotUser.classList.remove("ok","err"), dotUser.classList.add("off"));
    }
  }

  logoutBtn && logoutBtn.addEventListener("click", () => {
    token = null; userInfo = null;
    localStorage.removeItem("tc2000_token"); localStorage.removeItem("tc2000_user");
    hydrateUserUI();
    toast("Sesión cerrada");
  });

  // If token exists in storage but no userInfo, decode token to fill a minimal userInfo
  token = localStorage.getItem("tc2000_token") || token;
  userInfo = JSON.parse(localStorage.getItem("tc2000_user") || JSON.stringify(userInfo));
  if (token && (!userInfo || !userInfo.role)) {
    const payload = parseJwt(token);
    if (payload) {
      userInfo = { username: payload.user_id || payload.username || "Usuario", role: payload.role || "user" };
      localStorage.setItem("tc2000_user", JSON.stringify(userInfo));
    }
  }
  hydrateUserUI();

  // ------- PILOTS: load & render & create -------
  async function loadPilots() {
    if (!pilotsGrid) return;
    pilotsGrid.innerHTML = `<div class="card">Cargando pilotos...</div>`;
    try {
      const res = await fetch(`${API_BASE}/pilots`);
      if (!res.ok) {
        const txt = await res.text().catch(()=>"");
        console.error("/pilots error", res.status, txt);
        pilotsGrid.innerHTML = `<div class="card">Error cargando pilotos.</div>`;
        return;
      }
      const pilots = await res.json().catch(()=>[]);
      renderPilots(pilots || []);
    } catch (err) {
      console.error("loadPilots err", err);
      pilotsGrid.innerHTML = `<div class="card">Error de red cargando pilotos.</div>`;
    }
  }

  function renderPilots(pilots) {
    if (!pilotsGrid) return;
    pilotsGrid.innerHTML = "";
    if (!Array.isArray(pilots) || pilots.length === 0) {
      pilotsGrid.innerHTML = `<div class="card">No hay pilotos.</div>`;
      return;
    }
    pilots.forEach(p => pilotsGrid.appendChild(createPilotCard(p)));
  }

  refreshPilotsBtn && refreshPilotsBtn.addEventListener("click", () => { loadPilots(); toast("Actualizando pilotos..."); });

  createPilotBtn && createPilotBtn.addEventListener("click", async () => {
    if (!token) { toast("Debe iniciar sesión como admin"); return; }
    if (!isAdmin()) { toast("Acceso denegado: Admins solamente"); return; }
    const name = pilotNameInput?.value?.trim() || "";
    const team = pilotTeamInput?.value?.trim() || "";
    const car_number = pilotNumberInput?.value?.trim() || "";
    if (!name) { toast("Nombre requerido"); return; }
    showSpinner(createPilotBtn, true);
    try {
      const res = await fetch(`${API_BASE}/pilots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ name, team, car_number })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) {
        toast("Error creando piloto: " + (data.error || res.status));
      } else {
        toast("Piloto creado");
        pilotNameInput.value = ""; pilotTeamInput.value = ""; pilotNumberInput.value = "";
        loadPilots();
      }
    } catch (err) {
      console.error("createPilot err", err); toast("Error de red al crear piloto");
    } finally { showSpinner(createPilotBtn, false); }
  });

  // ------- TEAMS: load & render & create & delete (admin) -------
  async function loadTeams() {
    // two places: public grid (teamsGrid) and admin list (teamListEl)
    if (teamsGrid) teamsGrid.innerHTML = `<div class="card">Cargando equipos...</div>`;
    if (teamListEl) teamListEl.innerHTML = `<div class="card">Cargando equipos...</div>`;
    try {
      const res = await fetch(`${API_BASE}/teams`);
      if (!res.ok) {
        const txt = await res.text().catch(()=>"");
        console.error("/teams error", res.status, txt);
        if (teamsGrid) teamsGrid.innerHTML = `<div class="card">Error cargando equipos.</div>`;
        if (teamListEl) teamListEl.innerHTML = `<div class="card">Error cargando equipos.</div>`;
        return;
      }
      const teams = await res.json().catch(()=>[]);
      renderTeamsGrid(teams || []);
      renderTeamsAdmin(teams || []);
    } catch (err) {
      console.error("loadTeams err", err);
      if (teamsGrid) teamsGrid.innerHTML = `<div class="card">Error de red cargando equipos.</div>`;
      if (teamListEl) teamListEl.innerHTML = `<div class="card">Error de red cargando equipos.</div>`;
    }
  }

  function renderTeamsGrid(teams) {
    if (!teamsGrid) return;
    teamsGrid.innerHTML = "";
    if (!Array.isArray(teams) || teams.length === 0) {
      teamsGrid.innerHTML = `<div class="card">No hay equipos.</div>`;
      return;
    }
    teams.forEach(t => teamsGrid.appendChild(createTeamCard(t)));
  }

  function renderTeamsAdmin(teams) {
    if (!teamListEl) return;
    teamListEl.innerHTML = "";
    if (!Array.isArray(teams) || teams.length === 0) {
      teamListEl.innerHTML = `<div class="card">No hay equipos.</div>`;
      return;
    }
    teams.forEach(t => {
      const div = document.createElement("div");
      div.className = "card team-row";
      div.style.display = "flex";
      div.style.justifyContent = "space-between";
      div.style.alignItems = "center";
      div.innerHTML = `
        <div>
          <strong>${escapeHtml(t.name)}</strong>
          <div style="font-size:13px;color:var(--muted)">${escapeHtml(t.base_country || "")}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn small secondary edit-team" data-id="${t._id}">Editar</button>
          <button class="btn small danger delete-team" data-id="${t._id}">Eliminar</button>
        </div>
      `;
      teamListEl.appendChild(div);

      // Delete handler
      const del = div.querySelector(".delete-team");
      del && del.addEventListener("click", async () => {
        if (!confirm("Eliminar equipo?")) return;
        try {
          const res = await fetch(`${API_BASE}/teams/${t._id}`, {
            method: "DELETE",
            headers: { "Authorization": token ? "Bearer " + token : "" }
          });
          if (!res.ok) {
            const err = await res.json().catch(()=>({}));
            toast("Error eliminando equipo: " + (err.error || res.status));
            return;
          }
          toast("Equipo eliminado");
          loadTeams();
        } catch (err) {
          console.error("delete team err", err); toast("Error de red al eliminar equipo");
        }
      });

      // Edit placeholder
      const edit = div.querySelector(".edit-team");
      edit && edit.addEventListener("click", () => {
        // opcional: abrir modal con formulario para editar.
        toast("Editar equipo no implementado — puedo agregar modal si querés.");
      });
    });
  }

  createTeamBtn && createTeamBtn.addEventListener("click", async () => {
    if (!token) { toast("Debes iniciar sesión como admin"); return; }
    if (!isAdmin()) { toast("Acceso denegado: Admins solamente"); return; }
    const name = teamNameInput?.value?.trim() || "";
    const base_country = teamCountryInput?.value?.trim() || "";
    if (!name) { toast("Nombre del equipo requerido"); return; }
    showSpinner(createTeamBtn, true);
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
      console.error("createTeam err", err); toast("Error de red creando equipo");
    } finally { showSpinner(createTeamBtn, false); }
  });

  refreshTeamsBtn && refreshTeamsBtn.addEventListener("click", () => { loadTeams(); toast("Actualizando equipos..."); });

  // ------- SSE & WebSocket realtime (no es crítico si falla) -------
  (function setupRealtime(){
    // SSE
    try {
      const sse = new EventSource(`${API_BASE}/sse`);
      sse.onopen = () => { dotSSE && (dotSSE.classList.remove("off","err"), dotSSE.classList.add("ok")); };
      sse.onerror = () => { dotSSE && (dotSSE.classList.remove("ok"), dotSSE.classList.add("err")); };
      sse.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "pilot_created") loadPilots();
          if (msg.type === "team_created") loadTeams();
          toast("Evento SSE: " + (msg.type || "evento"));
        } catch(err){ console.error("SSE parse err", err); }
      };
    } catch(err){
      dotSSE && (dotSSE.classList.remove("ok"), dotSSE.classList.add("err"));
    }

    // WS (socket.io client must be included in index.html)
    try {
      if (typeof io !== "undefined") {
        const socket = io(API_BASE);
        socket.on("connect", () => { dotWS && (dotWS.classList.remove("off","err"), dotWS.classList.add("ok")); });
        socket.on("disconnect", () => { dotWS && (dotWS.classList.remove("ok"), dotWS.classList.add("off")); });
        socket.on("connect_error", () => { dotWS && (dotWS.classList.remove("ok"), dotWS.classList.add("err")); });
        socket.on("pilot_created", msg => { toast("WS: Nuevo piloto " + (msg.name || "")); loadPilots(); });
        socket.on("team_created", msg => { toast("WS: Nuevo equipo " + (msg.name || "")); loadTeams(); });
      } else {
        // console.warn("socket.io client not loaded in page");
      }
    } catch(err) {
      dotWS && (dotWS.classList.remove("ok"), dotWS.classList.add("err"));
      console.error("WS setup err", err);
    }
  })();

  // ------- Hash route protection for admin -------
  window.addEventListener("hashchange", () => {
    const h = window.location.hash || "#inicio";
    if (h === "#admin") {
      if (!userInfo || userInfo.role !== "admin") {
        toast("Acceso restringido: Admins solamente");
        history.replaceState(null, "", "#inicio");
        document.querySelector("#inicio")?.scrollIntoView({ behavior: "smooth" });
      } else {
        document.querySelector("#admin")?.scrollIntoView({ behavior: "smooth" });
      }
    }
  });

  // ------- ESC to close modal/drawer -------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      authModal && authModal.classList.add("hidden");
      if (drawer && drawer.classList.contains("open")) closeDrawer();
    }
  });

  // ------- Expose debug helpers -------
  window.tc2000 = window.tc2000 || {};
  window.tc2000.loadPilots = loadPilots;
  window.tc2000.loadTeams = loadTeams;
  window.tc2000.getUserInfo = () => userInfo;
  window.tc2000.setToken = (t) => { token = t; localStorage.setItem("tc2000_token", t); };

  // ------- Initial data load -------
  loadPilots();
  loadTeams();

}); // end DOMContentLoaded

// ---------------- END OF FILE ----------------
