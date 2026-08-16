import { useState, useEffect } from 'react';
import { getTimeEntries, updateWorkPackage, parseISODuration, idFromHref } from '../api/openproject';
import type { Settings, WorkPackage, TimeEntry, Status } from '../types/openproject';

interface Props {
  wp: WorkPackage;
  settings: Settings;
  statuses: Status[];
  runningWpId: number | null;
  onStartTimer: (wp: WorkPackage) => void;
  onStopTimer: () => void;
  onClose: () => void;
  onUpdated: (wp: WorkPackage) => void;
}

export function TaskDetailPanel({ wp, settings, statuses, runningWpId, onStartTimer, onStopTimer, onClose, onUpdated }: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [entriesError, setEntriesError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const isTracking = runningWpId === wp.id;
  const spent = parseISODuration(wp.spentTime);
  const currentStatusId = idFromHref(wp._links.status?.href ?? '');

  useEffect(() => {
    setLoadingEntries(true);
    setEntriesError('');
    getTimeEntries(settings, wp.id)
      .then((r) => {
        const all = r._embedded.elements;
        // Filter client-side — handles fallback mode where API returned all entries
        const filtered = all.filter((e) => {
          const href = e._links.workPackage?.href ?? '';
          return href.endsWith(`/${wp.id}`);
        });
        setEntries(filtered);
      })
      .catch((e) => setEntriesError(String(e)))
      .finally(() => setLoadingEntries(false));
  }, [wp.id, settings.url, settings.apiKey]);

  const handleStatusChange = async (statusId: string) => {
    setUpdatingStatus(true);
    try {
      const updated = await updateWorkPackage(settings, wp.id, wp.lockVersion, `/api/v3/statuses/${statusId}`);
      onUpdated(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Group entries by date, sorted desc
  const byDate = entries.reduce<Record<string, TimeEntry[]>>((acc, e) => {
    (acc[e.spentOn] ??= []).push(e);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const totalFromEntries = entries.reduce((sum, e) => sum + parseISODuration(e.hours).hours, 0);
  const totalHours = totalFromEntries > 0 ? totalFromEntries : spent.hours;
  const totalDisplay = totalHours > 0
    ? `${Math.floor(totalHours)}h ${Math.round((totalHours % 1) * 60)}m`
    : '—';

  const typeTitle = wp._links.type?.title ?? '';
  const projectTitle = wp._links.project?.title ?? '';
  const priorityTitle = wp._links.priority?.title ?? '';
  const assigneeTitle = wp._links.assignee?.title ?? '';

  const selectCls = 'bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2.5 py-1.5 text-sm text-zinc-800 dark:text-zinc-200 outline-none focus:border-indigo-500 transition-colors cursor-pointer';

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 w-[400px] min-w-[360px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
            {typeTitle}
          </span>
          <span className="text-xs text-zinc-400 tabular flex-shrink-0">#{wp.id}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isTracking ? (
            <button
              onClick={onStopTimer}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer"
            >
              ■ Stop
            </button>
          ) : (
            <button
              onClick={() => onStartTimer(wp)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-indigo-500 hover:bg-indigo-600 text-white transition-colors cursor-pointer"
            >
              ▶ Track
            </button>
          )}
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 w-7 h-7 flex items-center justify-center rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-base"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {/* Subject */}
        <h3 className="text-base font-semibold leading-snug">{wp.subject}</h3>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <MetaRow label="Project" value={projectTitle} />
          <MetaRow label="Priority" value={priorityTitle} />
          {assigneeTitle && <MetaRow label="Assignee" value={assigneeTitle} />}
          {wp.percentageDone > 0 && <MetaRow label="Progress" value={`${wp.percentageDone}%`} />}

          {/* Status — editable */}
          <div className="col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 mb-1.5">
              Status
            </div>
            {updatingStatus ? (
              <span className="text-sm text-zinc-400">Updating…</span>
            ) : (
              <select
                className={selectCls}
                value={currentStatusId}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Description */}
        {wp.description?.raw && (
          <section>
            <SectionTitle>Description</SectionTitle>
            <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
              {wp.description.raw}
            </div>
          </section>
        )}

        {/* Time */}
        <section>
          <SectionTitle>
            Time Tracked
            {totalHours > 0 && (
              <span className="ml-2 text-emerald-500 font-semibold">{totalDisplay}</span>
            )}
          </SectionTitle>

          <div className="mt-2">
            {loadingEntries && (
              <p className="text-sm text-zinc-400">Loading…</p>
            )}
            {!loadingEntries && entriesError && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded p-2 break-all">{entriesError}</p>
            )}
            {!loadingEntries && !entriesError && entries.length === 0 && (
              <p className="text-sm text-zinc-400 dark:text-zinc-600">No time logged yet</p>
            )}

            {!loadingEntries && dates.map((date) => {
              const dayEntries = byDate[date];
              const dayTotal = dayEntries.reduce((s, e) => s + parseISODuration(e.hours).hours, 0);
              const dH = Math.floor(dayTotal);
              const dM = Math.round((dayTotal % 1) * 60);
              const dayDisplay = dH || dM ? `${dH}h ${dM}m` : '—';

              return (
                <div key={date} className="mb-3">
                  <div className="flex items-center justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      {formatDate(date)}
                    </span>
                    <span className="text-xs font-semibold tabular text-zinc-700 dark:text-zinc-300">
                      {dayDisplay}
                    </span>
                  </div>
                  {dayEntries.map((entry) => {
                    const dur = parseISODuration(entry.hours);
                    return (
                      <div key={entry.id} className="flex items-start gap-2.5 py-2 pl-2">
                        <span className="text-xs font-semibold tabular text-zinc-700 dark:text-zinc-300 min-w-[44px] flex-shrink-0 pt-px">
                          {dur.display}
                        </span>
                        <div className="min-w-0 flex flex-col gap-0.5">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {entry._links.user?.title ?? 'Unknown'}
                          </span>
                          {entry.comment?.raw && (
                            <span className="text-xs text-zinc-400 dark:text-zinc-600 line-clamp-2">
                              {entry.comment.raw}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-600 mb-0.5">{label}</div>
      <div className="text-sm text-zinc-700 dark:text-zinc-300">{value || '—'}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-600">
      <span className="flex-shrink-0">{children}</span>
      <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}
