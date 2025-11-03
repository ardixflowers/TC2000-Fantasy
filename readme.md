# 1️⃣ Iniciar MongoDB
mongod

# 2️⃣ Inicializar la base
cd tc2000/db
python init_db_mongo.py
python set_admin_password.py

# 3️⃣ Iniciar el backend Flask
cd ../backend
pip install -r requirements.txt   # si existe
# o instalar manualmente:
# pip install flask flask-pymongo flask-cors flask-socketio bcrypt pyjwt
python main.py

# 4️⃣ Abrir el frontend
# Abrí el archivo tc2000/frontend/index.html en tu navegador
# (preferentemente con un servidor local, por ejemplo con Live Server de VSCode)

⚠️ Si abrís el index.html directamente con file://, las conexiones WebSocket o SSE no funcionarán.
Usá un servidor local (VSCode Live Server, o python -m http.server dentro de /frontend).

---------------------------------------------------------------------------------------


