import { DateInfo } from '../types';

export type DateField = 'day' | 'month' | 'year';

export const DATE_INPUT_YEAR_MIN = 0;
export const DATE_INPUT_YEAR_MAX = 3000;

const NON_DIGIT_PATTERN = /\D+/g;

const parsePart = (value?: string): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isLeapYear = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const getMaxDayForMonth = (month: number, year?: number) => {
  if (month === 2) {
    if (typeof year === 'number') {
      return isLeapYear(year) ? 29 : 28;
    }
    return 29;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
};

const normalizeFieldInput = (field: DateField, rawValue: string): string | null => {
  const maxLength = field === 'year' ? 4 : 2;
  const cleaned = rawValue.replace(NON_DIGIT_PATTERN, '').slice(0, maxLength);
  if (!cleaned) return '';

  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(parsed)) return '';

  if (field === 'month') {
    if (cleaned.length === 1 && cleaned === '0') return cleaned;
    if (parsed < 1 || parsed > 12) return null;
  }

  if (field === 'day') {
    if (cleaned.length === 1 && cleaned === '0') return cleaned;
    if (parsed < 1 || parsed > 31) return null;
  }

  if (field === 'year' && cleaned.length === 4) {
    if (parsed < DATE_INPUT_YEAR_MIN || parsed > DATE_INPUT_YEAR_MAX) return null;
  }

  return cleaned;
};

export const sanitizeDateInput = (
  currentDate: DateInfo,
  field: DateField,
  rawValue: string
): DateInfo | null => {
  const normalizedFieldValue = normalizeFieldInput(field, rawValue);
  if (normalizedFieldValue === null) return null;

  const nextDate: DateInfo = {
    ...currentDate,
    [field]: normalizedFieldValue,
  };

  const month = parsePart(nextDate.month);
  const day = parsePart(nextDate.day);

  if (month !== null && day !== null && month >= 1 && month <= 12 && day >= 1) {
    const year = nextDate.year && nextDate.year.length === 4
      ? parsePart(nextDate.year) ?? undefined
      : undefined;
    const maxDay = getMaxDayForMonth(month, year);

    if (day > maxDay) {
      if (field === 'day') {
        return null;
      }
      nextDate.day = String(maxDay);
    }
  }

  return nextDate;
};

const normalizeFieldOnBlur = (field: DateField, rawValue: string) => {
  const maxLength = field === 'year' ? 4 : 2;
  const cleaned = rawValue.replace(NON_DIGIT_PATTERN, '').slice(0, maxLength);
  if (!cleaned) return { value: '', invalid: false };

  const parsed = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(parsed)) return { value: '', invalid: true };

  if (field === 'month') {
    if (parsed < 1 || parsed > 12) {
      return { value: '', invalid: true };
    }
    return { value: String(parsed).padStart(2, '0'), invalid: false };
  }

  if (field === 'day') {
    if (parsed < 1 || parsed > 31) {
      return { value: '', invalid: true };
    }
    return { value: String(parsed).padStart(2, '0'), invalid: false };
  }

  if (cleaned.length === 4 && (parsed < DATE_INPUT_YEAR_MIN || parsed > DATE_INPUT_YEAR_MAX)) {
    return { value: '', invalid: true };
  }

  return { value: cleaned, invalid: false };
};

export const normalizeDateInputOnBlur = (
  currentDate: DateInfo,
  field: DateField
): { nextDate: DateInfo; invalidField: DateField | null } => {
  const normalizedField = normalizeFieldOnBlur(field, currentDate[field] ?? '');
  const nextDate: DateInfo = {
    ...currentDate,
    [field]: normalizedField.value,
  };

  if (normalizedField.invalid) {
    return { nextDate, invalidField: field };
  }

  const month = parsePart(nextDate.month);
  const day = parsePart(nextDate.day);
  if (month !== null && day !== null && month >= 1 && month <= 12 && day >= 1) {
    const year = nextDate.year && nextDate.year.length === 4
      ? parsePart(nextDate.year) ?? undefined
      : undefined;
    const maxDay = getMaxDayForMonth(month, year);
    if (day > maxDay) {
      nextDate.day = String(maxDay).padStart(2, '0');
    }
  }

  return { nextDate, invalidField: null };
};
