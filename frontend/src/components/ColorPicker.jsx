import { T } from "../theme";

const COLORS = [
  "#10B981","#34D399","#06B6D4","#3B82F6","#6366F1","#8B5CF6",
  "#EC4899","#EF4444","#F59E0B","#FCD34D","#84CC16","#14B8A6",
  "#F97316","#A855F7","#64748B","#94A3B8",
];

export default function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {COLORS.map((color) => (
        <button
          key={color}
          type="button"
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: color, border: value === color ? `3px solid ${T.text}` : "2px solid transparent",
            cursor: "pointer", flexShrink: 0,
          }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}
