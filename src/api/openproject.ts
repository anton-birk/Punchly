import { invoke } from '@tauri-apps/api/core';
import type { Settings, WorkPackage, User, Status, Project, WorkPackageType, Priority, TimeEntry, Assignee, Version } from '../types/openproject';

interface ApiCollection<T> {
  _embedded: { elements: T[] };
  total: number;
  count: number;
  pageSize: number;
  offset: number;
}

export async function testConnection(settings: Settings): Promise<User> {
  return await invoke<User>('test_connection', { url: settings.url, apiKey: settings.apiKey });
}

export async function getWorkPackages(
  settings: Settings,
  filters: object[] = [],
  pageSize = 50,
  offset = 1,
): Promise<ApiCollection<WorkPackage>> {
  return await invoke('get_work_packages', {
    url: settings.url,
    apiKey: settings.apiKey,
    filters: JSON.stringify(filters),
    pageSize,
    offset,
    sortBy: JSON.stringify([['updatedAt', 'desc']]),
  });
}

export async function getWorkPackage(settings: Settings, id: number): Promise<WorkPackage> {
  return await invoke('get_work_package', { url: settings.url, apiKey: settings.apiKey, id });
}

export async function updateWorkPackage(
  settings: Settings,
  id: number,
  lockVersion: number,
  statusHref?: string,
): Promise<WorkPackage> {
  const data: Record<string, unknown> = { lockVersion };
  if (statusHref) {
    data['_links'] = { status: { href: statusHref } };
  }
  return await invoke('update_work_package', { url: settings.url, apiKey: settings.apiKey, id, data });
}

export async function createWorkPackage(
  settings: Settings,
  subject: string,
  projectHref: string,
  typeHref: string,
  statusHref?: string,
  priorityHref?: string,
  description?: string,
  assigneeHref?: string,
  versionHref?: string,
): Promise<WorkPackage> {
  const links: Record<string, { href: string }> = {
    project: { href: projectHref },
    type: { href: typeHref },
  };
  if (statusHref) links['status'] = { href: statusHref };
  if (priorityHref) links['priority'] = { href: priorityHref };
  if (assigneeHref) links['assignee'] = { href: assigneeHref };
  if (versionHref) links['version'] = { href: versionHref };

  const data: Record<string, unknown> = { subject, _links: links };
  if (description) data['description'] = { raw: description };

  return await invoke('create_work_package', { url: settings.url, apiKey: settings.apiKey, data });
}

async function getMembersAsAssignees(settings: Settings, projectId: number): Promise<Assignee[]> {
  const parseElements = (res: any): Assignee[] =>
    (res?._embedded?.elements ?? [])
      .filter((el: any) => el?._type === 'User' || el?._type === 'PlaceholderUser' || el?.id)
      .map((el: any) => ({ id: el.id as number, name: el.name as string }))
      .filter((a: Assignee) => a.id && a.name);

  try {
    const res: any = await invoke('get_project_assignees', { url: settings.url, apiKey: settings.apiKey, projectId });
    const assignees = parseElements(res);
    if (assignees.length) return assignees;
  } catch {}

  try {
    const res: any = await invoke('get_project_members', { url: settings.url, apiKey: settings.apiKey, projectId });
    return (res?._embedded?.elements ?? [])
      .map((el: any) => {
        const p = el?._links?.principal;
        if (!p?.href) return null;
        const id = parseInt(p.href.split('/').pop() ?? '0', 10);
        return id ? { id, name: p.title ?? String(id) } : null;
      })
      .filter(Boolean) as Assignee[];
  } catch {
    return [];
  }
}

export async function getProjectWpForm(settings: Settings, projectId: number): Promise<{ statuses: Status[]; assignees: Assignee[] }> {
  // Try the form endpoint first (requires add_work_packages permission)
  try {
    const form: any = await invoke('get_project_wp_form', { url: settings.url, apiKey: settings.apiKey, projectId });
    const schema = form?._embedded?.schema;

    const statuses: Status[] =
      schema?.status?._embedded?.allowedValues ??
      (schema?.status?._links?.allowedValues ?? []).map((l: any) => ({
        id: parseInt(l.href.split('/').pop(), 10),
        name: l.title ?? l.href,
        isClosed: false,
        isDefault: false,
      }));

    const assigneeEmbedded: Assignee[] = schema?.assignee?._embedded?.allowedValues ?? [];
    const assigneeLinks: { href: string; title: string }[] = schema?.assignee?._links?.allowedValues ?? [];
    let assignees: Assignee[] = assigneeEmbedded.length
      ? assigneeEmbedded
      : assigneeLinks.map((l) => ({ id: parseInt(l.href.split('/').pop() ?? '0', 10), name: l.title }));

    if (!assignees.length) assignees = await getMembersAsAssignees(settings, projectId);

    return { statuses, assignees };
  } catch {
    const assignees = await getMembersAsAssignees(settings, projectId);
    return { statuses: [], assignees };
  }
}

