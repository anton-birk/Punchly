import { useState, useEffect } from 'react';
import { getProjects, getTypes, getStatuses, getPriorities, createWorkPackage } from '../api/openproject';
import type { Settings, Project, WorkPackageType, Status, Priority } from '../types/openproject';

interface Props {
  settings: Settings;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateTaskModal({ settings, onClose, onCreated }: Props) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [types, setTypes] = useState<WorkPackageType[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [projectId, setProjectId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getProjects(settings), getTypes(settings), getStatuses(settings), getPriorities(settings)])
      .then(([p, t, s, pr]) => {
        const projs = p._embedded.elements.filter((x) => x.active);
        setProjects(projs);
        setTypes(t._embedded.elements);
        setStatuses(s._embedded.elements);
        setPriorities(pr._embedded.elements);
        if (projs.length) setProjectId(String(projs[0].id));
        const defType = t._embedded.elements.find((x) => x.isDefault) ?? t._embedded.elements[0];
        if (defType) setTypeId(String(defType.id));
        const defStatus = s._embedded.elements.find((x) => x.isDefault) ?? s._embedded.elements[0];
        if (defStatus) setStatusId(String(defStatus.id));
        const defPriority = pr._embedded.elements.find((x) => x.isDefault) ?? pr._embedded.elements[0];
        if (defPriority) setPriorityId(String(defPriority.id));
      })
      .catch((e) => setError(String(e)));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !projectId || !typeId) return;
    setSaving(true);
    setError('');
    try {
      await createWorkPackage(
        settings,
        subject.trim(),
        `/api/v3/projects/${projectId}`,
        `/api/v3/types/${typeId}`,
        statusId ? `/api/v3/statuses/${statusId}` : undefined,
        priorityId ? `/api/v3/priorities/${priorityId}` : undefined,
        description.trim() || undefined,
      );
      onCreated();
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const inputCls = 'w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 outline-none focus:border-indigo-500 transition-colors';
  const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5';

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl w-[500px] max-w-[90vw] max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-sm font-bold">New Task</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-lg px-1 cursor-pointer">✕</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col overflow-y-auto">
          <div className="p-5 flex flex-col gap-4">
            <div>
              <label className={labelCls}>Subject *</label>
              <input className={inputCls} placeholder="Task title" value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Project *</label>
                <select className={inputCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Type *</label>
                <select className={inputCls} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Status</label>
                <select className={inputCls} value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                  {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <select className={inputCls} value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
                  {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Description</label>
              <textarea className={inputCls + ' resize-none'} placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md p-3 break-all">{error}</div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2.5 px-5 py-4 border-t border-zinc-200 dark:border-zinc-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={!subject.trim() || !projectId || !typeId || saving} className="px-4 py-2 text-sm font-semibold rounded-md bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
