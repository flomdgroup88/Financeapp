import { useState, useEffect } from "react";
import { T } from "../theme";
import { post, put, del } from "../api";
import { todayISO } from "../utils";
import { BottomSheet, Button, Input, Select } from "../components/ui";
import { CURRENCIES } from "../constants";

export default function PlannedModal({ open, onClose, onSaved, planned, bootstrap }) {
  const accounts = bootstrap?.accounts || [];
  const [description, setDescription] = useState("");
  const [amount, setAmount]           = useState("");
  const [currency, setCurrency]       = useState("RUB");
  const [expectedDate, setExpectedDate] = useState("");
  const [accountId, setAccountId]     = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  useEffect(() => {
    if (open) {
      setDescription(planned?.description || "");
      setAmount(String(planned?.amount || ""));
      setCurrency(planned?.currency || "RUB");
      setExpectedDate(planned?.expected_date || "");
      setAccountId(String(planned?.account_id || accounts[0]?.id || ""));
      setError("");
    }
  }, [open, planned]);

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Введите корректную сумму"); return; }
    setLoading(true); setError("");
    try {
      const body = {
        description: description.trim(),
        amount: amt, currency,
        expected_date: expectedDate || null,
        account_id: accountId ? parseInt(accountId) : null,
      };
      if (planned?.id) await put(`/api/planned-income/${planned.id}`, body);
      else await post("/api/planned-income", body);
      onSaved && onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function remove() {
    if (!planned?.id) return;
    setLoading(true);
    try {
      await del(`/api/planned-income/${planned.id}`);
      onSaved && onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={planned ? "Редактировать поступление" : "Планируемое поступление"}>
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        <Input label="Описание" value={description} onChange={setDescription} placeholder="Зарплата, фриланс..." />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Сумма" type="number" value={amount} onChange={setAmount} placeholder="0" />
          <Select label="Валюта" value={currency} onChange={setCurrency}
            options={CURRENCIES.map(c => ({ value: c, label: c }))} />
        </div>

        <Input label="Ожидаемая дата" type="date" value={expectedDate} onChange={setExpectedDate} />

        <Select label="На счёт" value={accountId} onChange={setAccountId}
          options={[{ value: "", label: "Не указан" }, ...accounts.map(a => ({ value: String(a.id), label: `${a.icon || "💰"} ${a.name}` }))]} />

        {error && <div style={{ fontSize: 13, color: T.red }}>{error}</div>}
        <Button full onClick={save} disabled={loading}>{loading ? "Сохраняем..." : planned ? "Сохранить" : "Добавить"}</Button>
        {planned?.id && <Button full variant="danger" onClick={remove} disabled={loading}>Удалить</Button>}
      </div>
    </BottomSheet>
  );
}
