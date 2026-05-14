/* ════════════════════════════════════════════════════════
   PicoChat — app.js (CORRIGÉ)
   Natural Bots Studio™ — Tous droits réservés
   ════════════════════════════════════════════════════════ */

const API = CONFIG.API_URL;
let socket = null;
let currentUser = null;
let activeConvId = null;
let activePartnerId = null;
let convSearchTimeout = null;
let friendSearchTimeout = null;

// ── UTILS ─────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const s = $(`screen-${name}`);
  if (s) s.classList.add("active");
}

function showError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 5000);
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function getInitials(name) {
  return (name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function avatarColor(name) {
  const colors = ["#2e2060", "#0f3350", "#1a3020", "#3a1535", "#2a1a10", "#102a2a"];
  let hash = 0;
  for (const c of (name || "")) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

function setAvatar(el, avatarUrl, name) {
  if (!el) return;
  if (avatarUrl) {
    el.innerHTML = `<img src="${API}${avatarUrl}" alt="${name}" />`;
  } else {
    el.style.background = avatarColor(name);
    el.textContent = getInitials(name);
  }
}

function saveSession(user) {
  localStorage.setItem("picochat_user", JSON.stringify(user));
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem("picochat_user")); } catch { return null; }
}
function clearSession() { localStorage.removeItem("picochat_user"); }

// ── SOCKET ────────────────────────────────────────────────────────────────

function initSocket() {
  socket = io(CONFIG.SOCKET_URL, { transports: ["websocket", "polling"] });

  socket.on("connect", () => {
    if (currentUser) socket.emit("join", { user_id: currentUser.id });
  });

  socket.on("new_message", ({ conv_id, message }) => {
    loadConversations();
    if (conv_id === activeConvId) {
      appendMessage(message, message.sender_id === currentUser.id);
      scrollToBottom();
    }
  });
}

// ── AUTH ──────────────────────────────────────────────────────────────────

async function doLogin(email, password) {
  const res = await fetch(`${API}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur de connexion");
  return data.user;
}

async function doRegister(email, password) {
  const res = await fetch(`${API}/api/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: email.split("@")[0] })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur d'inscription");
  return data.user;
}

