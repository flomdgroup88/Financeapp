import { useState, useEffect } from "react";
import { T } from "../theme";
import { get } from "../api";
import { fmt, monthRange } from "../utils";
import { Card, MonthNav, DonutChart, ProgressBar, Button, Skeleton, EmptyState } from "../components/ui";
import BudgetsModal from "../modals/BudgetsModal";

export default function ExpensesScreen({ bootstrap, onRefresh }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [stats, setStats] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBudgets, setShowBudgets] = useState(false);
  const [selectedCat, setSelectedCat] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [s, b] = await Promise.all([
          get(`/api/stats/monthly?year=${year}&month=${month}`),
          get(`/api/budget-limits?year=${year}&month=${month}`),
        ]);
        setStats(s);
        setBudgets(b.budget_limits || []);
      } catch {}
      setLoading(false);
    }
    load();
  }, [year, month]);

  const cats = stats?.by_category || [];
  const total = stats?.total_expenses || 0;

  const donutData = cats.map(c => ({
    label: c.name, value: c.total,
    color: c.color || T.em, item: c,
  }));

  function getBudget(catId) {
    return budgets.find(b => b.category_id === catId);
  }

  return (
    <div style={{ padding: "16px 16px calc(88px + env(safe-area-inset-bottom))" }}>
      <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

      {/* Total */}
      <div style={{ textAlign: "center", margin: "20px 0 16px" }}>
        <div style={{ fontSize: 12, color: T.muted }}>Итого расходов</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: T.red, fontVariantNumeric: "tabular-nums" }}>
          {loading ? "..." : fmt(total)}
        </div>
      </div>

      {/* Donut + Legend */}
      {!loading && donutData.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <DonutChart data={donutData} size={140} onClick={c => setSelectedCat(c.item)} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {cats.slice(0, 5).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color || T.em, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: T.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name}
                </span>
                <span style={{ fontSize: 12, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                  {total > 0 ? Math.round((c.total / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Budgets button */}
      <Button variant="ghost" full style={{ marginBottom: 16 }} onClick={() => setShowBudgets(true)}>
        📐 Бюджеты
      </Button>

      {/* Category list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3,4].map(i => <Skeleton key={i} height={70} borderRadius={14} />)}
        </div>
      ) : cats.length === 0 ? (
        <EmptyState icon="💸" title="Нет расходов" desc="Добавь первую трату" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cats.map(cat => {
            const budget = getBudget(cat.id);
            const pct = budget ? (cat.total / budget.amount) * 100 : null;
            const overBudget = pct !== null && pct > 100;

            return (
              <Card
                key={cat.id}
                accent={cat.color || T.em}
                onClick={() => setSelectedCat(cat)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: `${cat.color || T.em}20`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    flexShrink: 0,
                  }}>
                    {cat.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: budget ? 6 : 0 }}>
                      <span style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{cat.name}</span>
                      <span style={{ fontSize: 14, color: overBudget ? T.red : T.red, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(cat.total)}
                      </span>
                    </div>
                    {budget && (
                      <>
                        <ProgressBar pct={pct} color={overBudget ? T.red : cat.color || T.em} />
                        <div style={{ fontSize: 11, color: overBudget ? T.red : T.muted, marginTop: 4 }}>
                          {overBudget ? `Превышен на ${fmt(cat.total - budget.amount)}` : `${fmt(budget.amount - cat.total)} осталось`}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <BudgetsModal
        open={showBudgets}
        onClose={() => setShowBudgets(false)}
        categories={bootstrap?.categories || []}
        year={year} month={month}
        onSaved={() => {
          setShowBudgets(false);
          // re-load budgets
          get(`/api/budget-limits?year=${year}&month=${month}`)
            .then(b => setBudgets(b.budget_limits || []));
        }}
      />
    </div>
  );
}
