import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';
import { StatusCodes } from 'http-status-codes';
import { DavService } from './dav/dav-service.js';
import {
  buildAddressBookReport,
  buildCalendarReport,
  buildLockResponse,
  buildMultiStatus,
  buildPropPatchResponse,
  buildSyncCollectionReport,
  parseAddressBookReport,
  parseCalendarReport,
  parsePropFind,
  parsePropPatch,
  parseSyncCollectionReport
} from './dav/xml.js';

export function createApp(service: DavService): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(morgan('dev'));
  app.use(bodyParser.text({ type: '*/*', limit: '5mb' }));

  app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      await handleRequest(req, res, service);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error.status ?? StatusCodes.INTERNAL_SERVER_ERROR;
    res.status(status).json({
      error: {
        message: error.message ?? 'Internal Server Error',
        details: error.stack
      }
    });
  });

  return app;
}

async function handleRequest(req: express.Request, res: express.Response, service: DavService): Promise<void> {
  const path = req.path.endsWith('/') && req.path !== '/' ? req.path.slice(0, -1) : req.path;
  const method = req.method.toUpperCase();
  res.setHeader('DAV', '1, 2');

  switch (method) {
    case 'OPTIONS': {
      const { allow, dav } = await service.options();
      res.setHeader('Allow', allow.join(', '));
      res.setHeader('DAV', dav);
      res.status(StatusCodes.OK).end();
      return;
    }
    case 'PROPFIND': {
      const depthHeader = (req.headers.depth as string | undefined) ?? 'infinity';
      const depth = normalizeDepth(depthHeader);
      const request = parsePropFind(getBodyString(req));
      const { resource, children } = await service.propFind(path, depth);
      const resources = [resource, ...children];
      const xml = buildMultiStatus(resources, request);
      res.status(StatusCodes.MULTI_STATUS).type('application/xml').send(xml);
      return;
    }
    case 'PROPPATCH': {
      const request = parsePropPatch(getBodyString(req));
      await service.propPatch(path, request.setProps, request.removeProps);
      const xml = buildPropPatchResponse(path, request);
      res.status(StatusCodes.MULTI_STATUS).type('application/xml').send(xml);
      return;
    }
    case 'MKCOL': {
      await service.mkcol(path, inferCollectionKind(path));
      res.status(StatusCodes.CREATED).end();
      return;
    }
    case 'GET':
    case 'HEAD': {
      const resource = await service.get(path);
      res.setHeader('ETag', resource.etag);
      res.setHeader('Content-Type', resource.contentType);
      if (method === 'GET') {
        res.status(StatusCodes.OK).send(resource.data ?? '');
      } else {
        res.status(StatusCodes.OK).end();
      }
      return;
    }
    case 'PUT': {
      const existing = await service.get(path).catch(() => undefined);
      const contentType = (req.headers['content-type'] as string | undefined) ?? 'application/octet-stream';
      const body = getBodyString(req);
      const resource = await service.put(path, contentType, body);
      res.setHeader('ETag', resource.etag);
      res.status(existing ? StatusCodes.NO_CONTENT : StatusCodes.CREATED).end();
      return;
    }
    case 'DELETE': {
      await service.remove(path);
      res.status(StatusCodes.NO_CONTENT).end();
      return;
    }
    case 'POST': {
      const { allow } = await service.options();
      res.setHeader('Allow', allow.join(', '));
      res.status(StatusCodes.METHOD_NOT_ALLOWED).end();
      return;
    }
    case 'COPY':
    case 'MOVE': {
      const destinationHeader = req.headers.destination as string | undefined;
      const destination = destinationHeader ? resolveDestination(destinationHeader, req) : undefined;
      if (!destination) {
        const error = new Error('Destination header is required');
        (error as any).status = StatusCodes.BAD_REQUEST;
        throw error;
      }
      const overwriteHeader = (req.headers.overwrite as string | undefined) ?? 'T';
      const overwrite = overwriteHeader.toUpperCase() !== 'F';
      const depth = normalizeDepth((req.headers.depth as string | undefined) ?? 'infinity', ['0', 'infinity'] as const);
      if (method === 'COPY') {
        await service.copy(path, destination, overwrite, depth);
      } else {
        await service.move(path, destination, overwrite, depth);
      }
      res.status(StatusCodes.CREATED).end();
      return;
    }
    case 'LOCK': {
      const lockRequest = parseLockRequest(getBodyString(req), req.headers.timeout as string | undefined);
      const lock = await service.lock(path, lockRequest);
      res.setHeader('Lock-Token', `<${lock.token}>`);
      const xml = buildLockResponse(path, lock);
      res.status(StatusCodes.OK).type('application/xml').send(xml);
      return;
    }
    case 'UNLOCK': {
      const tokenHeader = req.headers['lock-token'];
      const rawToken = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
      if (!rawToken) {
        const error = new Error('Lock-Token header is required');
        (error as any).status = StatusCodes.BAD_REQUEST;
        throw error;
      }
      const token = rawToken.replace(/[<>]/g, '');
      await service.unlock(path, token);
      res.status(StatusCodes.NO_CONTENT).end();
      return;
    }
    case 'REPORT': {
      const body = getBodyString(req);
      const calendarReport = parseCalendarReport(body);
      if (calendarReport) {
        const resources = await service.calendarReport(path, calendarReport);
        const xml = buildCalendarReport(resources, calendarReport.includeCalendarData);
        res.status(StatusCodes.MULTI_STATUS).type('application/xml').send(xml);
        return;
      }
      const addressReport = parseAddressBookReport(body);
      if (addressReport) {
        const resources = await service.addressBookReport(path, addressReport);
        const xml = buildAddressBookReport(resources, addressReport.includeAddressData);
        res.status(StatusCodes.MULTI_STATUS).type('application/xml').send(xml);
        return;
      }
      const syncReport = parseSyncCollectionReport(body);
      if (syncReport) {
        const result = await service.syncCollection(path, syncReport);
        const xml = buildSyncCollectionReport(result.collection, result.resources, {
          includeCalendarData: syncReport.includeCalendarData,
          includeAddressData: syncReport.includeAddressData,
          syncToken: result.syncToken
        });
        res.status(StatusCodes.MULTI_STATUS).type('application/xml').send(xml);
        return;
      }
      res.status(StatusCodes.BAD_REQUEST).end();
      return;
    }
    default:
      res.status(StatusCodes.NOT_IMPLEMENTED).end();
  }
}

