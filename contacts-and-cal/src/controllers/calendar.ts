import { Request, Response } from 'express';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../middleware/auth';
import { createMultistatusResponse, createPropfindResponse, parseCalendarQuery } from '../utils/webdav';
import { createICalendarEvent, CalendarEvent } from '../utils/ical';

export class CalendarController {
  options = (req: Request, res: Response) => {
    res.set({
      'DAV': '1, 2, calendar-access',
      'Allow': 'OPTIONS, GET, HEAD, POST, PUT, DELETE, PROPFIND',
      'Content-Type': 'text/plain'
    });
    res.status(200).end();
  };

  propfind = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).send('Unauthorized');
      }

      const responses = [];
      const depth = req.headers.depth || '0';
      
      console.log(`🔍 Calendar PROPFIND: path="${req.path}", originalUrl="${req.originalUrl}", depth="${depth}"`);

      // For Depth: 0 on the calendars collection, return the collection itself
      // For Depth: 1 on the calendars collection, return the individual calendars (not the parent)
      if (depth === '0' && (req.path === '/' || req.path === '' || req.originalUrl.includes('/calendars'))) {
        console.log('✅ Adding calendar home collection to PROPFIND response (Depth: 0)');
        responses.push(
          createPropfindResponse('/calendars/', {
            'resourcetype': {
              children: [
                { name: 'collection', value: '' }
              ]
            },
            'displayname': 'Calendar Home'
          })
        );
      }

      // Get user's calendars - but only add them if we're doing discovery or if no depth restrictions
      const result = await pool.query(
        'SELECT id, name, description, color FROM caldav_calendars WHERE user_id = $1',
        [userId]
      );

      console.log(`📅 Found ${result.rows.length} calendars for user ${userId}`);

      // For both Depth: 0 and Depth: 1, include individual calendars
      // Thunderbird needs to see the actual calendar collections for discovery
      result.rows.forEach((calendar: any) => {
        console.log(`📅 Adding calendar: ${calendar.name} (ID: ${calendar.id})`);
        responses.push(
          createPropfindResponse(`/calendars/${calendar.id}/`, {
            'resourcetype': {
              children: [
                { name: 'd:collection', value: '' },
                { name: 'c:calendar', value: '' }
              ]
            },
            'displayname': calendar.name,
            'c:calendar-description': calendar.description || '',
            'c:calendar-color': calendar.color,
            'c:supported-calendar-component-set': {
              children: [
                { name: 'c:comp', value: '', attributes: { name: 'VEVENT' } }
              ]
            }
          })
        );
      });

      // Add default calendar if none exist
      if (result.rows.length === 0) {
        console.log('📅 No calendars found, creating default calendar');
        
        // Create a default calendar in the database
        const defaultCalResult = await pool.query(
          'INSERT INTO caldav_calendars (user_id, name, description, color) VALUES ($1, $2, $3, $4) RETURNING id',
          [userId, 'Personal', 'Personal calendar', '#3174ad']
        );
        
        const defaultCalId = defaultCalResult.rows[0].id;
        console.log(`📅 Created default calendar with ID: ${defaultCalId}`);
        
        responses.push(
          createPropfindResponse(`/calendars/${defaultCalId}/`, {
            'resourcetype': {
              children: [
                { name: 'd:collection', value: '' },
                { name: 'c:calendar', value: '' }
              ]
            },
            'displayname': 'Personal',
            'c:calendar-description': 'Personal calendar',
            'c:calendar-color': '#3174ad',
            'c:supported-calendar-component-set': {
              children: [
                { name: 'c:comp', value: '', attributes: { name: 'VEVENT' } }
              ]
            }
          })
        );
      }

      const xml = createMultistatusResponse(responses);
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.status(207).send(xml);
    } catch (error) {
      console.error('PROPFIND error:', error);
      res.status(500).send('Internal server error');
    }
  };

  getCalendar = async (req: Request, res: Response) => {
    try {
      const { calendarId } = req.params;
      const result = await pool.query(
        'SELECT * FROM caldav_events WHERE calendar_id = $1',
        [calendarId]
      );

      const events = result.rows.map(event => event.ical_data).join('\n');
      res.set('Content-Type', 'text/calendar');
      res.send(events);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  putEvent = async (req: Request, res: Response) => {
    try {
      const { calendarId, eventId } = req.params;
      const icalData = req.body;
      
      // Remove .ics extension if present
      const cleanEventId = eventId.replace(/\.ics$/, '');
      
      console.log(`📅 PUT Event: calendarId=${calendarId}, eventId=${cleanEventId}`);
      console.log(`📝 iCal data length: ${icalData ? icalData.length : 0} characters`);
      
      if (!icalData || typeof icalData !== 'string') {
        console.error('❌ Invalid iCal data provided');
        return res.status(400).send('Invalid iCal data');
      }

      // Check if calendar exists first
      const calendarCheck = await pool.query(
        'SELECT id FROM caldav_calendars WHERE id = $1',
        [calendarId]
      );
      
      if (calendarCheck.rows.length === 0) {
        console.error(`❌ Calendar ${calendarId} not found`);
        return res.status(404).send('Calendar not found');
      }

      const result = await pool.query(
        `INSERT INTO caldav_events (calendar_id, uid, ical_data, updated_at) 
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (uid) DO UPDATE SET
         calendar_id = $1, ical_data = $3, updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [calendarId, cleanEventId, icalData]
      );

      console.log(`✅ Event saved successfully: ID=${result.rows[0].id}`);
      res.status(201).end();
    } catch (error) {
      console.error('❌ PUT Event error:', error);
      res.status(500).send('Internal server error: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  getEvent = async (req: Request, res: Response) => {
    try {
      const { calendarId, eventId } = req.params;
      
      // Remove .ics extension if present
      const cleanEventId = eventId.replace(/\.ics$/, '');
      
      const result = await pool.query(
        'SELECT ical_data FROM caldav_events WHERE calendar_id = $1 AND uid = $2',
        [calendarId, cleanEventId]
      );

      if (result.rows.length === 0) {
        return res.status(404).send('Event not found');
      }

      res.set('Content-Type', 'text/calendar; charset=utf-8');
      res.send(result.rows[0].ical_data);
    } catch (error) {
      console.error('Get event error:', error);
      res.status(500).send('Internal server error');
    }
  };

  deleteEvent = async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      
      // Remove .ics extension if present
      const cleanEventId = eventId.replace(/\.ics$/, '');
      
      const result = await pool.query('DELETE FROM caldav_events WHERE uid = $1 RETURNING *', [cleanEventId]);
      
      if (result.rowCount === 0) {
        return res.status(404).send('Event not found');
      }
      
      res.status(204).end();
    } catch (error) {
      console.error('Delete event error:', error);
      res.status(500).send('Internal server error');
    }
  };

  // REPORT method for calendar-query
  report = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).send('Unauthorized');
      }

      const { calendarId } = req.params;
      const query = parseCalendarQuery(req.body);

      // Get events from calendar
      let sqlQuery = 'SELECT * FROM caldav_events WHERE calendar_id = $1';
      const params: any[] = [calendarId];

      // Add time range filter if provided
      if (query.timeRange.start) {
        sqlQuery += ' AND start_date >= $2';
        params.push(query.timeRange.start);
      }
      if (query.timeRange.end) {
        sqlQuery += ` AND end_date <= $${params.length + 1}`;
        params.push(query.timeRange.end);
      }

      const result = await pool.query(sqlQuery, params);
      
      const responses = result.rows.map((event: any) => {
        const eventData: CalendarEvent = {
          uid: event.uid,
          summary: event.summary || '',
          description: event.description,
          startDate: event.start_date,
          endDate: event.end_date,
          allDay: event.all_day,
          rrule: event.rrule
        };

        return createPropfindResponse(`/calendars/${calendarId}/${event.uid}.ics`, {
          'getetag': `"${event.updated_at}"`,
          'calendar-data': createICalendarEvent(eventData)
        });
      });

      const xml = createMultistatusResponse(responses);
      res.set('Content-Type', 'application/xml; charset=utf-8');
      res.status(207).send(xml);
    } catch (error) {
      console.error('REPORT error:', error);
      res.status(500).send('Internal server error');
    }
  };

  // MKCALENDAR method - Creates a new calendar
  mkcalendar = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).send('Unauthorized');
      }

      const { calendarId } = req.params;
      
      // Parse XML body for calendar properties (displayname, description, color)
      let calendarName = calendarId;
      let calendarDescription = '';
      let calendarColor = '#3174ad';

      // Basic XML parsing for calendar properties
      if (req.body && typeof req.body === 'string') {
        const displayNameMatch = req.body.match(/<displayname[^>]*>([^<]+)<\/displayname>/i);
        const descMatch = req.body.match(/<calendar-description[^>]*>([^<]+)<\/calendar-description>/i);
        const colorMatch = req.body.match(/<calendar-color[^>]*>([^<]+)<\/calendar-color>/i);
        
        if (displayNameMatch) calendarName = displayNameMatch[1];
        if (descMatch) calendarDescription = descMatch[1];
        if (colorMatch) calendarColor = colorMatch[1];
      }
      
      // Create new calendar
      await pool.query(
        'INSERT INTO caldav_calendars (user_id, name, description, color) VALUES ($1, $2, $3, $4)',
        [userId, calendarName, calendarDescription, calendarColor]
      );

      res.status(201).end();
    } catch (error: any) {
      console.error('MKCALENDAR error:', error);
      if (error.code === '23505') { // Unique violation
        res.status(409).send('Calendar already exists');
      } else {
        res.status(500).send('Internal server error');
      }
    }
  };

  // List all calendars for a user
  listCalendars = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).send('Unauthorized');
      }

      const result = await pool.query(
        'SELECT id, name, description, color, created_at FROM caldav_calendars WHERE user_id = $1 ORDER BY name',
        [userId]
      );

      res.json({
        calendars: result.rows.map((cal: any) => ({
          id: cal.id,
          name: cal.name,
          description: cal.description,
          color: cal.color,
          href: `/calendars/${cal.id}/`,
          created_at: cal.created_at
        }))
      });
    } catch (error) {
      console.error('List calendars error:', error);
      res.status(500).send('Internal server error');
    }
  };

  // Delete a calendar
  deleteCalendar = async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).send('Unauthorized');
      }

      const { calendarId } = req.params;

      // First delete all events in the calendar
      await pool.query('DELETE FROM caldav_events WHERE calendar_id = $1', [calendarId]);
      
      // Then delete the calendar (only if user owns it)
      const result = await pool.query(
        'DELETE FROM caldav_calendars WHERE id = $1 AND user_id = $2',
        [calendarId, userId]
      );

      if (result.rowCount === 0) {
        return res.status(404).send('Calendar not found');
      }

      res.status(204).end();
    } catch (error) {
      console.error('Delete calendar error:', error);
      res.status(500).send('Internal server error');
    }
  };
}