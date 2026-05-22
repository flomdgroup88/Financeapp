import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme";
import { fmt, toRub } from "../utils";
import { injectCSS } from "./ui";

injectCSS("shake-insight-styles", `
  @keyframes shakePhone {
    0%   { transform: rotate(0deg)   translateX(0); }
    15%  { transform: rotate(-8deg)  translateX(-4px); }
    30%  { transform: rotate(8deg)   translateX(4px); }
    45%  { transform: rotate(-6deg)  translateX(-3px); }
    60%  { transform: rotate(6deg)   translateX(3px); }
    75%  { transform: rotate(-3deg)  translateX(-2px); }
    90%  { transform: rotate(3deg)   translateX(2px); }
    100% { transform: rotate(0deg)   translateX(0); }
  }
  @keyframes shakeButton {
    0%,100% { transform: scale(1); }
    25% { transform: scale(0.95) rotate(-2deg); }
    75% { transform: scale(0.95) rotate(2deg); }
  }
  @keyframes insightReveal {
    0%   { opacity: 0; transform: scale(0.85) translateY(16px); }
    60%  { opacity: 1; transform: scale(1.03) translateY(-2px); }
    100% { opacity: 1; transform: scale(1)    translateY(0); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
    50%       { box-shadow: 0 0 24px 4px rgba(16,185,129,0.18); }
  }
  @keyframes floatPhone {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-8px); }
  }
  @keyframes ringWave {
    0%   { transform: scale(1);   opacity: 0.5; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  @keyframes insightExit {
    0%   { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(0.9) translateY(-8px); }
  }
  .phone-idle { animation: floatPhone 3s ease-in-out infinite; }
  .phone-shaking { animation: shakePhone 0.5s ease-in-out; }
  .insight-enter { animation: insightReveal 0.45s cubic-bezier(0.175,0.885,0.32,1.275) forwards; }
  .insight-exit  { animation: insightExit 0.25s ease-in forwards; }
`);

