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
      background: T.bg0 + "e8",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      borderBottom: `1px solid ${T.brdDim}`,
      padding: "10px 16px 8px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        {/* Logo */}
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.5, flex: 1 }}>
          <span style={{ color: T.em }}>V</span>
          <span style={{ color: T.text }}>ault</span>
        </div>

        {/* Streak */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: T.bg3, borderRadius: 20, padding: "4px 10px",
          border: `1px solid ${streak >= 7 ? T.gold + "40" : T.brdDim}`,
        }}>
          <span style={{ fontSize: 14 }}>🔥</span>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: streak >= 7 ? T.gold : T.muted,
            fontVariantNumeric: "tabular-nums",
          }}>
            {streak}
          </span>
        </div>

        {/* Level badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: T.emDim, borderRadius: 20, padding: "4px 10px",
          border: `1px solid ${T.em}30`,
        }}>
          <span style={{ fontSize: 12 }}>{rank.icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.em }}>
            Lvl {level}
          </span>
        </div>

        {/* Add button */}
        <button
          onClick={onAdd}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: T.em, border: "none", color: "#fff",
            fontSize: 20, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
            fontWeight: 300, lineHeight: 1,
          }}
        >
          +
        </button>

        {/* Profile */}
        <button
          onClick={onProfile}
          style={{
            width: 36, height: 36, borderRadius: "50%",
            background: T.bg3, border: `1px solid ${T.brd}`,
            fontSize: 18, cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
        >
          👤
        </button>
      </div>

      {/* XP mini-bar */}
      <XPBar
        xp={xp} level={level}
        currentLevelXp={currentLevelXp} nextLevelXp={nextLevelXp}
      />
    </div>
  );
}
