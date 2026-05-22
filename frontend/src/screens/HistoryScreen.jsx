import { useState, useEffect, useCallback } from "react";
import { T } from "../theme";
import { get } from "../api";
import { fmt, fmtDate, groupByDate, toRub } from "../utils";
import { Card, Skeleton, Button, EmptyState, SegmentedControl } from "../components/ui";

const PRESETS = [
  { label: "Сегодня", value: "today" },
  { label: "Неделя", value: "week" },
  { label: "Месяц", value: "month" },
  { label: "Квартал", value: "quarter" },
  { label: "Год", value: "year" },
];

function getPresetDates(preset) {
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date();
  if (preset === "today") return { start: today, end: today };
  if (preset === "week") {
    d.setDate(d.getDate() - 7);
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  if (preset === "month") {
    d.setDate(1);
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  if (preset === "quarter") {
    d.setMonth(d.getMonth() - 3);
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  if (preset === "year") {
    d.setFullYear(d.getFullYear() - 1);
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  return { start: today, end: today };
}

export default function HistoryScreen({ bootstrap, onOpenEditTransaction }) {
  const [preset, setPreset] = useState("month");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [stats, setStats] = useState(null);
  const usdRate = bootstrap?.usd_rate || 90;

  const LIMIT = 30;

  const load = useCallback(async (reset = false) => {
    const off = reset ? 0 : offset;
    setLoading(true);
    try {
      const { start, end } = getPresetDates(preset);
      const params = new URLSearchParams({
        start_date: start, end_date: end,
        limit: LIMIT, offset: off,
        ...(typeFilter === "goal"    ? { goal: "1" }           :
            typeFilter !== "all"    ? { type: typeFilter }     : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      const data = await get(`/api/transactions?${params}`);
      if (reset) {
        setTransactions(data.transactions || []);
        setOffset(LIMIT);
      } else {
        setTransactions(prev => [...prev, ...(data.transactions || [])]);
        setOffset(off + LIMIT);
      }
      setStats(data.stats);
      setHasMore((data.transactions || []).length === LIMIT);
    } catch {}
    setLoading(false);
  }, [preset, typeFilter, search, offset]);

  useEffect(() => { load(true); }, [preset, typeFilter]);

  useEffect(() => {
    const t = setTimeout(() => load(true), 400);
    return () => clearTimeout(t);
  }, [search]);

  const groups = groupByDate(transactions);

  const MONTHS_SHORT = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];

  function formatGroupDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateStr === today) return "Сегодня";
    if (dateStr === yesterday) return "Вчера";
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  }

  return (
    <div style={{ padding: "16px 16px calc(88px + env(safe-area-inset-bottom))" }}>
      {/* Presets */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
        {PRESETS.map(p => (
          <button
            key={p.value}
            style={{
              padding: "7px 14px", borderRadius: 20, border: "none", whiteSpace: "nowrap",
              background: preset === p.value ? T.em : T.bg3,
              color: preset === p.value ? "#fff" : T.muted,
              fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0,
            }}
            onClick={() => setPreset(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Поиск по описанию..."
        style={{
          width: "100%", padding: "10px 14px", background: T.bg2,
          border: `1px solid ${T.brd}`, borderRadius: 10,
          color: T.text, fontSize: 14, outline: "none", marginBottom: 12,
        }}
      />

      {/* Type filter */}
      <SegmentedControl
        value={typeFilter}
        onChange={setTypeFilter}
        options={[
          { value: "all", label: "Все" },
          { value: "expense", label: "Расходы" },
          { value: "income", label: "Доходы" },
          { value: "transfer", label: "Переводы" },
          { value: "goal", label: "Цели" },
        ]}
      />

      {/* Stats summary */}
      {stats && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, background: T.bg2, borderRadius: 10, padding: 10, border: `1px solid ${T.brd}` }}>
            <div style={{ fontSize: 10, color: T.muted }}>Расходы</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.red, fontVariantNumeric: "tabular-nums" }}>{fmt(stats.total_expense)}</div>
          </div>
          <div style={{ flex: 1, background: T.bg2, borderRadius: 10, padding: 10, border: `1px solid ${T.brd}` }}>
            <div style={{ fontSize: 10, color: T.muted }}>Доходы</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.em, fontVariantNumeric: "tabular-nums" }}>{fmt(stats.total_income)}</div>
          </div>
          <div style={{ flex: 1, background: T.bg2, borderRadius: 10, padding: 10, border: `1px solid ${T.brd}` }}>
            <div style={{ fontSize: 10, color: T.muted }}>Всего</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{stats.total_count}</div>
          </div>
        </div>
      )}

      {/* Transactions */}
      <div style={{ marginTop: 16 }}>
        {loading && transactions.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3,4,5].map(i => <Skeleton key={i} height={60} borderRadius={12} />)}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon="📋" title="Нет транзакций" desc="Попробуй другой период или фильтр" />
        ) : (
          groups.map(([date, txs]) => (
            <div key={date} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 12, color: T.muted, fontWeight: 700,
                marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5,
                display: "flex", justifyContent: "space-between",
              }}>
                <span>{formatGroupDate(date)}</span>
                <span style={{ color: T.sub }}>
                  {fmt(txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0))}
                </span>
              </div>
              {txs.map(tx => (
                <TxRow key={tx.id} tx={tx} onEdit={onOpenEditTransaction} />
              ))}
            </div>
          ))
        )}

        {hasMore && !loading && (
          <Button variant="ghost" full style={{ marginTop: 8 }} onClick={() => load(false)}>
            Загрузить ещё
          </Button>
        )}
      </div>
    </div>
  );
}

function TxRow({ tx, onEdit }) {
  const [pressed, setPressed] = useState(false);
  const isGoal = Boolean(tx.goal_id);
  const typeColors = { expense: T.red, income: T.em, transfer: T.blue };
  const color = isGoal ? T.gold : (typeColors[tx.type] || T.muted);

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 0", borderBottom: `1px solid ${T.brdDim}`,
        cursor: "pointer",
        transform: pressed ? "scale(0.98)" : "scale(1)", transition: "transform 0.1s",
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={() => onEdit && onEdit(tx)}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: `${tx.category_color || color}20`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
      }}>
        {tx.category_icon || (isGoal ? "🎯" : tx.type === "income" ? "💚" : tx.type === "transfer" ? "↔️" : "💸")}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
          {tx.description || tx.category_name || "Транзакция"}
        </div>
        <div style={{ fontSize: 11, color: T.muted }}>
          {tx.account_name} {tx.category_name && tx.description ? `· ${tx.category_name}` : ""}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
          {isGoal ? "→" : tx.type === "expense" ? "-" : tx.type === "income" ? "+" : "→"}{fmt(tx.amount)}
        </div>
      </div>
    </div>
  );
}
