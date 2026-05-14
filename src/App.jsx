import { useState, useEffect, useCallback, useRef } from "react";

// ─── TELEGRAM WEBAPP INIT ─────────────────────────────────────────
const tg = typeof window !== "undefined" && window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor("#07071C");
  tg.setBackgroundColor("#07071C");
}

// ─── THEME ────────────────────────────────────────────────────────
const T = {
  bg0: "#07071C", bg1: "#0D0D28", bg2: "#13133A", bg3: "#1A1A4A",
  brd: "#252565", brdDim: "#1A1A48",
  gold: "#F5A623", goldL: "#FFD080", goldDim: "#8A5C0E",
  purp: "#8B5CF6", purpL: "#C4A5FF", purpDim: "#4C2A99",
  teal: "#06D6A0", tealDim: "#0A6648",
  rose: "#F43F5E", sky: "#38BDF8",
  text: "#EEEEFF", sub: "#8888BB", dim: "#3A3A6A",
};

// ─── GAME CONFIG ──────────────────────────────────────────────────
const PERIODS = [
  { id:"day",   label:"День",   xp:15,  accent:T.teal,  icon:"⚡", desc:"на сегодня" },
  { id:"week",  label:"Неделя", xp:50,  accent:T.sky,   icon:"🌊", desc:"на неделю"  },
  { id:"month", label:"Месяц",  xp:150, accent:T.purpL, icon:"💫", desc:"на месяц"   },
  { id:"year",  label:"Год",    xp:600, accent:T.gold,  icon:"👑", desc:"на год"     },
];

const XP_TABLE   = [0,200,500,1000,2000,3500,5500,8500,13000,20000,30000];
const RANKS      = ["Новобранец","Искатель","Авантюрист","Боец","Воин","Рыцарь","Ветеран","Страж","Мастер","Архимаг","Легенда"];
const RANK_ICONS = ["🪨","🔍","🗺️","🥊","⚔️","🛡️","🎖️","🏰","📖","🔮","👑"];
const MONTHS_RU  = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const WDAYS      = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

