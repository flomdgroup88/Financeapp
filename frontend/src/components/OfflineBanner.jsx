/**
 * OfflineBanner — полоска вверху экрана, когда нет сети.
 *
 * Показывается плавно (slide-down анимация).
 * Сама исчезает, когда сеть восстанавливается — показывает "Снова онлайн" 2 секунды.
 */
import { useState, useEffect, useRef } from "react";
import { T } from "../theme";

export default function OfflineBanner({ isOffline }) {
  // visible = показываем полоску
  // wasOffline = только что восстановились
  const [visible, setVisible]       = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const hideTimer = useRef(null);

  useEffect(() => {
    if (isOffline) {
      clearTimeout(hideTimer.current);
      setWasOffline(false);
      setVisible(true);
    } else if (visible) {
      // Сеть вернулась — показываем "Снова онлайн" 2 сек, потом прячем
      setWasOffline(true);
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        setWasOffline(false);
      }, 2000);
    }
    return () => clearTimeout(hideTimer.current);
  }, [isOffline]);

  if (!visible) return null;

  const bg     = wasOffline ? T.em     : T.gold;
  const border = wasOffline ? `${T.em}50`  : `${T.gold}50`;
  const icon   = wasOffline ? "✅"     : "📡";
  const text   = wasOffline
    ? "Соединение восстановлено"
    : "Нет сети — показаны данные из кэша";

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 500,
        margin: "0 12px 8px",
        padding: "9px 14px",
        borderRadius: 12,
        background: `${bg}18`,
        border: `1px solid ${border}`,
        display: "flex",
        alignItems: "center",
        gap: 8,
        animation: "offlineBannerIn 0.25s ease",
      }}
    >
      <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12, color: bg, fontWeight: 600, lineHeight: 1.3 }}>
        {text}
      </span>
    </div>
  );
}
