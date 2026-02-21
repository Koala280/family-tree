import { Person, DateInfo, FamilyTree, KnownDiseaseEntry } from '../types';

export const BLOOD_GROUP_OPTIONS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as const;
export type BloodGroupValue = (typeof BLOOD_GROUP_OPTIONS)[number];

const BLOOD_GROUP_SET = new Set<string>(BLOOD_GROUP_OPTIONS);

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

export const sanitizeBloodGroupInput = (value: string) => {
  const compact = value.toUpperCase().replace(/\s+/g, '');
  const withO = compact.replace(/^0/, 'O');
  return withO.replace(/[^ABO+-]/g, '');
};

export const normalizeBloodGroup = (value: unknown): BloodGroupValue | '' => {
  if (typeof value !== 'string') return '';
  const sanitized = sanitizeBloodGroupInput(value);
  if (BLOOD_GROUP_SET.has(sanitized)) {
    return sanitized as BloodGroupValue;
  }
  return '';
};

export const getBloodGroup = (person: Person): BloodGroupValue | '' => {
  return normalizeBloodGroup(person.bloodGroup);
};

type AboPhenotype = 'O' | 'A' | 'B' | 'AB';
type RhPhenotype = '+' | '-';
type AboAllele = 'O' | 'A' | 'B';
type RhAllele = '+' | '-';

const ABO_GENOTYPES: Record<AboPhenotype, AboAllele[][]> = {
  O: [['O', 'O']],
  A: [['A', 'A'], ['A', 'O']],
  B: [['B', 'B'], ['B', 'O']],
  AB: [['A', 'B']],
};

const RH_GENOTYPES: Record<RhPhenotype, RhAllele[][]> = {
  '+': [['+', '+'], ['+', '-']],
  '-': [['-', '-']],
};

const parseBloodGroup = (value: BloodGroupValue): { abo: AboPhenotype; rh: RhPhenotype } => {
  const rh = value.endsWith('-') ? '-' : '+';
  const abo = value.slice(0, -1) as AboPhenotype;
  return { abo, rh };
};

const phenotypeFromAboAlleles = (a: AboAllele, b: AboAllele): AboPhenotype => {
  if ((a === 'A' && b === 'B') || (a === 'B' && b === 'A')) return 'AB';
  if (a === 'A' || b === 'A') return 'A';
  if (a === 'B' || b === 'B') return 'B';
  return 'O';
};

const phenotypeFromRhAlleles = (a: RhAllele, b: RhAllele): RhPhenotype => {
  return a === '+' || b === '+' ? '+' : '-';
};

export const getPossibleChildBloodGroups = (
  parentA: BloodGroupValue,
  parentB: BloodGroupValue
): BloodGroupValue[] => {
  const pA = parseBloodGroup(parentA);
  const pB = parseBloodGroup(parentB);

  const possibleAbo = new Set<AboPhenotype>();
  const possibleRh = new Set<RhPhenotype>();

  ABO_GENOTYPES[pA.abo].forEach((genesA) => {
    ABO_GENOTYPES[pB.abo].forEach((genesB) => {
      genesA.forEach((alleleA) => {
        genesB.forEach((alleleB) => {
          possibleAbo.add(phenotypeFromAboAlleles(alleleA, alleleB));
        });
      });
    });
  });

  RH_GENOTYPES[pA.rh].forEach((genesA) => {
    RH_GENOTYPES[pB.rh].forEach((genesB) => {
      genesA.forEach((alleleA) => {
        genesB.forEach((alleleB) => {
          possibleRh.add(phenotypeFromRhAlleles(alleleA, alleleB));
        });
      });
    });
  });

  const result = new Set<BloodGroupValue>();
  possibleAbo.forEach((abo) => {
    possibleRh.forEach((rh) => {
      const combined = `${abo}${rh}`;
      if (BLOOD_GROUP_SET.has(combined)) {
        result.add(combined as BloodGroupValue);
      }
    });
  });

  return BLOOD_GROUP_OPTIONS.filter((entry) => result.has(entry));
};

const getParentUnionId = (tree: FamilyTree, person: Person): string | null => {
  if (person.parentUnionId && tree.unions[person.parentUnionId]) {
    return person.parentUnionId;
  }

  const fallback = Object.values(tree.unions).find((union) => union.childIds.includes(person.id));
  return fallback?.id ?? null;
};

export const getParentBloodGroupInfo = (tree: FamilyTree, personId: string) => {
  const person = tree.persons[personId];
  if (!person) {
    return {
      parentGroups: [] as BloodGroupValue[],
      suggestions: [] as BloodGroupValue[],
    };
  }

  const parentUnionId = getParentUnionId(tree, person);
  if (!parentUnionId) {
    return {
      parentGroups: [] as BloodGroupValue[],
      suggestions: [] as BloodGroupValue[],
    };
  }

  const union = tree.unions[parentUnionId];
  if (!union) {
    return {
      parentGroups: [] as BloodGroupValue[],
      suggestions: [] as BloodGroupValue[],
    };
  }

  const parentGroups = union.partnerIds
    .map((parentId) => tree.persons[parentId])
    .filter((parent): parent is Person => Boolean(parent))
    .map(getBloodGroup)
    .filter((group): group is BloodGroupValue => Boolean(group));

  if (parentGroups.length < 2) {
    return {
      parentGroups,
      suggestions: [] as BloodGroupValue[],
    };
  }

  const [parentA, parentB] = parentGroups;
  return {
    parentGroups: [parentA, parentB],
    suggestions: getPossibleChildBloodGroups(parentA, parentB),
  };
};

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