const lvlOf  = xp => Math.min(RANKS.length, [...XP_TABLE].reverse().findIndex(v => xp >= v) === -1 ? 1 : XP_TABLE.length - [...XP_TABLE].reverse().findIndex(v => xp >= v));
const progOf = xp => { const l = lvlOf(xp); if (l >= RANKS.length) return 1; const a = XP_TABLE[l-1]??0, b = XP_TABLE[l]??a+1; return Math.min((xp-a)/(b-a),1); };
const nextXP = xp => { const l = lvlOf(xp); return l >= RANKS.length ? 0 : (XP_TABLE[l]??0) - xp; };

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const fmtDate  = s => { const [y,m,d] = s.split("-"); return `${d}.${m}.${y}`; };
const uid      = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`;

const isBdTitle = t => /\bдр\b|день рождения|днюха|birthday/i.test(t);
const bdName    = t => { const m = t.match(/(?:др|день рождения|днюха|birthday)[:\s]+(.+)/i)||t.match(/(.+?)[\s,–-]+(?:др|день рождения|днюха)/i); return m?m[1].trim():t.trim(); };

// ─── LOCALSTORAGE ─────────────────────────────────────────────────
const LS = "questly_v1";
const loadState = () => { try { const r = localStorage.getItem(LS); return r ? JSON.parse(r) : null; } catch { return null; } };
const saveState = s => { try { localStorage.setItem(LS, JSON.stringify(s)); } catch {} };

// ─── DEMO DATA ────────────────────────────────────────────────────
const today = todayStr();
const INIT_TASKS = [
  { id:uid(), title:"Утренняя зарядка",     period:"day",   done:false, xp:15,  dueDate:today, recurring:false, recurType:"" },
  { id:uid(), title:"Прочитать 20 страниц", period:"day",   done:true,  xp:15,  dueDate:today, recurring:false, recurType:"" },
  { id:uid(), title:"Подготовить отчёт",    period:"week",  done:false, xp:50,  dueDate:today, recurring:false, recurType:"" },
  { id:uid(), title:"Пройти курс по React", period:"month", done:false, xp:150, dueDate:today, recurring:false, recurType:"" },
  { id:uid(), title:"Запустить проект",     period:"year",  done:false, xp:600, dueDate:today, recurring:false, recurType:"" },
];
const INIT_EVENTS = [
  { id:uid(), title:"ДР Алексея",       date:today, recurring:true,  recurType:"year", isBirthday:true,  color:T.gold, eventType:"birthday" },
  { id:uid(), title:"Созвон с командой",date:today, recurring:true,  recurType:"week", isBirthday:false, color:T.sky,  eventType:"meeting"  },
  { id:uid(), title:"Дедлайн проекта",  date:today, recurring:false, recurType:"",     isBirthday:false, color:T.rose, eventType:"deadline" },
];

// ─── EVENT TYPES ──────────────────────────────────────────────────
const EVENT_TYPES = [
  {
    id:"birthday", icon:"🎂", label:"День рождения", color:T.gold,
    hint:"Задача «Поздравить» создастся автоматически и будет повторяться ежегодно.",
    hintColor:T.gold,
    defaultRec:true, defaultRecType:"year", isSystemBd:true,
    makeTasks:(title)=>[{
      title:`🎂 Поздравить с ДР: ${bdName(title)}`,
      period:"day", xp:15, recurring:true, recurType:"year",
    }],
  },
  {
    id:"meeting", icon:"🤝", label:"Встреча", color:T.sky,
    hint:"В делах на день встречи появится задача «Провести встречу».",
    hintColor:T.sky,
    defaultRec:false, defaultRecType:"week",
    makeTasks:(title)=>[{
      title:`🤝 Провести встречу: ${title}`,
      period:"day", xp:20, recurring:false, recurType:"",
    }],
  },
  {
    id:"trip", icon:"✈️", label:"Поездка", color:T.teal,
    hint:"Создадутся три задачи-шаблона: билеты, багаж и жильё.",
    hintColor:T.teal,
    defaultRec:false, defaultRecType:"",
    makeTasks:(title, date)=>[
      { title:`✈️ Купить билеты: ${title}`,        period:"day", xp:30, recurring:false, recurType:"", dueDate:date },
      { title:`🧳 Упаковать чемодан: ${title}`,    period:"day", xp:20, recurring:false, recurType:"", dueDate:date },
      { title:`🏨 Проверить бронирование: ${title}`,period:"day", xp:20, recurring:false, recurType:"", dueDate:date },
    ],
  },
  {
    id:"deadline", icon:"⏰", label:"Дедлайн", color:T.rose,
    hint:"Задача «Сдать» появится в делах на дату дедлайна.",
    hintColor:T.rose,
    defaultRec:false, defaultRecType:"",
    makeTasks:(title)=>[{
      title:`⏰ Сдать: ${title}`,
      period:"day", xp:40, recurring:false, recurType:"",
    }],
  },
  {
    id:"holiday", icon:"🎉", label:"Праздник", color:T.purpL,
    hint:"В этот день появится задача «Отдыхать и наслаждаться!».",
    hintColor:T.purpL,
    defaultRec:true, defaultRecType:"year",
    makeTasks:(title)=>[{
      title:`🎉 ${title} — отдыхать и наслаждаться!`,
      period:"day", xp:10, recurring:true, recurType:"year",
    }],
  },
  {
    id:"health", icon:"🏥", label:"Здоровье", color:"#34D399",
    hint:"Появится задача-напоминание о визите или мероприятии.",
    hintColor:"#34D399",
    defaultRec:false, defaultRecType:"",
    makeTasks:(title)=>[{
      title:`🏥 Визит/мероприятие: ${title}`,
      period:"day", xp:25, recurring:false, recurType:"",
    }],
  },
  {
    id:"custom", icon:"📌", label:"Другое", color:T.sub,
    hint:null,
    defaultRec:false, defaultRecType:"week",
    makeTasks:(title)=>[{
      title, period:"day", xp:15, recurring:false, recurType:"",
    }],
  },
];

// ─── RECURRING AUTO-SPAWN ─────────────────────────────────────────
const spawnRecurring = (tasks, events, day) => {
  const next = [...tasks];
  tasks.filter(t => t.recurring && t.dueDate !== day).forEach(t => {
    const ok = t.recurType==="day"
      || (t.recurType==="week" && new Date(t.dueDate).getDay()===new Date(day).getDay())
      || (t.recurType==="year" && t.dueDate.slice(5)===day.slice(5));
    if (ok && !next.some(x => x.title===t.title && x.dueDate===day))
      next.unshift({...t, id:uid(), done:false, dueDate:day});
  });
  // Spawn tasks from recurring calendar events using EVENT_TYPES templates
  events.filter(e => e.recurring).forEach(ev => {
    const [,em,ed] = ev.date.split("-").map(Number);
    const [,dm,dd] = day.split("-").map(Number);
    const ok = ev.recurType==="day"
      || (ev.recurType==="week" && new Date(ev.date).getDay()===new Date(day).getDay())
      || (ev.recurType==="year" && em===dm && ed===dd);
    if (!ok) return;
    const evTypeDef = EVENT_TYPES.find(t=>t.id===ev.eventType) || EVENT_TYPES.find(t=>t.id==="custom");
    const templates = evTypeDef.makeTasks(ev.title, day);
    templates.forEach(tmpl => {
      if (!next.some(x => x.title===tmpl.title && x.dueDate===day))
        next.unshift({id:uid(), done:false, period:"day", xp:tmpl.xp||15,
          dueDate:day, recurring:true, recurType:ev.recurType, ...tmpl});
    });
  });
  return next;
};

// ─── SHARED COMPONENTS ────────────────────────────────────────────
function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width:44,height:24,borderRadius:12,cursor:"pointer",
      background:value?T.purp:T.dim,position:"relative",transition:"background 0.25s",flexShrink:0,
    }}>
      <div style={{
        position:"absolute",top:3,left:value?23:3,
        width:18,height:18,borderRadius:"50%",background:"#fff",
        transition:"left 0.2s cubic-bezier(.34,1.56,.64,1)",
        boxShadow:"0 1px 4px rgba(0,0,0,0.4)",
      }}/>
    </div>
  );
}

function XPBar({ progress, color=T.purp, height=8 }) {
  return (
    <div style={{height,background:T.brd,borderRadius:height/2,overflow:"hidden"}}>
      <div style={{
        height:"100%",borderRadius:height/2,
        width:`${Math.round(Math.min(progress,1)*100)}%`,
        background:`linear-gradient(90deg,${color},${T.gold})`,
        transition:"width 0.9s cubic-bezier(.34,1.56,.64,1)",
      }}/>
    </div>
  );
}

function PeriodBadge({ period, small }) {
  const p = PERIODS.find(x => x.id===period);
  return (
    <span style={{
      fontSize:small?10:11,fontWeight:600,
      padding:small?"1px 6px":"2px 8px",borderRadius:20,
      background:p.accent+"22",color:p.accent,
      border:`1px solid ${p.accent}44`,letterSpacing:"0.03em",whiteSpace:"nowrap",
    }}>{p.icon} {p.label}</span>
  );
}

function ModalOverlay({ onClose, children }) {
  useEffect(() => { document.body.style.overflow="hidden"; return ()=>{document.body.style.overflow="";}; },[]);
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:100,
      background:"rgba(4,4,20,0.88)",backdropFilter:"blur(6px)",
      display:"flex",alignItems:"flex-end",justifyContent:"center",
    }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:T.bg1,borderRadius:"20px 20px 0 0",
        padding:"8px 16px calc(36px + env(safe-area-inset-bottom,0px))",
        width:"100%",maxWidth:420,
        border:`1px solid ${T.brd}`,borderBottom:"none",
        animation:"slideUp 0.32s cubic-bezier(.34,1.56,.64,1)",
        maxHeight:"90vh",overflowY:"auto",position:"relative",
      }}>
        <div style={{width:40,height:4,borderRadius:2,background:T.brd,margin:"8px auto 16px"}}/>
        {/* ✕ close button */}
        <div onClick={onClose} style={{
          position:"absolute",top:14,right:14,
          width:30,height:30,borderRadius:8,
          background:T.bg2,border:`1px solid ${T.brd}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:16,color:T.sub,
          transition:"all 0.15s",zIndex:10,
        }}
        onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.text;}}
        onMouseLeave={e=>{e.currentTarget.style.background=T.bg2;e.currentTarget.style.color=T.sub;}}
        >✕</div>
        {children}
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{fontSize:11,color:T.sub,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:8}}>{children}</div>;
}

function Btn({ children, onClick, variant="primary", style:s={}, disabled=false }) {
  const base = {padding:"12px 16px",borderRadius:12,cursor:disabled?"not-allowed":"pointer",fontSize:14,fontWeight:700,border:"none",width:"100%",opacity:disabled?0.45:1,transition:"opacity 0.15s"};
  const v = {
    primary:   {background:`linear-gradient(135deg,${T.purp},${T.gold})`,color:"#fff"},
    teal:      {background:`linear-gradient(135deg,${T.teal},${T.sky})`,color:"#04202F"},
    ghost:     {background:"transparent",border:`1px solid ${T.brd}`,color:T.sub},
    danger:    {background:T.rose+"22",border:`1px solid ${T.rose}55`,color:T.rose},
  };
  return <button onClick={disabled?undefined:onClick} style={{...base,...v[variant],...s}}>{children}</button>;
}

