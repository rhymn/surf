import xmlBuilder from 'xml-builder';

export interface WebDAVProperty {
  name: string;
  namespace?: string;
  value?: string;
  children?: WebDAVProperty[];
}

export function createMultistatusResponse(responses: any[]): string {
  const root = xmlBuilder.create('d:multistatus')
    .att('xmlns:d', 'DAV:')
    .att('xmlns:c', 'urn:ietf:params:xml:ns:caldav')
    .att('xmlns:card', 'urn:ietf:params:xml:ns:carddav');

  responses.forEach(response => {
    const resp = root.ele('d:response');
    resp.ele('d:href', response.href);

    response.propstats.forEach((propstat: any) => {
      const ps = resp.ele('d:propstat');
      const prop = ps.ele('d:prop');

      Object.keys(propstat.props).forEach(key => {
        const value = propstat.props[key];
        if (typeof value === 'object' && value.children) {
          const el = prop.ele(key);
          value.children.forEach((child: any) => {
            el.ele(child.name, child.value);
          });
        } else {
          prop.ele(key, value);
        }
      });

      ps.ele('d:status', propstat.status);
    });
  });

  return '<?xml version="1.0" encoding="UTF-8"?>\n' + root.end({ pretty: true });
}

export function createPropfindResponse(href: string, props: any, status = 'HTTP/1.1 200 OK'): any {
  return {
    href,
    propstats: [{
      props,
      status
    }]
  };
}

export function parseCalendarQuery(xmlBody: string): any {
  // Basic calendar-query parsing
  // In a full implementation, you'd parse the XML properly
  return {
    timeRange: {
      start: null,
      end: null
    },
    properties: ['calendar-data']
  };
}