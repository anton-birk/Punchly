import { useState, useEffect, useRef } from 'react';
import { testConnection } from '../api/openproject';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';
import type { Settings, User } from '../types/openproject';

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
}

type SavedSection = 'connection' | 'idle' | null;

export function SettingsView({ settings, onSave }: Props) {
  const [url, setUrl] = useState(settings.url);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [idleEnabled, setIdleEnabled] = useState(settings.idleEnabled);
  const [idleThresholdMin, setIdleThresholdMin] = useState(settings.idleThresholdMin);
  const [connStatus, setConnStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [savedSection, setSavedSection] = useState<SavedSection>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);
  const [accessibilityGranted, setAccessibilityGranted] = useState<boolean | null>(null);

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  useEffect(() => {
    isPermissionGranted().then(setNotifGranted).catch(() => setNotifGranted(false));
    invoke<boolean>('accessibility_granted').then(setAccessibilityGranted).catch(() => setAccessibilityGranted(false));
  }, []);

  const handleRequestAccessibility = async () => {
    await invoke('request_accessibility').catch(() => {});
    // Poll until user grants (System Settings dialog is non-blocking)
    const poll = setInterval(async () => {
      const granted = await invoke<boolean>('accessibility_granted').catch(() => false);
      if (granted) {
        setAccessibilityGranted(true);
        clearInterval(poll);
      }
    }, 2000);
    setTimeout(() => clearInterval(poll), 60_000); // stop after 60s
  };

  const connectionDirty =
    url.trim() !== settings.url || apiKey.trim() !== settings.apiKey;

  const idleDirty =
    idleEnabled !== settings.idleEnabled ||
    idleThresholdMin !== settings.idleThresholdMin;

  const handleTest = async () => {
    setConnStatus('testing');
    setError('');
    setUser(null);
    try {
      const u = await testConnection({ url: url.trim(), apiKey: apiKey.trim(), idleEnabled, idleThresholdMin });
      setUser(u);
      setConnStatus('ok');
    } catch (e) {
      setError(String(e));
      setConnStatus('error');
    }
  };

  const handleRequestNotifPermission = async () => {
    const result = await requestPermission();
    const granted = result === 'granted';
    setNotifGranted(granted);
    if (granted) {
      sendNotification({ title: 'Punchly', body: 'Notifications are working!' });
    }
  };

  const handleSave = (section: 'connection' | 'idle') => {
    onSave({ url: url.trim(), apiKey: apiKey.trim(), idleEnabled, idleThresholdMin });
    setSavedSection(section);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedSection(null), 2500);
  };

  const isMacOS = navigator.platform.startsWith('Mac') || navigator.userAgent.includes('Macintosh');

  const inputCls = 'input-field w-full border rounded-md px-3 py-2 text-sm outline-none transition-colors';
  const labelCls = 'text-subtle block text-xs font-semibold uppercase tracking-wide mb-1.5';

  const SaveButton = ({
    section,
    disabled,
  }: {
    section: 'connection' | 'idle';
    disabled: boolean;
  }) => {
    const justSaved = savedSection === section && (section === 'connection' ? !connectionDirty : !idleDirty);
    return (
      <button
        onClick={() => handleSave(section)}
        disabled={disabled}
        className={`px-4 py-2 text-sm font-semibold rounded-md text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer ${
          justSaved ? 'bg-[var(--success)] hover:opacity-90' : 'btn-primary'
        }`}
      >
        {justSaved ? '✓ Saved' : 'Save'}
      </button>
    );
  };

  const DirtyBadge = ({ dirty }: { dirty: boolean }) =>
    dirty ? (
      <span className="flex items-center gap-1.5 text-xs text-[var(--warning)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] flex-shrink-0 animate-pulse" />
        Unsaved changes
      </span>
    ) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-5 pb-2">
        <h2 className="text-main text-lg font-bold">Settings</h2>
      </div>

      {/* Connection */}
      <div className="surface mx-6 mt-4 max-w-lg border rounded-xl p-6">
        <h3 className="text-main text-sm font-semibold mb-5">OpenProject Connection</h3>

        <div className="mb-4">
          <label className={labelCls}>Server URL</label>
          <input className={inputCls} type="url" placeholder="https://your-openproject.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          <p className="text-subtle mt-1 text-xs">Base URL of your OpenProject instance</p>
        </div>

        <div className="mb-5">
          <label className={labelCls}>API Key</label>
          <input className={inputCls} type="password" placeholder="Your personal API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <p className="text-subtle mt-1 text-xs">My Account → Access Tokens → API access key</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleTest}
            disabled={!url || !apiKey || connStatus === 'testing'}
            className="btn-ghost px-4 py-2 text-sm font-medium rounded-md border disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {connStatus === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>
          <SaveButton section="connection" disabled={!url || !apiKey} />
          <DirtyBadge dirty={connectionDirty} />
        </div>

        {connStatus === 'ok' && user && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--success)]">
            <span className="w-2 h-2 rounded-full bg-[var(--success)] flex-shrink-0" />
            Connected as <strong>{user.name}</strong> ({user.login})
          </div>
        )}
        {connStatus === 'error' && (
          <div className="danger-chip danger-border mt-4 flex items-start gap-2 text-xs rounded-md p-3 border break-all">
            <span className="w-2 h-2 rounded-full bg-[var(--danger)] flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {/* Idle detection */}
      <div className="surface mx-6 mt-4 max-w-lg border rounded-xl p-6">
        <h3 className="text-main text-sm font-semibold mb-5">Idle Detection</h3>

        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={idleEnabled}
              onChange={(e) => setIdleEnabled(e.target.checked)}
            />
            <div className={`w-10 h-6 rounded-full transition-colors ${idleEnabled ? 'bg-[var(--brand)]' : 'bg-[var(--app-border-strong)]'}`} />
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${idleEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
          <span className="text-main text-sm font-medium">Enable idle detection</span>
        </label>

        {idleEnabled && (
          <div className="mb-4">
            <label className={labelCls}>Idle threshold</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={60}
                value={idleThresholdMin}
                onChange={(e) => setIdleThresholdMin(Math.max(1, Math.min(60, Number(e.target.value))))}
                className="input-field w-20 border rounded-md px-3 py-2 text-sm outline-none transition-colors"
              />
              <span className="text-muted text-sm">minutes</span>
            </div>
            <p className="text-subtle mt-1.5 text-xs">
              After this period without mouse/keyboard activity, Punchly will ask whether to include the idle time when you return.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <SaveButton section="idle" disabled={!url || !apiKey} />
          <DirtyBadge dirty={idleDirty} />
        </div>
      </div>

      {/* Accessibility — macOS only */}
      {isMacOS && <div className="surface mx-6 mt-4 max-w-lg border rounded-xl p-6">
        <h3 className="text-main text-sm font-semibold mb-1">Accessibility (Idle Detection)</h3>
        <p className="text-subtle text-xs mb-5">
          Allows Punchly to track keyboard and mouse events to precisely measure idle time — the same approach used by HubStaff. Without this, detection relies on polling which may miss idle periods after screen lock.
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {accessibilityGranted === null && <span className="w-2 h-2 rounded-full bg-[var(--app-border-strong)] flex-shrink-0" />}
            {accessibilityGranted === true && <span className="w-2 h-2 rounded-full bg-[var(--success)] flex-shrink-0" />}
            {accessibilityGranted === false && <span className="w-2 h-2 rounded-full bg-[var(--warning)] flex-shrink-0" />}
            <span className="text-muted text-sm">
              {accessibilityGranted === null && 'Checking…'}
              {accessibilityGranted === true && 'Accessibility granted — event-based idle tracking active'}
              {accessibilityGranted === false && 'Accessibility not granted — using polling fallback'}
            </span>
          </div>
          {accessibilityGranted === false && (
            <button
              onClick={handleRequestAccessibility}
              className="btn-primary ml-4 shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              Grant Access
            </button>
          )}
        </div>

        {accessibilityGranted === false && (
          <p className="text-subtle mt-3 text-xs">
            If the dialog doesn't appear, go to{' '}
            <span className="text-muted font-medium">System Settings → Privacy & Security → Accessibility</span>{' '}
            and enable Punchly manually.
          </p>
        )}
      </div>}

      {/* Notifications */}
      <div className="surface mx-6 mt-4 mb-6 max-w-lg border rounded-xl p-6">
        <h3 className="text-main text-sm font-semibold mb-1">Notifications</h3>
        <p className="text-subtle text-xs mb-5">
          Punchly shows a system notification when idle time is detected — this works even when the app is in another Space or behind other windows.
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {notifGranted === null && (
              <span className="w-2 h-2 rounded-full bg-[var(--app-border-strong)] flex-shrink-0" />
            )}
            {notifGranted === true && (
              <span className="w-2 h-2 rounded-full bg-[var(--success)] flex-shrink-0" />
            )}
            {notifGranted === false && (
              <span className="w-2 h-2 rounded-full bg-[var(--danger)] flex-shrink-0" />
            )}
            <span className="text-muted text-sm">
              {notifGranted === null && 'Checking…'}
              {notifGranted === true && 'Notifications allowed'}
              {notifGranted === false && 'Notifications not allowed'}
            </span>
          </div>

          {notifGranted === false && (
            <button
              onClick={handleRequestNotifPermission}
              className="btn-primary px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              Allow Notifications
            </button>
          )}
          {notifGranted === true && (
            <button
              onClick={() => sendNotification({ title: 'Punchly', body: 'Test notification is working!' })}
              className="btn-ghost px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer"
            >
              Send Test
            </button>
          )}
        </div>

        {notifGranted === false && (
          <p className="text-subtle mt-3 text-xs">
            If the dialog doesn't appear, go to{' '}
            <span className="text-muted font-medium">System Settings → Notifications → Punchly</span>{' '}
            and enable notifications manually.
          </p>
        )}
      </div>
    </div>
  );
}
