# 🟣 PicoChat
**Application de messagerie simple & moderne**
Développé par **Natural_bots** — © Natural Bots Studio™ — Tous droits réservés

---

## 📁 Structure du projet

```
picochat/
├── backend/
│   ├── app.py              ← Serveur Python (Flask + SocketIO)
│   └── requirements.txt    ← Dépendances Python
├── frontend/
│   ├── index.html          ← Interface principale
│   ├── css/style.css       ← Styles
│   └── js/
│       ├── config.js       ← URL du serveur (à modifier en prod)
│       └── app.js          ← Logique frontend
├── data/                   ← Créé automatiquement au lancement
│   ├── users.json          ← Comptes utilisateurs
│   ├── messages.json       ← Messages
│   ├── friends.json        ← Relations d'amitié
│   └── avatars/            ← Photos de profil
├── render.yaml             ← Config déploiement Render
├── Procfile                ← Commande de démarrage
└── README.md
```

---

## 🚀 Déploiement sur Render (GRATUIT)

> Render héberge ton serveur Python gratuitement avec un disque persistant.

### Étape 1 — Prépare le code sur GitHub
1. Crée un compte sur https://github.com
2. Crée un nouveau repository (ex: `picochat`)
3. Mets le **contenu du dossier picochat** à la racine du repo
4. Upload tous les fichiers sur GitHub

### Étape 2 — Déploie sur Render
1. Va sur https://render.com et crée un compte gratuit
2. Clique **"New +"** → **"Web Service"**
3. Connecte ton repo GitHub `picochat`
4. Configure :
   - **Name** : `picochat`
   - **Runtime** : `Python 3`
   - **Build Command** : `pip install -r backend/requirements.txt`
   - **Start Command** : `gunicorn --worker-class eventlet -w 1 backend.app:app`
5. Dans **"Advanced"** → ajoute un **Disk** :
   - Mount Path : `/data`
   - Size : 1 GB (gratuit)
6. Clique **"Create Web Service"**
7. Attends ~2 minutes → Render te donne une URL : `https://picochat-xxxx.onrender.com`

### Étape 3 — Met à jour l'URL dans le frontend
Dans `frontend/js/config.js`, remplace :
```js
API_URL: window.location.origin,
```
par :
```js
API_URL: "https://picochat-xxxx.onrender.com",
SOCKET_URL: "https://picochat-xxxx.onrender.com"
```
Puis re-push sur GitHub → Render redéploie automatiquement.

---

## 💻 Lancement en local (pour tester)

### Prérequis
- Python 3.10+ installé : https://python.org/downloads

### Installation
```bash
# Dans le dossier picochat/
pip install -r backend/requirements.txt
```

### Lancement
```bash
python backend/app.py
```
Ouvre ensuite `http://localhost:5000` dans ton navigateur.

---

## ✨ Fonctionnalités actuelles

- ✅ Création de compte (email + mot de passe)
- ✅ Connexion / Déconnexion
- ✅ Page de setup du profil (pseudo public + photo de profil)
- ✅ Messagerie en temps réel (WebSocket)
- ✅ Liste des conversations avec dernier message
- ✅ Recherche de conversations
- ✅ Recherche d'utilisateurs par pseudo/email
- ✅ Ajout d'amis
- ✅ Panneau de profil (photo, pseudo, date d'inscription, nb amis)
- ✅ Interface sombre style Discord

---

## 🔜 Améliorations possibles (futures versions)

- Groupes de discussion / serveurs
- Réactions aux messages (emojis)
- Envoi de fichiers / images
- Notifications desktop
- Statut personnalisé
- Connexion Google (OAuth2)
- Application Electron (.exe Windows)

---

## ⚠️ Notes importantes

- Sur le plan gratuit de Render, le serveur **se met en veille** après 15 min d'inactivité.
  Le premier chargement peut prendre ~30 secondes.
- Pour un usage permanent, passe sur le plan payant ($7/mois) ou utilise **Railway**.
- Les mots de passe sont **hashés en SHA-256** avant stockage.

---

© 2024 Natural Bots Studio™ — Développé par Natural_bots
