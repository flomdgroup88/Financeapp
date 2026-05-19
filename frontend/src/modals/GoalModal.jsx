import { useState, useEffect } from "react";
import { T } from "../theme";
import { post, put, del } from "../api";
import { fmt } from "../utils";
import { BottomSheet, Button, Input, ProgressBar } from "../components/ui";
import IconPicker from "../components/IconPicker";
import ColorPicker from "../components/ColorPicker";

export default function GoalModal({ open, onClose, onSaved, goal, bootstrap }) {
  const accounts = bootstrap?.accounts || [];
  const [mode, setMode] = useState("list"); // list | edit | deposit
  const [goals, setGoals] = useState(bootstrap?.goals || []);

  const [name, setName]       = useState("");
  const [target, setTarget]   = useState("");
  const [saved, setSaved]     = useState("0");
  const [icon, setIcon]       = useState("🎯");
  const [color, setColor]     = useState("#F59E0B");
  const [deadline, setDeadline] = useState("");
  const [editGoal, setEditGoal] = useState(null);

  const [depositGoal, setDepositGoal]     = useState(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositAccount, setDepositAccount] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (open) {
      setGoals(bootstrap?.goals || []);
      setMode("list");
      setError("");
    }
  }, [open, bootstrap]);

  function startEdit(g) {
    setEditGoal(g || null);
    setName(g?.name || "");
    setTarget(String(g?.target_amount || ""));
    setSaved(String(g?.saved_amount || "0"));
    setIcon(g?.icon || "🎯");
    setColor(g?.color || "#F59E0B");
    setDeadline(g?.deadline || "");
    setMode("edit");
    setError("");
  }

  async function saveGoal() {
    if (!name.trim()) { setError("Введите название"); return; }
    const t = parseFloat(target);
    if (!t || t <= 0) { setError("Введите корректную цель"); return; }
    setLoading(true); setError("");
    try {
      const body = { name: name.trim(), target_amount: t, saved_amount: parseFloat(saved) || 0, icon, color, deadline: deadline || null };
      if (editGoal?.id) await put(`/api/goals/${editGoal.id}`, body);
      else await post("/api/goals", body);
      onSaved && onSaved();
      setMode("list");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function removeGoal() {
    if (!editGoal?.id) return;
    setLoading(true);
    try {
      await del(`/api/goals/${editGoal.id}`);
      onSaved && onSaved();
      setMode("list");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function deposit() {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) { setError("Введите сумму"); return; }
    setLoading(true); setError("");
    try {
      await post(`/api/goals/${depositGoal.id}/deposit`, {
        amount: amt,
        account_id: depositAccount ? parseInt(depositAccount) : null,
      });
      onSaved && onSaved();
      setMode("list");
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  const currentGoals = bootstrap?.goals || goals;

  return (
    <BottomSheet open={open} onClose={onClose}
      title={mode === "edit" ? (editGoal ? "Редактировать цель" : "Новая цель") : mode === "deposit" ? "Пополнить цель" : "Цели накоплений"}
      maxHeight="92vh"
    >
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
        {mode === "list" && (
          <>
            {currentGoals.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: T.muted }}>Нет целей. Создай первую!</div>
            ) : (
              currentGoals.map(g => {
                const pct = g.target_amount > 0 ? (g.saved_amount / g.target_amount) * 100 : 0;
                return (
                  <div key={g.id} style={{
                    background: T.bg2, borderRadius: 14, border: `1px solid ${T.brd}`,
                    padding: 14, borderLeft: `3px solid ${g.color || T.gold}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{g.icon}</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{g.name}</div>
                          {g.deadline && <div style={{ fontSize: 11, color: T.muted }}>до {g.deadline}</div>}
                        </div>
                      </div>
                      <button style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 13 }}
                        onClick={() => startEdit(g)}>✏️</button>
                    </div>
                    <ProgressBar pct={pct} color={g.color || T.gold} />
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: T.muted }}>{fmt(g.saved_amount)} / {fmt(g.target_amount)}</span>
                      <span style={{ fontSize: 12, color: g.color || T.gold, fontWeight: 600 }}>{Math.round(pct)}%</span>
                    </div>
                    {pct < 100 && (
                      <button
                        style={{
                          width: "100%", marginTop: 10, padding: "8px", borderRadius: 8,
                          border: `1px solid ${g.color || T.gold}40`,
                          background: `${g.color || T.gold}15`,
                          color: g.color || T.gold, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                        onClick={() => { setDepositGoal(g); setDepositAmount(""); setDepositAccount(String(accounts[0]?.id || "")); setMode("deposit"); setError(""); }}
                      >
                        + Пополнить
                      </button>
                    )}
                  </div>
                );
              })
            )}
            <Button full variant="ghost" onClick={() => startEdit(null)}>+ Новая цель</Button>
          </>
        )}

        {mode === "edit" && (
          <>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Иконка</div>
                <IconPicker value={icon} onChange={setIcon} />
              </div>
              <Input label="Название" value={name} onChange={setName} placeholder="Отпуск" style={{ flex: 1 }} />
            </div>
            <Input label="Цель (₽)" type="number" value={target} onChange={setTarget} placeholder="100000" />
            <Input label="Уже накоплено (₽)" type="number" value={saved} onChange={setSaved} placeholder="0" />
            <Input label="Дедлайн (необязательно)" type="date" value={deadline} onChange={setDeadline} />
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, fontWeight: 600 }}>Цвет</div>
              <ColorPicker value={color} onChange={setColor} />
            </div>
            {error && <div style={{ fontSize: 13, color: T.red }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="ghost" style={{ flex: 1 }} onClick={() => setMode("list")}>Назад</Button>
              <Button style={{ flex: 2 }} onClick={saveGoal} disabled={loading}>{loading ? "..." : editGoal ? "Сохранить" : "Создать"}</Button>
            </div>
            {editGoal?.id && <Button full variant="danger" onClick={removeGoal} disabled={loading}>Удалить цель</Button>}
          </>
        )}

        {mode === "deposit" && depositGoal && (
          <>
            <div style={{ fontSize: 15, color: T.text, fontWeight: 700, marginBottom: 4 }}>
              {depositGoal.icon} {depositGoal.name}
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 8 }}>
              {fmt(depositGoal.saved_amount)} / {fmt(depositGoal.target_amount)}
            </div>
            <Input label="Сумма пополнения (₽)" type="number" value={depositAmount} onChange={setDepositAmount} placeholder="0" />
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Списать со счёта</div>
              <select value={depositAccount} onChange={e => setDepositAccount(e.target.value)}
                style={{ width: "100%", padding: "12px 14px", background: T.bg2, border: `1px solid ${T.brd}`, borderRadius: 10, color: T.text, fontSize: 14, outline: "none" }}>
                <option value="">Не списывать</option>
                {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.icon} {a.name}</option>)}
              </select>
            </div>
            {error && <div style={{ fontSize: 13, color: T.red }}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="ghost" style={{ flex: 1 }} onClick={() => setMode("list")}>Назад</Button>
              <Button style={{ flex: 2 }} variant="gold" onClick={deposit} disabled={loading}>{loading ? "..." : "Пополнить"}</Button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
