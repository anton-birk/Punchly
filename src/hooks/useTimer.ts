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
  if (t) localStorage.setItem(KEY, JSON.stringify(t));
  else localStorage.removeItem(KEY);
}

export function useTimer() {
  const [timer, setTimer] = useState<ActiveTimer | null>(loadTimer);
  const [elapsed, setElapsed] = useState(() => {
    const t = loadTimer();
    if (t?.isRunning) return Math.max(0, Math.floor((Date.now() - t.startTime) / 1000) - (t.idleDeductedSec ?? 0));
    return 0;
  });
  // When non-null, the timer display is frozen at the value captured at this timestamp.
  const [pausedAt, setPausedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!timer?.isRunning) return;
    if (pausedAt !== null) {
      // Freeze elapsed at the moment of pause.
      setElapsed(Math.max(0, Math.floor((pausedAt - timer.startTime) / 1000) - (timer.idleDeductedSec ?? 0)));
      return;
    }
    const tick = () => {
      const raw = Math.floor((Date.now() - timer.startTime) / 1000);
      setElapsed(Math.max(0, raw - (timer.idleDeductedSec ?? 0)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timer?.isRunning, timer?.startTime, timer?.idleDeductedSec, pausedAt]);

  const pauseTimer = useCallback(() => setPausedAt(Date.now()), []);

  const resumeTimer = useCallback((extraDeductSecs: number) => {
    setPausedAt(null);
    if (extraDeductSecs <= 0) return;
    setTimer(prev => {
      if (!prev) return prev;
      const updated = { ...prev, idleDeductedSec: (prev.idleDeductedSec ?? 0) + extraDeductSecs };
      saveTimer(updated);
      return updated;
    });
  }, []);

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
        idleDeductedSec: 0,
      };
      setTimer(t);
      setElapsed(0);
      saveTimer(t);
    },
    [],
  );

  /** Add idle seconds to be deducted from the final elapsed time. */
  const deductIdle = useCallback((seconds: number) => {
    setTimer((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, idleDeductedSec: (prev.idleDeductedSec ?? 0) + seconds };
      saveTimer(updated);
      return updated;
    });
  }, []);

  const stop = useCallback((): { elapsed: number; timer: ActiveTimer } | null => {
    if (!timer) return null;
    const raw = Math.floor((Date.now() - timer.startTime) / 1000);
    const finalElapsed = Math.max(0, raw - (timer.idleDeductedSec ?? 0));
    const stopped = { ...timer, isRunning: false };
    setTimer(null);
    setElapsed(0);
    saveTimer(null);
    return { elapsed: finalElapsed, timer: stopped };
  }, [timer]);

  return { timer, elapsed, start, stop, deductIdle, pauseTimer, resumeTimer };
}
