/**
 * Date utility functions using native JavaScript Date API
 * (Avoiding deprecated moment.js library)
 */

/**
 * Format date to ISO string for database storage
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * Format date to local date string
 */
export function toLocaleDateString(date: Date, locale = 'en-US'): string {
  return date.toLocaleDateString(locale);
}

/**
 * Format date to local date-time string
 */
export function toLocaleString(date: Date, locale = 'en-US'): string {
  return date.toLocaleString(locale);
}

/**
 * Parse date from ISO string
 */
export function fromISOString(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Get current timestamp
 */
export function now(): Date {
  return new Date();
}

/**
 * Check if date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get start of day (00:00:00)
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of day (23:59:59.999)
 */
export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Format date for CalDAV ETags (RFC compliant)
 */
export function formatETag(date: Date): string {
  return `"${date.getTime()}"`;
}