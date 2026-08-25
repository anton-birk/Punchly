import { formatDuration } from '../api/openproject';
import type { View } from '../types/openproject';

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  timerRunning: boolean;
  timerElapsed: number;
  timerSubject: string | null;
  isIdle: boolean;
  onStopTimer: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

const nav: { id: View; label: string; icon: string }[] = [
  { id: 'my-tasks', label: 'My Tasks', icon: '◎' },
  { id: 'all-tasks', label: 'All Tasks', icon: '☰' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar({ view, onNavigate, timerRunning, timerElapsed, timerSubject, isIdle, onStopTimer, theme, onToggleTheme }: Props) {
  return (
    <aside className="sidebar-shell w-[230px] min-w-[230px] border-r flex flex-col">
      <div data-tauri-drag-region className="bg-transparent h-7 cursor-grab active:cursor-grabbing"/>
      <div className="divider flex items-center gap-2.5 px-4 py-5 border-b">
        <span className="text-xl">⏱</span>
        <span className="text-main text-[17px] font-bold tracking-tight">Punchly</span>
      </div>

      {timerRunning && (
        <div className={`mx-3 mt-3.5 rounded-lg p-3.5 flex flex-col gap-1.5 border ${
          isIdle
            ? 'warning-chip warning-border'
            : 'success-chip success-border'
        }`}>
          <div className="flex items-center gap-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-widest">
              {isIdle ? 'Idle' : 'Tracking'}
            </div>
            {isIdle && <span className="text-[10px]">💤</span>}
          </div>
          <div className={`tabular text-[26px] font-bold leading-none ${isIdle ? 'opacity-70' : ''}`}>
            {formatDuration(timerElapsed)}
          </div>
          <div className="text-subtle text-xs truncate" title={timerSubject ?? ''}>
            {timerSubject}
          </div>
          <button
            onClick={onStopTimer}
            className="btn-danger mt-1 w-full text-xs font-semibold rounded py-1.5 px-3 transition-colors cursor-pointer"
          >
            ■ Stop
          </button>
        </div>
      )}

      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        {nav.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex items-center gap-2.5 w-full text-left px-2.5 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              view === item.id
                ? 'nav-active'
                : 'nav-idle text-muted'
            }`}
          >
            <span className="w-4.5 text-center text-[15px]">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="divider p-3 border-t">
        <button
          onClick={onToggleTheme}
          className="nav-idle text-subtle flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer"
        >
          <span>{theme === 'dark' ? '☀' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
    </aside>
  );
}
