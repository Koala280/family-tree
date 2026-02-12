import { Person, DateInfo, FamilyTree, KnownDiseaseEntry } from '../types';

export const getLastNameList = (person: Person): string[] => {
  if (Array.isArray(person.lastNames) && person.lastNames.length > 0) {
    return person.lastNames;
  }
  if (person.lastName) {
    return [person.lastName];
  }
  return [];
};

const normalizeText = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const toKnownDiseaseEntry = (value: unknown): KnownDiseaseEntry | null => {
  if (typeof value === 'string') {
    return { name: value, hereditary: false };
  }
  if (value && typeof value === 'object') {
    const candidate = value as { name?: unknown; hereditary?: unknown };
    if (typeof candidate.name === 'string') {
      return {
        name: candidate.name,
        hereditary: candidate.hereditary === true,
      };
    }
  }
  return null;
};

export const getKnownDiseaseEntries = (person: Person): KnownDiseaseEntry[] => {
  const value = person.knownDiseases as unknown;
  if (Array.isArray(value)) {
    return value
      .map(toKnownDiseaseEntry)
      .filter((entry): entry is KnownDiseaseEntry => entry !== null);
  }
  const single = toKnownDiseaseEntry(value);
  return single ? [single] : [];
};

export const getKnownDiseaseList = (person: Person): string[] => {
  const seen = new Set<string>();
  return getKnownDiseaseEntries(person)
    .map(entry => entry.name.trim())
    .filter(Boolean)
    .filter(name => {
      const key = normalizeText(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const getHereditaryDiseaseList = (person: Person): string[] => {
  const seen = new Set<string>();
  return getKnownDiseaseEntries(person)
    .filter(entry => entry.hereditary)
    .map(entry => entry.name.trim())
    .filter(Boolean)
    .filter(name => {
      const key = normalizeText(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const getInheritedHereditaryDiseaseRisks = (tree: FamilyTree, personId: string): string[] => {
  const target = tree.persons[personId];
  if (!target) return [];

  const queue: string[] = [personId];
  const visitedAncestors = new Set<string>();
  const riskByKey = new Map<string, string>();

  while (queue.length > 0) {
    const currentPersonId = queue.shift()!;
    const currentPerson = tree.persons[currentPersonId];
    if (!currentPerson) continue;

    const parentUnionIds = new Set<string>();
    if (currentPerson.parentUnionId && tree.unions[currentPerson.parentUnionId]) {
      parentUnionIds.add(currentPerson.parentUnionId);
    }
    if (parentUnionIds.size === 0) {
      Object.values(tree.unions).forEach(union => {
        if (union.childIds.includes(currentPersonId)) {
          parentUnionIds.add(union.id);
        }
      });
    }

    parentUnionIds.forEach(parentUnionId => {
      const parentUnion = tree.unions[parentUnionId];
      if (!parentUnion) return;

      parentUnion.partnerIds.forEach(parentId => {
        if (!tree.persons[parentId] || visitedAncestors.has(parentId)) return;

        visitedAncestors.add(parentId);
        queue.push(parentId);

        getHereditaryDiseaseList(tree.persons[parentId]).forEach(name => {
          const key = normalizeText(name);
          if (!riskByKey.has(key)) {
            riskByKey.set(key, name);
          }
        });
      });
    });
  }

  return Array.from(riskByKey.values()).sort((a, b) => a.localeCompare(b));
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
