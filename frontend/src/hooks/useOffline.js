/**
 * useOffline — глобальный хук для отслеживания состояния сети.
 *
 * Возвращает { isOffline: boolean }
 * Слушает события browser'а online/offline + делает реальный пинг к серверу,
 * чтобы не ошибиться (бывает Wi-Fi есть, а интернета нет).
 */
import { useState, useEffect, useRef } from "react";

// Пингуем свой же /health эндпоинт — он лёгкий и всегда отвечает
const PING_URL = "/health";
const PING_INTERVAL = 30_000; // каждые 30 сек

async function checkConnectivity() {
  try {
    const res = await fetch(PING_URL, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function useOffline() {
  // Начинаем с navigator.onLine — лучше чем ничего на старте
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const timerRef = useRef(null);

  async function ping() {
    const online = await checkConnectivity();
    setIsOffline(!online);
  }

  useEffect(() => {
    function handleOnline() {
      // Браузер говорит "онлайн" — перепроверяем пингом
      ping();
    }
    function handleOffline() {
      // Браузер говорит "офлайн" — верим сразу
      setIsOffline(true);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Первый пинг сразу
    ping();

    // Периодический пинг
    timerRef.current = setInterval(ping, PING_INTERVAL);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(timerRef.current);
    };
  }, []);

  return { isOffline };
}
