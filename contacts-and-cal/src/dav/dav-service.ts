import { randomUUID } from 'crypto';
import { StatusCodes } from 'http-status-codes';
import { DavResource, DavResourceKind, DavProperties, LockInfo } from '../types.js';
import { StorageAdapter } from '../storage/storage-adapter.js';
import {
  CalendarReportRequest,
  AddressBookReportRequest,
  SyncCollectionReportRequest
} from './xml.js';

export interface PropFindResponse {
  resource: DavResource;
  children: DavResource[];
}

export interface LockRequest {
  owner?: string;
  timeoutSeconds?: number;
  depth: '0' | 'infinity';
}

export class DavService {
  constructor(private readonly storage: StorageAdapter) {}

  async options(): Promise<{ dav: string; allow: string[] }> {
    return {
      dav: '1, 2, calendar-access, addressbook',
      allow: [
        'OPTIONS',
        'GET',
        'HEAD',
        'PUT',
        'DELETE',
        'PROPFIND',
        'PROPPATCH',
        'MKCOL',
        'COPY',
        'MOVE',
        'LOCK',
        'UNLOCK',
        'REPORT'
      ]
    };
  }

  async propFind(path: string, depth: '0' | '1' | 'infinity'): Promise<PropFindResponse> {
    const resource = await this.requireResource(path);
    let children: DavResource[] = [];
    if (depth === '1') {
      children = await this.storage.listChildren(path);
    } else if (depth === 'infinity') {
      const snapshot = await this.storage.getSnapshot();
      const normalized = normalizePath(path);
      children = Object.values(snapshot.resources).filter((candidate) =>
        candidate.path !== normalized && candidate.path.startsWith(`${normalized === '/' ? '' : normalized}/`)
      );
    }
    return { resource, children };
  }

  async propPatch(path: string, propertiesToSet: DavProperties, propertiesToRemove: string[]): Promise<DavResource> {
    return this.storage.updateResource(path, (resource) => {
      const updatedProps = { ...resource.properties };
      for (const [key, value] of Object.entries(propertiesToSet)) {
        if (value === undefined) {
          delete updatedProps[key];
        } else {
          updatedProps[key] = value;
        }
      }
      for (const key of propertiesToRemove) {
        delete updatedProps[key];
      }
      return {
        ...resource,
        properties: updatedProps,
        updatedAt: new Date().toISOString(),
        etag: makeEtag()
      };
    });
  }

  async mkcol(path: string, resourceType: DavResourceKind = 'collection', displayName?: string): Promise<DavResource> {
    const normalizedPath = normalizePath(path);
    const existing = await this.storage.getResource(normalizedPath);
    if (existing) {
      const error = new Error('Resource already exists');
      (error as any).status = StatusCodes.METHOD_NOT_ALLOWED;
      throw error;
    }
    await this.ensureParentExists(normalizedPath);
    const now = new Date().toISOString();
    const resource: DavResource = {
      path: normalizedPath,
      id: randomUUID(),
      kind: resourceType,
      displayName: displayName ?? extractName(normalizedPath),
      etag: makeEtag(),
      contentType: 'httpd/unix-directory',
      properties: {
        '{DAV:}resourcetype': resourceType === 'collection' ? 'collection' : resourceType === 'calendar' ? 'calendar' : 'addressbook',
        '{DAV:}sync-token': makeSyncToken()
      },
      createdAt: now,
      updatedAt: now
    };
    await this.storage.putResource(resource);
    await this.touchCollection(getParentPath(normalizedPath));
    return resource;
  }

