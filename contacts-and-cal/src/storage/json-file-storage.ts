import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { DavResource, StorageSnapshot } from '../types.js';
import { StorageAdapter } from './storage-adapter.js';

const DEFAULT_FILE = path.resolve(process.cwd(), 'data', 'storage.json');

export class JsonFileStorage implements StorageAdapter {
  private readonly filePath: string;
  private snapshot: StorageSnapshot = { resources: {} };
  private writeQueue: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(filePath: string = DEFAULT_FILE) {
    this.filePath = filePath;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      this.snapshot = JSON.parse(raw) as StorageSnapshot;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.seed();
      } else {
        throw error;
      }
    }
    this.initialized = true;
  }

  async getSnapshot(): Promise<StorageSnapshot> {
    await this.ensureInitialized();
    return structuredClone(this.snapshot);
  }

  async getResource(pathname: string): Promise<DavResource | undefined> {
    await this.ensureInitialized();
    return this.snapshot.resources[normalizePath(pathname)];
  }

  async putResource(resource: DavResource): Promise<void> {
    await this.ensureInitialized();
    const normalized = normalizePath(resource.path);
    this.snapshot.resources[normalized] = { ...resource, path: normalized };
    await this.persist();
  }

  async deleteResource(pathname: string): Promise<void> {
    await this.ensureInitialized();
    const normalized = normalizePath(pathname);
    delete this.snapshot.resources[normalized];
    for (const [pathKey, resource] of Object.entries(this.snapshot.resources)) {
      if (isChildPath(normalized, pathKey)) {
        delete this.snapshot.resources[pathKey];
      }
      if (resource.lock && resource.lock.token && isSameOrParent(normalized, pathKey)) {
        delete resource.lock;
      }
    }
    await this.persist();
  }

  async listChildren(parentPath: string): Promise<DavResource[]> {
    await this.ensureInitialized();
    const normalizedParent = normalizePath(parentPath);
    return Object.entries(this.snapshot.resources)
      .filter(([key]) => isDirectChild(normalizedParent, key))
      .map(([, value]) => value);
  }

  async updateResource(pathname: string, updater: (resource: DavResource) => DavResource): Promise<DavResource> {
    await this.ensureInitialized();
    const normalized = normalizePath(pathname);
    const existing = this.snapshot.resources[normalized];
    if (!existing) {
      throw new Error(`Resource not found: ${pathname}`);
    }
    const updated = updater(existing);
    this.snapshot.resources[normalized] = { ...updated, path: normalized };
    await this.persist();
    return this.snapshot.resources[normalized];
  }

  private async seed(): Promise<void> {
    const now = new Date().toISOString();
    this.snapshot = {
      resources: {
        '/': createCollection('/', 'Root', now),
        '/calendars': createCollection('/calendars', 'Calendars', now),
        '/contacts': createCollection('/contacts', 'Contacts', now)
      }
    };
    await this.persist();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private async persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.writeFile(this.filePath, JSON.stringify(this.snapshot, null, 2), 'utf-8');
    });
    await this.writeQueue;
  }
}

function createCollection(pathname: string, displayName: string, timestamp: string): DavResource {
  return {
    path: pathname,
    id: randomUUID(),
    kind: pathname === '/calendars' ? 'calendar' : pathname === '/contacts' ? 'contact' : 'collection',
    displayName,
    etag: randomUUID(),
    contentType: 'httpd/unix-directory',
    properties: {
      '{DAV:}resourcetype': pathname === '/' ? 'collection' : pathname === '/calendars' ? 'calendar' : pathname === '/contacts' ? 'addressbook' : 'collection',
      '{DAV:}sync-token': `urn:uuid:${randomUUID()}`
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function normalizePath(pathname: string): string {
  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  return pathname === '' ? '/' : pathname;
}

function isChildPath(parent: string, child: string): boolean {
  if (parent === child) return false;
  if (!child.startsWith(parent)) return false;
  const remainder = child.slice(parent.length);
  return remainder.startsWith('/');
}

function isSameOrParent(parent: string, path: string): boolean {
  return path === parent || isChildPath(parent, path);
}

function isDirectChild(parent: string, child: string): boolean {
  if (!isChildPath(parent, child)) return false;
  const remainder = child.slice(parent.length + 1);
  return !remainder.includes('/');
}
