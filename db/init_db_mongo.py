# init_db_mongo.py|
# Inicialización de MongoDB para TC2000 Fantasy
# Requisitos: pip install pymongo dnspython

from pymongo import MongoClient, ASCENDING, TEXT
from datetime import datetime
from bson import ObjectId

# ---------- CONFIG ----------
MONGO_URI = "mongodb://localhost:27017/"
DB_NAME = "tc2000_fantasy"

# ---------- CONEXIÓN ----------
client = MongoClient(MONGO_URI)
db = client[DB_NAME]

# ---------- DROP PREVIO (opcional) ----------
db.drop_collection("users")
db.drop_collection("roles")
db.drop_collection("teams")
db.drop_collection("pilots")
db.drop_collection("circuits")
db.drop_collection("events")
db.drop_collection("event_results")
db.drop_collection("fantasy_teams")
db.drop_collection("team_roster")
db.drop_collection("derived_stats")
db.drop_collection("audit_log")

# ---------- ROLES ----------
roles = ["admin", "user", "visitor"]
db.roles.insert_many([{"name": r} for r in roles])

# ---------- USERS ----------
admin_role = db.roles.find_one({"name": "admin"})
db.users.insert_one({
    "username": "admin",
    "email": "admin@tc2000.local",
    "password_hash": "<bcrypt_placeholder>",
    "role": "admin",
    "api_key_enc": None,
    "created_at": datetime.utcnow(),
    "last_login": None
})

# ---------- TEAMS ----------
equipos = [
    {"name": "Toyota Gazoo Racing YPF Infinia", "base_country": "Argentina", "created_at": datetime.utcnow()},
    {"name": "Honda Racing Team", "base_country": "Argentina", "created_at": datetime.utcnow()},
    {"name": "YPF Elaion AURO Pro Racing", "base_country": "Argentina", "created_at": datetime.utcnow()},
    {"name": "Axion Energy Sport", "base_country": "Argentina", "created_at": datetime.utcnow()},
    {"name": "Fiat", "base_country": "Argentina", "created_at": datetime.utcnow()},
    {"name": "Chevrolet", "base_country": "Argentina", "created_at": datetime.utcnow()}
]
team_ids = db.teams.insert_many(equipos).inserted_ids

# ---------- PILOTS ----------

pilotos = [
    {"name": "Matías Rossi", "team_id": team_ids[0], "car_number": 163, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Emiliano Stang", "team_id": team_ids[0], "car_number": 137, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Franco Vivian", "team_id": team_ids[2], "car_number": 132, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Leonel Pernía", "team_id": team_ids[1], "car_number": 106, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Franco Morillo", "team_id": team_ids[1], "car_number": 84, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Facundo Aldrighetti", "team_id": team_ids[2], "car_number": 68, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Ulises Campillay", "team_id": team_ids[2], "car_number": 72, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Gabriel P. de León", "team_id": team_ids[0], "car_number": 74, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Marcelo Ciarrocchi", "team_id": team_ids[0], "car_number": 76, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Tiago Pernía", "team_id": team_ids[1], "car_number": 46, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Matías Capurro", "team_id": team_ids[3], "car_number": 38, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Nicolás Palau", "team_id": team_ids[4], "car_number": 26, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Mateo Polakovich", "team_id": team_ids[4], "car_number": 30, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}},
    {"name": "Figgo Bessone", "team_id": team_ids[5], "car_number": 22, "current_score": 0, "created_at": datetime.utcnow(), "stats": {"podiums": 0, "wins": 0, "DNF": 0}}
]
pilot_ids = db.pilots.insert_many(pilotos).inserted_ids

# ---------- CIRCUITS ----------
circuits = [
    {"name": "Autódromo Oscar Cabalén", "location": "Córdoba, Argentina", "length_km": 3.2,
     "laps": 20, "created_at": datetime.utcnow()},
    {"name": "Autódromo Termas de Río Hondo", "location": "Santiago del Estero, Argentina",
     "length_km": 4.8, "laps": 25, "created_at": datetime.utcnow()}
]
circuit_ids = db.circuits.insert_many(circuits).inserted_ids

# ---------- EVENTS ----------
events = [
    {"name": "Ronda Córdoba", "circuit_id": circuit_ids[0], "start_at": datetime(2025,11,10,14,0),
     "status": "scheduled", "results_published": False},
    {"name": "Ronda Termas", "circuit_id": circuit_ids[1], "start_at": datetime(2025,11,24,14,0),
     "status": "scheduled", "results_published": False}
]
event_ids = db.events.insert_many(events).inserted_ids

# ---------- DERIVED STATS ----------
db.derived_stats.insert_one({"key": "ranking", "json_value": [], "updated_at": datetime.utcnow()})

# ---------- ÍNDICES ----------
db.users.create_index([("username", ASCENDING)], unique=True)
db.users.create_index([("email", ASCENDING)], unique=True)
db.pilots.create_index([("team_id", ASCENDING)])
db.pilots.create_index([("car_number", ASCENDING)], unique=True)
db.teams.create_index([("name", ASCENDING)], unique=True)
db.circuits.create_index([("name", ASCENDING)], unique=True)
db.events.create_index([("start_at", ASCENDING)])
db.audit_log.create_index([("who_user_id", ASCENDING)])
db.audit_log.create_index([("action", ASCENDING)])
db.audit_log.create_index([("created_at", ASCENDING)])

print(f"✅ MongoDB inicializada correctamente en la DB '{DB_NAME}'")
print(f"Pilotos insertados: {len(pilot_ids)}")
print(f"Equipos insertados: {len(team_ids)}")
print(f"Circuitos insertados: {len(circuit_ids)}")
print(f"Eventos insertados: {len(event_ids)}")
