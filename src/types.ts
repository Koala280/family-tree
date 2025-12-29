export type Gender = 'male' | 'female' | null;

export interface DateInfo {
  day?: string;
  month?: string;
  year?: string;
}

export type UnionStatus = 'active' | 'divorced';

export interface Union {
  id: string;
  partnerIds: string[];
  status: UnionStatus; // active = verheiratet, divorced = geschieden
  childIds: string[];
}

export interface PersonPosition {
  x: number;
  generation: number;
}

export interface Person {
  id: string;
  firstName?: string;
  lastName?: string;
  gender: Gender;
  birthDate: DateInfo;
  deathDate: DateInfo;
  causeOfDeath?: string;
  knownDiseases?: string;
  notes?: string;
  photo?: string;
  parentUnionId: string | null;
  unionIds: string[];
  position?: PersonPosition;
}

export interface FamilyTree {
  persons: Record<string, Person>;
  unions: Record<string, Union>;
  rootPersonId: string | null;
}

export interface FamilyTreeMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyTreesData {
  trees: Record<string, FamilyTree>;
  metadata: Record<string, FamilyTreeMetadata>;
  activeTreeId: string | null;
}
