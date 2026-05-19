import { useState } from "react";
import { T } from "../theme";

const TABS = [
  { id: "dashboard",    icon: "📊", label: "Главная" },
  { id: "history",      icon: "📋", label: "История" },
  { id: "balance",      icon: "🏦", label: "Счета" },
  { id: "expenses",     icon: "💸", label: "Расходы" },
  { id: "subs",         icon: "🔔", label: "Подписки" },
];

export default function BottomNav({ activeTab, onChange, onFAB }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
      background: T.bg1,
      borderTop: `1px solid ${T.brd}`,
      display: "flex", alignItems: "center",
      paddingBottom: "env(safe-area-inset-bottom)",
      height: 70,
    }}>
      {TABS.map((tab, i) => {
        // Insert FAB in middle
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            style={{
              flex: 1, background: "none", border: "none",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 3, cursor: "pointer",
              padding: "6px 0",
              color: isActive ? T.em : T.sub,
              transition: "color 0.15s",
            }}
            onClick={() => onChange(tab.id)}
          >
            <div style={{
              fontSize: 20, lineHeight: 1,
              transform: isActive ? "scale(1.15)" : "scale(1)",
              transition: "transform 0.15s",
            }}>
              {tab.icon}
            </div>
            <div style={{
              fontSize: 10, fontWeight: isActive ? 700 : 500,
              letterSpacing: 0.2,
            }}>
              {tab.label}
            </div>
            {isActive && (
              <div style={{
                position: "absolute", top: 0,
                width: 32, height: 2, borderRadius: 1,
                background: T.em,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
