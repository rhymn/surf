import { Router } from 'express';
import { CalendarController } from '../controllers/calendar';
import { authenticate, webdavMethods } from '../middleware/auth';

const router = Router();
const calendarController = new CalendarController();

// Apply authentication and WebDAV methods
router.use(webdavMethods);
router.use(authenticate);

// CalDAV endpoints
router.options('*', calendarController.options);

// Handle PROPFIND and REPORT methods
router.all('/', (req, res, next) => {
  if (req.method === 'PROPFIND') {
    calendarController.propfind(req, res);
  } else {
    next();
  }
});

// Calendar management routes
router.get('/', calendarController.listCalendars); // List all calendars
router.delete('/:calendarId', calendarController.deleteCalendar); // Delete calendar

router.all('/:calendarId/', (req, res, next) => {
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
router.all('/:calendarId', (req, res, next) => {
  if (req.method === 'MKCALENDAR') {
    calendarController.mkcalendar(req, res);
  } else {
    next();
  }
});

router.get('/:calendarId', calendarController.getCalendar);
router.put('/:calendarId/:eventId', calendarController.putEvent);
router.delete('/:calendarId/:eventId', calendarController.deleteEvent);

export default router;