  async put(path: string, contentType: string, body: string): Promise<DavResource> {
    await this.ensureParentExists(path);
    const existing = await this.storage.getResource(path);
    const kind = determineKindFromContentType(contentType) ?? deriveKindFromPath(path);
    const now = new Date().toISOString();
    const resource: DavResource = {
      path,
      id: existing?.id ?? randomUUID(),
      kind,
      displayName: extractName(path),
      etag: makeEtag(),
      contentType,
      data: body,
      properties: sanitizeFileProperties({
        ...existing?.properties,
        '{DAV:}getcontentlength': body.length.toString(),
        '{DAV:}getcontenttype': contentType,
        '{DAV:}getetag': makeEtag(),
        '{DAV:}displayname': extractName(path)
      }),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    await this.storage.putResource(resource);
    await this.touchCollection(getParentPath(path));
    return resource;
  }

  async get(path: string): Promise<DavResource> {
    return this.requireResource(path);
  }

  async list(path: string, depth: '0' | '1' | 'infinity'): Promise<DavResource[]> {
    const normalized = normalizePath(path);
    if (depth === '0') {
      const resource = await this.requireResource(normalized);
      return [resource];
    }
    if (depth === '1') {
      const children = await this.storage.listChildren(normalized);
      const parent = await this.requireResource(normalized);
      return [parent, ...children];
    }
    const snapshot = await this.storage.getSnapshot();
    return Object.values(snapshot.resources).filter((candidate) =>
      candidate.path === normalized || candidate.path.startsWith(normalized === '/' ? '/' : `${normalized}/`)
    );
  }

  async remove(path: string): Promise<void> {
    await this.requireResource(path);
    await this.storage.deleteResource(path);
    await this.touchCollection(getParentPath(path));
  }

  async copy(sourcePath: string, destinationPath: string, overwrite: boolean, depth: '0' | 'infinity'): Promise<DavResource> {
    const resource = await this.requireResource(sourcePath);
    const destinationExisting = await this.storage.getResource(destinationPath);
    if (destinationExisting && !overwrite) {
      const error = new Error('Destination exists');
      (error as any).status = StatusCodes.PRECONDITION_FAILED;
      throw error;
    }
    await this.ensureParentExists(destinationPath);

    const serialized = await this.cloneResource(resource, destinationPath);
    await this.storage.putResource(serialized);
    await this.touchCollection(getParentPath(destinationPath));
    if (
      depth === 'infinity' &&
      (resource.kind === 'collection' || resource.kind === 'calendar' || resource.kind === 'contact')
    ) {
      const children = await this.storage.listChildren(sourcePath);
      for (const child of children) {
        const childDestination = `${normalizePath(destinationPath)}/${extractName(child.path)}`;
        await this.copy(child.path, childDestination, overwrite, depth);
      }
    }
    return serialized;
  }

  async move(sourcePath: string, destinationPath: string, overwrite: boolean, depth: '0' | 'infinity'): Promise<DavResource> {
    const resource = await this.requireResource(sourcePath);
    await this.copy(sourcePath, destinationPath, overwrite, depth);
    await this.remove(sourcePath);
    await this.touchCollection(getParentPath(destinationPath));
    return {
      ...resource,
      path: normalizePath(destinationPath)
    };
  }

  async lock(path: string, request: LockRequest): Promise<LockInfo> {
    const normalizedPath = normalizePath(path);
    await this.ensureParentExists(normalizedPath);
    let target = await this.storage.getResource(normalizedPath);
    if (target?.lock) {
      const error = new Error('Resource is already locked');
      (error as any).status = StatusCodes.LOCKED;
      throw error;
    }
    if (!target) {
      const now = new Date().toISOString();
      target = {
        path: normalizedPath,
        id: randomUUID(),
        kind: deriveKindFromPath(path),
        displayName: extractName(path),
        etag: makeEtag(),
        contentType: 'application/octet-stream',
        data: '',
        properties: {},
        createdAt: now,
        updatedAt: now
      };
      await this.storage.putResource(target);
      await this.touchCollection(getParentPath(normalizedPath));
    }
    const lock: LockInfo = {
      token: `urn:uuid:${randomUUID()}`,
      owner: request.owner,
      timeoutSeconds: request.timeoutSeconds,
      depth: request.depth,
      createdAt: new Date().toISOString()
    };
    await this.storage.updateResource(normalizedPath, (resource) => ({
      ...resource,
      lock,
      etag: makeEtag()
    }));
    return lock;
  }

  async unlock(path: string, token: string): Promise<void> {
    await this.storage.updateResource(path, (resource) => {
      if (!resource.lock || resource.lock.token !== token) {
        const error = new Error('Lock token mismatch');
        (error as any).status = StatusCodes.CONFLICT;
        throw error;
      }
      const updated = { ...resource };
      delete updated.lock;
      updated.etag = makeEtag();
      return updated;
    });
  }

  async calendarReport(path: string, request: CalendarReportRequest): Promise<DavResource[]> {
    const normalized = normalizePath(path);
    await this.requireResource(normalized);
    if (request.type === 'calendar-multiget' && request.hrefs.length > 0) {
      const resources = await this.getResourcesByHref(request.hrefs);
      return resources.filter(isCalendarObject);
    }
    const descendants = await this.listDescendants(normalized);
    return descendants.filter(isCalendarObject);
  }

  async addressBookReport(path: string, request: AddressBookReportRequest): Promise<DavResource[]> {
    const normalized = normalizePath(path);
    await this.requireResource(normalized);
    if (request.type === 'addressbook-multiget' && request.hrefs.length > 0) {
      const resources = await this.getResourcesByHref(request.hrefs);
      return resources.filter(isContactObject);
    }
    const descendants = await this.listDescendants(normalized);
    return descendants.filter(isContactObject);
  }

  async syncCollection(path: string, _request: SyncCollectionReportRequest): Promise<{
    collection: DavResource;
    resources: DavResource[];
    syncToken: string;
  }> {
    const normalized = normalizePath(path);
    const collection = await this.requireResource(normalized);
    const descendants = await this.listDescendants(normalized);
    const resources = descendants.filter((resource) =>
      resource.contentType !== 'httpd/unix-directory' &&
      (collection.kind === 'calendar' ? resource.kind === 'calendar' : collection.kind === 'contact' ? resource.kind === 'contact' : true)
    );
    const syncToken = collection.properties['{DAV:}sync-token'] ?? makeSyncToken();
    return { collection, resources, syncToken };
  }

  private async cloneResource(resource: DavResource, destinationPath: string): Promise<DavResource> {
    const now = new Date().toISOString();
    return {
      ...resource,
      path: normalizePath(destinationPath),
      id: randomUUID(),
      etag: makeEtag(),
      createdAt: resource.createdAt,
      updatedAt: now
    };
  }

  private async listDescendants(path: string): Promise<DavResource[]> {
    const snapshot = await this.storage.getSnapshot();
    const normalized = normalizePath(path);
    return Object.values(snapshot.resources).filter((candidate) =>
      candidate.path !== normalized && candidate.path.startsWith(normalized === '/' ? '/' : `${normalized}/`)
    );
  }

  private async getResourcesByHref(hrefs: string[]): Promise<DavResource[]> {
    const resources: DavResource[] = [];
    for (const href of hrefs) {
      const resource = await this.storage.getResource(normalizePath(href));
      if (resource) {
        resources.push(resource);
      }
    }
    return resources;
  }

  private async touchCollection(path: string | null): Promise<void> {
    if (!path) return;
    const normalized = normalizePath(path);
    const existing = await this.storage.getResource(normalized);
    if (!existing || existing.contentType !== 'httpd/unix-directory') {
      return;
    }
    const syncToken = makeSyncToken();
    await this.storage.updateResource(normalized, (resource) => ({
      ...resource,
      etag: makeEtag(),
      updatedAt: new Date().toISOString(),
      properties: {
        ...resource.properties,
        '{DAV:}sync-token': syncToken
      }
    }));
  }

  private async requireResource(path: string): Promise<DavResource> {
    const resource = await this.storage.getResource(path);
    if (!resource) {
      const error = new Error(`Resource not found: ${path}`);
      (error as any).status = StatusCodes.NOT_FOUND;
      throw error;
    }
    return resource;
  }

  private async ensureParentExists(path: string): Promise<void> {
    const parent = getParentPath(path);
    if (!parent) return;
    const parentResource = await this.storage.getResource(parent);
    if (!parentResource) {
      const error = new Error('Parent not found');
      (error as any).status = StatusCodes.CONFLICT;
      throw error;
    }
    if (parentResource.kind !== 'collection' && parentResource.kind !== 'calendar' && parentResource.kind !== 'contact') {
      const error = new Error('Parent is not a collection');
      (error as any).status = StatusCodes.CONFLICT;
      throw error;
    }
  }
}

function extractName(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === '/') return 'root';
  const parts = normalized.split('/');
  return parts[parts.length - 1];
}

