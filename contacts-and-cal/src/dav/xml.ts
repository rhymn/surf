import { create } from 'xmlbuilder2';
import { XMLParser } from 'fast-xml-parser';
import { StatusCodes } from 'http-status-codes';
import { DavResource, DavProperties, LockInfo } from '../types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  ignoreDeclaration: true,
  removeNSPrefix: true
});

export interface PropFindRequest {
  allProp: boolean;
  propNames: string[];
}

export interface PropPatchRequest {
  setProps: DavProperties;
  removeProps: string[];
}

export interface CalendarReportRequest {
  type: 'calendar-query' | 'calendar-multiget';
  hrefs: string[];
  includeCalendarData: boolean;
}

export interface AddressBookReportRequest {
  type: 'addressbook-query' | 'addressbook-multiget';
  hrefs: string[];
  includeAddressData: boolean;
}

export interface SyncCollectionReportRequest {
  type: 'sync-collection';
  includeCalendarData: boolean;
  includeAddressData: boolean;
  syncToken?: string;
  limit?: number;
}

export function parsePropFind(body?: string | Buffer): PropFindRequest {
  if (!body || body.length === 0) {
    return { allProp: true, propNames: [] };
  }
  const parsed = parser.parse(body.toString());
  const propfind = parsed?.propfind;
  if (!propfind) {
    return { allProp: true, propNames: [] };
  }
  if (propfind.allprop !== undefined) {
    return { allProp: true, propNames: [] };
  }
  const prop = propfind.prop;
  const names: string[] = [];
  if (prop && typeof prop === 'object') {
    for (const key of Object.keys(prop)) {
      names.push(withDavNamespace(key));
    }
  }
  return { allProp: false, propNames: names };
}

export function parsePropPatch(body: string | Buffer): PropPatchRequest {
  const parsed = parser.parse(body.toString());
  const propertyUpdate = parsed?.propertyupdate;
  const setProps: DavProperties = {};
  const removeProps: string[] = [];
  if (!propertyUpdate) {
    return { setProps, removeProps };
  }
  const set = arrayify(propertyUpdate.set);
  for (const entry of set) {
    const prop = entry?.prop;
    if (!prop) continue;
    for (const key of Object.keys(prop)) {
      const qualified = withDavNamespace(key);
      const value = typeof prop[key] === 'object' && '#text' in prop[key] ? prop[key]['#text'] : prop[key];
      setProps[qualified] = value;
    }
  }
  const remove = arrayify(propertyUpdate.remove);
  for (const entry of remove) {
    const prop = entry?.prop;
    if (!prop) continue;
    for (const key of Object.keys(prop)) {
      removeProps.push(withDavNamespace(key));
    }
  }
  return { setProps, removeProps };
}

export function buildMultiStatus(resources: DavResource[], requested: PropFindRequest): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('d:multistatus', {
      'xmlns:d': 'DAV:'
    });

  for (const resource of resources) {
    const response = root.ele('d:response');
    response.ele('d:href').txt(resource.path.endsWith('/') ? resource.path : `${resource.path}`);
    const propstat = response.ele('d:propstat');
    const propEle = propstat.ele('d:prop');

    const props = resolveProperties(resource, requested);
    for (const [name, value] of Object.entries(props)) {
      const nsName = qualifyName(name);
      if (value === undefined) {
        continue;
      }
      if (name === '{DAV:}resourcetype') {
        const resType = propEle.ele(nsName);
        if (value) {
          resType.ele('d:collection');
        }
        if (value === 'calendar') {
          resType.ele('c:calendar', {
            'xmlns:c': 'urn:ietf:params:xml:ns:caldav'
          });
        }
        if (value === 'addressbook') {
          resType.ele('c:addressbook', {
            'xmlns:c': 'urn:ietf:params:xml:ns:carddav'
          });
        }
        continue;
      }
      propEle.ele(nsName).txt(value);
    }
    if (resource.lock) {
      const lockDiscovery = propEle.ele('d:lockdiscovery');
      const activeLock = lockDiscovery.ele('d:activelock');
      activeLock.ele('d:locktype').ele('d:write');
      activeLock.ele('d:lockscope').ele('d:exclusive');
      activeLock.ele('d:depth').txt(resource.lock.depth);
      if (resource.lock.owner) {
        activeLock.ele('d:owner').txt(resource.lock.owner);
      }
      if (resource.lock.timeoutSeconds) {
        activeLock.ele('d:timeout').txt(`Second-${resource.lock.timeoutSeconds}`);
      }
      activeLock.ele('d:locktoken').ele('d:href').txt(resource.lock.token);
    }
    propstat.ele('d:status').txt(`HTTP/1.1 ${StatusCodes.OK} OK`);
  }

  return root.end({ prettyPrint: true });
}

