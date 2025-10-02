export interface WebDAVProperty {
  name: string;
  namespace?: string;
  value?: string;
  children?: WebDAVProperty[];
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderProperty(key: string, value: any): string {
  if (typeof value === 'object' && value.children) {
    const childrenXml = value.children
      .map((child: any) => `<${child.name}>${child.value || ''}</${child.name}>`)
      .join('');
    return `<${key}>${childrenXml}</${key}>`;
  } else {
    const content = value ? escapeXml(String(value)) : '';
    return `<${key}>${content}</${key}>`;
  }
}

export function createMultistatusResponse(responses: any[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav">\n';

  responses.forEach(response => {
    xml += '  <d:response>\n';
    xml += `    <d:href>${escapeXml(response.href)}</d:href>\n`;

    response.propstats.forEach((propstat: any) => {
      xml += '    <d:propstat>\n';
      xml += '      <d:prop>\n';

      Object.keys(propstat.props).forEach(key => {
        const propertyXml = renderProperty(key, propstat.props[key]);
        xml += `        ${propertyXml}\n`;
      });

      xml += '      </d:prop>\n';
      xml += `      <d:status>${escapeXml(propstat.status)}</d:status>\n`;
      xml += '    </d:propstat>\n';
    });

    xml += '  </d:response>\n';
  });

  xml += '</d:multistatus>';
  return xml;
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