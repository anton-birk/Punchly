import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

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
  const onIdleEndRef = useRef(onIdleEnd);
  useEffect(() => { onIdleEndRef.current = onIdleEnd; }, [onIdleEnd]);

  // Tell the Rust background thread whether to track idle (immune to WKWebView throttle).
  useEffect(() => {
    const active = enabled && timerRunning;
    invoke('set_idle_tracking', {
      enabled: active,
      thresholdSecs: thresholdMinutes * 60,
    }).catch(() => {});
    if (!active) setIsIdle(false);
  }, [enabled, timerRunning, thresholdMinutes]);

  // React to idle events emitted by the Rust thread.
  useEffect(() => {
    if (!enabled || !timerRunning) return;

    const unlistenStarted = listen('idle-started', () => {
      setIsIdle(true);
    });

    const unlistenEnded = listen<{ idleSeconds: number; idleStartedAt: number }>(
      'idle-ended',
      (event) => {
        setIsIdle(false);
        onIdleEndRef.current({
          idleSeconds: event.payload.idleSeconds,
          idleStartedAt: new Date(event.payload.idleStartedAt),
        });
      },
    );

    return () => {
      unlistenStarted.then((fn) => fn());
      unlistenEnded.then((fn) => fn());
    };
  }, [enabled, timerRunning]);

  return { isIdle };
}
