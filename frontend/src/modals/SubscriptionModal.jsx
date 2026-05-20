import { useState, useEffect } from "react";
import { T } from "../theme";
import { post, put, del } from "../api";
import { BottomSheet, Button, Input, Select } from "../components/ui";
import IconPicker from "../components/IconPicker";
import ColorPicker from "../components/ColorPicker";
import { CURRENCIES } from "../constants";

export default function SubscriptionModal({ open, onClose, onSaved, subscription, bootstrap }) {
  const accounts = bootstrap?.accounts || [];

  const [name, setName]         = useState("");
  const [amount, setAmount]     = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [period, setPeriod]     = useState("monthly");
  const [billingDay, setBillingDay] = useState("1");
  const [accountId, setAccountId]   = useState("");
  const [icon, setIcon]   = useState("🔔");
  const [color, setColor] = useState("#06B6D4");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (open) {
      const s = subscription;
      setName(s?.name || "");
      setAmount(String(s?.amount || ""));
      setCurrency(s?.currency || "RUB");
      setPeriod(s?.period || "monthly");
      setBillingDay(String(s?.billing_day || "1"));
      setAccountId(String(s?.account_id || accounts[0]?.id || ""));
      setIcon(s?.icon || "🔔");
      setColor(s?.color || "#06B6D4");
      setError("");
    }
  }, [open, subscription]);

  async function save() {
    if (!name.trim()) { setError("Введите название"); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Введите корректную сумму"); return; }
    setLoading(true);
    setError("");
    try {
      const body = {
        name: name.trim(), amount: amt, currency, period,
        billing_day: period === "monthly" ? parseInt(billingDay) : null,
        account_id: accountId ? parseInt(accountId) : null,
        icon, color,
      };
      let result;
      if (subscription?.id) result = await put(`/api/subscriptions/${subscription.id}`, body);
      else result = await post("/api/subscriptions", body);

      if (result?.offline) {
        setError("Сохранено офлайн — появится при подключении к сети");
        onSaved && onSaved();
        return;
      }
      onSaved && onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function remove() {
    if (!subscription?.id) return;
    setLoading(true);
    try {
      await del(`/api/subscriptions/${subscription.id}`);
      onSaved && onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={subscription ? "Редактировать подписку" : "Новая подписка"} maxHeight="92vh">
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Иконка</div>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
          <Input label="Название" value={name} onChange={setName} placeholder="Netflix" style={{ flex: 1 }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Сумма" type="number" value={amount} onChange={setAmount} placeholder="0" />
          <Select label="Валюта" value={currency} onChange={setCurrency}
            options={CURRENCIES.map(c => ({ value: c, label: c }))} />
        </div>

        <Select label="Период" value={period} onChange={setPeriod} options={[
          { value: "monthly", label: "Ежемесячно" },
          { value: "yearly",  label: "Ежегодно" },
        ]} />

        {period === "monthly" && (
          <Input label="День списания" type="number" value={billingDay} onChange={setBillingDay}
            placeholder="1" hint="День месяца (1-31)" />
        )}

        <Select label="Счёт списания" value={accountId} onChange={setAccountId}
          options={[{ value: "", label: "Не указан" }, ...accounts.map(a => ({ value: String(a.id), label: `${a.icon || "💰"} ${a.name}` }))]} />

        <div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, fontWeight: 600 }}>Цвет</div>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        {error && <div style={{ fontSize: 13, color: T.red }}>{error}</div>}
        <Button full onClick={save} disabled={loading}>{loading ? "Сохраняем..." : subscription ? "Сохранить" : "Создать"}</Button>
        {subscription?.id && <Button full variant="danger" onClick={remove} disabled={loading}>Удалить</Button>}
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
