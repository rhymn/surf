import { Request, Response } from 'express';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../middleware/auth';
import { createMultistatusResponse, createPropfindResponse, parseCalendarQuery } from '../utils/webdav';
import { parseICalendar, createICalendarEvent, createCalendarResponse, CalendarEvent } from '../utils/ical';
import { v4 as uuidv4 } from 'uuid';

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

      // Get user's calendars
      const result = await pool.query(
        'SELECT id, name, description, color FROM calendars WHERE user_id = $1',
        [userId]
      );

      const responses = result.rows.map((calendar: any) => 
        createPropfindResponse(`/calendars/${calendar.id}/`, {
          'resourcetype': {
            children: [
              { name: 'collection', value: '' },
              { name: 'c:calendar', value: '' }
            ]
          },
          'displayname': calendar.name,
          'calendar-description': calendar.description || '',
          'calendar-color': calendar.color,
          'supported-calendar-component-set': {
            children: [
              { name: 'c:comp', value: '', attributes: { name: 'VEVENT' } }
            ]
          }
        })
      );

      // Add default calendar if none exist
      if (responses.length === 0) {
        responses.push(
          createPropfindResponse('/calendars/default/', {
            'resourcetype': {
              children: [
                { name: 'collection', value: '' },
                { name: 'c:calendar', value: '' }
              ]
            },
            'displayname': 'Default Calendar',
            'calendar-description': 'Default calendar',
            'calendar-color': '#3174ad'
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
        'SELECT * FROM events WHERE calendar_id = $1',
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

      await pool.query(
        `INSERT INTO events (calendar_id, uid, ical_data, updated_at) 
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (uid) DO UPDATE SET
         ical_data = $3, updated_at = CURRENT_TIMESTAMP`,
        [calendarId, eventId, icalData]
      );

      res.status(201).end();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  deleteEvent = async (req: Request, res: Response) => {
    try {
      const { eventId } = req.params;
      await pool.query('DELETE FROM events WHERE uid = $1', [eventId]);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
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
      let sqlQuery = 'SELECT * FROM events WHERE calendar_id = $1';
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
        'INSERT INTO calendars (user_id, name, description, color) VALUES ($1, $2, $3, $4)',
        [userId, calendarName, calendarDescription, calendarColor]
      );

      res.status(201).end();
    } catch (error) {
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
        'SELECT id, name, description, color, created_at FROM calendars WHERE user_id = $1 ORDER BY name',
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
      await pool.query('DELETE FROM events WHERE calendar_id = $1', [calendarId]);
      
      // Then delete the calendar (only if user owns it)
      const result = await pool.query(
        'DELETE FROM calendars WHERE id = $1 AND user_id = $2',
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