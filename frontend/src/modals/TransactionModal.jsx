import { useState, useEffect } from "react";
import { T } from "../theme";
import { post, put, del } from "../api";
import { todayISO } from "../utils";
import { BottomSheet, Button, Input, Select, SegmentedControl } from "../components/ui";
import IconPicker from "../components/IconPicker";

export default function TransactionModal({ open, onClose, onSaved, transaction, bootstrap }) {
  const accounts = bootstrap?.accounts || [];
  const categories = bootstrap?.categories || [];

  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      if (transaction) {
        setType(transaction.type || "expense");
        setAmount(String(transaction.amount || ""));
        setAccountId(String(transaction.account_id || accounts[0]?.id || ""));
        setCategoryId(String(transaction.category_id || ""));
        setDate(transaction.date || todayISO());
        setDescription(transaction.description || "");
      } else {
        setType("expense");
        setAmount("");
        setAccountId(String(accounts.find(a => a.is_priority)?.id || accounts[0]?.id || ""));
        setCategoryId("");
        setDate(todayISO());
        setDescription("");
      }
      setError("");
    }
  }, [open, transaction]);

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Введите корректную сумму"); return; }
    if (!accountId) { setError("Выберите счёт"); return; }
    setLoading(true);
    setError("");
    try {
      const body = {
        type, amount: amt,
        account_id: parseInt(accountId),
        category_id: categoryId ? parseInt(categoryId) : null,
        date, description,
      };
      if (transaction?.id) {
        await put(`/api/transactions/${transaction.id}`, body);
      } else {
        await post("/api/transactions", body);
      }
      onSaved && onSaved({ type, amount: amt });
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function remove() {
    if (!transaction?.id) return;
    setLoading(true);
    try {
      await del(`/api/transactions/${transaction.id}`);
      onSaved && onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  const expCats = categories.filter(c => c.type !== "income");
  const incCats = categories.filter(c => c.type !== "expense");
  const shownCats = type === "income" ? incCats : expCats;

  return (
    <BottomSheet open={open} onClose={onClose} title={transaction ? "Редактировать" : "Новая транзакция"} maxHeight="90vh">
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Type */}
        <SegmentedControl
          value={type}
          onChange={setType}
          options={[
            { value: "expense", label: "💸 Расход" },
            { value: "income",  label: "💚 Доход" },
          ]}
        />

        {/* Amount */}
        <div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Сумма</div>
          <input
            type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0"
            style={{
              width: "100%", padding: "16px 14px", background: T.bg2,
              border: `1px solid ${T.brd}`, borderRadius: 10,
              color: type === "income" ? T.em : T.red,
              fontSize: 28, fontWeight: 800, outline: "none",
              fontVariantNumeric: "tabular-nums",
            }}
          />
        </div>

        {/* Account */}
        <Select
          label="Счёт"
          value={accountId}
          onChange={setAccountId}
          options={accounts.map(a => ({ value: String(a.id), label: `${a.icon || "💰"} ${a.name}` }))}
        />

        {/* Category */}
        <div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, fontWeight: 600 }}>Категория</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              style={{
                padding: "7px 14px", borderRadius: 20, border: "none",
                background: !categoryId ? T.em : T.bg3,
                color: !categoryId ? "#fff" : T.muted,
                fontSize: 13, cursor: "pointer",
              }}
              onClick={() => setCategoryId("")}
            >
              Без категории
            </button>
            {shownCats.map(cat => (
              <button
                key={cat.id}
                style={{
                  padding: "7px 14px", borderRadius: 20, border: "none",
                  background: String(categoryId) === String(cat.id) ? (cat.color || T.em) : T.bg3,
                  color: String(categoryId) === String(cat.id) ? "#fff" : T.muted,
                  fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                }}
                onClick={() => setCategoryId(String(cat.id))}
              >
                {cat.icon} {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <Input label="Дата" type="date" value={date} onChange={setDate} />

        {/* Description */}
        <Input label="Описание" value={description} onChange={setDescription} placeholder="Необязательно" />

        {error && <div style={{ fontSize: 13, color: T.red }}>{error}</div>}

        <Button full onClick={save} disabled={loading}>
          {loading ? "Сохраняем..." : transaction ? "Сохранить" : "Добавить"}
        </Button>

        {transaction?.id && (
          <Button full variant="danger" onClick={remove} disabled={loading}>
            Удалить
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
