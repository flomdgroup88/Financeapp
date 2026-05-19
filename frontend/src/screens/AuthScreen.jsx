import { useState } from "react";
import { T } from "../theme";
import { login, register } from "../api";
import { Button, Input, Spinner } from "../components/ui";

export default function AuthScreen({ onAuth }) {
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!username.trim() || !password.trim()) {
      setError("Заполните все поля");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (tab === "login") {
        await login(username.trim(), password);
      } else {
        await register(username.trim(), password);
      }
      onAuth();
    } catch (e) {
      setError(e.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: T.bg0, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 20,
      backgroundImage: `radial-gradient(${T.brd} 1px, transparent 1px)`,
      backgroundSize: "24px 24px",
    }}>
      <div style={{
        width: "100%", maxWidth: 380,
        background: T.bg1, borderRadius: 20, border: `1px solid ${T.brd}`,
        padding: "32px 28px",
        boxShadow: `0 24px 64px rgba(0,0,0,0.6)`,
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔐</div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
            <span style={{ color: T.em }}>V</span>
            <span style={{ color: T.text }}>ault</span>
          </div>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Финансовый трекер
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", background: T.bg3, borderRadius: 10,
          padding: 3, marginBottom: 24, gap: 3,
        }}>
          {[["login", "Войти"], ["register", "Регистрация"]].map(([t, label]) => (
            <button
              key={t}
              style={{
                flex: 1, padding: "10px 4px", border: "none", borderRadius: 8,
                cursor: "pointer", fontSize: 14, fontWeight: 600,
                background: tab === t ? T.bg1 : "transparent",
                color: tab === t ? T.text : T.muted,
                transition: "all 0.15s",
              }}
              onClick={() => { setTab(t); setError(""); }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input
            label="Имя пользователя"
            value={username}
            onChange={setUsername}
            placeholder="vault_user"
          />
          <Input
            label="Пароль"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div style={{ fontSize: 13, color: T.red, marginTop: 12 }}>
            {error}
          </div>
        )}

        <Button
          full
          style={{ marginTop: 20 }}
          onClick={submit}
          disabled={loading}
        >
          {loading ? <Spinner size={18} color="#fff" /> : (tab === "login" ? "Войти" : "Создать аккаунт")}
        </Button>
      </div>
    </div>
  );
}
