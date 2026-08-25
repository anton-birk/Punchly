import { useState, useEffect, useRef } from 'react';
import { testConnection } from '../api/openproject';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
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

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  useEffect(() => {
    isPermissionGranted().then(setNotifGranted).catch(() => setNotifGranted(false));
  }, []);

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

  const inputCls = 'w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-indigo-500 transition-colors';
  const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5';

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
          justSaved ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-500 hover:bg-indigo-600'
        }`}
      >
        {justSaved ? '✓ Saved' : 'Save'}
      </button>
    );
  };

  const DirtyBadge = ({ dirty }: { dirty: boolean }) =>
    dirty ? (
      <span className="flex items-center gap-1.5 text-xs text-amber-500 dark:text-amber-400">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 flex-shrink-0 animate-pulse" />
        Unsaved changes
      </span>
    ) : null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-5 pb-2">
        <h2 className="text-lg font-bold">Settings</h2>
      </div>

      {/* Connection */}
      <div className="mx-6 mt-4 max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-5 text-zinc-700 dark:text-zinc-300">OpenProject Connection</h3>

        <div className="mb-4">
          <label className={labelCls}>Server URL</label>
          <input className={inputCls} type="url" placeholder="https://your-openproject.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">Base URL of your OpenProject instance</p>
        </div>

        <div className="mb-5">
          <label className={labelCls}>API Key</label>
          <input className={inputCls} type="password" placeholder="Your personal API key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">My Account → Access Tokens → API access key</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={handleTest}
            disabled={!url || !apiKey || connStatus === 'testing'}
            className="px-4 py-2 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {connStatus === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>
          <SaveButton section="connection" disabled={!url || !apiKey} />
          <DirtyBadge dirty={connectionDirty} />
        </div>

        {connStatus === 'ok' && user && (
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            Connected as <strong>{user.name}</strong> ({user.login})
          </div>
        )}
        {connStatus === 'error' && (
          <div className="mt-4 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-md p-3 border border-red-500/20 break-all">
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {/* Idle detection */}
      <div className="mx-6 mt-4 max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-5 text-zinc-700 dark:text-zinc-300">Idle Detection</h3>

        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={idleEnabled}
              onChange={(e) => setIdleEnabled(e.target.checked)}
            />
            <div className={`w-10 h-6 rounded-full transition-colors ${idleEnabled ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${idleEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
          <span className="text-sm font-medium">Enable idle detection</span>
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
                className="w-20 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors"
              />
              <span className="text-sm text-zinc-500 dark:text-zinc-400">minutes</span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-600">
              After this period without mouse/keyboard activity, Punchly will ask whether to include the idle time when you return.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <SaveButton section="idle" disabled={!url || !apiKey} />
          <DirtyBadge dirty={idleDirty} />
        </div>
      </div>

      {/* Notifications */}
      <div className="mx-6 mt-4 mb-6 max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-1 text-zinc-700 dark:text-zinc-300">Notifications</h3>
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-5">
          Punchly shows a system notification when idle time is detected — this works even when the app is in another Space or behind other windows.
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {notifGranted === null && (
              <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600 flex-shrink-0" />
            )}
            {notifGranted === true && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            )}
            {notifGranted === false && (
              <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
            )}
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {notifGranted === null && 'Checking…'}
              {notifGranted === true && 'Notifications allowed'}
              {notifGranted === false && 'Notifications not allowed'}
            </span>
          </div>

          {notifGranted === false && (
            <button
              onClick={handleRequestNotifPermission}
              className="px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-500 hover:bg-indigo-600 text-white transition-colors cursor-pointer"
            >
              Allow Notifications
            </button>
          )}
          {notifGranted === true && (
            <button
              onClick={() => sendNotification({ title: 'Punchly', body: 'Test notification is working!' })}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Send Test
            </button>
          )}
        </div>

        {notifGranted === false && (
          <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
            If the dialog doesn't appear, go to{' '}
            <span className="font-medium text-zinc-600 dark:text-zinc-300">System Settings → Notifications → Punchly</span>{' '}
            and enable notifications manually.
          </p>
        )}
      </div>
    </div>
  );
}
