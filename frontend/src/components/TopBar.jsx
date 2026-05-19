import { T } from "../theme";
import { XPBar } from "./ui";
import { XP_TABLE, xpForLevel } from "../constants";

export default function TopBar({ xpData, onProfile, onAdd }) {
  const { xp, level, rank, streak } = xpData;
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp    = XP_TABLE[Math.min(level, XP_TABLE.length - 1)] || currentLevelXp + 100;

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 100,
      background: T.bg0 + "f2",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: `1px solid ${T.brdDim}`,
      /* safe-area-inset-top для notch/Dynamic Island */
      paddingTop: "max(env(safe-area-inset-top), 12px)",
      paddingLeft: 16,
      paddingRight: 16,
      paddingBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        {/* Logo */}
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, flex: 1 }}>
          <span style={{ color: T.em }}>V</span>
          <span style={{ color: T.text }}>ault</span>
        </div>

        {/* Streak */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: T.bg3, borderRadius: 20, padding: "4px 10px",
          border: `1px solid ${streak >= 7 ? T.gold + "50" : T.brdDim}`,
        }}>
          <span style={{ fontSize: 13 }}>🔥</span>
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: streak >= 7 ? T.gold : T.muted,
            fontVariantNumeric: "tabular-nums",
          }}>{streak}</span>
        </div>

        {/* Level */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: T.emDim, borderRadius: 20, padding: "4px 10px",
          border: `1px solid ${T.em}30`,
        }}>
          <span style={{ fontSize: 11 }}>{rank.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.em }}>Lvl {level}</span>
        </div>

        {/* Add */}
        <button onClick={onAdd} style={{
          width: 34, height: 34, borderRadius: "50%",
          background: T.em, border: "none", color: "#fff",
          fontSize: 22, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1, fontWeight: 300,
        }}>+</button>

        {/* Profile */}
        <button onClick={onProfile} style={{
          width: 34, height: 34, borderRadius: "50%",
          background: T.bg3, border: `1px solid ${T.brd}`,
          fontSize: 16, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>👤</button>
      </div>

      {/* XP mini-bar */}
      <XPBar xp={xp} level={level} currentLevelXp={currentLevelXp} nextLevelXp={nextLevelXp} />
    </div>
  );
}
