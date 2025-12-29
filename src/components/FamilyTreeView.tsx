import { useState, useRef, useEffect, useMemo, useCallback, type ReactElement } from 'react';
import { Person, Union } from '../types';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { CircularMenu } from './CircularMenu';
import { PersonEditModal } from './PersonEditModal';
import { LinkMenu } from './LinkMenu';

// Layout configuration
const PERSON_WIDTH = 100;
const PERSON_HEIGHT = 140;
const COUPLE_GAP = 80; // Gap between partners (for marriage symbol)
const SIBLING_GAP = 40;
const CHILDLESS_SPOUSE_GAP = COUPLE_GAP + SIBLING_GAP;
const GENERATION_GAP = 190;
const SYMBOL_SIZE = 36;
const CONNECTOR_CLEARANCE = 10;
const CONNECTOR_STEP = 20;
const SPOUSE_LINE_STEP = 16;
const SPOUSE_MAX_OFFSET = 28;
const SPOUSE_MIN_OFFSET = 12;
const SPOUSE_TEXT_CLEARANCE = 30;
const AVATAR_SIZE = 80;
const AVATAR_BORDER = 3;
const AVATAR_RADIUS = AVATAR_SIZE / 2;
const AVATAR_VISUAL_CENTER = (AVATAR_SIZE + AVATAR_BORDER * 2) / 2;
const SYMBOL_RADIUS = SYMBOL_SIZE / 2;
const SYMBOL_AVATAR_GAP = 6;
const FOCUS_GENERATION = 2;
const AUTO_MINIMIZE_DEPTH = 3;
const COLLAPSED_BRANCH_LENGTH = 14;
const COLLAPSED_BRANCH_RADIUS = 6;
const BOUNDS_MARGIN = Math.max(40, COLLAPSED_BRANCH_LENGTH + COLLAPSED_BRANCH_RADIUS + 8);
const DRAG_THRESHOLD = 6;

interface PositionedElement {
  type: 'person' | 'union-symbol';
  id: string;
  x: number;
  y: number;
  generation: number;
  unionId?: string;
}

type AncestorSide = 'maternal' | 'paternal';

