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
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
  _links: HalLinks;
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
}

export interface ActiveTimer {
  isRunning: boolean;
  startTime: number;
  workPackageId: number;
  workPackageSubject: string;
  projectHref: string;
  projectId: number;
  comment: string;
}

export type View = 'my-tasks' | 'all-tasks' | 'settings';
