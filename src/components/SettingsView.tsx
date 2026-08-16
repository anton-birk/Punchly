import { useState } from 'react';
import { testConnection } from '../api/openproject';
import type { Settings, User } from '../types/openproject';

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
}

export function SettingsView({ settings, onSave }: Props) {
  const [url, setUrl] = useState(settings.url);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [status, setStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');

  const handleTest = async () => {
    setStatus('testing');
    setError('');
    setUser(null);
    try {
      const u = await testConnection({ url: url.trim(), apiKey: apiKey.trim() });
      setUser(u);
      setStatus('ok');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  };

  const handleSave = () => {
    onSave({ url: url.trim(), apiKey: apiKey.trim() });
  };

  const inputCls = 'w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-indigo-500 transition-colors';
  const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5';

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 pt-5 pb-2">
        <h2 className="text-lg font-bold">Settings</h2>
      </div>

      <div className="mx-6 mt-4 max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold mb-5 text-zinc-700 dark:text-zinc-300">OpenProject Connection</h3>

        <div className="mb-4">
          <label className={labelCls}>Server URL</label>
          <input
            className={inputCls}
            type="url"
            placeholder="https://your-openproject.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">Base URL of your OpenProject instance</p>
        </div>

        <div className="mb-5">
          <label className={labelCls}>API Key</label>
          <input
            className={inputCls}
            type="password"
            placeholder="Your personal API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">
            My Account → Access Tokens → API access key
          </p>
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={handleTest}
            disabled={!url || !apiKey || status === 'testing'}
            className="px-4 py-2 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {status === 'testing' ? 'Testing…' : 'Test Connection'}
          </button>
          <button
            onClick={handleSave}
            disabled={!url || !apiKey}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>

        {status === 'ok' && user && (
          <div className="mt-4 flex items-center gap-2 text-sm text-emerald-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            Connected as <strong>{user.name}</strong> ({user.login})
          </div>
        )}

        {status === 'error' && (
          <div className="mt-4 flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-md p-3 border border-red-500/20 break-all">
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
