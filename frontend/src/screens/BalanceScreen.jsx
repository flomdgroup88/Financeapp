import { useState, useRef, useCallback } from "react";
import { T } from "../theme";
import { fmt, toRub } from "../utils";
import { Card, DonutChart, Button, FAB, EmptyState, IconBadge } from "../components/ui";

export default function BalanceScreen({ bootstrap, onRefresh, onOpenTransfer, onOpenAddAccount, onOpenEditAccount, onOpenPlanned }) {
  const usdRate = bootstrap?.usd_rate || 90;
  const accounts = bootstrap?.accounts || [];
  const planned = bootstrap?.planned_income || [];

  const regular = accounts.filter(a => !a.is_reserve);
  const reserve = accounts.filter(a => a.is_reserve);

  const totalRub = accounts.reduce((s, a) => s + toRub(a.balance, a.currency, usdRate), 0);
  const donutData = accounts.map(a => ({
    label: a.name, value: toRub(a.balance, a.currency, usdRate),
    color: a.color || T.em, icon: a.icon,
  })).filter(d => d.value > 0);

  // ── Pull-to-refresh ───────────────────────────────────────────────────
  const [pullY, setPullY]           = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef  = useRef(null);
  const pullingRef = useRef(false);
  const THRESHOLD  = 64;

  const onTouchStart = useCallback((e) => {
    if (e.currentTarget.scrollTop > 0) return;
    startYRef.current = e.touches[0].clientY;
    pullingRef.current = true;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!pullingRef.current || startYRef.current === null || refreshing) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy <= 0) { pullingRef.current = false; return; }
    setPullY(Math.min(THRESHOLD * 1.5, dy * 0.45));
  }, [refreshing]);

  const onTouchEnd = useCallback(async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    if (pullY >= THRESHOLD) {
      setRefreshing(true);
      setPullY(THRESHOLD * 0.6);
      await onRefresh?.();
      setRefreshing(false);
    }
    setPullY(0);
    startYRef.current = null;
  }, [pullY, onRefresh]);

  function AccountRow({ acc }) {
    const [pressed, setPressed] = useState(false);
    const balRub = toRub(acc.balance, acc.currency, usdRate);
    return (
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 0",
          borderBottom: `1px solid ${T.brdDim}`, cursor: "pointer",
          transform: pressed ? "scale(0.98)" : "scale(1)", transition: "transform 0.1s",
        }}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onClick={() => onOpenEditAccount(acc)}
      >
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: `${acc.color || T.em}20`,
          border: `1px solid ${acc.color || T.em}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0,
        }}>
          {acc.icon || "💰"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{acc.name}</span>
            {acc.is_priority ? <span style={{ fontSize: 11, color: T.gold }}>★</span> : null}
          </div>
          <div style={{ fontSize: 12, color: T.muted }}>{acc.currency}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums",
            color: acc.balance >= 0 ? T.text : T.red,
          }}>
            {fmt(acc.balance, acc.currency)}
          </div>
          {acc.currency !== "RUB" && (
            <div style={{ fontSize: 11, color: T.muted }}>≈ {fmt(balRub)}</div>
          )}
        </div>
      </div>
    );
  }

  // Градус дуги для индикатора
  const pullPct  = Math.min(pullY / THRESHOLD, 1);
  const spinSize = 28;
  const r        = 11;
  const circ     = 2 * Math.PI * r;

  return (
    <div
      style={{ overflowY: "auto", height: "calc(100vh - 60px)" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull indicator */}
      <div style={{
        display: "flex", justifyContent: "center", alignItems: "center",
        height: pullY > 0 || refreshing ? pullY || THRESHOLD * 0.6 : 0,
        overflow: "hidden",
        transition: pullingRef.current ? "none" : "height 0.3s ease",
      }}>
        <svg width={spinSize} height={spinSize} viewBox={`0 0 ${spinSize} ${spinSize}`}
          style={{ transform: refreshing ? undefined : `rotate(${pullPct * 270 - 90}deg)`,
                   animation: refreshing ? "ptr-spin 0.8s linear infinite" : undefined }}>
          <style>{`@keyframes ptr-spin { to { transform: rotate(360deg); } }`}</style>
          <circle cx={spinSize/2} cy={spinSize/2} r={r}
            fill="none" stroke={T.brd} strokeWidth={2.5} />
          <circle cx={spinSize/2} cy={spinSize/2} r={r}
            fill="none" stroke={refreshing ? T.em : (pullPct >= 1 ? T.em : T.muted)}
            strokeWidth={2.5}
            strokeDasharray={circ}
            strokeDashoffset={refreshing ? circ * 0.25 : circ * (1 - pullPct)}
            strokeLinecap="round"
            style={{ transformOrigin: "50% 50%", transform: "rotate(-90deg)" }}
          />
        </svg>
      </div>

      <div style={{ padding: "16px 16px calc(88px + env(safe-area-inset-bottom))" }}>
        {/* Total + donut */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>Всего активов</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}>
              {fmt(totalRub)}
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{accounts.length} счетов</div>
          </div>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <DonutChart data={donutData} size={120} />
          </div>
        </div>

        {/* Transfer button */}
        <Button variant="ghost" style={{ width: "100%", marginBottom: 16 }} onClick={onOpenTransfer}>
          ⇄ Перевод между счетами
        </Button>

        {/* Regular accounts */}
        {regular.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Счета
            </div>
            {regular.map(acc => <AccountRow key={acc.id} acc={acc} />)}
          </Card>
        )}

        {/* Reserve */}
        {reserve.length > 0 && (
          <Card accent={T.gold} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: T.gold, marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Резервный
            </div>
            {reserve.map(acc => <AccountRow key={acc.id} acc={acc} />)}
          </Card>
        )}

        {accounts.length === 0 && (
          <EmptyState icon="🏦" title="Нет счетов" desc="Добавь первый счёт" />
        )}

        {/* Planned income */}
        {planned.length > 0 && (
          <Card accent={T.em} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: T.em, fontWeight: 700 }}>📥 Планируемые поступления</div>
              <button style={{ background: "none", border: "none", color: T.muted, fontSize: 12, cursor: "pointer" }}
                onClick={() => onOpenPlanned(null)}>+ Добавить</button>
            </div>
            {planned.map(p => (
              <div key={p.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderTop: `1px solid ${T.brdDim}`,
              }}>
                <div>
                  <div style={{ fontSize: 13, color: T.text }}>{p.description || "Поступление"}</div>
                  {p.expected_date && <div style={{ fontSize: 11, color: T.muted }}>{p.expected_date}</div>}
                </div>
                <span style={{ fontSize: 13, color: T.em, fontWeight: 600 }}>{fmt(p.amount)}</span>
              </div>
            ))}
          </Card>
        )}

        {/* Add account */}
        <Button variant="primary" full onClick={() => onOpenAddAccount(null)}>
          + Добавить счёт
        </Button>
      </div>
    </div>
  );
}
