import { useState, useCallback } from "react";
import { patch } from "../api";
import { ACHIEVEMENT_DEFS } from "../constants";

const STORAGE_KEY = "vault_achievements";

function loadUnlocked() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
  catch { return {}; }
}

function saveUnlocked(u) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
}

export default function useAchievements(onUnlock) {
  const [unlocked, setUnlocked] = useState(loadUnlocked);

  const check = useCallback((id) => {
    return !!unlocked[id];
  }, [unlocked]);

  const unlock = useCallback((id) => {
    if (unlocked[id]) return;
    const def = ACHIEVEMENT_DEFS.find(a => a.id === id);
    if (!def) return;

    const newUnlocked = { ...unlocked, [id]: new Date().toISOString().slice(0, 10) };
    setUnlocked(newUnlocked);
    saveUnlocked(newUnlocked);

    if (onUnlock) onUnlock(def);
  }, [unlocked, onUnlock]);

  const checkAndUnlock = useCallback((id) => {
    if (!unlocked[id]) unlock(id);
  }, [unlocked, unlock]);

  const getUnlockedList = useCallback(() => {
    return ACHIEVEMENT_DEFS.map(def => ({
      ...def,
      earned: !!unlocked[def.id],
      earnedDate: unlocked[def.id] || null,
    }));
  }, [unlocked]);

  return { check, unlock, checkAndUnlock, getUnlockedList, unlocked };
}
