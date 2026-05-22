import { useState, useEffect, useCallback, useRef } from "react";
import { T } from "../theme";
import { get, del } from "../api";
import { fmt, fmtDate, groupByDate, toRub } from "../utils";
import { Card, Skeleton, Button, EmptyState, SegmentedControl } from "../components/ui";
import useCache from "../hooks/useCache";

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

// ── Swipeable row ────────────────────────────────────────────────────
// Свайп вправо  → редактировать (зелёный фон)
// Свайп влево   → удалить       (красный фон)
// Порог срабатывания — 72px (ACTION_THRESHOLD).
// Если не дотянул — карточка пружинит обратно.
const ACTION_THRESHOLD = 72;  // px до срабатывания действия
const MAX_DRAG        = 88;   // px максимальный сдвиг (больше не тянется)

function SwipeRow({ tx, onEdit, onDelete }) {
  const [offset, setOffset]   = useState(0);   // текущий сдвиг в px
  const [snapped, setSnapped] = useState(null); // "edit" | "delete" | null
  const [leaving, setLeaving] = useState(false);// анимация ухода строки при удалении

  const startXRef  = useRef(null);
  const isDragging = useRef(false);
  const rowRef     = useRef(null);

  // Цвет фона за карточкой (меняется плавно по мере свайпа)
  const revealBg = offset > 0
    ? `rgba(16,185,129,${Math.min(offset / ACTION_THRESHOLD, 1) * 0.9})`   // зелёный — редакт.
    : `rgba(239,68,68,${Math.min(-offset / ACTION_THRESHOLD, 1) * 0.9})`;  // красный — удалить

  const revealIcon  = offset > 0 ? "✏️" : "🗑️";
  const revealLabel = offset > 0 ? "Изменить" : "Удалить";

  // ── pointer events (мышь + тач через pointer API) ──────────────────
  function onPointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startXRef.current  = e.clientX;
    isDragging.current = false;
    rowRef.current?.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (startXRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    if (!isDragging.current && Math.abs(dx) < 6) return; // мёртвая зона
    isDragging.current = true;
    // Ограничиваем и добавляем резину за порогом
    const clamped = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx));
    setOffset(clamped);
    setSnapped(null);
  }

  function onPointerUp(e) {
    if (startXRef.current === null) return;
    startXRef.current = null;

    if (!isDragging.current) {
      // Это был тап, а не свайп — открываем редактирование
      onEdit && onEdit(tx);
      return;
    }
    isDragging.current = false;

    if (offset >= ACTION_THRESHOLD) {
      // Дотянул вправо — редактировать
      setSnapped("edit");
      // Небольшая задержка чтобы пользователь увидел "защёлкивание"
      setTimeout(() => {
        setOffset(0);
        setSnapped(null);
        onEdit && onEdit(tx);
      }, 180);
    } else if (offset <= -ACTION_THRESHOLD) {
      // Дотянул влево — удалить
      setSnapped("delete");
      setOffset(-MAX_DRAG); // защёлкиваем на максимуме
      // Пружина убирает строку
      setTimeout(async () => {
        setLeaving(true);     // схлопываем высоту
        await new Promise(r => setTimeout(r, 320));
        onDelete && onDelete(tx.id);
      }, 200);
    } else {
      // Не дотянул — возвращаем на место
      setOffset(0);
    }
  }

  function onPointerCancel() {
    startXRef.current  = null;
    isDragging.current = false;
    setOffset(0);
  }

  const isGoal = Boolean(tx.goal_id);
  const typeColors = { expense: T.red, income: T.em, transfer: T.blue };
  const color = isGoal ? T.gold : (typeColors[tx.type] || T.muted);

  const transition = isDragging.current
    ? "none"
    : "transform 0.28s cubic-bezier(0.32,0.72,0,1), opacity 0.28s";

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
        marginBottom: 6,
        // Схлопывание строки при удалении
        maxHeight: leaving ? 0 : 80,
        opacity:   leaving ? 0 : 1,
        transition: leaving
          ? "max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.25s"
          : "max-height 0.2s, opacity 0.2s",
      }}
    >
      {/* Фоновый слой — иконка действия */}
      <div
        style={{
          position: "absolute", inset: 0,
          background: revealBg,
          display: "flex", alignItems: "center",
          justifyContent: offset >= 0 ? "flex-start" : "flex-end",
          padding: "0 20px",
          transition: "background 0.1s",
          borderRadius: 12,
          pointerEvents: "none",
        }}
      >
        <span style={{ fontSize: 20 }}>{revealIcon}</span>
        {Math.abs(offset) > 48 && (
          <span style={{
            fontSize: 11, color: "#fff", fontWeight: 600,
            marginLeft: offset > 0 ? 8 : 0,
            marginRight: offset < 0 ? 8 : 0,
            order: offset < 0 ? -1 : 1,
            opacity: Math.min((Math.abs(offset) - 48) / 24, 1),
          }}>
            {revealLabel}
          </span>
        )}
      </div>

      {/* Сама карточка транзакции */}
      <div
        ref={rowRef}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 12px",
          background: T.bg1,
          borderBottom: `1px solid ${T.brdDim}`,
          borderRadius: 12,
          cursor: "grab",
          transform: `translateX(${offset}px)`,
          transition,
          userSelect: "none",
          touchAction: "pan-y", // разрешаем скролл по вертикали
          WebkitUserSelect: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: `${tx.category_color || color}20`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
        }}>
          {tx.category_icon || (isGoal ? "🎯" : tx.type === "income" ? "💚" : tx.type === "transfer" ? "↔️" : "💸")}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tx.description || tx.category_name || "Транзакция"}
          </div>
          <div style={{ fontSize: 11, color: T.muted }}>
            {tx.account_name}{tx.category_name && tx.description ? ` · ${tx.category_name}` : ""}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
            {isGoal ? "→" : tx.type === "expense" ? "−" : tx.type === "income" ? "+" : "→"}{fmt(tx.amount)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirmation toast ─────────────────────────────────────────
function UndoToast({ onUndo, onConfirm }) {
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(iv); onConfirm(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div style={{
      position: "fixed", bottom: "calc(80px + env(safe-area-inset-bottom))",
      left: 16, right: 16, zIndex: 9999,
      background: T.bg3, border: `1px solid ${T.brd}`,
      borderRadius: 14, padding: "12px 16px",
      display: "flex", alignItems: "center", gap: 12,
      animation: "slideUp 0.25s ease",
    }}>
      <span style={{ fontSize: 18 }}>🗑️</span>
      <span style={{ flex: 1, fontSize: 13, color: T.text }}>Транзакция удалена</span>
      <span style={{ fontSize: 12, color: T.muted, minWidth: 16 }}>{countdown}с</span>
      <button
        onClick={onUndo}
        style={{
          padding: "6px 14px", borderRadius: 8,
          background: T.em, color: "#fff",
          border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >
        Отменить
      </button>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────
export default function HistoryScreen({ bootstrap, onOpenEditTransaction }) {
  const [preset, setPreset]           = useState("month");
  const [typeFilter, setTypeFilter]   = useState("all");
  const [search, setSearch]           = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [offset, setOffset]           = useState(0);
  const [hasMore, setHasMore]         = useState(true);
  const [stats, setStats]             = useState(null);

  // Очередь удаления: храним id + данные строки до подтверждения (undo)
  const [pendingDelete, setPendingDelete] = useState(null); // { id, tx }

  const { getOfflineCache, setCache } = useCache();
  const LIMIT = 30;

  const load = useCallback(async (reset = false) => {
    const off = reset ? 0 : offset;
    setLoading(true);
    try {
      const { start, end } = getPresetDates(preset);
      const params = new URLSearchParams({
        start_date: start, end_date: end,
        limit: LIMIT, offset: off,
        ...(typeFilter === "goal"  ? { goal: "1" }       :
            typeFilter !== "all"  ? { type: typeFilter } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      const data = await get(`/api/transactions?${params}`);
      if (reset) {
        setTransactions(data.transactions || []);
        setOffset(LIMIT);
        if (!search.trim() && off === 0) {
          setCache(`history-${preset}-${typeFilter}`, data);
        }
      } else {
        setTransactions(prev => [...prev, ...(data.transactions || [])]);
        setOffset(off + LIMIT);
      }
      setStats(data.stats);
      setHasMore((data.transactions || []).length === LIMIT);
    } catch {
      if (reset && !search.trim()) {
        const cached = await getOfflineCache(`history-${preset}-${typeFilter}`);
        if (cached) {
          setTransactions(cached.transactions || []);
          setStats(cached.stats);
          setHasMore(false);
        }
      }
    }
    setLoading(false);
  }, [preset, typeFilter, search, offset]);

  useEffect(() => { load(true); }, [preset, typeFilter]);
  useEffect(() => {
    const t = setTimeout(() => load(true), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ── Удаление с undo ──────────────────────────────────────────────────
  // 1. Свайп → строка исчезает из UI мгновенно
  // 2. Показываем тост с таймером 4с и кнопкой «Отменить»
  // 3. Если не нажали — шлём DELETE на сервер
  // 4. Если нажали «Отменить» — возвращаем строку обратно

  function handleDeleteIntent(txId) {
    const tx = transactions.find(t => t.id === txId);
    // Убираем строку из UI
    setTransactions(prev => prev.filter(t => t.id !== txId));
    // Ставим в очередь подтверждения
    setPendingDelete({ id: txId, tx });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await del(`/api/transactions/${pendingDelete.id}`);
    } catch {
      // Если запрос упал — возвращаем строку (что-то пошло не так)
      setTransactions(prev => {
        const arr = [...prev, pendingDelete.tx];
        arr.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
        return arr;
      });
    }
    setPendingDelete(null);
  }

  function undoDelete() {
    if (!pendingDelete) return;
    // Возвращаем транзакцию на своё место в списке
    setTransactions(prev => {
      const arr = [...prev, pendingDelete.tx];
      arr.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      return arr;
    });
    setPendingDelete(null);
  }

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
        ))}</div>

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

      {/* Stats */}
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

      {/* Hint — показываем один раз пока нет удалённых */}
      {!pendingDelete && transactions.length > 0 && !loading && (
        <div style={{ fontSize: 11, color: T.sub, textAlign: "center", marginTop: 10, marginBottom: -4 }}>
          ← потяни строку для действий →
        </div>
      )}

      {/* Transactions */}
      <div style={{ marginTop: 12 }}>
        {loading && transactions.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[1,2,3,4,5].map(i => <Skeleton key={i} height={60} borderRadius={12} />)}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState icon="📋" title="Нет транзакций" desc="Попробуй другой период или фильтр" />
        ) : (
          groups.map(([date, txs]) => (
            <div key={date} style={{ marginBottom: 12 }}>
              <div style={{
                fontSize: 12, color: T.muted, fontWeight: 700,
                marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5,
                display: "flex", justifyContent: "space-between",
              }}>
                <span>{formatGroupDate(date)}</span>
                <span style={{ color: T.sub }}>
                  {fmt(txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0))}
                </span>
              </div>
              {txs.map(tx => (
                <SwipeRow
                  key={tx.id}
                  tx={tx}
                  onEdit={onOpenEditTransaction}
                  onDelete={handleDeleteIntent}
                />
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

      {/* Undo toast */}
      {pendingDelete && (
        <UndoToast
          onUndo={undoDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