function determineKindFromContentType(contentType: string): DavResourceKind | undefined {
  if (contentType.includes('text/calendar')) {
    return 'calendar';
  }
  if (contentType.includes('text/vcard') || contentType.includes('text/x-vcard')) {
    return 'contact';
  }
  return undefined;
}

function deriveKindFromPath(path: string): DavResourceKind {
  if (path.startsWith('/calendars')) return 'calendar';
  if (path.startsWith('/contacts')) return 'contact';
  return 'collection';
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    path = `/${path}`;
  }
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

function getParentPath(path: string): string | null {
  const normalized = normalizePath(path);
  if (normalized === '/') return null;
  const parts = normalized.split('/');
  parts.pop();
  if (parts.length === 1 && parts[0] === '') {
    return '/';
  }
  return parts.join('/') || '/';
}

function makeEtag(): string {
  return `"${randomUUID()}"`;
}

function makeSyncToken(): string {
  return `urn:uuid:${randomUUID()}`;
}

function sanitizeFileProperties(properties: DavProperties): DavProperties {
  const result = { ...properties };
  delete result['{DAV:}resourcetype'];
  return result;
}

function isCalendarObject(resource: DavResource): boolean {
  return resource.kind === 'calendar' && resource.contentType !== 'httpd/unix-directory';
}

function isContactObject(resource: DavResource): boolean {
  return resource.kind === 'contact' && resource.contentType !== 'httpd/unix-directory';
}