function StyledInput({ value, onChange, placeholder, type="text", autoFocus, onKeyDown }) {
  const [focused, setFocused] = useState(false);
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      autoFocus={autoFocus} onKeyDown={onKeyDown}
      onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
      style={{
        width:"100%",padding:"11px 14px",background:T.bg0,
        border:`1px solid ${focused?T.purp:T.brd}`,borderRadius:11,
        color:T.text,fontSize:15,outline:"none",
        transition:"border-color 0.15s",colorScheme:"dark",
      }}/>
  );
}

function RecurPicker({ value, onChange, accentC=T.purp, accentL=T.purpL }) {
  return (
    <div style={{display:"flex",gap:8}}>
      {[["day","Ежедневно"],["week","Еженедельно"],["year","Ежегодно"]].map(([rt,lbl])=>(
        <div key={rt} onClick={()=>onChange(rt)} style={{
          flex:1,padding:"8px 4px",borderRadius:9,cursor:"pointer",
          textAlign:"center",fontSize:12,fontWeight:600,
          border:`1px solid ${value===rt?accentC:T.brd}`,
          background:value===rt?accentC+"33":T.bg0,
          color:value===rt?accentL:T.sub,transition:"all 0.15s",
        }}>{lbl}</div>
      ))}
    </div>
  );
}

// ─── TASK MODAL (create + edit) ───────────────────────────────────
function TaskModal({ onClose, onSave, onDelete, existing=null }) {
  const isEdit = !!existing;
  const [title,    setTitle]  = useState(existing?.title    ?? "");
  const [period,   setPeriod] = useState(existing?.period   ?? "day");
  const [dueDate,  setDate]   = useState(existing?.dueDate  ?? today);
  const [recurring,setRec]    = useState(existing?.recurring ?? false);
  const [recurType,setRT]     = useState(existing?.recurType ?? "day");
  const [bulkMode, setBulk]   = useState(false);
  const [bulkText, setBulkText] = useState("");

  const submit = () => {
    const p = PERIODS.find(x=>x.id===period);
    if (bulkMode && !isEdit) {
      const lines = bulkText.split("\n").map(l=>l.trim()).filter(Boolean);
      if (!lines.length) return;
      lines.forEach(line => onSave({ id:uid(), title:line, period, done:false, xp:p.xp, dueDate, recurring, recurType }));
      onClose();
      return;
    }
    if (!title.trim()) return;
    onSave({ id:existing?.id??uid(), title:title.trim(), period, done:existing?.done??false, xp:p.xp, dueDate, recurring, recurType });
    onClose();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{margin:"0 0 18px",fontSize:18,fontWeight:800,color:isEdit?T.purpL:T.gold}}>
        {isEdit?"✏️ Редактировать квест":"⚔️ Новый квест"}
      </h3>

      {/* Bulk / Single mode tabs (only on create) */}
      {!isEdit && (
        <div style={{display:"flex",gap:6,marginBottom:14,background:T.bg0,borderRadius:11,padding:4,border:`1px solid ${T.brd}`}}>
          {[["single","⚡ Одна задача"],["bulk","📋 Список"]].map(([mode,label])=>(
            <div key={mode} onClick={()=>setBulk(mode==="bulk")} style={{
              flex:1,padding:"8px 0",borderRadius:8,textAlign:"center",
              fontSize:13,fontWeight:700,cursor:"pointer",
              background:bulkMode===(mode==="bulk")?T.purp:"transparent",
              color:bulkMode===(mode==="bulk")?"#fff":T.sub,
              transition:"all 0.2s",
            }}>{label}</div>
          ))}
        </div>
      )}

      <div style={{marginBottom:14}}>
        <SectionLabel>{bulkMode&&!isEdit?"Задачи (каждая строка — новое дело)":"Название задачи"}</SectionLabel>
        {bulkMode && !isEdit ? (
          <textarea
            value={bulkText}
            onChange={e=>setBulkText(e.target.value)}
            placeholder={"Утренняя зарядка\nПрочитать 20 страниц\nОтправить отчёт..."}
            autoFocus
            rows={5}
            style={{
              width:"100%",padding:"11px 14px",background:T.bg0,
              border:`1px solid ${T.purp}`,borderRadius:11,
              color:T.text,fontSize:15,outline:"none",resize:"vertical",
              colorScheme:"dark",fontFamily:"inherit",lineHeight:1.6,
              minHeight:120,
            }}
          />
        ) : (
          <StyledInput value={title} onChange={e=>setTitle(e.target.value)}
            placeholder="Введите задачу..." autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}/>
        )}
        {bulkMode && !isEdit && bulkText.trim() && (
          <div style={{fontSize:11,color:T.teal,marginTop:6,fontWeight:600}}>
            ✓ Будет создано задач: {bulkText.split("\n").filter(l=>l.trim()).length}
          </div>
        )}
      </div>

      <div style={{marginBottom:14}}>
        <SectionLabel>Период</SectionLabel>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {PERIODS.map(p=>(
            <div key={p.id} onClick={()=>setPeriod(p.id)} style={{
              padding:"10px 12px",borderRadius:11,cursor:"pointer",
              border:`2px solid ${period===p.id?p.accent:T.brd}`,
              background:period===p.id?p.accent+"20":T.bg0,transition:"all 0.15s",
            }}>
              <div style={{fontSize:14,fontWeight:700,color:period===p.id?p.accent:T.sub}}>{p.icon} {p.label}</div>
              <div style={{fontSize:11,color:period===p.id?p.accent+"AA":T.dim,marginTop:2}}>+{p.xp} XP</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{marginBottom:14}}>
        <SectionLabel>Срок выполнения</SectionLabel>
        <StyledInput type="date" value={dueDate} onChange={e=>setDate(e.target.value)}/>
      </div>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        marginBottom:recurring?10:18,background:T.bg0,padding:"11px 14px",borderRadius:11,border:`1px solid ${T.brd}`}}>
        <span style={{fontSize:14,color:T.text}}>🔄 Повторяемая задача</span>
        <Toggle value={recurring} onChange={setRec}/>
      </div>

      {recurring && <div style={{marginBottom:18}}><RecurPicker value={recurType} onChange={setRT}/></div>}

      <div style={{display:"flex",gap:10}}>
        <Btn variant="ghost" onClick={onClose} style={{flex:1}}>Отмена</Btn>
        <Btn variant="primary" onClick={submit} style={{flex:2}} disabled={bulkMode&&!isEdit ? !bulkText.trim() : !title.trim()}>
          {isEdit?"Сохранить ✓":bulkMode?"Создать квесты ⚡":"Создать квест ⚡"}
        </Btn>
      </div>
      {isEdit && onDelete && (
        <div style={{marginTop:12}}>
          <Btn variant="danger" onClick={()=>{onDelete(existing.id);onClose();}}>🗑 Удалить квест</Btn>
        </div>
      )}
    </ModalOverlay>
  );
}

