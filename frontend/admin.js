// admin.js - logica exclusiva para la pagina de admin (verifica rol con /me y fallback jwt)
import { toast, showSpinner } from './components.js';

const API_BASE = "http://localhost:5000";
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function decodeJwtPayload(jwt) {
    try {
        // decodifica la parte del payload del jwt
        const parts = jwt.split(".");
        if (parts.length < 2) return null;
        const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = payloadB64.padEnd(Math.ceil(payloadB64.length / 4) * 4, "=");
        const json = atob(padded);
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
}

async function fetchMe(token) {
    if (!token) return null;
    try {
        // llama a /me para obtener info del usuario autenticado
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

    let me = null;
    // intenta obtener info autoritativa desde el servidor
    if (token) me = await fetchMe(token);

    let isAdmin = false;
    // 1. verifica si /me lo confirma
    if (me && me.role === "admin") {
        isAdmin = true;
        userInfo = { username: me.username, role: me.role };
        localStorage.setItem("tc2000_user", JSON.stringify(userInfo));
        // 2. fallback a info guardada localmente
    } else if (userInfo && userInfo.role === "admin") {
        isAdmin = true;
        // 3. fallback a decodificar el token jwt
    } else if (!me && token) {
        const payload = decodeJwtPayload(token);
        if (payload && (payload.role === "admin" || (payload.roles && payload.roles.includes("admin")))) {
            isAdmin = true;
            userInfo = { username: payload.username || "admin", role: "admin" };
            localStorage.setItem("tc2000_user", JSON.stringify(userInfo));
        }
    }

    // si no es admin, deniega el acceso
    if (!isAdmin) {
        alert("acceso denegado: solo administradores.");
        window.location.href = "index.html";
        return;
    }

    // elementos ui
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

    // actualiza ui del usuario (avatar y nombre)
    if (userLabel) userLabel.textContent = userInfo?.username || "admin";
    if (avatarImg) {
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo?.username || "Admin")}&background=c5121b&color=fff`;
        avatarImg.classList.remove("hidden");
    }
    if (logoutBtn) logoutBtn.classList.remove("hidden");

    // boton volver
    backBtn && backBtn.addEventListener("click", () => { window.location.href = "index.html"; });

    // boton cerrar sesion
    logoutBtn && logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("tc2000_token");
        localStorage.removeItem("tc2000_user");
        toast("sesion cerrada");
        window.location.href = "index.html";
    });

    // ---------------------------
    // equipos
    // ---------------------------

    async function loadTeams() {
        if (!teamsList) return;
        teamsList.innerHTML = "<div class='card'>cargando equipos...</div>";
        try {
            // pide los equipos, requiere token de autorizacion
            const res = await fetch(`${API_BASE}/teams`, {
                headers: { "Authorization": "Bearer " + token }
            });
            if (!res.ok) {
                teamsList.innerHTML = `<div class='card'>no se pueden cargar equipos (error).</div>`;
                return;
            }
            const teams = await res.json();
            renderTeams(teams || []);
        } catch (err) {
            teamsList.innerHTML = `<div class='card'>error: ${err.message}</div>`;
        }
    }

    function renderTeams(teams) {
        teamsList.innerHTML = "";
        if (!teams.length) {
            teamsList.innerHTML = `<div class='card'>no hay equipos.</div>`;
            return;
        }

        teams.forEach(t => {
            const div = document.createElement("div");
            div.className = "card";
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";

            div.innerHTML = `
        <div>
          <strong>${escapeHtml(t.name)}</strong>
          <div style="font-size:13px;color:var(--muted)">
            ${escapeHtml(t.base_country || "")}
          </div>
        </div>
        <div>
          <button class="btn small secondary" data-teamid="${t._id}">eliminar</button>
        </div>
      `;

            teamsList.appendChild(div);

            const delBtn = div.querySelector("button");
            // manejador para eliminar equipo
            delBtn.addEventListener("click", async () => {
                if (!confirm("eliminar equipo?")) return;
                try {
                    const res = await fetch(`${API_BASE}/teams/${t._id}`, {
                        method: "DELETE",
                        headers: { "Authorization": "Bearer " + token }
                    });
                    if (!res.ok) {
                        toast("error eliminando equipo");
                        return;
                    }
                    toast("equipo eliminado");
                    loadTeams();
                    populateTeamSelector();
                } catch (err) {
                    toast("error de red");
                }
            });
        });
    }

    createTeamBtn && createTeamBtn.addEventListener("click", async () => {
        const name = teamNameInput?.value?.trim() || "";
        const base_country = teamCountryInput?.value?.trim() || "";

        if (!name) {
            toast("nombre del equipo requerido");
            return;
        }

        try {
            // post para crear equipo
            const res = await fetch(`${API_BASE}/teams`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                },
                body: JSON.stringify({ name, base_country })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast("error creando equipo: " + (data.error || res.status));
                return;
            }
            toast("equipo creado");
            // limpia inputs y recarga
            teamNameInput.value = "";
            teamCountryInput.value = "";
            loadTeams();
            populateTeamSelector();
        } catch (err) {
            toast("error de red: " + err.message);
        }
    });

    // ---------------------------
    // pilotos (admin)
    // ---------------------------

    async function loadPilotsAdmin() {
        if (!pilotsList) return;
        pilotsList.innerHTML = "<div class='card'>cargando pilotos...</div>";
        try {
            // pide los pilotos, requiere token
            const res = await fetch(`${API_BASE}/pilots`, {
                headers: { "Authorization": "Bearer " + token }
            });
            if (!res.ok) {
                pilotsList.innerHTML = `<div class='card'>error cargando pilotos.</div>`;
                return;
            }
            const pilots = await res.json();
            renderPilotsAdmin(pilots || []);
        } catch (err) {
            pilotsList.innerHTML = `<div class='card'>error: ${err.message}</div>`;
        }
    }

    function renderPilotsAdmin(pilots) {
        pilotsList.innerHTML = "";
        if (!pilots.length) {
            pilotsList.innerHTML = `<div class='card'>no hay pilotos.</div>`;
            return;
        }

        pilots.forEach(p => {
            const div = document.createElement("div");
            div.className = "card";
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";

            div.innerHTML = `
        <div>
          <strong>${escapeHtml(p.name)}</strong>
          <div style="font-size:13px;color:var(--muted)">
            nº ${escapeHtml(p.car_number || "")}
          </div>
        </div>
        <div>
          <button class="btn small secondary" data-pilotid="${p._id}">
            eliminar
          </button>
        </div>
      `;

            pilotsList.appendChild(div);

            const delBtn = div.querySelector("button");
            // manejador para eliminar piloto
            delBtn.addEventListener("click", async () => {
                if (!confirm("eliminar piloto?")) return;
                try {
                    const res = await fetch(`${API_BASE}/pilots/${p._id}`, {
                        method: "DELETE",
                        headers: { "Authorization": "Bearer " + token }
                    });
                    if (!res.ok) {
                        toast("no se pudo eliminar piloto");
                        return;
                    }
                    toast("piloto eliminado");
                    loadPilotsAdmin();
                } catch (err) {
                    toast("error de red");
                }
            });
        });
    }

    const pilotNameInput = $("#pilot_name");
    const pilotTeamInput = $("#pilot_team");
    const pilotNumberInput = $("#pilot_number");

    createPilotBtn && createPilotBtn.addEventListener("click", async () => {
        const name = pilotNameInput?.value?.trim() || "";
        const team = pilotTeamInput?.value || "";
        const car_number = pilotNumberInput?.value || "";

        if (!name) {
            toast("nombre requerido");
            return;
        }

        if (!team) {
            toast("debe seleccionar un equipo valido");
            return;
        }


        try {
            // post para crear piloto
            const res = await fetch(`${API_BASE}/pilots`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + token
                },
                body: JSON.stringify({ name, team, car_number })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                toast("error creando piloto: " + (data.error || res.status));
                return;
            }
            toast("piloto creado");
            // limpia inputs y recarga
            pilotNameInput.value = "";
            pilotTeamInput.value = "";
            pilotNumberInput.value = "";
            loadPilotsAdmin();
        } catch (err) {
            toast("error de red: " + err.message);
        }
    });

    async function populateTeamSelector() {
        const select = $("#pilot_team");
        if (!select) return;

        try {
            // obtiene lista de equipos para el selector de creacion de piloto
            const res = await fetch(`${API_BASE}/teams`, {
                headers: { "Authorization": "Bearer " + token }
            });

            if (!res.ok) {
                console.error("no se pudieron cargar equipos para selector");
                return;
            }

            const teams = await res.json();
            select.innerHTML = `<option value="">seleccionar equipo...</option>`;

            teams.forEach(t => {
                const opt = document.createElement("option");
                opt.value = t.name;
                opt.textContent = t.name;
                select.appendChild(opt);
            });

        } catch (err) {
            console.error("error cargando equipos para selector:", err);
        }
    }


    function escapeHtml(s) {
        // helper para escapar html y prevenir xss
        return String(s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    // carga inicial de datos y selector
    loadTeams();
    loadPilotsAdmin();
    populateTeamSelector();
});