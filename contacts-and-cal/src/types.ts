export type DavResourceKind = "collection" | "calendar" | "contact";

export interface DavProperties {
  [key: string]: string | undefined;
}

export interface LockInfo {
  token: string;
  owner?: string;
  timeoutSeconds?: number;
  depth: "0" | "infinity";
  createdAt: string;
}

export interface DavResource {
  path: string;
  id: string;
  kind: DavResourceKind;
  displayName: string;
  etag: string;
  contentType: string;
  data?: string;
  properties: DavProperties;
  createdAt: string;
  updatedAt: string;
  lock?: LockInfo;
}

export interface CollectionResource extends DavResource {
  kind: "collection" | "calendar" | "contact";
}

export interface StorageSnapshot {
  resources: Record<string, DavResource>;
}
