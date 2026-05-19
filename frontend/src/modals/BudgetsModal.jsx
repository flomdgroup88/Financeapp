import { useState, useEffect } from "react";
import { T } from "../theme";
import { get, post, del } from "../api";
import { fmt } from "../utils";
import { BottomSheet, Button, Input } from "../components/ui";

export default function BudgetsModal({ open, onClose, onSaved, categories, year, month }) {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    get(`/api/budget-limits?year=${year}&month=${month}`)
      .then(data => {
        const bl = data.budget_limits || [];
        setBudgets(bl);
        const v = {};
        bl.forEach(b => { v[b.category_id] = String(b.amount); });
        setValues(v);
      })
      .finally(() => setLoading(false));
  }, [open, year, month]);

  async function save() {
    setSaving(true);
    try {
      for (const cat of categories) {
        const val = values[cat.id];
        const amt = parseFloat(val);
        if (amt > 0) {
          await post("/api/budget-limits", { category_id: cat.id, amount: amt, year, month });
        }
      }
      onSaved && onSaved();
    } catch {}
    setSaving(false);
  }

  async function removeBudget(catId) {
    const b = budgets.find(x => x.category_id === catId);
    if (!b) return;
    try {
      await del(`/api/budget-limits/${b.id}`);
      setValues(v => { const nv = { ...v }; delete nv[catId]; return nv; });
      setBudgets(bds => bds.filter(x => x.category_id !== catId));
    } catch {}
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Бюджеты по категориям" maxHeight="92vh">
      <div style={{ padding: "16px 16px 32px" }}>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
          Установи лимиты расходов на месяц по каждой категории
        </div>

        {loading ? (
          <div style={{ color: T.muted, textAlign: "center", padding: 20 }}>Загрузка...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {categories.map(cat => {
              const val = values[cat.id] || "";
              const hasBudget = !!val;
              return (
                <div key={cat.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: T.bg2, borderRadius: 12, padding: "10px 12px",
                  border: `1px solid ${hasBudget ? (cat.color || T.em) + "40" : T.brd}`,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `${cat.color || T.em}20`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  }}>{cat.icon}</div>
                  <span style={{ flex: 1, fontSize: 14, color: T.text, fontWeight: 500 }}>{cat.name}</span>
                  <input
                    type="number" inputMode="decimal"
                    value={val}
                    onChange={e => setValues(v => ({ ...v, [cat.id]: e.target.value }))}
                    placeholder="лимит ₽"
                    style={{
                      width: 100, padding: "8px 10px", background: T.bg3,
                      border: `1px solid ${T.brd}`, borderRadius: 8,
                      color: T.text, fontSize: 14, outline: "none",
                      textAlign: "right", fontVariantNumeric: "tabular-nums",
                    }}
                  />
                  {hasBudget && (
                    <button
                      style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 16, padding: 4 }}
                      onClick={() => { setValues(v => { const nv = { ...v }; delete nv[cat.id]; return nv; }); removeBudget(cat.id); }}
                    >✕</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Button full style={{ marginTop: 20 }} onClick={save} disabled={saving}>
          {saving ? "Сохраняем..." : "Сохранить бюджеты"}
        </Button>
      </div>
    </BottomSheet>
  );
}
