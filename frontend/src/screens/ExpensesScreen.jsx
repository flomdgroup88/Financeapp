import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { T } from "../theme";
import { get } from "../api";
import { fmt, monthRange } from "../utils";
import { Card, MonthNav, DonutChart, ProgressBar, Button, Skeleton, EmptyState, Spinner } from "../components/ui";
import BudgetsModal from "../modals/BudgetsModal";
import TransactionModal from "../modals/TransactionModal";

// ─── Category drill-down overlay ─────────────────────────────────────────────
function CategoryOverlay({ cat, year, month, onClose, bootstrap, onRefresh }) {
  const [txs, setTxs]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [editTx, setEditTx]  = useState(null);
  const [show, setShow]      = useState(false);

  // Slide-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setShow(true));
  }, []);

  // Load transactions
  useEffect(() => {
    if (!cat) return;
    setLoading(true);
    const { start, end } = monthRange(year, month);
    get(`/api/transactions?category_id=${cat.id}&type=expense&start_date=${start}&end_date=${end}&limit=200&sort_by=date&sort_dir=desc`)
      .then(r => setTxs(r.transactions || []))
      .catch(() => setTxs([]))
      .finally(() => setLoading(false));
  }, [cat?.id, year, month]);

  function handleClose() {
    setShow(false);
    setTimeout(onClose, 300);
  }

  // Group by date
  const grouped = txs.reduce((acc, tx) => {
    (acc[tx.date] = acc[tx.date] || []).push(tx);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  function formatDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, zIndex: 998,
          background: `rgba(0,0,0,${show ? 0.55 : 0})`,
          transition: "background 0.3s",
        }}
      />

      {/* Sheet */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 999,
        background: T.bg1,
        borderRadius: "20px 20px 0 0",
        border: `1px solid ${T.brd}`,
        borderBottom: "none",
        maxHeight: "92vh",
        display: "flex",
        flexDirection: "column",
        transform: show ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.brd }} />
        </div>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px 12px",
          borderBottom: `1px solid ${T.brdDim}`,
          flexShrink: 0,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 11,
            background: `${cat.color || T.em}25`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, flexShrink: 0,
          }}>
            {cat.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{cat.name}</div>
            <div style={{ fontSize: 12, color: T.muted }}>
              {new Date(year, month - 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
            </div>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.red, fontVariantNumeric: "tabular-nums", marginRight: 8 }}>
            {fmt(cat.total)}
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 34, height: 34, borderRadius: "50%",
              background: T.bg3, border: `1px solid ${T.brd}`,
              color: T.muted, fontSize: 16, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{
          overflowY: "auto",
          flex: 1,
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
          overscrollBehavior: "contain",
        }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
              <Spinner size={28} color={cat.color || T.em} />
            </div>
          ) : txs.length === 0 ? (
            <EmptyState icon="🔍" title="Нет транзакций" desc="В этом месяце ничего нет" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {dates.map(date => (
                <div key={date}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: T.muted,
                    textTransform: "uppercase", letterSpacing: "0.07em",
                    marginBottom: 8,
                  }}>
                    {formatDate(date)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {grouped[date].map(tx => (
                      <div
                        key={tx.id}
                        onClick={() => setEditTx(tx)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 12px", borderRadius: 12,
                          background: T.bg2, border: `1px solid ${T.brd}`,
                          cursor: "pointer",
                          WebkitTapHighlightColor: "transparent",
                          userSelect: "none",
                        }}
                      >
                        <div style={{
                          fontSize: 11, color: T.muted,
                          background: T.bg3, borderRadius: 6,
                          padding: "2px 7px", flexShrink: 0, whiteSpace: "nowrap",
                        }}>
                          {tx.account_name || "—"}
                        </div>
                        <div style={{
                          flex: 1, fontSize: 14,
                          color: tx.description ? T.text : T.muted,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {tx.description || "Без описания"}
                        </div>
                        <div style={{
                          fontSize: 15, fontWeight: 700, color: T.red,
                          fontVariantNumeric: "tabular-nums", flexShrink: 0,
                        }}>
                          −{fmt(tx.amount)}
                        </div>
                        <span style={{ color: T.muted, fontSize: 16, flexShrink: 0 }}>›</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Footer */}
              <div style={{
                display: "flex", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: 12,
                background: `${cat.color || T.em}12`,
                border: `1px solid ${cat.color || T.em}30`,
              }}>
                <span style={{ fontSize: 13, color: T.muted }}>{txs.length} операций</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.red, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(txs.reduce((s, tx) => s + tx.amount, 0))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit transaction — вне sheet с transform, чтобы position:fixed работал корректно */}
      <TransactionModal
        open={!!editTx}
        onClose={() => setEditTx(null)}
        transaction={editTx}
        bootstrap={bootstrap}
        onSaved={() => {
          setEditTx(null);
          setLoading(true);
          const { start, end } = monthRange(year, month);
          get(`/api/transactions?category_id=${cat.id}&type=expense&start_date=${start}&end_date=${end}&limit=200&sort_by=date&sort_dir=desc`)
            .then(r => setTxs(r.transactions || []))
            .finally(() => setLoading(false));
          onRefresh?.();
        }}
      />
    </>,
    document.body
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function ExpensesScreen({ bootstrap, onRefresh }) {
  const now = new Date();
  const [year, setYear]         = useState(now.getFullYear());
  const [month, setMonth]       = useState(now.getMonth() + 1);
  const [stats, setStats]       = useState(null);
  const [budgets, setBudgets]   = useState([]);
  const [loading, setLoading]   = useState(true);
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

  const cats  = stats?.by_category || [];
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

      {/* Итого */}
      <div style={{ textAlign: "center", margin: "20px 0 16px" }}>
        <div style={{ fontSize: 12, color: T.muted }}>Итого расходов</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: T.red, fontVariantNumeric: "tabular-nums" }}>
          {loading ? "..." : fmt(total)}
        </div>
      </div>

      {/* Donut + легенда */}
      {!loading && donutData.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          <DonutChart data={donutData} size={140} onClick={c => setSelectedCat(c.item)} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {cats.slice(0, 5).map(c => (
              <div
                key={c.id}
                onClick={() => setSelectedCat(c)}
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
              >
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

      {/* Бюджеты */}
      <Button variant="ghost" full style={{ marginBottom: 16 }} onClick={() => setShowBudgets(true)}>
        📐 Бюджеты
      </Button>

      {/* Список категорий */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1,2,3,4].map(i => <Skeleton key={i} height={70} borderRadius={14} />)}
        </div>
      ) : cats.length === 0 ? (
        <EmptyState icon="💸" title="Нет расходов" desc="Добавь первую трату" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cats.map(cat => {
            const budget    = getBudget(cat.id);
            const pct       = budget ? (cat.total / budget.amount) * 100 : null;
            const overBudget = pct !== null && pct > 100;

            return (
              <Card key={cat.id} accent={cat.color || T.em} onClick={() => setSelectedCat(cat)}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: `${cat.color || T.em}20`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, flexShrink: 0,
                  }}>
                    {cat.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: budget ? 6 : 0 }}>
                      <span style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{cat.name}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 14, color: T.red, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {fmt(cat.total)}
                        </span>
                        <span style={{ fontSize: 16, color: T.muted }}>›</span>
                      </div>
                    </div>
                    {budget && (
                      <>
                        <ProgressBar pct={pct} color={overBudget ? T.red : cat.color || T.em} />
                        <div style={{ fontSize: 11, color: overBudget ? T.red : T.muted, marginTop: 4 }}>
                          {overBudget
                            ? `Превышен на ${fmt(cat.total - budget.amount)}`
                            : `${fmt(budget.amount - cat.total)} осталось`}
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

      {/* Drill-down оверлей */}
      {selectedCat && (
        <CategoryOverlay
          key={selectedCat.id}
          cat={selectedCat}
          year={year}
          month={month}
          onClose={() => setSelectedCat(null)}
          bootstrap={bootstrap}
          onRefresh={onRefresh}
        />
      )}

      <BudgetsModal
        open={showBudgets}
        onClose={() => setShowBudgets(false)}
        categories={bootstrap?.categories || []}
        year={year} month={month}
        onSaved={() => {
          setShowBudgets(false);
          get(`/api/budget-limits?year=${year}&month=${month}`)
            .then(b => setBudgets(b.budget_limits || []));
        }}
      />
    </div>
  );
}
