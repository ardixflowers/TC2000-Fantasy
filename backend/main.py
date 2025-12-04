import os
import json
import logging
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, Response, stream_with_context, send_from_directory
from flask_pymongo import PyMongo
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import bcrypt
import jwt
from functools import wraps
import queue
from bson import ObjectId
import logging
logging.basicConfig(level=logging.INFO)



# -------------------
# Configuración
# -------------------
app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app, resources={r"/*": {"origins": "*"}})

app.config["MONGO_URI"] = os.getenv("MONGO_URI", "mongodb://localhost:27017/tc2000_fantasy")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "supersecretkey")

mongo = PyMongo(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Cola para SSE
sse_queue = queue.Queue(maxsize=100)

# Handler personalizado para capturar logs del servidor
class SSELogHandler(logging.Handler):
    def emit(self, record):
        try:
            log_message = record.getMessage()
            msg = {
                "type": "server",
                "message": log_message,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            try:
                # No bloquear JAMÁS
                sse_queue.put_nowait(msg)
            except queue.Full:
                # Si la cola está llena, descartar el mensaje
                pass

        except Exception as e:
            print(f"Error en SSELogHandler: {e}")

# --------------------
# Logging Werkzeug → SSE
# --------------------
server_logger = logging.getLogger()
server_logger.setLevel(logging.INFO)

if not any(isinstance(h, SSELogHandler) for h in server_logger.handlers):
    server_logger.addHandler(SSELogHandler())


# -------------------
# Utils
# -------------------
def hash_password(password: str) -> bytes:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())


def check_password(password: str, hashed: bytes) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed)


def create_jwt(user_id: str, role: str):
    payload = {
        "user_id": str(user_id),
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8)
    }
    return jwt.encode(payload, app.config["SECRET_KEY"], algorithm="HS256")


def auth_required(role=None):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            token = request.headers.get("Authorization", None)
            if not token or not token.startswith("Bearer "):
                return jsonify({"error": "missing token"}), 401

            try:
                decoded = jwt.decode(token.split()[1], app.config["SECRET_KEY"], algorithms=["HS256"])
                request.user_id = decoded["user_id"]
                request.user_role = decoded["role"]

                if role and decoded["role"] != role:
                    return jsonify({"error": "insufficient role"}), 403

            except Exception as e:
                return jsonify({"error": str(e)}), 401

            return f(*args, **kwargs)

        return wrapper

    return decorator


def audit_log(action, resource_type=None, resource_id=None, details=None, result="SUCCESS"):
    mongo.db.audit_log.insert_one({
        "who_user_id": getattr(request, "user_id", None),
        "who_ip": request.remote_addr,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details,
        "result": result,
        "created_at": datetime.now(timezone.utc)
    })


def send_sse(message: dict):
    """Envía un mensaje SSE con tipo, mensaje y timestamp"""
    if "timestamp" not in message:
        message["timestamp"] = datetime.now(timezone.utc).isoformat()
    if "type" not in message:
        message["type"] = "info"
    sse_queue.put(message)


