// admin.js - logica exclusiva para la pagina de admin (verifica rol con /me y fallback jwt)
import { toast, showSpinner } from './components.js';

const API_BASE = "http://127.0.0.1:5000";
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

function formatDate(dateString) {
    if (!dateString || dateString === "null" || dateString === null) return "Nunca";
    try {
        // Manejar diferentes formatos de fecha
        let date;
        if (typeof dateString === 'object' && dateString.$date) {
            // Formato MongoDB: {$date: "2025-12-02T10:30:00Z"}
            date = new Date(dateString.$date);
        } else {
            date = new Date(dateString);
        }
        
        if (isNaN(date.getTime())) return "Nunca";
        return date.toLocaleString("es-ES");
    } catch (e) {
        console.error("Error formateando fecha:", dateString, e);
        return "Nunca";
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

    // Elementos del formulario de usuarios
    const userForm = document.getElementById('userForm');
    const userIdInput = document.getElementById('user_id');
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const roleSelect = document.getElementById('role');
    const isActiveCheckbox = document.getElementById('is_active');
    const saveUserBtn = document.getElementById('saveUserBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const usersList = document.getElementById('usersList');

    function escapeHtml(s) {
        // helper para escapar html y prevenir xss
        return String(s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    // ====================================
    // Funciones de la Interfaz de Usuario
    // ====================================

    function setupTabs() {
        const tabButtons = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remover clase active de todos los botones y contenidos
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.add('hidden'));

                // Agregar clase active al botón clickeado
                button.classList.add('active');
                
                // Mostrar el contenido correspondiente
                const tabId = button.getAttribute('data-tab');
                document.getElementById(tabId).classList.remove('hidden');
            });
        });
    }

    // ====================================
    // Funciones de la API de Usuarios
    // ====================================

    async function loadUsers() {
        if (!usersList) return;
        
        try {
            const response = await fetch(`${API_BASE}/admin/users`, {
                headers: { "Authorization": "Bearer " + localStorage.getItem("tc2000_token") }
            });
            
            if (!response.ok) {
                throw new Error('Error al cargar usuarios');
            }
            
            const users = await response.json();
            renderUsers(users);
        } catch (error) {
            console.error('Error:', error);
            toast('Error al cargar usuarios: ' + error.message, 'error');
        }
    }

    function renderUsers(users) {
        if (!usersList) return;
        
        if (!users || users.length === 0) {
            usersList.innerHTML = '<tr><td colspan="6" class="text-center">No hay usuarios registrados</td></tr>';
            return;
        }

        usersList.innerHTML = users.map(user => `
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.email || '')}</td>
                <td>${user.role === 'admin' ? 'Administrador' : 'Usuario'}</td>
                <td>
                    <span class="status-badge ${user.is_active !== false ? 'status-active' : 'status-inactive'}">
                        ${user.is_active !== false ? 'Activo' : 'Inactivo'}
                    </span>
                </td>
                <td>${formatDate(user.last_login)}</td>
                <td class="actions">
                    <button class="btn-action edit-user" data-id="${user._id}" title="Editar">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    ${user._id !== JSON.parse(localStorage.getItem("tc2000_user"))._id ? `
                    <button class="btn-action delete delete-user" data-id="${user._id}" title="Eliminar">
                        <i class="fas fa-trash"></i> Eliminar
                    </button>` : ''}
                </td>
            </tr>
        `).join('');

        // Agregar manejadores de eventos a los botones de edición
        document.querySelectorAll('.edit-user').forEach(btn => {
            btn.addEventListener('click', () => editUser(btn.dataset.id));
        });

        // Agregar manejadores de eventos a los botones de eliminación
        document.querySelectorAll('.delete-user').forEach(btn => {
            btn.addEventListener('click', () => deleteUser(btn.dataset.id));
        });
    }

    async function editUser(userId) {
        try {
            const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
                headers: { "Authorization": "Bearer " + localStorage.getItem("tc2000_token") }
            });
            
            if (!response.ok) {
                throw new Error('Error al cargar usuario');
            }
            
            const user = await response.json();
            
            // Rellenar el formulario con los datos del usuario
            userIdInput.value = user._id;
            usernameInput.value = user.username || '';
            emailInput.value = user.email || '';
            roleSelect.value = user.role || 'user';
            isActiveCheckbox.checked = user.is_active !== false;
            
            // Cambiar el texto del botón
            saveUserBtn.textContent = 'Actualizar Usuario';
            
            // Mostrar el botón de cancelar
            cancelEditBtn.style.display = 'inline-block';
            
            // Desplazarse al formulario
            document.getElementById('users').scrollIntoView({ behavior: 'smooth' });
            
        } catch (error) {
            console.error('Error:', error);
            toast('Error al cargar usuario: ' + error.message, 'error');
        }
    }

    async function deleteUser(userId) {
        if (!confirm('¿Estás seguro de que deseas eliminar este usuario?')) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
                method: 'DELETE',
                headers: { "Authorization": "Bearer " + localStorage.getItem("tc2000_token") }
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Error al eliminar usuario');
            }
            
            toast('Usuario eliminado correctamente', 'success');
            loadUsers();
            
        } catch (error) {
            console.error('Error:', error);
            toast('Error al eliminar usuario: ' + error.message, 'error');
        }
    }

    async function saveUser(e) {
        e.preventDefault();
        
        const userId = userIdInput.value;
        const userData = {
            username: usernameInput.value.trim(),
            email: emailInput.value.trim(),
            role: roleSelect.value,
            is_active: isActiveCheckbox.checked
        };
        
        // Validaciones
        if (!userData.username) {
            toast('El nombre de usuario es obligatorio', 'error');
            return;
        }
        
        if (!userData.email) {
            toast('El correo electrónico es obligatorio', 'error');
            return;
        }
        
        // Solo incluir la contraseña si se está creando un nuevo usuario o si se está cambiando
        if (!userId || passwordInput.value) {
            if (passwordInput.value.length < 6) {
                toast('La contraseña debe tener al menos 6 caracteres', 'error');
                return;
            }
            userData.password = passwordInput.value;
        }
        
        try {
            const url = userId ? `${API_BASE}/admin/users/${userId}` : `${API_BASE}/admin/users`;
            const method = userId ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem("tc2000_token")
                },
                body: JSON.stringify(userData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Error al guardar usuario');
            }
            
            toast(userId ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente', 'success');
            
            // Limpiar formulario y recargar lista
            resetUserForm();
            loadUsers();
            
        } catch (error) {
            console.error('Error:', error);
            toast('Error: ' + error.message, 'error');
        }
    }

    function resetUserForm() {
        userForm.reset();
        userIdInput.value = '';
        passwordInput.required = true;
        saveUserBtn.textContent = 'Guardar';
        cancelEditBtn.style.display = 'none';
    }

    function cancelEdit() {
        resetUserForm();
    }

    // Configuración de pestañas
    setupTabs();
    
    // Cargar datos iniciales
    loadTeams();
    loadPilotsAdmin();
    populateTeamSelector();
    loadUsers();
    
    // ========================
    // LOGS EN TIEMPO REAL CON SSE
    // ========================
    const clearLogsBtn = $('#clearLogsBtn');
    const pauseLogsBtn = $('#pauseLogsBtn');
    let logsActive = true;
    let eventSource = null;
    let logsInitialized = false;
    
    function initLogsSSE() {
        // Evitar inicializar múltiples veces
        if (logsInitialized && eventSource && eventSource.readyState === EventSource.OPEN) {
            console.log('SSE ya está conectado');
            return;
        }
        
        console.log('Inicializando SSE para logs...');
        
        // Cerrar conexión anterior si existe
        if (eventSource) {
            eventSource.close();
        }
        
        eventSource = new EventSource(`${API_BASE}/sse`);
        logsInitialized = true;
        
        eventSource.addEventListener('message', (event) => {
            console.log('Mensaje SSE recibido:', event.data);
            if (!logsActive) return; // Si está pausado, no procesar
            
            try {
                const data = JSON.parse(event.data);
                addLogEntry(data);
            } catch (e) {
                console.error('Error parsing SSE message:', e, event.data);
            }
        });
        
        eventSource.addEventListener('error', (err) => {
            console.error('SSE error:', err);
            if (eventSource.readyState === EventSource.CLOSED) {
                addLogEntry({
                    type: 'error',
                    message: 'Conexión a logs perdida. Reintentando...',
                    timestamp: new Date().toISOString()
                });
                logsInitialized = false;
                // Reintentar conexión después de 5 segundos
                setTimeout(initLogsSSE, 5000);
            }
        });
        
        // Enviar log de conexión exitosa
        console.log('SSE conectado');
    }
    
    function addLogEntry(logData) {
        const logsList = $('#logsList');
        
        if (!logsList) {
            console.warn('logsList no encontrado en addLogEntry');
            return;
        }
        
        console.log('Agregando log entry:', logData, 'a elemento:', logsList);
        
        // No mostrar heartbeat
        if (logData.type === 'heartbeat') {
            console.log('Ignorando heartbeat');
            return;
        }
        
        const logEntry = document.createElement('div');
        logEntry.style.cssText = `
            padding: 6px 0;
            border-bottom: 1px solid #333;
            font-size: 12px;
        `;
        
        // Determinar color según tipo
        let color = '#d4d4d4';
        let icon = '●';
        
        if (logData.type === 'error') {
            color = '#f48771';
            icon = '✕';
        } else if (logData.type === 'success') {
            color = '#89d185';
            icon = '✓';
        } else if (logData.type === 'warning') {
            color = '#dcdcaa';
            icon = '⚠';
        } else if (logData.type === 'server') {
            color = '#9cdcfe';
            icon = '→';
        } else if (logData.type) {
            color = '#569cd6';
            icon = '→';
        }
        
        const timestamp = new Date(logData.timestamp || new Date()).toLocaleTimeString('es-ES');
        const message = logData.message || JSON.stringify(logData);
        
        logEntry.innerHTML = `<span style="color: #888;">[${timestamp}]</span> <span style="color: ${color};">${icon} ${escapeHtml(message)}</span>`;
        
        console.log('Elemento creado:', logEntry);
        
        // Agregar al inicio (más reciente arriba)
        const firstChild = logsList.firstChild;
        if (firstChild && firstChild.textContent.includes('Esperando')) {
            console.log('Limpiando mensaje "Esperando"');
            logsList.innerHTML = '';
        }
        
        logsList.insertBefore(logEntry, logsList.firstChild);
        console.log('Log insertado, total de logs:', logsList.children.length);
        
        // Limitar cantidad de logs mostrados (últimos 1000)
        while (logsList.children.length > 1000) {
            logsList.removeChild(logsList.lastChild);
        }
    }
    
    // Event listeners para botones de logs
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', () => {
            if (logsList) {
                logsList.innerHTML = '<div style="color: #888;">Logs borrados. Esperando nuevos eventos...</div>';
            }
        });
    }
    
    if (pauseLogsBtn) {
        pauseLogsBtn.addEventListener('click', () => {
            logsActive = !logsActive;
            pauseLogsBtn.textContent = logsActive ? 'Pausar' : 'Reanudar';
            pauseLogsBtn.classList.toggle('active', !logsActive);
        });
    }
    
    // Inicializar SSE automáticamente al cargar
    initLogsSSE();
    
    // También iniciar cuando se abre la pestaña de logs
    const logsTab = $('[data-tab="logs"]');
    if (logsTab) {
        logsTab.addEventListener('click', () => {
            initLogsSSE();
        });
    }
    
    // Configurar manejadores de eventos
    if (userForm) userForm.addEventListener('submit', saveUser);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);
});