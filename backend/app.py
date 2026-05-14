import eventlet
eventlet.monkey_patch()

from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import json, os, hashlib, uuid, base64
from datetime import datetime

app = Flask(__name__, static_folder="../frontend", static_url_path="")
app.config["SECRET_KEY"] = "picochat-secret-key-change-this"
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*")

DATA_DIR = "/data"
USERS_FILE = os.path.join(DATA_DIR, "users.json")
MESSAGES_FILE = os.path.join(DATA_DIR, "messages.json")
AVATARS_DIR = os.path.join(DATA_DIR, "avatars")
FRIENDS_FILE = os.path.join(DATA_DIR, "friends.json")

os.makedirs(AVATARS_DIR, exist_ok=True)

def load_json(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def hash_password(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def get_conv_id(uid1, uid2):
    return "_".join(sorted([uid1, uid2]))

# ─── AUTH ───────────────────────────────────────────────────────────────────

@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    display_name = data.get("display_name", "").strip()

    if not email or not password or not display_name:
        return jsonify({"error": "Champs manquants"}), 400

    users = load_json(USERS_FILE, {})
    for u in users.values():
        if u["email"] == email:
            return jsonify({"error": "Email déjà utilisé"}), 409

    uid = str(uuid.uuid4())
    users[uid] = {
        "id": uid,
        "email": email,
        "password": hash_password(password),
        "display_name": display_name,
        "avatar": None,
        "created_at": datetime.now().isoformat(),
        "setup_done": False
    }
    save_json(USERS_FILE, users)
    return jsonify({"success": True, "user": {
        "id": uid, "email": email,
        "display_name": display_name,
        "avatar": None, "setup_done": False,
        "created_at": users[uid]["created_at"]
    }})

@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    users = load_json(USERS_FILE, {})
    for uid, u in users.items():
        if u["email"] == email and u["password"] == hash_password(password):
            friends = load_json(FRIENDS_FILE, {})
            friend_ids = friends.get(uid, [])
            friend_count = len(friend_ids)
            return jsonify({"success": True, "user": {
                "id": uid, "email": u["email"],
                "display_name": u["display_name"],
                "avatar": u.get("avatar"),
                "setup_done": u.get("setup_done", False),
                "created_at": u.get("created_at", ""),
                "friend_count": friend_count
            }})
    return jsonify({"error": "Email ou mot de passe incorrect"}), 401

@app.route("/api/setup", methods=["POST"])
def setup_profile():
    data = request.json
    uid = data.get("user_id")
    display_name = data.get("display_name", "").strip()
    avatar_data = data.get("avatar")

    users = load_json(USERS_FILE, {})
    if uid not in users:
        return jsonify({"error": "Utilisateur introuvable"}), 404

    users[uid]["display_name"] = display_name
    users[uid]["setup_done"] = True

    if avatar_data:
        header, encoded = avatar_data.split(",", 1)
        ext = "png" if "png" in header else "jpg"
        fname = f"{uid}.{ext}"
        fpath = os.path.join(AVATARS_DIR, fname)
        with open(fpath, "wb") as f:
            f.write(base64.b64decode(encoded))
        users[uid]["avatar"] = f"/data/avatars/{fname}"

    save_json(USERS_FILE, users)
    return jsonify({"success": True, "user": users[uid]})

# ─── USERS ──────────────────────────────────────────────────────────────────

@app.route("/api/users/search", methods=["GET"])
def search_users():
    q = request.args.get("q", "").strip().lower()
    me = request.args.get("me", "")
    if not q:
        return jsonify([])
    users = load_json(USERS_FILE, {})
    results = []
    for uid, u in users.items():
        if uid == me:
            continue
        if q in u["display_name"].lower() or q in u["email"].lower():
            results.append({
                "id": uid,
                "display_name": u["display_name"],
                "avatar": u.get("avatar"),
                "created_at": u.get("created_at", "")
            })
    return jsonify(results[:10])

@app.route("/api/users/<uid>", methods=["GET"])
def get_user(uid):
    users = load_json(USERS_FILE, {})
    u = users.get(uid)
    if not u:
        return jsonify({"error": "Introuvable"}), 404
    friends = load_json(FRIENDS_FILE, {})
    return jsonify({
        "id": uid,
        "display_name": u["display_name"],
        "avatar": u.get("avatar"),
        "created_at": u.get("created_at", ""),
        "friend_count": len(friends.get(uid, []))
    })

# ─── FRIENDS ────────────────────────────────────────────────────────────────

@app.route("/api/friends/<uid>", methods=["GET"])
def get_friends(uid):
    friends = load_json(FRIENDS_FILE, {})
    users = load_json(USERS_FILE, {})
    friend_ids = friends.get(uid, [])
    result = []
    for fid in friend_ids:
        u = users.get(fid)
        if u:
            result.append({"id": fid, "display_name": u["display_name"], "avatar": u.get("avatar")})
    return jsonify(result)

@app.route("/api/friends/add", methods=["POST"])
def add_friend():
    data = request.json
    uid = data.get("user_id")
    fid = data.get("friend_id")
    if not uid or not fid or uid == fid:
        return jsonify({"error": "Invalide"}), 400
    friends = load_json(FRIENDS_FILE, {})
    if uid not in friends:
        friends[uid] = []
    if fid not in friends:
        friends[fid] = []
    if fid not in friends[uid]:
        friends[uid].append(fid)
    if uid not in friends[fid]:
        friends[fid].append(uid)
    save_json(FRIENDS_FILE, friends)
    return jsonify({"success": True})

# ─── MESSAGES ───────────────────────────────────────────────────────────────

@app.route("/api/messages/<conv_id>", methods=["GET"])
def get_messages(conv_id):
    messages = load_json(MESSAGES_FILE, {})
    return jsonify(messages.get(conv_id, []))

@app.route("/api/conversations/<uid>", methods=["GET"])
def get_conversations(uid):
    messages = load_json(MESSAGES_FILE, {})
    users = load_json(USERS_FILE, {})
    convs = []
    for conv_id, msgs in messages.items():
        parts = conv_id.split("_")
        if uid in parts and len(msgs) > 0:
            other_id = parts[0] if parts[1] == uid else parts[1]
            other = users.get(other_id, {})
            last = msgs[-1]
            convs.append({
                "conv_id": conv_id,
                "other_id": other_id,
                "other_name": other.get("display_name", "Inconnu"),
                "other_avatar": other.get("avatar"),
                "last_message": last.get("text", ""),
                "last_time": last.get("timestamp", ""),
                "unread": sum(1 for m in msgs if m.get("sender_id") != uid and not m.get("read", False))
            })
    convs.sort(key=lambda x: x["last_time"], reverse=True)
    return jsonify(convs)

# ─── STATIC FILES ────────────────────────────────────────────────────────────

@app.route("/data/avatars/<filename>")
def serve_avatar(filename):
    return send_from_directory(AVATARS_DIR, filename)

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

# ─── SOCKETIO ────────────────────────────────────────────────────────────────

@socketio.on("join")
def on_join(data):
    uid = data.get("user_id")
    join_room(uid)

@socketio.on("send_message")
def on_message(data):
    sender_id = data.get("sender_id")
    receiver_id = data.get("receiver_id")
    text = data.get("text", "").strip()
    if not text or not sender_id or not receiver_id:
        return

    conv_id = get_conv_id(sender_id, receiver_id)
    messages = load_json(MESSAGES_FILE, {})
    if conv_id not in messages:
        messages[conv_id] = []

    msg = {
        "id": str(uuid.uuid4()),
        "sender_id": sender_id,
        "text": text,
        "timestamp": datetime.now().isoformat(),
        "read": False
    }
    messages[conv_id].append(msg)
    save_json(MESSAGES_FILE, messages)

    emit("new_message", {"conv_id": conv_id, "message": msg}, room=receiver_id)
    emit("new_message", {"conv_id": conv_id, "message": msg}, room=sender_id)

if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    save_json(USERS_FILE, load_json(USERS_FILE, {}))
    save_json(MESSAGES_FILE, load_json(MESSAGES_FILE, {}))
    save_json(FRIENDS_FILE, load_json(FRIENDS_FILE, {}))
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, debug=False)
