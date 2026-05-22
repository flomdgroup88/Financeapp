import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme";
import { fmt, toRub } from "../utils";
import { injectCSS } from "./ui";

injectCSS("wrapped-styles", `
  @keyframes wrappedFadeUp {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes wrappedPop {
    0%   { opacity: 0; transform: scale(0.7); }
    70%  { opacity: 1; transform: scale(1.06); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes wrappedSlideLeft {
    from { opacity: 0; transform: translateX(60px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes wrappedCounter {
    from { opacity: 0; transform: translateY(20px) scale(0.8); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes wrappedBgPulse {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50%       { opacity: 1;   transform: scale(1.08); }
  }
  @keyframes wrappedConfetti {
    0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
    100% { transform: translateY(120px) rotate(720deg); opacity: 0; }
  }
  @keyframes wrappedStreak {
    from { width: 0; }
    to   { width: 100%; }
  }
  @keyframes wrappedGlow {
    0%, 100% { box-shadow: 0 0 20px 4px rgba(16,185,129,0.2); }
    50%       { box-shadow: 0 0 40px 8px rgba(16,185,129,0.4); }
  }
  @keyframes wrappedRing {
    from { stroke-dashoffset: 502; }
    to   { stroke-dashoffset: var(--ring-target); }
  }
  .wrapped-in-1 { animation: wrappedFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.1s both; }
  .wrapped-in-2 { animation: wrappedFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.3s both; }
  .wrapped-in-3 { animation: wrappedFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.5s both; }
  .wrapped-in-4 { animation: wrappedFadeUp 0.55s cubic-bezier(0.22,1,0.36,1) 0.7s both; }
  .wrapped-pop  { animation: wrappedPop 0.6s cubic-bezier(0.175,0.885,0.32,1.275) 0.2s both; }
  .wrapped-pop2 { animation: wrappedPop 0.6s cubic-bezier(0.175,0.885,0.32,1.275) 0.45s both; }
  .wrapped-pop3 { animation: wrappedPop 0.6s cubic-bezier(0.175,0.885,0.32,1.275) 0.7s both; }
  .wrapped-slide { animation: wrappedSlideLeft 0.45s cubic-bezier(0.22,1,0.36,1) both; }
`);

// ── Утилиты ──────────────────────────────────────────────────────────────
const DAYS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const DAYS_FULL = ["воскресеньям", "понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам"];
const MONTH_NAMES = ["январе","феврале","марте","апреле","мае","июне","июле","августе","сентябре","октябре","ноябре","декабре"];