export function buildLockResponse(path: string, lock: LockInfo): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('d:prop', { 'xmlns:d': 'DAV:' })
    .ele('d:lockdiscovery')
    .ele('d:activelock');
  root.ele('d:locktype').ele('d:write');
  root.ele('d:lockscope').ele('d:exclusive');
  root.ele('d:depth').txt(lock.depth);
  if (lock.owner) {
    root.ele('d:owner').txt(lock.owner);
  }
  if (lock.timeoutSeconds) {
    root.ele('d:timeout').txt(`Second-${lock.timeoutSeconds}`);
  }
  root.ele('d:locktoken').ele('d:href').txt(lock.token);
  root.up();
  root.ele('d:href').txt(path);
  return root.end({ prettyPrint: true });
}

export function buildPropPatchResponse(path: string, request: PropPatchRequest): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('d:multistatus', {
      'xmlns:d': 'DAV:'
    });
  const response = root.ele('d:response');
  response.ele('d:href').txt(path);

  if (Object.keys(request.setProps).length > 0) {
    const propstat = response.ele('d:propstat');
    const prop = propstat.ele('d:prop');
    for (const [key, value] of Object.entries(request.setProps)) {
      const nsName = qualifyName(key);
      prop.ele(nsName).txt(value ?? '');
    }
    propstat.ele('d:status').txt(`HTTP/1.1 ${StatusCodes.OK} OK`);
  }

  if (request.removeProps.length > 0) {
    const propstat = response.ele('d:propstat');
    const prop = propstat.ele('d:prop');
    for (const key of request.removeProps) {
      const nsName = qualifyName(key);
      prop.ele(nsName);
    }
    propstat.ele('d:status').txt(`HTTP/1.1 ${StatusCodes.OK} OK`);
  }

  return root.end({ prettyPrint: true });
}

export function parseCalendarReport(body: string | Buffer | undefined): CalendarReportRequest | undefined {
  if (!body || body.length === 0) {
    return undefined;
  }
  const parsed = parser.parse(body.toString());
  const calendarQuery = parsed?.['calendar-query'];
  if (calendarQuery) {
    const includeData = includesCalendarData(calendarQuery);
    return {
      type: 'calendar-query',
      hrefs: [],
      includeCalendarData: includeData
    };
  }
  const calendarMultiget = parsed?.['calendar-multiget'];
  if (calendarMultiget) {
    const hrefs = toArray(calendarMultiget.href).map((href) => normalizeHref(href));
    const includeData = includesCalendarData(calendarMultiget);
    return {
      type: 'calendar-multiget',
      hrefs,
      includeCalendarData: includeData
    };
  }
  return undefined;
}

