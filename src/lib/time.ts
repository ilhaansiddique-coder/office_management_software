import { format } from "date-fns";

export const toZonedDate = (date: Date, timeZone?: string): Date => {
  if (!timeZone) return date;
  try {
    return new Date(date.toLocaleString("en-US", { timeZone }));
  } catch {
    return date;
  }
};

export const getTimeBasedGreeting = (timeZone?: string): string => {
  const date = toZonedDate(new Date(), timeZone);
  const hour = date.getHours();
  
  if (hour < 12) {
    return "Good Morning";
  } else if (hour < 17) {
    return "Good Afternoon";
  } else if (hour < 21) {
    return "Good Evening";
  } else {
    return "Good Night";
  }
};

export const formatDate = (
  date: Date,
  dateFormat: string = "dd/MM/yyyy",
  timeZone?: string,
): string => {
  try {
    return format(toZonedDate(date, timeZone), dateFormat);
  } catch (error) {
    return format(toZonedDate(date, timeZone), "dd/MM/yyyy"); // fallback format
  }
};

export const formatTime = (
  date: Date,
  timeFormat: string = "12h",
  timeZone?: string,
): string => {
  const zonedDate = toZonedDate(date, timeZone);
  if (timeFormat === "24h") {
    return format(zonedDate, "HH:mm");
  } else {
    return format(zonedDate, "hh:mm a");
  }
};

export const formatInTimeZone = (
  date: Date,
  dateFormat: string,
  timeZone?: string,
): string => {
  try {
    return format(toZonedDate(date, timeZone), dateFormat);
  } catch {
    return format(date, dateFormat);
  }
};

const padDatePart = (value: number) => String(value).padStart(2, "0");

const buildValidatedDateParts = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
};

export const parseDateInputParts = (
  value?: string,
): { year: number; month: number; day: number } | null => {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const slashMatch = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return buildValidatedDateParts(Number(year), Number(month), Number(day));
  }

  const dashMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashMatch) {
    const [, year, month, day] = dashMatch;
    return buildValidatedDateParts(Number(year), Number(month), Number(day));
  }

  return null;
};

export const isValidDateInput = (value?: string): boolean => {
  return parseDateInputParts(value) !== null;
};

export const normalizeDateDisplayInput = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const toDisplayDateInput = (
  value?: string | Date,
  timeZone?: string,
): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const zoned = toZonedDate(value, timeZone);
    return `${padDatePart(zoned.getDate())}/${padDatePart(zoned.getMonth() + 1)}/${zoned.getFullYear()}`;
  }

  if (!value) {
    const zoned = toZonedDate(new Date(), timeZone);
    return `${padDatePart(zoned.getDate())}/${padDatePart(zoned.getMonth() + 1)}/${zoned.getFullYear()}`;
  }

  const parts = parseDateInputParts(value);
  if (parts) {
    return `${padDatePart(parts.day)}/${padDatePart(parts.month)}/${parts.year}`;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return "";
  const zoned = toZonedDate(parsedDate, timeZone);
  return `${padDatePart(zoned.getDate())}/${padDatePart(zoned.getMonth() + 1)}/${zoned.getFullYear()}`;
};

export const toIsoFromDateInput = (
  value?: string,
  timeZone?: string,
): string | undefined => {
  if (!value) return undefined;
  const nowZoned = toZonedDate(new Date(), timeZone);
  const parts = parseDateInputParts(value);
  if (!parts) return undefined;
  const combined = new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    nowZoned.getHours(),
    nowZoned.getMinutes(),
    nowZoned.getSeconds(),
    nowZoned.getMilliseconds(),
  );
  return combined.toISOString();
};
