import { useState, useEffect, useCallback } from 'react';
import { getWorkPackages, getStatuses, getProjects, parseISODuration } from '../api/openproject';
import type { Settings, WorkPackage, Status, Project } from '../types/openproject';
import { CreateTaskModal } from './CreateTaskModal';
import { TaskDetailPanel } from './TaskDetailPanel';

interface Props {
  settings: Settings;
  onlyMine: boolean;
  currentUserId: number | null;
  runningWpId: number | null;
  onStartTimer: (wp: WorkPackage) => void;
  onStopTimer: () => void;
}

const PAGE_SIZE = 30;

const priorityColor: Record<string, string> = {
  immediate: 'text-red-400 bg-red-500/10',
  urgent: 'text-red-400 bg-red-500/10',
  high: 'text-amber-400 bg-amber-500/10',
  normal: 'text-zinc-400 bg-zinc-500/10',
  low: 'text-zinc-500 bg-zinc-500/8',
};

export function TasksView({ settings, onlyMine, currentUserId, runningWpId, onStartTimer, onStopTimer }: Props) {
  const [tasks, setTasks] = useState<WorkPackage[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedWp, setSelectedWp] = useState<WorkPackage | null>(null);

  useEffect(() => {
    Promise.all([getStatuses(settings), getProjects(settings)]).then(([s, p]) => {
      setStatuses(s._embedded.elements);
      setProjects(p._embedded.elements.filter((x) => x.active));
    });
  }, [settings.url, settings.apiKey]);

  const buildFilters = useCallback(() => {
    const filters: object[] = [];
    if (onlyMine && currentUserId) {
      filters.push({ assignee: { operator: '=', values: [String(currentUserId)] } });
    }
    if (filterStatus) {
      filters.push({ status: { operator: '=', values: [filterStatus] } });
    } else {
      filters.push({ status: { operator: 'o' } });
    }
    if (filterProject) {
      filters.push({ project: { operator: '=', values: [filterProject] } });
    }
    if (search.trim()) {
      // 'subject' with '**' (contains) — works across all OpenProject versions
      filters.push({ subject: { operator: '**', values: [search.trim()] } });
    }
    return filters;
  }, [onlyMine, currentUserId, filterStatus, filterProject, search]);

  const load = useCallback(
    async (page = 1, append = false) => {
      setLoading(true);
      try {
        const result = await getWorkPackages(settings, buildFilters(), PAGE_SIZE, page);
        const elements = result._embedded.elements;
        setTasks((prev) => (append ? [...prev, ...elements] : elements));
        setTotal(result.total);
        setOffset(page);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [settings, buildFilters],
  );

  useEffect(() => {
    load(1);
  }, [settings.url, settings.apiKey, onlyMine, currentUserId, filterStatus, filterProject]);

  // Keep selected panel in sync when task is updated
  const handleTaskUpdated = (updated: WorkPackage) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedWp(updated);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(1);
  };

  const selectCls = 'h-9 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2.5 text-sm text-zinc-700 dark:text-zinc-300 outline-none focus:border-indigo-500 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors cursor-pointer flex-shrink-0';

  const hasMore = tasks.length < total;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Task list column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-0">
          <h2 className="text-lg font-bold">{onlyMine ? 'My Tasks' : 'All Tasks'}</h2>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 text-sm font-semibold rounded-md bg-indigo-500 hover:bg-indigo-600 text-white transition-colors cursor-pointer"
          >
            + New Task
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5 px-6 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-0">
            <input
              className="flex-1 min-w-0 h-9 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 outline-none focus:border-indigo-500 transition-colors"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" className="h-9 px-3.5 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap">
              Search
            </button>
          </form>

          <select className={selectCls} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Open</option>
            {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select className={selectCls} value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3 flex flex-col gap-1.5">
          {loading && tasks.length === 0 && (
            <div className="flex items-center justify-center py-16 text-sm text-zinc-400">Loading…</div>
          )}
          {!loading && tasks.length === 0 && (
            <div className="flex items-center justify-center py-16 text-sm text-zinc-400">No tasks found</div>
          )}

          {tasks.map((wp) => {
            const isTracking = runningWpId === wp.id;
            const isSelected = selectedWp?.id === wp.id;
            const projectTitle = wp._links.project?.title ?? '';
            const priorityTitle = wp._links.priority?.title ?? '';
            const typeTitle = wp._links.type?.title ?? '';
            const statusTitle = wp._links.status?.title ?? '';
            const pKey = priorityTitle.toLowerCase();
            const spent = parseISODuration(wp.spentTime);

            return (
              <div
                key={wp.id}
                onClick={() => setSelectedWp(isSelected ? null : wp)}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-500/5 border-indigo-500/40'
                    : isTracking
                    ? 'bg-emerald-500/5 border-emerald-500/30'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                {/* Timer button */}
                <button
                  title={isTracking ? 'Stop timer' : 'Start timer'}
                  onClick={(e) => { e.stopPropagation(); isTracking ? onStopTimer() : onStartTimer(wp); }}
                  className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-[11px] transition-colors cursor-pointer ${
                    isTracking
                      ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-400 hover:border-indigo-500 hover:text-indigo-500 hover:bg-indigo-500/10'
                  }`}
                >
                  {isTracking ? '■' : '▶'}
                </button>

                {/* Task info */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
                      {typeTitle}
                    </span>
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-600 tabular flex-shrink-0">#{wp.id}</span>
                    <span className="text-[11px] text-zinc-400 ml-auto truncate max-w-[110px] flex-shrink-0">{projectTitle}</span>
                  </div>

                  <div className="text-sm font-medium truncate">{wp.subject}</div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${priorityColor[pKey] ?? priorityColor['normal']}`}>
                      {priorityTitle}
                    </span>
                    {/* Status — plain text */}
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500 flex-shrink-0">
                      {statusTitle}
                    </span>
                    {wp.percentageDone > 0 && (
                      <span className="text-[11px] text-zinc-400 flex-shrink-0">{wp.percentageDone}%</span>
                    )}
                    {spent.hours > 0 && (
                      <span className="ml-auto text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded tabular flex-shrink-0">
                        ⏱ {spent.display}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <button
              onClick={() => load(offset + 1, true)}
              disabled={loading}
              className="mt-2 w-full py-2.5 text-sm text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {loading ? 'Loading…' : `Load more (${total - tasks.length} remaining)`}
            </button>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedWp && (
        <TaskDetailPanel
          wp={selectedWp}
          settings={settings}
          statuses={statuses}
          runningWpId={runningWpId}
          onStartTimer={onStartTimer}
          onStopTimer={onStopTimer}
          onClose={() => setSelectedWp(null)}
          onUpdated={handleTaskUpdated}
        />
      )}

      {showModal && (
        <CreateTaskModal
          settings={settings}
          onClose={() => setShowModal(false)}
          onCreated={() => load(1)}
        />
      )}
    </div>
  );
}
