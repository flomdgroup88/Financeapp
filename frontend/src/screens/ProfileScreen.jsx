import { useState } from "react";
import { T } from "../theme";
import { patch } from "../api";
import { XPBar } from "../components/ui";
import { XP_TABLE, ACHIEVEMENT_DEFS, xpForLevel } from "../constants";

export default function ProfileScreen({ xpData, achievements, bootstrap, onOpenSettings }) {
  const { xp, level, rank, streak, bestStreak } = xpData;
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(bootstrap?.nickname || "Пользователь");

  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = XP_TABLE[Math.min(level, XP_TABLE.length - 1)] || currentLevelXp + 100;

  async function saveNickname() {
    await patch("/api/settings", { nickname });
    setEditing(false);
  }

  const allAchievements = achievements.getUnlockedList();
  const earnedCount = allAchievements.filter(a => a.earned).length;

  return (
    <div style={{ padding: "16px 16px 100px" }}>
      {/* Profile header */}
      <div style={{
        background: T.bg2, borderRadius: 20, border: `1px solid ${T.brd}`,
        padding: 20, marginBottom: 16, textAlign: "center",
      }}>
        {/* Avatar emoji */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: `linear-gradient(135deg, ${T.emDim}, ${T.bg3})`,
          border: `2px solid ${T.em}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32, margin: "0 auto 12px",
        }}>
          {rank.icon}
        </div>

        {/* Nickname */}
        {editing ? (
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
            <input
              autoFocus value={nickname} onChange={e => setNickname(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveNickname(); if (e.key === "Escape") setEditing(false); }}
              style={{
                background: T.bg3, border: `1px solid ${T.em}`, borderRadius: 8,
                color: T.text, fontSize: 18, fontWeight: 700, textAlign: "center",
                padding: "6px 12px", outline: "none", maxWidth: 200,
              }}
            />
            <button style={{ background: T.em, border: "none", borderRadius: 8, color: "#fff", padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}
              onClick={saveNickname}>✓</button>
          </div>
        ) : (
          <div
            style={{ fontSize: 20, fontWeight: 800, color: T.text, marginBottom: 4, cursor: "pointer" }}
            onClick={() => setEditing(true)}
          >
            {nickname} <span style={{ fontSize: 14, color: T.muted }}>✏️</span>
          </div>
        )}

        {/* Rank */}
        <div style={{ fontSize: 13, color: T.em, fontWeight: 600, marginBottom: 16 }}>
          {rank.icon} {rank.name} · Уровень {level}
        </div>

        {/* XP bar */}
        <XPBar
          xp={xp} level={level}
          currentLevelXp={currentLevelXp} nextLevelXp={nextLevelXp}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted }}>
          <span>{xp.toLocaleString("ru-RU")} XP</span>
          <span>{(nextLevelXp - xp).toLocaleString("ru-RU")} XP до уровня {level + 1}</span>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Стрик", value: `${streak}🔥`, sub: `рекорд ${bestStreak}` },
          { label: "XP", value: xp.toLocaleString("ru-RU"), sub: `уровень ${level}` },
          { label: "Ачивки", value: `${earnedCount}/${allAchievements.length}`, sub: "открыто" },
        ].map(s => (
          <div key={s.label} style={{
            background: T.bg2, borderRadius: 14, border: `1px solid ${T.brd}`,
            padding: "12px 8px", textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{s.label}</div>
            <div style={{ fontSize: 10, color: T.sub, marginTop: 1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div style={{
        background: T.bg2, borderRadius: 16, border: `1px solid ${T.brd}`,
        padding: 16, marginBottom: 16,
      }}>
        <div style={{ fontSize: 14, color: T.text, fontWeight: 700, marginBottom: 14 }}>
          🏆 Достижения · {earnedCount}/{allAchievements.length}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {allAchievements.map(ach => (
            <div
              key={ach.id}
              title={`${ach.name}: ${ach.desc}${ach.earnedDate ? ` (${ach.earnedDate})` : ""}`}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                padding: "8px 4px", borderRadius: 10,
                background: ach.earned ? `${ach.color}15` : T.bg3,
                border: `1px solid ${ach.earned ? ach.color + "40" : T.brdDim}`,
                opacity: ach.earned ? 1 : 0.45,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: "50%",
                background: ach.earned ? `${ach.color}20` : T.bg3,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, position: "relative",
              }}>
                {ach.earned ? ach.icon : "🔒"}
              </div>
              <div style={{
                fontSize: 9, color: ach.earned ? T.muted : T.sub,
                textAlign: "center", lineHeight: 1.2,
                overflow: "hidden", maxWidth: "100%",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {ach.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Settings button */}
      <button
        style={{
          width: "100%", padding: "14px", background: T.bg2,
          border: `1px solid ${T.brd}`, borderRadius: 12,
          color: T.text, fontSize: 15, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}
        onClick={onOpenSettings}
      >
        ⚙️ Настройки
      </button>
    </div>
  );
}
