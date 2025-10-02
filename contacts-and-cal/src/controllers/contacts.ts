import { Request, Response } from 'express';
import { pool } from '../config/database';

export class ContactsController {
  options = (req: Request, res: Response) => {
    res.set({
      'DAV': '1, 2, addressbook',
      'Allow': 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND',
      'Content-Type': 'text/plain'
    });
    res.status(200).end();
  };

  propfind = async (req: Request, res: Response) => {
    const response = `<?xml version="1.0" encoding="UTF-8"?>
<d:multistatus xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:response>
    <d:href>/contacts/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype>
          <d:collection/>
          <card:addressbook/>
        </d:resourcetype>
        <d:displayname>Default Contacts</d:displayname>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.status(207).send(response);
  };

  getContact = async (req: Request, res: Response) => {
    try {
      const { contactId } = req.params;
      const result = await pool.query(
        'SELECT vcard_data FROM caldav_contacts WHERE uid = $1',
        [contactId]
      );

      if (result.rows.length === 0) {
        return res.status(404).end();
      }

      res.set('Content-Type', 'text/vcard');
      res.send(result.rows[0].vcard_data);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  putContact = async (req: Request, res: Response) => {
    try {
      const { contactId } = req.params;
      const vcardData = req.body;

      await pool.query(
        `INSERT INTO caldav_contacts (uid, vcard_data, updated_at) 
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (uid) DO UPDATE SET
         vcard_data = $2, updated_at = CURRENT_TIMESTAMP`,
        [contactId, vcardData]
      );

      res.status(201).end();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  deleteContact = async (req: Request, res: Response) => {
    try {
      const { contactId } = req.params;
      await pool.query('DELETE FROM caldav_contacts WHERE uid = $1', [contactId]);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}