// ─── EVENT MODAL ──────────────────────────────────────────────────
function EventModal({ onClose, onCreate, defaultDate }) {
  const [step,   setStep]  = useState("type"); // "type" | "details"
  const [typeId, setTypeId]= useState(null);
  const [title,  setTitle] = useState("");
  const [date,   setDate]  = useState(defaultDate||today);
  const [rec,    setRec]   = useState(false);
  const [rt,     setRT]    = useState("week");
  const [color,  setColor] = useState(T.sky);

  const evType = EVENT_TYPES.find(t=>t.id===typeId);

  // When type selected — apply defaults
  const pickType = (t) => {
    setTypeId(t.id);
    setRec(t.defaultRec);
    setRT(t.defaultRecType||"week");
    setColor(t.color);
    setStep("details");
  };

  const isCustomColor = typeId==="custom";

  const submit = () => {
    if (!title.trim() || !evType) return;
    const isBd = evType.id==="birthday";
    const ev = {
      id:uid(), title:title.trim(), date,
      recurring: rec, recurType: rec ? rt : "",
      color: evType.color,
      isBirthday: isBd,
      eventType: evType.id,
    };
    // Build auto-tasks
    const rawTasks = evType.makeTasks(title.trim(), date);
    const autoTasks = rawTasks.map(t=>({
      id:uid(), done:false,
      dueDate: t.dueDate || date,
      recurring: rec && !["trip"].includes(evType.id),
      recurType: rec && !["trip"].includes(evType.id) ? rt : "",
      ...t,
    }));
    onCreate(ev, autoTasks);
    onClose();
  };

  // ── Step 1: Choose type ──────────────────────────────────────────
  if (step==="type") return (
    <ModalOverlay onClose={onClose}>
      <h3 style={{margin:"0 0 4px",fontSize:18,fontWeight:800,color:T.teal}}>📅 Новое событие</h3>
      <p style={{margin:"0 0 18px",fontSize:13,color:T.sub}}>Выбери тип — оформим автоматически</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9}}>
        {EVENT_TYPES.map(t=>(
          <div key={t.id} onClick={()=>pickType(t)} style={{
            background:`linear-gradient(135deg,${t.color}18,${t.color}08)`,
            border:`1.5px solid ${t.color}44`,
            borderRadius:14, padding:"13px 14px",
            cursor:"pointer", transition:"all 0.15s",
            display:"flex", flexDirection:"column", gap:4,
          }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=t.color}
          onMouseLeave={e=>e.currentTarget.style.borderColor=t.color+"44"}
          >
            <span style={{fontSize:22,lineHeight:1}}>{t.icon}</span>
            <span style={{fontSize:13,fontWeight:700,color:t.color,lineHeight:1.2}}>{t.label}</span>
          </div>
        ))}
      </div>
    </ModalOverlay>
  );

  // ── Step 2: Fill details ─────────────────────────────────────────
  const previewTasks = evType && title.trim() ? evType.makeTasks(title.trim(), date) : [];

  return (
    <ModalOverlay onClose={onClose}>
      {/* Header with back */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div onClick={()=>setStep("type")} style={{
          width:30,height:30,borderRadius:8,background:T.bg2,border:`1px solid ${T.brd}`,
          display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:14,color:T.sub,flexShrink:0,
        }}>‹</div>
        <h3 style={{margin:0,fontSize:17,fontWeight:800,color:evType?.color||T.teal}}>
          {evType?.icon} {evType?.label}
        </h3>
      </div>

      {/* Hint banner */}
      {evType?.hint && (
        <div style={{
          background:evType.hintColor+"15",border:`1px solid ${evType.hintColor}44`,
          borderRadius:11,padding:"9px 13px",marginBottom:14,fontSize:12.5,
          color:evType.hintColor,lineHeight:1.5,
        }}>
          {evType.hint}
        </div>
      )}

      {/* Title */}
      <div style={{marginBottom:14}}>
        <SectionLabel>Название</SectionLabel>
        <StyledInput value={title} onChange={e=>setTitle(e.target.value)}
          placeholder={
            evType?.id==="birthday" ? "ДР Алексея…" :
            evType?.id==="meeting"  ? "Встреча с командой…" :
            evType?.id==="trip"     ? "Поездка в Барселону…" :
            evType?.id==="deadline" ? "Отчёт Q2…" :
            evType?.id==="holiday"  ? "Новый год…" :
            evType?.id==="health"   ? "Приём у врача…" : "Название события…"
          }
          autoFocus onKeyDown={e=>e.key==="Enter"&&submit()}/>
      </div>

      {/* Date */}
      <div style={{marginBottom:14}}>
        <SectionLabel>Дата</SectionLabel>
        <StyledInput type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      </div>

      {/* Color picker — only for "custom" type */}
      {isCustomColor && (
        <div style={{marginBottom:12}}>
          <SectionLabel>Цвет метки</SectionLabel>
          <div style={{display:"flex",gap:10}}>
            {[T.sky, T.purpL, T.teal, T.gold, T.rose].map(c=>(
              <div key={c} onClick={()=>setColor(c)} style={{
                width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",
                border:`3px solid ${color===c?"#fff":"transparent"}`,
                boxShadow:color===c?`0 0 0 1px ${c}`:"none",transition:"all 0.15s",
              }}/>
            ))}
          </div>
        </div>
      )}

      {/* Repeat — hide for birthday (always yearly) and trip (no repeat) */}
      {!["birthday","trip"].includes(typeId) && (
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            marginBottom:rec?10:14,background:T.bg0,padding:"11px 14px",borderRadius:11,border:`1px solid ${T.brd}`}}>
            <span style={{fontSize:14,color:T.text}}>🔄 Повторение</span>
            <Toggle value={rec} onChange={setRec}/>
          </div>
          {rec && <div style={{marginBottom:14}}><RecurPicker value={rt} onChange={setRT} accentC={evType?.color||T.teal} accentL={evType?.color||T.teal}/></div>}
        </>
      )}

      {/* Preview of auto-tasks */}
      {previewTasks.length > 0 && (
        <div style={{
          background:T.bg0,border:`1px solid ${T.brd}`,borderRadius:11,
          padding:"10px 13px",marginBottom:16,
        }}>
          <div style={{fontSize:11,fontWeight:700,color:T.sub,letterSpacing:"0.06em",marginBottom:7,textTransform:"uppercase"}}>
            Автозадачи на {date===today?"сегодня":fmtDate(date)}
          </div>
          {previewTasks.map((t,i)=>(
            <div key={i} style={{fontSize:13,color:T.text,padding:"3px 0",borderBottom:i<previewTasks.length-1?`1px solid ${T.brd}`:"none"}}>
              {t.title}
            </div>
          ))}
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        <Btn variant="ghost" onClick={onClose} style={{flex:1}}>Отмена</Btn>
        <Btn onClick={submit} style={{flex:2,background:`linear-gradient(135deg,${evType?.color||T.teal},${evType?.color||T.teal}99)`,color:"#07071C",fontWeight:800,border:"none",opacity:title.trim()?1:0.5}} disabled={!title.trim()}>
          Добавить ✨
        </Btn>
      </div>
    </ModalOverlay>
  );
}