async function doSetup(userId, displayName, avatarData) {
  const res = await fetch(`${API}/api/setup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, display_name: displayName, avatar: avatarData })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur de configuration");
  return data.user;
}

// ── CONVERSATIONS ─────────────────────────────────────────────────────────

async function loadConversations() {
  const res = await fetch(`${API}/api/conversations/${currentUser.id}`);
  const convs = await res.json();
  renderConvList(convs);
}

function renderConvList(convs) {
  const list = $("conv-list");
  const q = $("conv-search").value.trim().toLowerCase();
  const filtered = q
    ? convs.filter(c => c.other_name.toLowerCase().includes(q) || c.last_message.toLowerCase().includes(q))
    : convs;

  if (!filtered.length) {
    list.innerHTML = `<div class="conv-empty">Aucune conversation<br><small>Cherche un ami pour commencer !</small></div>`;
    return;
  }
  list.innerHTML = filtered.map(c => `
    <div class="conv-item ${c.conv_id === activeConvId ? "active" : ""}"
         data-conv="${c.conv_id}" data-partner="${c.other_id}">
      <div class="avatar size-sm" id="cav-${c.other_id}"></div>
      <div class="conv-meta">
        <div class="conv-name">${escHtml(c.other_name)}</div>
        <div class="conv-last">${escHtml(c.last_message || "Démarrer la conversation")}</div>
      </div>
      ${c.unread > 0 ? `<div class="conv-badge">${c.unread}</div>` : ""}
    </div>
  `).join("");

  filtered.forEach(c => {
    setAvatar($(`cav-${c.other_id}`), c.other_avatar, c.other_name);
  });

  list.querySelectorAll(".conv-item").forEach(el => {
    el.addEventListener("click", () => openConversation(el.dataset.conv, el.dataset.partner));
  });
}

// ── OPEN CONVERSATION ─────────────────────────────────────────────────────

async function openConversation(convId, partnerId) {
  activeConvId = convId;
  activePartnerId = partnerId;

  $("chat-empty").classList.add("hidden");
  $("chat-view").classList.remove("hidden");

  const res = await fetch(`${API}/api/users/${partnerId}`);
  const partner = await res.json();

  setAvatar($("chat-partner-avatar"), partner.avatar, partner.display_name);
  $("chat-partner-name").textContent = partner.display_name;

  setAvatar($("rp-avatar"), partner.avatar, partner.display_name);
  $("rp-name").textContent = partner.display_name;
  $("rp-handle").textContent = "@" + partner.display_name.toLowerCase().replace(/\s+/g, "_");
  $("rp-friends").textContent = partner.friend_count ?? "—";
  $("rp-since").textContent = formatDate(partner.created_at);
  $("rp-profile").classList.remove("hidden");
  $("rp-placeholder").classList.add("hidden");

  checkFriendStatus(partnerId);

  const mres = await fetch(`${API}/api/messages/${convId}`);
  const msgs = await mres.json();

  const area = $("messages-area");
  area.innerHTML = "";

  if (!msgs.length) {
    area.innerHTML = `<div style="text-align:center;color:var(--text3);font-size:12px;padding:20px">C'est le début de votre conversation 👋</div>`;
  } else {
    msgs.forEach(m => appendMessage(m, m.sender_id === currentUser.id));
  }
  scrollToBottom();

  document.querySelectorAll(".conv-item").forEach(el => {
    el.classList.toggle("active", el.dataset.conv === convId);
  });

  $("msg-input").focus();
}

function appendMessage(msg, isMine) {
  const area = $("messages-area");

  const placeholder = area.querySelector("div[style]");
  if (placeholder && area.children.length === 1) area.innerHTML = "";

  const row = document.createElement("div");
  row.className = `msg-row ${isMine ? "mine" : ""}`;
  row.dataset.msgId = msg.id;

  const avatarEl = document.createElement("div");
  avatarEl.className = "avatar size-sm";
  if (isMine) {
    setAvatar(avatarEl, currentUser.avatar, currentUser.display_name);
  } else {
    const rpAv = $("rp-avatar");
    avatarEl.innerHTML = rpAv ? rpAv.innerHTML : getInitials(msg.sender_id);
    avatarEl.style.background = rpAv ? rpAv.style.background : "";
  }

  const bubble = document.createElement("div");
  bubble.className = `bubble ${isMine ? "mine" : "other"}`;
  bubble.textContent = msg.text;

  const meta = document.createElement("div");
  meta.className = `msg-meta ${isMine ? "right" : ""}`;
  meta.textContent = formatTime(msg.timestamp);

  const inner = document.createElement("div");
  inner.appendChild(bubble);
  inner.appendChild(meta);

  if (isMine) {
    row.appendChild(inner);
    row.appendChild(avatarEl);
  } else {
    row.appendChild(avatarEl);
    row.appendChild(inner);
  }
  area.appendChild(row);
}

function scrollToBottom() {
  const area = $("messages-area");
  if (area) area.scrollTop = area.scrollHeight;
}

// ── SEND MESSAGE ──────────────────────────────────────────────────────────

async function sendMessage() {
  const input = $("msg-input");
  const text = input.value.trim();
  if (!text || !activePartnerId) return;
  input.value = "";

  socket.emit("send_message", {
    sender_id: currentUser.id,
    receiver_id: activePartnerId,
    text
  });
}

// ── FRIEND SEARCH ─────────────────────────────────────────────────────────

async function searchFriends(q) {
  const res = await fetch(`${API}/api/users/search?q=${encodeURIComponent(q)}&me=${currentUser.id}`);
  return await res.json();
}

