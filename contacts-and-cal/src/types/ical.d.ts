declare module 'ical.js' {
  export class Component {
    constructor(data: any);
    getAllSubcomponents(type: string): Component[];
    updatePropertyWithValue(name: string, value: any): void;
    addSubcomponent(component: Component): void;
    toString(): string;
    getFirstPropertyValue(name: string): any;
  }

  export class Event {
    constructor(component: Component);
    uid: string;
    summary: string;
    description: string;
    startDate: Time;
    endDate: Time;
    isAllDay(): boolean;
  }

  export class Time {
    static fromJSDate(date: Date): Time;
    toJSDate(): Date;
    isDate: boolean;
  }

  export class Recur {
    static fromString(rrule: string): Recur;
    toString(): string;
  }

  export function parse(icalString: string): any;
}