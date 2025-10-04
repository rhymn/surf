import http, { Server } from 'http';
import { AddressInfo } from 'net';
import { mkdtemp, rm } from 'fs/promises';
import path from 'path';
import os from 'os';
import { XMLParser } from 'fast-xml-parser';
import { createApp } from '../src/app.js';
import { JsonFileStorage } from '../src/storage/json-file-storage.js';
import { DavService } from '../src/dav/dav-service.js';

const parser = new XMLParser({
  ignoreDeclaration: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: true
});

describe('WebDAV server', () => {
  const sampleCalendar = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:1\nDTSTAMP:20240101T000000Z\nDTSTART:20240101T010000Z\nDTEND:20240101T020000Z\nSUMMARY:Test Event\nEND:VEVENT\nEND:VCALENDAR\n`;
  const sampleContact = `BEGIN:VCARD\nVERSION:3.0\nFN:John Doe\nEMAIL:john@example.com\nEND:VCARD\n`;

  let tempDir: string;
  let storage: JsonFileStorage;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'dav-test-'));
    storage = new JsonFileStorage(path.join(tempDir, 'storage.json'));
    await storage.initialize();
    const service = new DavService(storage);
    const app = createApp(service);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('OPTIONS', () => {
    it('advertises DAV capabilities and allowed methods', async () => {
      const response = await davRequest('OPTIONS', '/', baseUrl);
      expect(response.status).toBe(200);
      expect(response.headers['dav']).toContain('1');
      expect(response.headers['allow']).toContain('PROPFIND');
      expect(response.headers['allow']).toContain('LOCK');
    });
  });

  describe('PROPFIND', () => {
    beforeEach(async () => {
      await davRequest('MKCOL', '/calendars/work', baseUrl);
      await davRequest('PUT', '/calendars/work/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
    });

    it('returns only the requested collection for depth 0', async () => {
      const response = await davRequest('PROPFIND', '/calendars', baseUrl, {
        headers: { Depth: '0' },
        body: ''
      });
      expect(response.status).toBe(207);
      const resources = parseMultiStatus(response.text);
      expect(resources).toHaveLength(1);
      expect(resources[0].href).toContain('/calendars');
    });

    it('returns direct children for depth 1', async () => {
      const response = await davRequest('PROPFIND', '/calendars', baseUrl, {
        headers: { Depth: '1' }
      });
      expect(response.status).toBe(207);
      const resources = parseMultiStatus(response.text);
      const hrefs = resources.map((r) => decodeURIComponent(r.href));
      expect(hrefs).toEqual(expect.arrayContaining(['/calendars', '/calendars/work']));
      expect(hrefs).not.toContain('/calendars/work/event1.ics');
    });

    it('recurses through descendants for depth infinity', async () => {
      await davRequest('PUT', '/calendars/work/event2.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
      const response = await davRequest('PROPFIND', '/calendars', baseUrl, {
        headers: { Depth: 'infinity' }
      });
      expect(response.status).toBe(207);
      const hrefs = parseMultiStatus(response.text).map((r) => decodeURIComponent(r.href));
      expect(hrefs).toEqual(
        expect.arrayContaining([
          '/calendars',
          '/calendars/work',
          '/calendars/work/event1.ics',
          '/calendars/work/event2.ics'
        ])
      );
    });

    it('returns 404 for missing resources', async () => {
      const response = await davRequest('PROPFIND', '/unknown', baseUrl, {
        headers: { Depth: '0' }
      });
      expect(response.status).toBe(404);
    });
  });

  describe('PROPPATCH', () => {
    const propPatchBody = (xml: string) => `<?xml version="1.0" encoding="utf-8"?>
<D:propertyupdate xmlns:D="DAV:">
${xml}
</D:propertyupdate>`;

    beforeEach(async () => {
      await davRequest('MKCOL', '/calendars/personal', baseUrl);
      await davRequest('PUT', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
    });

    it('adds custom properties and returns multistatus', async () => {
      const body = propPatchBody(`  <D:set>
    <D:prop>
      <D:displayname>Team Event</D:displayname>
      <D:owner>calendar-admin</D:owner>
    </D:prop>
  </D:set>`);

      const response = await davRequest('PROPPATCH', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'application/xml' },
        body
      });
      expect(response.status).toBe(207);

      const propfind = await davRequest('PROPFIND', '/calendars/personal/event1.ics', baseUrl, {
        headers: { Depth: '0' }
      });
      const resource = parseMultiStatus(propfind.text).find((entry) => entry.href.includes('event1.ics'));
      expect(resource?.properties['displayname']).toBe('Team Event');
      expect(resource?.properties['owner']).toBe('calendar-admin');
    });

    it('removes properties when requested', async () => {
      const addBody = propPatchBody(`  <D:set>
    <D:prop>
      <X:color xmlns:X="urn:example:webdav">blue</X:color>
    </D:prop>
  </D:set>`);
      await davRequest('PROPPATCH', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'application/xml' },
        body: addBody
      });

      const removeBody = propPatchBody(`  <D:remove>
    <D:prop>
      <X:color xmlns:X="urn:example:webdav"/>
    </D:prop>
  </D:remove>`);
      const response = await davRequest('PROPPATCH', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'application/xml' },
        body: removeBody
      });
      expect(response.status).toBe(207);

      const propfind = await davRequest('PROPFIND', '/calendars/personal/event1.ics', baseUrl, {
        headers: { Depth: '0' }
      });
      const resource = parseMultiStatus(propfind.text).find((entry) => entry.href.includes('event1.ics'));
      expect(resource?.properties['color']).toBeUndefined();
    });
  });

  describe('MKCOL', () => {
    it('creates new collections under existing parents', async () => {
      const response = await davRequest('MKCOL', '/calendars/projects', baseUrl);
      expect(response.status).toBe(201);

      const propfind = await davRequest('PROPFIND', '/calendars', baseUrl, {
        headers: { Depth: '1' }
      });
      const hrefs = parseMultiStatus(propfind.text).map((r) => decodeURIComponent(r.href));
      expect(hrefs).toEqual(expect.arrayContaining(['/calendars/projects']));
    });

    it('rejects creation when parent collection does not exist', async () => {
      const response = await davRequest('MKCOL', '/does-not-exist/projects', baseUrl);
      expect(response.status).toBe(409);
    });

    it('rejects creation when resource already exists', async () => {
      await davRequest('MKCOL', '/contacts/shared', baseUrl);
      const duplicate = await davRequest('MKCOL', '/contacts/shared', baseUrl);
      expect(duplicate.status).toBe(405);
    });
  });

  describe('PUT, GET, HEAD, DELETE', () => {
    beforeEach(async () => {
      await davRequest('MKCOL', '/calendars/personal', baseUrl);
    });

    it('creates new resources with PUT and retrieves them via GET', async () => {
      const put = await davRequest('PUT', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
      expect(put.status).toBe(201);

      const get = await davRequest('GET', '/calendars/personal/event1.ics', baseUrl);
      expect(get.status).toBe(200);
      expect(get.text).toContain('SUMMARY:Test Event');

      const head = await davRequest('HEAD', '/calendars/personal/event1.ics', baseUrl);
      expect(head.status).toBe(200);
      expect(head.headers['etag']).toBeDefined();
    });

    it('updates existing resources and returns 204', async () => {
      await davRequest('PUT', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
      const update = await davRequest('PUT', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar.replace('Test Event', 'Updated Event')
      });
      expect(update.status).toBe(204);

      const get = await davRequest('GET', '/calendars/personal/event1.ics', baseUrl);
      expect(get.text).toContain('Updated Event');
    });

    it('returns 409 when parent collection is missing', async () => {
      const response = await davRequest('PUT', '/unknown/event.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
      expect(response.status).toBe(409);
    });

    it('removes resources and descendants with DELETE', async () => {
      await davRequest('PUT', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
      const del = await davRequest('DELETE', '/calendars/personal/event1.ics', baseUrl);
      expect(del.status).toBe(204);

      const missing = await davRequest('GET', '/calendars/personal/event1.ics', baseUrl);
      expect(missing.status).toBe(404);
    });

    it('returns 404 when deleting non-existent resources', async () => {
      const response = await davRequest('DELETE', '/calendars/personal/missing.ics', baseUrl);
      expect(response.status).toBe(404);
    });
  });

  describe('COPY', () => {
    beforeEach(async () => {
      await davRequest('MKCOL', '/calendars/source', baseUrl);
      await davRequest('PUT', '/calendars/source/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
      await davRequest('MKCOL', '/calendars/source/sub', baseUrl);
      await davRequest('PUT', '/calendars/source/sub/event2.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
    });

    it('copies resources when overwrite is allowed', async () => {
      const response = await davRequest('COPY', '/calendars/source/event1.ics', baseUrl, {
        headers: {
          Destination: '/calendars/source/event1-copy.ics',
          Overwrite: 'T',
          Depth: '0'
        }
      });
      expect(response.status).toBe(201);

      const copied = await davRequest('GET', '/calendars/source/event1-copy.ics', baseUrl);
      expect(copied.status).toBe(200);
    });

    it('prevents overwrite when header is set to F', async () => {
      await davRequest('COPY', '/calendars/source/event1.ics', baseUrl, {
        headers: {
          Destination: '/calendars/source/event1-copy.ics',
          Depth: '0'
        }
      });

      const conflict = await davRequest('COPY', '/calendars/source/event1.ics', baseUrl, {
        headers: {
          Destination: '/calendars/source/event1-copy.ics',
          Overwrite: 'F',
          Depth: '0'
        }
      });
      expect(conflict.status).toBe(412);
    });

    it('recursively copies collections when depth is infinity', async () => {
      const response = await davRequest('COPY', '/calendars/source', baseUrl, {
        headers: {
          Destination: '/calendars/archive',
          Depth: 'infinity'
        }
      });
      expect(response.status).toBe(201);

      const propfind = await davRequest('PROPFIND', '/calendars/archive', baseUrl, {
        headers: { Depth: 'infinity' }
      });
      const hrefs = parseMultiStatus(propfind.text).map((r) => decodeURIComponent(r.href));
      expect(hrefs).toEqual(
        expect.arrayContaining([
          '/calendars/archive',
          '/calendars/archive/event1.ics',
          '/calendars/archive/sub',
          '/calendars/archive/sub/event2.ics'
        ])
      );
    });
  });

  describe('MOVE', () => {
    beforeEach(async () => {
      await davRequest('MKCOL', '/calendars/source', baseUrl);
      await davRequest('PUT', '/calendars/source/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
      await davRequest('MKCOL', '/calendars/target', baseUrl);
    });

    it('moves resources and removes the original', async () => {
      const response = await davRequest('MOVE', '/calendars/source/event1.ics', baseUrl, {
        headers: {
          Destination: '/calendars/target/event1.ics',
          Depth: '0'
        }
      });
      expect(response.status).toBe(201);

      expect((await davRequest('GET', '/calendars/target/event1.ics', baseUrl)).status).toBe(200);
      expect((await davRequest('GET', '/calendars/source/event1.ics', baseUrl)).status).toBe(404);
    });

    it('honors overwrite flag', async () => {
      await davRequest('PUT', '/calendars/target/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });

      const conflict = await davRequest('MOVE', '/calendars/source/event1.ics', baseUrl, {
        headers: {
          Destination: '/calendars/target/event1.ics',
          Overwrite: 'F',
          Depth: '0'
        }
      });
      expect(conflict.status).toBe(412);

      const overwrite = await davRequest('MOVE', '/calendars/source/event1.ics', baseUrl, {
        headers: {
          Destination: '/calendars/target/event1.ics',
          Overwrite: 'T',
          Depth: '0'
        }
      });
      expect(overwrite.status).toBe(201);
    });
  });

  describe('LOCK and UNLOCK', () => {
    const lockBody = (owner = 'tester') => `<?xml version="1.0" encoding="utf-8"?>
<D:lockinfo xmlns:D="DAV:">
  <D:lockscope><D:exclusive/></D:lockscope>
  <D:locktype><D:write/></D:locktype>
  <D:owner>${owner}</D:owner>
</D:lockinfo>`;

    beforeEach(async () => {
      await davRequest('MKCOL', '/calendars/personal', baseUrl);
      await davRequest('PUT', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
    });

    it('locks and unlocks a resource', async () => {
      const lock = await davRequest('LOCK', '/calendars/personal/event1.ics', baseUrl, {
        headers: { Timeout: 'Second-600', 'Content-Type': 'application/xml' },
        body: lockBody()
      });
      expect(lock.status).toBe(200);
      const token = lock.headers['lock-token'];
      expect(token).toBeDefined();

      const unlock = await davRequest('UNLOCK', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Lock-Token': token as string }
      });
      expect(unlock.status).toBe(204);
    });

    it('prevents locking a resource twice without unlocking', async () => {
      await davRequest('LOCK', '/calendars/personal/event1.ics', baseUrl, {
        headers: { Timeout: 'Second-600', 'Content-Type': 'application/xml' },
        body: lockBody('first-lock')
      });

      const conflict = await davRequest('LOCK', '/calendars/personal/event1.ics', baseUrl, {
        headers: { Timeout: 'Second-600', 'Content-Type': 'application/xml' },
        body: lockBody('second-lock')
      });
      expect(conflict.status).toBe(423);
    });

    it('returns conflict when unlocking with the wrong token', async () => {
      await davRequest('LOCK', '/calendars/personal/event1.ics', baseUrl, {
        headers: { Timeout: 'Second-600', 'Content-Type': 'application/xml' },
        body: lockBody('first-lock')
      });

      const conflict = await davRequest('UNLOCK', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Lock-Token': '<urn:uuid:bogus-token>' }
      });
      expect(conflict.status).toBe(409);
    });

    it('returns conflict when parent does not exist', async () => {
      const response = await davRequest('LOCK', '/ghost/event.ics', baseUrl, {
        headers: { Timeout: 'Second-600', 'Content-Type': 'application/xml' },
        body: lockBody()
      });
      expect(response.status).toBe(409);
    });
  });

  describe('REPORT', () => {
    beforeEach(async () => {
      await davRequest('MKCOL', '/calendars/personal', baseUrl);
      await davRequest('PUT', '/calendars/personal/event1.ics', baseUrl, {
        headers: { 'Content-Type': 'text/calendar' },
        body: sampleCalendar
      });
      await davRequest('MKCOL', '/contacts/team', baseUrl);
      await davRequest('PUT', '/contacts/team/contact1.vcf', baseUrl, {
        headers: { 'Content-Type': 'text/vcard' },
        body: sampleContact
      });
    });

    it('returns calendar objects for calendar-query', async () => {
      const body = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
</c:calendar-query>`;
      const response = await davRequest('REPORT', '/calendars/personal', baseUrl, {
        headers: { 'Content-Type': 'application/xml', Depth: '1' },
        body
      });
      expect(response.status).toBe(207);
      const entries = parseMultiStatus(response.text);
      const event = entries.find((entry) => entry.href.endsWith('event1.ics'));
      expect(event).toBeDefined();
      expect(event?.properties['calendar-data']).toContain('BEGIN:VEVENT');
    });

    it('returns sync-token and resources for sync-collection', async () => {
      const body = `<?xml version="1.0" encoding="utf-8"?>
<d:sync-collection xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:sync-token/>
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
</d:sync-collection>`;
      const response = await davRequest('REPORT', '/calendars/personal', baseUrl, {
        headers: { 'Content-Type': 'application/xml', Depth: '1' },
        body
      });
      expect(response.status).toBe(207);
      const entries = parseMultiStatus(response.text);
      const collection = entries.find((entry) => entry.href === '/calendars/personal');
      expect(collection?.properties['sync-token']).toBeDefined();
      const objects = entries.filter((entry) => entry.href.endsWith('.ics'));
      expect(objects.length).toBeGreaterThan(0);
      expect(objects[0].properties['calendar-data']).toContain('BEGIN:VEVENT');
    });

    it('returns address objects for addressbook-query', async () => {
      const body = `<?xml version="1.0" encoding="utf-8"?>
<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag/>
    <card:address-data/>
  </d:prop>
</card:addressbook-query>`;
      const response = await davRequest('REPORT', '/contacts/team', baseUrl, {
        headers: { 'Content-Type': 'application/xml', Depth: '1' },
        body
      });
      expect(response.status).toBe(207);
      const entries = parseMultiStatus(response.text);
      const contact = entries.find((entry) => entry.href.endsWith('contact1.vcf'));
      expect(contact).toBeDefined();
      expect(contact?.properties['address-data']).toContain('BEGIN:VCARD');
    });
  });

  it('rejects unsupported methods with 405', async () => {
    const response = await davRequest('POST', '/calendars/personal', baseUrl);
    expect(response.status).toBe(405);
    expect(response.headers['allow']).toContain('PROPFIND');
  });
});

