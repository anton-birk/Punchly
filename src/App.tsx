import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { useSettings } from './hooks/useSettings';
import { useTimer } from './hooks/useTimer';
import { useIdleDetection, type IdleEvent } from './hooks/useIdleDetection';
import { Sidebar } from './components/Sidebar';
import { TasksView } from './components/TasksView';
import { SettingsView } from './components/SettingsView';
import { IdleDialog } from './components/IdleDialog';
import { testConnection, logTime, idFromHref } from './api/openproject';
import type { View, WorkPackage, User } from './types/openproject';

type Theme = 'dark' | 'light';

function loadTheme(): Theme {
  return (localStorage.getItem('punchly_theme') as Theme) ?? 'dark';
}

function App() {
  const { settings, save: saveSettings, isConfigured } = useSettings();
  const { timer, elapsed, start, stop, deductIdle } = useTimer();
  const [view, setView] = useState<View>(isConfigured ? 'my-tasks' : 'settings');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [logError, setLogError] = useState('');
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [pendingIdle, setPendingIdle] = useState<IdleEvent | null>(null);

  useEffect(() => {
    if (!isConfigured) return;
    testConnection(settings).then(setCurrentUser).catch(() => setCurrentUser(null));
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
    start(wp.id, wp.subject, projectHref, idFromHref(projectHref));
  };

  const handleStopTimer = async () => {
    const result = stop();
    if (!result) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await logTime(settings, result.timer.workPackageId, result.timer.projectId, result.elapsed, result.timer.comment, today);
      setLogError('');
    } catch (e) {
      setLogError(`Failed to log time: ${e}`);
    }
  };

  const handleIdleEnd = useCallback((e: IdleEvent) => {
    setPendingIdle(e);
  }, []);

  const handleIdleKeep = () => setPendingIdle(null);

  const handleIdleDeduct = () => {
    if (pendingIdle) deductIdle(pendingIdle.idleSeconds);
    setPendingIdle(null);
  };

  const { isIdle } = useIdleDetection(
    settings.idleEnabled,
    settings.idleThresholdMin,
    timer?.isRunning ?? false,
    handleIdleEnd,
  );

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="flex h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans antialiased">
        <Sidebar
          view={view}
          onNavigate={setView}
          timerRunning={timer?.isRunning ?? false}
          timerElapsed={elapsed}
          timerSubject={timer?.workPackageSubject ?? null}
          isIdle={isIdle}
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

      {pendingIdle && (
        <IdleDialog
          idleSeconds={pendingIdle.idleSeconds}
          idleStartedAt={pendingIdle.idleStartedAt}
          onKeep={handleIdleKeep}
          onDeduct={handleIdleDeduct}
        />
      )}
    </div>
  );
}

export default App;
