export interface Contact {
  uid: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  organization?: string;
}

export function parseVCard(vcardData: string): Contact {
  try {
    // Basic vCard parsing - in production use a proper vCard parser
    const lines = vcardData.split('\n');
    const contact: Contact = { uid: '' };

    lines.forEach(line => {
      const [property, value] = line.split(':');
      if (!property || !value) return;

      switch (property.toUpperCase()) {
        case 'UID':
          contact.uid = value.trim();
          break;
        case 'FN':
          // Full name - split into first/last
          const nameParts = value.trim().split(' ');
          contact.firstName = nameParts[0];
          contact.lastName = nameParts.slice(1).join(' ');
          break;
        case 'EMAIL':
          contact.email = value.trim();
          break;
        case 'TEL':
          contact.phone = value.trim();
          break;
        case 'ORG':
          contact.organization = value.trim();
          break;
      }
    });

    return contact;
  } catch (error) {
    console.error('Error parsing vCard:', error);
    return { uid: '' };
  }
}

export function createVCard(contact: Contact): string {
  let vcard = 'BEGIN:VCARD\n';
  vcard += 'VERSION:3.0\n';
  vcard += `UID:${contact.uid}\n`;
  
  if (contact.firstName || contact.lastName) {
    const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    vcard += `FN:${fullName}\n`;
    vcard += `N:${contact.lastName || ''};${contact.firstName || ''};;;\n`;
  }
  
  if (contact.email) {
    vcard += `EMAIL:${contact.email}\n`;
  }
  
  if (contact.phone) {
    vcard += `TEL:${contact.phone}\n`;
  }
  
  if (contact.organization) {
    vcard += `ORG:${contact.organization}\n`;
  }
  
  vcard += 'END:VCARD';
  return vcard;
}