function computeWrappedData({ stats, comparison, bootstrap, rates, year, month }) {
  const totalExp = stats?.total_expenses || 0;
  const totalInc = stats?.total_income || 0;
  const subs = bootstrap?.subscriptions || [];
  const goals = bootstrap?.goals || [];
  const accounts = bootstrap?.accounts || [];
  const daysElapsed = stats?.daily?.length || 30;

  // Топ категория
  const topCat = stats?.by_category?.[0] || null;

  // День недели с пиком трат
  const byDow = [0,0,0,0,0,0,0];
  const cntDow = [0,0,0,0,0,0,0];
  (stats?.daily || []).forEach(d => {
    const dow = new Date(d.date + "T00:00:00").getDay();
    byDow[dow] += d.total;
    cntDow[dow]++;
  });
  const avgDow = byDow.map((s,i) => cntDow[i]>0 ? s/cntDow[i] : 0);
  const peakDow = avgDow.indexOf(Math.max(...avgDow));
  const avgDowOverall = avgDow.reduce((a,b)=>a+b,0)/7;
  const peakPct = avgDowOverall > 0 ? Math.round(((avgDow[peakDow]-avgDowOverall)/avgDowOverall)*100) : 0;

  // Аномальный день
  const maxDay = (stats?.daily || []).reduce((a,b) => b.total>a.total ? b : a, {total:0, date:""});
  const dailyAvg = totalExp / Math.max(daysElapsed,1);

  // Подписки
  const activeSubs = subs.filter(s => s.is_active);
  const subTotal = activeSubs.reduce((s, sub) => {
    const rub = toRub(sub.amount, sub.currency, rates);
    return s + (sub.period==="yearly" ? rub/12 : rub);
  }, 0);

  // Норма сбережений
  const saved = totalInc - totalExp;
  const saveRate = totalInc > 0 ? Math.round((saved/totalInc)*100) : 0;

  // Сравнение
  const prevTotal = comparison?.previous?.total || 0;
  const compPct = comparison?.change_pct || 0;

  // Кофе
  const coffeeCat = (stats?.by_category || []).find(c =>
    ["кофе","coffee","кафе","cafe","café"].some(k => c.name?.toLowerCase().includes(k))
  );
  const coffeeYear = coffeeCat ? coffeeCat.total * 12 : 0;

  // Streak без трат
  let maxStreak=0, cur=0;
  const now = new Date();
  const daySet = new Set((stats?.daily||[]).map(d=>d.date));
  for (let i=1; i<=now.getDate(); i++) {
    const d = `${year}-${String(month).padStart(2,"0")}-${String(i).padStart(2,"0")}`;
    if (!daySet.has(d)) { cur++; maxStreak=Math.max(maxStreak,cur); }
    else cur=0;
  }

  return {
    totalExp, totalInc, saved, saveRate,
    topCat, peakDow, peakPct, avgDow,
    maxDay, dailyAvg,
    activeSubs, subTotal,
    prevTotal, compPct,
    coffeeCat, coffeeYear,
    maxStreak,
    goals: goals.filter(g => g.saved_amount < g.target_amount),
  };
}

// ── Прогресс-бар слайдов ──────────────────────────────────────────────────
function SlideProgress({ total, current, onDotClick }) {
  return (
    <div style={{ display:"flex", gap:4, padding:"0 20px" }}>
      {Array.from({length:total}).map((_,i) => (
        <div key={i}
          onClick={() => onDotClick(i)}
          style={{
            flex:1, height:3, borderRadius:99, cursor:"pointer",
            background: i===current
              ? T.em
              : i<current ? `${T.em}60` : `${T.text}20`,
            transition:"all 0.3s",
          }}
        />
      ))}
    </div>
  );
}

// ── Слайды ────────────────────────────────────────────────────────────────
function Slide1_Intro({ data, month }) {
  const monthName = MONTH_NAMES[month-1];
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", textAlign:"center", padding:"0 28px" }}>
      {/* Blob bg */}
      <div style={{
        position:"absolute", width:280, height:280, borderRadius:"50%",
        background:`radial-gradient(circle, ${T.em}18, transparent 70%)`,
        animation:"wrappedBgPulse 3s ease-in-out infinite",
        pointerEvents:"none",
      }}/>
      <div className="wrapped-in-1" style={{ fontSize:56, marginBottom:12 }}>✨</div>
      <div className="wrapped-in-2" style={{ fontSize:13, color:T.em, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:8 }}>
        Твой Wrapped
      </div>
      <div className="wrapped-in-3" style={{ fontSize:32, fontWeight:900, color:T.text, lineHeight:1.2, marginBottom:12 }}>
        Итоги {monthName}
      </div>
      <div className="wrapped-in-4" style={{ fontSize:15, color:T.muted, lineHeight:1.6 }}>
        Что произошло с твоими деньгами — в слайдах
      </div>
    </div>
  );
}

