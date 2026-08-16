import { useState, useEffect, useCallback } from 'react';
import { getWorkPackages, getStatuses, getProjects, updateWorkPackage, idFromHref } from '../api/openproject';
import type { Settings, WorkPackage, Status, Project } from '../types/openproject';
import { CreateTaskModal } from './CreateTaskModal';

interface Props {
  settings: Settings;
  onlyMine: boolean;
  currentUserId: number | null;
  runningWpId: number | null;
  onStartTimer: (wp: WorkPackage) => void;
}

const PAGE_SIZE = 30;

export function TasksView({ settings, onlyMine, currentUserId, runningWpId, onStartTimer }: Props) {
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
  const [updatingId, setUpdatingId] = useState<number | null>(null);

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
      filters.push({ subjectOrId: { operator: '**', values: [search.trim()] } });
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(1);
  };

  const handleStatusChange = async (wp: WorkPackage, statusId: string) => {
    setUpdatingId(wp.id);
    try {
      const updated = await updateWorkPackage(
        settings,
        wp.id,
        wp.lockVersion,
        `/api/v3/statuses/${statusId}`,
      );
      setTasks((prev) => prev.map((t) => (t.id === wp.id ? updated : t)));
    } catch (e) {
      console.error(e);
    } finally {
      setUpdatingId(null);
    }
  };

  const hasMore = tasks.length < total;

  return (
    <div className="tasks-view">
      <div className="view-header">
        <h2 className="view-title">{onlyMine ? 'My Tasks' : 'All Tasks'}</h2>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Task</button>
      </div>

      <div className="filter-bar">
        <form className="filter-search" onSubmit={handleSearch}>
          <input
            className="form-input filter-input"
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">Search</button>
        </form>

        <select
          className="form-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">Open Statuses</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          className="form-select"
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="task-list">
        {loading && tasks.length === 0 && (
          <div className="empty-state">Loading…</div>
        )}

        {!loading && tasks.length === 0 && (
          <div className="empty-state">No tasks found</div>
        )}

        {tasks.map((wp) => {
          const isTracking = runningWpId === wp.id;
          const projectTitle = wp._links.project?.title ?? '';
          const priorityTitle = wp._links.priority?.title ?? '';
          const typeTitle = wp._links.type?.title ?? '';
          const statusId = idFromHref(wp._links.status?.href ?? '');

          return (
            <div key={wp.id} className={`task-card${isTracking ? ' task-card-tracking' : ''}`}>
              <button
                className={`task-timer-btn${isTracking ? ' tracking' : ''}`}
                title={isTracking ? 'Currently tracking' : 'Start timer'}
                onClick={() => !isTracking && onStartTimer(wp)}
              >
                {isTracking ? '■' : '▶'}
              </button>

              <div className="task-body">
                <div className="task-meta-top">
                  <span className="task-type-badge">{typeTitle}</span>
                  <span className="task-id">#{wp.id}</span>
                  <span className="task-project">{projectTitle}</span>
                </div>
                <div className="task-subject">{wp.subject}</div>
                <div className="task-meta-bottom">
                  <span className={`task-priority priority-${priorityTitle.toLowerCase()}`}>
                    {priorityTitle}
                  </span>
                  {wp.percentageDone > 0 && (
                    <span className="task-progress">{wp.percentageDone}%</span>
                  )}
                </div>
              </div>

              <div className="task-status-col">
                {updatingId === wp.id ? (
                  <span className="task-status-loading">…</span>
                ) : (
                  <select
                    className="task-status-select"
                    value={statusId}
                    onChange={(e) => handleStatusChange(wp, e.target.value)}
                  >
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}

        {hasMore && (
          <button
            className="load-more-btn"
            onClick={() => load(offset + 1, true)}
            disabled={loading}
          >
            {loading ? 'Loading…' : `Load more (${total - tasks.length} remaining)`}
          </button>
        )}
      </div>

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
