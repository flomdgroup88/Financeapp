import { useState, useEffect } from "react";
import { T } from "../theme";
import { lvlOf } from "../constants";
import { injectCSS } from "./ui";

injectCSS("xp-popup-styles", `
  @keyframes xpSlideIn {
    from { transform: translateX(120%) scale(0.9); opacity: 0; }
    to   { transform: translateX(0)    scale(1);   opacity: 1; }
  }
  @keyframes xpSlideOut {
    from { transform: translateX(0)    scale(1);   opacity: 1; }
    to   { transform: translateX(120%) scale(0.9); opacity: 0; }
  }
  .xp-enter { animation: xpSlideIn  0.4s cubic-bezier(0.34,1.56,0.64,1) forwards; }
  .xp-exit  { animation: xpSlideOut 0.3s ease forwards; }
`);

export default function XPGainPopup({ amount, newXp, onDone }) {
  const [phase, setPhase] = useState("enter");
  const level = lvlOf(newXp);
  const prevLevel = lvlOf(newXp - amount);
  const levelUp = level > prevLevel;

  useEffect(() => {
    const t = setTimeout(() => {
      setPhase("exit");
      setTimeout(onDone, 300);
    }, levelUp ? 2500 : 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={phase === "exit" ? "xp-exit" : "xp-enter"}
      style={{
        position: "fixed",
        top: "calc(env(safe-area-inset-top) + 90px)",
        right: 16,
        zIndex: 3000,
        background: T.bg1,
        borderRadius: 14,
        border: `1px solid ${levelUp ? T.gold + "60" : T.em + "40"}`,
        padding: "10px 16px",
        display: "flex", alignItems: "center", gap: 10,
        boxShadow: `0 8px 24px rgba(0,0,0,0.5)`,
        pointerEvents: "none",
        maxWidth: 200,
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: levelUp ? `${T.gold}20` : `${T.em}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16, flexShrink: 0,
      }}>
        {levelUp ? "⬆️" : "⚡"}
      </div>
      <div>
        {levelUp && (
          <div style={{ fontSize: 11, color: T.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Level Up! → {level}
          </div>
        )}
        <div style={{ fontSize: 14, color: T.text, fontWeight: 700 }}>
          +{amount} XP
        </div>
      </div>
    </div>
  );
}
