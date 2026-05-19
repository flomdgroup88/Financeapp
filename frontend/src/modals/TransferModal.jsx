import { useState, useEffect } from "react";
import { T } from "../theme";
import { post } from "../api";
import { fmt, toRub } from "../utils";
import { BottomSheet, Button, Select, Input } from "../components/ui";

export default function TransferModal({ open, onClose, onSaved, bootstrap }) {
  const accounts = bootstrap?.accounts || [];
  const usdRate = bootstrap?.usd_rate || 90;

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && accounts.length >= 2) {
      setFromId(String(accounts[0]?.id || ""));
      setToId(String(accounts[1]?.id || ""));
      setAmount("");
      setError("");
    }
  }, [open]);

  const fromAcc = accounts.find(a => String(a.id) === fromId);
  const toAcc   = accounts.find(a => String(a.id) === toId);

  const fromRub = fromAcc ? toRub(parseFloat(amount) || 0, fromAcc.currency, usdRate) : 0;
  const toRubAmt = toAcc   ? toRub(parseFloat(amount) || 0, toAcc.currency,   usdRate)  : 0;

  const needsConversion = fromAcc && toAcc && fromAcc.currency !== toAcc.currency;

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Введите корректную сумму"); return; }
    if (!fromId || !toId)  { setError("Выберите счета"); return; }
    if (fromId === toId)   { setError("Нельзя переводить на тот же счёт"); return; }
    setLoading(true);
    setError("");
    try {
      await post("/api/transfers", {
        from_account_id: parseInt(fromId),
        to_account_id:   parseInt(toId),
        amount: amt,
      });
      onSaved && onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Перевод между счетами">
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
        <Select
          label="Откуда"
          value={fromId}
          onChange={setFromId}
          options={accounts.map(a => ({ value: String(a.id), label: `${a.icon || "💰"} ${a.name} (${fmt(a.balance, a.currency)})` }))}
        />

        <div style={{ textAlign: "center", fontSize: 24, color: T.muted }}>↓</div>

        <Select
          label="Куда"
          value={toId}
          onChange={setToId}
          options={accounts.map(a => ({ value: String(a.id), label: `${a.icon || "💰"} ${a.name} (${fmt(a.balance, a.currency)})` }))}
        />

        <div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Сумма ({fromAcc?.currency || "RUB"})</div>
          <input
            type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0"
            style={{
              width: "100%", padding: "16px 14px", background: T.bg2,
              border: `1px solid ${T.brd}`, borderRadius: 10,
              color: T.blue, fontSize: 28, fontWeight: 800, outline: "none",
              fontVariantNumeric: "tabular-nums",
            }}
          />
        </div>

        {needsConversion && parseFloat(amount) > 0 && (
          <div style={{
            background: T.blueDim, borderRadius: 10, padding: "10px 14px",
            fontSize: 13, color: T.blue, display: "flex", gap: 8, alignItems: "center",
          }}>
            <span>💱</span>
            <span>
              {fmt(parseFloat(amount), fromAcc.currency)} →{" "}
              <strong>{fmt(toRubAmt / (toAcc.currency === "RUB" ? 1 : toRub(1, toAcc.currency, usdRate)), toAcc.currency)}</strong>
              {" "}(курс {usdRate} ₽/$)
            </span>
          </div>
        )}

        {error && <div style={{ fontSize: 13, color: T.red }}>{error}</div>}

        <Button full onClick={save} disabled={loading} variant="primary">
          {loading ? "Переводим..." : "Перевести"}
        </Button>
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
