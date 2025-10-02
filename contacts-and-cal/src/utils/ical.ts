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

export function parseICalendar(icalData: string): CalendarEvent[] {
  try {
    const jcalData = ICAL.parse(icalData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    return vevents.map((vevent: ICAL.Component) => {
      const event = new ICAL.Event(vevent);
      
      return {
        uid: event.uid,
        summary: event.summary,
        description: event.description,
        startDate: event.startDate.toJSDate(),
        endDate: event.endDate.toJSDate(),
        allDay: event.isAllDay(),
        rrule: vevent.getFirstPropertyValue('rrule')?.toString()
      };
    });
  } catch (error) {
    console.error('Error parsing iCalendar:', error);
    return [];
  }
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

export function createCalendarResponse(events: CalendarEvent[]): string {
  const comp = new ICAL.Component(['vcalendar', [], []]);
  comp.updatePropertyWithValue('version', '2.0');
  comp.updatePropertyWithValue('prodid', '-//CalDAV Server//EN');

  events.forEach(eventData => {
    const vevent = new ICAL.Component('vevent');
    vevent.updatePropertyWithValue('uid', eventData.uid);
    vevent.updatePropertyWithValue('summary', eventData.summary);
    
    if (eventData.description) {
      vevent.updatePropertyWithValue('description', eventData.description);
    }

    const startTime = ICAL.Time.fromJSDate(eventData.startDate);
    const endTime = ICAL.Time.fromJSDate(eventData.endDate);

    if (eventData.allDay) {
      startTime.isDate = true;
      endTime.isDate = true;
    }

    vevent.updatePropertyWithValue('dtstart', startTime);
    vevent.updatePropertyWithValue('dtend', endTime);

    if (eventData.rrule) {
      const rrule = ICAL.Recur.fromString(eventData.rrule);
      vevent.updatePropertyWithValue('rrule', rrule);
    }

    comp.addSubcomponent(vevent);
  });

  return comp.toString();
}