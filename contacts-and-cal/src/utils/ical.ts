import ICAL from 'ical.js';

export interface CalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  rrule?: string;
}

export function createICalendarEvent(event: CalendarEvent): string {
  const comp = new ICAL.Component(['vcalendar', [], []]);
  comp.updatePropertyWithValue('version', '2.0');
  comp.updatePropertyWithValue('prodid', '-//CalDAV Server//EN');

  const vevent = new ICAL.Component('vevent');
  vevent.updatePropertyWithValue('uid', event.uid);
  vevent.updatePropertyWithValue('summary', event.summary);
  
  if (event.description) {
    vevent.updatePropertyWithValue('description', event.description);
  }

  const startTime = ICAL.Time.fromJSDate(event.startDate);
  const endTime = ICAL.Time.fromJSDate(event.endDate);

  if (event.allDay) {
    startTime.isDate = true;
    endTime.isDate = true;
  }

  vevent.updatePropertyWithValue('dtstart', startTime);
  vevent.updatePropertyWithValue('dtend', endTime);

  if (event.rrule) {
    const rrule = ICAL.Recur.fromString(event.rrule);
    vevent.updatePropertyWithValue('rrule', rrule);
  }

  comp.addSubcomponent(vevent);
  return comp.toString();
}