function Slide2_TotalSpend({ data }) {
  const isGood = data.compPct <= 0;
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 28px" }}>
      <div className="wrapped-in-1" style={{ fontSize:13, color:T.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:24 }}>
        Всего потрачено
      </div>
      <div className="wrapped-pop" style={{
        fontSize:52, fontWeight:900, lineHeight:1,
        background:`linear-gradient(135deg, ${T.text}, ${T.muted})`,
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
        marginBottom:8, fontVariantNumeric:"tabular-nums",
      }}>
        {fmt(data.totalExp)}
      </div>
      {data.prevTotal > 0 && (
        <div className="wrapped-in-3" style={{
          display:"inline-flex", alignItems:"center", gap:8,
          padding:"8px 16px", borderRadius:12, marginTop:12,
          background: isGood ? `${T.em}15` : `${T.red}15`,
          border:`1px solid ${isGood ? T.em : T.red}30`,
          width:"fit-content",
        }}>
          <span style={{ fontSize:20 }}>{isGood ? "📉" : "📈"}</span>
          <span style={{ fontSize:14, fontWeight:700, color: isGood ? T.em : T.red }}>
            {isGood ? "" : "+"}{data.compPct}% к прошлому месяцу
          </span>
        </div>
      )}
      {data.totalInc > 0 && (
        <div className="wrapped-in-4" style={{ marginTop:24, fontSize:14, color:T.muted }}>
          Доходы: <span style={{color:T.em, fontWeight:700}}>{fmt(data.totalInc)}</span>
          {" · "}Сбережения: <span style={{color:data.saved>0?T.em:T.red, fontWeight:700}}>
            {data.saved>0?"+":""}{fmt(data.saved)}
          </span>
        </div>
      )}
    </div>
  );
}

function Slide3_TopCategory({ data }) {
  if (!data.topCat) return <Slide_Empty text="Нет данных по категориям" />;
  const pct = data.totalExp > 0 ? Math.round((data.topCat.total/data.totalExp)*100) : 0;
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 28px" }}>
      <div className="wrapped-in-1" style={{ fontSize:13, color:T.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:20 }}>
        Главный враг бюджета
      </div>
      <div className="wrapped-pop" style={{ fontSize:72, marginBottom:8 }}>
        {data.topCat.icon || "🏷️"}
      </div>
      <div className="wrapped-in-2" style={{ fontSize:32, fontWeight:900, color:T.text, marginBottom:8 }}>
        {data.topCat.name}
      </div>
      <div className="wrapped-in-3" style={{ fontSize:44, fontWeight:900, color:T.red, fontVariantNumeric:"tabular-nums", lineHeight:1 }}>
        {fmt(data.topCat.total)}
      </div>
      <div className="wrapped-in-4" style={{ fontSize:15, color:T.muted, marginTop:12 }}>
        {pct}% всех расходов за месяц
      </div>
      {/* Полоска */}
      <div className="wrapped-in-4" style={{ marginTop:20, height:6, borderRadius:99, background:`${T.text}10`, overflow:"hidden" }}>
        <div style={{
          height:"100%", borderRadius:99,
          width:`${pct}%`,
          background:`linear-gradient(90deg, ${T.red}, ${T.gold})`,
          animation:"wrappedStreak 1.2s cubic-bezier(0.22,1,0.36,1) 0.8s both",
        }}/>
      </div>
    </div>
  );
}

