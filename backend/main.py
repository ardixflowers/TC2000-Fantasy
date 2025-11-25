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
from bson import ObjectId

# -------------------
# Configuración
# -------------------
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app, resources={r"/*": {"origins": "*"}})

app.config["MONGO_URI"] = os.getenv("MONGO_URI", "mongodb://localhost:27017/tc2000_fantasy")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "supersecretkey")

mongo = PyMongo(app)
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
        "created_at": datetime.utcnow()
    })


def send_sse(message: dict):
    sse_queue.put(message)

# -------------------
# Index
# -------------------
@app.route("/")
def index():
    return send_from_directory('.', 'index.html')

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
        "created_at": datetime.utcnow(),
        "last_login": None,
        "api_key_enc": None
    }).inserted_id

    audit_log("user_register", "users", str(user_id))

    return jsonify({"message": "user created", "user_id": str(user_id)}), 201


@app.route("/login", methods=["POST"])
def login():
    data = request.json or {}
    user = mongo.db.users.find_one({"username": data.get("username")})

    if not user or not check_password(data.get("password", ""), user.get("password_hash", b"")):
        audit_log("login_fail", "users", None, {"username": data.get("username")}, result="fail")
        return jsonify({"error": "invalid credentials"}), 401

    token = create_jwt(user["_id"], user["role"])
    mongo.db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login": datetime.utcnow()}})

    audit_log("login_success", "users", str(user["_id"]))

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
        "created_at": datetime.utcnow()
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
        "created_at": datetime.utcnow()
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
        while True:
            msg = sse_queue.get()
            yield f"data: {json.dumps(msg)}\n\n"

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