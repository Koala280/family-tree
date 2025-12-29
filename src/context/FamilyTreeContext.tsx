import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Person, FamilyTree, FamilyTreesData, FamilyTreeMetadata, Union, UnionStatus } from '../types';

interface FamilyTreeContextType {
  // Current tree operations
  familyTree: FamilyTree | null;
  addPerson: (person: Partial<Person>) => string;
  updatePerson: (id: string, updates: Partial<Person>) => void;
  deletePerson: (id: string) => void;
  addParent: (childId: string, parentId: string) => void;
  addSpouse: (person1Id: string, person2Id: string) => string | null;
  addChild: (parentId: string, childId: string, unionId?: string) => void;
  linkChildToUnion: (childId: string, unionId: string) => void;
  removeRelationship: (person1Id: string, person2Id: string, type: 'parent' | 'spouse' | 'child') => void;
  toggleMarriageStatus: (unionId: string) => void;

  // Tree management operations
  allTrees: Record<string, FamilyTreeMetadata>;
  activeTreeId: string | null;
  currentView: 'manager' | 'tree';
  setCurrentView: (view: 'manager' | 'tree') => void;
  createTree: (name: string) => void;
  selectTree: (treeId: string) => void;
  renameTree: (treeId: string, newName: string) => void;
  deleteTree: (treeId: string) => void;
  exportTree: (treeId: string) => void;
  importTree: () => void;
}

const FamilyTreeContext = createContext<FamilyTreeContextType | undefined>(undefined);

const STORAGE_KEY = 'family-trees-data';

const createEmptyPerson = (): Person => ({
  id: crypto.randomUUID(),
  firstName: '',
  lastName: '',
  gender: null,
  birthDate: {},
  deathDate: {},
  causeOfDeath: '',
  knownDiseases: '',
  notes: '',
  photo: undefined,
  parentUnionId: null,
  unionIds: [],
});

const createEmptyTree = (): FamilyTree => {
  const initialPerson = createEmptyPerson();
  return {
    persons: { [initialPerson.id]: initialPerson },
    unions: {},
    rootPersonId: initialPerson.id,
  };
};

const createUnion = (partnerIds: string[], status: UnionStatus = 'active'): Union => ({
  id: crypto.randomUUID(),
  partnerIds: Array.from(new Set(partnerIds)),
  status,
  childIds: [],
});

const normalizeTree = (tree: any): FamilyTree => {
  const persons: Record<string, Person> = {};
  const unions: Record<string, Union> = tree.unions && typeof tree.unions === 'object' ? tree.unions : {};

  Object.values(tree.persons || {}).forEach((person: any) => {
    persons[person.id] = {
      id: person.id,
      firstName: person.firstName ?? '',
      lastName: person.lastName ?? '',
      gender: person.gender ?? null,
      birthDate: person.birthDate ?? {},
      deathDate: person.deathDate ?? {},
      causeOfDeath: person.causeOfDeath ?? '',
      knownDiseases: person.knownDiseases ?? '',
      notes: person.notes ?? '',
      photo: person.photo,
      parentUnionId: person.parentUnionId ?? null,
      unionIds: [],
      position: person.position, // Preserve saved position
    };
  });

  Object.values(unions).forEach((union: Union) => {
    union.partnerIds.forEach(partnerId => {
      const partner = persons[partnerId];
      if (partner && !partner.unionIds.includes(union.id)) {
        partner.unionIds = [...partner.unionIds, union.id];
      }
    });
  });

  const rootPersonId = tree.rootPersonId && persons[tree.rootPersonId]
    ? tree.rootPersonId
    : (Object.keys(persons)[0] || null);

  return {
    persons,
    unions,
    rootPersonId,
  };
};

