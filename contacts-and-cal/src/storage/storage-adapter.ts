import { DavResource, StorageSnapshot } from '../types.js';

export interface StorageAdapter {
  initialize(): Promise<void>;
  getSnapshot(): Promise<StorageSnapshot>;
  getResource(path: string): Promise<DavResource | undefined>;
  putResource(resource: DavResource): Promise<void>;
  deleteResource(path: string): Promise<void>;
  listChildren(parentPath: string): Promise<DavResource[]>;
  updateResource(path: string, updater: (resource: DavResource) => DavResource): Promise<DavResource>;
}
