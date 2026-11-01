import { useCallback, useEffect, useState } from "react";
import { getJson } from "./api";

export const POLL_MS = 2000;

export interface Loaded<T> {
  data: T | undefined;
  failed: boolean;
  refresh: () => void;
}

// Loads a path from the backend once it is known, and again every pollMs if given.
export function useApi<T>(
  path: string | undefined,
  pollMs?: number,
): Loaded<T> {
  const [data, setData] = useState<T>();
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let active = true;
    const load = () => {
      getJson<T>(path).then(
        (value) => {
          if (active) {
            setData(value);
            setFailed(false);
          }
        },
        () => {
          if (active) setFailed(true);
        },
      );
    };
    load();
    const timer = pollMs ? setInterval(load, pollMs) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, pollMs, version]);

  const refresh = useCallback(() => {
    setVersion((n) => n + 1);
  }, []);

  return { data, failed, refresh };
}