def log_action(action_type="info", message="", resource_type=None, resource_id=None, details=None, result="SUCCESS"):
    """Registra una acción y la envía por SSE"""
    log_entry = {
        "type": action_type,
        "message": message,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details,
        "result": result,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    # Enviar por SSE
    send_sse(log_entry)
    
    # También guardar en base de datos
    audit_log(message or action_type, resource_type, resource_id, details, result)



def serialize_user(user):
    """Serializa un usuario para JSON, convirtiendo ObjectId y datetime"""
    if not user:
        return None
    user["_id"] = str(user["_id"])
    # Convertir datetime a ISO 8601
    if user.get("last_login") and hasattr(user["last_login"], "isoformat"):
        user["last_login"] = user["last_login"].isoformat()
    if user.get("created_at") and hasattr(user["created_at"], "isoformat"):
        user["created_at"] = user["created_at"].isoformat()
    # No devolver hash de contraseña
    user.pop("password_hash", None)
    user.pop("api_key_enc", None)
    return user

# -------------------
# Index
# -------------------
@app.route("/")
def index():
    return send_from_directory(app.static_folder, 'index.html')

# -------------------
# Auth
# -------------------
@app.route("/register", methods=["POST"])
def register():
    data = request.json or {}
    if not data.get("username") or not data.get("password") or not data.get("role"):
        return jsonify({"error": "missing fields"}), 400

    if mongo.db.users.find_one({"username": data["username"]}):
        return jsonify({"error": "username exists"}), 400

    hashed = hash_password(data["password"])

    user_id = mongo.db.users.insert_one({
        "username": data["username"],
        "email": data.get("email"),
        "password_hash": hashed,
        "role": data["role"],
        "created_at": datetime.now(timezone.utc),
        "last_login": None,
        "api_key_enc": None
    }).inserted_id

    log_action("success", f"Nuevo usuario registrado: '{data['username']}'", "auth", str(user_id))

    return jsonify({"message": "user created", "user_id": str(user_id)}), 201


@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    user = mongo.db.users.find_one({"username": data.get("username")})

    if not user or not check_password(data.get("password", ""), user.get("password_hash", b"")):
        log_action("error", f"Intento de login fallido para '{data.get('username')}'", "auth", None)
        return jsonify({"error": "invalid credentials"}), 401

    token = create_jwt(user["_id"], user["role"])
    mongo.db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": datetime.now(timezone.utc)}})

    log_action("success", f"Login exitoso: '{user['username']}' ({user['role']})", "auth", str(user["_id"]))

    return jsonify({"token": token})


# -------------------
# Pilots CRUD
# -------------------
@app.route("/pilots", methods=["GET"])
def list_pilots():
    pilots = list(mongo.db.pilots.find())
    teams = {str(t["_id"]): t["name"] for t in mongo.db.teams.find()}

    for p in pilots:
        p["_id"] = str(p["_id"])
        if "team_id" in p and p["team_id"]:
            p["team"] = teams.get(str(p["team_id"]), "sin equipo")
        else:
            p["team"] = p.get("team", "sin equipo")

    return jsonify(pilots)


@app.route("/pilots", methods=["POST"])
@auth_required(role="admin")
def create_pilot():
    data = request.json or {}

    pilot_id = mongo.db.pilots.insert_one({
        "name": data.get("name"),
        "team": data.get("team"),
        "car_number": data.get("car_number"),
        "current_score": 0,
        "created_at": datetime.now(timezone.utc)
    }).inserted_id

    audit_log("pilot_create", "pilots", str(pilot_id), details=data)

    msg = {"type": "pilot_created", "pilot_id": str(pilot_id), "name": data.get("name")}
    send_sse(msg)
    socketio.emit("pilot_created", msg)

    return jsonify({"pilot_id": str(pilot_id)}), 201


@app.route("/pilots/<pilot_id>", methods=["DELETE"])
@auth_required(role="admin")
def delete_pilot(pilot_id):
    try:
        oid = ObjectId(pilot_id)
    except:
        return jsonify({"error": "invalid pilot id"}), 400

    result = mongo.db.pilots.delete_one({"_id": oid})

    if result.deleted_count == 0:
        return jsonify({"error": "pilot not found"}), 404

    audit_log("pilot_delete", "pilots", pilot_id)

    msg = {"type": "pilot_deleted", "pilot_id": pilot_id}
    send_sse(msg)
    socketio.emit("pilot_deleted", msg)

    return jsonify({"ok": True})


# -------------------
# Teams CRUD
# -------------------
@app.route("/teams", methods=["GET"])
def list_teams():
    teams = list(mongo.db.teams.find())
    for t in teams:
        t["_id"] = str(t["_id"])
    return jsonify(teams)


@app.route("/teams", methods=["POST"])
@auth_required(role="admin")
def create_team():
    data = request.json or {}

    team = {
        "name": data.get("name"),
        "base_country": data.get("base_country"),
        "logo_png": data.get("logo_png"),
        "created_at": datetime.now(timezone.utc)
    }

    team_id = mongo.db.teams.insert_one(team).inserted_id

    audit_log("team_create", "teams", str(team_id), details=data)

    msg = {"type": "team_created", "team_id": str(team_id), "name": team["name"]}
    send_sse(msg)
    socketio.emit("team_created", msg)

    return jsonify({"team_id": str(team_id)}), 201


@app.route("/teams/<team_id>", methods=["DELETE"])
@auth_required(role="admin")
def delete_team(team_id):
    try:
        oid = ObjectId(team_id)
    except:
        return jsonify({"error": "invalid team id"}), 400

    result = mongo.db.teams.delete_one({"_id": oid})

    if result.deleted_count == 0:
        return jsonify({"error": "team not found"}), 404

    mongo.db.pilots.update_many({"team_id": oid}, {"$set": {"team_id": None}})

    audit_log("team_delete", "teams", team_id)

    msg = {"type": "team_deleted", "team_id": team_id}
    send_sse(msg)
    socketio.emit("team_deleted", msg)

    return jsonify({"ok": True})


# -------------------
# SSE
# -------------------
@app.route("/sse")
def sse_stream():
    def event_stream():
        try:
            # Enviar mensaje inicial de conexión
            yield f"data: {json.dumps({'type': 'info', 'message': 'Conectado a logs', 'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
            
            while True:
                try:
                    # Usar timeout para no bloquear indefinidamente
                    msg = sse_queue.get(timeout=30)
                    yield f"data: {json.dumps(msg)}\n\n"
                except queue.Empty:
                    # Si no hay mensajes en 30 segundos, enviar heartbeat
                    yield f"data: {json.dumps({'type': 'heartbeat', 'message': 'latido', 'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
        except GeneratorExit:
            # Manejo correcto de cuando el cliente desconecta
            pass
        except Exception as e:
            print(f"Error en SSE: {e}")
            pass

    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")


@app.route("/me")
@auth_required()
def me():
    try:
        user = mongo.db.users.find_one({"_id": ObjectId(request.user_id)})
        if not user:
            return jsonify({"error": "user not found"}), 404

        return jsonify({
            "username": user["username"],
            "role": user["role"]
        })

    except Exception as e:
        print("error en /me:", e)
        return jsonify({"error": str(e)}), 500


# -------------------
# Admin Users CRUD
# -------------------
@app.route("/admin/users", methods=["GET"])
@auth_required(role="admin")
def list_users():
    """Lista todos los usuarios"""
    users = list(mongo.db.users.find())
    return jsonify([serialize_user(u) for u in users])


@app.route("/admin/users", methods=["POST"])
@auth_required(role="admin")
def create_user():
    """Crear un nuevo usuario"""
    data = request.json or {}
    
    if not data.get("username") or not data.get("email") or not data.get("password"):
        return jsonify({"error": "missing required fields"}), 400
    
    if mongo.db.users.find_one({"username": data["username"]}):
        return jsonify({"error": "username already exists"}), 400
    
    if mongo.db.users.find_one({"email": data["email"]}):
        return jsonify({"error": "email already exists"}), 400
    
    hashed = hash_password(data["password"])
    
    user_id = mongo.db.users.insert_one({
        "username": data["username"],
        "email": data["email"],
        "password_hash": hashed,
        "role": data.get("role", "user"),
        "is_active": data.get("is_active", True),
        "created_at": datetime.now(timezone.utc),
        "last_login": None,
        "api_key_enc": None
    }).inserted_id
    
    log_action("success", f"Usuario '{data['username']}' creado", "users", str(user_id), {"email": data["email"], "role": data.get("role", "user")})
    
    return jsonify({"user_id": str(user_id), "message": "user created"}), 201


@app.route("/admin/users/<user_id>", methods=["GET"])
@auth_required(role="admin")
def get_user(user_id):
    """Obtener datos de un usuario específico"""
    try:
        oid = ObjectId(user_id)
    except:
        return jsonify({"error": "invalid user id"}), 400
    
    user = mongo.db.users.find_one({"_id": oid})
    
    if not user:
        return jsonify({"error": "user not found"}), 404
    
    return jsonify(serialize_user(user))


@app.route("/admin/users/<user_id>", methods=["PUT"])
@auth_required(role="admin")
def update_user(user_id):
    """Actualizar datos de un usuario"""
    try:
        oid = ObjectId(user_id)
    except:
        return jsonify({"error": "invalid user id"}), 400
    
    user = mongo.db.users.find_one({"_id": oid})
    
    if not user:
        return jsonify({"error": "user not found"}), 404
    
    data = request.json or {}
    
    # Validar si el email ya existe en otro usuario
    if "email" in data and data["email"] != user.get("email"):
        if mongo.db.users.find_one({"email": data["email"]}):
            return jsonify({"error": "email already exists"}), 400
    
    update_data = {}
    
    if "username" in data:
        update_data["username"] = data["username"]
    if "email" in data:
        update_data["email"] = data["email"]
    if "role" in data:
        update_data["role"] = data["role"]
    if "is_active" in data:
        update_data["is_active"] = data["is_active"]
    if "password" in data and data["password"]:
        if len(data["password"]) < 6:
            return jsonify({"error": "password must be at least 6 characters"}), 400
        update_data["password_hash"] = hash_password(data["password"])
    
    mongo.db.users.update_one({"_id": oid}, {"$set": update_data})
    
    log_action("info", f"Usuario '{user['username']}' actualizado", "users", user_id, update_data)
    
    return jsonify({"message": "user updated"})


@app.route("/admin/users/<user_id>", methods=["DELETE"])
@auth_required(role="admin")
def delete_user(user_id):
    """Eliminar un usuario"""
    try:
        oid = ObjectId(user_id)
    except:
        return jsonify({"error": "invalid user id"}), 400
    
    # No permitir eliminar al admin actual
    if str(oid) == request.user_id:
        return jsonify({"error": "cannot delete your own account"}), 403
    
    user = mongo.db.users.find_one({"_id": oid})
    
    if not user:
        return jsonify({"error": "user not found"}), 404
    
    result = mongo.db.users.delete_one({"_id": oid})
    
    if result.deleted_count == 0:
        return jsonify({"error": "failed to delete user"}), 500
    
    log_action("warning", f"Usuario '{user['username']}' eliminado", "users", user_id, {"email": user.get("email")})
    
    return jsonify({"message": "user deleted"})


# -------------------
# WebSocket
# -------------------
@socketio.on("connect")
def ws_connect():
    emit("message", {"msg": "connected to tc2000 fantasy ws"})


# -------------------
# Main
# -------------------
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)