export const FamilyTreeProvider = ({ children }: { children: ReactNode }) => {
  const [treesData, setTreesData] = useState<FamilyTreesData>(() => {
    // Try to load from new storage format
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

      if (parsed.trees) {
        return parsed;
      }
    }

    // No existing data - create initial empty state
    return {
      trees: {},
      metadata: {},
      activeTreeId: null,
    };
  });

  const [currentView, setCurrentView] = useState<'manager' | 'tree'>(() => {
    return treesData.activeTreeId ? 'tree' : 'manager';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(treesData));
  }, [treesData]);

  const currentTree = treesData.activeTreeId ? treesData.trees[treesData.activeTreeId] : null;

  const updateCurrentTree = (updater: (tree: FamilyTree) => FamilyTree) => {
    if (!treesData.activeTreeId) return;

    setTreesData(prev => ({
      ...prev,
      trees: {
        ...prev.trees,
        [prev.activeTreeId!]: updater(prev.trees[prev.activeTreeId!]),
      },
      metadata: {
        ...prev.metadata,
        [prev.activeTreeId!]: {
          ...prev.metadata[prev.activeTreeId!],
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  };

  const addPerson = (personData: Partial<Person>): string => {
    const newPerson: Person = {
      ...createEmptyPerson(),
      ...personData,
    };

    updateCurrentTree(tree => ({
      ...tree,
      persons: {
        ...tree.persons,
        [newPerson.id]: newPerson,
      },
    }));

    return newPerson.id;
  };

  const updatePerson = (id: string, updates: Partial<Person>) => {
    updateCurrentTree(tree => ({
      ...tree,
      persons: {
        ...tree.persons,
        [id]: {
          ...tree.persons[id],
          ...updates,
        },
      },
    }));
  };

  const deletePerson = (id: string) => {
    updateCurrentTree(tree => {
      const personToDelete = tree.persons[id];
      if (!personToDelete) return tree;

      const newPersons: Record<string, Person> = { ...tree.persons };
      const newUnions: Record<string, Union> = { ...tree.unions };

      if (personToDelete.parentUnionId) {
        const parentUnion = newUnions[personToDelete.parentUnionId];
        if (parentUnion) {
          newUnions[parentUnion.id] = {
            ...parentUnion,
            childIds: parentUnion.childIds.filter(childId => childId !== id),
          };
        }
      }

      personToDelete.unionIds.forEach(unionId => {
        const union = newUnions[unionId];
        if (!union) return;

        const remainingPartners = union.partnerIds.filter(pid => pid !== id);
        if (remainingPartners.length === 0) {
          union.childIds.forEach(childId => {
            if (newPersons[childId]) {
              newPersons[childId] = { ...newPersons[childId], parentUnionId: null };
            }
          });
          delete newUnions[unionId];
        } else {
          newUnions[unionId] = { ...union, partnerIds: remainingPartners };
        }
      });

      delete newPersons[id];

      const rebuiltPersons: Record<string, Person> = {};
      Object.values(newPersons).forEach(person => {
        rebuiltPersons[person.id] = { ...person, unionIds: [] };
      });
      Object.values(newUnions).forEach(union => {
        union.partnerIds.forEach(partnerId => {
          const partner = rebuiltPersons[partnerId];
          if (!partner) return;
          if (!partner.unionIds.includes(union.id)) {
            partner.unionIds = [...partner.unionIds, union.id];
          }
        });
      });

      return {
        ...tree,
        persons: rebuiltPersons,
        unions: newUnions,
        rootPersonId: tree.rootPersonId === id ? Object.keys(rebuiltPersons)[0] || null : tree.rootPersonId,
      };
    });
  };

  const addParent = (childId: string, parentId: string) => {
    updateCurrentTree(tree => {
      const child = tree.persons[childId];
      const parent = tree.persons[parentId];

      if (!child || !parent) return tree;

      const newPersons: Record<string, Person> = { ...tree.persons };
      const newUnions: Record<string, Union> = { ...tree.unions };

      let unionId = child.parentUnionId;
      let union = unionId ? newUnions[unionId] : undefined;

      if (!union) {
        union = createUnion([parentId], 'active');
        newUnions[union.id] = union;
        unionId = union.id;
      }

      if (!union.partnerIds.includes(parentId)) {
        if (union.partnerIds.length >= 2) return tree;
        union = { ...union, partnerIds: [...union.partnerIds, parentId] };
      }

      if (!union.childIds.includes(childId)) {
        union = { ...union, childIds: [...union.childIds, childId] };
      }

      newUnions[union.id] = union;
      newPersons[childId] = { ...child, parentUnionId: union.id };

      union.partnerIds.forEach(partnerId => {
        const partner = newPersons[partnerId];
        if (partner && !partner.unionIds.includes(union.id)) {
          newPersons[partnerId] = { ...partner, unionIds: [...partner.unionIds, union.id] };
        }
      });

      return {
        ...tree,
        persons: newPersons,
        unions: newUnions,
      };
    });
  };

  const addSpouse = (person1Id: string, person2Id: string) => {
    let createdUnionId: string | null = null;

    updateCurrentTree(tree => {
      const person1 = tree.persons[person1Id];
      const person2 = tree.persons[person2Id];

      if (!person1 || !person2) return tree;

      const newPersons: Record<string, Person> = { ...tree.persons };
      const newUnions: Record<string, Union> = { ...tree.unions };

      const existingUnion = Object.values(newUnions).find(union =>
        union.partnerIds.includes(person1Id) && union.partnerIds.includes(person2Id)
      );

      if (existingUnion) {
        newUnions[existingUnion.id] = {
          ...existingUnion,
          status: existingUnion.status === 'divorced' ? 'active' : existingUnion.status,
        };
        newPersons[person1Id] = {
          ...person1,
          unionIds: person1.unionIds.includes(existingUnion.id)
            ? person1.unionIds
            : [...person1.unionIds, existingUnion.id],
        };
        newPersons[person2Id] = {
          ...person2,
          unionIds: person2.unionIds.includes(existingUnion.id)
            ? person2.unionIds
            : [...person2.unionIds, existingUnion.id],
        };
        createdUnionId = existingUnion.id;
        return {
          ...tree,
          persons: newPersons,
          unions: newUnions,
        };
      }

      const union = createUnion([person1Id, person2Id], 'active');
      newUnions[union.id] = union;
      newPersons[person1Id] = {
        ...person1,
        unionIds: [...person1.unionIds, union.id],
      };
      newPersons[person2Id] = {
        ...person2,
        unionIds: [...person2.unionIds, union.id],
      };
      createdUnionId = union.id;

      return {
        ...tree,
        persons: newPersons,
        unions: newUnions,
      };
    });

    return createdUnionId;
  };

  const addChild = (parentId: string, childId: string, unionId?: string) => {
    updateCurrentTree(tree => {
      const parent = tree.persons[parentId];
      const child = tree.persons[childId];

      if (!parent || !child) return tree;

      const newPersons: Record<string, Person> = { ...tree.persons };
      const newUnions: Record<string, Union> = { ...tree.unions };

      if (child.parentUnionId && newUnions[child.parentUnionId]) {
        let union = newUnions[child.parentUnionId];
        if (!union.partnerIds.includes(parentId)) {
          if (union.partnerIds.length >= 2) return tree;
          union = { ...union, partnerIds: [...union.partnerIds, parentId] };
        }
        if (!union.childIds.includes(childId)) {
          union = { ...union, childIds: [...union.childIds, childId] };
        }
        newUnions[union.id] = union;
        newPersons[childId] = { ...child, parentUnionId: union.id };
        union.partnerIds.forEach(partnerId => {
          const partner = newPersons[partnerId];
          if (partner && !partner.unionIds.includes(union.id)) {
            newPersons[partnerId] = { ...partner, unionIds: [...partner.unionIds, union.id] };
          }
        });
        return {
          ...tree,
          persons: newPersons,
          unions: newUnions,
        };
      }

      let targetUnion: Union | undefined;
      if (unionId) {
        targetUnion = newUnions[unionId];
        if (!targetUnion || !targetUnion.partnerIds.includes(parentId)) return tree;
      } else {
        const parentUnions = parent.unionIds
          .map(id => newUnions[id])
          .filter((union): union is Union => Boolean(union && union.partnerIds.includes(parentId)));

        if (parentUnions.length === 1) {
          targetUnion = parentUnions[0];
        } else if (parentUnions.length === 0) {
          targetUnion = createUnion([parentId], 'active');
          newUnions[targetUnion.id] = targetUnion;
        } else {
          return tree;
        }
      }

      const updatedChildIds = targetUnion.childIds.includes(childId)
        ? targetUnion.childIds
        : [...targetUnion.childIds, childId];
      const updatedUnion = { ...targetUnion, childIds: updatedChildIds };
      newUnions[updatedUnion.id] = updatedUnion;

      newPersons[childId] = { ...child, parentUnionId: updatedUnion.id };
      updatedUnion.partnerIds.forEach(partnerId => {
        const partner = newPersons[partnerId];
        if (partner && !partner.unionIds.includes(updatedUnion.id)) {
          newPersons[partnerId] = { ...partner, unionIds: [...partner.unionIds, updatedUnion.id] };
        }
      });

      return {
        ...tree,
        persons: newPersons,
        unions: newUnions,
      };
    });
  };

  const linkChildToUnion = (childId: string, unionId: string) => {
    updateCurrentTree(tree => {
      const child = tree.persons[childId];
      const union = tree.unions[unionId];

      if (!child || !union) return tree;

      const newPersons: Record<string, Person> = { ...tree.persons };
      const newUnions: Record<string, Union> = { ...tree.unions };

      if (child.parentUnionId && newUnions[child.parentUnionId]) {
        const previousUnion = newUnions[child.parentUnionId];
        newUnions[previousUnion.id] = {
          ...previousUnion,
          childIds: previousUnion.childIds.filter(id => id !== childId),
        };
      }

      const updatedUnion = newUnions[unionId];
      newUnions[unionId] = updatedUnion.childIds.includes(childId)
        ? updatedUnion
        : { ...updatedUnion, childIds: [...updatedUnion.childIds, childId] };

      newPersons[childId] = { ...child, parentUnionId: unionId };

      return {
        ...tree,
        persons: newPersons,
        unions: newUnions,
      };
    });
  };

  const toggleMarriageStatus = (unionId: string) => {
    updateCurrentTree(tree => {
      const union = tree.unions[unionId];
      if (!union) return tree;

      return {
        ...tree,
        unions: {
          ...tree.unions,
          [unionId]: {
            ...union,
            status: union.status === 'active' ? 'divorced' : 'active',
          },
        },
      };
    });
  };

  const removeRelationship = (person1Id: string, person2Id: string, type: 'parent' | 'spouse' | 'child') => {
    updateCurrentTree(tree => {
      const newPersons: Record<string, Person> = { ...tree.persons };
      const newUnions: Record<string, Union> = { ...tree.unions };

      if (type === 'parent') {
        const child = newPersons[person2Id];
        if (!child || !child.parentUnionId) return tree;
        const union = newUnions[child.parentUnionId];
        if (!union || !union.partnerIds.includes(person1Id)) return tree;

        const remainingPartners = union.partnerIds.filter(pid => pid !== person1Id);
        if (remainingPartners.length === 0) {
          union.childIds.forEach(childId => {
            if (newPersons[childId]) {
              newPersons[childId] = { ...newPersons[childId], parentUnionId: null };
            }
          });
          delete newUnions[union.id];
        } else {
          newUnions[union.id] = { ...union, partnerIds: remainingPartners };
        }
      } else if (type === 'spouse') {
        const union = Object.values(newUnions).find(u =>
          u.partnerIds.includes(person1Id) && u.partnerIds.includes(person2Id)
        );
        if (!union) return tree;

        if (union.childIds.length > 0) {
          newUnions[union.id] = { ...union, status: 'divorced' };
        } else {
          delete newUnions[union.id];
        }
      } else if (type === 'child') {
        const child = newPersons[person2Id];
        if (!child || !child.parentUnionId) return tree;
        const union = newUnions[child.parentUnionId];
        if (!union || !union.partnerIds.includes(person1Id)) return tree;

        newUnions[union.id] = {
          ...union,
          childIds: union.childIds.filter(id => id !== person2Id),
        };
        newPersons[person2Id] = { ...child, parentUnionId: null };
      }

      const rebuiltPersons: Record<string, Person> = {};
      Object.values(newPersons).forEach(person => {
        rebuiltPersons[person.id] = { ...person, unionIds: [] };
      });
      Object.values(newUnions).forEach(union => {
        union.partnerIds.forEach(partnerId => {
          const partner = rebuiltPersons[partnerId];
          if (!partner) return;
          if (!partner.unionIds.includes(union.id)) {
            partner.unionIds = [...partner.unionIds, union.id];
          }
        });
      });

      return {
        ...tree,
        persons: rebuiltPersons,
        unions: newUnions,
      };
    });
  };

  // Tree management functions
  const createTree = (name: string) => {
    const treeId = crypto.randomUUID();
    const now = new Date().toISOString();

    setTreesData(prev => ({
      trees: {
        ...prev.trees,
        [treeId]: createEmptyTree(),
      },
      metadata: {
        ...prev.metadata,
        [treeId]: {
          id: treeId,
          name,
          createdAt: now,
          updatedAt: now,
        },
      },
      activeTreeId: treeId,
    }));

    setCurrentView('tree');
  };

  const selectTree = (treeId: string) => {
    setTreesData(prev => ({
      ...prev,
      activeTreeId: treeId,
    }));
    setCurrentView('tree');
  };

  const renameTree = (treeId: string, newName: string) => {
    setTreesData(prev => ({
      ...prev,
      metadata: {
        ...prev.metadata,
        [treeId]: {
          ...prev.metadata[treeId],
          name: newName,
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  };

  const deleteTree = (treeId: string) => {
    setTreesData(prev => {
      const newTrees = { ...prev.trees };
      const newMetadata = { ...prev.metadata };

      delete newTrees[treeId];
      delete newMetadata[treeId];

      const newActiveTreeId = prev.activeTreeId === treeId
        ? (Object.keys(newTrees)[0] || null)
        : prev.activeTreeId;

      return {
        trees: newTrees,
        metadata: newMetadata,
        activeTreeId: newActiveTreeId,
      };
    });

    if (treesData.activeTreeId === treeId) {
      setCurrentView('manager');
    }
  };

  const exportTree = (treeId: string) => {
    const tree = treesData.trees[treeId];
    const metadata = treesData.metadata[treeId];

    if (!tree || !metadata) return;

    const exportData = {
      tree,
      metadata,
      exportedAt: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${metadata.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importTree = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event: any) => {
          try {
            const importedData = JSON.parse(event.target.result);

            // Import format with metadata
            if (importedData.tree && importedData.metadata) {
              const newTreeId = crypto.randomUUID();
              const now = new Date().toISOString();
              const normalizedTree = normalizeTree(importedData.tree);

              setTreesData(prev => ({
                trees: {
                  ...prev.trees,
                  [newTreeId]: normalizedTree,
                },
                metadata: {
                  ...prev.metadata,
                  [newTreeId]: {
                    ...importedData.metadata,
                    id: newTreeId,
                    createdAt: now,
                    updatedAt: now,
                  },
                },
                activeTreeId: newTreeId,
              }));

              setCurrentView('tree');
            }
          } catch (error) {
            alert('Fehler beim Importieren der Datei. Bitte überprüfen Sie das Dateiformat.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  return (
    <FamilyTreeContext.Provider
      value={{
        familyTree: currentTree,
        addPerson,
        updatePerson,
        deletePerson,
        addParent,
        addSpouse,
        addChild,
        linkChildToUnion,
        removeRelationship,
        toggleMarriageStatus,
        allTrees: treesData.metadata,
        activeTreeId: treesData.activeTreeId,
        currentView,
        setCurrentView,
        createTree,
        selectTree,
        renameTree,
        deleteTree,
        exportTree,
        importTree,
      }}
    >
      {children}
    </FamilyTreeContext.Provider>
  );
};

export const useFamilyTree = () => {
  const context = useContext(FamilyTreeContext);
  if (!context) {
    throw new Error('useFamilyTree must be used within FamilyTreeProvider');
  }
  return context;
};
