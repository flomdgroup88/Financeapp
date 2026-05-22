import { useState, useEffect } from "react";
import { T } from "../theme";
import { get } from "../api";
import { fmt, toRub, monthRange, prevMonth } from "../utils";
import {
  Card, Skeleton, MonthNav, Ticker, AnimatedNumber,
  DonutChart, BarChart, ProgressBar, EmptyState
} from "../components/ui";
import { MONTHS_SHORT } from "../constants";

export default function DashboardScreen({ bootstrap, onAddTransaction, onOpenGoals, onOpenSettings, onNavigate }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [stats, setStats] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);

  const usdRate = bootstrap?.usd_rate || 90;
  const rates = bootstrap || { usd_rate: 90 };
  const accounts = bootstrap?.accounts || [];
  const subs = bootstrap?.subscriptions || [];
  const goals = bootstrap?.goals || [];

  const activeBalance = accounts
    .filter(a => !a.is_reserve)
    .reduce((s, a) => s + toRub(a.balance, a.currency, rates), 0);
  const reserveBalance = accounts
    .filter(a => a.is_reserve)
    .reduce((s, a) => s + toRub(a.balance, a.currency, rates), 0);

  const monthSubTotal = subs
    .filter(a => a.is_active)
    .reduce((s, sub) => {
      const rub = toRub(sub.amount, sub.currency, rates);
      return s + (sub.period === "yearly" ? rub / 12 : rub);
    }, 0);

  const upcoming = subs
    .filter(a => a.is_active && a.next_date)
    .map(s => ({ ...s, days: Math.ceil((new Date(s.next_date) - new Date()) / 86400000) }))
    .filter(s => s.days <= 7 && s.days >= 0)
    .sort((a, b) => a.days - b.days);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const [s, c, b] = await Promise.all([
          get(`/api/stats/monthly?year=${year}&month=${month}`),
          get(`/api/stats/comparison`),
          get(`/api/budget-limits?year=${year}&month=${month}`),
        ]);
        setStats(s);
        setComparison(c);
        setBudgets(b.budget_limits || []);
      } catch {}
      setLoading(false);
    }
    loadStats();
  }, [year, month]);

  const tickerItems = stats?.by_category?.slice(0, 8).map(c => ({
    icon: c.icon, name: c.name,
    amount: fmt(c.total),
    change: comparison?.comparison?.find(x => x.id === c.id)?.change_pct,
  })) || [];

  const topCats = stats?.by_category?.slice(0, 3) || [];
  const totalExp = stats?.total_expenses || 0;

  // Daily bar chart
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyMap = {};
  (stats?.daily || []).forEach(d => { dailyMap[d.date] = d.total; });
  const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    const date = `${year}-${String(month).padStart(2, "0")}-${day}`;
    return { label: String(i + 1), value: dailyMap[date] || 0 };
  });

  const compChange = comparison?.change_pct || 0;

  // ── Умные инсайты ────────────────────────────────────────────────────
  // Каждый инсайт: { id, icon, text, sub?, type: "danger"|"warning"|"positive"|"info" }
  const insights = [];
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const dayOfMonth   = isCurrentMonth ? now.getDate() : daysInMonth;
  const daysElapsed  = Math.max(dayOfMonth, 1);
  const dailyAvg     = totalExp / daysElapsed;

  // 1. Бюджеты: превышение или близко к лимиту
  budgets.forEach(b => {
    const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
    if (pct >= 100) {
      insights.push({
        id: `budget-over-${b.category_id}`,
        icon: b.category_icon || "⚠️",
        text: `«${b.category_name}» — бюджет превышен`,
        sub: `потрачено ${fmt(b.spent)} из ${fmt(b.amount)}`,
        type: "danger",
        priority: 1,
      });
    } else if (pct >= 80 && isCurrentMonth) {
      insights.push({
        id: `budget-near-${b.category_id}`,
        icon: b.category_icon || "🟡",
        text: `«${b.category_name}» — использовано ${Math.round(pct)}% бюджета`,
        sub: `осталось ${fmt(b.amount - b.spent)}`,
        type: "warning",
        priority: 2,
      });
    }
  });

  // 2. Прогноз трат до конца месяца (только для текущего месяца)
  if (isCurrentMonth && totalExp > 0 && daysElapsed < daysInMonth) {
    const projected = Math.round(dailyAvg * daysInMonth);
    const prevTotal = comparison?.previous?.total || 0;
    if (prevTotal > 0) {
      const projDiff = Math.round(((projected - prevTotal) / prevTotal) * 100);
      if (projDiff >= 15) {
        insights.push({
          id: "pace-high",
          icon: "📈",
          text: `При таком темпе к концу месяца — ${fmt(projected)}`,
          sub: `это на ${projDiff}% больше прошлого месяца`,
          type: "warning",
          priority: 2,
        });
      } else if (projDiff <= -10) {
        insights.push({
          id: "pace-low",
          icon: "📉",
          text: `Темп трат ниже прошлого месяца на ${Math.abs(projDiff)}%`,
          sub: `прогноз до конца месяца: ${fmt(projected)}`,
          type: "positive",
          priority: 4,
        });
      }
    }
  }

  // 3. Самый большой скачок категории (абсолютный прирост)
  if (comparison?.comparison?.length > 0) {
    const biggestJump = [...(comparison.comparison)]
      .filter(c => c.curr_amount > 0 && c.prev_amount > 0)
      .sort((a, b) => (b.curr_amount - b.prev_amount) - (a.curr_amount - a.prev_amount))[0];
    if (biggestJump && biggestJump.curr_amount > biggestJump.prev_amount) {
      const diff = biggestJump.curr_amount - biggestJump.prev_amount;
      insights.push({
        id: "cat-spike",
        icon: biggestJump.icon || "🔺",
        text: `«${biggestJump.name}» выросло сильнее всего`,
        sub: `+${fmt(diff)} vs прошлый месяц (+${biggestJump.change_pct}%)`,
        type: "info",
        priority: 3,
      });
    }

    // 4. Новая категория (не было в прошлом месяце)
    const newCat = comparison.comparison.find(c => c.curr_amount > 0 && c.prev_amount === 0);
    if (newCat) {
      insights.push({
        id: "cat-new",
        icon: newCat.icon || "✨",
        text: `Новая категория трат — «${newCat.name}»`,
        sub: `${fmt(newCat.curr_amount)} в этом месяце`,
        type: "info",
        priority: 3,
      });
    }
  }

  // 5. Аномальный день — самый дорогой vs средний
  if (stats?.daily?.length > 1) {
    const maxDayObj = stats.daily.reduce((a, b) => b.total > a.total ? b : a, stats.daily[0]);
    if (maxDayObj && dailyAvg > 0 && maxDayObj.total > dailyAvg * 2.5) {
      const dayNum = new Date(maxDayObj.date + "T00:00:00").getDate();
      insights.push({
        id: "spike-day",
        icon: "⚡",
        text: `${dayNum} числа потрачено ${fmt(maxDayObj.total)}`,
        sub: `в ${Math.round(maxDayObj.total / dailyAvg)}x больше среднего дня`,
        type: "info",
        priority: 3,
      });
    }
  }

  // 6. Норма сбережений
  if (stats?.total_income > 0 && stats?.total_expenses > 0) {
    const saved    = stats.total_income - stats.total_expenses;
    const saveRate = Math.round((saved / stats.total_income) * 100);
    if (saved > 0) {
      insights.push({
        id: "savings",
        icon: "💚",
        text: `Норма сбережений ${saveRate}% — ${fmt(saved)}`,
        sub: saveRate >= 20 ? "отличный результат!" : "есть куда расти",
        type: saveRate >= 20 ? "positive" : "info",
        priority: saveRate >= 20 ? 3 : 4,
      });
    } else {
      insights.push({
        id: "overspend",
        icon: "🔴",
        text: `Расходы превысили доходы на ${fmt(Math.abs(saved))}`,
        sub: "доходы: " + fmt(stats.total_income),
        type: "danger",
        priority: 1,
      });
    }
  }

  // 7. Сравнение с прошлым месяцем (если нет прогноза)
  if (!insights.find(i => i.id === "pace-high" || i.id === "pace-low")) {
    if (compChange > 20 && comparison?.previous?.total > 0) {
      insights.push({
        id: "comp-high",
        icon: "📊",
        text: `Расходы выше прошлого месяца на ${compChange}%`,
        sub: `прошлый месяц: ${fmt(comparison.previous.total)}`,
        type: "warning",
        priority: 2,
      });
    } else if (compChange < -10 && comparison?.previous?.total > 0) {
      insights.push({
        id: "comp-low",
        icon: "📊",
        text: `Расходы ниже прошлого месяца на ${Math.abs(compChange)}%`,
        sub: `сэкономлено ${fmt(comparison.previous.total - totalExp)}`,
        type: "positive",
        priority: 4,
      });
    }
  }

  // Сортируем по приоритету, берём топ-5
  insights.sort((a, b) => a.priority - b.priority);
  const topInsights = insights.slice(0, 5);

  const insightColors = {
    danger:   { bg: `${T.red}12`,  border: `${T.red}30`,  text: T.red  },
    warning:  { bg: `${T.gold}12`, border: `${T.gold}30`, text: T.gold },
    positive: { bg: `${T.em}12`,   border: `${T.em}30`,   text: T.em   },
    info:     { bg: `${T.blue}12`, border: `${T.blue}30`, text: T.blue },
  };

  return (
    <div style={{ padding: "0 0 calc(88px + env(safe-area-inset-bottom))" }}>
      {/* Header balance */}
      <div style={{ padding: "20px 16px 0" }}>
        <div style={{ fontSize: 12, color: T.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
          Общий баланс
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
          <AnimatedNumber value={Math.round(activeBalance)} suffix=" ₽" />
        </div>
        {reserveBalance > 0 && (
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            + <span style={{ color: T.gold }}>{fmt(reserveBalance)}</span> резервный
          </div>
        )}
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            fontSize: 12, padding: "3px 8px", borderRadius: 6,
            background: compChange >= 0 ? T.redDim : T.emDim,
            color: compChange >= 0 ? T.red : T.em, fontWeight: 600,
          }}>
            {compChange >= 0 ? "▲" : "▼"} {Math.abs(compChange)}% к прошлому
          </div>
        </div>
      </div>

      {/* Ticker */}
      {tickerItems.length > 0 && (
        <div style={{ margin: "16px 0 0" }}>
          <Ticker items={tickerItems} />
        </div>
      )}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "16px 16px 0" }}>
        {[
          { label: "Расходы", value: stats?.total_expenses || 0, color: T.red, icon: "↓", tab: "expenses" },
          { label: "Доходы",  value: stats?.total_income || 0,   color: T.em,  icon: "↑", tab: "history" },
          { label: "Подписки", value: monthSubTotal,              color: T.cyan, icon: "🔔", tab: "subs" },
        ].map(item => (
          <Card key={item.label} accent={item.color} style={{ padding: 12 }} onClick={() => onNavigate && onNavigate(item.tab)}>
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>{item.label}</div>
            {loading ? <Skeleton height={20} /> : (
              <div style={{ fontSize: 15, fontWeight: 700, color: item.color, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
                {fmt(item.value)}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Month nav */}
      <div style={{ padding: "20px 16px 0" }}>
        <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {/* Daily chart */}
      <div style={{ padding: "16px 16px 0" }}>
        <Card>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 12, fontWeight: 600 }}>Расходы по дням</div>
          {loading ? <Skeleton height={80} /> : (
            <BarChart data={dailyData} height={80} color={T.em} />
          )}
          {/* Day labels */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {[1, 8, 15, 22, daysInMonth].map(d => (
              <span key={d} style={{ fontSize: 10, color: T.sub }}>{d}</span>
            ))}
          </div>
        </Card>
      </div>

      {/* Top categories */}
      <div style={{ padding: "16px 16px 0" }}>
        <Card>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 12, fontWeight: 600 }}>Топ категорий</div>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1,2,3].map(i => <Skeleton key={i} height={32} />)}
            </div>
          ) : topCats.length === 0 ? (
            <EmptyState icon="📊" title="Нет данных" desc="Добавь расходы, чтобы увидеть статистику" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {topCats.map(cat => {
                const pct = totalExp > 0 ? (cat.total / totalExp) * 100 : 0;
                return (
                  <div key={cat.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 8,
                          background: `${cat.color || T.em}20`,
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                        }}>
                          {cat.icon}
                        </div>
                        <span style={{ fontSize: 13, color: T.text }}>{cat.name}</span>
                      </div>
                      <span style={{ fontSize: 13, color: T.red, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(cat.total)}
                      </span>
                    </div>
                    <ProgressBar pct={pct} color={cat.color || T.em} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Insights */}
      {topInsights.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <div style={{ fontSize: 13, color: T.muted, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            💡 <span>Умные инсайты</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: T.sub }}>{topInsights.length} из {insights.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topInsights.map(ins => {
              const c = insightColors[ins.type];
              return (
                <div key={ins.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 14px", borderRadius: 12,
                  background: c.bg, border: `1px solid ${c.border}`,
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{ins.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{ins.text}</div>
                    {ins.sub && (
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{ins.sub}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming subscriptions */}
      {upcoming.length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <Card accent={T.cyan}>
            <div style={{ fontSize: 13, color: T.cyan, marginBottom: 10, fontWeight: 700 }}>🔔 Ближайшие подписки</div>
            {upcoming.map(sub => (
              <div key={sub.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderTop: `1px solid ${T.brdDim}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{sub.icon}</span>
                  <div>
                    <div style={{ fontSize: 13, color: T.text }}>{sub.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>
                      {sub.days === 0 ? "Сегодня" : `Через ${sub.days} дн.`}
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 13, color: T.red, fontWeight: 600 }}>
                  {fmt(toRub(sub.amount, sub.currency, rates))}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Goals */}
      {goals.filter(g => g.saved_amount < g.target_amount).length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <Card accent={T.gold}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: T.gold, fontWeight: 700 }}>🎯 Цели накоплений</div>
              <button style={{ background: "none", border: "none", color: T.muted, fontSize: 12, cursor: "pointer" }}
                onClick={onOpenGoals}>все →</button>
            </div>
            {goals.filter(g => g.saved_amount < g.target_amount).slice(0, 2).map(goal => {
              const pct = goal.target_amount > 0 ? (goal.saved_amount / goal.target_amount) * 100 : 0;
              return (
                <div key={goal.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: T.text }}>{goal.icon} {goal.name}</span>
                    <span style={{ fontSize: 12, color: T.muted }}>{Math.round(pct)}%</span>
                  </div>
                  <ProgressBar pct={pct} color={goal.color || T.gold} />
                </div>
              );
            })}
          </Card>
        </div>
      )}

      {/* Planned income */}
      {(bootstrap?.planned_income || []).length > 0 && (
        <div style={{ padding: "16px 16px 0" }}>
          <Card accent={T.em}>
            <div style={{ fontSize: 13, color: T.em, marginBottom: 10, fontWeight: 700 }}>📥 Планируемые поступления</div>
            {(bootstrap?.planned_income || []).map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: `1px solid ${T.brdDim}` }}>
                <span style={{ fontSize: 13, color: T.text }}>{p.description || "Поступление"}</span>
                <span style={{ fontSize: 13, color: T.em, fontWeight: 600 }}>{fmt(p.amount)}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
