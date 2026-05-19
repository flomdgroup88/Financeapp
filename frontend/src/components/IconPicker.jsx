import { useState } from "react";
import { T } from "../theme";

const ICONS = [
  "💰","💳","🏦","💵","💴","💶","💷","🏧","💸","💹","📈","📉",
  "🛒","🍕","🍔","☕","🍣","🥗","🍜","🛫","🚗","⛽","🏠","💡",
  "💊","🏥","👕","👟","📱","💻","🎮","🎬","🎵","📚","🐶","🌱",
  "🎯","🔐","⚙️","🔔","📊","🗂️","🎁","🌍","✂️","🏋️","💎","🔑",
  "🍺","🍷","☕","🎭","🎪","🛠️","📦","✉️","🔋","💧","🌙","⭐",
];

export default function IconPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        style={{
          width: 50, height: 50, borderRadius: 12,
          background: T.bg3, border: `1px solid ${T.brd}`,
          fontSize: 24, cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}
        onClick={() => setOpen(!open)}
      >
        {value || "❓"}
      </button>

      {open && (
        <div style={{
          marginTop: 8, background: T.bg2, borderRadius: 12,
          border: `1px solid ${T.brd}`, padding: 12,
          display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4,
          maxHeight: 200, overflowY: "auto",
        }}>
          {ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              style={{
                width: "100%", aspectRatio: "1", border: "none",
                background: value === icon ? T.bg3 : "transparent",
                borderRadius: 8, cursor: "pointer", fontSize: 18,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onClick={() => { onChange(icon); setOpen(false); }}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
