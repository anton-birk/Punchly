import { formatDuration } from '../api/openproject';
import type { View } from '../types/openproject';

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  timerRunning: boolean;
  timerElapsed: number;
  timerSubject: string | null;
  onStopTimer: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

const nav: { id: View; label: string; icon: string }[] = [
  { id: 'my-tasks', label: 'My Tasks', icon: '◎' },
  { id: 'all-tasks', label: 'All Tasks', icon: '☰' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar({ view, onNavigate, timerRunning, timerElapsed, timerSubject, onStopTimer, theme, onToggleTheme }: Props) {
  return (
    <aside className="w-[230px] min-w-[230px] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-xl">⏱</span>
        <span className="text-[17px] font-bold tracking-tight">Punchly</span>
      </div>

      {/* Active timer */}
      {timerRunning && (
        <div className="mx-3 mt-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 p-3.5 flex flex-col gap-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-500">Tracking</div>
          <div className="tabular text-[26px] font-bold text-emerald-500 leading-none">{formatDuration(timerElapsed)}</div>
          <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate" title={timerSubject ?? ''}>{timerSubject}</div>
          <button
            onClick={onStopTimer}
            className="mt-1 w-full bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded py-1.5 px-3 transition-colors cursor-pointer"
          >
            ■ Stop
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              view === item.id
                ? 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400'
                : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <span className="w-4.5 text-center text-[15px]">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Theme toggle */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-800">
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-sm text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <span>{theme === 'dark' ? '☀' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
    </aside>
  );
}
