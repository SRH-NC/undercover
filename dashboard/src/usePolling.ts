import { useCallback, useEffect, useState } from "react";
import { getJson } from "./api";

export const POLL_MS = 2000;

export interface Polled<T> {
  data: T | undefined;
  failed: boolean;
  refresh: () => void;
}

export function usePolling<T>(path: string): Polled<T> {
  const [data, setData] = useState<T>();
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
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
    const timer = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, version]);

  const refresh = useCallback(() => {
    setVersion((n) => n + 1);
  }, []);

  return { data, failed, refresh };
}