function Slide4_PeakDay({ data }) {
  const { peakDow, peakPct, avgDow } = data;
  const maxVal = Math.max(...avgDow);
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 28px" }}>
      <div className="wrapped-in-1" style={{ fontSize:13, color:T.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:20 }}>
        Твой пик трат
      </div>
      <div className="wrapped-in-2" style={{ fontSize:28, fontWeight:900, color:T.text, lineHeight:1.3, marginBottom:6 }}>
        По {DAYS_FULL[peakDow]}
      </div>
      <div className="wrapped-in-3" style={{
        fontSize:18, fontWeight:700, color:T.gold,
        padding:"6px 14px", borderRadius:10, background:`${T.gold}18`,
        width:"fit-content", marginBottom:28,
      }}>
        +{peakPct}% от среднего
      </div>
      {/* Мини-бар чарт дней недели */}
      <div className="wrapped-in-4" style={{ display:"flex", gap:6, alignItems:"flex-end", height:80 }}>
        {avgDow.map((v,i) => {
          const h = maxVal > 0 ? Math.max(8, Math.round((v/maxVal)*72)) : 8;
          const isPeak = i===peakDow;
          return (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{
                width:"100%", height:h, borderRadius:"6px 6px 0 0",
                background: isPeak
                  ? `linear-gradient(180deg, ${T.gold}, ${T.gold}80)`
                  : `${T.text}15`,
                transition:"height 0.6s",
                animation: isPeak ? "wrappedGlow 2s ease-in-out infinite" : "none",
              }}/>
              <div style={{ fontSize:10, color: isPeak ? T.gold : T.sub, fontWeight: isPeak ? 700 : 400 }}>
                {DAYS_RU[i]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Slide5_Savings({ data }) {
  const rate = Math.max(0, Math.min(100, data.saveRate));
  const circumference = 2 * Math.PI * 80; // r=80
  const offset = circumference - (circumference * rate / 100);
  const emoji = rate >= 30 ? "🏆" : rate >= 20 ? "🌟" : rate >= 10 ? "💪" : rate > 0 ? "📈" : "😬";
  const label = rate >= 30 ? "Финансовый гений!" : rate >= 20 ? "Выше нормы!" : rate >= 10 ? "Хороший результат" : rate > 0 ? "Есть куда расти" : "Расходы > доходов";
  const color = rate >= 20 ? T.em : rate >= 10 ? T.gold : T.red;

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:"0 28px", textAlign:"center" }}>
      <div className="wrapped-in-1" style={{ fontSize:13, color:T.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:24 }}>
        Норма сбережений
      </div>

      {/* Кольцо */}
      <div className="wrapped-pop" style={{ position:"relative", width:180, height:180, marginBottom:24 }}>
        <svg width="180" height="180" viewBox="0 0 180 180" style={{ transform:"rotate(-90deg)" }}>
          <circle cx="90" cy="90" r="80" fill="none" stroke={`${T.text}12`} strokeWidth="12"/>
          <circle
            cx="90" cy="90" r="80" fill="none"
            stroke={color} strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition:"stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1) 0.4s" }}
          />
        </svg>
        <div style={{
          position:"absolute", inset:0,
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
        }}>
          <div style={{ fontSize:32, lineHeight:1 }}>{emoji}</div>
          <div style={{ fontSize:28, fontWeight:900, color, lineHeight:1, marginTop:4, fontVariantNumeric:"tabular-nums" }}>
            {rate}%
          </div>
        </div>
      </div>

      <div className="wrapped-in-2" style={{ fontSize:20, fontWeight:800, color:T.text, marginBottom:8 }}>{label}</div>
      {data.saved !== 0 && (
        <div className="wrapped-in-3" style={{ fontSize:14, color:T.muted }}>
          {data.saved > 0 ? "Отложено" : "Перерасход"}: <span style={{color, fontWeight:700}}>{fmt(Math.abs(data.saved))}</span>
        </div>
      )}
    </div>
  );
}

