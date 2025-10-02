import { Router, Request, Response, NextFunction } from 'express';
import { CalendarController } from '../controllers/calendar';
import { authenticate, webdavMethods } from '../middleware/auth';

const router = Router();
const calendarController = new CalendarController();

// Apply authentication and WebDAV methods
router.use(webdavMethods);
router.use(authenticate);

// CalDAV endpoints
router.options('*', calendarController.options);

// Handle PROPFIND and REPORT methods for both / and empty path
router.all(['/', ''], (req: Request, res: Response, next: NextFunction) => {
  console.log(`🔍 Calendar route handler: ${req.method} ${req.path} (originalUrl: ${req.originalUrl})`);
  
  if (req.method === 'PROPFIND') {
    console.log('✅ Routing PROPFIND to calendarController.propfind');
    calendarController.propfind(req, res);
  } else if (req.method === 'GET') {
    if (req.headers['accept']?.includes('application/json')) {
      // Only return JSON if specifically requested
      calendarController.listCalendars(req, res);
    } else {
      // CalDAV clients expect PROPFIND-like behavior for GET
      console.log('✅ Routing GET to calendarController.propfind (CalDAV client)');
      calendarController.propfind(req, res);
    }
  } else if (req.method === 'PUT') {
    // Handle PUT on /calendars (Thunderbird compatibility)
    calendarController.propfind(req, res);
  } else {
    console.log(`⚠️ Unhandled method ${req.method} on calendar root, passing to next handler`);
    next();
  }
});
router.delete('/:calendarId', calendarController.deleteCalendar); // Delete calendar

router.all('/:calendarId/', (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'PROPFIND') {
    calendarController.propfind(req, res);
  } else if (req.method === 'REPORT') {
    calendarController.report(req, res);
  } else if (req.method === 'MKCALENDAR') {
    calendarController.mkcalendar(req, res);
  } else {
    next();
  }
});

// MKCALENDAR at calendar level
router.all('/:calendarId', (req: Request, res: Response, next: NextFunction) => {
  console.log(`🔍 Calendar operation: ${req.method} ${req.originalUrl}`);
  
  if (req.method === 'MKCALENDAR') {
    calendarController.mkcalendar(req, res);
  } else if (req.method === 'PROPFIND') {
    calendarController.propfind(req, res);
  } else if (req.method === 'GET') {
    calendarController.getCalendar(req, res);
  } else if (req.method === 'HEAD') {
    // HEAD request - same as GET but no body
    calendarController.getCalendar(req, res);
  } else if (req.method === 'PUT') {
    // Handle PUT to calendar collection (some clients send events here)
    console.log(`🔧 PUT request to calendar collection - this might be an event creation attempt`);
    console.log(`📝 Content-Type: ${req.headers['content-type']}`);
    console.log(`📏 Content-Length: ${req.headers['content-length']}`);
    
    // Check if this looks like an event (has iCalendar content)
    if (req.headers['content-type']?.includes('text/calendar')) {
      console.log(`✅ Detected iCalendar content in PUT to calendar collection`);
      console.log(`🔄 Redirecting to event creation with generated UID`);
      
      // Generate a unique event ID and redirect to proper event endpoint
      const eventId = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.ics`;
      req.params.eventId = eventId;
      
      // Forward to event creation
      calendarController.putEvent(req, res);
    } else {
      console.log(`❌ PUT to calendar collection without iCalendar content`);
      res.status(400).send('Bad Request: Expected iCalendar content for event creation');
    }
  } else {
    console.log(`⚠️ Unhandled calendar method: ${req.method}`);
    next();
  }
});

// Handle individual event operations (PUT, GET, DELETE)
router.all('/:calendarId/:eventId', (req: Request, res: Response, next: NextFunction) => {
  console.log(`🔍 Event operation: ${req.method} ${req.originalUrl}`);
  
  if (req.method === 'PUT') {
    calendarController.putEvent(req, res);
  } else if (req.method === 'GET') {
    calendarController.getEvent(req, res);
  } else if (req.method === 'HEAD') {
    // HEAD request - same as GET but no body  
    calendarController.getEvent(req, res);
  } else if (req.method === 'DELETE') {
    calendarController.deleteEvent(req, res);
  } else {
    console.log(`⚠️ Unhandled event method: ${req.method}`);
    next();
  }
});

export default router;