import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { useSettings } from './hooks/useSettings';
import { useTimer } from './hooks/useTimer';
import { useIdleDetection, type IdleEvent } from './hooks/useIdleDetection';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { Sidebar } from './components/Sidebar';
import { TasksView } from './components/TasksView';
import { SettingsView } from './components/SettingsView';
import { IdleDialog } from './components/IdleDialog';
import { testConnection, logTime, idFromHref } from './api/openproject';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { useUpdateCheck } from './hooks/useUpdateCheck';
import type { View, WorkPackage, User } from './types/openproject';

type Theme = 'dark' | 'light';

function loadTheme(): Theme {
  return (localStorage.getItem('punchly_theme') as Theme) ?? 'dark';
}

function App() {
  const { settings, save: saveSettings, isConfigured } = useSettings();
  const { timer, elapsed, start, stop, pauseTimer, resumeTimer } = useTimer();
  const pausedAtRef = useRef<number | null>(null);
  const pendingDeductRef = useRef<number>(0);
  const { updateAvailable, latestVersion, releaseUrl, dismiss: dismissUpdate } = useUpdateCheck();
  const [view, setView] = useState<View>(isConfigured ? 'my-tasks' : 'settings');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [logError, setLogError] = useState('');
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [idleQueue, setIdleQueue] = useState<IdleEvent[]>([]);
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0);
  const isOnline = useNetworkStatus();
  const wasOfflineRef = useRef(false);

  // Auto-request notification permission on first launch.
  useEffect(() => {
    isPermissionGranted().then(granted => {
      if (!granted) requestPermission();
    });
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    testConnection(settings).then(setCurrentUser).catch(() => setCurrentUser(null));
  }, [settings.url, settings.apiKey]);

  useEffect(() => {
    if (isOnline && wasOfflineRef.current) {
      wasOfflineRef.current = false;
      if (isConfigured) {
        testConnection(settings).then(setCurrentUser).catch(() => setCurrentUser(null));
        setTasksRefreshKey((k) => k + 1);
      }
    }
    if (!isOnline) wasOfflineRef.current = true;
  }, [isOnline]);

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
    setIdleQueue(prev => {
      if (prev.length === 0) {
        // First idle in queue — pause the timer and freeze the tray.
        pausedAtRef.current = Date.now();
        pendingDeductRef.current = 0;
        pauseTimer();
        invoke('clear_rust_timer').catch(() => {});
      }
      return [...prev, e];
    });
  }, [pauseTimer]);

  const dismissFirst = useCallback((idleSecsToDeduct: number) => {
    pendingDeductRef.current += idleSecsToDeduct;
    setIdleQueue(prev => {
      const next = prev.slice(1);
      if (next.length === 0 && pausedAtRef.current !== null) {
        // All dialogs answered — resume, deducting idle time + time spent on dialogs.
        const dialogOpenSecs = Math.floor((Date.now() - pausedAtRef.current) / 1000);
        resumeTimer(dialogOpenSecs + pendingDeductRef.current);
        pausedAtRef.current = null;
      }
      return next;
    });
  }, [resumeTimer]);

  const handleIdleKeep = () => dismissFirst(0);
  const handleIdleDeduct = () => dismissFirst(idleQueue[0]?.idleSeconds ?? 0);

  const { isIdle } = useIdleDetection(
    settings.idleEnabled,
    settings.idleThresholdMin,
    timer?.isRunning ?? false,
    handleIdleEnd,
  );

  // Sync timer state to Rust so the tray-update thread (immune to WKWebView throttling)
  // can update the menu-bar title every second without JS involvement.
  useEffect(() => {
    if (timer?.isRunning) {
      invoke('set_rust_timer', {
        startMs: timer.startTime,
        idleDeductedSec: timer.idleDeductedSec ?? 0,
      }).catch(() => {});
    } else {
      invoke('clear_rust_timer').catch(() => {});
    }
  }, [timer?.isRunning, timer?.startTime, timer?.idleDeductedSec]);

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="app-shell flex h-screen overflow-hidden font-sans antialiased">
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

        <main className="app-main flex-1 flex flex-col overflow-hidden">
          {updateAvailable && (
            <div className="brand-soft brand-border flex items-center justify-between gap-3 border-b text-xs px-5 py-2">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] flex-shrink-0" />
                Punchly {latestVersion} is available.
                <button
                  onClick={() => openUrl(releaseUrl)}
                  className="link-accent underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Download
                </button>
              </span>
              <button onClick={dismissUpdate} className="link-accent transition-colors cursor-pointer">✕</button>
            </div>
          )}
          {!isOnline && (
            <div className="warning-chip warning-border flex items-center gap-2 border-b text-xs px-5 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] flex-shrink-0" />
              No internet connection — timer is still running, changes will sync when back online.
            </div>
          )}
          {logError && (
            <div className="danger-chip danger-border flex items-center justify-between gap-3 border-b text-xs px-5 py-2">
              <span>{logError}</span>
              <button onClick={() => setLogError('')} className="hover:opacity-80">✕</button>
            </div>
          )}

          {view === 'my-tasks' && (
            <TasksView
              key={`my-${tasksRefreshKey}`}
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
              key={`all-${tasksRefreshKey}`}
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

      {idleQueue.length > 0 && (
        <IdleDialog
          idleSeconds={idleQueue[0].idleSeconds}
          idleStartedAt={idleQueue[0].idleStartedAt}
          onKeep={handleIdleKeep}
          onDeduct={handleIdleDeduct}
        />
      )}
    </div>
  );
}

export default App;