function Slide6_Coffee({ data }) {
  if (!data.coffeeCat || data.coffeeYear < 1000) return <Slide7_Streak data={data} />;
  const flights = Math.round(data.coffeeYear / 12000);
  const iphones = Math.round(data.coffeeYear / 90000);
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 28px" }}>
      <div className="wrapped-in-1" style={{ fontSize:13, color:T.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:20 }}>
        Кофе-фактор ☕
      </div>
      <div className="wrapped-in-2" style={{ fontSize:15, color:T.muted, marginBottom:4 }}>
        На «{data.coffeeCat.name}» в месяц
      </div>
      <div className="wrapped-pop" style={{ fontSize:44, fontWeight:900, color:T.gold, fontVariantNumeric:"tabular-nums", marginBottom:20 }}>
        {fmt(data.coffeeCat.total)}
      </div>
      <div className="wrapped-in-3" style={{ fontSize:15, color:T.muted, marginBottom:8 }}>
        За год это <span style={{color:T.text, fontWeight:800, fontSize:18}}>{fmt(data.coffeeYear)}</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:16 }}>
        {flights > 0 && (
          <div className="wrapped-in-3" style={{
            display:"flex", alignItems:"center", gap:12,
            padding:"12px 16px", borderRadius:14,
            background:`${T.blue}12`, border:`1px solid ${T.blue}25`,
          }}>
            <span style={{fontSize:28}}>✈️</span>
            <span style={{fontSize:14, color:T.text}}>
              <span style={{fontWeight:800, color:T.blue}}>{flights}</span> перелёт{flights===1?"":"а"} в Европу
            </span>
          </div>
        )}
        {iphones > 0 && (
          <div className="wrapped-in-4" style={{
            display:"flex", alignItems:"center", gap:12,
            padding:"12px 16px", borderRadius:14,
            background:`${T.text}08`, border:`1px solid ${T.text}15`,
          }}>
            <span style={{fontSize:28}}>📱</span>
            <span style={{fontSize:14, color:T.text}}>
              {iphones>=1 ? <><span style={{fontWeight:800}}>{iphones}</span> iPhone в год</> : "почти новый iPhone"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Slide7_Streak({ data }) {
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:"0 28px", textAlign:"center" }}>
      <div className="wrapped-in-1" style={{ fontSize:13, color:T.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:24 }}>
        Рекорд без трат
      </div>
      <div className="wrapped-pop" style={{ fontSize:100, lineHeight:1, marginBottom:8 }}>
        {data.maxStreak >= 5 ? "🔥" : data.maxStreak >= 3 ? "❄️" : "💡"}
      </div>
      <div style={{
        display:"flex", alignItems:"baseline", gap:8, marginBottom:12,
        animation:"wrappedCounter 0.5s cubic-bezier(0.22,1,0.36,1) 0.3s both",
      }}>
        <span style={{ fontSize:72, fontWeight:900, color:T.em, lineHeight:1, fontVariantNumeric:"tabular-nums" }}>
          {data.maxStreak}
        </span>
        <span style={{ fontSize:22, color:T.muted }}>дн.</span>
      </div>
      <div className="wrapped-in-2" style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:8 }}>
        {data.maxStreak>=5 ? "Легенда!" : data.maxStreak>=3 ? "Отличная дисциплина" : data.maxStreak>=1 ? "Хорошее начало" : "Ни одного дня"}
      </div>
      <div className="wrapped-in-3" style={{ fontSize:14, color:T.muted }}>
        {data.maxStreak > 0
          ? `${data.maxStreak} дней подряд без единой траты`
          : "В этом месяце тратил каждый день"}
      </div>
    </div>
  );
}