async function checkFriendStatus(partnerId) {
  const res = await fetch(`${API}/api/friends/${currentUser.id}`);
  const friends = await res.json();
  const isFriend = friends.some(f => f.id === partnerId);
  const btn = $("btn-add-friend");
  if (isFriend) {
    btn.classList.add("added");
    btn.innerHTML = `<i class="ti ti-user-check"></i> Déjà ami`;
  } else {
    btn.classList.remove("added");
    btn.innerHTML = `<i class="ti ti-user-plus"></i> Ajouter en ami`;
  }
}

async function addFriend(friendId) {
  await fetch(`${API}/api/friends/add`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: currentUser.id, friend_id: friendId })
  });
}

function openSearchModal() {
  $("modal-search").classList.remove("hidden");
  $("friend-search-input").focus();
  $("friend-search-results").innerHTML = "";
}

function closeSearchModal() {
  $("modal-search").classList.add("hidden");
  $("friend-search-input").value = "";
  $("friend-search-results").innerHTML = "";
}

function renderSearchResults(results) {
  const container = $("friend-search-results");
  if (!results.length) {
    container.innerHTML = `<div class="search-empty">Aucun utilisateur trouvé</div>`;
    return;
  }
  container.innerHTML = results.map(u => `
    <div class="search-result-item">
      <div class="avatar size-sm" id="srav-${u.id}"></div>
      <span class="search-result-name">${escHtml(u.display_name)}</span>
      <button class="search-result-action" data-uid="${u.id}" data-action="msg">💬 Message</button>
      <button class="search-result-action chat" data-uid="${u.id}" data-action="add">+ Ami</button>
    </div>
  `).join("");

  results.forEach(u => setAvatar($(`srav-${u.id}`), u.avatar, u.display_name));

  container.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.uid;
      const action = btn.dataset.action;
      if (action === "msg") {
        const convId = [currentUser.id, uid].sort().join("_");
        closeSearchModal();
        await openConversation(convId, uid);
        await loadConversations();
      } else {
        await addFriend(uid);
        btn.textContent = "✓ Ami";
        btn.disabled = true;
      }
    });
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── BOOT ──────────────────────────────────────────────────────────────────

async function bootApp(user) {
  currentUser = user;
  saveSession(user);
  initSocket();

  setAvatar($("my-avatar-sidebar"), user.avatar, user.display_name);
  $("my-name-sidebar").textContent = user.display_name;

  showScreen("app");
  await loadConversations();
}

// ── SETUP ALL EVENT LISTENERS ─────────────────────────────────────────────
// CORRECTION : tous les listeners sont attachés dans DOMContentLoaded,
// AVANT de vérifier la session — comme ça ils fonctionnent toujours,
// que ce soit après login ou après restauration de session.

