import { useState } from 'react';
import type { Settings } from '../types/openproject';

const KEY = 'punchly_settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { url: '', apiKey: '', idleEnabled: false, idleThresholdMin: 5 };
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  const save = (next: Settings) => {
    setSettings(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const isConfigured = Boolean(settings.url && settings.apiKey);

  return { settings, save, isConfigured };
}