// ─── TASK CARD ────────────────────────────────────────────────────
function TaskCard({ task, onToggle, onEdit }) {
  const p = PERIODS.find(x=>x.id===task.period);
  const [flash, setFlash] = useState(false);

  const handleCheck = e => {
    e.stopPropagation();
    if (!task.done) { setFlash(true); setTimeout(()=>setFlash(false),600); }
    onToggle(task.id);
  };

  return (
    <div onClick={onEdit} style={{
      background:flash?p.accent+"22":task.done?T.bg2+"88":T.bg2,
      border:`1px solid ${task.done?T.brdDim:T.brd}`,
      borderRadius:13,padding:"13px 14px",
      display:"flex",alignItems:"center",gap:12,
      transition:"all 0.3s ease",opacity:task.done?0.6:1,
      marginBottom:8,cursor:"pointer",
    }}>
      <div onClick={handleCheck} style={{
        width:30,height:30,borderRadius:"50%",
        border:`2.5px solid ${task.done?p.accent:T.dim}`,
        background:task.done?p.accent:"transparent",
        cursor:"pointer",flexShrink:0,
        display:"flex",alignItems:"center",justifyContent:"center",
        transition:"all 0.25s cubic-bezier(.34,1.56,.64,1)",
        boxShadow:task.done?`0 0 10px ${p.accent}66`:"none",
      }}>
        {task.done && <span style={{fontSize:15,color:"#000",fontWeight:900}}>✓</span>}
      </div>

      <div style={{flex:1,minWidth:0}}>
        <div style={{
          fontSize:15,fontWeight:500,
          color:task.done?T.sub:T.text,
          textDecoration:task.done?"line-through":"none",
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",
          marginBottom:5,
        }}>{task.title}</div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <PeriodBadge period={task.period} small/>
          <span style={{fontSize:11,color:T.gold,fontWeight:700}}>+{task.xp} XP</span>
          {task.recurring && <span style={{fontSize:10,color:T.dim}}>🔄</span>}
          {task.dueDate && task.dueDate!==today && (
            <span style={{fontSize:10,color:T.sub}}>📅 {fmtDate(task.dueDate)}</span>
          )}
        </div>
      </div>
      <span style={{color:T.dim,fontSize:18,flexShrink:0}}>›</span>
    </div>
  );
}