export async function getProjectVersions(settings: Settings, projectId: number): Promise<Version[]> {
  try {
    const res: any = await invoke('get_project_versions', { url: settings.url, apiKey: settings.apiKey, projectId });
    return (res?._embedded?.elements ?? []).filter((v: Version) => v.status === 'open');
  } catch {
    return [];
  }
}

export async function uploadAttachment(settings: Settings, workPackageId: number, file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < uint8.length; i += 8192) {
    chunks.push(String.fromCharCode(...uint8.subarray(i, i + 8192)));
  }
  const dataBase64 = btoa(chunks.join(''));
  await invoke('upload_attachment', {
    url: settings.url,
    apiKey: settings.apiKey,
    workPackageId,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    dataBase64,
  });
}

export async function logTime(
  settings: Settings,
  workPackageId: number,
  projectId: number,
  seconds: number,
  comment: string,
  spentOn: string,
): Promise<void> {
  const hours = secondsToISO(seconds);
  const data = {
    hours,
    spentOn,
    comment: { raw: comment },
    _links: {
      project: { href: `/api/v3/projects/${projectId}` },
      workPackage: { href: `/api/v3/work_packages/${workPackageId}` },
    },
  };
  await invoke('log_time', { url: settings.url, apiKey: settings.apiKey, data });
}

export async function getStatuses(settings: Settings): Promise<ApiCollection<Status>> {
  return await invoke('get_statuses', { url: settings.url, apiKey: settings.apiKey });
}

export async function getProjects(settings: Settings): Promise<ApiCollection<Project>> {
  return await invoke('get_projects', { url: settings.url, apiKey: settings.apiKey });
}

export async function getTypes(settings: Settings): Promise<ApiCollection<WorkPackageType>> {
  return await invoke('get_types', { url: settings.url, apiKey: settings.apiKey });
}

export async function getPriorities(settings: Settings): Promise<ApiCollection<Priority>> {
  return await invoke('get_priorities', { url: settings.url, apiKey: settings.apiKey });
}

export function secondsToISO(seconds: number): string {
  if (seconds <= 0) return 'PT0S';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  let result = 'PT';
  if (h) result += `${h}H`;
  if (m) result += `${m}M`;
  if (s) result += `${s}S`;
  return result;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export async function getTimeEntries(settings: Settings, workPackageId: number): Promise<ApiCollection<TimeEntry>> {
  return await invoke('get_time_entries', { url: settings.url, apiKey: settings.apiKey, workPackageId });
}

/**
 * Returns allowed status transitions for a work package via the form endpoint.
 * Respects the current user's role and OpenProject workflow configuration.
 * Falls back to an empty array if the endpoint is unavailable.
 */
export async function getAllowedStatuses(settings: Settings, id: number, lockVersion: number): Promise<Status[]> {
  try {
    const form = await invoke<any>('get_work_package_form', {
      url: settings.url,
      apiKey: settings.apiKey,
      id,
      lockVersion,
    });
    return form?._embedded?.schema?.status?._embedded?.allowedValues ?? [];
  } catch {
    return [];
  }
}

export function idFromHref(href: string): number {
  return parseInt(href.split('/').pop() ?? '0', 10);
}

/** Парсит ISO 8601 duration "PT2H30M" → { hours: 2.5, display: "2h 30m" } */
export function parseISODuration(iso: string | undefined): { hours: number; display: string } {
  if (!iso || iso === 'PT0S' || iso === 'P0D') return { hours: 0, display: '—' };
  const m = iso.match(/PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return { hours: 0, display: '—' };
  const h = parseFloat(m[1] ?? '0');
  const min = parseInt(m[2] ?? '0');
  const total = h + min / 60;
  const dH = Math.floor(total);
  const dM = Math.round((total - dH) * 60);
  const parts: string[] = [];
  if (dH) parts.push(`${dH}h`);
  if (dM) parts.push(`${dM}m`);
  return { hours: total, display: parts.length ? parts.join(' ') : '—' };
}
