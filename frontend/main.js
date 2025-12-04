import { toast, showModal, hideModal, showSpinner, createPilotCard } from './components.js';

// La IP debe coincidir con la IP REAL de tu servidor (la que viste en el registro)
const API_BASE = "http://127.0.0.1:5000"; 
const defaultPath = './resources/uploads/default-avatar.png';

// selectores
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// estado de la app
let token = localStorage.getItem("tc2000_token") || null;
let userInfo = JSON.parse(localStorage.getItem("tc2000_user") || "null");

// helpers
function decodeJwtPayload(jwt) {
    try {
        if (!jwt) return null;
        // limpia el formato del token si tiene b'...'
        jwt = jwt.replace(/^b'|^b"|"$|'$/g, '');
        const parts = jwt.split(".");
        if (parts.length < 2) return null;
        const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = payloadB64.padEnd(Math.ceil(payloadB64.length / 4) * 4, "=");
        const json = atob(padded);
        return JSON.parse(json);
    } catch (e) {
        console.error("decodeJwtPayload error:", e);
        return null;
    }
}

async function fetchMe() {
    if (!token) return null;
    try {
        const res = await fetch(`${API_BASE}/me`, {
            headers: { "Authorization": "Bearer " + token }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error("fetchMe error:", err);
        return null;
    }
}

function saveUserInfoToStorage(u) {
    userInfo = u || null;
    if (userInfo) localStorage.setItem("tc2000_user", JSON.stringify(userInfo));
    else localStorage.removeItem("tc2000_user");
}

function applyAdminVisibility() {
    const adminLink = document.querySelector(".nav-link.admin-only");
    // verifica si el usuario es admin
    let isAdmin = false;
    if (userInfo && userInfo.role === "admin") isAdmin = true;
    else if (!userInfo && token) {
        const p = decodeJwtPayload(token);
        if (p && (p.role === "admin" || (Array.isArray(p.roles) && p.roles.includes("admin")))) isAdmin = true;
    }
    if (adminLink) adminLink.classList.toggle("hidden", !isAdmin);
    const adminSection = document.getElementById("admin");
    if (adminSection) adminSection.classList.toggle("hidden", !isAdmin);
}

// actualiza el estado del led de usuario (ok|off|err)
function setDotUserState(state) {
    const dot = document.querySelector("#dot-user .dot");
    if (!dot) return;
    dot.classList.remove("ok", "off", "err");
    if (state === "ok") dot.classList.add("ok");
    else if (state === "err") dot.classList.add("err");
    else dot.classList.add("off");
}

function hydrateUserUI() {
    const userLabel = $("#userLabel");
    const avatarImg = $("#avatarImg");
    const logoutBtn = $("#logoutBtn");
    if (userInfo && userInfo.username) {
        if (userLabel) userLabel.textContent = userInfo.username;
        if (avatarImg) { avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.username)}&background=c5121b&color=fff`; avatarImg.classList.remove("hidden"); }
        if (logoutBtn) logoutBtn.classList.remove("hidden");
        setDotUserState("ok");
    } else {
        if (userLabel) userLabel.textContent = "Ingresar";
        if (avatarImg) avatarImg.classList.add("hidden");
        if (logoutBtn) logoutBtn.classList.add("hidden");
        setDotUserState("off");
    }
    applyAdminVisibility();
}

// helper para escapar html
function escapeHtml(s) { return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

// === inicio domcontentloaded ===
document.addEventListener("DOMContentLoaded", () => {
    // elementos del dom
    const navLinksAll = $$(".nav-link");
    const navUnderline = $("#navUnderline");
    const siteNav = $("#siteNav");
    const hamburger = $("#hamburger");
    const drawer = $("#drawer");
    const drawerBackdrop = $("#drawerBackdrop");
    const drawerClose = $("#drawerClose");
    const drawerLinks = $$(".drawer-link");

    const openAuth = $("#openAuth");
    const authModal = $("#authModal");
    const authClose = $("#authClose");
    const tabs = $$(".tab");
    const tabContents = $$(".tab-content");
    const loginForm = $("#loginForm");
    const registerForm = $("#registerForm");
    const loginSpinner = $("#loginSpinner");
    const registerSpinner = $("#registerSpinner");
    const loginError = $("#loginError");
    const registerError = $("#registerError");

    const userLabel = $("#userLabel");
    const avatarImg = $("#avatarImg");
    const avatarBtn = $("#avatarBtn");
    const logoutBtn = $("#logoutBtn");

    const refreshPilots = $("#refreshPilots");
    const pilotsGrid = $("#pilotsGrid");
    const teamsGrid = $("#teamsGrid");
    const createPilotBtn = $("#createPilotBtn");

    const themeToggle = $("#themeToggle");
    const appRoot = $("#app");
    const dotSSE = document.querySelector("#dot-sse .dot");
    const dotWS = document.querySelector("#dot-ws .dot");
    const toastsEl = $("#toasts");

    // animacion del subrayado de la navegacion
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
        navLinksAll.forEach(a => a.classList.toggle("active", a === targetLink));
    }
    window.addEventListener("resize", () => {
        const active = document.querySelector(".nav-link.active");
        if (active) updateUnderline(active);
    });

    // manejo de navegacion (scroll a secciones)
    navLinksAll.forEach(link => {
        link.addEventListener("click", e => {
            const href = link.getAttribute("href") || "";
            if (href.startsWith("#")) {
                e.preventDefault();
                const page = href;
                // verifica permisos de admin si va a #admin
                if (page === "#admin") {
                    const stored = JSON.parse(localStorage.getItem("tc2000_user") || "null");
                    let allowed = stored && stored.role === "admin";
                    if (!allowed && token) {
                        const payload = decodeJwtPayload(token);
                        if (payload && (payload.role === "admin" || (Array.isArray(payload.roles) && payload.roles.includes("admin")))) allowed = true;
                    }
                    if (!allowed) {
                        toast("acceso denegado: solo administradores.");
                        return;
                    }
                }
                const target = document.querySelector(page);
                if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
                updateUnderline(link);
                history.replaceState(null, "", page);
            }
        });
    });

    // cambio de tema
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

    // modal de autenticacion
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

    // manejador de registro
    registerForm && registerForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const username = $("#reg_user").value.trim();
        const email = $("#reg_email").value.trim();
        const pass = $("#reg_pass").value;
        const pass2 = $("#reg_pass2").value;
        registerError && registerError.classList.add("hidden");
        // validacion simple
        if (!username || !pass) { registerError && (registerError.textContent = "usuario y contraseña requeridos.", registerError.classList.remove("hidden")); return; }
        if (pass.length < 6) { registerError && (registerError.textContent = "la contraseña debe tener al menos 6 caracteres.", registerError.classList.remove("hidden")); return; }
        if (pass !== pass2) { registerError && (registerError.textContent = "las contraseñas no coinciden.", registerError.classList.remove("hidden")); return; }
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
                toast("registro exitoso. iniciá sesión.");
                document.querySelector('.tab[data-tab="login"]').click();
                $("#username").value = username;
                $("#password").value = "";
            }
        } catch (err) {
            registerError && (registerError.textContent = "error de red: " + err.message, registerError.classList.remove("hidden"));
        } finally { showSpinner(registerSpinner, false); }
    });

    // manejador de inicio de sesion
    loginForm && loginForm.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const username = $("#username").value.trim();
        const password = $("#password").value;
        loginError && loginError.classList.add("hidden");
        if (!username || !password) { loginError && (loginError.textContent = "completar usuario y contraseña.", loginError.classList.remove("hidden")); return; }
        showSpinner(loginSpinner, true);
        try {
            const res = await fetch(`${API_BASE}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.token) {
                loginError && (loginError.textContent = data.error || "credenciales invalidas", loginError.classList.remove("hidden"));
                setDotUserState("err");
                return;
            }

            // token obtenido
            token = data.token;
            localStorage.setItem("tc2000_token", token);

            // intenta obtener info autoritativa /me
            const meResp = await fetchMe();

            if (meResp) {
                // usa la info de /me
                userInfo = {
                    username: meResp.username || username,
                    role: meResp.role || "user"
                };
            } else {
                // fallback: decodifica el token
                const payload = decodeJwtPayload(token);
                userInfo = {
                    username: username,
                    role: (payload && payload.role) || "user"
                };
            }

            // guarda y actualiza ui
            saveUserInfoToStorage(userInfo);
            hydrateUserUI();
            authModal && authModal.classList.add("hidden");
            toast(`bienvenido, ${userInfo.username}`);

            // si es admin, redirige
            if (userInfo.role === "admin") {
                window.location.href = "admin.html";
            }
        } catch (err) {
            loginError && (loginError.textContent = "error de red: " + err.message, loginError.classList.remove("hidden"));
            setDotUserState("err");
        } finally {
            showSpinner(loginSpinner, false);
        }
    });


    // hidratacion inicial de la sesion
    (async function initialHydrate() {
        token = localStorage.getItem("tc2000_token") || null;
        let stored = JSON.parse(localStorage.getItem("tc2000_user") || "null");
        if (token) {
            const meResp = await fetchMe();
            if (meResp === null) {
                // error en /me: intenta usar stored o payload
                if (stored) {
                    userInfo = stored;
                } else {
                    const payload = decodeJwtPayload(token);
                    userInfo = payload && payload.username ? { username: payload.username, role: payload.role || "user" } : null;
                }
                saveUserInfoToStorage(userInfo);
                hydrateUserUI();
            } else if (meResp && meResp.username) {
                // /me devolvio info valida
                userInfo = { username: meResp.username, role: meResp.role || stored?.role || "user" };
                saveUserInfoToStorage(userInfo);
                hydrateUserUI();
            } else {
                // /me 401: token invalido o expirado
                if (stored) {
                    userInfo = stored;
                    hydrateUserUI();
                } else {
                    token = null;
                    userInfo = null;
                    localStorage.removeItem("tc2000_token");
                    localStorage.removeItem("tc2000_user");
                    hydrateUserUI();
                    setDotUserState("err");
                }
            }
        } else {
            // no hay token
            userInfo = stored;
            hydrateUserUI();
        }
    })();


    // cerrar sesion
    logoutBtn && logoutBtn.addEventListener("click", () => {
        token = null; userInfo = null;
        localStorage.removeItem("tc2000_token"); localStorage.removeItem("tc2000_user");
        hydrateUserUI();
        toast("sesion cerrada");
        // redirige a index si esta en admin.html
        if (window.location.pathname.endsWith("admin.html")) window.location.href = "index.html";
    });

    // === pilotos: carga y renderizado ===
    async function loadPilots() {
        try {
            const res = await fetch(`${API_BASE}/pilots`);
            const contentType = res.headers.get("content-type") || "";
            if (!res.ok) {
                const text = await res.text();
                console.error("/pilots status", res.status, text);
                toast("error cargando pilotos (revisa backend)");
                return;
            }
            if (contentType.includes("application/json")) {
                const pilots = await res.json();
                renderPilots(pilots || []);
            } else {
                const text = await res.text();
                console.warn("/pilots devolvio non-json:", contentType);
                console.log(text.slice(0, 800));
                toast("error: /pilots devolvio html (revisa server)");
            }
        } catch (err) {
            console.error("loadPilots error", err);
            toast("error cargando pilotos: " + err.message);
        }
    }

    function renderPilots(pilots) {
        if (!pilotsGrid) return;
        pilotsGrid.innerHTML = "";
        if (!pilots.length) {
            pilotsGrid.innerHTML = `<div class="card">no hay pilotos.</div>`;
            return;
        }
        pilots.forEach(p => pilotsGrid.appendChild(createPilotCard(p)));
    }

    refreshPilots && refreshPilots.addEventListener("click", () => { loadPilots(); toast("actualizando pilotos..."); });

    // === equipos: carga y renderizado ===
    async function loadTeams() {
        if (!teamsGrid) return;
        try {
            teamsGrid.innerHTML = "<div class='card'>cargando equipos...</div>";
            const res = await fetch(`${API_BASE}/teams`);
            if (!res.ok) {
                const txt = await res.text().catch(() => "");
                console.error("/teams error", res.status, txt);
                teamsGrid.innerHTML = `<div class="card">error cargando equipos.</div>`;
                return;
            }
            const teams = await res.json();
            renderTeams(teams || []);
        } catch (err) {
            console.error("loadTeams error", err);
            teamsGrid.innerHTML = `<div class='card'>error: ${err.message}</div>`;
        }
    }

    function renderTeams(teams) {
        if (!teamsGrid) return;
        teamsGrid.innerHTML = "";
        if (!teams.length) {
            teamsGrid.innerHTML = `<div class="card">no hay equipos.</div>`;
            return;
        }

        teams.forEach(t => {
            // crea la tarjeta de equipo y aplica estilos
            const card = document.createElement("div");
            card.className = "card team-card";

            const inner = document.createElement("div");
            inner.className = "team-card-inner";
            inner.style.display = "flex";
            inner.style.gap = "12px";
            inner.style.alignItems = "center";

            // contenedor de avatar con estilos fijos
            const avatarWrap = document.createElement("div");
            avatarWrap.className = "team-avatar";
            avatarWrap.setAttribute("aria-hidden", "true");
            avatarWrap.style.width = "56px";
            avatarWrap.style.height = "56px";
            avatarWrap.style.borderRadius = "8px";
            avatarWrap.style.overflow = "hidden";
            avatarWrap.style.flex = "0 0 56px";
            avatarWrap.style.display = "flex";
            avatarWrap.style.alignItems = "center";
            avatarWrap.style.justifyContent = "center";
            avatarWrap.style.fontWeight = "700";
            avatarWrap.style.background = "#222";
            avatarWrap.style.color = "#fff";

            // prepara rutas candidatas de imagen (logo, image, por id, por nombre)
            const candidates = [];
            if (t.logo) candidates.push(String(t.logo));
            if (t.image) candidates.push(String(t.image));
            if (t._id) candidates.push(`./resources/uploads/equipos/${encodeURIComponent(t._id)}.png`);
            if (t.name) {
                const safeName = String(t.name).replace(/\s+/g, "-").replace(/[^a-zA-Z0-9\-_]/g, "");
                if (safeName) candidates.push(`./resources/uploads/equipos/${encodeURIComponent(safeName)}.png`);
            }

            // logica de carga de imagen con fallback
            const img = document.createElement("img");
            img.alt = t.name ? `${t.name} logo` : "equipo";
            img.style.width = "56px";
            img.style.height = "56px";
            img.style.objectFit = "cover";
            img.style.display = "block";

            let attemptIndex = 0;
            function tryNextSrc() {
                if (attemptIndex < candidates.length) {
                    img.src = candidates[attemptIndex];
                    attemptIndex++;
                } else {
                    img.src = defaultPath;
                }
            }
            img.onerror = function () {
                // si falla, prueba el siguiente candidato
                tryNextSrc();
            };
            // empieza la carga
            tryNextSrc();

            avatarWrap.appendChild(img);

            const info = document.createElement("div");
            info.style.flex = "1";
            const nameDiv = document.createElement("div");
            nameDiv.style.fontWeight = "700";
            nameDiv.textContent = t.name || "Equipo";
            const countryDiv = document.createElement("div");
            countryDiv.style.fontSize = "13px";
            countryDiv.style.color = "var(--muted)";
            countryDiv.textContent = t.base_country || "";

            info.appendChild(nameDiv);
            info.appendChild(countryDiv);

            inner.appendChild(avatarWrap);
            inner.appendChild(info);

            card.appendChild(inner);
            teamsGrid.appendChild(card);
        });
    }

    // crear piloto (accion de admin)
    createPilotBtn && createPilotBtn.addEventListener("click", async () => {
        if (!token) { toast("debe iniciar sesion como admin"); return; }
        const name = $("#pilot_name") ? $("#pilot_name").value.trim() : "";
        const team = $("#pilot_team") ? $("#pilot_team").value.trim() : "";
        const car_number = $("#pilot_number") ? $("#pilot_number").value : "";
        if (!name) { toast("nombre requerido"); return; }
        try {
            const res = await fetch(`${API_BASE}/pilots`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
                body: JSON.stringify({ name, team, car_number })
            });
            const data = await res.json();
            if (!res.ok) toast("error: " + (data.error || JSON.stringify(data)));
            else { toast("piloto creado"); if ($("#pilot_name")) { $("#pilot_name").value = ""; $("#pilot_team").value = ""; $("#pilot_number").value = ""; } loadPilots(); }
        } catch (err) {
            console.error("createPilot error", err);
            toast("error de red: " + err.message);
        }
    });

    // --- tiempo real (sse & ws) ---
    (function setupRealtime() {
        // conexion sse
        try {
            const sse = new EventSource(`${API_BASE}/sse`);
            sse.onopen = () => { dotSSE && (dotSSE.classList.remove("off", "err"), dotSSE.classList.add("ok")); };
            sse.onerror = () => { dotSSE && (dotSSE.classList.remove("ok"), dotSSE.classList.add("err")); };
            sse.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    // recarga de datos por evento
                    if (msg.type === "pilot_created") loadPilots();
                    if (msg.type === "team_updated" || msg.type === "team_created") loadTeams();
                    toast("evento sse: " + (msg.type || "evento"));
                } catch (err) { console.error("sse parse", err); }
            };
        } catch (err) {
            dotSSE && (dotSSE.classList.remove("ok"), dotSSE.classList.add("err"));
        }

        // conexion socketio
        try {
            const socket = io(API_BASE);
            socket.on("connect", () => { dotWS && (dotWS.classList.remove("off", "err"), dotWS.classList.add("ok")); });
            socket.on("disconnect", () => { dotWS && (dotWS.classList.remove("ok"), dotWS.classList.add("off")); });
            socket.on("connect_error", () => { dotWS && (dotWS.classList.remove("ok"), dotWS.classList.add("err")); });
            // escucha eventos de socketio y recarga datos
            socket.on("pilot_created", msg => { toast("ws: nuevo piloto " + (msg.name || "")); loadPilots(); });
            socket.on("team_created", msg => { toast("ws: equipo creado " + (msg.name || "")); loadTeams(); });
            socket.on("team_updated", msg => { toast("ws: equipo actualizado " + (msg.name || "")); loadTeams(); });
        } catch (err) {
            dotWS && (dotWS.classList.remove("ok"), dotWS.classList.add("err"));
        }
    })();

    // carga inicial de datos
    loadPilots();
    loadTeams();

    // cierra modal con esc
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            authModal && authModal.classList.add("hidden");
            if (drawer && drawer.classList.contains("open")) drawer.classList.remove("open");
        }
    });

    // expone funciones de debug
    window.tc2000 = { loadPilots, loadTeams, toast, setTheme };
}); // fin domcontentloaded