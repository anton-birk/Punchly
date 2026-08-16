export interface HalLink {
  href: string;
  title?: string;
}

export interface HalLinks {
  status: HalLink;
  project: HalLink;
  type: HalLink;
  priority: HalLink;
  assignee?: HalLink;
  responsible?: HalLink;
  parent?: HalLink;
}

export interface WorkPackage {
  id: number;
  subject: string;
  description?: { raw: string; html: string };
  percentageDone: number;
  spentTime?: string;        // ISO 8601 duration, e.g. "PT2H30M"
  derivedSpentTime?: string; // includes child tasks
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
  _links: HalLinks;
}

export interface TimeEntry {
  id: number;
  hours: string;   // ISO 8601 duration
  spentOn: string; // YYYY-MM-DD
  comment?: { raw: string };
  _links: {
    user: HalLink;
    workPackage: HalLink;
    project: HalLink;
  };
}

export interface User {
  id: number;
  name: string;
  login: string;
  email: string;
}

export interface Status {
  id: number;
  name: string;
  isClosed: boolean;
  isDefault: boolean;
  color?: string; // hex, e.g. "#6e9fc5" — returned by some OP versions
}

export interface Project {
  id: number;
  name: string;
  identifier: string;
  active: boolean;
}

export interface WorkPackageType {
  id: number;
  name: string;
  color: string;
  isDefault: boolean;
}

export interface Priority {
  id: number;
  name: string;
  isDefault: boolean;
}

export interface Settings {
  url: string;
  apiKey: string;
  idleEnabled: boolean;
  idleThresholdMin: number;
}

export interface ActiveTimer {
  isRunning: boolean;
  startTime: number;
  workPackageId: number;
  workPackageSubject: string;
  projectHref: string;
  projectId: number;
  comment: string;
  idleDeductedSec: number;
}

export type View = 'my-tasks' | 'all-tasks' | 'settings';
