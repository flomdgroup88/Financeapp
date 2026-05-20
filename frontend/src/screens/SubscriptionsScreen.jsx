import { useState } from "react";
import { T } from "../theme";
import { put, post } from "../api";
import { fmt, toRub, daysUntil } from "../utils";
import { Card, Button, EmptyState } from "../components/ui";

export default function SubscriptionsScreen({ bootstrap, onRefresh, onOpenSubscription }) {
  const usdRate = bootstrap?.usd_rate || 90;
  const rates = bootstrap || { usd_rate: 90 };
  const subs = bootstrap?.subscriptions || [];
  const accounts = bootstrap?.accounts || [];

  const active = subs.filter(s => s.is_active);
  const inactive = subs.filter(s => !s.is_active);

  const monthTotal = active.reduce((sum, s) => {
    const rub = toRub(s.amount, s.currency, rates);
    return sum + (s.period === "yearly" ? rub / 12 : rub);
  }, 0);

  async function toggle(sub) {
    await put(`/api/subscriptions/${sub.id}/toggle`, {});
    onRefresh();
  }

  async function chargeNow(sub) {
    const acc = accounts.find(a => a.id === sub.account_id) || accounts[0];
    if (!acc) return;
    await post(`/api/subscriptions/${sub.id}/charge`, { account_id: acc.id });
    onRefresh();
  }

  function SubRow({ sub }) {
    const days = daysUntil(sub.next_date);
    const rub = toRub(sub.amount, sub.currency, rates);
    const monthRub = sub.period === "yearly" ? rub / 12 : rub;
    const urgent = days !== null && days <= 3 && sub.is_active;

    return (
      <Card accent={urgent ? T.red : sub.color || T.cyan} style={{ marginBottom: 8 }} onClick={() => onOpenSubscription(sub)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: `${sub.color || T.cyan}20`,
            border: `1px solid ${sub.color || T.cyan}40`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
          }}>
            {sub.icon || "🔔"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{sub.name}</span>
              <span style={{ fontSize: 14, color: sub.is_active ? T.red : T.muted, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {fmt(monthRub)}
                <span style={{ fontSize: 10, color: T.muted }}>/мес</span>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: T.muted }}>
                {sub.period === "yearly" ? "Ежегодно" : "Ежемесячно"}
              </span>
              {sub.next_date && sub.is_active && (
                <span style={{
                  fontSize: 11, padding: "2px 6px", borderRadius: 4,
                  background: urgent ? T.redDim : T.bg3,
                  color: urgent ? T.red : T.muted,
                }}>
                  {days === 0 ? "Сегодня" : days === 1 ? "Завтра" : days !== null ? `через ${days} дн.` : sub.next_date}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }} onClick={e => e.stopPropagation()}>
          <button
            style={{
              flex: 1, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.brd}`,
              background: T.bg3, color: sub.is_active ? T.red : T.em,
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
            onClick={() => toggle(sub)}
          >
            {sub.is_active ? "⏸ Отключить" : "▶ Включить"}
          </button>
          {sub.is_active && (
            <button
              style={{
                flex: 1, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.brd}`,
                background: T.bg3, color: T.cyan, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
              onClick={() => chargeNow(sub)}
            >
              💳 Списать сейчас
            </button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div style={{ padding: "16px 16px calc(88px + env(safe-area-inset-bottom))" }}>
      {/* Total */}
      <Card accent={T.cyan} style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>Итого в месяц</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: T.red, fontVariantNumeric: "tabular-nums" }}>
          {fmt(monthTotal)}
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
          {active.length} активных подписок · {fmt(monthTotal * 12)}/год
        </div>
      </Card>

      {/* Active */}
      {active.length === 0 && inactive.length === 0 ? (
        <EmptyState icon="🔔" title="Нет подписок" desc="Добавь первую подписку" />
      ) : (
        <>
          {active.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                Активные
              </div>
              {active.map(sub => <SubRow key={sub.id} sub={sub} />)}
            </>
          )}

          {inactive.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginTop: 16 }}>
                Неактивные
              </div>
              {inactive.map(sub => <SubRow key={sub.id} sub={sub} />)}
            </>
          )}
        </>
      )}

      <Button variant="ghost" full style={{ marginTop: 16 }} onClick={() => onOpenSubscription(null)}>
        + Добавить подписку
      </Button>
    </div>
  );
}
