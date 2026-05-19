import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../theme";

// ── Global keyframes injector ────────────────────────────────────────
const injectedStyles = new Set();
export function injectCSS(id, css) {
  if (injectedStyles.has(id)) return;
  injectedStyles.add(id);
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

injectCSS("vault-base", `
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body, #root { height: 100%; background: ${T.bg0}; color: ${T.text}; font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  ::-webkit-scrollbar { width: 0; height: 0; }
  input, button, textarea, select { font-family: inherit; }
  @keyframes skeletonPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes slideUp {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes slideDown {
    from { transform: translateY(0);   opacity: 1; }
    to   { transform: translateY(100%); opacity: 0; }
  }
  @keyframes toastIn {
    0%   { transform: translateY(100px); opacity: 0; }
    60%  { transform: translateY(-8px);  opacity: 1; }
    100% { transform: translateY(0);     opacity: 1; }
  }
  @keyframes toastOut {
    from { transform: translateY(0);    opacity: 1; }
    to   { transform: translateY(100px); opacity: 0; }
  }
  @keyframes fabPulse {
    0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
    70%  { box-shadow: 0 0 0 12px rgba(16,185,129,0); }
    100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes confetti {
    0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(-60px) rotate(720deg); opacity: 0; }
  }
  @keyframes ringPulse {
    0%   { transform: scale(1);    opacity: 0.8; }
    100% { transform: scale(1.5);  opacity: 0; }
  }
  @keyframes ticker {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
  @keyframes barFill {
    from { width: 0; }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`);

// ── Button ────────────────────────────────────────────────────────────
export function Button({ children, onClick, variant = "primary", style: s, disabled, small, full }) {
  const [pressed, setPressed] = useState(false);

  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    gap: 6, cursor: disabled ? "not-allowed" : "pointer", border: "none",
    borderRadius: 12, fontWeight: 600, transition: "opacity 0.15s",
    opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
    transform: pressed ? "scale(0.97)" : "scale(1)",
    userSelect: "none",
    ...(full ? { width: "100%" } : {}),
    ...(small ? { padding: "8px 16px", fontSize: 13 } : { padding: "14px 22px", fontSize: 15 }),
  };

  const variants = {
    primary: { background: T.em, color: "#fff" },
    danger:  { background: T.red, color: "#fff" },
    ghost:   { background: "transparent", color: T.text, border: `1px solid ${T.brd}` },
    gold:    { background: T.gold, color: "#000" },
    dim:     { background: T.bg3, color: T.muted },
  };

  return (
    <button
      style={{ ...base, ...variants[variant], ...s }}
      onClick={!disabled ? onClick : undefined}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      {children}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────────────────
export function Card({ children, style: s, accent, onClick }) {
  const [pressed, setPressed] = useState(false);
  return (
    <div
      style={{
        background: T.bg2, borderRadius: 14, border: `1px solid ${T.brd}`,
        padding: 16, position: "relative", overflow: "hidden",
        ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
        ...(onClick ? { cursor: "pointer", transform: pressed ? "scale(0.98)" : "scale(1)", transition: "transform 0.1s" } : {}),
        animation: "fadeIn 0.2s ease",
        ...s,
      }}
      onClick={onClick}
      onPointerDown={onClick ? () => setPressed(true) : undefined}
      onPointerUp={onClick ? () => setPressed(false) : undefined}
      onPointerLeave={onClick ? () => setPressed(false) : undefined}
    >
      {children}
    </div>
  );
}

// ── BottomSheet ──────────────────────────────────────────────────────
export function BottomSheet({ open, onClose, children, title, maxHeight = "92vh" }) {
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => setAnimating(true));
    } else {
      setAnimating(false);
      const t = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: `rgba(0,0,0,${animating ? 0.6 : 0})`,
        transition: "background 0.3s", display: "flex",
        alignItems: "flex-end",
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", background: T.bg1,
          borderRadius: "20px 20px 0 0",
          border: `1px solid ${T.brd}`, borderBottom: "none",
          transform: animating ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0.72,0,1)",
          maxHeight, overflow: "hidden", display: "flex", flexDirection: "column",
        }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.brd }} />
        </div>
        {title && (
          <div style={{
            padding: "12px 20px 8px", fontSize: 17, fontWeight: 700,
            color: T.text, borderBottom: `1px solid ${T.brdDim}`,
          }}>
            {title}
          </div>
        )}
        <div style={{ overflowY: "auto", flex: 1, padding: "0 0 env(safe-area-inset-bottom)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────
export function Skeleton({ width, height = 20, style: s, borderRadius = 8 }) {
  return (
    <div
      style={{
        background: T.bg3, borderRadius,
        width: width || "100%", height,
        animation: "skeletonPulse 1.5s ease-in-out infinite",
        ...s,
      }}
    />
  );
}

// ── XPBar ────────────────────────────────────────────────────────────
export function XPBar({ xp, level, nextLevelXp, currentLevelXp, style: s }) {
  const pct = nextLevelXp > 0
    ? Math.min(100, ((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100)
    : 100;

  return (
    <div style={{ ...s }}>
      <div style={{
        height: 8, background: T.bg3, borderRadius: 4, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${T.em}, ${T.emL})`,
          borderRadius: 4, transition: "width 0.6s ease",
          animation: "barFill 0.8s ease",
        }} />
      </div>
    </div>
  );
}

// ── AnimatedNumber ────────────────────────────────────────────────────
export function AnimatedNumber({ value, duration = 500, style: s, prefix = "", suffix = "" }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (start === end) return;
    prevRef.current = end;

    const startTime = performance.now();
    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(start + (end - start) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return (
    <span style={{ fontVariantNumeric: "tabular-nums", ...s }}>
      {prefix}{displayed.toLocaleString("ru-RU")}{suffix}
    </span>
  );
}

// ── Ticker ────────────────────────────────────────────────────────────
export function Ticker({ items }) {
  const [paused, setPaused] = useState(false);
  if (!items || items.length === 0) return null;

  const doubled = [...items, ...items];

  return (
    <div
      style={{
        overflow: "hidden", height: 32,
        maskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
      }}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerLeave={() => setPaused(false)}
    >
      <div
        style={{
          display: "flex", gap: 8, alignItems: "center",
          width: "max-content",
          animation: `ticker ${Math.max(20, items.length * 4)}s linear infinite`,
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {doubled.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              background: T.bg3, borderRadius: 8, padding: "4px 10px",
              fontSize: 12, color: T.muted, whiteSpace: "nowrap",
              border: `1px solid ${T.brdDim}`,
            }}
          >
            <span>{item.icon}</span>
            <span style={{ color: T.text, fontWeight: 500 }}>{item.name}</span>
            <span style={{ fontVariantNumeric: "tabular-nums", color: T.em }}>{item.amount}</span>
            {item.change !== undefined && (
              <span style={{ color: item.change >= 0 ? T.red : T.em }}>
                {item.change >= 0 ? "↑" : "↓"}{Math.abs(item.change)}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Toast ────────────────────────────────────────────────────────────
export function Toast({ message, type = "info", onClose }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(onClose, 300);
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  const colors = { info: T.em, error: T.red, warning: T.gold, success: T.em };
  const color = colors[type] || T.em;

  return (
    <div
      style={{
        position: "fixed", bottom: 90, left: 16, right: 16, zIndex: 2000,
        background: T.bg1, borderRadius: 14, border: `1px solid ${color}40`,
        padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
        animation: leaving ? "toastOut 0.3s ease forwards" : "toastIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
        cursor: "pointer",
      }}
      onClick={() => { setLeaving(true); setTimeout(onClose, 300); }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: "50%", background: `${color}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, flexShrink: 0,
      }}>
        {type === "error" ? "❌" : type === "warning" ? "⚠️" : "✅"}
      </div>
      <span style={{ fontSize: 14, color: T.text, fontWeight: 500 }}>{message}</span>
    </div>
  );
}

// ── AchievementToast ──────────────────────────────────────────────────
export function AchievementToast({ achievement, onClose }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(onClose, 300);
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  const confettiColors = [T.gold, T.em, T.cyan, T.emL, T.goldL];
  const confetti = Array.from({ length: 16 }, (_, i) => ({
    color: confettiColors[i % confettiColors.length],
    x: Math.random() * 60 - 10,
    delay: Math.random() * 0.3,
    size: 4 + Math.random() * 4,
  }));

  return (
    <div
      style={{
        position: "fixed", bottom: 90, left: 16, right: 16, zIndex: 2000,
        background: T.bg1, borderRadius: 16,
        border: `1px solid ${T.gold}50`,
        padding: "14px 16px", display: "flex", alignItems: "center", gap: 14,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${T.gold}20`,
        animation: leaving ? "toastOut 0.3s ease forwards" : "toastIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275) forwards",
        cursor: "pointer",
      }}
      onClick={() => { setLeaving(true); setTimeout(onClose, 300); }}
    >
      {/* Icon with ring + confetti */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{
          position: "absolute", inset: -4, borderRadius: "50%",
          border: `2px solid ${achievement.color || T.gold}`,
          animation: "ringPulse 1s ease-out infinite",
        }} />
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: `${achievement.color || T.gold}20`,
          border: `1.5px solid ${achievement.color || T.gold}60`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22,
        }}>
          {achievement.icon}
        </div>
        {confetti.map((c, i) => (
          <div key={i} style={{
            position: "absolute",
            left: `${c.x + 20}px`, top: "20px",
            width: c.size, height: c.size,
            background: c.color, borderRadius: 2,
            animation: `confetti 0.8s ease-out ${c.delay}s forwards`,
            pointerEvents: "none",
          }} />
        ))}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: T.gold, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Новое достижение
        </div>
        <div style={{ fontSize: 15, color: T.text, fontWeight: 700, marginTop: 2 }}>
          {achievement.name}
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>
          {achievement.desc}
        </div>
      </div>
    </div>
  );
}

// ── FAB ──────────────────────────────────────────────────────────────
export function FAB({ onClick, icon = "+" }) {
  const [pressed, setPressed] = useState(false);

  injectCSS("fab-anim", `
    .vault-fab {
      animation: fabPulse 4s ease-in-out infinite;
    }
  `);

  return (
    <button
      className="vault-fab"
      style={{
        position: "fixed", bottom: 80, right: 20, zIndex: 100,
        width: 56, height: 56, borderRadius: "50%",
        background: T.em, border: "none", color: "#fff",
        fontSize: 26, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: pressed ? "scale(0.9)" : "scale(1)",
        transition: "transform 0.1s",
        boxShadow: `0 4px 16px ${T.emDim}`,
      }}
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      {icon}
    </button>
  );
}

// ── IconBadge ─────────────────────────────────────────────────────────
export function IconBadge({ icon, color = T.em, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: `${color}20`, border: `1px solid ${color}40`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.5, flexShrink: 0,
    }}>
      {icon}
    </div>
  );
}

// ── Divider ──────────────────────────────────────────────────────────
export function Divider({ style: s }) {
  return <div style={{ height: 1, background: T.brdDim, margin: "8px 0", ...s }} />;
}

// ── MonthNav ─────────────────────────────────────────────────────────
import { MONTHS_RU } from "../constants";
export function MonthNav({ year, month, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <button
        style={{ background: T.bg3, border: "none", color: T.muted, borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={() => { const m = month === 1 ? 12 : month - 1; const y = month === 1 ? year - 1 : year; onChange(y, m); }}
      >‹</button>
      <span style={{ fontSize: 15, fontWeight: 600, color: T.text, minWidth: 120, textAlign: "center" }}>
        {MONTHS_RU[month - 1]} {year}
      </span>
      <button
        style={{ background: T.bg3, border: "none", color: T.muted, borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={() => { const m = month === 12 ? 1 : month + 1; const y = month === 12 ? year + 1 : year; onChange(y, m); }}
      >›</button>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────
export function Spinner({ size = 24, color }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `2px solid ${T.bg3}`,
      borderTopColor: color || T.em,
      animation: "spin 0.8s linear infinite",
      display: "inline-block",
    }} />
  );
}

// ── SegmentedControl ─────────────────────────────────────────────────
export function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={{
      display: "flex", background: T.bg3, borderRadius: 10, padding: 3, gap: 2,
    }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          style={{
            flex: 1, padding: "8px 4px", border: "none", borderRadius: 8,
            cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: value === opt.value ? T.bg1 : "transparent",
            color: value === opt.value ? T.text : T.muted,
            transition: "all 0.15s",
          }}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Input ─────────────────────────────────────────────────────────────
export function Input({ label, value, onChange, type = "text", placeholder, style: s, inputStyle, hint }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ ...s }}>
      {label && <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>{label}</div>}
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "12px 14px", background: T.bg2,
          border: `1px solid ${focused ? T.em : T.brd}`, borderRadius: 10,
          color: T.text, fontSize: 15, outline: "none",
          transition: "border-color 0.15s",
          ...inputStyle,
        }}
      />
      {hint && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

// ── Select ────────────────────────────────────────────────────────────
export function Select({ label, value, onChange, options, style: s }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ ...s }}>
      {label && <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>{label}</div>}
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "12px 14px", background: T.bg2,
          border: `1px solid ${focused ? T.em : T.brd}`, borderRadius: 10,
          color: T.text, fontSize: 15, outline: "none", appearance: "none",
          transition: "border-color 0.15s", cursor: "pointer",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: T.bg2 }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── ProgressBar ───────────────────────────────────────────────────────
export function ProgressBar({ pct, color = T.em, height = 6, style: s }) {
  return (
    <div style={{ height, background: T.bg3, borderRadius: height / 2, overflow: "hidden", ...s }}>
      <div style={{
        height: "100%", width: `${clamp(pct, 0, 100)}%`,
        background: pct > 100 ? T.red : color,
        borderRadius: height / 2,
        transition: "width 0.6s ease",
        animation: "barFill 0.8s ease",
      }} />
    </div>
  );
}
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

// ── DonutChart ────────────────────────────────────────────────────────
export function DonutChart({ data, size = 160, onClick }) {
  if (!data || !data.length) return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: T.bg3, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 12, color: T.sub }}>Нет данных</span>
    </div>
  );

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2, cy = size / 2, r = size * 0.38, ri = size * 0.24;
  let angle = -Math.PI / 2;
  const paths = [];

  for (const item of data) {
    const sweep = (item.value / total) * Math.PI * 2;
    const startAngle = angle;
    const endAngle = angle + sweep;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
    const xi1 = cx + ri * Math.cos(startAngle), yi1 = cy + ri * Math.sin(startAngle);
    const xi2 = cx + ri * Math.cos(endAngle),   yi2 = cy + ri * Math.sin(endAngle);
    const large = sweep > Math.PI ? 1 : 0;

    paths.push({
      d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${ri} ${ri} 0 ${large} 0 ${xi1} ${yi1} Z`,
      fill: item.color,
      label: item.label,
      item,
    });
    angle += sweep;
  }

  return (
    <svg width={size} height={size} style={{ cursor: onClick ? "pointer" : "default", flexShrink: 0 }}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} stroke={T.bg2} strokeWidth={2}
          onClick={() => onClick && onClick(p.item)}
          style={{ transition: "opacity 0.2s" }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        />
      ))}
    </svg>
  );
}

// ── BarChart ──────────────────────────────────────────────────────────
export function BarChart({ data, height = 100, color = T.em }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 100 / data.length;

  return (
    <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const barH = (d.value / max) * (height - 8);
        const x = i * w + w * 0.1;
        const y = height - barH;
        return (
          <rect key={i} x={`${x}%`} y={y} width={`${w * 0.8}%`} height={barH}
            fill={color} rx={2}
            style={{ transition: "height 0.5s ease, y 0.5s ease" }}
          />
        );
      })}
    </svg>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────
export function EmptyState({ icon = "📊", title, desc }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 6 }}>{title}</div>
      {desc && <div style={{ fontSize: 13, color: T.muted }}>{desc}</div>}
    </div>
  );
}
