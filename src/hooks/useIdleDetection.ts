import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface IdleEvent {
  idleSeconds: number;
  idleStartedAt: Date;
}

export function useIdleDetection(
  enabled: boolean,
  thresholdMinutes: number,
  timerRunning: boolean,
  onIdleEnd: (e: IdleEvent) => void,
) {
  const [isIdle, setIsIdle] = useState(false);
  const isIdleRef = useRef(false);
  const idleStartRef = useRef<number | null>(null);
  const peakIdleSecsRef = useRef<number>(0);
  const onIdleEndRef = useRef(onIdleEnd);
  useEffect(() => { onIdleEndRef.current = onIdleEnd; }, [onIdleEnd]);

  const check = useCallback(async () => {
    try {
      const idleSecs = await invoke<number>('get_idle_seconds');
      const threshold = thresholdMinutes * 60;

      if (idleSecs >= threshold && !isIdleRef.current) {
        idleStartRef.current = Date.now() - idleSecs * 1000;
        peakIdleSecsRef.current = idleSecs;
        isIdleRef.current = true;
        setIsIdle(true);
      } else if (idleSecs >= threshold && isIdleRef.current) {
        peakIdleSecsRef.current = idleSecs;
      } else if (idleSecs < threshold && isIdleRef.current) {
        onIdleEndRef.current({
          idleSeconds: peakIdleSecsRef.current,
          idleStartedAt: new Date(idleStartRef.current ?? Date.now()),
        });
        idleStartRef.current = null;
        peakIdleSecsRef.current = 0;
        isIdleRef.current = false;
        setIsIdle(false);
      }
    } catch {}
  }, [thresholdMinutes]);

  useEffect(() => {
    if (!enabled || !timerRunning) {
      isIdleRef.current = false;
      idleStartRef.current = null;
      setIsIdle(false);
      return;
    }
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [enabled, timerRunning, check]);

  return { isIdle };
}