// ─── TASKS SCREEN ─────────────────────────────────────────────────
function TasksScreen({ tasks, onToggle, onSave, onDelete, xp }) {
  const [filter,setFilter]   = useState("day");
  const [showCreate,setCreate] = useState(false);
  const [editTask,setEdit]   = useState(null);

  const filtered  = tasks.filter(t=>t.period===filter);
  const done      = filtered.filter(t=>t.done).length;
  const total     = filtered.length;
  const pct       = total>0?done/total:0;
  const p         = PERIODS.find(x=>x.id===filter);

  return (
    // ✅ FIX: position:relative so the FAB absolute-positions correctly
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>

      {/* Period filter tabs */}
      <div style={{display:"flex",gap:5,padding:"14px 16px 10px"}}>
        {PERIODS.map(pd=>(
          <div key={pd.id} onClick={()=>setFilter(pd.id)} style={{
            flex:1,padding:"7px 2px",borderRadius:20,cursor:"pointer",
            fontWeight:700,fontSize:12,textAlign:"center",whiteSpace:"nowrap",
            background:filter===pd.id?pd.accent:T.bg2,
            color:filter===pd.id?(pd.id==="month"?"#fff":"#000"):T.sub,
            border:`1px solid ${filter===pd.id?pd.accent:T.brd}`,
            transition:"all 0.2s",boxShadow:filter===pd.id?`0 2px 12px ${pd.accent}55`:"none",
          }}>{pd.icon} {pd.label}</div>
        ))}
      </div>

      {/* Progress banner */}
      <div style={{margin:"4px 16px 12px",background:T.bg2,borderRadius:14,padding:"14px 16px",border:`1px solid ${T.brd}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:8}}>
          <div>
            <div style={{fontSize:12,color:T.sub,marginBottom:2}}>Прогресс {p.desc}</div>
            <div style={{fontSize:22,fontWeight:800,color:p.accent}}>
              {done}<span style={{fontSize:14,color:T.sub,fontWeight:400}}>/{total} квестов</span>
            </div>
          </div>
          <div style={{fontSize:13,color:T.gold,fontWeight:700}}>{Math.round(pct*100)}%</div>
        </div>
        <XPBar progress={pct} color={p.accent} height={6}/>
      </div>

      {/* List */}
      <div style={{flex:1,overflowY:"auto",padding:"0 16px",WebkitOverflowScrolling:"touch"}}>
        {filtered.length===0 ? (
          <div style={{textAlign:"center",padding:"40px 0",color:T.dim}}>
            <div style={{fontSize:40,marginBottom:12}}>🗡️</div>
            <div style={{fontSize:15,fontWeight:600,color:T.sub}}>Нет активных квестов</div>
            <div style={{fontSize:13,marginTop:4}}>Нажми + чтобы создать задачу</div>
          </div>
        ) : (
          <>
            {filtered.filter(t=>!t.done).map(t=>(
              <TaskCard key={t.id} task={t} onToggle={onToggle} onEdit={()=>setEdit(t)}/>
            ))}
            {filtered.some(t=>t.done) && (
              <div style={{marginTop:12}}>
                <div style={{fontSize:11,color:T.dim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontWeight:700}}>✓ Выполнено</div>
                {filtered.filter(t=>t.done).map(t=>(
                  <TaskCard key={t.id} task={t} onToggle={onToggle} onEdit={()=>setEdit(t)}/>
                ))}
              </div>
            )}
          </>
        )}
        <div style={{height:100}}/>
      </div>

      {/* Mini header bar at bottom of Квесты tab */}
      <div style={{
        padding:"8px 16px",background:T.bg1,borderTop:`1px solid ${T.brd}`,flexShrink:0,
      }}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
          <div>
            <div style={{fontSize:16,fontWeight:900,letterSpacing:"-0.03em"}}>
              <span style={{color:T.gold}}>Q</span><span style={{color:T.text}}>uestly</span>
              <span style={{fontSize:10,color:T.sub,fontWeight:400,marginLeft:6,letterSpacing:"0.04em"}}>RPG-трекер задач</span>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:11,color:T.sub}}>Ур.{lvlOf(xp)}</span>
            <span style={{fontSize:12,fontWeight:800,color:T.purpL}}>{RANK_ICONS[Math.min(lvlOf(xp)-1,RANK_ICONS.length-1)]} {RANKS[Math.min(lvlOf(xp)-1,RANKS.length-1)]}</span>
            <span style={{fontSize:11,color:T.gold,fontWeight:700}}>⚡ {xp.toLocaleString()} XP</span>
          </div>
        </div>
        <XPBar progress={progOf(xp)} height={3}/>
      </div>

      {/* FAB — correctly positioned inside relative parent */}
      <div style={{position:"absolute",bottom:16,right:16,zIndex:10}}>
        <div onClick={()=>setCreate(true)} style={{
          width:56,height:56,borderRadius:"50%",cursor:"pointer",
          background:`linear-gradient(135deg,${T.purp},${T.gold})`,
          display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:28,color:"#fff",boxShadow:`0 4px 20px ${T.purp}66`,
          transition:"transform 0.2s cubic-bezier(.34,1.56,.64,1)",
        }}>+</div>
      </div>

      {showCreate && <TaskModal onClose={()=>setCreate(false)} onSave={t=>{onSave(t);setCreate(false);}}/>}
      {editTask   && <TaskModal existing={editTask} onClose={()=>setEdit(null)} onSave={t=>{onSave(t);setEdit(null);}} onDelete={id=>{onDelete(id);setEdit(null);}}/>}
    </div>
  );
}

// ─── CALENDAR GRID ────────────────────────────────────────────────
function CalendarGrid({ year, month, events, selectedDate, onSelect }) {
  const first   = new Date(year,month,1);
  const last    = new Date(year,month+1,0);
  const startDow = (first.getDay()+6)%7;
  const cells   = Array(startDow).fill(null).concat(Array.from({length:last.getDate()},(_,i)=>i+1));

  const evMap = {};
  events.forEach(ev => {
    const add = d => { if (!evMap[d]) evMap[d]=[]; if (!evMap[d].find(e=>e.id===ev.id)) evMap[d].push(ev); };
    const [ey,em,ed] = ev.date.split("-").map(Number);
    if (ey===year && em===month+1) add(ed);
    if (ev.recurring && ev.recurType==="year" && em===month+1) add(ed);
    if (ev.recurring && ev.recurType==="week") {
      const dow = new Date(ev.date).getDay();
      for (let d=1; d<=last.getDate(); d++) if (new Date(year,month,d).getDay()===dow) add(d);
    }
    if (ev.recurring && ev.recurType==="day") for (let d=1;d<=last.getDate();d++) add(d);
  });

  const now=new Date(), tD=now.getDate(), tM=now.getMonth(), tY=now.getFullYear();
  const isThisMonth = month===tM && year===tY;
  const selDay = selectedDate ? parseInt(selectedDate.split("-")[2]) : null;
  const selSame = selectedDate && parseInt(selectedDate.split("-")[1])-1===month && parseInt(selectedDate.split("-")[0])===year;

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:3}}>
        {WDAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:T.sub,fontWeight:700,padding:"2px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((day,i) => {
          if (!day) return <div key={`e${i}`}/>;
          const isToday = isThisMonth && day===tD;
          const isSel   = selSame && day===selDay;
          const evs     = evMap[day]||[];
          const colors  = [...new Set(evs.slice(0,3).map(e=>e.color))];
          const hasBd   = evs.some(e=>e.isBirthday);
          return (
            <div key={day} onClick={()=>{
              onSelect(`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`);
            }} style={{
              height:38,borderRadius:8,cursor:"pointer",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              background:isSel?T.purp:isToday?T.bg3:"transparent",
              border:isToday&&!isSel?`1.5px solid ${T.purp}`:"1.5px solid transparent",
              transition:"all 0.15s",
            }}>
              <span style={{
                fontSize:12,fontWeight:isToday?800:400,lineHeight:1,
                color:isSel?"#fff":isToday?T.purpL:hasBd?T.gold:T.text,
              }}>{day}</span>
              {colors.length>0 && (
                <div style={{display:"flex",gap:2,marginTop:2}}>
                  {colors.map((c,ci)=><div key={ci} style={{width:3,height:3,borderRadius:"50%",background:c}}/>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CALENDAR SCREEN ──────────────────────────────────────────────
function CalendarScreen({ events, tasks, onAddEvent }) {
  const now=new Date();
  const [month,setMonth]   = useState(now.getMonth());
  const [year,setYear]     = useState(now.getFullYear());
  const [selDate,setSel]   = useState(today);
  const [showModal,setModal] = useState(false);

  const prev = () => { if (month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); };
  const next = () => { if (month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); };

  const selEvents = events.filter(ev => {
    if (ev.date===selDate) return true;
    const [,em,ed]=ev.date.split("-").map(Number), [,sm,sd]=selDate.split("-").map(Number);
    if (ev.recurring && ev.recurType==="year" && em===sm && ed===sd) return true;
    if (ev.recurring && ev.recurType==="week") return new Date(ev.date).getDay()===new Date(selDate).getDay();
    if (ev.recurring && ev.recurType==="day") return true;
    return false;
  });
  const selTasks = tasks.filter(t=>t.dueDate===selDate);

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px 6px"}}>
        <div onClick={prev} style={{width:32,height:32,borderRadius:"50%",background:T.bg2,border:`1px solid ${T.brd}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16,color:T.sub}}>‹</div>
        <div style={{fontWeight:800,fontSize:16,color:T.text}}>{MONTHS_RU[month]} {year}</div>
        <div onClick={next} style={{width:32,height:32,borderRadius:"50%",background:T.bg2,border:`1px solid ${T.brd}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16,color:T.sub}}>›</div>
      </div>

      <div style={{padding:"0 12px 8px"}}>
        <CalendarGrid year={year} month={month} events={events} selectedDate={selDate} onSelect={setSel}/>
      </div>

      <div style={{height:1,background:T.brd}}/>

      <div style={{flex:1,overflowY:"auto",padding:"12px 16px",WebkitOverflowScrolling:"touch"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{fontSize:14,fontWeight:700,color:T.text}}>
            {selDate===today?"📅 Сегодня":`📅 ${fmtDate(selDate)}`}
          </div>
          <div onClick={()=>setModal(true)} style={{
            padding:"6px 14px",borderRadius:20,cursor:"pointer",fontSize:12,fontWeight:700,
            background:T.teal+"22",color:T.teal,border:`1px solid ${T.teal}55`,
          }}>+ Событие</div>
        </div>

        {selEvents.length===0 && selTasks.length===0 ? (
          <div style={{textAlign:"center",padding:"30px 0",color:T.dim}}>
            <div style={{fontSize:36,marginBottom:8}}>📅</div>
            <div style={{fontSize:14}}>Нет событий в этот день</div>
          </div>
        ) : (
          <>
            {selEvents.map(ev=>(
              <div key={ev.id} style={{
                background:T.bg2,border:`1px solid ${ev.color}44`,borderLeft:`4px solid ${ev.color}`,
                borderRadius:11,padding:"11px 14px",marginBottom:8,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <span style={{fontSize:20}}>{(()=>{const t=EVENT_TYPES.find(t=>t.id===ev.eventType);return t?t.icon:"📌";})()}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:600,color:T.text}}>{ev.title}</div>
                  <div style={{fontSize:11,color:T.sub,marginTop:2}}>
                    {ev.recurring?`🔄 ${ev.recurType==="year"?"Ежегодно":ev.recurType==="week"?"Еженедельно":"Ежедневно"}`:"Разовое"}
                  </div>
                </div>
              </div>
            ))}
            {selTasks.length>0 && (
              <div style={{fontSize:11,color:T.dim,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontWeight:700}}>Квесты на этот день</div>
            )}
            {selTasks.map(t=>(
              <div key={t.id} style={{
                background:T.bg2,border:`1px solid ${T.brd}`,borderRadius:11,padding:"11px 14px",marginBottom:8,
                display:"flex",alignItems:"center",gap:10,
              }}>
                <div style={{
                  width:22,height:22,borderRadius:"50%",
                  background:t.done?T.teal+"44":"transparent",border:`2px solid ${t.done?T.teal:T.dim}`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,
                }}>{t.done&&"✓"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,color:t.done?T.sub:T.text,textDecoration:t.done?"line-through":"none"}}>{t.title}</div>
                  <div style={{fontSize:11,color:T.gold,marginTop:2,fontWeight:700}}>+{t.xp} XP</div>
                </div>
                <PeriodBadge period={t.period} small/>
              </div>
            ))}
          </>
        )}
        <div style={{height:20}}/>
      </div>
      {showModal && <EventModal onClose={()=>setModal(false)} onCreate={onAddEvent} defaultDate={selDate}/>}
    </div>
  );
}

// ─── PROFILE SCREEN ───────────────────────────────────────────────
function ProfileScreen({ xp, tasks, events }) {
  const level=lvlOf(xp), rank=RANKS[Math.min(level-1,RANKS.length-1)];
  const rankIcon=RANK_ICONS[Math.min(level-1,RANK_ICONS.length-1)];
  const toNext=nextXP(xp), completed=tasks.filter(t=>t.done).length, total=tasks.length;

  const ACHIEVEMENTS = [
    {icon:"⚡",label:"Первый шаг",    desc:"Выполни 1 задачу",         done:completed>=1},
    {icon:"🔥",label:"На волне",      desc:"Выполни 5 задач",           done:completed>=5},
    {icon:"💎",label:"Целеустремлён", desc:"Создай 10 задач",           done:total>=10},
    {icon:"👑",label:"Годовой план",  desc:"Добавь годовую цель",       done:tasks.some(t=>t.period==="year")},
    {icon:"🎂",label:"Не забуду",     desc:"Добавь день рождения",      done:events.some(e=>e.isBirthday)},
    {icon:"🔄",label:"Привычка",      desc:"Создай повторяемую задачу", done:tasks.some(t=>t.recurring)},
  ];

  return (
    <div style={{flex:1,overflowY:"auto",padding:"14px 16px",WebkitOverflowScrolling:"touch"}}>
      {/* Character card */}
      <div style={{background:`linear-gradient(145deg,${T.bg2},${T.bg3})`,border:`1px solid ${T.brd}`,borderRadius:20,padding:"20px",marginBottom:16,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:T.purp+"22",filter:"blur(30px)",pointerEvents:"none"}}/>
        <div style={{position:"absolute",bottom:-20,left:-20,width:80,height:80,borderRadius:"50%",background:T.gold+"22",filter:"blur(20px)",pointerEvents:"none"}}/>

        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18}}>
          <div style={{width:64,height:64,borderRadius:18,background:`linear-gradient(135deg,${T.purpDim},${T.bg3})`,border:`2px solid ${T.purp}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,boxShadow:`0 0 20px ${T.purp}44`}}>{rankIcon}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,color:T.sub,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700}}>Уровень {level}</div>
            <div style={{fontSize:22,fontWeight:900,color:T.text,lineHeight:1.1}}>
              {tg?.initDataUnsafe?.user?.first_name || "Герой"}
            </div>
            <div style={{fontSize:14,color:T.purpL,fontWeight:600}}>{rank}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:24,fontWeight:900,color:T.gold,lineHeight:1}}>{xp.toLocaleString()}</div>
            <div style={{fontSize:11,color:T.goldDim}}>очков опыта</div>
          </div>
        </div>

        <div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:12,color:T.sub}}>До уровня {level+1}</span>
            <span style={{fontSize:12,color:T.gold,fontWeight:700}}>{toNext>0?`ещё ${toNext} XP`:"Максимум!"}</span>
          </div>
          <XPBar progress={progOf(xp)} color={T.purp} height={10}/>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[
          {label:"Выполнено",     value:completed,                         icon:"✅",color:T.teal},
          {label:"Всего квестов", value:total,                             icon:"📜",color:T.sky},
          {label:"Событий",       value:events.length,                     icon:"📅",color:T.purpL},
          {label:"Дней рождений", value:events.filter(e=>e.isBirthday).length,icon:"🎂",color:T.gold},
        ].map(s=>(
          <div key={s.label} style={{background:T.bg2,border:`1px solid ${T.brd}`,borderRadius:13,padding:"14px 16px"}}>
            <div style={{fontSize:20,marginBottom:6}}>{s.icon}</div>
            <div style={{fontSize:26,fontWeight:800,color:s.color,lineHeight:1}}>{s.value}</div>
            <div style={{fontSize:12,color:T.sub,marginTop:4}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* By period */}
      <div style={{background:T.bg2,border:`1px solid ${T.brd}`,borderRadius:14,padding:"16px",marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>📊 Выполнено по периодам</div>
        {PERIODS.map(p=>{
          const cnt=tasks.filter(t=>t.period===p.id&&t.done).length;
          const tot=tasks.filter(t=>t.period===p.id).length;
          return (
            <div key={p.id} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:13,color:p.accent}}>{p.icon} {p.label}</span>
                <span style={{fontSize:12,color:T.sub}}>{cnt}/{tot}</span>
              </div>
              <XPBar progress={tot>0?cnt/tot:0} color={p.accent} height={5}/>
            </div>
          );
        })}
      </div>

      {/* Achievements */}
      <div style={{background:T.bg2,border:`1px solid ${T.brd}`,borderRadius:14,padding:"16px",marginBottom:16}}>
        <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>🏆 Достижения</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {ACHIEVEMENTS.map(a=>(
            <div key={a.label} style={{
              background:a.done?T.gold+"22":T.bg3,
              border:`1px solid ${a.done?T.gold+"55":T.brdDim}`,
              borderRadius:11,padding:"12px",opacity:a.done?1:0.45,transition:"all 0.3s",
            }}>
              <div style={{fontSize:22,marginBottom:4}}>{a.icon}</div>
              <div style={{fontSize:12,fontWeight:700,color:a.done?T.gold:T.sub}}>{a.label}</div>
              <div style={{fontSize:10,color:T.dim,marginTop:2}}>{a.desc}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{height:20}}/>
    </div>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────
export default function App() {
  const saved = loadState();
  const [xp,     setXP]    = useState(saved?.xp     ?? 340);
  const [tasks,  setTasks] = useState(saved?.tasks   ?? INIT_TASKS);
  const [events, setEvts]  = useState(saved?.events  ?? INIT_EVENTS);
  const [tab,    setTab]   = useState("tasks");
  const [xpAnim,  setXPAnim]  = useState(null);
  const [lvlUpAnim,setLvlUp] = useState(false);
  const prevLvlRef = useRef(lvlOf(saved?.xp??340));

  // Spawn recurring tasks once on mount
  useEffect(() => {
    setTasks(prev => spawnRecurring(prev, events, today));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change
  useEffect(() => { saveState({xp,tasks,events}); }, [xp,tasks,events]);

  const level = lvlOf(xp);

  // ✅ FIX: functional setXP prevents stale closure on rapid taps
  const handleToggle = useCallback(id => {
    setTasks(prev => prev.map(t => {
      if (t.id!==id) return t;
      if (!t.done) {
        setXP(prev => {
          const newXP = prev + t.xp;
          const newLvl = lvlOf(newXP);
          if (newLvl > prevLvlRef.current) {
            setLvlUp(true); setTimeout(()=>setLvlUp(false),3000);
            prevLvlRef.current = newLvl;
          }
          return newXP;
        });
        setXPAnim({amount:t.xp});
        setTimeout(()=>setXPAnim(null),2200);
      }
      return {...t,done:!t.done};
    }));
  },[]);

  // Handles both create (no existing id) and edit (existing id)
  const handleSave = useCallback(task => {
    setTasks(prev => {
      const idx = prev.findIndex(t=>t.id===task.id);
      if (idx===-1) return [task,...prev];
      const upd=[...prev]; upd[idx]={...prev[idx],...task}; return upd;
    });
  },[]);

  const handleDelete   = useCallback(id => setTasks(p=>p.filter(t=>t.id!==id)),[]);
  const handleAddEvent = useCallback((ev, autoTasks)=>{
    if(ev) setEvts(p=>[ev,...p]);
    if(autoTasks?.length) setTasks(p=>[...autoTasks,...p]);
  },[]);

  const TABS = [
    {id:"tasks",    label:"Квесты",    icon:"⚔️"},
    {id:"calendar", label:"Календарь", icon:"📅"},
    {id:"profile",  label:"Герой",     icon:"🧙"},
  ];

  return (
    <div style={{
      width:"100%",maxWidth:420,margin:"0 auto",
      background:T.bg0,minHeight:"100vh",maxHeight:"100vh",
      fontFamily:"'Segoe UI Variable','Segoe UI',system-ui,-apple-system,sans-serif",
      color:T.text,display:"flex",flexDirection:"column",
      position:"relative",overflow:"hidden",
    }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.7);cursor:pointer;}
        input[type=date]{color-scheme:dark;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:${T.brd};border-radius:2px;}
        @keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes xpFloat{0%{opacity:0;transform:translateY(10px) scale(.7)}15%{opacity:1;transform:translateY(-5px) scale(1.2)}70%{opacity:1;transform:translateY(-50px) scale(1)}100%{opacity:0;transform:translateY(-80px) scale(.8)}}
        @keyframes lvlGlow{0%,100%{opacity:0;transform:scale(.8)}20%,80%{opacity:1;transform:scale(1)}}
        @keyframes sparkle{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.1)}100%{transform:rotate(360deg) scale(1)}}
      `}</style>

      {/* XP toast */}
      {xpAnim && (
        <div style={{position:"fixed",top:"25%",left:"50%",transform:"translateX(-50%)",zIndex:300,pointerEvents:"none",textAlign:"center",animation:"xpFloat 2.2s ease forwards"}}>
          <div style={{fontSize:32,fontWeight:900,color:T.gold,textShadow:`0 0 30px ${T.gold},0 0 60px ${T.gold}88`}}>+{xpAnim.amount} XP</div>
          <div style={{fontSize:14,color:T.goldL,marginTop:2}}>✨ Квест выполнен!</div>
        </div>
      )}

      {/* Level up overlay */}
      {lvlUpAnim && (
        <div style={{position:"fixed",inset:0,zIndex:200,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center",animation:"lvlGlow 3s ease forwards",background:"rgba(139,92,246,0.15)"}}>
          <div style={{background:T.bg1,border:`2px solid ${T.gold}`,borderRadius:20,padding:"28px 40px",textAlign:"center",boxShadow:`0 0 60px ${T.purp}88`}}>
            <div style={{fontSize:48,marginBottom:8,animation:"sparkle 1s ease"}}>⭐</div>
            <div style={{fontSize:13,color:T.sub,textTransform:"uppercase",letterSpacing:"0.1em"}}>Новый уровень</div>
            <div style={{fontSize:36,fontWeight:900,color:T.gold}}>Уровень {level}</div>
            <div style={{fontSize:16,color:T.purpL,marginTop:4}}>{RANKS[Math.min(level-1,RANKS.length-1)]}</div>
          </div>
        </div>
      )}

      {/* Safe area top spacer */}
      <div style={{height:"env(safe-area-inset-top,0px)",background:T.bg0,flexShrink:0}}/>

      {/* Screen */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
        {tab==="tasks"    && <TasksScreen    tasks={tasks}  onToggle={handleToggle} onSave={handleSave}   onDelete={handleDelete} xp={xp}/>}
        {tab==="calendar" && <CalendarScreen events={events} tasks={tasks}           onAddEvent={handleAddEvent}/>}
        {tab==="profile"  && <ProfileScreen  xp={xp}        tasks={tasks}           events={events}/>}
      </div>

      {/* Bottom nav */}
      <div style={{display:"flex",background:T.bg1,borderTop:`1px solid ${T.brd}`,flexShrink:0,paddingBottom:"env(safe-area-inset-bottom,8px)"}}>
        {TABS.map(t=>(
          <div key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"10px 0",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <div style={{fontSize:22,transform:tab===t.id?"scale(1.15)":"scale(1)",transition:"transform 0.2s cubic-bezier(.34,1.56,.64,1)"}}>{t.icon}</div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.03em",color:tab===t.id?T.purpL:T.dim,transition:"color 0.2s"}}>{t.label}</div>
            {tab===t.id && <div style={{width:20,height:3,borderRadius:2,background:T.purp,marginTop:1}}/>}
          </div>
        ))}
      </div>
    </div>
  );
}
