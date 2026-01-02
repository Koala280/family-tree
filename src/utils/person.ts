import { Person, DateInfo } from '../types';

export const getLastNameList = (person: Person): string[] => {
  if (Array.isArray(person.lastNames) && person.lastNames.length > 0) {
    return person.lastNames;
  }
  if (person.lastName) {
    return [person.lastName];
  }
  return [];
};

export const getDisplayName = (person: Person) => {
  const firstName = person.firstName ?? '';
  const lastNames = getLastNameList(person).join(' ').trim();
  return [firstName, lastNames].filter(part => part.length > 0).join(' ').trim();
};

export const formatDateInfo = (date: DateInfo) => {
  const parts = [date.day, date.month, date.year].filter(Boolean);
  return parts.join('.');
};

export const hasDateInfo = (date: DateInfo) => {
  return Boolean(date.day || date.month || date.year);
};