export function parseAddressBookReport(body: string | Buffer | undefined): AddressBookReportRequest | undefined {
  if (!body || body.length === 0) {
    return undefined;
  }
  const parsed = parser.parse(body.toString());
  const addressQuery = parsed?.['addressbook-query'];
  if (addressQuery) {
    const includeData = includesAddressData(addressQuery);
    return {
      type: 'addressbook-query',
      hrefs: [],
      includeAddressData: includeData
    };
  }
  const addressMultiget = parsed?.['addressbook-multiget'];
  if (addressMultiget) {
    const hrefs = toArray(addressMultiget.href).map((href) => normalizeHref(href));
    const includeData = includesAddressData(addressMultiget);
    return {
      type: 'addressbook-multiget',
      hrefs,
      includeAddressData: includeData
    };
  }
  return undefined;
}

export function parseSyncCollectionReport(body: string | Buffer | undefined): SyncCollectionReportRequest | undefined {
  if (!body || body.length === 0) {
    return undefined;
  }
  const parsed = parser.parse(body.toString());
  const syncReport = parsed?.['sync-collection'];
  if (!syncReport) {
    return undefined;
  }
  const includeCalendarData = includesCalendarData(syncReport);
  const includeAddressData = includesAddressData(syncReport);
  const syncToken = extractText(syncReport['sync-token']);
  const limit = parseLimit(syncReport.limit);
  return {
    type: 'sync-collection',
    includeCalendarData,
    includeAddressData,
    syncToken: syncToken ?? undefined,
    limit: limit ?? undefined
  };
}

export function buildCalendarReport(resources: DavResource[], includeData: boolean): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('d:multistatus', {
      'xmlns:d': 'DAV:',
      'xmlns:c': 'urn:ietf:params:xml:ns:caldav'
    });

  for (const resource of resources) {
    const response = root.ele('d:response');
    response.ele('d:href').txt(resource.path);
    const propstat = response.ele('d:propstat');
    const prop = propstat.ele('d:prop');
    prop.ele('d:getetag').txt(resource.etag);
    if (includeData) {
      prop.ele('c:calendar-data').txt(resource.data ?? '');
    }
    propstat.ele('d:status').txt(`HTTP/1.1 ${StatusCodes.OK} OK`);
  }

  return root.end({ prettyPrint: true });
}

export function buildAddressBookReport(resources: DavResource[], includeData: boolean): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('d:multistatus', {
      'xmlns:d': 'DAV:',
      'xmlns:c': 'urn:ietf:params:xml:ns:carddav'
    });

  for (const resource of resources) {
    const response = root.ele('d:response');
    response.ele('d:href').txt(resource.path);
    const propstat = response.ele('d:propstat');
    const prop = propstat.ele('d:prop');
    prop.ele('d:getetag').txt(resource.etag);
    if (includeData) {
      prop.ele('c:address-data').txt(resource.data ?? '');
    }
    propstat.ele('d:status').txt(`HTTP/1.1 ${StatusCodes.OK} OK`);
  }

  return root.end({ prettyPrint: true });
}

export function buildSyncCollectionReport(
  collection: DavResource,
  resources: DavResource[],
  options: { includeCalendarData: boolean; includeAddressData: boolean; syncToken: string }
): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('d:multistatus', {
      'xmlns:d': 'DAV:',
      'xmlns:cal': 'urn:ietf:params:xml:ns:caldav',
      'xmlns:card': 'urn:ietf:params:xml:ns:carddav'
    });

  const collectionResponse = root.ele('d:response');
  collectionResponse.ele('d:href').txt(collection.path);
  const collectionPropstat = collectionResponse.ele('d:propstat');
  const collectionProp = collectionPropstat.ele('d:prop');
  collectionProp.ele('d:sync-token').txt(options.syncToken);
  collectionProp.ele('d:getetag').txt(collection.etag);
  collectionPropstat.ele('d:status').txt(`HTTP/1.1 ${StatusCodes.OK} OK`);

  for (const resource of resources) {
    const response = root.ele('d:response');
    response.ele('d:href').txt(resource.path);
    const propstat = response.ele('d:propstat');
    const prop = propstat.ele('d:prop');
    prop.ele('d:getetag').txt(resource.etag);
    if (options.includeCalendarData && resource.kind === 'calendar' && resource.contentType !== 'httpd/unix-directory') {
      prop.ele('cal:calendar-data').txt(resource.data ?? '');
    }
    if (options.includeAddressData && resource.kind === 'contact' && resource.contentType !== 'httpd/unix-directory') {
      prop.ele('card:address-data').txt(resource.data ?? '');
    }
    propstat.ele('d:status').txt(`HTTP/1.1 ${StatusCodes.OK} OK`);
  }

  return root.end({ prettyPrint: true });
}
function resolveProperties(resource: DavResource, requested: PropFindRequest): DavProperties {
  const isCollection = resource.contentType === 'httpd/unix-directory';
  const builtin = builtinProperties(resource, isCollection);
  const customProps = { ...resource.properties };
  if (!isCollection) {
    delete customProps['{DAV:}resourcetype'];
  }
  if (requested.allProp) {
    return { ...builtin, ...customProps };
  }
  const props: DavProperties = {};
  for (const key of requested.propNames) {
    if (builtin[key] !== undefined) {
      props[key] = builtin[key];
      continue;
    }
    props[key] = customProps[key];
  }
  return props;
}

