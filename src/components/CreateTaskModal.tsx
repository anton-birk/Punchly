import { useState, useEffect, useRef } from 'react';
import { getProjects, getTypes, getPriorities, createWorkPackage, getProjectWpForm, getProjectVersions, uploadAttachment } from '../api/openproject';
import type { Settings, Project, WorkPackageType, Priority, Assignee, Version } from '../types/openproject';

interface Props {
  settings: Settings;
  onClose: () => void;
  onCreated: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreateTaskModal({ settings, onClose, onCreated }: Props) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [types, setTypes] = useState<WorkPackageType[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [projectId, setProjectId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [versionId, setVersionId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getProjects(settings), getTypes(settings), getPriorities(settings)])
      .then(([p, t, pr]) => {
        const projs = p._embedded.elements.filter((x) => x.active);
        setProjects(projs);
        setTypes(t._embedded.elements);
        setPriorities(pr._embedded.elements);
        if (projs.length) setProjectId(String(projs[0].id));
        const defType = t._embedded.elements.find((x) => x.isDefault) ?? t._embedded.elements[0];
        if (defType) setTypeId(String(defType.id));
        const defPriority = pr._embedded.elements.find((x) => x.isDefault) ?? pr._embedded.elements[0];
        if (defPriority) setPriorityId(String(defPriority.id));
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const id = Number(projectId);
    getProjectWpForm(settings, id).then(({ assignees: a }) => {
      setAssignees(a);
      setAssigneeId('');
    });
    getProjectVersions(settings, id).then((v) => {
      setVersions(v);
      setVersionId('');
    });
  }, [projectId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !projectId || !typeId) return;
    setSaving(true);
    setError('');
    try {
      const wp = await createWorkPackage(
        settings,
        subject.trim(),
        `/api/v3/projects/${projectId}`,
        `/api/v3/types/${typeId}`,
        undefined,
        priorityId ? `/api/v3/priorities/${priorityId}` : undefined,
        description.trim() || undefined,
        assigneeId ? `/api/v3/users/${assigneeId}` : undefined,
        versionId ? `/api/v3/versions/${versionId}` : undefined,
      );
      for (const file of files) {
        await uploadAttachment(settings, wp.id, file);
      }
      onCreated();
      onClose();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  const inputCls = 'input-field w-full border rounded-md px-3 py-2 text-sm outline-none transition-colors';
  const labelCls = 'text-subtle block text-xs font-semibold uppercase tracking-wide mb-1.5';

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="elevated border rounded-xl w-[560px] max-w-[90vw] max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="divider flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-main text-sm font-bold">New Task</h3>
          <button onClick={onClose} className="text-subtle hover:text-[var(--app-text)] text-lg px-1 cursor-pointer">✕</button>
        </div>

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

            <div>
              <label className={labelCls}>Priority</label>
              <select className={inputCls} value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
                {priorities.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Assignee</label>
                <select className={inputCls} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Version</label>
                <select className={inputCls} value={versionId} onChange={(e) => setVersionId(e.target.value)}>
                  <option value="">— None —</option>
                  {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Description</label>
              <textarea className={inputCls + ' resize-none'} placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls + ' mb-0'}>Attachments</label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="link-accent text-xs font-medium cursor-pointer"
                >
                  + Add file
                </button>
              </div>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
              {files.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {files.map((file, i) => (
                    <div key={i} className="surface-muted flex items-center gap-2 rounded-md px-3 py-2 text-sm">
                      <span className="text-subtle text-base">{file.type.startsWith('image/') ? '🖼' : '📎'}</span>
                      <span className="text-main flex-1 truncate">{file.name}</span>
                      <span className="text-subtle text-xs shrink-0">{formatBytes(file.size)}</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-subtle hover:text-[var(--danger)] cursor-pointer ml-1 text-base leading-none">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="danger-chip danger-border text-xs border rounded-md p-3 break-all">{error}</div>
            )}
          </div>

          <div className="divider flex justify-end gap-2.5 px-5 py-4 border-t">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm font-medium rounded-md border transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="submit" disabled={!subject.trim() || !projectId || !typeId || saving} className="btn-primary px-4 py-2 text-sm font-semibold rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer">
              {saving ? (files.length ? 'Uploading…' : 'Creating…') : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
