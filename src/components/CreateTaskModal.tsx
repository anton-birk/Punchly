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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Task</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Subject *</label>
            <input
              className="form-input"
              placeholder="Task title"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Project *</label>
              <select className="form-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Type *</label>
              <select className="form-select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-select" value={priorityId} onChange={(e) => setPriorityId(e.target.value)}>
                {priorities.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              placeholder="Optional description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!subject.trim() || !projectId || !typeId || saving}>
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
