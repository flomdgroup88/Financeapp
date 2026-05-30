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
  const [nextDate, setNextDate]     = useState("");
  const [autoCharge, setAutoCharge] = useState(false);
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
      const inYear = new Date();
      inYear.setFullYear(inYear.getFullYear() + 1);
      setNextDate(s?.next_date || inYear.toISOString().slice(0, 10));
      setAutoCharge(!!s?.auto_charge);
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
        next_date: period === "yearly" ? (nextDate || null) : null,
        account_id: accountId ? parseInt(accountId) : null,
        auto_charge: autoCharge ? 1 : 0,
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
      onSaved && onSaved({
        name: body.name, amount: body.amount, currency: body.currency,
        period: body.period, icon: body.icon, color: body.color,
        isNew: !subscription?.id,
      });
      onClose();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function remove() {
    if (!subscription?.id) return;
    setLoading(true);
    try {
      await del(`/api/subscriptions/${subscription.id}`);
      onSaved && onSaved({ deleted: true, name: subscription.name });
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

        {period === "yearly" && (
          <Input label="Дата следующего списания" type="date" value={nextDate} onChange={setNextDate}
            hint="Когда списать в следующий раз" />
        )}

        <Select label="Счёт списания" value={accountId} onChange={setAccountId}
          options={[{ value: "", label: "Не указан" }, ...accounts.map(a => ({ value: String(a.id), label: `${a.icon || "💰"} ${a.name}` }))]} />

        {/* Автосписание */}
        <div style={{ background: T.bg3, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: T.text }}>⚡ Автосписание</span>
            <div
              style={{
                width: 44, height: 26, borderRadius: 13, cursor: "pointer", position: "relative",
                background: autoCharge ? T.em : T.brd, transition: "background 0.2s",
              }}
              onClick={() => setAutoCharge(v => !v)}
            >
              <div style={{
                position: "absolute", top: 3, left: autoCharge ? 21 : 3,
                width: 20, height: 20, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s",
              }} />
            </div>
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 8, lineHeight: 1.4 }}>
            {autoCharge
              ? "Спишется само при наступлении даты, когда откроешь приложение."
              : "Не списывается само — жми «Списать сейчас», когда оплатишь."}
          </div>
        </div>
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