document.addEventListener("DOMContentLoaded", () => {

  // ── Auth tabs
  document.querySelectorAll(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
      tab.classList.add("active");
      $(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });

  // ── Password toggle
  document.querySelectorAll(".toggle-pw").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = $(btn.dataset.target);
      input.type = input.type === "password" ? "text" : "password";
      btn.querySelector("i").className = input.type === "password" ? "ti ti-eye" : "ti ti-eye-off";
    });
  });

  // ── Login
  $("btn-login").addEventListener("click", async () => {
    const email = $("login-email").value.trim();
    const pw = $("login-password").value;
    if (!email || !pw) { showError("login-error", "Remplis tous les champs."); return; }
    $("btn-login").textContent = "Connexion...";
    try {
      const user = await doLogin(email, pw);
      if (user.setup_done) {
        await bootApp(user);
      } else {
        currentUser = user;
        showScreen("setup");
        $("setup-displayname").value = user.display_name || "";
      }
    } catch (e) {
      showError("login-error", e.message);
    } finally {
      $("btn-login").textContent = "Se connecter";
    }
  });

  $("login-password").addEventListener("keydown", e => {
    if (e.key === "Enter") $("btn-login").click();
  });

  // ── Register
  $("btn-register").addEventListener("click", async () => {
    const email = $("reg-email").value.trim();
    const pw = $("reg-password").value;
    if (!email || !pw) { showError("reg-error", "Remplis tous les champs."); return; }
    if (pw.length < 6) { showError("reg-error", "Mot de passe trop court (min 6 caractères)."); return; }
    $("btn-register").textContent = "Création...";
    try {
      const user = await doRegister(email, pw);
      currentUser = user;
      showScreen("setup");
      $("setup-displayname").value = user.display_name || "";
    } catch (e) {
      showError("reg-error", e.message);
    } finally {
      $("btn-register").textContent = "Créer mon compte";
    }
  });

  // ── Avatar preview
  $("avatar-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      $("avatar-img").src = ev.target.result;
      $("avatar-img").style.display = "block";
      $("avatar-initials").style.display = "none";
    };
    reader.readAsDataURL(file);
  });

  // ── Setup
  $("setup-displayname").addEventListener("input", () => {
    $("avatar-initials").textContent = getInitials($("setup-displayname").value) || "?";
  });

  $("btn-setup").addEventListener("click", async () => {
    const name = $("setup-displayname").value.trim();
    if (!name) { showError("setup-error", "Entre un pseudo public."); return; }
    const avatarImg = $("avatar-img");
    const avatarData = avatarImg.style.display !== "none" ? avatarImg.src : null;
    $("btn-setup").textContent = "Enregistrement...";
    try {
      const user = await doSetup(currentUser.id, name, avatarData);
      await bootApp(user);
    } catch (e) {
      showError("setup-error", e.message);
    } finally {
      $("btn-setup").textContent = "Accéder à PicoChat →";
    }
  });

  // ── Logout
  $("btn-logout").addEventListener("click", () => {
    clearSession();
    currentUser = null;
    activeConvId = null;
    activePartnerId = null;
    if (socket) { socket.disconnect(); socket = null; }
    showScreen("auth");
  });

  // ── Close chat
  $("btn-close-chat").addEventListener("click", () => {
    $("chat-view").classList.add("hidden");
    $("chat-empty").classList.remove("hidden");
    $("rp-profile").classList.add("hidden");
    $("rp-placeholder").classList.remove("hidden");
    activeConvId = null;
    activePartnerId = null;
    document.querySelectorAll(".conv-item").forEach(el => el.classList.remove("active"));
  });

  // ── Send message
  $("btn-send").addEventListener("click", sendMessage);
  $("msg-input").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  // ── Conversation search
  $("conv-search").addEventListener("input", () => {
    clearTimeout(convSearchTimeout);
    convSearchTimeout = setTimeout(loadConversations, 200);
  });

  // ── Add friend from right panel
  $("btn-add-friend").addEventListener("click", async () => {
    if (!activePartnerId) return;
    await addFriend(activePartnerId);
    checkFriendStatus(activePartnerId);
  });

  // ── Search modal
  $("btn-search-friend").addEventListener("click", openSearchModal);
  $("btn-find-friend-empty").addEventListener("click", openSearchModal);
  $("modal-close").addEventListener("click", closeSearchModal);
  $("modal-search").addEventListener("click", e => {
    if (e.target === $("modal-search")) closeSearchModal();
  });

  $("friend-search-input").addEventListener("input", () => {
    clearTimeout(friendSearchTimeout);
    const q = $("friend-search-input").value.trim();
    if (!q) { $("friend-search-results").innerHTML = ""; return; }
    friendSearchTimeout = setTimeout(async () => {
      const results = await searchFriends(q);
      renderSearchResults(results);
    }, 300);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSearchModal();
  });

  // ── CORRECTION PRINCIPALE : restaurer la session APRÈS avoir attaché tous les listeners
  const saved = loadSession();
  if (saved) {
    bootApp(saved);
    return;
  }

  showScreen("auth");
});