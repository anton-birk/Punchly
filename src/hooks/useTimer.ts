import { useState, useEffect, useCallback } from 'react';
import type { ActiveTimer } from '../types/openproject';

const KEY = 'punchly_timer';

function loadTimer(): ActiveTimer | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveTimer(t: ActiveTimer | null) {
  if (t) {
    localStorage.setItem(KEY, JSON.stringify(t));
  } else {
    localStorage.removeItem(KEY);
  }
}

export function useTimer() {
  const [timer, setTimer] = useState<ActiveTimer | null>(loadTimer);
  const [elapsed, setElapsed] = useState(() => {
    const t = loadTimer();
    if (t?.isRunning) return Math.floor((Date.now() - t.startTime) / 1000);
    return 0;
  });

  useEffect(() => {
    if (!timer?.isRunning) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - timer.startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer?.isRunning, timer?.startTime]);

  const start = useCallback(
    (workPackageId: number, workPackageSubject: string, projectHref: string, projectId: number) => {
      const t: ActiveTimer = {
        isRunning: true,
        startTime: Date.now(),
        workPackageId,
        workPackageSubject,
        projectHref,
        projectId,
        comment: 'Time tracked via Punchly',
      };
      setTimer(t);
      setElapsed(0);
      saveTimer(t);
    },
    [],
  );

  const stop = useCallback((): { elapsed: number; timer: ActiveTimer } | null => {
    if (!timer) return null;
    const finalElapsed = Math.floor((Date.now() - timer.startTime) / 1000);
    const stopped = { ...timer, isRunning: false };
    setTimer(null);
    setElapsed(0);
    saveTimer(null);
    return { elapsed: finalElapsed, timer: stopped };
  }, [timer]);

  return { timer, elapsed, start, stop };
}
