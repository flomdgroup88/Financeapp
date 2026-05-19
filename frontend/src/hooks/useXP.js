import { useState, useCallback, useRef } from "react";
import { patch } from "../api";
import { lvlOf, xpToNext, rankOf } from "../constants";

export default function useXP(initialData) {
  const [xp, setXp] = useState(initialData?.xp_total || 0);
  const [streak, setStreak] = useState(initialData?.streak_current || 0);
  const [bestStreak, setBestStreak] = useState(initialData?.streak_best || 0);
  const [streakLastDate, setStreakLastDate] = useState(initialData?.streak_last_date || null);
  const pendingRef = useRef(null);

  const save = useCallback(async (newXp, newStreak, newBest, newDate) => {
    // Debounce saves
    clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(async () => {
      try {
        await patch("/api/settings", {
          xp_total: newXp,
          streak_current: newStreak,
          streak_best: newBest,
          streak_last_date: newDate,
        });
      } catch {}
    }, 500);
  }, []);

  const awardXP = useCallback(async (amount, reason) => {
    const newXp = xp + amount;
    setXp(newXp);
    await save(newXp, streak, bestStreak, streakLastDate);
    return amount;
  }, [xp, streak, bestStreak, streakLastDate, save]);

  // Called when a transaction is added - handles streak logic
  const recordTransaction = useCallback(async (txDate) => {
    const today = txDate || new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (streakLastDate === today) {
      // Already recorded today — no daily XP
      return { xpGained: 0, newStreak: streak };
    }

    let newStreak = streak;
    if (streakLastDate === yesterday) {
      newStreak = streak + 1;
    } else {
      newStreak = 1;
    }

    const newBest = Math.max(bestStreak, newStreak);
    let gained = 10; // Daily XP

    // Streak bonuses
    const bonuses = { 3: 25, 7: 75, 14: 150, 30: 400 };
    if (bonuses[newStreak]) gained += bonuses[newStreak];

    const newXp = xp + gained;
    setXp(newXp);
    setStreak(newStreak);
    setBestStreak(newBest);
    setStreakLastDate(today);

    await save(newXp, newStreak, newBest, today);
    return { xpGained: gained, newStreak };
  }, [xp, streak, bestStreak, streakLastDate, save]);

  const sync = useCallback((serverData) => {
    if (!serverData) return;
    setXp(serverData.xp_total || 0);
    setStreak(serverData.streak_current || 0);
    setBestStreak(serverData.streak_best || 0);
    setStreakLastDate(serverData.streak_last_date || null);
  }, []);

  const level = lvlOf(xp);
  const rank = rankOf(level);

  return { xp, level, rank, streak, bestStreak, awardXP, recordTransaction, sync };
}
