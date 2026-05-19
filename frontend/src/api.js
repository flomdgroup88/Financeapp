const TOKEN_KEY = "fin_session_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function hasToken() {
  return !!getToken();
}

// ── Offline queue (simple localStorage-based) ───────────────────────
const QUEUE_KEY = "fin_offline_queue";

function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
  catch { return []; }
}

function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function enqueue(method, url, body) {
  const q = getQueue();
  q.push({ method, url, body, id: Date.now() });
  saveQueue(q);
}

export async function flushQueue() {
  const q = getQueue();
  if (!q.length) return;
  const remaining = [];
  for (const item of q) {
    try {
      await rawFetch(item.method, item.url, item.body);
    } catch {
      remaining.push(item);
    }
  }
  saveQueue(remaining);
}

// ── Core fetch ───────────────────────────────────────────────────────
async function rawFetch(method, url, body) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Session-Token": getToken(),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("auth:logout"));
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function api(method, url, body) {
  if (!navigator.onLine && method !== "GET") {
    enqueue(method, url, body);
    return { ok: true, offline: true };
  }
  return rawFetch(method, url, body);
}

export const get  = (url)        => api("GET",    url);
export const post = (url, body)  => api("POST",   url, body);
export const put  = (url, body)  => api("PUT",    url, body);
export const patch= (url, body)  => api("PATCH",  url, body);
export const del  = (url)        => api("DELETE", url);

// ── Auth ─────────────────────────────────────────────────────────────
export async function login(username, password) {
  const data = await rawFetch("POST", "/api/auth/login", { username, password });
  if (data.token) setToken(data.token);
  return data;
}

export async function register(username, password) {
  const data = await rawFetch("POST", "/api/auth/setup", { username, password });
  if (data.token) setToken(data.token);
  return data;
}

export async function logout() {
  try { await rawFetch("POST", "/api/auth/logout"); } catch {}
  setToken(null);
}

// ── Flush on reconnect ───────────────────────────────────────────────
window.addEventListener("online", () => {
  setTimeout(flushQueue, 500);
});