type DavRequestOptions = {
  headers?: Record<string, string>;
  body?: string;
};

async function davRequest(method: string, path: string, baseUrl: string, options: DavRequestOptions = {}) {
  const response = await fetch(`${baseUrl}${encodeURI(path)}`, {
    method,
    headers: options.headers,
    body: options.body
  });
  const text = method === 'HEAD' ? '' : await response.text();
  return {
    status: response.status,
    headers: headersToObject(response.headers),
    text
  };
}

function headersToObject(headers: any): Record<string, string> {
  const entries: Record<string, string> = {};
  headers.forEach((value: string, key: string) => {
    entries[key.toLowerCase()] = value;
  });
  return entries;
}

interface MultiStatusEntry {
  href: string;
  properties: Record<string, string | undefined>;
  statuses: number[];
}

function parseMultiStatus(xml: string | undefined): MultiStatusEntry[] {
  if (!xml) {
    return [];
  }
  const document = parser.parse(xml);
  const responses = toArray(document?.multistatus?.response);
  return responses.map((response: any) => {
    const hrefValue = normalizeHref(response.href);
    const propstats = toArray(response.propstat);
    const properties: Record<string, string | undefined> = {};
    const statuses: number[] = [];
    for (const propstat of propstats) {
      const statusText = propstat.status as string | undefined;
      if (statusText) {
        const match = statusText.match(/\s(\d{3})\s/);
        if (match) {
          statuses.push(Number.parseInt(match[1], 10));
        }
      }
      const prop = propstat.prop ?? {};
      for (const key of Object.keys(prop)) {
        const value = prop[key];
        if (typeof value === 'object' && value !== null) {
          properties[key] = value['#text'] ?? undefined;
        } else {
          properties[key] = value;
        }
      }
    }
    return { href: hrefValue, properties, statuses };
  });
}

function normalizeHref(value: unknown): string {
  if (typeof value === 'string') {
    return value.endsWith('/') && value !== '/' ? value.slice(0, -1) : value;
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