function Slide8_Subs({ data }) {
  if (data.activeSubs.length === 0) return <Slide_Empty text="Нет активных подписок" />;
  const topSubs = data.activeSubs.slice(0, 4);
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"0 28px" }}>
      <div className="wrapped-in-1" style={{ fontSize:13, color:T.muted, fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:20 }}>
        Подписочная жизнь
      </div>
      <div className="wrapped-in-2" style={{ fontSize:15, color:T.muted, marginBottom:4 }}>
        {data.activeSubs.length} активных · каждый месяц уходит
      </div>
      <div className="wrapped-pop" style={{ fontSize:40, fontWeight:900, color:T.cyan, fontVariantNumeric:"tabular-nums", marginBottom:24 }}>
        {fmt(Math.round(data.subTotal))}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {topSubs.map((sub, i) => (
          <div key={sub.id} className={`wrapped-in-${Math.min(i+2,4)}`} style={{
            display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"10px 14px", borderRadius:12,
            background:`${T.text}06`, border:`1px solid ${T.text}10`,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{fontSize:22}}>{sub.icon}</span>
              <span style={{fontSize:14, color:T.text, fontWeight:600}}>{sub.name}</span>
            </div>
            <span style={{fontSize:13, color:T.cyan, fontWeight:700, fontVariantNumeric:"tabular-nums"}}>
              {fmt(Math.round(toRub(sub.amount, sub.currency, {})))}/мес
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Slide9_Final({ data, onShare }) {
  const confettiEmojis = ["🎉","✨","💫","🌟","🎊","💰","🔥"];
  const [confetti, setConfetti] = useState([]);
  useEffect(() => {
    const items = Array.from({length:18}, (_,i) => ({
      id:i,
      emoji: confettiEmojis[i%confettiEmojis.length],
      left: Math.random()*100,
      delay: Math.random()*1.2,
      dur: 1.5 + Math.random()*1,
    }));
    setConfetti(items);
  }, []);

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:"0 28px", textAlign:"center", position:"relative", overflow:"hidden" }}>
      {/* Confetti */}
      {confetti.map(c => (
        <div key={c.id} style={{
          position:"absolute", top:-20, left:`${c.left}%`,
          fontSize:20, animation:`wrappedConfetti ${c.dur}s ease-in ${c.delay}s both`,
          pointerEvents:"none",
        }}>{c.emoji}</div>
      ))}

      <div className="wrapped-pop" style={{ fontSize:72, marginBottom:16 }}>🏆</div>
      <div className="wrapped-in-1" style={{ fontSize:26, fontWeight:900, color:T.text, marginBottom:8 }}>
        Вот и весь месяц!
      </div>
      <div className="wrapped-in-2" style={{ fontSize:15, color:T.muted, marginBottom:32, lineHeight:1.6 }}>
        Потратил {fmt(data.totalExp)}, сберёг <span style={{color:data.saved>0?T.em:T.red, fontWeight:700}}>{fmt(Math.abs(data.saved))}</span>
        {data.saveRate > 0 && <span> ({data.saveRate}%)</span>}
      </div>

      {/* Мини-статки */}
      <div className="wrapped-in-3" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, width:"100%", marginBottom:28 }}>
        {[
          { icon:"📅", label:"Лучший день", val:DAYS_RU[data.peakDow] },
          { icon:"🏷️", label:"Топ категория", val:data.topCat?.name?.slice(0,10) || "—" },
          { icon:"❄️", label:"Без трат", val:`${data.maxStreak} дн.` },
          { icon:"💚", label:"Сбережения", val:`${data.saveRate}%` },
        ].map(s => (
          <div key={s.label} style={{
            padding:"12px", borderRadius:14,
            background:`${T.text}06`, border:`1px solid ${T.text}10`,
          }}>
            <div style={{fontSize:22, marginBottom:4}}>{s.icon}</div>
            <div style={{fontSize:11, color:T.muted, marginBottom:2}}>{s.label}</div>
            <div style={{fontSize:15, fontWeight:800, color:T.text}}>{s.val}</div>
          </div>
        ))}
      </div>

      <button className="wrapped-in-4" onClick={onShare} style={{
        background:`linear-gradient(135deg, ${T.em}, ${T.emL})`,
        border:"none", borderRadius:99, color:T.bg0,
        fontSize:15, fontWeight:800, cursor:"pointer",
        padding:"14px 32px", width:"100%",
        boxShadow:`0 6px 24px ${T.em}40`,
      }}>
        Поделиться результатами ↗
      </button>
    </div>
  );
}

function Slide_Empty({ text }) {
  return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontSize:14, color:T.muted }}>{text}</div>
    </div>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────
