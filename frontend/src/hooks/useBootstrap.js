import { useState, useEffect, useCallback } from "react";
import { get } from "../api";
import useCache from "./useCache";

export default function useBootstrap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { getCache, getOfflineCache, invalidate } = useCache();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCache("bootstrap", () => get("/api/bootstrap"));
      setData(result);
    } catch (err) {
      // Try offline
      const offline = await getOfflineCache("bootstrap");
      if (offline) {
        setData(offline);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    invalidate("bootstrap");
    load();
  }, [load]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refresh };
}