function builtinProperties(resource: DavResource, isCollection = resource.contentType === 'httpd/unix-directory'): DavProperties {
  const resourcetype = isCollection
    ? resource.properties['{DAV:}resourcetype'] ?? 'collection'
    : '';
  return {
    '{DAV:}displayname': resource.displayName,
    '{DAV:}getcontenttype': resource.contentType,
    '{DAV:}getetag': resource.etag,
    '{DAV:}getlastmodified': resource.updatedAt,
    '{DAV:}creationdate': resource.createdAt,
    '{DAV:}resourcetype': resourcetype
  };
}

function qualifyName(expanded: string): string {
  if (expanded.startsWith('{DAV:}')) {
    return expanded.replace('{DAV:}', 'd:');
  }
  return expanded;
}

function withDavNamespace(name: string): string {
  if (name.includes(':')) {
    const [, local] = name.split(':');
    return `{DAV:}${local}`;
  }
  return `{DAV:}${name}`;
}

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeHref(value: unknown): string {
  if (typeof value === 'string') {
    let normalized = value;
    try {
      const url = new URL(value, 'http://localhost');
      normalized = url.pathname;
    } catch {
      // ignore parsing failure and treat as path
    }
    return normalized.endsWith('/') && normalized !== '/' ? normalized.slice(0, -1) : normalized;
  }
  if (value && typeof value === 'object' && '#text' in value) {
    return normalizeHref((value as Record<string, string>)['#text']);
  }
  return '';
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function includesCalendarData(node: Record<string, unknown>): boolean {
  const prop = node?.prop as Record<string, unknown> | undefined;
  if (!prop) {
    return true;
  }
  return Object.prototype.hasOwnProperty.call(prop, 'calendar-data');
}

function includesAddressData(node: Record<string, unknown>): boolean {
  const prop = node?.prop as Record<string, unknown> | undefined;
  if (!prop) {
    return true;
  }
  return Object.prototype.hasOwnProperty.call(prop, 'address-data');
}

function extractText(node: unknown): string | undefined {
  if (!node) return undefined;
  if (typeof node === 'string') return node;
  if (typeof node === 'object' && node !== null && '#text' in node) {
    return (node as Record<string, string>)['#text'];
  }
  return undefined;
}

function parseLimit(node: unknown): number | undefined {
  if (!node) return undefined;
  if (typeof node === 'string') {
    const value = Number.parseInt(node, 10);
    return Number.isNaN(value) ? undefined : value;
  }
  if (typeof node === 'object' && node !== null) {
    if ('nresults' in node) {
      return parseLimit((node as Record<string, unknown>).nresults);
    }
    if ('#text' in node) {
      return parseLimit((node as Record<string, unknown>)['#text']);
    }
  }
  return undefined;
}
