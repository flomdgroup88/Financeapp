import { useState, useEffect } from "react";
import { T } from "../theme";
import { post, put, del } from "../api";
import { BottomSheet, Button, Input, Select } from "../components/ui";
import IconPicker from "../components/IconPicker";
import ColorPicker from "../components/ColorPicker";
import { CURRENCIES } from "../constants";

export default function AccountModal({ open, onClose, onSaved, account }) {
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [icon, setIcon] = useState("💰");
  const [color, setColor] = useState("#10B981");
  const [isPriority, setIsPriority] = useState(false);
  const [isReserve, setIsReserve] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      if (account) {
        setName(account.name || "");
        setBalance(String(account.balance || "0"));
        setCurrency(account.currency || "RUB");
        setIcon(account.icon || "💰");
        setColor(account.color || "#10B981");
        setIsPriority(!!account.is_priority);
        setIsReserve(!!account.is_reserve);
      } else {
        setName(""); setBalance("0"); setCurrency("RUB");
        setIcon("💰"); setColor("#10B981");
        setIsPriority(false); setIsReserve(false);
      }
      setError("");
    }
  }, [open, account]);

  async function save() {
    if (!name.trim()) { setError("Введите название"); return; }
    setLoading(true);
    setError("");
    try {
      const body = {
        name: name.trim(), balance: parseFloat(balance) || 0,
        currency, icon, color,
        is_priority: isPriority ? 1 : 0,
        is_reserve: isReserve ? 1 : 0,
      };
      if (account?.id) await put(`/api/accounts/${account.id}`, body);
      else await post("/api/accounts", body);
      onSaved && onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function remove() {
    if (!account?.id) return;
    setLoading(true);
    try {
      await del(`/api/accounts/${account.id}`);
      onSaved && onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={account ? "Редактировать счёт" : "Новый счёт"} maxHeight="92vh">
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Icon + Name row */}
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Иконка</div>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
          <Input label="Название" value={name} onChange={setName} placeholder="Кошелёк" style={{ flex: 1 }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Баланс" type="number" value={balance} onChange={setBalance} placeholder="0" />
          <Select
            label="Валюта" value={currency} onChange={setCurrency}
            options={CURRENCIES.map(c => ({ value: c, label: c }))}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, fontWeight: 600 }}>Цвет</div>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        {/* Toggles */}
        {[
          { label: "⭐ Приоритетный счёт", value: isPriority, set: setIsPriority },
          { label: "🏦 Резервный счёт",    value: isReserve,  set: setIsReserve  },
        ].map(({ label, value, set }) => (
          <div key={label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: T.bg3, borderRadius: 10, padding: "12px 14px",
          }}>
            <span style={{ fontSize: 14, color: T.text }}>{label}</span>
            <div
              style={{
                width: 44, height: 26, borderRadius: 13, cursor: "pointer", position: "relative",
                background: value ? T.em : T.brd, transition: "background 0.2s",
              }}
              onClick={() => set(!value)}
            >
              <div style={{
                position: "absolute", top: 3, left: value ? 21 : 3,
                width: 20, height: 20, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s",
              }} />
            </div>
          </div>
        ))}

        {error && <div style={{ fontSize: 13, color: T.red }}>{error}</div>}

        <Button full onClick={save} disabled={loading}>
          {loading ? "Сохраняем..." : account ? "Сохранить" : "Создать счёт"}
        </Button>

        {account?.id && (
          <Button full variant="danger" onClick={remove} disabled={loading}>Удалить счёт</Button>
        )}
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
  );
}