// ── Генератор всех инсайтов ─────────────────────────────────────────────
function buildInsights({ stats, comparison, bootstrap, rates }) {
  const insights = [];
  const now = new Date();
  const subs = bootstrap?.subscriptions || [];
  const goals = bootstrap?.goals || [];
  const accounts = bootstrap?.accounts || [];

  const totalExp = stats?.total_expenses || 0;
  const totalInc = stats?.total_income || 0;
  const daysInMonth = 30;
  const dayOfMonth = now.getDate();
  const daysElapsed = Math.max(dayOfMonth, 1);
  const dailyAvg = totalExp / daysElapsed;

  // --- Ежедневная/недельная аналитика ---
  if (stats?.daily?.length > 0) {
    // День недели с наибольшими тратами
    const byDow = [0, 0, 0, 0, 0, 0, 0];
    const countDow = [0, 0, 0, 0, 0, 0, 0];
    stats.daily.forEach(d => {
      const dow = new Date(d.date + "T00:00:00").getDay();
      byDow[dow] += d.total;
      countDow[dow]++;
    });
    const avgDow = byDow.map((s, i) => countDow[i] > 0 ? s / countDow[i] : 0);
    const maxDow = avgDow.indexOf(Math.max(...avgDow));
    const overallAvgDay = avgDow.reduce((a, b) => a + b, 0) / 7;
    const dayNames = ["воскресеньям", "понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам"];
    const dayNamesShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    if (overallAvgDay > 0 && avgDow[maxDow] > overallAvgDay * 1.2) {
      const pct = Math.round(((avgDow[maxDow] - overallAvgDay) / overallAvgDay) * 100);
      insights.push({
        id: "peak-dow", icon: "📅",
        text: `Больше всего тратишь по ${dayNames[maxDow]}`,
        sub: `+${pct}% от среднего дня — ${fmt(Math.round(avgDow[maxDow]))} в среднем`,
        type: "info", priority: 3,
      });
    }

    // Аномальный день
    const maxDayObj = stats.daily.reduce((a, b) => b.total > a.total ? b : a, stats.daily[0]);
    if (maxDayObj && dailyAvg > 0 && maxDayObj.total > dailyAvg * 2.5) {
      const dayNum = new Date(maxDayObj.date + "T00:00:00").getDate();
      insights.push({
        id: "spike-day", icon: "⚡",
        text: `${dayNum} числа — аномальный день`,
        sub: `потрачено ${fmt(maxDayObj.total)} — в ${Math.round(maxDayObj.total / dailyAvg)}x больше обычного`,
        type: "warning", priority: 2,
      });
    }

    // Серия дней без трат
    let maxStreak = 0, curStreak = 0;
    const daySet = new Set(stats.daily.map(d => d.date));
    for (let i = 1; i <= dayOfMonth; i++) {
      const d = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(i).padStart(2,"0")}`;
      if (!daySet.has(d)) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
      else curStreak = 0;
    }
    if (maxStreak >= 3) {
      insights.push({
        id: "no-spend-streak", icon: "🧊",
        text: `${maxStreak} дней без трат подряд`,
        sub: "отличная дисциплина!",
        type: "positive", priority: 4,
      });
    }
  }

  // --- Кофе/фаст-фуд годовой пересчёт ---
  if (stats?.by_category) {
    const coffeeKw = ["кофе", "coffee", "кафе", "café", "cafe"];
    const foodKw = ["еда", "продукты", "фаст", "fast", "ресторан", "обед", "перекус"];
    const coffeeCat = stats.by_category.find(c =>
      coffeeKw.some(k => c.name?.toLowerCase().includes(k))
    );
    if (coffeeCat && coffeeCat.total > 0) {
      const yearly = coffeeCat.total * 12;
      insights.push({
        id: "coffee-year", icon: "☕",
        text: `Кофе и кафе: ${fmt(coffeeCat.total)}/мес`,
        sub: `это ${fmt(yearly)} в год — хватит на ${Math.round(yearly / 90000)} перелёта в Европу`,
        type: "info", priority: 3,
      });
    }
    const topFoodCat = stats.by_category.find(c =>
      foodKw.some(k => c.name?.toLowerCase().includes(k))
    );
    if (topFoodCat && topFoodCat.total > 0 && topFoodCat !== coffeeCat) {
      const dailyCost = Math.round(topFoodCat.total / daysElapsed);
      insights.push({
        id: "food-daily", icon: "🍽️",
        text: `На еду уходит ${fmt(dailyCost)} в день`,
        sub: `«${topFoodCat.name}» — ${fmt(topFoodCat.total)} в этом месяце`,
        type: "info", priority: 4,
      });
    }
  }

  // --- Прогноз конца месяца ---
  if (totalExp > 0 && daysElapsed < daysInMonth) {
    const projected = Math.round(dailyAvg * daysInMonth);
    const prevTotal = comparison?.previous?.total || 0;
    if (prevTotal > 0) {
      const projDiff = Math.round(((projected - prevTotal) / prevTotal) * 100);
      if (Math.abs(projDiff) >= 10) {
        insights.push({
          id: "pace", icon: projDiff > 0 ? "📈" : "📉",
          text: projDiff > 0
            ? `При таком темпе потратишь ${fmt(projected)}`
            : `Экономишь! Прогноз — ${fmt(projected)}`,
          sub: `${projDiff > 0 ? "+" : ""}${projDiff}% к прошлому месяцу`,
          type: projDiff > 0 ? "warning" : "positive",
          priority: projDiff > 0 ? 2 : 3,
        });
      }
    }
  }

  // --- Когда кончатся деньги ---
  if (dailyAvg > 0) {
    const activeBalance = accounts
      .filter(a => !a.is_reserve)
      .reduce((s, a) => s + toRub(a.balance, a.currency, rates), 0);
    if (activeBalance > 0) {
      const daysLeft = Math.floor(activeBalance / dailyAvg);
      if (daysLeft <= 45) {
        const icon = daysLeft <= 7 ? "🚨" : daysLeft <= 14 ? "🔴" : daysLeft <= 30 ? "🟡" : "📆";
        const type = daysLeft <= 7 ? "danger" : daysLeft <= 14 ? "danger" : daysLeft <= 30 ? "warning" : "info";
        const urgency = daysLeft <= 7
          ? `Срочно! Осталось ${fmt(Math.round(activeBalance))}`
          : `При трате ${fmt(Math.round(dailyAvg))} в день`;
        insights.push({
          id: "money-runout", icon,
          text: `Деньги кончатся через ${daysLeft} дн.`,
          sub: urgency,
          type,
          priority: daysLeft <= 14 ? 1 : daysLeft <= 30 ? 2 : 3,
        });
      }
    }
  }

  // --- Топ-категория как % от дохода ---
  if (stats?.by_category?.length > 0 && totalInc > 0) {
    const top = stats.by_category[0];
    const pct = Math.round((top.total / totalInc) * 100);
    if (pct >= 20) {
      insights.push({
        id: "top-cat-income", icon: top.icon || "🏷️",
        text: `«${top.name}» — ${pct}% всего дохода`,
        sub: `${fmt(top.total)} из ${fmt(totalInc)} заработанных`,
        type: pct >= 35 ? "danger" : "warning",
        priority: pct >= 35 ? 1 : 2,
      });
    }
  }

  // --- Подписки как % дохода ---
  const activeSubs = subs.filter(s => s.is_active);
  if (activeSubs.length > 0) {
    const subTotal = activeSubs.reduce((s, sub) => {
      const rub = toRub(sub.amount, sub.currency, rates);
      return s + (sub.period === "yearly" ? rub / 12 : rub);
    }, 0);
    if (totalInc > 0) {
      const subPct = Math.round((subTotal / totalInc) * 100);
      insights.push({
        id: "subs-income", icon: "📱",
        text: `${activeSubs.length} подписок = ${fmt(Math.round(subTotal))}/мес`,
        sub: `это ${subPct}% твоего дохода (${fmt(subTotal * 12)} в год)`,
        type: subPct >= 10 ? "warning" : "info",
        priority: 3,
      });
    }
  }

  // --- Норма сбережений ---
  if (totalInc > 0 && totalExp > 0) {
    const saved = totalInc - totalExp;
    const saveRate = Math.round((saved / totalInc) * 100);
    if (saved > 0) {
      const msgs = [
        saveRate >= 30 ? "Финансовый гений 🏆" :
        saveRate >= 20 ? "Выше нормы — отлично!" :
        saveRate >= 10 ? "Хороший результат" : "Есть куда расти"
      ];
      insights.push({
        id: "savings", icon: "💰",
        text: `Сберёг ${saveRate}% дохода — ${fmt(saved)}`,
        sub: msgs[0],
        type: saveRate >= 20 ? "positive" : "info",
        priority: saveRate >= 20 ? 3 : 4,
      });
    } else {
      insights.push({
        id: "overspend", icon: "🔴",
        text: `Расходы превысили доходы на ${fmt(Math.abs(saved))}`,
        sub: "срочно нужен план сокращения трат",
        type: "danger", priority: 1,
      });
    }
  }

  // --- Сравнение с прошлым месяцем ---
  if (comparison?.change_pct) {
    const ch = comparison.change_pct;
    if (Math.abs(ch) >= 10) {
      insights.push({
        id: "vs-prev", icon: ch > 0 ? "⬆️" : "⬇️",
        text: ch > 0
          ? `Расходы выросли на ${ch}% vs прошлый месяц`
          : `Расходы упали на ${Math.abs(ch)}% vs прошлый месяц`,
        sub: ch > 0
          ? `${fmt(totalExp)} сейчас vs ${fmt(comparison.previous?.total || 0)} раньше`
          : `Сэкономлено ${fmt((comparison.previous?.total || 0) - totalExp)}`,
        type: ch > 0 ? "warning" : "positive",
        priority: 3,
      });
    }
  }

  // --- Цели ---
  const activeGoals = goals.filter(g => g.saved_amount < g.target_amount);
  if (activeGoals.length > 0) {
    const g = activeGoals[0];
    const pct = Math.round((g.saved_amount / g.target_amount) * 100);
    const remaining = g.target_amount - g.saved_amount;
    if (totalInc > 0) {
      const monthsLeft = Math.ceil(remaining / (totalInc - totalExp > 0 ? totalInc - totalExp : 1));
      insights.push({
        id: "goal-eta", icon: g.icon || "🎯",
        text: `Цель «${g.name}» — ${pct}% выполнено`,
        sub: monthsLeft <= 12
          ? `осталось ${fmt(remaining)} — достигнешь через ~${monthsLeft} мес.`
          : `осталось ${fmt(remaining)}`,
        type: pct >= 80 ? "positive" : "info",
        priority: pct >= 80 ? 2 : 4,
      });
    }
  }

  // --- Баланс резерва ---
  const reserveAcc = accounts.filter(a => a.is_reserve);
  if (reserveAcc.length > 0 && totalExp > 0) {
    const reserveTotal = reserveAcc.reduce((s, a) => s + toRub(a.balance, a.currency, rates), 0);
    const monthsOfExpense = Math.floor(reserveTotal / (totalExp || 1));
    insights.push({
      id: "reserve-cushion", icon: "🛡️",
      text: `Резерв покроет ~${monthsOfExpense} мес. расходов`,
      sub: `${fmt(Math.round(reserveTotal))} в резерве`,
      type: monthsOfExpense >= 6 ? "positive" : monthsOfExpense >= 3 ? "info" : "warning",
      priority: 4,
    });
  }

  // --- Скачок категории ---
  if (comparison?.comparison?.length > 0) {
    const jump = [...comparison.comparison]
      .filter(c => c.curr_amount > 0 && c.prev_amount > 0)
      .sort((a, b) => (b.curr_amount - b.prev_amount) - (a.curr_amount - a.prev_amount))[0];
    if (jump && jump.curr_amount > jump.prev_amount * 1.5) {
      const diff = jump.curr_amount - jump.prev_amount;
      insights.push({
        id: "cat-spike", icon: jump.icon || "🔺",
        text: `«${jump.name}» выросло в ${(jump.curr_amount / jump.prev_amount).toFixed(1)}x`,
        sub: `+${fmt(diff)} к прошлому месяцу`,
        type: "warning", priority: 2,
      });
    }
    // Новая категория
    const newCat = comparison.comparison.find(c => c.curr_amount > 0 && c.prev_amount === 0);
    if (newCat) {
      insights.push({
        id: "cat-new", icon: newCat.icon || "✨",
        text: `Новая трата — «${newCat.name}»`,
        sub: `${fmt(newCat.curr_amount)} в этом месяце`,
        type: "info", priority: 3,
      });
    }
  }

  // Shuffle-friendly: сортируем по приоритету, потом рандомизируем внутри групп
  insights.sort((a, b) => a.priority - b.priority);
  return insights;
}

// ── Основной компонент ──────────────────────────────────────────────────
export default function ShakeInsight({ stats, comparison, bootstrap, rates, onClose }) {
  const [phase, setPhase]           = useState("idle"); // idle | shaking | showing
  const [currentInsight, setCurrentInsight] = useState(null);
  const [insightClass, setInsightClass]     = useState("");
  const [shakeCount, setShakeCount] = useState(0);
  const lastShake  = useRef(0);
  const insightsRef = useRef([]);

  const allInsights = buildInsights({ stats, comparison, bootstrap, rates });

  const pickInsight = useCallback(() => {
    if (allInsights.length === 0) return null;
    // Не повторять последний
    const pool = allInsights.filter(i => i.id !== currentInsight?.id);
    const candidates = pool.length > 0 ? pool : allInsights;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }, [allInsights, currentInsight]);

  const triggerShake = useCallback(() => {
    const now = Date.now();
    if (now - lastShake.current < 600) return; // debounce
    lastShake.current = now;

    if (phase === "showing") {
      // Exit animation then new insight
      setInsightClass("insight-exit");
      setTimeout(() => {
        const next = pickInsight();
        setCurrentInsight(next);
        setInsightClass("insight-enter");
        setShakeCount(c => c + 1);
      }, 260);
    } else {
      setPhase("shaking");
      setTimeout(() => {
        const next = pickInsight();
        setCurrentInsight(next);
        setInsightClass("insight-enter");
        setPhase("showing");
        setShakeCount(c => c + 1);
      }, 520);
    }
  }, [phase, pickInsight]);

  // DeviceMotion
  useEffect(() => {
    let lastMag = 0;
    const THRESHOLD = 18;

    function handleMotion(e) {
      const ag = e.accelerationIncludingGravity || {};
      const mag = Math.sqrt((ag.x||0)**2 + (ag.y||0)**2 + (ag.z||0)**2);
      if (Math.abs(mag - lastMag) > THRESHOLD) {
        triggerShake();
      }
      lastMag = mag;
    }

    // iOS 13+ требует разрешения
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission()
        .then(perm => { if (perm === "granted") window.addEventListener("devicemotion", handleMotion); })
        .catch(() => {});
    } else if (typeof DeviceMotionEvent !== "undefined") {
      window.addEventListener("devicemotion", handleMotion);
    }

    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [triggerShake]);

  const typeConfig = {
    danger:   { gradient: `linear-gradient(135deg, #7f1d1d44, #450a0a22)`, border: `${T.red}40`,  text: T.red,  label: "Важно" },
    warning:  { gradient: `linear-gradient(135deg, #78350f44, #451a0322)`, border: `${T.gold}40`, text: T.gold, label: "Внимание" },
    positive: { gradient: `linear-gradient(135deg, #064e3b44, #052e1622)`, border: `${T.em}40`,   text: T.em,   label: "Хорошо" },
    info:     { gradient: `linear-gradient(135deg, #1e3a5f44, #0f172a22)`, border: `${T.blue}40`, text: T.blue, label: "Факт" },
  };

  const cfg = currentInsight ? typeConfig[currentInsight.type] : null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(8,12,14,0.97)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 20px",
    }}>
      {/* Close */}
      <button onClick={onClose} style={{
        position: "absolute", top: 20, right: 20,
        background: T.bg3, border: `1px solid ${T.brd}`, color: T.muted,
        borderRadius: 12, width: 36, height: 36, fontSize: 18,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}>×</button>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 6 }}>
          🪄 Встряхни и узнай
        </div>
        <div style={{ fontSize: 13, color: T.muted, maxWidth: 260 }}>
          Случайный инсайт о твоих финансах
        </div>
      </div>

      {/* Phone + rings */}
      <div style={{ position: "relative", width: 120, height: 120, marginBottom: 40 }}>
        {/* Ring waves when idle */}
        {phase === "idle" && [0, 1].map(i => (
          <div key={i} style={{
            position: "absolute", inset: -20,
            borderRadius: "50%", border: `1.5px solid ${T.em}30`,
            animation: `ringWave 2.4s ease-out ${i * 1.2}s infinite`,
          }} />
        ))}

        {/* Phone emoji */}
        <button
          onClick={triggerShake}
          className={phase === "shaking" ? "phone-shaking" : "phone-idle"}
          style={{
            position: "absolute", inset: 0,
            background: "none", border: "none", cursor: "pointer",
            fontSize: 80, display: "flex", alignItems: "center", justifyContent: "center",
            filter: phase === "shaking" ? "drop-shadow(0 0 16px rgba(16,185,129,0.5))" : "none",
            transition: "filter 0.3s",
          }}
          aria-label="Встряхнуть"
        >
          📱
        </button>
      </div>

      {/* Insight card */}
      <div style={{ width: "100%", maxWidth: 360, minHeight: 110 }}>
        {phase === "idle" ? (
          <div style={{
            textAlign: "center", padding: "20px 16px",
            border: `1px dashed ${T.brd}`, borderRadius: 20,
            color: T.muted, fontSize: 13, lineHeight: 1.6,
          }}>
            ← нажми на телефон →
            <div style={{ marginTop: 8, fontSize: 11, color: T.sub }}>
              или встряхни устройство
            </div>
          </div>
        ) : currentInsight && cfg ? (
          <div
            key={shakeCount}
            className={insightClass}
            style={{
              padding: "20px 20px",
              borderRadius: 20,
              background: cfg.gradient,
              border: `1px solid ${cfg.border}`,
              boxShadow: `0 8px 32px ${cfg.border}`,
            }}
          >
            {/* Type badge */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 10px", borderRadius: 99,
              background: `${cfg.text}18`, border: `1px solid ${cfg.border}`,
              fontSize: 10, fontWeight: 700, color: cfg.text,
              textTransform: "uppercase", letterSpacing: 0.8,
              marginBottom: 12,
            }}>
              {cfg.label}
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <span style={{ fontSize: 36, flexShrink: 0, lineHeight: 1 }}>
                {currentInsight.icon}
              </span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>
                  {currentInsight.text}
                </div>
                {currentInsight.sub && (
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
                    {currentInsight.sub}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom controls */}
      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <button
          onClick={triggerShake}
          style={{
            background: `linear-gradient(135deg, ${T.em}, ${T.emL})`,
            border: "none", borderRadius: 50, color: T.bg0,
            fontSize: 15, fontWeight: 800, cursor: "pointer",
            padding: "14px 36px",
            boxShadow: `0 4px 20px ${T.em}44`,
            transition: "transform 0.1s, box-shadow 0.2s",
            animation: phase === "idle" ? "pulseGlow 2s ease-in-out infinite" : "none",
          }}
          onMouseDown={e => e.currentTarget.style.transform = "scale(0.96)"}
          onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
        >
          Встряхнуть ✨
        </button>

        {phase === "showing" && (
          <div style={{ fontSize: 11, color: T.sub }}>
            {allInsights.length} инсайтов доступно · нажми ещё раз
          </div>
        )}
      </div>
    </div>
  );
}
