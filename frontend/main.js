// main.js (módulo) — usa components.js para UI helpers
import { toast, showModal, hideModal, showSpinner, createPilotCard } from './components.js';

const API_BASE = "http://localhost:5000"; // ajustá si corre en otro host/puerto

// Safe selectors
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// App state
let token = localStorage.getItem("tc2000_token") || null;
let userInfo = JSON.parse(localStorage.getItem("tc2000_user") || "null");

// DOM elements (declaración - serán null si no existen)
let navLinks, navUnderline, siteNav, hamburger, drawer, drawerBackdrop, drawerClose, drawerLinks;
let openAuth, authModal, authClose, tabs, tabContents, loginForm, registerForm, loginSpinner, registerSpinner;
let loginError, registerError, userLabel, avatarImg, avatarBtn, logoutBtn, adminPanel, refreshPilots, pilotsGrid, createPilotBtn;
let themeToggle, appRoot, dotSSE, dotWS, dotUser, toastsEl;

// Initialize after DOM ready
document.addEventListener("DOMContentLoaded", () => {
  // bind elements
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
  adminPanel = $("#adminPanel");

  refreshPilots = $("#refreshPilots");
  pilotsGrid = $("#pilotsGrid");
  createPilotBtn = $("#createPilotBtn");

  themeToggle = $("#themeToggle");
  appRoot = $("#app");
  dotSSE = document.querySelector("#dot-sse .dot");
  dotWS = document.querySelector("#dot-ws .dot");
  dotUser = document.querySelector("#dot-user .dot");
  toastsEl = $("#toasts");

  // NAV underline animation
  function updateUnderline(targetLink) {
    if (!navUnderline || !siteNav) return;
    if (!targetLink) {
      navUnderline.style.width = "0";
      return;
    }
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

  // nav anchors
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

  // initial underline
  const first = document.querySelector(".nav-link");
  if (first) updateUnderline(first);
  const hash = window.location.hash || "#inicio";
  const initial = document.querySelector(`.nav-link[href="${hash}"]`);
  if (initial) updateUnderline(initial);

  // Drawer mobile
  if (hamburger && drawer && drawerBackdrop) {
    hamburger.addEventListener("click", () => {
      drawer.classList.add("open");
      drawerBackdrop.classList.remove("hidden");
      drawer.setAttribute("aria-hidden", "false");
    });
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

  function closeDrawer() {
    if (!drawer || !drawerBackdrop) return;
    drawer.classList.remove("open");
    drawerBackdrop.classList.add("hidden");
    drawer.setAttribute("aria-hidden", "true");
  }

  // Theme
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

  // Modal auth
  function openAuthModal() {
    authModal && authModal.classList.remove("hidden");
    authModal && authModal.querySelector(".tab.active")?.click();
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

  // Auth: register
  registerForm && registerForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const username = $("#reg_user").value.trim();
    const email = $("#reg_email").value.trim();
    const pass = $("#reg_pass").value;
    const pass2 = $("#reg_pass2").value;
    registerError && registerError.classList.add("hidden");
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
      const data = await res.json();
      if (!res.ok) {
        registerError && (registerError.textContent = data.error || JSON.stringify(data), registerError.classList.remove("hidden"));
      } else {
        toast("Registro exitoso. Iniciá sesión.");
        document.querySelector('.tab[data-tab="login"]').click();
        $("#username").value = username;
        $("#password").value = "";
      }
    } catch (err) {
      registerError && (registerError.textContent = "Error de red: " + err.message, registerError.classList.remove("hidden"));
    } finally { showSpinner(registerSpinner, false); }
  });

  // Auth: login
  loginForm && loginForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const username = $("#username").value.trim();
    const password = $("#password").value;
    loginError && loginError.classList.add("hidden");
    if (!username || !password) { loginError && (loginError.textContent = "Completar usuario y contraseña.", loginError.classList.remove("hidden")); return; }
    showSpinner(loginSpinner, true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        loginError && (loginError.textContent = data.error || "Credenciales inválidas", loginError.classList.remove("hidden"));
      } else {
        token = data.token;
        userInfo = { username, role: data.role || "user" };
        localStorage.setItem("tc2000_token", token);
        localStorage.setItem("tc2000_user", JSON.stringify(userInfo));
        hydrateUserUI();
        authModal && authModal.classList.add("hidden");
        toast(`Bienvenido, ${username}`);
      }
    } catch (err) {
      loginError && (loginError.textContent = "Error de red: " + err.message, loginError.classList.remove("hidden"));
    } finally { showSpinner(loginSpinner, false); }
  });

  // Hydrate UI
  function hydrateUserUI() {
    if (userInfo && token) {
      userLabel && (userLabel.textContent = userInfo.username);
      if (avatarImg) { avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.username)}&background=c5121b&color=fff`; avatarImg.classList.remove("hidden"); }
      logoutBtn && logoutBtn.classList.remove("hidden");
      if (adminPanel) adminPanel.hidden = userInfo.role !== "admin";
      // show admin nav link
      const adminLink = document.querySelector(".nav-link.admin-only");
      if (adminLink) adminLink.classList.toggle("hidden", userInfo.role !== "admin");
      dotUser && (dotUser.classList.remove("off","err"), dotUser.classList.add("ok"));
    } else {
      userLabel && (userLabel.textContent = "Ingresar");
      avatarImg && avatarImg.classList.add("hidden");
      logoutBtn && logoutBtn.classList.add("hidden");
      if (adminPanel) adminPanel.hidden = true;
      const adminLink = document.querySelector(".nav-link.admin-only");
      if (adminLink) adminLink.classList.add("hidden");
      dotUser && (dotUser.classList.remove("ok","err"), dotUser.classList.add("off"));
    }
  }
  logoutBtn && logoutBtn.addEventListener("click", () => {
    token = null; userInfo = null;
    localStorage.removeItem("tc2000_token"); localStorage.removeItem("tc2000_user");
    hydrateUserUI();
    toast("Sesión cerrada");
  });

  // Pilots CRUD & rendering (use createPilotCard)
  async function loadPilots() {
    try {
      const res = await fetch(`${API_BASE}/pilots`);
      const contentType = res.headers.get("content-type") || "";
      if (!res.ok) {
        const text = await res.text();
        console.error("/pilots status", res.status, text);
        toast("Error cargando pilotos (revisá backend)");
        return;
      }
      if (contentType.includes("application/json")) {
        const pilots = await res.json();
        renderPilots(pilots || []);
      } else {
        const text = await res.text();
        console.warn("/pilots returned non-json:", contentType);
        console.log(text.slice(0, 800));
        toast("Error: /pilots devolvió HTML (revisá server)");
      }
    } catch (err) {
      console.error("loadPilots error", err);
      toast("Error cargando pilotos: " + err.message);
    }
  }

  function renderPilots(pilots) {
    if (!pilotsGrid) return;
    pilotsGrid.innerHTML = "";
    if (!pilots.length) {
      pilotsGrid.innerHTML = `<div class="card">No hay pilotos.</div>`;
      return;
    }
    pilots.forEach(p => pilotsGrid.appendChild(createPilotCard(p)));
  }

  refreshPilots && refreshPilots.addEventListener("click", () => { loadPilots(); toast("Actualizando pilotos..."); });

  createPilotBtn && createPilotBtn.addEventListener("click", async () => {
    if (!token) { toast("Debe iniciar sesión como admin"); return; }
    const name = $("#pilot_name").value.trim();
    const team = $("#pilot_team").value.trim();
    const car_number = $("#pilot_number").value;
    if (!name) { toast("Nombre requerido"); return; }
    try {
      const res = await fetch(`${API_BASE}/pilots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify({ name, team, car_number })
      });
      const data = await res.json();
      if (!res.ok) toast("Error: " + (data.error || JSON.stringify(data)));
      else { toast("Piloto creado"); $("#pilot_name").value = ""; $("#pilot_team").value = ""; $("#pilot_number").value = ""; loadPilots(); }
    } catch (err) {
      console.error("createPilot error", err);
      toast("Error de red: " + err.message);
    }
  });

  // --- New Admin page logic ---
  // admin section is <section id="admin">... in index.html
  const adminSection = $("#admin");
  const teamListEl = $("#teamsList");
  const createTeamBtn = $("#createTeamBtn");
  const teamNameInput = $("#team_name");
  const teamCountryInput = $("#team_country");

  async function loadTeams() {
    if (!teamListEl) return;
    try {
      const res = await fetch(`${API_BASE}/teams`);
      if (!res.ok) {
        const txt = await res.text();
        console.warn("/teams status", res.status, txt);
        teamListEl.innerHTML = `<div class="card">No se pueden cargar equipos (endpoint /teams faltante o error).</div>`;
        return;
      }
      const teams = await res.json();
      renderTeams(teams || []);
    } catch (err) {
      console.error("loadTeams error", err);
      teamListEl.innerHTML = `<div class="card">Error cargando equipos: ${err.message}</div>`;
    }
  }

  function renderTeams(teams) {
    if (!teamListEl) return;
    teamListEl.innerHTML = "";
    if (!teams.length) { teamListEl.innerHTML = `<div class="card">No hay equipos.</div>`; return; }
    teams.forEach(t => {
      const div = document.createElement("div");
      div.className = "card";
      div.style.display = "flex";
      div.style.justifyContent = "space-between";
      div.style.alignItems = "center";
      div.innerHTML = `<div><strong>${escapeHtml(t.name)}</strong><div style="font-size:13px;color:var(--muted)">${escapeHtml(t.base_country||"")}</div></div>
                       <div><button class="btn small secondary" data-teamid="${t._id}">Eliminar</button></div>`;
      teamListEl.appendChild(div);
      // delete handler (optimistic)
      const delBtn = div.querySelector("button");
      delBtn && delBtn.addEventListener("click", async () => {
        if (!confirm("Eliminar equipo?")) return;
        try {
          const res = await fetch(`${API_BASE}/teams/${t._id}`, { method: "DELETE", headers: { "Authorization": "Bearer " + token }});
          if (!res.ok) { toast("Error eliminando equipo"); return; }
          toast("Equipo eliminado");
          loadTeams();
        } catch (err) { toast("Error de red"); }
      });
    });
  }

  // create team
  createTeamBtn && createTeamBtn.addEventListener("click", async () => {
    if (!token) { toast("Debes ser admin"); return; }
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
        const data = await res.json().catch(() => ({}));
        toast("Error creando equipo: " + (data.error || res.status));
        return;
      }
      toast("Equipo creado");
      teamNameInput.value = ""; teamCountryInput.value = "";
      loadTeams();
    } catch (err) {
      console.error("createTeam error", err);
      toast("Error de red: " + err.message);
    }
  });

  // --- Realtime (SSE & WS) ---
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
          toast("Evento SSE: " + (msg.type || "evento"));
        } catch(err){ console.error("SSE parse", err); }
      };
    } catch(err){
      dotSSE && (dotSSE.classList.remove("ok"), dotSSE.classList.add("err"));
    }

    // WS
    try {
      const socket = io(API_BASE);
      socket.on("connect", () => { dotWS && (dotWS.classList.remove("off","err"), dotWS.classList.add("ok")); });
      socket.on("disconnect", () => { dotWS && (dotWS.classList.remove("ok"), dotWS.classList.add("off")); });
      socket.on("connect_error", () => { dotWS && (dotWS.classList.remove("ok"), dotWS.classList.add("err")); });
      socket.on("pilot_created", msg => { toast("WS: Nuevo piloto " + (msg.name || "")); loadPilots(); });
    } catch(err) {
      dotWS && (dotWS.classList.remove("ok"), dotWS.classList.add("err"));
    }
  })();

  // helper escape
  function escapeHtml(s){ return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'", "&#39;"); }

  // initial hydration
  token = localStorage.getItem("tc2000_token") || null;
  userInfo = JSON.parse(localStorage.getItem("tc2000_user") || "null");
  hydrateUserUI();

  // load initial data for pages
  loadPilots();
  loadTeams(); // if endpoint exists, loads; otherwise will show message in UI

  // hash routing: when navigating to #admin, ensure only admin can view or redirect
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

  // close modal ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      authModal && authModal.classList.add("hidden");
      if (drawer && drawer.classList.contains("open")) closeDrawer();
    }
  });

  // expose debug funcs
  window.tc2000 = { loadPilots, loadTeams, toast, setTheme };

}); // end DOMContentLoaded
