import { useState, useEffect } from 'react';
import './App.css';
import { useSettings } from './hooks/useSettings';
import { useTimer } from './hooks/useTimer';
import { Sidebar } from './components/Sidebar';
import { TasksView } from './components/TasksView';
import { SettingsView } from './components/SettingsView';
import { testConnection, logTime, idFromHref } from './api/openproject';
import type { View, WorkPackage, User } from './types/openproject';

type Theme = 'dark' | 'light';

function loadTheme(): Theme {
  return (localStorage.getItem('punchly_theme') as Theme) ?? 'dark';
}

function App() {
  const { settings, save: saveSettings, isConfigured } = useSettings();
  const { timer, elapsed, start, stop } = useTimer();
  const [view, setView] = useState<View>(isConfigured ? 'my-tasks' : 'settings');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [logError, setLogError] = useState('');
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    if (!isConfigured) return;
    testConnection(settings)
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null));
  }, [settings.url, settings.apiKey]);

  useEffect(() => {
    if (!isConfigured) setView('settings');
  }, [isConfigured]);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('punchly_theme', next);
  };

  const handleStartTimer = (wp: WorkPackage) => {
    const projectHref = wp._links.project?.href ?? '';
    const projectId = idFromHref(projectHref);
    start(wp.id, wp.subject, projectHref, projectId);
  };

  const handleStopTimer = async () => {
    const result = stop();
    if (!result) return;
    const { elapsed: secs, timer: t } = result;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await logTime(settings, t.workPackageId, t.projectId, secs, t.comment, today);
      setLogError('');
    } catch (e) {
      setLogError(`Не удалось записать время: ${e}`);
    }
  };

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans antialiased">
        <Sidebar
          view={view}
          onNavigate={setView}
          timerRunning={timer?.isRunning ?? false}
          timerElapsed={elapsed}
          timerSubject={timer?.workPackageSubject ?? null}
          onStopTimer={handleStopTimer}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
          {logError && (
            <div className="flex items-center justify-between gap-3 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs px-5 py-2">
              <span>{logError}</span>
              <button onClick={() => setLogError('')} className="hover:text-red-300">✕</button>
            </div>
          )}

          {view === 'my-tasks' && (
            <TasksView
              settings={settings}
              onlyMine={true}
              currentUserId={currentUser?.id ?? null}
              runningWpId={timer?.workPackageId ?? null}
              onStartTimer={handleStartTimer}
              onStopTimer={handleStopTimer}
            />
          )}

          {view === 'all-tasks' && (
            <TasksView
              settings={settings}
              onlyMine={false}
              currentUserId={currentUser?.id ?? null}
              runningWpId={timer?.workPackageId ?? null}
              onStartTimer={handleStartTimer}
              onStopTimer={handleStopTimer}
            />
          )}

          {view === 'settings' && (
            <SettingsView settings={settings} onSave={saveSettings} />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
