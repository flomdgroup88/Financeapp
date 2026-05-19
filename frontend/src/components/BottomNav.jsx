import { T } from "../theme";

const TABS = [
  { id: "dashboard", icon: "📊", label: "Главная" },
  { id: "history",   icon: "📋", label: "История" },
  { id: "balance",   icon: "🏦", label: "Счета"   },
  { id: "expenses",  icon: "💸", label: "Расходы" },
  { id: "subs",      icon: "🔔", label: "Подписки"},
];

export default function BottomNav({ activeTab, onChange }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
      background: T.bg1,
      borderTop: `1px solid ${T.brd}`,
      /* safe-area-inset-bottom для iPhone home indicator */
      paddingBottom: "env(safe-area-inset-bottom)",
      paddingLeft:  "env(safe-area-inset-left)",
      paddingRight: "env(safe-area-inset-right)",
    }}>
      <div style={{ display: "flex", alignItems: "stretch", height: 56 }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              style={{
                flex: 1, background: "none", border: "none",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 3, cursor: "pointer", padding: "6px 2px",
                color: isActive ? T.em : T.sub,
                transition: "color 0.15s",
                position: "relative",
              }}
              onClick={() => onChange(tab.id)}
            >
              {/* Active indicator line at top */}
              {isActive && (
                <div style={{
                  position: "absolute", top: 0, left: "50%",
                  transform: "translateX(-50%)",
                  width: 28, height: 2, borderRadius: 1,
                  background: T.em,
                }} />
              )}
              <div style={{
                fontSize: 19, lineHeight: 1,
                transform: isActive ? "scale(1.15)" : "scale(1)",
                transition: "transform 0.15s",
              }}>
                {tab.icon}
              </div>
              <div style={{
                fontSize: 9, fontWeight: isActive ? 700 : 500,
                letterSpacing: 0.2, lineHeight: 1,
              }}>
                {tab.label}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