export const FamilyTreeView = () => {
  const { familyTree, addPerson, addParent, addSpouse, addChild, deletePerson, toggleMarriageStatus, setCurrentView, allTrees, activeTreeId, updatePerson } = useFamilyTree();
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [linkMenuState, setLinkMenuState] = useState<{ personId: string; type: 'link' | 'unlink' | 'add-child' } | null>(null);
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(new Set());
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null);
  const [ancestorSideOverrides, _setAncestorSideOverrides] = useState<Map<number, AncestorSide>>(new Map());
  void _setAncestorSideOverrides; // Reserved for future use
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const personRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const symbolRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const longPressTimerRef = useRef<number | null>(null);
  const suppressAutoFitRef = useRef(false);
  const [dragState, setDragState] = useState<{ id: string | null; dx: number; dy: number; isDragging: boolean }>({
    id: null,
    dx: 0,
    dy: 0,
    isDragging: false
  });
  const dragStateRef = useRef<{ id: string | null; pointerId: number | null; startX: number; startY: number; isDragging: boolean }>({
    id: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    isDragging: false
  });

  // Initialize focused person
  useEffect(() => {
    if (!focusedPersonId && familyTree) {
      const persons = Object.values(familyTree.persons);
      if (persons.length > 0) {
        // Find a person with unions (married) or just pick the first one
        const personWithUnion = persons.find(p => p.unionIds.length > 0);
        setFocusedPersonId(personWithUnion?.id || persons[0].id);
        // Initially expand the focused person
        if (personWithUnion) {
          setExpandedPersons(new Set([personWithUnion.id]));
        } else if (persons[0]) {
          setExpandedPersons(new Set([persons[0].id]));
        }
      }
    }
  }, [familyTree, focusedPersonId]);

  if (!familyTree) {
    return (
      <div className="family-tree-view">
        <div className="tree-empty-state">
          <h2>Kein Stammbaum ausgewählt</h2>
          <p>Bitte wählen Sie einen Stammbaum aus der Übersicht.</p>
          <button onClick={() => setCurrentView('manager')} className="btn-primary">
            Zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handlePersonPointerDown = (personId: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    clearLongPressTimer();

    dragStateRef.current = {
      id: personId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false
    };
    setDragState({ id: personId, dx: 0, dy: 0, isDragging: false });

    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePersonPointerMove = (personId: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    const dragStateCurrent = dragStateRef.current;
    if (dragStateCurrent.id !== personId || dragStateCurrent.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragStateCurrent.startX;
    const dy = e.clientY - dragStateCurrent.startY;

    if (!dragStateCurrent.isDragging) {
      const distance = Math.hypot(dx, dy);
      if (distance < DRAG_THRESHOLD) return;

      dragStateCurrent.isDragging = true;
      clearLongPressTimer();
    }

    setDragState({ id: personId, dx, dy, isDragging: true });
  };

  const finalizePointerInteraction = (personId: string, e: React.PointerEvent<HTMLDivElement>, isCancel: boolean) => {
    const dragStateCurrent = dragStateRef.current;
    if (dragStateCurrent.id !== personId || dragStateCurrent.pointerId !== e.pointerId) return;

    clearLongPressTimer();
    const wasDragging = dragStateCurrent.isDragging;

    dragStateRef.current = {
      id: null,
      pointerId: null,
      startX: 0,
      startY: 0,
      isDragging: false
    };
    setDragState({ id: null, dx: 0, dy: 0, isDragging: false });

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture might already be released.
    }

    if (!wasDragging && !isCancel) {
      handlePersonSelection(personId);
    }
  };

  const handlePersonPointerUp = (personId: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    finalizePointerInteraction(personId, e, false);
  };

  const handlePersonPointerCancel = (personId: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    finalizePointerInteraction(personId, e, true);
  };

  const handlePersonClick = (e: React.MouseEvent) => {
    // Prevent default click behavior since we handle it in mouseup
    e.preventDefault();
  };

  const handleCloseMenu = () => {
    setSelectedPersonId(null);
  };

  const handleEdit = () => {
    if (selectedPersonId) {
      setEditingPersonId(selectedPersonId);
      setSelectedPersonId(null);
    }
  };

  const handleAddParent = () => {
    if (selectedPersonId) {
      const child = familyTree.persons[selectedPersonId];
      if (!child) return;

      // Calculate parent positions based on child's position
      const childX = child.position?.x ?? 0;
      const childGen = child.position?.generation ?? FOCUS_GENERATION;
      const parentGen = childGen - 1;

      // Mother on left, father on right, centered above child
      const motherX = childX - (PERSON_WIDTH + COUPLE_GAP) / 2;
      const fatherX = childX + (PERSON_WIDTH + COUPLE_GAP) / 2;

      const fatherId = addPerson({
        gender: 'male',
        position: { x: fatherX, generation: parentGen }
      });
      const motherId = addPerson({
        gender: 'female',
        position: { x: motherX, generation: parentGen }
      });
      addParent(selectedPersonId, fatherId);
      addParent(selectedPersonId, motherId);
      // Expand the selected person so parents become visible
      setExpandedPersons(prev => new Set([...prev, selectedPersonId, fatherId, motherId]));
      setSelectedPersonId(null);
    }
  };

  const handleAddSpouse = () => {
    if (selectedPersonId) {
      const person = familyTree.persons[selectedPersonId];
      if (!person) return;

      // Calculate spouse position based on person's position
      const personX = person.position?.x ?? 0;
      const personGen = person.position?.generation ?? FOCUS_GENERATION;

      // Women on left, men on right
      // If person is male, spouse (female) goes left
      // If person is female, spouse (male) goes right
      const spouseX = person.gender === 'male'
        ? personX - PERSON_WIDTH - COUPLE_GAP  // Female spouse on left
        : personX + PERSON_WIDTH + COUPLE_GAP; // Male spouse on right

      const spouseId = addPerson({
        position: { x: spouseX, generation: personGen }
      });
      addSpouse(selectedPersonId, spouseId);
      // Only expand the selected person - spouse trees should stay collapsed by default
      setExpandedPersons(prev => new Set([...prev, selectedPersonId]));
      setSelectedPersonId(null);
    }
  };

  const handleAddChild = () => {
    if (selectedPersonId) {
      const person = familyTree.persons[selectedPersonId];
      if (!person) return;

      const personUnions = person.unionIds
        .map(id => familyTree.unions[id])
        .filter((union): union is Union => Boolean(union));

      if (personUnions.length > 1) {
        setLinkMenuState({ personId: selectedPersonId, type: 'add-child' });
      } else {
        // Calculate child position based on parent's position
        const personX = person.position?.x ?? 0;
        const personGen = person.position?.generation ?? FOCUS_GENERATION;
        const childGen = personGen + 1;

        // If there's a union with a partner, center the child between parents
        let childX = personX;
        const union = personUnions[0];
        if (union) {
          const partnerId = union.partnerIds.find(id => id !== selectedPersonId);
          if (partnerId) {
            const partner = familyTree.persons[partnerId];
            if (partner?.position) {
              childX = (personX + partner.position.x) / 2;
            }
          }

          // If there are existing children, position new child to the right
          if (union.childIds.length > 0) {
            const existingChildrenX = union.childIds
              .map(id => familyTree.persons[id]?.position?.x)
              .filter((x): x is number => x !== undefined);
            if (existingChildrenX.length > 0) {
              const maxChildX = Math.max(...existingChildrenX);
              childX = maxChildX + PERSON_WIDTH + SIBLING_GAP;
            }
          }
        }

        const childId = addPerson({
          position: { x: childX, generation: childGen }
        });
        addChild(selectedPersonId, childId, union?.id);
        // Expand both the selected person and the new child
        setExpandedPersons(prev => new Set([...prev, selectedPersonId, childId]));
      }
      setSelectedPersonId(null);
    }
  };

  const handleLink = () => {
    if (selectedPersonId) {
      setLinkMenuState({ personId: selectedPersonId, type: 'link' });
      setSelectedPersonId(null);
    }
  };

  const handleUnlink = () => {
    if (selectedPersonId) {
      setLinkMenuState({ personId: selectedPersonId, type: 'unlink' });
      setSelectedPersonId(null);
    }
  };

  const handleDelete = () => {
    if (selectedPersonId && window.confirm('Möchten Sie diese Person wirklich löschen?')) {
      deletePerson(selectedPersonId);
      setSelectedPersonId(null);
    }
  };

  const handleFitToScreen = useCallback(() => {
    if (!containerRef.current || !treeRef.current) return;

    const container = containerRef.current;
    const tree = treeRef.current;

    const containerRect = container.getBoundingClientRect();
    const treeRect = tree.getBoundingClientRect();

    const scaleX = (containerRect.width - 80) / treeRect.width;
    const scaleY = (containerRect.height - 80) / treeRect.height;

    let newScale = Math.min(scaleX, scaleY);
    newScale = Math.max(0.2, Math.min(1.2, newScale));

    setScale(newScale);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(2, prev * 1.2));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale(prev => Math.max(0.2, prev / 1.2));
  }, []);

  // Reset all saved positions to recalculate layout
  const handleResetPositions = useCallback(() => {
    if (!familyTree) return;

    // Clear all saved positions
    Object.keys(familyTree.persons).forEach(personId => {
      updatePerson(personId, { position: undefined });
    });
  }, [familyTree, updatePerson]);

  // Panning handlers for the canvas
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only start panning if clicking directly on the canvas (not on a person card)
    if ((e.target as HTMLElement).closest('.tree-person-card, .union-symbol')) return;

    e.preventDefault();
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: panOffset.x,
      panY: panOffset.y
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [panOffset]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panStartRef.current) return;

    const dx = (e.clientX - panStartRef.current.x) / scale;
    const dy = (e.clientY - panStartRef.current.y) / scale;

    setPanOffset({
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy
    });
  }, [isPanning, scale]);

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning) return;

    setIsPanning(false);
    panStartRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Pointer capture might already be released
    }
  }, [isPanning]);

  useEffect(() => {
    if (suppressAutoFitRef.current) {
      suppressAutoFitRef.current = false;
      return;
    }
    const timer = setTimeout(handleFitToScreen, 300);
    return () => clearTimeout(timer);
  }, [handleFitToScreen, expandedPersons, focusedPersonId]);

  const registerPersonRef = (personId: string) => (element: HTMLDivElement | null) => {
    personRefs.current[personId] = element;
  };

  const registerSymbolRef = (unionId: string) => (element: HTMLDivElement | null) => {
    symbolRefs.current[unionId] = element;
  };

  const getAncestorSide = useCallback((depth: number) => {
    for (let currentDepth = depth; currentDepth >= 1; currentDepth -= 1) {
      const side = ancestorSideOverrides.get(currentDepth);
      if (side) return side;
    }
    return null;
  }, [ancestorSideOverrides]);

  // Build the visible tree structure based on expanded state
  const { visibleElements, collapsedDownUnions, collapsedUpPersons, collapsedSidePersons, enforcedPositions } = useMemo(() => {
    const elements: PositionedElement[] = [];
    const positionedPersons = new Map<string, { x: number; y: number; generation: number }>();
    const positionedUnions = new Map<string, { x: number; y: number; generation: number }>();
    const collapsedDownUnions = new Set<string>();
    const collapsedUpPersons = new Set<string>();
    const collapsedSidePersons = new Set<string>();
    const enforcedPositions = new Set<string>();

    if (!focusedPersonId || !familyTree.persons[focusedPersonId]) {
      return { visibleElements: elements, collapsedDownUnions, collapsedUpPersons, collapsedSidePersons, enforcedPositions };
    }

    // STEP 1: Collect connected persons with auto-minimized branches
    const personGenerations = new Map<string, number>();
    const processedPersons = new Map<string, { isDirectLine: boolean }>();

    const collectVisibleConnected = (startPersonId: string, startGen: number) => {
      // isDirectLine: true for focused person and their direct descendants
      // isAncestor: true for ancestors (parents, grandparents) - their children are siblings, not direct line
      // isSibling: true for siblings (children of ancestors who are not direct line) - they can show their spouses
      // isSpouseOfSibling: true for spouses of siblings - they should NOT show their own family tree
      const queue: { id: string; gen: number; isDirectLine: boolean; isAncestor: boolean; isSibling: boolean; isSpouseOfSibling: boolean }[] = [
        { id: startPersonId, gen: startGen, isDirectLine: true, isAncestor: false, isSibling: false, isSpouseOfSibling: false }
      ];

      while (queue.length > 0) {
        const { id, gen, isDirectLine, isAncestor, isSibling, isSpouseOfSibling } = queue.shift()!;

        const processedEntry = processedPersons.get(id);
        if (processedEntry && (!isDirectLine || processedEntry.isDirectLine)) {
          continue;
        }
        processedPersons.set(id, { isDirectLine: processedEntry?.isDirectLine || isDirectLine });

        const person = familyTree.persons[id];
        if (!person) continue;

        // Set generation (prefer existing if closer to center)
        if (!personGenerations.has(id)) {
          personGenerations.set(id, gen);
        }

        const isExpanded = expandedPersons.has(id);
        // Only expand branches for direct line persons (focused + descendants), ancestors, siblings, or explicitly expanded
        const canExpandBranches = isDirectLine || isAncestor || isSibling || isExpanded;

        // Show spouses for direct line persons, ancestors, and siblings
        // But NOT for spouses of siblings (their family tree stays hidden)
        const canShowSpouses = (isDirectLine || isAncestor || isSibling) && !isSpouseOfSibling;

        if (canExpandBranches) {
          person.unionIds.forEach(unionId => {
            const union = familyTree.unions[unionId];
            if (!union) return;

            // Add spouses if allowed
            if (canShowSpouses) {
              union.partnerIds.forEach(partnerId => {
                if (partnerId !== id && familyTree.persons[partnerId]) {
                  // Spouses of siblings are marked so they don't show their own family tree
                  const partnerIsSpouseOfSibling = isSibling;
                  queue.push({ id: partnerId, gen, isDirectLine: false, isAncestor: false, isSibling: false, isSpouseOfSibling: partnerIsSpouseOfSibling });
                }
              });
            }

            if (union.childIds.length === 0) return;

            const childGen = gen + 1;
            const childDepth = Math.abs(childGen - startGen);
            const allowChildren = childDepth <= AUTO_MINIMIZE_DEPTH || isExpanded;

            if (allowChildren) {
              // Children of ancestors are siblings - they are NOT direct line but can show their spouses
              // Children of direct line persons (focused person or their descendants) ARE direct line
              const childrenAreDirectLine = isDirectLine && !isAncestor;
              const childrenAreSiblings = isAncestor && !childrenAreDirectLine;
              union.childIds.forEach(childId => {
                if (familyTree.persons[childId]) {
                  // Check if this child is the focused person (direct line to them)
                  const isChildOnDirectLine = childrenAreDirectLine || childId === startPersonId;
                  queue.push({
                    id: childId,
                    gen: childGen,
                    isDirectLine: isChildOnDirectLine,
                    isAncestor: false,
                    isSibling: childrenAreSiblings && !isChildOnDirectLine,
                    isSpouseOfSibling: false
                  });
                }
              });
            } else {
              collapsedDownUnions.add(union.id);
            }
          });
        }

        // Add parents (previous generation)
        if (gen <= startGen && person.parentUnionId) {
          const parentUnion = familyTree.unions[person.parentUnionId];
          if (parentUnion) {
            const parentGen = gen - 1;
            const parentDepth = Math.abs(parentGen - startGen);
            const sidePreference = getAncestorSide(parentDepth);

            // Only show ancestors for direct line persons (focused person and their ancestors)
            // Siblings and spouses should NOT show their ancestors - when they are clicked to expand,
            // they become the new focused person which makes them isDirectLine=true
            const shouldShowParents = isDirectLine || id === startPersonId;
            const allowParents = shouldShowParents && (parentDepth <= AUTO_MINIMIZE_DEPTH || isExpanded || sidePreference !== null);

            if (allowParents) {
              const availableParents = parentUnion.partnerIds
                .filter(parentId => familyTree.persons[parentId]);

              let selectedParents = availableParents;

              if (sidePreference) {
                const preferredGender = sidePreference === 'maternal' ? 'female' : 'male';
                const fallbackGender = sidePreference === 'maternal' ? 'male' : 'female';
                const preferred = availableParents.find(parentId => familyTree.persons[parentId]?.gender === preferredGender);
                const fallback = availableParents.find(parentId => familyTree.persons[parentId]?.gender === fallbackGender);
                const chosen = preferred ?? fallback ?? availableParents[0];
                selectedParents = chosen ? [chosen] : [];

                if (availableParents.length > selectedParents.length) {
                  collapsedUpPersons.add(id);
                }
              }

              // Parents are ancestors - their children (siblings) won't be direct line
              selectedParents.forEach(parentId => {
                if (familyTree.persons[parentId]) {
                  queue.push({ id: parentId, gen: parentGen, isDirectLine: true, isAncestor: true, isSibling: false, isSpouseOfSibling: false });
                }
              });
            }
          }
        }
      }
    };

    collectVisibleConnected(focusedPersonId, FOCUS_GENERATION);

    // STEP 1.5: Compute collapsedUpPersons AFTER BFS completes
    // Now that we know all visible persons, check who has hidden parents
    personGenerations.forEach((_gen, personId) => {
      const person = familyTree.persons[personId];
      if (!person || !person.parentUnionId) return;

      const parentUnion = familyTree.unions[person.parentUnionId];
      if (!parentUnion) return;

      // Check if ANY parent is visible (if so, the parent line is at least partially shown)
      const anyParentVisible = parentUnion.partnerIds.some(parentId =>
        personGenerations.has(parentId)
      );

      // Only mark as collapsed if NO parents are visible at all
      if (!anyParentVisible) {
        collapsedUpPersons.add(personId);
      }
    });

    // STEP 1.6: Compute collapsedSidePersons - persons with hidden spouses
    personGenerations.forEach((_gen, personId) => {
      const person = familyTree.persons[personId];
      if (!person) return;

      // Check if this person has any spouses that are NOT visible
      for (const unionId of person.unionIds) {
        const union = familyTree.unions[unionId];
        if (!union) continue;

        for (const partnerId of union.partnerIds) {
          if (partnerId !== personId && !personGenerations.has(partnerId)) {
            // This partner is not visible - person has hidden spouse
            collapsedSidePersons.add(personId);
            return; // No need to check further
          }
        }
      }
    });

    // STEP 2: Group by generation
    const generationGroups = new Map<number, string[]>();
    personGenerations.forEach((gen, personId) => {
      const person = familyTree.persons[personId];
      const resolvedGen = person?.position?.generation ?? gen;
      if (!generationGroups.has(resolvedGen)) {
        generationGroups.set(resolvedGen, []);
      }
      generationGroups.get(resolvedGen)!.push(personId);
    });

    // STEP 3: Position each generation - children centered under their parents
    const sortedGens = Array.from(generationGroups.keys()).sort((a, b) => a - b);
    const CHILDREN_GAP = SIBLING_GAP * 0.8; // Slightly smaller gap between siblings

    sortedGens.forEach(generation => {
      const personsInGen = generationGroups.get(generation) || [];
      const personsInGenSet = new Set(personsInGen);
      const y = generation * GENERATION_GAP;
      const childClusters: Array<{
        unionId: string;
        parentCenterX: number;
        unionOrder: number;
        memberIds: Set<string>;
        minX: number;
        maxX: number;
      }> = [];
      const UNION_CLUSTER_GAP = Math.max(SIBLING_GAP * 2, COUPLE_GAP);

      // Separate persons into those with positioned parents and those without
      const childrenWithParents: Map<string, string[]> = new Map(); // unionId -> children
      const personsWithoutParents: string[] = [];

      personsInGen.forEach(personId => {
        const person = familyTree.persons[personId];
        if (!person) return;

        if (person.parentUnionId) {
          const parentUnion = familyTree.unions[person.parentUnionId];
          const hasVisibleParent = parentUnion?.partnerIds.some(parentId => personGenerations.has(parentId));

          if (parentUnion && hasVisibleParent) {
            const children = childrenWithParents.get(person.parentUnionId) || [];
            children.push(personId);
            childrenWithParents.set(person.parentUnionId, children);
            return;
          }
        }

        personsWithoutParents.push(personId);
      });

      // Position children centered under their parent union (include spouses as a family unit)
      childrenWithParents.forEach((children, parentUnionId) => {
        const parentUnion = familyTree.unions[parentUnionId];
        if (!parentUnion) return;

        const parentPositions = parentUnion.partnerIds
          .map(pid => {
            const parent = familyTree.persons[pid];
            if (!parent) return null;
            if (parent.position) {
              return {
                x: parent.position.x,
                y: parent.position.generation * GENERATION_GAP,
                generation: parent.position.generation
              };
            }
            return positionedPersons.get(pid) ?? null;
          })
          .filter(Boolean) as { x: number; y: number; generation: number }[];

        if (parentPositions.length === 0) {
          children.forEach(childId => {
            if (!personsWithoutParents.includes(childId)) {
              personsWithoutParents.push(childId);
            }
          });
          return;
        }

        let parentCenterX = parentPositions[0].x;
        if (parentPositions.length >= 2) {
          const minX = Math.min(...parentPositions.map(p => p.x));
          const maxX = Math.max(...parentPositions.map(p => p.x));
          parentCenterX = (minX + maxX) / 2;
        }

        const childrenSet = new Set(children);
        const orderedChildren = parentUnion.childIds.filter(childId => childrenSet.has(childId));
        const clusterMembers = new Set<string>();
        const savedOrder = orderedChildren
          .map(childId => {
            const childX = familyTree.persons[childId]?.position?.x;
            return typeof childX === 'number' ? { id: childId, x: childX } : null;
          })
          .filter((entry): entry is { id: string; x: number } => Boolean(entry));
        let forceOrder = false;
        if (savedOrder.length >= 2) {
          const sortedByX = [...savedOrder].sort((a, b) => a.x - b.x).map(entry => entry.id);
          const byChildOrder = savedOrder.map(entry => entry.id);
          forceOrder = sortedByX.some((id, index) => id !== byChildOrder[index]);
        }
        const assignedInGen = new Set<string>();

        type ChildUnit = { childId: string; members: string[]; gaps: number[]; partners: string[]; width: number; childOffset: number };
        const childUnits: ChildUnit[] = [];

        orderedChildren.forEach(childId => {
          if (assignedInGen.has(childId)) return;

          const child = familyTree.persons[childId];
          if (!child) return;

          assignedInGen.add(childId);

          const partnerMeta = new Map<string, { hasChildren: boolean; order: number; side: 'left' | 'right' }>();

          child.unionIds.forEach((unionId, unionIndex) => {
            const union = familyTree.unions[unionId];
            if (!union) return;

            union.partnerIds.forEach(partnerId => {
              if (partnerId === childId) return;
              if (!personsInGenSet.has(partnerId)) return;
              if (assignedInGen.has(partnerId)) return;

              const partner = familyTree.persons[partnerId];
              if (!partner) return;

              const partnerHasVisibleParents = Boolean(
                partner.parentUnionId &&
                familyTree.unions[partner.parentUnionId]?.partnerIds.some(parentId => personGenerations.has(parentId))
              );
              if (partnerHasVisibleParents) return;

              const hasChildren = union.childIds.length > 0;
              const side = partner.gender === 'female' ? 'left' : 'right';
              const existing = partnerMeta.get(partnerId);

              if (!existing || unionIndex < existing.order) {
                partnerMeta.set(partnerId, { hasChildren, order: unionIndex, side });
              } else if (hasChildren && !existing.hasChildren) {
                partnerMeta.set(partnerId, { ...existing, hasChildren });
              }
            });
          });

          const partners = Array.from(partnerMeta.keys());
          partners.forEach(partnerId => assignedInGen.add(partnerId));

          const leftPartners = partners
            .map(id => ({ id, ...partnerMeta.get(id)! }))
            .filter(partner => partner.side === 'left')
            .sort((a, b) => {
              if (a.hasChildren !== b.hasChildren) return Number(a.hasChildren) - Number(b.hasChildren);
              return a.order - b.order;
            });

          const rightPartners = partners
            .map(id => ({ id, ...partnerMeta.get(id)! }))
            .filter(partner => partner.side === 'right')
            .sort((a, b) => {
              if (a.hasChildren !== b.hasChildren) return Number(b.hasChildren) - Number(a.hasChildren);
              return a.order - b.order;
            });

          const members = [
            ...leftPartners.map(partner => partner.id),
            childId,
            ...rightPartners.map(partner => partner.id)
          ];

          const gaps: number[] = [];
          for (let i = 0; i < members.length - 1; i += 1) {
            const leftId = members[i];
            const rightId = members[i + 1];

            let gap = COUPLE_GAP;
            if (leftId === childId || rightId === childId) {
              const partnerId = leftId === childId ? rightId : leftId;
              const partnerInfo = partnerMeta.get(partnerId);
              gap = partnerInfo?.hasChildren ? COUPLE_GAP : CHILDLESS_SPOUSE_GAP;
            }
            gaps.push(gap);
          }

          const unitWidth = members.length * PERSON_WIDTH + gaps.reduce((sum, gap) => sum + gap, 0);
          const childIndex = members.indexOf(childId);
          let childOffset = PERSON_WIDTH / 2;
          for (let i = 0; i < childIndex; i += 1) {
            childOffset += PERSON_WIDTH;
            childOffset += gaps[i] ?? 0;
          }

          childUnits.push({
            childId,
            members,
            gaps,
            partners,
            width: unitWidth,
            childOffset
          });
        });

        if (childUnits.length === 0) return;

        const unitLayouts = childUnits.map(unit => ({
          unit,
          width: unit.width,
          childOffset: unit.childOffset,
          baselineLeft: 0,
          left: 0
        }));

        let totalWidth = childUnits.reduce((sum, unit) => sum + unit.width, 0);
        if (childUnits.length > 1) {
          totalWidth += (childUnits.length - 1) * CHILDREN_GAP;
        }

        let baselineLeft = parentCenterX - totalWidth / 2;
        unitLayouts.forEach(layout => {
          layout.baselineLeft = baselineLeft;
          baselineLeft += layout.width + CHILDREN_GAP;
        });

        let minLeft = Number.NEGATIVE_INFINITY;
        unitLayouts.forEach(layout => {
          const childPosition = familyTree.persons[layout.unit.childId]?.position;
          const canAnchor = Boolean(!forceOrder && childPosition && childPosition.generation === generation);
          const desiredLeft = canAnchor ? childPosition.x - layout.childOffset : layout.baselineLeft;
          const left = Math.max(desiredLeft, minLeft);
          layout.left = left;
          minLeft = left + layout.width + CHILDREN_GAP;
        });

        unitLayouts.forEach(layout => {
          const { unit } = layout;
          let cursor = layout.left;

          unit.members.forEach((memberId, memberIdx) => {
            const x = cursor + PERSON_WIDTH / 2;
            positionedPersons.set(memberId, { x, y, generation });
            elements.push({ type: 'person', id: memberId, x, y, generation });
            enforcedPositions.add(memberId);
            clusterMembers.add(memberId);

            cursor += PERSON_WIDTH;
            if (memberIdx < unit.gaps.length) {
              cursor += unit.gaps[memberIdx];
            }
          });

          const childPos = positionedPersons.get(unit.childId);
          if (childPos) {
            unit.partners.forEach(partnerId => {
              const partnerPos = positionedPersons.get(partnerId);
              if (!partnerPos) return;

              const child = familyTree.persons[unit.childId];
              const sharedUnion = child?.unionIds
                .map(uid => familyTree.unions[uid])
                .find(u => u && u.partnerIds.includes(partnerId));

              if (sharedUnion && !positionedUnions.has(sharedUnion.id)) {
                const symbolX = (childPos.x + partnerPos.x) / 2;
                const symbolY = y + AVATAR_VISUAL_CENTER - SYMBOL_SIZE / 2;

                positionedUnions.set(sharedUnion.id, { x: symbolX, y: symbolY, generation });
                elements.push({
                  type: 'union-symbol',
                  id: sharedUnion.id,
                  x: symbolX,
                  y: symbolY,
                  generation,
                  unionId: sharedUnion.id
                });
              }
            });
          }
        });

        if (clusterMembers.size > 0) {
          let minX = Infinity;
          let maxX = -Infinity;
          clusterMembers.forEach(memberId => {
            const pos = positionedPersons.get(memberId);
            if (!pos) return;
            minX = Math.min(minX, pos.x - PERSON_WIDTH / 2);
            maxX = Math.max(maxX, pos.x + PERSON_WIDTH / 2);
          });

          if (minX < Infinity && maxX > -Infinity) {
            const unionOrder = Math.min(
              ...parentUnion.partnerIds.map(parentId => {
                const order = familyTree.persons[parentId]?.unionIds.indexOf(parentUnionId);
                return typeof order === 'number' && order >= 0 ? order : Number.POSITIVE_INFINITY;
              })
            );

            childClusters.push({
              unionId: parentUnionId,
              parentCenterX,
              unionOrder,
              memberIds: new Set(clusterMembers),
              minX,
              maxX
            });
          }
        }
      });

      if (childClusters.length > 1) {
        childClusters.sort((a, b) => {
          const delta = a.parentCenterX - b.parentCenterX;
          if (Math.abs(delta) > 1) return delta;
          return a.unionOrder - b.unionOrder;
        });
        let nextMinX = Number.NEGATIVE_INFINITY;

        childClusters.forEach(cluster => {
          const desiredMinX = cluster.minX;
          const minX = Math.max(desiredMinX, nextMinX);
          const shift = minX - cluster.minX;
          if (Math.abs(shift) > 0.5) {
            cluster.memberIds.forEach(memberId => {
              const pos = positionedPersons.get(memberId);
              if (pos) pos.x += shift;
            });
            elements.forEach(el => {
              if (el.type === 'person' && cluster.memberIds.has(el.id)) {
                el.x += shift;
              }
            });
            cluster.minX += shift;
            cluster.maxX += shift;
          }
          nextMinX = cluster.maxX + UNION_CLUSTER_GAP;
        });
      }

      // Now handle persons without positioned parents (or who are the root generation)
      const remainingWithoutParents = personsWithoutParents.filter(personId => !positionedPersons.has(personId));
      if (remainingWithoutParents.length > 0) {
        // Group by union relationships
        const personIndexById = new Map<string, number>();
        remainingWithoutParents.forEach((personId, index) => {
          personIndexById.set(personId, index);
        });

        const positionedInGen = new Set<string>();
        const allGroups: string[][] = [];

        // Build visual groups - combine all partners of persons with multiple unions
        const multiUnionGroups = new Map<string, { centralPerson: string; allPartners: Set<string>; firstIndex: number }>();
        const processedInMultiUnion = new Set<string>();

        remainingWithoutParents.forEach(personId => {
          const person = familyTree.persons[personId];
          if (!person || person.unionIds.length < 2) return;

          const allPartners = new Set<string>();
          allPartners.add(personId);

          person.unionIds.forEach(unionId => {
            const union = familyTree.unions[unionId];
            if (!union) return;

            union.partnerIds.forEach(partnerId => {
              const partnerGen = familyTree.persons[partnerId]?.position?.generation ?? personGenerations.get(partnerId);
              if (partnerGen === generation && remainingWithoutParents.includes(partnerId)) {
                allPartners.add(partnerId);
              }
            });
          });

          if (allPartners.size > 1) {
            const firstIdx = Math.min(...Array.from(allPartners).map(pid => personIndexById.get(pid) ?? Infinity));
            multiUnionGroups.set(personId, {
              centralPerson: personId,
              allPartners,
              firstIndex: firstIdx
            });
            allPartners.forEach(p => processedInMultiUnion.add(p));
          }
        });

        // Build union groups for single unions
        const unionGroups = new Map<string, { unionId: string; members: Set<string>; firstIndex: number }>();

        remainingWithoutParents.forEach(personId => {
          if (processedInMultiUnion.has(personId)) return;

          const person = familyTree.persons[personId];
          if (!person) return;

          person.unionIds.forEach(unionId => {
            const union = familyTree.unions[unionId];
            if (!union) return;

            const partnersInGen = union.partnerIds.filter(partnerId =>
              !processedInMultiUnion.has(partnerId) &&
              remainingWithoutParents.includes(partnerId)
            );

            if (partnersInGen.length > 0) {
              const groupKey = `union-${unionId}`;
              if (!unionGroups.has(groupKey)) {
                const firstIdx = Math.min(...partnersInGen.map(pid => personIndexById.get(pid) ?? Infinity));
                unionGroups.set(groupKey, {
                  unionId,
                  members: new Set(partnersInGen),
                  firstIndex: firstIdx
                });
              }
            }
          });
        });

        // Process multi-union groups
        const sortedMultiUnionGroups = Array.from(multiUnionGroups.values())
          .sort((a, b) => a.firstIndex - b.firstIndex);

        sortedMultiUnionGroups.forEach(multiGroup => {
          const members = Array.from(multiGroup.allPartners)
            .filter(personId => !positionedInGen.has(personId));

          if (members.length === 0) return;

          // Sort: females on left, males on right
          // Among same gender: those with children closer to opposite gender
          members.sort((a, b) => {
            const personA = familyTree.persons[a];
            const personB = familyTree.persons[b];

            // Females always on left, males on right
            if (personA?.gender === 'female' && personB?.gender !== 'female') return -1;
            if (personB?.gender === 'female' && personA?.gender !== 'female') return 1;

            // Among females: those with children closer to right (males)
            if (personA?.gender === 'female' && personB?.gender === 'female') {
              const aHasChildren = personA.unionIds.some(uid => {
                const u = familyTree.unions[uid];
                return u && u.childIds.length > 0 && members.some(m => u.partnerIds.includes(m) && m !== a);
              });

              const bHasChildren = personB.unionIds.some(uid => {
                const u = familyTree.unions[uid];
                return u && u.childIds.length > 0 && members.some(m => u.partnerIds.includes(m) && m !== b);
              });

              // Females with children go right (closer to males)
              if (aHasChildren && !bHasChildren) return 1;
              if (bHasChildren && !aHasChildren) return -1;
            }

            // Among males: those with children closer to left (females)
            if (personA?.gender === 'male' && personB?.gender === 'male') {
              const aHasChildren = personA.unionIds.some(uid => {
                const u = familyTree.unions[uid];
                return u && u.childIds.length > 0 && members.some(m => u.partnerIds.includes(m) && m !== a);
              });

              const bHasChildren = personB.unionIds.some(uid => {
                const u = familyTree.unions[uid];
                return u && u.childIds.length > 0 && members.some(m => u.partnerIds.includes(m) && m !== b);
              });

              // Males with children go left (closer to females)
              if (aHasChildren && !bHasChildren) return -1;
              if (bHasChildren && !aHasChildren) return 1;
            }

            return 0;
          });

          members.forEach(id => positionedInGen.add(id));
          allGroups.push(members);
        });

        // Process single union groups
        const sortedUnionGroups = Array.from(unionGroups.values())
          .sort((a, b) => a.firstIndex - b.firstIndex);

        sortedUnionGroups.forEach(unionGroup => {
          const members = Array.from(unionGroup.members)
            .filter(personId => !positionedInGen.has(personId));

          if (members.length === 0) return;

          // Females on left, males on right
          members.sort((a, b) => {
            const personA = familyTree.persons[a];
            const personB = familyTree.persons[b];

            if (personA?.gender === 'female' && personB?.gender !== 'female') return -1;
            if (personB?.gender === 'female' && personA?.gender !== 'female') return 1;
            return 0;
          });

          members.forEach(id => positionedInGen.add(id));
          allGroups.push(members);
        });

        // Add remaining unpositioned persons
        remainingWithoutParents.forEach(personId => {
          if (positionedInGen.has(personId)) return;
          positionedInGen.add(personId);
          allGroups.push([personId]);
        });

        // Calculate total width and position groups
        let totalWidth = 0;
        allGroups.forEach((group, idx) => {
          if (group.length === 1) {
            totalWidth += PERSON_WIDTH;
          } else {
            totalWidth += group.length * PERSON_WIDTH + (group.length - 1) * COUPLE_GAP;
          }
          if (idx < allGroups.length - 1) {
            totalWidth += SIBLING_GAP * 2;
          }
        });

        let currentX = -totalWidth / 2;

        allGroups.forEach((group, groupIdx) => {
          group.forEach((personId, idx) => {
            const x = currentX + PERSON_WIDTH / 2;

            positionedPersons.set(personId, { x, y, generation });
            elements.push({ type: 'person', id: personId, x, y, generation });

            currentX += PERSON_WIDTH;

            if (idx < group.length - 1) {
              const nextPersonId = group[idx + 1];
              const person = familyTree.persons[personId];

              const sharedUnion = person?.unionIds
                .map(uid => familyTree.unions[uid])
                .find(u => u && u.partnerIds.includes(personId) && u.partnerIds.includes(nextPersonId));

              if (sharedUnion && !positionedUnions.has(sharedUnion.id)) {
                const symbolX = currentX + COUPLE_GAP / 2;
                const symbolY = y + AVATAR_VISUAL_CENTER - SYMBOL_SIZE / 2;

                positionedUnions.set(sharedUnion.id, { x: symbolX, y: symbolY, generation });
                elements.push({
                  type: 'union-symbol',
                  id: sharedUnion.id,
                  x: symbolX,
                  y: symbolY,
                  generation,
                  unionId: sharedUnion.id
                });
              }

              currentX += COUPLE_GAP;
            }
          });

          if (groupIdx < allGroups.length - 1) {
            currentX += SIBLING_GAP * 2;
          }
        });
      }

    });

    // STEP 4: Add union symbols for parent-child relationships (unions not yet added)
    Object.values(familyTree.unions).forEach(union => {
      if (positionedUnions.has(union.id)) return;

      const visibleChildren = union.childIds.filter(id => positionedPersons.has(id));

      // Check if partners are positioned
      const posPartners = union.partnerIds
        .filter(id => positionedPersons.has(id))
        .map(id => ({ id, pos: positionedPersons.get(id)! }));

      if (posPartners.length === 0) return;
      if (posPartners.length === 1 && visibleChildren.length === 0) return;

      if (posPartners.length >= 1) {
        const [p1, p2] = posPartners;
        const symbolX = p2 ? (p1.pos.x + p2.pos.x) / 2 : p1.pos.x;
        const symbolY = p1.pos.y + AVATAR_VISUAL_CENTER - SYMBOL_SIZE / 2;

        positionedUnions.set(union.id, { x: symbolX, y: symbolY, generation: p1.pos.generation });
        elements.push({
          type: 'union-symbol',
          id: union.id,
          x: symbolX,
          y: symbolY,
          generation: p1.pos.generation,
          unionId: union.id
        });
      }
    });

    // STEP 5: Override calculated positions with saved positions to keep layout stable
    elements.forEach(element => {
      if (element.type !== 'person') return;
      const person = familyTree.persons[element.id];
      if (!person?.position) return;
      if (enforcedPositions.has(element.id)) return;
      // Use saved position
      element.x = person.position.x;
      element.generation = person.position.generation;
      element.y = person.position.generation * GENERATION_GAP;

      // Update positionedPersons map for connection rendering
      const existingPos = positionedPersons.get(element.id);
      if (existingPos) {
        existingPos.x = element.x;
        existingPos.y = element.y;
        existingPos.generation = element.generation;
      }
    });

    // STEP 6: Update union symbol positions based on partner positions
    elements.forEach(element => {
      if (element.type !== 'union-symbol') return;
      const union = familyTree.unions[element.id];
      if (!union) return;

      const partnerPositions = union.partnerIds
        .map(id => positionedPersons.get(id))
        .filter(Boolean) as { x: number; y: number; generation: number }[];

      if (partnerPositions.length >= 2) {
        const newX = (partnerPositions[0].x + partnerPositions[1].x) / 2;
        const newY = partnerPositions[0].y + AVATAR_VISUAL_CENTER - SYMBOL_SIZE / 2;
        const newGeneration = partnerPositions[0].generation;
        element.x = newX;
        element.y = newY;
        element.generation = newGeneration;

        const unionPos = positionedUnions.get(element.id);
        if (unionPos) {
          unionPos.x = newX;
          unionPos.y = newY;
          unionPos.generation = newGeneration;
        }
      } else if (partnerPositions.length === 1) {
        element.x = partnerPositions[0].x;
        element.y = partnerPositions[0].y + AVATAR_VISUAL_CENTER - SYMBOL_SIZE / 2;
        element.generation = partnerPositions[0].generation;
      }
    });

    return { visibleElements: elements, collapsedDownUnions, collapsedUpPersons, collapsedSidePersons, enforcedPositions };
  }, [familyTree, focusedPersonId, expandedPersons, getAncestorSide]);

  // Save positions for new persons and for enforced layout groups
  useEffect(() => {
    if (!familyTree) return;

    const personsToUpdate: { id: string; x: number; generation: number }[] = [];
    const POSITION_TOLERANCE = 0.5;

    // First, save positions for persons without saved positions
    visibleElements.forEach(element => {
      if (element.type !== 'person') return;
      const person = familyTree.persons[element.id];
      if (!person) return;

      const shouldPersist = !person.position || enforcedPositions.has(element.id);
      if (!shouldPersist) return;

      const needsUpdate = !person.position
        || person.position.generation !== element.generation
        || Math.abs(person.position.x - element.x) > POSITION_TOLERANCE;

      if (needsUpdate) {
        personsToUpdate.push({
          id: element.id,
          x: element.x,
          generation: element.generation,
        });
      }
    });

    // Save positions for all persons that need it
    personsToUpdate.forEach(({ id, x, generation }) => {
      updatePerson(id, { position: { x, generation } });
    });

  }, [familyTree, visibleElements, enforcedPositions, updatePerson]);

  const _personGenerationMap = useMemo(() => {
    const map = new Map<string, number>();
    visibleElements.forEach(element => {
      if (element.type === 'person') {
        map.set(element.id, element.generation);
      }
    });
    return map;
  }, [visibleElements]);
  void _personGenerationMap; // Reserved for future use

  // Get all directly connected persons and unions for highlighting
  const getConnectedRelatives = useCallback((personId: string) => {
    const person = familyTree.persons[personId];
    if (!person) return { personIds: new Set<string>(), unionIds: new Set<string>() };

    const personIds = new Set<string>();
    const unionIds = new Set<string>();

    // Add parents
    if (person.parentUnionId) {
      const parentUnion = familyTree.unions[person.parentUnionId];
      if (parentUnion) {
        unionIds.add(person.parentUnionId);
        parentUnion.partnerIds.forEach(p => personIds.add(p));
      }
    }

    // Add partners and their unions
    person.unionIds.forEach(unionId => {
      const union = familyTree.unions[unionId];
      if (union) {
        unionIds.add(unionId);
        union.partnerIds.forEach(p => personIds.add(p));

        // Add children
        union.childIds.forEach(childId => personIds.add(childId));
      }
    });

    personIds.add(personId);
    return { personIds, unionIds };
  }, [familyTree]);

  // Store the target screen position of a person before a layout change.
  const anchorPersonRef = useRef<{ personId: string; screenX: number; screenY: number } | null>(null);

  const anchorPersonToCenter = (personId: string) => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    anchorPersonRef.current = {
      personId,
      screenX: containerRect.left + containerRect.width / 2,
      screenY: containerRect.top + containerRect.height / 2
    };
  };

  const centerPersonInView = (personId: string) => {
    if (!containerRef.current) return;
    const personElement = personRefs.current[personId];
    if (!personElement) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const personRect = personElement.getBoundingClientRect();
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const containerCenterY = containerRect.top + containerRect.height / 2;
    const personCenterX = personRect.left + personRect.width / 2;
    const personCenterY = personRect.top + personRect.height / 2;

    const deltaX = (containerCenterX - personCenterX) / scale;
    const deltaY = (containerCenterY - personCenterY) / scale;

    if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
      setPanOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
    }
  };

  // After layout updates, adjust pan to keep anchored person in place
  useEffect(() => {
    if (!anchorPersonRef.current) return;

    const { personId, screenX, screenY } = anchorPersonRef.current;
    const personElement = personRefs.current[personId];

    if (personElement) {
      const rect = personElement.getBoundingClientRect();
      const currentScreenX = rect.left + rect.width / 2;
      const currentScreenY = rect.top + rect.height / 2;

      // Calculate how much the person moved
      const deltaX = (screenX - currentScreenX) / scale;
      const deltaY = (screenY - currentScreenY) / scale;

      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        setPanOffset(prev => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY
        }));
      }
    }

    anchorPersonRef.current = null;
  }, [visibleElements, scale]);

  const handlePersonSelection = (personId: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;

    // Check if this person has ACTUALLY hidden content using the collapsed sets
    const hasHiddenParents = collapsedUpPersons.has(personId);
    const hasHiddenChildren = person.unionIds.some(unionId => collapsedDownUnions.has(unionId));
    const hasHiddenSpouses = collapsedSidePersons.has(personId);
    const hasHiddenContent = hasHiddenParents || hasHiddenChildren || hasHiddenSpouses;

    // If person has hidden content, expand by making them the focused person
    // This shifts the "center" of the tree so their ancestors show and others collapse
    if (hasHiddenContent) {
      suppressAutoFitRef.current = true;
      anchorPersonToCenter(personId);
      // Change focusedPersonId to make this person the root of the tree
      // This ensures their ancestors are shown (isDirectLine=true) while
      // the previous focused person's ancestors collapse (becomes isDirectLine=false)
      setFocusedPersonId(personId);
      setExpandedPersons(prev => new Set([...prev, personId]));
      return;
    }

    // No hidden content to expand, open menu
    centerPersonInView(personId);
    setSelectedPersonId(personId);
  };

  const unionSymbolOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    const personPositions = new Map<string, PositionedElement>();
    const unionElements: PositionedElement[] = [];

    visibleElements.forEach(element => {
      if (element.type === 'person') {
        personPositions.set(element.id, element);
      } else if (element.type === 'union-symbol') {
        unionElements.push(element);
      }
    });

    type SpouseEntry = {
      unionId: string;
      minX: number;
      maxX: number;
      baseY: number;
      minY: number;
      maxY: number;
    };

    const unionsByGeneration = new Map<number, SpouseEntry[]>();

    unionElements.forEach(element => {
      const union = familyTree.unions[element.id];
      if (!union) return;

      const partnerPositions = union.partnerIds
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      if (partnerPositions.length < 2) return;

      const minX = Math.min(...partnerPositions.map(partner => partner.x));
      const maxX = Math.max(...partnerPositions.map(partner => partner.x));
      const baseY = partnerPositions.reduce((sum, partner) => sum + partner.y + PERSON_HEIGHT / 2, 0) / partnerPositions.length;
      const rowTop = Math.min(...partnerPositions.map(partner => partner.y));
      const minY = rowTop + SPOUSE_MIN_OFFSET;
      const maxY = rowTop + PERSON_HEIGHT - SPOUSE_TEXT_CLEARANCE;

      const entry: SpouseEntry = { unionId: element.id, minX, maxX, baseY, minY, maxY };

      if (!unionsByGeneration.has(element.generation)) {
        unionsByGeneration.set(element.generation, []);
      }
      unionsByGeneration.get(element.generation)!.push(entry);
    });

    unionsByGeneration.forEach(entries => {
      entries.sort((a, b) => a.minX - b.minX);

      const layers: { maxX: number }[] = [];
      const layerAssignments: number[] = [];

      entries.forEach(entry => {
        let layerIndex = -1;

        for (let i = 0; i < layers.length; i += 1) {
          if (entry.minX > layers[i].maxX) {
            layerIndex = i;
            layers[i].maxX = entry.maxX;
            break;
          }
        }

        if (layerIndex === -1) {
          layerIndex = layers.length;
          layers.push({ maxX: entry.maxX });
        }

        layerAssignments.push(layerIndex);
      });

      const layerCount = layers.length;
      const availableOffsets = entries.map(entry =>
        Math.max(0, Math.min(entry.baseY - entry.minY, entry.maxY - entry.baseY))
      );
      const maxOffset = Math.min(SPOUSE_MAX_OFFSET, Math.min(...availableOffsets));
      const minSeparation = SYMBOL_SIZE + 6;
      const desiredStep = Math.max(SPOUSE_LINE_STEP, minSeparation);
      const maxStep = layerCount > 1 ? (maxOffset * 2) / (layerCount - 1) : 0;
      const step = layerCount > 1 ? Math.min(desiredStep, maxStep) : 0;

      entries.forEach((entry, idx) => {
        const offset = (layerAssignments[idx] - (layerCount - 1) / 2) * step;
        const unclampedY = entry.baseY + offset;
        const clampedY = Math.min(entry.maxY, Math.max(entry.minY, unclampedY));
        offsets.set(entry.unionId, clampedY - entry.baseY);
      });
    });

    return offsets;
  }, [familyTree, visibleElements]);

  const unionSymbolXOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    const personPositions = new Map<string, PositionedElement>();
    const unionElements: PositionedElement[] = [];

    visibleElements.forEach(element => {
      if (element.type === 'person') {
        personPositions.set(element.id, element);
      } else if (element.type === 'union-symbol') {
        unionElements.push(element);
      }
    });

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    type Interval = { start: number; end: number };

    const getSafeX = (candidateX: number, minX: number, maxX: number, blocks: Interval[]) => {
      const clampedCandidate = clamp(candidateX, minX, maxX);
      const normalized = blocks
        .map(block => ({
          start: Math.max(minX, block.start),
          end: Math.min(maxX, block.end)
        }))
        .filter(block => block.end > block.start)
        .sort((a, b) => a.start - b.start);

      if (normalized.length === 0) {
        return clampedCandidate;
      }

      const merged: Interval[] = [];
      normalized.forEach(block => {
        const last = merged[merged.length - 1];
        if (!last || block.start > last.end) {
          merged.push({ start: block.start, end: block.end });
        } else {
          last.end = Math.max(last.end, block.end);
        }
      });

      const safe: Interval[] = [];
      let cursor = minX;

      merged.forEach(block => {
        if (block.start > cursor) {
          safe.push({ start: cursor, end: block.start });
        }
        cursor = Math.max(cursor, block.end);
      });

      if (cursor < maxX) {
        safe.push({ start: cursor, end: maxX });
      }

      if (safe.length === 0) {
        return clampedCandidate;
      }

      for (const interval of safe) {
        if (clampedCandidate >= interval.start && clampedCandidate <= interval.end) {
          return clampedCandidate;
        }
      }

      let best = safe[0];
      let bestDistance = Infinity;

      safe.forEach(interval => {
        const distance = clampedCandidate < interval.start
          ? interval.start - clampedCandidate
          : clampedCandidate - interval.end;

        if (distance < bestDistance) {
          bestDistance = distance;
          best = interval;
        }
      });

      return clampedCandidate < best.start ? best.start : best.end;
    };

    unionElements.forEach(element => {
      const union = familyTree.unions[element.id];
      if (!union) return;

      const partnerPositions = union.partnerIds
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      if (partnerPositions.length < 2) return;

      const lineY = element.y + SYMBOL_SIZE / 2 + (unionSymbolOffsets.get(element.id) ?? 0);
      const minPartnerX = Math.min(...partnerPositions.map(partner => partner.x));
      const maxPartnerX = Math.max(...partnerPositions.map(partner => partner.x));
      const safeMinX = minPartnerX + SYMBOL_RADIUS;
      const safeMaxX = maxPartnerX - SYMBOL_RADIUS;

      if (safeMinX >= safeMaxX) {
        offsets.set(element.id, 0);
        return;
      }

      const verticalClearance = SYMBOL_RADIUS + SYMBOL_AVATAR_GAP;
      const horizontalClearance = AVATAR_RADIUS + SYMBOL_RADIUS + SYMBOL_AVATAR_GAP;
      const blocks: Interval[] = [];

      personPositions.forEach(person => {
        const avatarTop = person.y;
        const avatarBottom = person.y + AVATAR_SIZE;

        if (lineY < avatarTop - verticalClearance || lineY > avatarBottom + verticalClearance) {
          return;
        }

        blocks.push({
          start: person.x - horizontalClearance,
          end: person.x + horizontalClearance
        });
      });

      const safeX = getSafeX(element.x, safeMinX, safeMaxX, blocks);
      offsets.set(element.id, safeX - element.x);
    });

    return offsets;
  }, [familyTree, visibleElements, unionSymbolOffsets]);

  const formatDate = (date: Person['birthDate']) => {
    const parts = [date.day, date.month, date.year].filter(Boolean);
    return parts.join('.');
  };

  const toDateInfo = (date: Person['birthDate']) => {
    const year = date.year ? Number.parseInt(date.year, 10) : NaN;
    if (!Number.isFinite(year)) return null;
    const month = date.month ? Number.parseInt(date.month, 10) : NaN;
    const day = date.day ? Number.parseInt(date.day, 10) : NaN;
    const safeMonth = Number.isFinite(month) ? Math.min(12, Math.max(1, month)) : 1;
    const safeDay = Number.isFinite(day) ? Math.min(31, Math.max(1, day)) : 1;
    return {
      date: new Date(year, safeMonth - 1, safeDay),
      hasMonth: Number.isFinite(month),
      hasDay: Number.isFinite(day),
    };
  };

  const calculateAge = (person: Person) => {
    const birthInfo = toDateInfo(person.birthDate);
    if (!birthInfo) return null;
    const endInfo = toDateInfo(person.deathDate);
    const endDate = endInfo?.date ?? new Date();

    let age = endDate.getFullYear() - birthInfo.date.getFullYear();
    if (birthInfo.hasMonth && birthInfo.hasDay) {
      const endMonth = endDate.getMonth();
      const endDay = endDate.getDate();
      if (
        endMonth < birthInfo.date.getMonth() ||
        (endMonth === birthInfo.date.getMonth() && endDay < birthInfo.date.getDate())
      ) {
        age -= 1;
      }
    }

    return age >= 0 ? age : null;
  };

  // Render a person card
  const renderPerson = (person: Person, x: number, y: number) => {
    const personName = `${person.firstName || ''} ${person.lastName || ''}`.trim();
    const birthDate = formatDate(person.birthDate);
    const deathDate = formatDate(person.deathDate);
    const age = calculateAge(person);
    const hasDetails = Boolean(birthDate || deathDate || age !== null);
    const detailRows = hasDetails
      ? [
          birthDate || '-',
          deathDate || '-',
          age !== null ? String(age) : '-',
        ]
      : [];
    const isExpanded = expandedPersons.has(person.id);
    const isFocused = focusedPersonId === person.id;
    // Check if this person can be expanded (has hidden content in any direction)
    const hasHiddenParents = collapsedUpPersons.has(person.id);
    const hasHiddenChildren = person.unionIds.some(unionId => collapsedDownUnions.has(unionId));
    const hasHiddenSpouses = collapsedSidePersons.has(person.id);
    const canBeExpanded = hasHiddenParents || hasHiddenChildren || hasHiddenSpouses;
    const isDragging = dragState.id === person.id && dragState.isDragging;
    const isDragRelated = dragRelatedIds.has(person.id);
    const dragTransform = dragState.id === person.id
      ? `translate3d(${dragState.dx}px, ${dragState.dy}px, 0)`
      : undefined;
    const isHovered = hoveredPersonId === person.id;
    const hoveredConnections = hoveredPersonId ? getConnectedRelatives(hoveredPersonId) : { personIds: new Set<string>(), unionIds: new Set<string>() };
    const isConnected = hoveredConnections.personIds.has(person.id);

    return (
      <div
        key={person.id}
        ref={registerPersonRef(person.id)}
        className={`tree-person-card ${isFocused ? 'focused' : ''} ${isExpanded ? 'expanded' : ''} ${isDragging ? 'dragging' : ''} ${isDragRelated ? 'drag-related' : ''} ${isHovered ? 'hovered' : ''} ${hoveredPersonId && isConnected ? 'connected' : ''}`}
        style={{
          position: 'absolute',
          left: x - PERSON_WIDTH / 2,
          top: y,
          width: PERSON_WIDTH,
          transform: dragTransform,
        }}
        onClick={handlePersonClick}
        onPointerDown={handlePersonPointerDown(person.id)}
        onPointerMove={handlePersonPointerMove(person.id)}
        onPointerUp={handlePersonPointerUp(person.id)}
        onPointerCancel={handlePersonPointerCancel(person.id)}
        onMouseEnter={() => setHoveredPersonId(person.id)}
        onMouseLeave={() => setHoveredPersonId(null)}
      >
        <div className={`tree-person-avatar ${person.gender === 'male' ? 'male' : person.gender === 'female' ? 'female' : ''}`}>
          {person.photo ? (
            <img src={person.photo} alt={personName || 'Profilbild'} />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          )}
        </div>
        {personName && <div className="tree-person-name">{personName}</div>}
        {detailRows.length > 0 && (
          <div className="tree-person-details">
            {detailRows.map((row, index) => (
              <div key={`detail-${person.id}-${index}`} className="tree-person-detail">
                {row}
              </div>
            ))}
          </div>
        )}
        {canBeExpanded && (
          <div className="expand-indicators" title="Klicken zum Erweitern">
            {hasHiddenParents && (
              <div className="expand-indicator expand-up">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
                </svg>
              </div>
            )}
            {hasHiddenSpouses && (
              <div className="expand-indicator expand-side">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M8 12l6-6v4h6v4h-6v4z"/>
                </svg>
              </div>
            )}
            {hasHiddenChildren && (
              <div className="expand-indicator expand-down">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" transform="rotate(180 12 12)"/>
                </svg>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render marriage/divorce symbol
  const renderUnionSymbol = (unionId: string, x: number, y: number) => {
    const union = familyTree.unions[unionId];
    if (!union) return null;

    const symbolOffset = unionSymbolOffsets.get(unionId) ?? 0;
    const symbolXOffset = unionSymbolXOffsets.get(unionId) ?? 0;
    const isDivorced = union.status === 'divorced';
    const hoveredConnections = hoveredPersonId ? getConnectedRelatives(hoveredPersonId) : { personIds: new Set<string>(), unionIds: new Set<string>() };
    const isConnected = hoveredConnections.unionIds.has(unionId);

    return (
      <div
        key={`symbol-${unionId}`}
        ref={registerSymbolRef(unionId)}
        className={`union-symbol ${isDivorced ? 'divorced' : 'married'} ${hoveredPersonId && isConnected ? 'connected' : ''}`}
        style={{
          position: 'absolute',
          left: x - SYMBOL_SIZE / 2 + symbolXOffset,
          top: y + symbolOffset,
          width: SYMBOL_SIZE,
          height: SYMBOL_SIZE,
        }}
        onClick={(e) => {
          e.stopPropagation();
          toggleMarriageStatus(unionId);
        }}
        title={isDivorced ? 'Geschieden - Klicken zum Ändern' : 'Verheiratet - Klicken zum Ändern'}
      >
        {isDivorced ? (
          // Broken rings icon
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C9.24 2 7 4.24 7 7c0 1.53.69 2.9 1.78 3.82L3.5 16.1c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l5.28-5.28c.92 1.09 2.29 1.78 3.82 1.78 2.76 0 5-2.24 5-5S16.76 2 12 2zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
            <path d="M12 14c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z" opacity="0.5"/>
          </svg>
        ) : (
          // Linked rings icon
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 12c0-1.66 1.34-3 3-3s3 1.34 3 3-1.34 3-3 3-3-1.34-3-3zm3-5c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z"/>
            <circle cx="8" cy="12" r="4" opacity="0.6"/>
            <circle cx="16" cy="12" r="4" opacity="0.6"/>
          </svg>
        )}
      </div>
    );
  };

  // Calculate SVG lines
  const renderConnections = () => {
    const lines: ReactElement[] = [];
    const hoveredConnections = hoveredPersonId ? getConnectedRelatives(hoveredPersonId) : { personIds: new Set<string>(), unionIds: new Set<string>() };

    const getLineClassName = (baseClass: string, unionId?: string) => {
      const classes = [baseClass];
      if (unionId && hoveredConnections.unionIds.has(unionId)) {
        classes.push('connected');
      }
      return classes.join(' ');
    };

    const personPositions = new Map<string, PositionedElement>();
    const unionElements: PositionedElement[] = [];

    visibleElements.forEach(element => {
      if (element.type === 'person') {
        const draggedPosition = dragState.id === element.id && dragState.isDragging
          ? { ...element, x: element.x + dragState.dx, y: element.y + dragState.dy }
          : element;
        personPositions.set(element.id, draggedPosition);
      } else if (element.type === 'union-symbol') {
        unionElements.push(element);
      }
    });

    type UnionConnector = {
      unionId: string;
      symbolX: number;
      symbolY: number;
      minX: number;
      maxX: number;
      parentBottom: number;
      childTop: number;
      baseY: number;
      gap: number;
    };

    const unionsByGeneration = new Map<number, UnionConnector[]>();

    unionElements.forEach(element => {
      const union = familyTree.unions[element.id];
      if (!union) return;

      const symbolOffset = unionSymbolOffsets.get(element.id) ?? 0;
      const childPositions = union.childIds
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      if (childPositions.length === 0) return;

      const partnerPositions = union.partnerIds
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      if (partnerPositions.length === 0) return;

      const minChildX = Math.min(...childPositions.map(child => child.x));
      const maxChildX = Math.max(...childPositions.map(child => child.x));
      const symbolX = element.x;
      const symbolY = element.y + SYMBOL_SIZE / 2 + symbolOffset;
      const minX = Math.min(symbolX, minChildX);
      const maxX = Math.max(symbolX, maxChildX);
      const parentBottom = Math.max(...partnerPositions.map(partner => partner.y + PERSON_HEIGHT));
      const childTop = Math.min(...childPositions.map(child => child.y));
      const gap = Math.max(0, childTop - parentBottom);
      const baseY = parentBottom + gap / 2;

      const entry: UnionConnector = {
        unionId: element.id,
        symbolX,
        symbolY,
        minX,
        maxX,
        parentBottom,
        childTop,
        baseY,
        gap
      };

      if (!unionsByGeneration.has(element.generation)) {
        unionsByGeneration.set(element.generation, []);
      }
      unionsByGeneration.get(element.generation)!.push(entry);
    });

    // Assign connector layers within a generation to avoid overlapping horizontal spans.
    const unionMidYById = new Map<string, number>();
    const MIN_HORIZONTAL_GAP = 0;

    unionsByGeneration.forEach(entries => {
      entries.sort((a, b) => a.minX - b.minX);

      const layers: { maxX: number }[] = [];
      const layerAssignments: number[] = [];

      entries.forEach(entry => {
        let layerIndex = -1;

        for (let i = 0; i < layers.length; i += 1) {
          if (entry.minX > layers[i].maxX + MIN_HORIZONTAL_GAP) {
            layerIndex = i;
            layers[i].maxX = entry.maxX;
            break;
          }
        }

        if (layerIndex === -1) {
          layerIndex = layers.length;
          layers.push({ maxX: entry.maxX });
        }

        layerAssignments.push(layerIndex);
      });

      const layerCount = layers.length;
      const minGap = Math.min(...entries.map(entry => entry.gap));
      const maxSpread = Math.max(0, minGap - 2 * CONNECTOR_CLEARANCE);
      const step = layerCount > 1
        ? Math.min(CONNECTOR_STEP, maxSpread / (layerCount - 1))
        : 0;

      entries.forEach((entry, idx) => {
        const offset = (layerAssignments[idx] - (layerCount - 1) / 2) * step;
        const unclampedY = entry.baseY + offset;
        const minY = entry.parentBottom + CONNECTOR_CLEARANCE;
        const maxY = entry.childTop - CONNECTOR_CLEARANCE;
        const midY = minY <= maxY
          ? Math.min(maxY, Math.max(minY, unclampedY))
          : entry.baseY;
        unionMidYById.set(entry.unionId, midY);
      });
    });

    // Now draw connections
    unionElements.forEach(element => {
      const union = familyTree.unions[element.id];
      if (!union) return;

      const symbolOffset = unionSymbolOffsets.get(element.id) ?? 0;
      const symbolX = element.x;
      const symbolY = element.y + SYMBOL_SIZE / 2 + symbolOffset;

      const partnerPositions = union.partnerIds
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      if (partnerPositions.length > 1) {
        const minPartnerX = Math.min(...partnerPositions.map(partner => partner.x));
        const maxPartnerX = Math.max(...partnerPositions.map(partner => partner.x));

        // Horizontal marriage line at symbol Y (center of union symbol)
        lines.push(
          <line
            key={`spouse-horizontal-${element.id}`}
            x1={minPartnerX}
            y1={symbolY}
            x2={maxPartnerX}
            y2={symbolY}
            className={getLineClassName(`connection-line spouse ${union.status === 'divorced' ? 'divorced' : ''}`, element.id)}
          />
        );
      } else if (partnerPositions.length === 1) {
        const partner = partnerPositions[0];
        const partnerCenterY = partner.y + PERSON_HEIGHT / 2;
        if (Math.abs(partnerCenterY - symbolY) > 0.5) {
          lines.push(
            <line
              key={`spouse-vertical-${element.id}-${partner.id}`}
              x1={partner.x}
              y1={partnerCenterY}
              x2={partner.x}
              y2={symbolY}
              className={getLineClassName(`connection-line spouse ${union.status === 'divorced' ? 'divorced' : ''}`, element.id)}
            />
          );
        }
      }

      // Draw line down to children
      const childPositions = union.childIds
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      if (childPositions.length > 0) {
        const midY = unionMidYById.get(element.id) ?? (symbolY + SYMBOL_SIZE / 2 + CONNECTOR_CLEARANCE);

        // Vertical line from symbol down to midY
        lines.push(
          <line
            key={`parent-vertical-${element.id}`}
            x1={symbolX}
            y1={symbolY}
            x2={symbolX}
            y2={midY}
            className={getLineClassName("connection-line parent", element.id)}
          />
        );

        const minChildX = Math.min(...childPositions.map(child => child.x));
        const maxChildX = Math.max(...childPositions.map(child => child.x));

        // Horizontal line at the calculated height
        lines.push(
          <line
            key={`parent-horizontal-${element.id}`}
            x1={Math.min(symbolX, minChildX)}
            y1={midY}
            x2={Math.max(symbolX, maxChildX)}
            y2={midY}
            className={getLineClassName("connection-line parent", element.id)}
          />
        );

        // Vertical lines to each child
        childPositions.forEach(child => {
          lines.push(
            <line
              key={`parent-child-${element.id}-${child.id}`}
              x1={child.x}
              y1={midY}
              x2={child.x}
              y2={child.y}
              className={getLineClassName("connection-line parent", element.id)}
            />
          );
        });
      } else if (collapsedDownUnions.has(element.id) && union.childIds.length > 0) {
        const stubStartY = symbolY;
        const stubEndY = stubStartY + COLLAPSED_BRANCH_LENGTH;

        lines.push(
          <line
            key={`collapsed-child-line-${element.id}`}
            x1={symbolX}
            y1={stubStartY}
            x2={symbolX}
            y2={stubEndY}
            className={getLineClassName("connection-line parent", element.id)}
          />
        );
        lines.push(
          <circle
            key={`collapsed-child-dot-${element.id}`}
            cx={symbolX}
            cy={stubEndY}
            r={COLLAPSED_BRANCH_RADIUS}
            className="connection-stub"
          />
        );
      }
    });

    return lines;
  };

  // Calculate bounds for the tree
  const bounds = useMemo(() => {
    if (visibleElements.length === 0) {
      return { minX: 0, maxX: 400, minY: 0, maxY: 400 };
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    visibleElements.forEach(el => {
      if (el.type === 'person') {
        minX = Math.min(minX, el.x - PERSON_WIDTH / 2);
        maxX = Math.max(maxX, el.x + PERSON_WIDTH / 2);
        minY = Math.min(minY, el.y);
        maxY = Math.max(maxY, el.y + PERSON_HEIGHT);
      } else {
        minX = Math.min(minX, el.x - SYMBOL_SIZE / 2);
        maxX = Math.max(maxX, el.x + SYMBOL_SIZE / 2);
        minY = Math.min(minY, el.y);
        maxY = Math.max(maxY, el.y + SYMBOL_SIZE);
      }
    });

    return {
      minX: minX - BOUNDS_MARGIN,
      maxX: maxX + BOUNDS_MARGIN,
      minY: minY - BOUNDS_MARGIN,
      maxY: maxY + BOUNDS_MARGIN,
    };
  }, [visibleElements]);

  const offsetX = -bounds.minX;
  const offsetY = -bounds.minY;
  const treeWidth = bounds.maxX - bounds.minX;
  const treeHeight = bounds.maxY - bounds.minY;

  const allPersons = Object.values(familyTree.persons);
  const unconnectedPersons = allPersons.filter(p =>
    p.unionIds.length === 0 && !p.parentUnionId
  );

  const dragRelatedIds = useMemo(() => {
    const related = new Set<string>();
    if (!dragState.id || !dragState.isDragging) return related;

    const person = familyTree.persons[dragState.id];
    if (!person) return related;

    if (person.parentUnionId) {
      const parentUnion = familyTree.unions[person.parentUnionId];
      parentUnion?.partnerIds.forEach(parentId => related.add(parentId));
      parentUnion?.childIds.forEach(childId => {
        if (childId !== person.id) related.add(childId);
      });
    }

    person.unionIds.forEach(unionId => {
      const union = familyTree.unions[unionId];
      union?.childIds.forEach(childId => related.add(childId));
    });

    return related;
  }, [dragState.id, dragState.isDragging, familyTree]);

  return (
    <div className="family-tree-view">
      <div className="family-tree-header">
        <button className="back-to-manager-button" onClick={() => setCurrentView('manager')} title="Zur Übersicht">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <div className="family-tree-header-content">
          <h1>{activeTreeId ? allTrees[activeTreeId]?.name : 'Familienstammbaum'}</h1>
          <div className="family-tree-stats">
            {allPersons.length} {allPersons.length === 1 ? 'Person' : 'Personen'}
          </div>
        </div>
      </div>

      <div
        className={`tree-container ${isPanning ? 'panning' : ''}`}
        ref={containerRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
      >
        <div
          ref={treeRef}
          style={{
            transform: `scale(${scale}) translate(${panOffset.x}px, ${panOffset.y}px)`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.4s ease-out',
          }}
        >
          <div
            className="tree-canvas"
            ref={layoutRef}
            style={{
              position: 'relative',
              width: treeWidth,
              height: treeHeight,
              margin: '0 auto',
            }}
          >
            <svg
              className="tree-connections"
              width={treeWidth}
              height={treeHeight}
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              <g transform={`translate(${offsetX}, ${offsetY})`}>
                {renderConnections()}
              </g>
            </svg>

            <div style={{ position: 'relative' }}>
              {visibleElements.map(element => {
                if (element.type === 'person') {
                  const person = familyTree.persons[element.id];
                  if (!person) return null;
                  return renderPerson(person, element.x + offsetX, element.y + offsetY);
                } else if (element.type === 'union-symbol') {
                  return renderUnionSymbol(element.id, element.x + offsetX, element.y + offsetY);
                }
                return null;
              })}
            </div>
          </div>
        </div>
      </div>

      {unconnectedPersons.length > 0 && (
        <div className="tree-unconnected-bar">
          <span>Nicht verknüpft:</span>
          {unconnectedPersons.map(person => (
            <div
              key={person.id}
              className="unconnected-person-chip"
              onClick={() => {
                setFocusedPersonId(person.id);
                setExpandedPersons(new Set([person.id]));
              }}
            >
              {person.firstName || 'Unbenannt'}
            </div>
          ))}
        </div>
      )}

      <div className="zoom-controls">
        <button className="zoom-button" onClick={handleZoomIn} title="Vergrößern">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </button>
        <button className="zoom-button" onClick={handleZoomOut} title="Verkleinern">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13H5v-2h14v2z"/>
          </svg>
        </button>
        <button className="zoom-button fit-button" onClick={handleFitToScreen} title="Zentrieren und anpassen">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/>
          </svg>
        </button>
        <button className="zoom-button" onClick={handleResetPositions} title="Positionen neu berechnen">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
        </button>
      </div>

      {selectedPersonId && (
        <CircularMenu
          person={familyTree.persons[selectedPersonId]}
          onAddParent={handleAddParent}
          onAddSpouse={handleAddSpouse}
          onAddChild={handleAddChild}
          onEdit={handleEdit}
          onLink={handleLink}
          onUnlink={handleUnlink}
          onDelete={handleDelete}
          onClose={handleCloseMenu}
        />
      )}

      {editingPersonId && (
        <PersonEditModal
          person={familyTree.persons[editingPersonId]}
          onClose={() => setEditingPersonId(null)}
        />
      )}

      {linkMenuState && (
        <LinkMenu
          personId={linkMenuState.personId}
          type={linkMenuState.type}
          onClose={() => setLinkMenuState(null)}
        />
      )}
    </div>
  );
};
