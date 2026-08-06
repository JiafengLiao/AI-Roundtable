const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Max inclusive span between start and end dates (4 weeks). */
export const MAX_HOTSPOT_RANGE_DAYS = 28;

export type DateRange = {
  endDate: string;
  startDate: string;
};

export type ChangedDateBoundary = "startDate" | "endDate";

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const timestamp = parseDate(date);
  return timestamp === null ? date : formatDate(timestamp + days * MS_PER_DAY);
}

export function normalizeDateRange(range: DateRange, changed: ChangedDateBoundary): DateRange {
  const start = parseDate(range.startDate);
  const end = parseDate(range.endDate);
  if (start === null || end === null) {
    return range;
  }

  if (start > end) {
    return changed === "startDate"
      ? { startDate: range.startDate, endDate: range.startDate }
      : { startDate: range.endDate, endDate: range.endDate };
  }

  const diffDays = Math.round((end - start) / MS_PER_DAY);
  if (diffDays <= MAX_HOTSPOT_RANGE_DAYS) {
    return range;
  }

  return changed === "startDate"
    ? { startDate: range.startDate, endDate: addDays(range.startDate, MAX_HOTSPOT_RANGE_DAYS) }
    : { startDate: addDays(range.endDate, -MAX_HOTSPOT_RANGE_DAYS), endDate: range.endDate };
}
