import { useState, useEffect } from "react";
import { T } from "../theme";
import { post, put, del } from "../api";
import { BottomSheet, Button, Input } from "../components/ui";
import IconPicker from "../components/IconPicker";
import ColorPicker from "../components/ColorPicker";

export default function CategoryModal({ open, onClose, onSaved, category }) {
  const [name, setName]   = useState("");
  const [icon, setIcon]   = useState("📦");
  const [color, setColor] = useState("#10B981");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (open) {
      setName(category?.name || "");
      setIcon(category?.icon || "📦");
      setColor(category?.color || "#10B981");
      setError("");
    }
  }, [open, category]);

  async function save() {
    if (!name.trim()) { setError("Введите название"); return; }
    setLoading(true);
    setError("");
    try {
      const body = { name: name.trim(), icon, color };
      if (category?.id) await put(`/api/categories/${category.id}`, body);
      else await post("/api/categories", body);
      onSaved && onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  async function remove() {
    if (!category?.id) return;
    setLoading(true);
    try {
      await del(`/api/categories/${category.id}`);
      onSaved && onSaved();
      onClose();
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={category ? "Редактировать категорию" : "Новая категория"}>
      <div style={{ padding: "16px 16px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 600 }}>Иконка</div>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
          <Input label="Название" value={name} onChange={setName} placeholder="Еда" style={{ flex: 1 }} />
        </div>

        <div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, fontWeight: 600 }}>Цвет</div>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        {error && <div style={{ fontSize: 13, color: T.red }}>{error}</div>}
        <Button full onClick={save} disabled={loading}>{loading ? "Сохраняем..." : category ? "Сохранить" : "Создать"}</Button>
        {category?.id && <Button full variant="danger" onClick={remove} disabled={loading}>Удалить</Button>}
        <button
          onClick={onClose}
          style={{
            width: "100%", marginTop: 4, padding: "13px",
            background: "transparent", border: `1px solid ${T.brd}`,
            borderRadius: 12, color: T.muted,
            fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          Отмена
        </button>
      </div>
    </BottomSheet>
  );
}
