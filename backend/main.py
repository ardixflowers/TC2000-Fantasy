# main.py (sin eventlet; SocketIO en modo "threading")
import os
import json
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, Response, stream_with_context, send_from_directory
from flask_pymongo import PyMongo
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import bcrypt
import jwt
from functools import wraps
import queue

# -------------------
# Configuración
# -------------------
# El static_folder='..' no es necesario si sirves index.html desde otro sitio;
# aquí asumimos que index.html está servido desde backend root (opcional).
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={r"/*": {"origins": "*"}})
app.config["MONGO_URI"] = os.getenv("MONGO_URI", "mongodb://localhost:27017/tc2000_fantasy")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "supersecretkey")
mongo = PyMongo(app)

# Usar threading (no eventlet)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Cola para SSE
sse_queue = queue.Queue()

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
        "exp": datetime.utcnow() + timedelta(hours=8)
    }
    return jwt.encode(payload, app.config["SECRET_KEY"], algorithm="HS256")

def auth_required(role=None):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            token = request.headers.get("Authorization", None)
            if not token or not token.startswith("Bearer "):
                return jsonify({"error": "Missing token"}), 401
            try:
                decoded = jwt.decode(token.split()[1], app.config["SECRET_KEY"], algorithms=["HS256"])
                request.user_id = decoded["user_id"]
                request.user_role = decoded["role"]
                if role and decoded["role"] != role:
                    return jsonify({"error": "Insufficient role"}), 403
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
        "created_at": datetime.utcnow()
    })

def send_sse(message: dict):
    # aseguramos enviar un objeto JSON serializable
    sse_queue.put(message)

# -------------------
# Serve index.html (and other static files) from same origin
# -------------------
@app.route("/")
def index():
    return send_from_directory('.', 'index.html')

# -------------------
# Auth Endpoints
# -------------------
@app.route("/register", methods=["POST"])
def register():
    data = request.json or {}
    if not data.get("username") or not data.get("password") or not data.get("role"):
        return jsonify({"error": "Missing fields"}), 400
    if mongo.db.users.find_one({"username": data["username"]}):
        return jsonify({"error": "Username exists"}), 400
    hashed = hash_password(data["password"])
    user_id = mongo.db.users.insert_one({
        "username": data["username"],
        "email": data.get("email"),
        "password_hash": hashed,
        "role": data["role"],
        "created_at": datetime.utcnow(),
        "last_login": None,
        "api_key_enc": None
    }).inserted_id
    audit_log("USER_REGISTER", "users", str(user_id))
    return jsonify({"message": "User created", "user_id": str(user_id)}), 201

@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    user = mongo.db.users.find_one({"username": data.get("username")})
    if not user or not check_password(data.get("password", ""), user.get("password_hash", b"")):
        audit_log("LOGIN_FAIL", "users", None, {"username": data.get("username")}, result="FAIL")
        return jsonify({"error": "Invalid credentials"}), 401
    token = create_jwt(user["_id"], user["role"])
    mongo.db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": datetime.utcnow()}})
    audit_log("LOGIN_SUCCESS", "users", str(user["_id"]))
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
        # si tiene team_id, reemplazar por nombre
        if "team_id" in p and p["team_id"]:
            p["team"] = teams.get(str(p["team_id"]), "Sin equipo")
        else:
            p["team"] = p.get("team", "Sin equipo")
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
        "created_at": datetime.utcnow()
    }).inserted_id
    audit_log("PILOT_CREATE", "pilots", str(pilot_id), details=data)
    msg = {"type": "pilot_created", "pilot_id": str(pilot_id), "name": data.get("name")}
    send_sse(msg)
    socketio.emit("pilot_created", msg, broadcast=True)
    return jsonify({"pilot_id": str(pilot_id)}), 201

# -------------------
# Teams CRUD
# -------------------
@app.route("/teams", methods=["GET"])
def list_teams():
    teams = list(mongo.db.teams.find())
    for t in teams:
        t["_id"] = str(t["_id"])
    return jsonify(teams)


# -------------------
# SSE endpoint (envía JSON)
# -------------------
@app.route("/sse")
def sse_stream():
    def event_stream():
        while True:
            msg = sse_queue.get()
            yield f"data: {json.dumps(msg)}\n\n"
    return Response(stream_with_context(event_stream()), mimetype="text/event-stream")

# -------------------
# WebSocket example
# -------------------
@socketio.on("connect")
def ws_connect():
    emit("message", {"msg": "Connected to TC2000 Fantasy WS"})

# -------------------
# Main
# -------------------
if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
