import { useState, useEffect } from "react";
import { T } from "../theme";
import { get, patch, post } from "../api";
import { logout } from "../api";
import { BottomSheet, Button, Input, Select } from "../components/ui";
import CategoryModal from "./CategoryModal";
import { CURRENCIES } from "../constants";

export default function SettingsModal({ open, onClose, bootstrap, onRefresh, onLogout }) {
  const [usdRate, setUsdRate]     = useState(String(bootstrap?.usd_rate || 90));
  const [nickname, setNickname]   = useState(bootstrap?.nickname || "");
  const [currency, setCurrency]   = useState(bootstrap?.default_currency || "RUB");
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState("");
  const [tab, setTab]             = useState("general");

  const [catModalOpen, setCatModalOpen]   = useState(false);
  const [editCat, setEditCat]             = useState(null);
  const [categories, setCategories]       = useState([]);

  useEffect(() => {
    if (open) {
      setUsdRate(String(bootstrap?.usd_rate || 90));
      setNickname(bootstrap?.nickname || "");
      setCurrency(bootstrap?.default_currency || "RUB");
      setMsg("");
      setCategories(bootstrap?.categories || []);
    }
  }, [open, bootstrap]);

  async function saveGeneral() {
    setSaving(true);
    try {
      await patch("/api/settings", {
        usd_rate: parseFloat(usdRate) || 90,
        nickname: nickname.trim(),
        default_currency: currency,
      });
      setMsg("Сохранено ✓");
      onRefresh && onRefresh();
      setTimeout(() => setMsg(""), 2000);
    } catch (e) { setMsg("Ошибка: " + e.message); }
    setSaving(false);
  }

  async function exportData() {
    try {
      const resp = await fetch("/api/export/json", {
        headers: { "X-Session-Token": localStorage.getItem("fin_session_token") || "" }
      });
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `vault-export-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
    } catch (e) { alert("Ошибка экспорта: " + e.message); }
  }

  async function exportCSV() {
    try {
      const resp = await fetch("/api/export/csv", {
        headers: { "X-Session-Token": localStorage.getItem("fin_session_token") || "" }
      });
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `vault-transactions-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
    } catch (e) { alert("Ошибка экспорта: " + e.message); }
  }

  async function handleLogout() {
    await logout();
    onLogout && onLogout();
  }

  const TABS = [
    { id: "general",    label: "⚙️ Общие" },
    { id: "categories", label: "🗂️ Категории" },
    { id: "export",     label: "📤 Экспорт" },
  ];

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Настройки" maxHeight="92vh">
        <div style={{ padding: "0 0 32px" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, padding: "12px 16px", overflowX: "auto" }}>
            {TABS.map(t => (
              <button key={t.id}
                style={{
                  padding: "8px 14px", borderRadius: 20, border: "none", whiteSpace: "nowrap",
                  background: tab === t.id ? T.em : T.bg3,
                  color: tab === t.id ? "#fff" : T.muted,
                  fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
                }}
                onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ padding: "0 16px" }}>
            {/* General */}
            {tab === "general" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Input label="Имя / никнейм" value={nickname} onChange={setNickname} placeholder="Мастер сейфа" />
                <Select label="Основная валюта" value={currency} onChange={setCurrency}
                  options={CURRENCIES.map(c => ({ value: c, label: c }))} />
                <Input label="Курс USD → RUB" type="number" value={usdRate} onChange={setUsdRate} hint="Используется для мульти-валютных счетов" />
                {msg && <div style={{ fontSize: 13, color: T.em }}>{msg}</div>}
                <Button full onClick={saveGeneral} disabled={saving}>{saving ? "Сохраняем..." : "Сохранить"}</Button>
                <div style={{ height: 1, background: T.brdDim }} />
                <Button full variant="danger" onClick={handleLogout}>Выйти из аккаунта</Button>
              </div>
            )}

            {/* Categories */}
            {tab === "categories" && (
              <div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {categories.map(cat => (
                    <div key={cat.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: T.bg2, borderRadius: 12, padding: "10px 12px",
                      border: `1px solid ${T.brd}`, cursor: "pointer",
                    }}
                      onClick={() => { setEditCat(cat); setCatModalOpen(true); }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 9,
                        background: `${cat.color || T.em}20`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
                      }}>{cat.icon}</div>
                      <span style={{ flex: 1, fontSize: 14, color: T.text }}>{cat.name}</span>
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: cat.color || T.em, display: "inline-block" }} />
                      <span style={{ fontSize: 12, color: T.muted }}>✏️</span>
                    </div>
                  ))}
                </div>
                <Button full variant="ghost" style={{ marginTop: 14 }} onClick={() => { setEditCat(null); setCatModalOpen(true); }}>
                  + Новая категория
                </Button>
              </div>
            )}

            {/* Export */}
            {tab === "export" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, color: T.muted }}>Экспортируй все свои данные</div>
                <Button full variant="ghost" onClick={exportData}>📦 Экспорт JSON (полный)</Button>
                <Button full variant="ghost" onClick={exportCSV}>📊 Экспорт CSV (транзакции)</Button>
              </div>
            )}
          </div>
          <button
          onClick={onClose}
          style={{
            width: "100%", marginTop: 4, padding: "13px",
            background: "transparent", border: `1px solid ${T.brd}`,
            borderRadius: 12, color: T.muted,
            fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          Отмена
        </button>
      </div>
      </BottomSheet>

      <CategoryModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        category={editCat}
        onSaved={() => {
          setCatModalOpen(false);
          onRefresh && onRefresh();
          setCategories(bootstrap?.categories || []);
        }}
      />
    </>
  );
}
