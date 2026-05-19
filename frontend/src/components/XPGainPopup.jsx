import { useState, useEffect } from "react";
import { T } from "../theme";
import { lvlOf } from "../constants";

export default function XPGainPopup({ amount, newXp, onDone }) {
  const [visible, setVisible] = useState(true);
  const level = lvlOf(newXp);
  const prevLevel = lvlOf(newXp - amount);
  const levelUp = level > prevLevel;

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, levelUp ? 2500 : 1600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, zIndex: 3000,
      background: T.bg1, borderRadius: 14,
      border: `1px solid ${levelUp ? T.gold + "60" : T.em + "40"}`,
      padding: "10px 16px",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: `0 8px 24px rgba(0,0,0,0.5)`,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : "translateY(-10px) scale(0.95)",
      transition: "all 0.3s ease",
      pointerEvents: "none",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: levelUp ? `${T.gold}20` : `${T.em}20`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 16,
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