type DepthValue = '0' | '1' | 'infinity';

function normalizeDepth(value: string): DepthValue;
function normalizeDepth(value: string, allowed: readonly ['0', 'infinity']): '0' | 'infinity';
function normalizeDepth(value: string, allowed?: readonly DepthValue[]): DepthValue {
  const normalized = value.toLowerCase();
  const candidates = allowed ?? (['0', '1', 'infinity'] as const);
  if (normalized === '0' && candidates.includes('0')) return '0';
  if (normalized === '1' && candidates.includes('1')) return '1';
  if (normalized === 'infinity' && candidates.includes('infinity')) return 'infinity';
  return candidates.includes('1') ? '1' : candidates[0];
}

function inferCollectionKind(path: string) {
  if (path.startsWith('/calendars')) {
    return 'calendar' as const;
  }
  if (path.startsWith('/contacts')) {
    return 'contact' as const;
  }
  return 'collection' as const;
}

function getBodyString(req: express.Request): string {
  const body = req.body;
  if (typeof body === 'string') {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf-8');
  }
  if (body == null) {
    return '';
  }
  return JSON.stringify(body);
}

function parseLockRequest(body: string, timeoutHeader?: string) {
  const timeoutSeconds = timeoutHeader ? parseTimeout(timeoutHeader) : undefined;
  const ownerMatch = body.match(/<d:owner>(.*?)<\/d:owner>/);
  const owner = ownerMatch ? ownerMatch[1] : undefined;
  const depthMatch = body.match(/<d:depth>(.*?)<\/d:depth>/);
  const depthValue = depthMatch?.[1] ?? 'infinity';
  return {
    owner,
    timeoutSeconds,
    depth: normalizeDepth(depthValue, ['0', 'infinity'] as const)
  };
}

function parseTimeout(header: string): number | undefined {
  if (header.toLowerCase() === 'infinity') {
    return undefined;
  }
  const match = header.match(/second-(\d+)/i);
  if (!match) return undefined;
  return Number.parseInt(match[1], 10);
}

function resolveDestination(destination: string, req: express.Request): string {
  if (destination.startsWith('/')) {
    return destination;
  }
  try {
    const base = `${req.protocol}://${req.get('host') ?? ''}`;
    const url = new URL(destination, base);
    return url.pathname;
  } catch {
    return destination;
  }
}