export default function FinanceWrapped({ stats, comparison, bootstrap, rates, year, month, onClose }) {
  const [slide, setSlide] = useState(0);
  const [dir, setDir] = useState(1);
  const [key, setKey] = useState(0);
  const autoRef = useRef(null);
  const touchStart = useRef(null);

  const data = computeWrappedData({ stats, comparison, bootstrap, rates, year, month });

  const SLIDES = [
    s => <Slide1_Intro data={data} month={month} />,
    s => <Slide2_TotalSpend data={data} />,
    s => <Slide3_TopCategory data={data} />,
    s => <Slide4_PeakDay data={data} />,
    s => <Slide5_Savings data={data} />,
    s => <Slide6_Coffee data={data} />,
    s => <Slide8_Subs data={data} />,
    s => <Slide9_Final data={data} onShare={handleShare} />,
  ];

  const goTo = useCallback((idx) => {
    if (idx < 0 || idx >= SLIDES.length) return;
    setDir(idx > slide ? 1 : -1);
    setSlide(idx);
    setKey(k => k+1);
  }, [slide, SLIDES.length]);

  const next = useCallback(() => goTo(Math.min(slide+1, SLIDES.length-1)), [goTo, slide, SLIDES.length]);
  const prev = useCallback(() => goTo(Math.max(slide-1, 0)), [goTo, slide]);

  // Автоплей 5с на первом слайде
  useEffect(() => {
    if (slide === 0) {
      autoRef.current = setTimeout(() => next(), 5000);
    }
    return () => clearTimeout(autoRef.current);
  }, [slide]);

  // Свайп
  const handleTouchStart = (e) => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (!touchStart.current) return;
    const dx = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(dx) > 40) { dx > 0 ? next() : prev(); }
    touchStart.current = null;
  };

  function handleShare() {
    const text = `Мой финансовый Wrapped: потратил ${fmt(data.totalExp)}, сберёг ${fmt(Math.abs(data.saved))} (${data.saveRate}%). Топ категория: ${data.topCat?.name || "—"} 💸`;
    if (navigator.share) {
      navigator.share({ title: "Мой финансовый Wrapped", text }).catch(()=>{});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
  }

  const THEMES = [
    { bg1: "#080C0E", bg2: "#0d1f1a", accent: T.em },           // 0 intro
    { bg1: "#0a0a0f", bg2: "#12082a", accent: "#8B5CF6" },      // 1 total
    { bg1: "#100808", bg2: "#200d0d", accent: T.red },           // 2 top cat
    { bg1: "#0c0900", bg2: "#1f1500", accent: T.gold },          // 3 peak day
    { bg1: "#081510", bg2: "#0d241c", accent: T.em },            // 4 savings
    { bg1: "#070a10", bg2: "#0d1220", accent: T.blue },          // 5 coffee
    { bg1: "#070d10", bg2: "#091520", accent: T.cyan },          // 6 subs
    { bg1: "#080C0E", bg2: "#101a10", accent: T.em },            // 7 final
  ];
  const theme = THEMES[Math.min(slide, THEMES.length-1)];

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position:"fixed", inset:0, zIndex:300,
        background:`linear-gradient(160deg, ${theme.bg1}, ${theme.bg2})`,
        display:"flex", flexDirection:"column",
        transition:"background 0.6s",
        userSelect:"none",
      }}
    >
      {/* Top bar */}
      <div style={{ padding:"16px 20px 12px", display:"flex", alignItems:"center", gap:12 }}>
        <button onClick={onClose} style={{
          background:`${T.text}12`, border:"none", color:T.muted,
          borderRadius:10, width:34, height:34, fontSize:16,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
          flexShrink:0,
        }}>✕</button>
        <div style={{flex:1}}>
          <SlideProgress total={SLIDES.length} current={slide} onDotClick={goTo} />
        </div>
        <div style={{ fontSize:12, color:T.sub, minWidth:36, textAlign:"right" }}>
          {slide+1}/{SLIDES.length}
        </div>
      </div>

      {/* Slide */}
      <div key={key} style={{ flex:1, display:"flex", flexDirection:"column", position:"relative", overflow:"hidden" }}>
        {SLIDES[slide]()}
      </div>

      {/* Nav buttons */}
      <div style={{ padding:"16px 20px", display:"flex", gap:12, paddingBottom:"calc(16px + env(safe-area-inset-bottom))" }}>
        {slide > 0 && (
          <button onClick={prev} style={{
            flex:1, padding:"14px", borderRadius:16,
            background:`${T.text}10`, border:`1px solid ${T.text}15`,
            color:T.muted, fontSize:15, fontWeight:700, cursor:"pointer",
          }}>
            ← Назад
          </button>
        )}
        {slide < SLIDES.length-1 ? (
          <button onClick={next} style={{
            flex:2, padding:"14px", borderRadius:16,
            background:theme.accent, border:"none",
            color:"#000", fontSize:15, fontWeight:800, cursor:"pointer",
            boxShadow:`0 4px 20px ${theme.accent}40`,
            transition:"background 0.5s, box-shadow 0.5s",
          }}>
            Дальше →
          </button>
        ) : null}
      </div>
    </div>
  );
}
