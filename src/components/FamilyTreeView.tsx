import { useState, useRef, useEffect, useMemo, useCallback, type ReactElement } from 'react';
import { Person, Union } from '../types';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { CircularMenu } from './CircularMenu';
import { PersonEditModal } from './PersonEditModal';
import { LinkMenu } from './LinkMenu';
import { translations } from '../i18n';
import { getDisplayName, getLastNameList } from '../utils/person';

// Layout configuration
const PERSON_WIDTH = 100;
const PERSON_HEIGHT = 140;
const COUPLE_GAP = 96; // Gap between partners (for marriage symbol)
const SIBLING_GAP = 48;
const STANDALONE_TREE_GAP = 220;
const STANDALONE_TREE_SPACING = PERSON_WIDTH + SIBLING_GAP + 28;
const GENERATION_GAP = 190;
const SYMBOL_SIZE = 36;
const AVATAR_SIZE = 80;
const AVATAR_BORDER = 3;
const AVATAR_VISUAL_CENTER = (AVATAR_SIZE + AVATAR_BORDER * 2) / 2;
const SYMBOL_RADIUS = SYMBOL_SIZE / 2;
const SYMBOL_AVATAR_GAP = 12;
const SINGLE_PARENT_SYMBOL_TOP_OFFSET = PERSON_HEIGHT + SYMBOL_AVATAR_GAP;
const FOCUS_GENERATION = 2;
const COLLAPSED_BRANCH_LENGTH = 14;
const COLLAPSED_BRANCH_RADIUS = 6;
const BOUNDS_MARGIN = Math.max(40, COLLAPSED_BRANCH_LENGTH + COLLAPSED_BRANCH_RADIUS + 8);
const DRAG_THRESHOLD = 6;
const EXPAND_CENTER_DELAY_MS = 0;
const TREE_OVERLAY_HISTORY_KEY = '__family_tree_overlay_open';
const DESKTOP_VIEWPORT_QUERY = '(min-width: 901px)';
const CTRL_WHEEL_ZOOM_FACTOR = 1.12;
const KEYBOARD_ZOOM_FACTOR = 1.2;
const clampValue = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeSearchText = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

interface PositionedElement {
  type: 'person' | 'union-symbol';
  id: string;
  x: number;
  y: number;
  generation: number;
  unionId?: string;
}

const getLayoutBounds = (elements: PositionedElement[]) => {
  if (elements.length === 0) {
    return { minX: 0, maxX: 400, minY: 0, maxY: 400 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  elements.forEach(el => {
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
};

export const FamilyTreeView = () => {
  const { familyTree, addPerson, addParent, addSpouse, addChild, deletePerson, toggleMarriageStatus, setCurrentView, allTrees, activeTreeId, updatePerson, language } = useFamilyTree();
  const copy = translations[language];
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [linkMenuState, setLinkMenuState] = useState<{ personId: string; type: 'link' | 'unlink' | 'add-child' } | null>(null);
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [layoutAnimationKey, setLayoutAnimationKey] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{
    startDistance: number;
    startScale: number;
    layoutOrigin: { x: number; y: number };
    origin: { x: number; y: number };
    worldPoint: { x: number; y: number };
  } | null>(null);
  const isPinchingRef = useRef(false);
  const suppressTapRef = useRef(false);
  const [expandedPersons, setExpandedPersons] = useState<Set<string>>(new Set());
  const [focusedPersonId, setFocusedPersonId] = useState<string | null>(null);
  const isFullTreeLayout = true;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [searchFocusId, setSearchFocusId] = useState<string | null>(null);
  const [bottomSearchOpen, setBottomSearchOpen] = useState(false);
  const [generationFilter, setGenerationFilter] = useState<number | null>(null);
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bottomSearchInputRef = useRef<HTMLInputElement>(null);
  const searchDockRef = useRef<HTMLDivElement>(null);
  const bottomSearchBlurTimerRef = useRef<number | null>(null);
  const personRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const symbolRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const longPressTimerRef = useRef<number | null>(null);
  const suppressAutoFitRef = useRef(false);
  const filteredElementsRef = useRef<PositionedElement[]>([]);
  const allBoundsRef = useRef({ minX: 0, maxX: 400, minY: 0, maxY: 400 });
  const pendingCenterRef = useRef(false); // Flag to center after expand/layout updates
  const pendingCenterDelayRef = useRef(0);
  const pendingCenterTimerRef = useRef<number | null>(null);
  const suppressAnchoringRef = useRef(false);
  const previousVisibleIdsRef = useRef<Set<string>>(new Set());
  const previousTreeIdRef = useRef<string | null>(null);
  const scaleRef = useRef(scale);
  const panOffsetRef = useRef(panOffset);
  const wasTreeOverlayOpenRef = useRef(false);
  const isHandlingOverlayPopRef = useRef(false);
  const lineMaskIdRef = useRef(`tree-lines-${Math.random().toString(36).slice(2, 9)}`);
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

  if (previousTreeIdRef.current !== activeTreeId) {
    previousTreeIdRef.current = activeTreeId ?? null;
    previousVisibleIdsRef.current = new Set();
    suppressAnchoringRef.current = true;
  }

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    return () => {
      if (pendingCenterTimerRef.current !== null) {
        window.clearTimeout(pendingCenterTimerRef.current);
        pendingCenterTimerRef.current = null;
      }
      if (bottomSearchBlurTimerRef.current !== null) {
        window.clearTimeout(bottomSearchBlurTimerRef.current);
        bottomSearchBlurTimerRef.current = null;
      }
    };
  }, []);

  // Initialize focused person
  useEffect(() => {
    if (!familyTree) return;
    if (focusedPersonId && familyTree.persons[focusedPersonId]) return;

    const persons = Object.values(familyTree.persons);
    if (persons.length === 0) return;

    suppressAnchoringRef.current = true;
    // Prefer a person with unions as stable center anchor.
    const personWithUnion = persons.find(p => p.unionIds.length > 0);
    const nextFocusedId = personWithUnion?.id ?? persons[0].id;
    setFocusedPersonId(nextFocusedId);
    setExpandedPersons(new Set([nextFocusedId]));
  }, [familyTree, focusedPersonId]);

  useEffect(() => {
    document.body.classList.add('tree-view-active');
    return () => {
      document.body.classList.remove('tree-view-active');
    };
  }, []);

  const isTreeOverlayOpen = Boolean(selectedPersonId || editingPersonId || linkMenuState);
  const backButtonLabel = isTreeOverlayOpen ? copy.backToTree : copy.backToOverview;
  const treeViewClassName = `family-tree-view${isTreeOverlayOpen ? ' tree-overlay-open' : ''}${editingPersonId ? ' tree-person-edit-open' : ''}`;

  const closeTreeOverlay = useCallback(() => {
    setSelectedPersonId(null);
    setEditingPersonId(null);
    setLinkMenuState(null);
  }, []);

  const handleHeaderBackClick = useCallback(() => {
    if (isTreeOverlayOpen) {
      closeTreeOverlay();
      return;
    }
    setCurrentView('manager');
  }, [isTreeOverlayOpen, closeTreeOverlay, setCurrentView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isHandlingOverlayPopRef.current) {
      wasTreeOverlayOpenRef.current = isTreeOverlayOpen;
      isHandlingOverlayPopRef.current = false;
      return;
    }

    const wasOpen = wasTreeOverlayOpenRef.current;
    const historyState = window.history.state && typeof window.history.state === 'object'
      ? (window.history.state as Record<string, unknown>)
      : {};

    if (isTreeOverlayOpen && !wasOpen) {
      window.history.pushState(
        {
          ...historyState,
          [TREE_OVERLAY_HISTORY_KEY]: true,
        },
        ''
      );
    } else if (!isTreeOverlayOpen && wasOpen && historyState[TREE_OVERLAY_HISTORY_KEY] === true) {
      window.history.replaceState(
        {
          ...historyState,
          [TREE_OVERLAY_HISTORY_KEY]: false,
        },
        ''
      );
    }

    wasTreeOverlayOpenRef.current = isTreeOverlayOpen;
  }, [isTreeOverlayOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state && typeof event.state === 'object'
        ? (event.state as Record<string, unknown>)
        : {};
      const hasOverlayState = state[TREE_OVERLAY_HISTORY_KEY] === true;

      if (!hasOverlayState && (selectedPersonId || editingPersonId || linkMenuState)) {
        isHandlingOverlayPopRef.current = true;
        closeTreeOverlay();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [selectedPersonId, editingPersonId, linkMenuState, closeTreeOverlay]);

  if (!familyTree) {
    return (
      <div className="family-tree-view">
        <div className="tree-empty-state">
          <h2>{copy.noTreeTitle}</h2>
          <p>{copy.noTreeMessage}</p>
          <button onClick={() => setCurrentView('manager')} className="btn-primary">
            {copy.backToOverview}
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
    if (isPinchingRef.current || activePointersRef.current.size > 1) return;
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
    if (isPinchingRef.current) return;

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
      if (suppressTapRef.current || isPinchingRef.current) return;
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
      suppressAnchoringRef.current = true;
      const child = familyTree.persons[selectedPersonId];
      if (!child) return;

      // Calculate parent positions based on child's position
      const childX = child.position?.x ?? 0;
      const childGen = child.position?.generation ?? FOCUS_GENERATION;
      const parentGen = childGen - 1;

      const parentUnion = child.parentUnionId ? familyTree.unions[child.parentUnionId] : undefined;
      const existingParentIds = (parentUnion?.partnerIds ?? [])
        .filter(parentId => Boolean(familyTree.persons[parentId]));

      const newParentIds: string[] = [];
      const parentDistance = PERSON_WIDTH + COUPLE_GAP;

      if (existingParentIds.length === 0) {
        // No parents yet: keep current behavior (mother left + father right).
        const motherX = childX - parentDistance / 2;
        const fatherX = childX + parentDistance / 2;

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
        newParentIds.push(fatherId, motherId);
      } else if (existingParentIds.length === 1) {
        // One parent exists: only add the missing gender.
        const existingParent = familyTree.persons[existingParentIds[0]];
        if (!existingParent) return;

        const existingParentX = existingParent.position?.x ?? childX;
        let missingGender: Person['gender'];
        let newParentX: number;

        if (existingParent.gender === 'male') {
          missingGender = 'female';
          newParentX = existingParentX - parentDistance;
        } else if (existingParent.gender === 'female') {
          missingGender = 'male';
          newParentX = existingParentX + parentDistance;
        } else if (existingParentX <= childX) {
          // Unknown gender fallback: place counterpart on the opposite side.
          missingGender = 'male';
          newParentX = existingParentX + parentDistance;
        } else {
          missingGender = 'female';
          newParentX = existingParentX - parentDistance;
        }

        const newParentId = addPerson({
          gender: missingGender,
          position: { x: newParentX, generation: parentGen }
        });
        addParent(selectedPersonId, newParentId);
        newParentIds.push(newParentId);
      }

      // Two parents already exist -> nothing to add.
      if (newParentIds.length > 0) {
        setExpandedPersons(prev => new Set([...prev, selectedPersonId, ...newParentIds]));
      }
      setSelectedPersonId(null);
    }
  };

  const handleAddSpouse = () => {
    if (selectedPersonId) {
      suppressAnchoringRef.current = true;
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

      const spouseGender: Person['gender'] = person.gender === 'male'
        ? 'female'
        : person.gender === 'female'
          ? 'male'
          : null;

      const spouseId = addPerson({
        gender: spouseGender,
        position: { x: spouseX, generation: personGen }
      });
      addSpouse(selectedPersonId, spouseId);
      // Only expand the selected person - spouse trees should stay collapsed by default
      setExpandedPersons(prev => new Set([...prev, selectedPersonId]));
      setSelectedPersonId(null);
    }
  };

  const createAutoSpouse = (personId: string) => {
    const person = familyTree.persons[personId];
    if (!person) return null;

    const personX = person.position?.x ?? 0;
    const personGen = person.position?.generation ?? FOCUS_GENERATION;
    const spouseX = person.gender === 'male'
      ? personX - PERSON_WIDTH - COUPLE_GAP
      : personX + PERSON_WIDTH + COUPLE_GAP;
    const spouseGender: Person['gender'] = person.gender === 'male'
      ? 'female'
      : person.gender === 'female'
        ? 'male'
        : null;

    const spouseId = addPerson({
      gender: spouseGender,
      position: { x: spouseX, generation: personGen }
    });
    const unionId = addSpouse(personId, spouseId);

    return { spouseId, spouseX, unionId };
  };

  const handleAddChild = () => {
    if (selectedPersonId) {
      suppressAnchoringRef.current = true;
      const person = familyTree.persons[selectedPersonId];
      if (!person) return;

      const personUnions = person.unionIds
        .map(id => familyTree.unions[id])
        .filter((union): union is Union => Boolean(union));
      const unionSignature = (union: Union) => (
        union.partnerIds
          .filter(partnerId => partnerId !== selectedPersonId)
          .slice()
          .sort()
          .join('|')
      );
      const dedupedUnionBySignature = new Map<string, Union>();
      personUnions.forEach(union => {
        const signature = unionSignature(union);
        const existing = dedupedUnionBySignature.get(signature);
        if (!existing || union.childIds.length > existing.childIds.length) {
          dedupedUnionBySignature.set(signature, union);
        }
      });
      const distinctPersonUnions = Array.from(dedupedUnionBySignature.values());

      if (distinctPersonUnions.length > 1) {
        setLinkMenuState({ personId: selectedPersonId, type: 'add-child' });
      } else {
        // Calculate child position based on parent's position
        const personX = person.position?.x ?? 0;
        const personGen = person.position?.generation ?? FOCUS_GENERATION;
        const childGen = personGen + 1;
        let union = distinctPersonUnions[0];
        let createdSpouseId: string | null = null;
        let createdSpouseX: number | null = null;
        let targetUnionId = union?.id;

        if (!union || union.partnerIds.length < 2) {
          const createdSpouse = createAutoSpouse(selectedPersonId);
          if (createdSpouse) {
            createdSpouseId = createdSpouse.spouseId;
            createdSpouseX = createdSpouse.spouseX;
            targetUnionId = createdSpouse.unionId ?? targetUnionId;
          }
        }

        // If there's a union with a partner, center the child between parents
        let childX = personX;
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
        } else if (createdSpouseX !== null) {
          childX = (personX + createdSpouseX) / 2;
        }

        const childId = addPerson({
          position: { x: childX, generation: childGen }
        });
        addChild(selectedPersonId, childId, targetUnionId);
        // Expand the selected person, optionally new spouse, and the new child.
        setExpandedPersons(prev => new Set([
          ...prev,
          selectedPersonId,
          childId,
          ...(createdSpouseId ? [createdSpouseId] : []),
        ]));
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
    if (selectedPersonId && window.confirm(copy.confirmDeletePerson)) {
      deletePerson(selectedPersonId);
      setSelectedPersonId(null);
    }
  };

  const getViewportRect = useCallback(() => {
    const viewport = window.visualViewport;
    return viewport
      ? {
          left: viewport.offsetLeft,
          top: viewport.offsetTop,
          right: viewport.offsetLeft + viewport.width,
          bottom: viewport.offsetTop + viewport.height,
          width: viewport.width,
          height: viewport.height,
        }
      : {
          left: 0,
          top: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
          width: window.innerWidth,
          height: window.innerHeight,
        };
  }, []);

  const getVisibleContainerRect = useCallback(() => {
    const viewportRect = getViewportRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return viewportRect;

    const left = Math.max(containerRect.left, viewportRect.left);
    const right = Math.min(containerRect.right, viewportRect.right);
    const top = Math.max(containerRect.top, viewportRect.top);
    const bottom = Math.min(containerRect.bottom, viewportRect.bottom);

    if (right <= left || bottom <= top) {
      return {
        left: containerRect.left,
        top: containerRect.top,
        right: containerRect.right,
        bottom: containerRect.bottom,
        width: containerRect.width,
        height: containerRect.height,
      };
    }

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }, [getViewportRect]);

  const getViewportCenter = useCallback(() => {
    const rect = getVisibleContainerRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, [getVisibleContainerRect]);

  const getCenteringPan = useCallback((
    personCenterX: number,
    personCenterY: number,
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    targetScale?: number,
  ) => {
    const treeWidth = bounds.maxX - bounds.minX;
    const treeHeight = bounds.maxY - bounds.minY;
    const origin = { x: treeWidth / 2, y: treeHeight / 2 };

    if (!containerRef.current || !treeRef.current) {
      return {
        x: origin.x - personCenterX,
        y: origin.y - personCenterY,
      };
    }

    const center = getViewportCenter();
    const treeRect = treeRef.current.getBoundingClientRect();
    const currentScale = scaleRef.current;
    const currentPan = panOffsetRef.current;
    const layoutOrigin = {
      x: treeRect.left - (1 - currentScale) * origin.x - currentScale * currentPan.x,
      y: treeRect.top - (1 - currentScale) * origin.y - currentScale * currentPan.y,
    };
    const effectiveScale = targetScale ?? currentScale;

    return {
      x: (center.x - layoutOrigin.x - origin.x) / effectiveScale - (personCenterX - origin.x),
      y: (center.y - layoutOrigin.y - origin.y) / effectiveScale - (personCenterY - origin.y),
    };
  }, [getViewportCenter]);

  const handleFitToScreen = useCallback(() => {
    if (!treeRef.current || !containerRef.current) return;

    const filtered = filteredElementsRef.current;
    const rawFitBounds = getLayoutBounds(filtered);
    const fitWidth = rawFitBounds.maxX - rawFitBounds.minX;
    const fitHeight = rawFitBounds.maxY - rawFitBounds.minY;
    if (fitWidth <= 0 || fitHeight <= 0) return;

    const visibleRect = getVisibleContainerRect();
    const minDim = Math.max(1, Math.min(visibleRect.width, visibleRect.height));
    const padding = Math.min(40, minDim * 0.05);
    const availableWidth = Math.max(1, visibleRect.width - padding * 2);
    const availableHeight = Math.max(1, visibleRect.height - padding * 2);

    let newScale = Math.min(availableWidth / fitWidth, availableHeight / fitHeight);
    newScale = Math.max(0.2, Math.min(1.2, newScale));

    // Canvas dimensions from allBounds (matches the tree-canvas element)
    const ab = allBoundsRef.current;
    const W = ab.maxX - ab.minX;
    const H = ab.maxY - ab.minY;
    const ox = W / 2;
    const oy = H / 2;

    // Filtered center in canvas coords
    const cx = (rawFitBounds.minX + rawFitBounds.maxX) / 2 - ab.minX;
    const cy = (rawFitBounds.minY + rawFitBounds.maxY) / 2 - ab.minY;

    // Element base position: flex container centers the tree element
    const contRect = containerRef.current.getBoundingClientRect();
    const elemBaseLeft = contRect.left + contRect.width / 2 - W / 2;
    const elemBaseTop = contRect.top + contRect.height / 2 - H / 2;

    // Viewport center
    const vcx = visibleRect.left + visibleRect.width / 2;
    const vcy = visibleRect.top + visibleRect.height / 2;

    // Solve: vcx = elemBaseLeft + ox + nS*(cx - ox + npx)
    // npx = (vcx - elemBaseLeft - ox) / nS - cx + ox
    const npx = (vcx - elemBaseLeft - ox) / newScale - cx + ox;
    const npy = (vcy - elemBaseTop - oy) / newScale - cy + oy;

    const nextPan = { x: npx, y: npy };
    scaleRef.current = newScale;
    panOffsetRef.current = nextPan;
    setScale(newScale);
    setPanOffset(nextPan);
  }, [getVisibleContainerRect]);

  const getPanForZoom = useCallback((nextScale: number, center: { x: number; y: number }) => {
    const tree = treeRef.current;
    if (!tree) return panOffsetRef.current;

    const currentScale = scaleRef.current;
    const currentPan = panOffsetRef.current;

    const origin = { x: tree.offsetWidth / 2, y: tree.offsetHeight / 2 };
    const rect = tree.getBoundingClientRect();
    const layoutOrigin = {
      x: rect.left - (1 - currentScale) * origin.x - currentScale * currentPan.x,
      y: rect.top - (1 - currentScale) * origin.y - currentScale * currentPan.y,
    };
    const worldPoint = {
      x: origin.x + (center.x - layoutOrigin.x - origin.x) / currentScale - currentPan.x,
      y: origin.y + (center.y - layoutOrigin.y - origin.y) / currentScale - currentPan.y,
    };

    return {
      x: (center.x - layoutOrigin.x - origin.x) / nextScale - (worldPoint.x - origin.x),
      y: (center.y - layoutOrigin.y - origin.y) / nextScale - (worldPoint.y - origin.y),
    };
  }, []);

  const applyZoom = useCallback((nextScale: number, center: { x: number; y: number }) => {
    const currentScale = scaleRef.current;
    const clampedScale = clampValue(nextScale, 0.2, 2);
    if (Math.abs(clampedScale - currentScale) <= 0.0001) return;

    const nextPan = getPanForZoom(clampedScale, center);
    scaleRef.current = clampedScale;
    panOffsetRef.current = nextPan;
    setScale(clampedScale);
    setPanOffset(nextPan);
  }, [getPanForZoom]);

  const zoomByFactor = useCallback((factor: number, center?: { x: number; y: number }) => {
    const currentScale = scaleRef.current;
    const targetScale = clampValue(currentScale * factor, 0.2, 2);
    if (Math.abs(targetScale - currentScale) <= 0.0001) return;
    applyZoom(targetScale, center ?? getViewportCenter());
  }, [applyZoom, getViewportCenter]);

  const handleZoomIn = useCallback(() => {
    zoomByFactor(KEYBOARD_ZOOM_FACTOR);
  }, [zoomByFactor]);

  const handleZoomOut = useCallback(() => {
    zoomByFactor(1 / KEYBOARD_ZOOM_FACTOR);
  }, [zoomByFactor]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isDesktopViewport = () => window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches;

    const handleCtrlWheelZoom = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      if (!isDesktopViewport()) return;
      if (event.cancelable) {
        event.preventDefault();
      }
      const factor = event.deltaY < 0 ? CTRL_WHEEL_ZOOM_FACTOR : 1 / CTRL_WHEEL_ZOOM_FACTOR;
      zoomByFactor(factor, { x: event.clientX, y: event.clientY });
    };

    const handleKeyboardZoom = (event: KeyboardEvent) => {
      if (!isDesktopViewport()) return;
      if (!event.ctrlKey && !event.metaKey) return;

      const plusPressed = event.key === '+' || event.key === '=' || event.key === 'Add';
      const minusPressed = event.key === '-' || event.key === '_' || event.key === 'Subtract';
      const resetPressed = event.key === '0';
      if (!plusPressed && !minusPressed && !resetPressed) return;

      if (event.cancelable) {
        event.preventDefault();
      }

      if (plusPressed) {
        zoomByFactor(KEYBOARD_ZOOM_FACTOR);
        return;
      }

      if (minusPressed) {
        zoomByFactor(1 / KEYBOARD_ZOOM_FACTOR);
        return;
      }

      handleFitToScreen();
    };

    window.addEventListener('wheel', handleCtrlWheelZoom, { passive: false });
    window.addEventListener('keydown', handleKeyboardZoom);
    return () => {
      window.removeEventListener('wheel', handleCtrlWheelZoom);
      window.removeEventListener('keydown', handleKeyboardZoom);
    };
  }, [handleFitToScreen, zoomByFactor]);

  // Panning handlers for the canvas
  const handleCanvasPointerDownCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size !== 2) return;
    if (!treeRef.current) return;

    const points = Array.from(activePointersRef.current.values());
    const startDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (startDistance <= 0) return;

    const origin = { x: treeRef.current.offsetWidth / 2, y: treeRef.current.offsetHeight / 2 };
    const rect = treeRef.current.getBoundingClientRect();
    const layoutOrigin = {
      x: rect.left - (1 - scale) * origin.x - scale * panOffset.x,
      y: rect.top - (1 - scale) * origin.y - scale * panOffset.y,
    };
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
    const worldPoint = {
      x: origin.x + (center.x - layoutOrigin.x - origin.x) / scale - panOffset.x,
      y: origin.y + (center.y - layoutOrigin.y - origin.y) / scale - panOffset.y,
    };

    pinchStateRef.current = {
      startDistance,
      startScale: scale,
      layoutOrigin,
      origin,
      worldPoint,
    };
    isPinchingRef.current = true;
    suppressTapRef.current = true;
    setIsPanning(false);
    panStartRef.current = null;
  }, [panOffset, scale]);

  const handleCanvasPointerMoveCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pinchState = pinchStateRef.current;
    if (!pinchState || activePointersRef.current.size < 2) return;

    const points = Array.from(activePointersRef.current.values());
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (pinchState.startDistance <= 0) return;

    const nextScale = clampValue(pinchState.startScale * (distance / pinchState.startDistance), 0.2, 2);
    const center = {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
    const nextPan = {
      x: (center.x - pinchState.layoutOrigin.x - pinchState.origin.x) / nextScale - (pinchState.worldPoint.x - pinchState.origin.x),
      y: (center.y - pinchState.layoutOrigin.y - pinchState.origin.y) / nextScale - (pinchState.worldPoint.y - pinchState.origin.y),
    };

    setScale(nextScale);
    setPanOffset(nextPan);
  }, []);

  const handleCanvasPointerUpCapture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);

    if (activePointersRef.current.size < 2) {
      pinchStateRef.current = null;
      isPinchingRef.current = false;
    }
    if (activePointersRef.current.size === 0) {
      suppressTapRef.current = false;
    }
  }, []);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only start panning if clicking directly on the canvas (not on a person card)
    if (isPinchingRef.current) return;
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
    if (isPinchingRef.current) return;

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
  }, [handleFitToScreen, focusedPersonId]);

  const registerPersonRef = (personId: string) => (element: HTMLDivElement | null) => {
    personRefs.current[personId] = element;
  };

  const registerSymbolRef = (unionId: string) => (element: HTMLDivElement | null) => {
    symbolRefs.current[unionId] = element;
  };

  // Build a deterministic, fully expanded, symmetric top-down tree layout.
  const { visibleElements, collapsedDownUnions, collapsedUpPersons, collapsedSidePersons } = useMemo(() => {
    const collapsedDownUnions = new Set<string>();
    const collapsedUpPersons = new Set<string>();
    const collapsedSidePersons = new Set<string>();

    const allExistingPersonIds = Object.keys(familyTree.persons);
    if (allExistingPersonIds.length === 0) {
      return { visibleElements: [], collapsedDownUnions, collapsedUpPersons, collapsedSidePersons };
    }

    const parseDatePart = (value: string | undefined, fallback: number) => {
      if (!value) return fallback;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const getBirthSortValue = (person?: Person) => {
      if (!person) return 99991231;
      const year = parseDatePart(person.birthDate?.year, 9999);
      const month = parseDatePart(person.birthDate?.month, 12);
      const day = parseDatePart(person.birthDate?.day, 31);
      return year * 10000 + month * 100 + day;
    };

    const getNameKey = (person?: Person) => {
      if (!person) return '';
      return `${person.lastName ?? ''}|${person.firstName ?? ''}`;
    };

    const comparePersonIds = (aId: string, bId: string) => {
      if (aId === bId) return 0;
      const personA = familyTree.persons[aId];
      const personB = familyTree.persons[bId];
      const dateDiff = getBirthSortValue(personA) - getBirthSortValue(personB);
      if (dateDiff !== 0) return dateDiff;
      const nameDiff = getNameKey(personA).localeCompare(getNameKey(personB));
      if (nameDiff !== 0) return nameDiff;
      return aId.localeCompare(bId);
    };

    const genderRank = (gender: Person['gender']) => {
      if (gender === 'female') return 0;
      if (gender === 'male') return 2;
      return 1;
    };

    const comparePartnerIds = (aId: string, bId: string) => {
      const personA = familyTree.persons[aId];
      const personB = familyTree.persons[bId];
      const rankDiff = genderRank(personA?.gender ?? null) - genderRank(personB?.gender ?? null);
      if (rankDiff !== 0) return rankDiff;
      return comparePersonIds(aId, bId);
    };

    // Canonicalize child membership so each person belongs to exactly one parent union.
    const canonicalParentUnionByPerson = new Map<string, string>();
    const listedUnionsByChild = new Map<string, string[]>();

    Object.values(familyTree.unions)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach(union => {
        union.childIds.forEach(childId => {
          if (!familyTree.persons[childId]) return;
          const existing = listedUnionsByChild.get(childId);
          if (existing) {
            if (!existing.includes(union.id)) {
              existing.push(union.id);
            }
          } else {
            listedUnionsByChild.set(childId, [union.id]);
          }
        });
      });

    Object.values(familyTree.persons).forEach(person => {
      const listed = listedUnionsByChild.get(person.id) ?? [];
      const preferredUnionId = person.parentUnionId && familyTree.unions[person.parentUnionId]
        ? person.parentUnionId
        : undefined;

      let chosenUnionId: string | undefined;
      if (preferredUnionId && listed.includes(preferredUnionId)) {
        chosenUnionId = preferredUnionId;
      } else if (listed.length > 0) {
        chosenUnionId = listed[0];
      } else if (preferredUnionId) {
        chosenUnionId = preferredUnionId;
      }

      if (chosenUnionId) {
        canonicalParentUnionByPerson.set(person.id, chosenUnionId);
      }
    });

    const effectiveChildIdsByUnion = new Map<string, string[]>();
    canonicalParentUnionByPerson.forEach((unionId, childId) => {
      if (!familyTree.unions[unionId]) return;
      const existing = effectiveChildIdsByUnion.get(unionId);
      if (existing) {
        existing.push(childId);
      } else {
        effectiveChildIdsByUnion.set(unionId, [childId]);
      }
    });
    effectiveChildIdsByUnion.forEach(childIds => childIds.sort(comparePersonIds));

    const getEffectiveChildIds = (union: Union) =>
      effectiveChildIdsByUnion.get(union.id) ?? [];

    const getSortedParentIds = (personId: string) => {
      const parentUnionId = canonicalParentUnionByPerson.get(personId);
      if (!parentUnionId) return [] as string[];

      const parentUnion = familyTree.unions[parentUnionId];
      if (!parentUnion) return [] as string[];

      return parentUnion.partnerIds
        .filter(parentId => Boolean(familyTree.persons[parentId]))
        .slice()
        .sort(comparePartnerIds);
    };

    const standalonePersonIds = allExistingPersonIds
      .filter(personId => {
        const person = familyTree.persons[personId];
        return Boolean(person) && person.unionIds.length === 0 && !canonicalParentUnionByPerson.has(personId);
      })
      .sort(comparePersonIds);
    const standalonePersonIdSet = new Set<string>(standalonePersonIds);

    const lineageExpandedPersonIds = new Set<string>();
    if (focusedPersonId && familyTree.persons[focusedPersonId]) {
      const seen = new Set<string>();
      let currentPersonId: string | null = focusedPersonId;

      while (currentPersonId && !seen.has(currentPersonId)) {
        seen.add(currentPersonId);
        lineageExpandedPersonIds.add(currentPersonId);

        const sortedParents = getSortedParentIds(currentPersonId);
        currentPersonId = sortedParents[0] ?? null;
      }
    }

    const expandedScopePersonIds = new Set<string>(expandedPersons);
    lineageExpandedPersonIds.forEach(personId => expandedScopePersonIds.add(personId));
    if (expandedScopePersonIds.size === 0 && allExistingPersonIds.length > 0) {
      expandedScopePersonIds.add(allExistingPersonIds[0]);
    }

    const collectDescendantIds = (rootIds: string[]) => {
      const descendants = new Set<string>();
      const visited = new Set<string>();
      const queue = rootIds.filter(rootId => Boolean(familyTree.persons[rootId]));

      while (queue.length > 0) {
        const currentPersonId = queue.shift()!;
        if (visited.has(currentPersonId)) continue;
        visited.add(currentPersonId);

        const currentPerson = familyTree.persons[currentPersonId];
        if (!currentPerson) continue;

        currentPerson.unionIds.forEach(unionId => {
          const union = familyTree.unions[unionId];
          if (!union) return;

          getEffectiveChildIds(union).forEach(childId => {
            if (!familyTree.persons[childId] || visited.has(childId)) return;
            descendants.add(childId);
            queue.push(childId);
          });
        });
      }

      return descendants;
    };

    const siblingCascadeExpandedPersonIds = new Set<string>();
    if (focusedPersonId && familyTree.persons[focusedPersonId]) {
      const focusedParentUnionId = canonicalParentUnionByPerson.get(focusedPersonId);
      const focusedParentUnion = focusedParentUnionId ? familyTree.unions[focusedParentUnionId] : undefined;

      if (focusedParentUnion) {
        const siblingIds = getEffectiveChildIds(focusedParentUnion)
          .filter(siblingId => siblingId !== focusedPersonId && Boolean(familyTree.persons[siblingId]));

        siblingIds.forEach(siblingId => siblingCascadeExpandedPersonIds.add(siblingId));
        collectDescendantIds(siblingIds).forEach(descendantId => siblingCascadeExpandedPersonIds.add(descendantId));
      }
    }
    siblingCascadeExpandedPersonIds.forEach(personId => expandedScopePersonIds.add(personId));
    const forceHideSpouseBranchesForPersonIds = new Set<string>(siblingCascadeExpandedPersonIds);

    const visiblePersonIds = new Set<string>();
    const visibleUnionIds = new Set<string>();

    const addVisiblePerson = (personId: string) => {
      if (!familyTree.persons[personId]) return;
      visiblePersonIds.add(personId);
    };

    const addVisibleUnion = (unionId: string) => {
      if (!familyTree.unions[unionId]) return;
      visibleUnionIds.add(unionId);
    };

    const includePersonBranch = (personId: string) => {
      const person = familyTree.persons[personId];
      if (!person) return;

      addVisiblePerson(personId);
      const hideSpouseBranchesForPerson = forceHideSpouseBranchesForPersonIds.has(personId);

      person.unionIds.forEach(unionId => {
        const union = familyTree.unions[unionId];
        if (!union) return;

        addVisibleUnion(union.id);
        union.partnerIds.forEach(partnerId => {
          if (!hideSpouseBranchesForPerson || partnerId === personId || expandedScopePersonIds.has(partnerId)) {
            addVisiblePerson(partnerId);
          }
        });
        getEffectiveChildIds(union).forEach(addVisiblePerson);
      });

      const parentUnionId = canonicalParentUnionByPerson.get(personId);
      if (!parentUnionId) return;

      const parentUnion = familyTree.unions[parentUnionId];
      if (!parentUnion) return;

      addVisibleUnion(parentUnion.id);
      parentUnion.partnerIds.forEach(addVisiblePerson);
      getEffectiveChildIds(parentUnion).forEach(addVisiblePerson);
    };

    expandedScopePersonIds.forEach(includePersonBranch);
    standalonePersonIds.forEach(addVisiblePerson);

    if (visiblePersonIds.size === 0 && allExistingPersonIds.length > 0) {
      visiblePersonIds.add(allExistingPersonIds[0]);
    }

    const layoutPersonIds = Array.from(visiblePersonIds)
      .filter(personId => !standalonePersonIdSet.has(personId))
      .sort(comparePersonIds);
    if (layoutPersonIds.length === 0 && standalonePersonIds.length === 0) {
      return { visibleElements: [], collapsedDownUnions, collapsedUpPersons, collapsedSidePersons };
    }

    // Union-find to keep spouses in the same generation band.
    const ufParent = new Map<string, string>();
    layoutPersonIds.forEach(personId => ufParent.set(personId, personId));

    const findGroup = (personId: string): string => {
      let root = ufParent.get(personId) ?? personId;
      while (root !== (ufParent.get(root) ?? root)) {
        root = ufParent.get(root) ?? root;
      }

      let current = personId;
      while (current !== root) {
        const next = ufParent.get(current) ?? current;
        ufParent.set(current, root);
        current = next;
      }

      return root;
    };

    const unionGroups = (aId: string, bId: string) => {
      const rootA = findGroup(aId);
      const rootB = findGroup(bId);
      if (rootA === rootB) return;
      if (rootA < rootB) {
        ufParent.set(rootB, rootA);
      } else {
        ufParent.set(rootA, rootB);
      }
    };

    Object.values(familyTree.unions).forEach(union => {
      const partners = union.partnerIds.filter(personId => visiblePersonIds.has(personId));
      if (partners.length < 2) return;
      const anchor = partners[0];
      partners.slice(1).forEach(partnerId => unionGroups(anchor, partnerId));
    });

    const allGroupIds = new Set<string>();
    layoutPersonIds.forEach(personId => {
      allGroupIds.add(findGroup(personId));
    });

    const childrenByGroup = new Map<string, Set<string>>();
    const indegreeByGroup = new Map<string, number>();
    allGroupIds.forEach(groupId => {
      childrenByGroup.set(groupId, new Set<string>());
      indegreeByGroup.set(groupId, 0);
    });

    const addGroupEdge = (fromGroupId: string, toGroupId: string) => {
      if (fromGroupId === toGroupId) return;
      const children = childrenByGroup.get(fromGroupId);
      if (!children || children.has(toGroupId)) return;
      children.add(toGroupId);
      indegreeByGroup.set(toGroupId, (indegreeByGroup.get(toGroupId) ?? 0) + 1);
    };

    Object.values(familyTree.unions).forEach(union => {
      const parentGroups = Array.from(new Set(
        union.partnerIds
          .filter(personId => visiblePersonIds.has(personId))
          .map(partnerId => findGroup(partnerId))
      ));
      if (parentGroups.length === 0) return;

      const children = getEffectiveChildIds(union).filter(childId => visiblePersonIds.has(childId));
      children.forEach(childId => {
        const childGroupId = findGroup(childId);
        parentGroups.forEach(parentGroupId => addGroupEdge(parentGroupId, childGroupId));
      });
    });

    const generationByGroup = new Map<string, number>();
    allGroupIds.forEach(groupId => generationByGroup.set(groupId, 0));

    const queue = Array.from(allGroupIds)
      .filter(groupId => (indegreeByGroup.get(groupId) ?? 0) === 0)
      .sort((a, b) => a.localeCompare(b));

    let processedGroups = 0;
    while (queue.length > 0) {
      const groupId = queue.shift()!;
      processedGroups += 1;
      const groupGeneration = generationByGroup.get(groupId) ?? 0;

      (childrenByGroup.get(groupId) ?? new Set<string>()).forEach(childGroupId => {
        const currentChildGeneration = generationByGroup.get(childGroupId) ?? 0;
        if (currentChildGeneration < groupGeneration + 1) {
          generationByGroup.set(childGroupId, groupGeneration + 1);
        }

        const nextIndegree = (indegreeByGroup.get(childGroupId) ?? 0) - 1;
        indegreeByGroup.set(childGroupId, nextIndegree);
        if (nextIndegree === 0) {
          queue.push(childGroupId);
          queue.sort((a, b) => a.localeCompare(b));
        }
      });
    }

    // Fallback relaxation if constraints contain a cycle.
    if (processedGroups < allGroupIds.size) {
      const edges: Array<{ from: string; to: string }> = [];
      childrenByGroup.forEach((children, fromGroupId) => {
        children.forEach(toGroupId => edges.push({ from: fromGroupId, to: toGroupId }));
      });

      for (let pass = 0; pass < allGroupIds.size; pass += 1) {
        let changed = false;
        edges.forEach(({ from, to }) => {
          const fromGeneration = generationByGroup.get(from) ?? 0;
          const toGeneration = generationByGroup.get(to) ?? 0;
          if (toGeneration < fromGeneration + 1) {
            generationByGroup.set(to, fromGeneration + 1);
            changed = true;
          }
        });
        if (!changed) break;
      }
    }

    // Tighten generations so parents stay as close as possible above children.
    // This prevents sparse gaps when one spouse subtree is much deeper than the other.
    const groupIdList = Array.from(allGroupIds);
    for (let pass = 0; pass < groupIdList.length; pass += 1) {
      let changed = false;
      groupIdList.forEach(groupId => {
        const childGroups = childrenByGroup.get(groupId);
        if (!childGroups || childGroups.size === 0) return;

        let maxAllowedGeneration = Number.POSITIVE_INFINITY;
        childGroups.forEach(childGroupId => {
          const childGeneration = generationByGroup.get(childGroupId) ?? 0;
          maxAllowedGeneration = Math.min(maxAllowedGeneration, childGeneration - 1);
        });
        if (!Number.isFinite(maxAllowedGeneration)) return;

        const currentGeneration = generationByGroup.get(groupId) ?? 0;
        if (currentGeneration < maxAllowedGeneration) {
          generationByGroup.set(groupId, maxAllowedGeneration);
          changed = true;
        }
      });
      if (!changed) break;
    }

    const minGeneration = Math.min(...Array.from(generationByGroup.values()));
    if (Number.isFinite(minGeneration) && minGeneration !== 0) {
      generationByGroup.forEach((generation, groupId) => {
        generationByGroup.set(groupId, generation - minGeneration);
      });
    }

    const generationByPerson = new Map<string, number>();
    layoutPersonIds.forEach(personId => {
      generationByPerson.set(personId, generationByGroup.get(findGroup(personId)) ?? 0);
    });

    const generations = Array.from(new Set(Array.from(generationByPerson.values()))).sort((a, b) => a - b);
    const personsByGeneration = new Map<number, string[]>();
    generations.forEach(generation => personsByGeneration.set(generation, []));
    layoutPersonIds.forEach(personId => {
      const generation = generationByPerson.get(personId) ?? 0;
      const arr = personsByGeneration.get(generation);
      if (arr) {
        arr.push(personId);
      } else {
        personsByGeneration.set(generation, [personId]);
      }
    });
    personsByGeneration.forEach(arr => arr.sort(comparePersonIds));

    const sharesUnion = (leftPersonId: string, rightPersonId: string) => {
      const left = familyTree.persons[leftPersonId];
      if (!left) return false;
      return left.unionIds.some(unionId => {
        const union = familyTree.unions[unionId];
        return Boolean(union && union.partnerIds.includes(rightPersonId));
      });
    };

    const positionedPersons = new Map<string, { x: number; y: number; generation: number }>();

    type GenerationUnit = {
      members: string[];
      gaps: number[];
      width: number;
      targetX: number;
      left: number;
      sortKey: string;
    };

    const getLayoutScore = (order: string[], edges: Array<{ a: string; b: string }>) => {
      const indexById = new Map<string, number>();
      order.forEach((personId, index) => indexById.set(personId, index));
      return edges.reduce((sum, edge) => {
        const aIndex = indexById.get(edge.a);
        const bIndex = indexById.get(edge.b);
        if (aIndex === undefined || bIndex === undefined) return sum;
        return sum + Math.abs(aIndex - bIndex);
      }, 0);
    };

    const optimizeMemberOrder = (
      baseOrder: string[],
      edges: Array<{ a: string; b: string }>,
      canSwapAdjacent?: (leftId: string, rightId: string) => boolean
    ) => {
      if (baseOrder.length < 3 || edges.length === 0) return baseOrder;
      const order = baseOrder.slice();
      let bestScore = getLayoutScore(order, edges);

      for (let pass = 0; pass < 24; pass += 1) {
        let improved = false;
        for (let index = 0; index < order.length - 1; index += 1) {
          const leftId = order[index];
          const rightId = order[index + 1];
          if (canSwapAdjacent && !canSwapAdjacent(leftId, rightId)) {
            continue;
          }

          const swapped = order.slice();
          const temp = swapped[index];
          swapped[index] = swapped[index + 1];
          swapped[index + 1] = temp;
          const score = getLayoutScore(swapped, edges);
          if (score < bestScore) {
            bestScore = score;
            order[index] = swapped[index];
            order[index + 1] = swapped[index + 1];
            improved = true;
          }
        }
        if (!improved) break;
      }

      return order;
    };

    generations.forEach(generation => {
      const personsInGeneration = (personsByGeneration.get(generation) ?? []).slice().sort(comparePersonIds);
      if (personsInGeneration.length === 0) return;

      const personSet = new Set(personsInGeneration);
      const spouseGraph = new Map<string, Set<string>>();
      personsInGeneration.forEach(personId => spouseGraph.set(personId, new Set<string>()));
      const parentTargetByPerson = new Map<string, number>();
      const ANCHOR_EPSILON = 0.5;

      personsInGeneration.forEach(personId => {
        const parentUnionId = canonicalParentUnionByPerson.get(personId);
        if (!parentUnionId) return;
        const parentUnion = familyTree.unions[parentUnionId];
        if (!parentUnion) return;

        const parentXs = parentUnion.partnerIds
          .map(parentId => positionedPersons.get(parentId)?.x)
          .filter((x): x is number => x !== undefined);
        if (parentXs.length === 0) return;

        const targetX = parentXs.reduce((sum, x) => sum + x, 0) / parentXs.length;
        parentTargetByPerson.set(personId, targetX);
      });

      Object.values(familyTree.unions).forEach(union => {
        const partners = union.partnerIds.filter(partnerId => personSet.has(partnerId));
        if (partners.length < 2) return;
        for (let i = 0; i < partners.length; i += 1) {
          for (let j = i + 1; j < partners.length; j += 1) {
            spouseGraph.get(partners[i])?.add(partners[j]);
            spouseGraph.get(partners[j])?.add(partners[i]);
          }
        }
      });

      const components: string[][] = [];
      const visited = new Set<string>();

      personsInGeneration.forEach(startPersonId => {
        if (visited.has(startPersonId)) return;
        const queue = [startPersonId];
        const component: string[] = [];
        visited.add(startPersonId);

        while (queue.length > 0) {
          const personId = queue.shift()!;
          component.push(personId);
          (spouseGraph.get(personId) ?? new Set<string>()).forEach(neighborId => {
            if (visited.has(neighborId)) return;
            visited.add(neighborId);
            queue.push(neighborId);
          });
        }

        components.push(component);
      });

      const units: GenerationUnit[] = components.map(componentMembers => {
        const members = componentMembers.slice().sort((aId, bId) => {
          const aTarget = parentTargetByPerson.get(aId);
          const bTarget = parentTargetByPerson.get(bId);
          const aAnchored = Number.isFinite(aTarget);
          const bAnchored = Number.isFinite(bTarget);

          if (
            aAnchored &&
            bAnchored &&
            Math.abs((aTarget ?? 0) - (bTarget ?? 0)) > ANCHOR_EPSILON
          ) {
            return (aTarget ?? 0) - (bTarget ?? 0);
          }
          if (aAnchored !== bAnchored) {
            return aAnchored ? -1 : 1;
          }
          return aAnchored && bAnchored ? comparePersonIds(aId, bId) : comparePartnerIds(aId, bId);
        });
        const memberSet = new Set(members);
        const edges: Array<{ a: string; b: string }> = [];
        members.forEach(memberId => {
          (spouseGraph.get(memberId) ?? new Set<string>()).forEach(neighborId => {
            if (!memberSet.has(neighborId)) return;
            if (memberId < neighborId) {
              edges.push({ a: memberId, b: neighborId });
            }
          });
        });

        const optimizedMembers = optimizeMemberOrder(
          members,
          edges,
          (leftId, rightId) => {
            const leftTarget = parentTargetByPerson.get(leftId);
            const rightTarget = parentTargetByPerson.get(rightId);
            const leftAnchored = Number.isFinite(leftTarget);
            const rightAnchored = Number.isFinite(rightTarget);

            if (leftAnchored !== rightAnchored) {
              return false;
            }

            if (
              leftAnchored &&
              rightAnchored &&
              Math.abs((leftTarget ?? 0) - (rightTarget ?? 0)) > ANCHOR_EPSILON
            ) {
              return false;
            }

            return true;
          }
        );
        const gaps = optimizedMembers.slice(0, -1).map((leftId, index) => {
          const rightId = optimizedMembers[index + 1];
          return sharesUnion(leftId, rightId) ? COUPLE_GAP : SIBLING_GAP;
        });
        const width = optimizedMembers.length * PERSON_WIDTH + gaps.reduce((sum, gap) => sum + gap, 0);

        const parentTargets: number[] = [];
        optimizedMembers.forEach(memberId => {
          const targetX = parentTargetByPerson.get(memberId);
          if (targetX === undefined) return;
          parentTargets.push(targetX);
        });

        return {
          members: optimizedMembers,
          gaps,
          width,
          targetX: parentTargets.length > 0
            ? parentTargets.reduce((sum, x) => sum + x, 0) / parentTargets.length
            : Number.NaN,
          left: 0,
          sortKey: optimizedMembers[0] ?? '',
        };
      });

      const anchoredUnits = units.filter(unit => Number.isFinite(unit.targetX));
      const floatingUnits = units.filter(unit => !Number.isFinite(unit.targetX));
      floatingUnits.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      if (floatingUnits.length > 0) {
        const floatingSpacing = PERSON_WIDTH + SIBLING_GAP;
        const floatingWidth = (floatingUnits.length - 1) * floatingSpacing;
        const anchorCenter = anchoredUnits.length > 0
          ? anchoredUnits.reduce((sum, unit) => sum + unit.targetX, 0) / anchoredUnits.length
          : 0;
        const startX = anchorCenter - floatingWidth / 2;
        floatingUnits.forEach((unit, index) => {
          unit.targetX = startX + index * floatingSpacing;
        });
      }

      units.sort((a, b) => {
        if (a.targetX !== b.targetX) return a.targetX - b.targetX;
        return a.sortKey.localeCompare(b.sortKey);
      });

      let cursorLeft = Number.NEGATIVE_INFINITY;
      units.forEach(unit => {
        const baselineLeft = unit.targetX - unit.width / 2;
        const left = Math.max(baselineLeft, cursorLeft);
        unit.left = left;
        cursorLeft = left + unit.width + SIBLING_GAP;
      });

      if (units.length > 0) {
        const minLeft = Math.min(...units.map(unit => unit.left));
        const maxRight = Math.max(...units.map(unit => unit.left + unit.width));
        const currentCenter = (minLeft + maxRight) / 2;
        const targetCenter = units.reduce((sum, unit) => sum + unit.targetX, 0) / units.length;
        const centerShift = targetCenter - currentCenter;
        units.forEach(unit => {
          unit.left += centerShift;
        });
      }

      const y = generation * GENERATION_GAP;
      units.forEach(unit => {
        let memberCursor = unit.left;
        unit.members.forEach((memberId, index) => {
          const x = memberCursor + PERSON_WIDTH / 2;
          positionedPersons.set(memberId, { x, y, generation });
          memberCursor += PERSON_WIDTH;
          if (index < unit.gaps.length) {
            memberCursor += unit.gaps[index];
          }
        });
      });
    });

    const connectedPersonEntries = Array.from(positionedPersons.entries())
      .filter(([personId]) => !standalonePersonIdSet.has(personId));
    if (connectedPersonEntries.length > 0) {
      const minX = Math.min(...connectedPersonEntries.map(([, pos]) => pos.x));
      const maxX = Math.max(...connectedPersonEntries.map(([, pos]) => pos.x));
      const centerX = (minX + maxX) / 2;
      connectedPersonEntries.forEach(([, pos]) => {
        pos.x -= centerX;
      });
    }

    const positionedUnions = new Map<string, { x: number; y: number; generation: number }>();
    Object.values(familyTree.unions).forEach(union => {
      const partnerPositions = union.partnerIds
        .map(partnerId => positionedPersons.get(partnerId))
        .filter(Boolean) as { x: number; y: number; generation: number }[];
      if (partnerPositions.length === 0) return;

      const visibleChildren = getEffectiveChildIds(union).filter(childId => positionedPersons.has(childId));
      if (partnerPositions.length === 1 && visibleChildren.length === 0) return;

      const unionGeneration = partnerPositions[0].generation;
      const symbolX = partnerPositions.reduce((sum, pos) => sum + pos.x, 0) / partnerPositions.length;
      const symbolY = partnerPositions.length === 1
        ? unionGeneration * GENERATION_GAP + SINGLE_PARENT_SYMBOL_TOP_OFFSET
        : unionGeneration * GENERATION_GAP + AVATAR_VISUAL_CENTER - SYMBOL_SIZE / 2;

      positionedUnions.set(union.id, {
        x: symbolX,
        y: symbolY,
        generation: unionGeneration,
      });
    });

    Object.values(familyTree.unions).forEach(union => {
      const visiblePartners = union.partnerIds.filter(partnerId => visiblePersonIds.has(partnerId));
      const visibleChildren = getEffectiveChildIds(union).filter(childId => visiblePersonIds.has(childId));
      if (visiblePartners.length >= 2 || (visiblePartners.length >= 1 && visibleChildren.length > 0)) {
        addVisibleUnion(union.id);
      }
    });

    visiblePersonIds.forEach(personId => {
      const person = familyTree.persons[personId];
      if (!person) return;

      // Only treat direct hidden parents as "expand up" for this person.
      // This avoids showing a false up-indicator when the local upper branch is already open.
      const parentIds = getSortedParentIds(personId);
      const hasHiddenDirectParent = parentIds.some(parentId => !visiblePersonIds.has(parentId));
      if (hasHiddenDirectParent) {
        collapsedUpPersons.add(personId);
      }

      person.unionIds.forEach(unionId => {
        const union = familyTree.unions[unionId];
        if (!union) return;

        const hideSpouseBranchesForPerson = forceHideSpouseBranchesForPersonIds.has(personId);
        const hasHiddenPartner = union.partnerIds
          .filter(partnerId => Boolean(familyTree.persons[partnerId]))
          .some(partnerId => !visiblePersonIds.has(partnerId));
        if (hasHiddenPartner && !hideSpouseBranchesForPerson) {
          collapsedSidePersons.add(personId);
        }

        const hasHiddenChild = getEffectiveChildIds(union)
          .filter(childId => Boolean(familyTree.persons[childId]))
          .some(childId => !visiblePersonIds.has(childId));
        if (hasHiddenChild) {
          collapsedDownUnions.add(union.id);
        }
      });
    });

    if (standalonePersonIds.length > 0) {
      const connectedPositions = Array.from(positionedPersons.entries())
        .filter(([personId]) => !standalonePersonIdSet.has(personId))
        .map(([, pos]) => pos);

      const hasConnectedLayout = connectedPositions.length > 0;
      const mainMinY = hasConnectedLayout
        ? Math.min(...connectedPositions.map(pos => pos.y))
        : 0;
      const mainMaxY = hasConnectedLayout
        ? Math.max(...connectedPositions.map(pos => pos.y + PERSON_HEIGHT))
        : PERSON_HEIGHT;
      const sharedMidY = (mainMinY + mainMaxY) / 2;
      const standaloneTopY = sharedMidY - PERSON_HEIGHT / 2;

      const standaloneStartX = hasConnectedLayout
        ? Math.max(...connectedPositions.map(pos => pos.x)) + STANDALONE_TREE_GAP
        : -((standalonePersonIds.length - 1) * STANDALONE_TREE_SPACING) / 2;

      const standaloneGeneration = hasConnectedLayout
        ? Math.round(
            connectedPositions.reduce((sum, pos) => sum + pos.generation, 0)
            / connectedPositions.length
          )
        : 0;

      standalonePersonIds.forEach((personId, index) => {
        positionedPersons.set(personId, {
          x: standaloneStartX + index * STANDALONE_TREE_SPACING,
          y: standaloneTopY,
          generation: standaloneGeneration,
        });
      });
    }

    const elements: PositionedElement[] = [];
    positionedPersons.forEach((pos, personId) => {
      if (!visiblePersonIds.has(personId)) return;
      elements.push({ type: 'person', id: personId, x: pos.x, y: pos.y, generation: pos.generation });
    });
    positionedUnions.forEach((pos, unionId) => {
      if (!visibleUnionIds.has(unionId)) return;
      elements.push({
        type: 'union-symbol',
        id: unionId,
        x: pos.x,
        y: pos.y,
        generation: pos.generation,
        unionId,
      });
    });

    elements.sort((a, b) => {
      if (a.generation !== b.generation) return a.generation - b.generation;
      if (a.x !== b.x) return a.x - b.x;
      if (a.type !== b.type) return a.type === 'union-symbol' ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    return { visibleElements: elements, collapsedDownUnions, collapsedUpPersons, collapsedSidePersons };
  }, [expandedPersons, familyTree, focusedPersonId]);

  useEffect(() => {
    const nextVisible = new Set<string>();
    visibleElements.forEach(element => {
      if (element.type === 'person') {
        nextVisible.add(element.id);
      }
    });
    previousVisibleIdsRef.current = nextVisible;
  }, [visibleElements]);

  // Center after layout updates. For expand actions, delay until node transitions are done.
  useEffect(() => {
    if (!pendingCenterRef.current) return;
    if (!focusedPersonId) return;
    const focusedElement = visibleElements.find(el => el.type === 'person' && el.id === focusedPersonId);
    if (!focusedElement) {
      pendingCenterRef.current = false;
      pendingCenterDelayRef.current = 0;
      return;
    }

    if (pendingCenterTimerRef.current !== null) {
      window.clearTimeout(pendingCenterTimerRef.current);
      pendingCenterTimerRef.current = null;
    }

    pendingCenterTimerRef.current = window.setTimeout(() => {
      const currentFocusedElement = visibleElements.find(el => el.type === 'person' && el.id === focusedPersonId);
      if (!currentFocusedElement) {
        pendingCenterRef.current = false;
        pendingCenterDelayRef.current = 0;
        return;
      }

      const nextBounds = getLayoutBounds(visibleElements);
      const offsetX = -nextBounds.minX;
      const offsetY = -nextBounds.minY;
      const personCenterX = currentFocusedElement.x + offsetX;
      const personCenterY = currentFocusedElement.y + offsetY + PERSON_HEIGHT / 2;
      const nextPan = getCenteringPan(personCenterX, personCenterY, nextBounds);

      setPanOffset(nextPan);
      pendingCenterRef.current = false;
      pendingCenterDelayRef.current = 0;
      pendingCenterTimerRef.current = null;
    }, pendingCenterDelayRef.current);
  }, [visibleElements, focusedPersonId, getCenteringPan]);

  // Save positions for new persons and for enforced layout groups
  useEffect(() => {
    if (!familyTree) return;

    const personsToUpdate: { id: string; x: number; generation: number }[] = [];
    const POSITION_TOLERANCE = 0.5;
    const resetAnchoring = suppressAnchoringRef.current;

    // First, save positions for persons without saved positions
    visibleElements.forEach(element => {
      if (element.type !== 'person') return;
      const person = familyTree.persons[element.id];
      if (!person) return;

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

    if (resetAnchoring) {
      suppressAnchoringRef.current = false;
    }
  }, [familyTree, visibleElements, updatePerson]);

  const {
    filteredElements,
    generationFilteredUpPersons,
    generationFilteredDownPersons,
  } = useMemo(() => {
    const emptyResult = {
      filteredElements: visibleElements,
      generationFilteredUpPersons: new Set<string>(),
      generationFilteredDownPersons: new Set<string>(),
    };

    if (generationFilter === null) return emptyResult;

    const personGens = new Map<string, number>();
    visibleElements.forEach(el => {
      if (el.type === 'person') personGens.set(el.id, el.generation);
    });

    if (personGens.size === 0) return emptyResult;

    const canonicalParentUnionByPerson = new Map<string, string>();
    const listedUnionsByChild = new Map<string, string[]>();

    Object.values(familyTree.unions)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach(union => {
        union.childIds.forEach(childId => {
          if (!familyTree.persons[childId]) return;
          const existing = listedUnionsByChild.get(childId);
          if (existing) {
            if (!existing.includes(union.id)) {
              existing.push(union.id);
            }
          } else {
            listedUnionsByChild.set(childId, [union.id]);
          }
        });
      });

    Object.values(familyTree.persons).forEach(person => {
      const listed = listedUnionsByChild.get(person.id) ?? [];
      const preferredUnionId = person.parentUnionId && familyTree.unions[person.parentUnionId]
        ? person.parentUnionId
        : undefined;

      let chosenUnionId: string | undefined;
      if (preferredUnionId && listed.includes(preferredUnionId)) {
        chosenUnionId = preferredUnionId;
      } else if (listed.length > 0) {
        chosenUnionId = listed[0];
      } else if (preferredUnionId) {
        chosenUnionId = preferredUnionId;
      }

      if (chosenUnionId) {
        canonicalParentUnionByPerson.set(person.id, chosenUnionId);
      }
    });

    const standalonePersonIds = new Set<string>(
      Array.from(personGens.keys()).filter(personId => {
        const person = familyTree.persons[personId];
        if (!person) return false;
        return person.unionIds.length === 0 && !canonicalParentUnionByPerson.has(personId);
      })
    );

    const allGens = Array.from(new Set(personGens.values())).sort((a, b) => a - b);
    const nonStandaloneGens = Array.from(
      new Set(
        Array.from(personGens.entries())
          .filter(([personId]) => !standalonePersonIds.has(personId))
          .map(([, generation]) => generation)
      )
    ).sort((a, b) => a - b);
    const gensForRange = nonStandaloneGens.length > 0 ? nonStandaloneGens : allGens;
    const fallbackCenterGen = gensForRange[Math.floor((gensForRange.length - 1) / 2)];
    const centerGeneration = focusedPersonId && personGens.has(focusedPersonId) && !standalonePersonIds.has(focusedPersonId)
      ? personGens.get(focusedPersonId)!
      : fallbackCenterGen;

    // n generations => focused generation +/- n (e.g. 1 => 3 visible generations)
    const allowedGens = new Set<number>(
      gensForRange.filter(generation => Math.abs(generation - centerGeneration) <= generationFilter)
    );

    const canonicalChildIdsByUnion = new Map<string, string[]>();
    canonicalParentUnionByPerson.forEach((unionId, childId) => {
      if (!familyTree.unions[unionId]) return;
      const existing = canonicalChildIdsByUnion.get(unionId);
      if (existing) {
        existing.push(childId);
      } else {
        canonicalChildIdsByUnion.set(unionId, [childId]);
      }
    });

    const nextFilteredElements = visibleElements.filter(el => {
      if (el.type === 'person' && standalonePersonIds.has(el.id)) {
        return true;
      }
      return allowedGens.has(el.generation);
    });
    const filteredPersonIds = new Set<string>();
    nextFilteredElements.forEach(el => {
      if (el.type === 'person') filteredPersonIds.add(el.id);
    });

    const generationFilteredUp = new Set<string>();
    const generationFilteredDown = new Set<string>();

    filteredPersonIds.forEach(personId => {
      const person = familyTree.persons[personId];
      if (!person) return;
      if (standalonePersonIds.has(personId)) return;

      const parentUnionIds = new Set<string>();
      const canonicalParentUnionId = canonicalParentUnionByPerson.get(personId);
      if (canonicalParentUnionId && familyTree.unions[canonicalParentUnionId]) {
        parentUnionIds.add(canonicalParentUnionId);
      }

      const hasFilteredParents = Array.from(parentUnionIds).some(parentUnionId => {
        const parentUnion = familyTree.unions[parentUnionId];
        if (!parentUnion) return false;
        return parentUnion.partnerIds.some(parentId => {
          const parentGeneration = personGens.get(parentId);
          return parentGeneration !== undefined && !allowedGens.has(parentGeneration);
        });
      });
      if (hasFilteredParents) {
        generationFilteredUp.add(personId);
      }

      const hasFilteredChildren = person.unionIds.some(unionId => {
        const union = familyTree.unions[unionId];
        if (!union) return false;

        const childIds = canonicalChildIdsByUnion.get(union.id) ?? [];

        return childIds.some(childId => {
          const childGeneration = personGens.get(childId);
          return childGeneration !== undefined && !allowedGens.has(childGeneration);
        });
      });
      if (hasFilteredChildren) {
        generationFilteredDown.add(personId);
      }
    });

    return {
      filteredElements: nextFilteredElements,
      generationFilteredUpPersons: generationFilteredUp,
      generationFilteredDownPersons: generationFilteredDown,
    };
  }, [visibleElements, generationFilter, focusedPersonId, familyTree.persons, familyTree.unions]);
  filteredElementsRef.current = filteredElements;

  const visiblePersonGenerationById = useMemo(() => {
    const generations = new Map<string, number>();
    visibleElements.forEach(element => {
      if (element.type === 'person') {
        generations.set(element.id, element.generation);
      }
    });
    return generations;
  }, [visibleElements]);

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
        const canonicalChildren = Object.values(familyTree.persons)
          .filter(candidate => candidate.parentUnionId === union.id)
          .map(candidate => candidate.id);
        if (canonicalChildren.length > 0) {
          canonicalChildren.forEach(childId => personIds.add(childId));
        } else {
          union.childIds.forEach(childId => personIds.add(childId));
        }
      }
    });

    personIds.add(personId);
    return { personIds, unionIds };
  }, [familyTree]);

  // Store the target screen position of a person before a layout change.
  const anchorPersonRef = useRef<{ personId: string; screenX: number; screenY: number } | null>(null);

  const centerPersonInView = (personId: string) => {
    if (pendingCenterTimerRef.current !== null) {
      window.clearTimeout(pendingCenterTimerRef.current);
      pendingCenterTimerRef.current = null;
    }
    pendingCenterRef.current = false;
    pendingCenterDelayRef.current = 0;

    const target = visibleElements.find(el => el.type === 'person' && el.id === personId);
    if (!target) return;

    const nextBounds = getLayoutBounds(visibleElements);
    const offsetX = -nextBounds.minX;
    const offsetY = -nextBounds.minY;
    const personCenterX = target.x + offsetX;
    const personCenterY = target.y + offsetY + PERSON_HEIGHT / 2;
    const nextPan = getCenteringPan(personCenterX, personCenterY, nextBounds);

    setPanOffset(nextPan);
  };

  const getDescendantIds = useCallback((rootPersonId: string) => {
    const descendants = new Set<string>();
    const visited = new Set<string>([rootPersonId]);
    const queue: string[] = [rootPersonId];

    while (queue.length > 0) {
      const currentPersonId = queue.shift()!;
      const currentPerson = familyTree.persons[currentPersonId];
      if (!currentPerson) continue;

      currentPerson.unionIds.forEach(unionId => {
        const union = familyTree.unions[unionId];
        if (!union) return;

        union.childIds.forEach(childId => {
          if (!familyTree.persons[childId] || visited.has(childId)) return;
          visited.add(childId);
          descendants.add(childId);
          queue.push(childId);
        });
      });
    }

    return descendants;
  }, [familyTree]);

  const getAncestorBranchIds = useCallback((startPersonId: string) => {
    const branchIds = new Set<string>();
    const ancestorQueue: string[] = [startPersonId];
    const visitedAncestors = new Set<string>();

    while (ancestorQueue.length > 0) {
      const currentPersonId = ancestorQueue.shift()!;
      if (visitedAncestors.has(currentPersonId)) continue;
      visitedAncestors.add(currentPersonId);

      const currentPerson = familyTree.persons[currentPersonId];
      if (!currentPerson?.parentUnionId) continue;

      const parentUnion = familyTree.unions[currentPerson.parentUnionId];
      if (!parentUnion) continue;

      parentUnion.partnerIds.forEach(parentId => {
        if (!familyTree.persons[parentId]) return;
        branchIds.add(parentId);
        ancestorQueue.push(parentId);
      });

      parentUnion.childIds.forEach(siblingId => {
        if (!familyTree.persons[siblingId]) return;
        branchIds.add(siblingId);
        getDescendantIds(siblingId).forEach(descendantId => branchIds.add(descendantId));
      });
    }

    return branchIds;
  }, [familyTree, getDescendantIds]);

  const getSpouseComponentIds = useCallback((startPersonId: string) => {
    const component = new Set<string>();
    const queue: string[] = [startPersonId];

    while (queue.length > 0) {
      const currentPersonId = queue.shift()!;
      if (component.has(currentPersonId) || !familyTree.persons[currentPersonId]) continue;
      component.add(currentPersonId);

      const currentPerson = familyTree.persons[currentPersonId];
      currentPerson.unionIds.forEach(unionId => {
        const union = familyTree.unions[unionId];
        if (!union) return;

        union.partnerIds.forEach(partnerId => {
          if (!familyTree.persons[partnerId] || component.has(partnerId)) return;
          queue.push(partnerId);
        });
      });
    }

    return component;
  }, [familyTree]);

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

  const getPersonExpandState = useCallback((personId: string) => {
    const person = familyTree.persons[personId];
    if (!person) {
      return {
        hasHiddenParents: false,
        hasHiddenChildren: false,
        hasHiddenSpouses: false,
        canBeExpanded: false,
      };
    }

    const hasHiddenParentsByCollapsedTree = collapsedUpPersons.has(personId);
    const hasHiddenChildrenByCollapsedTree = person.unionIds.some(unionId => collapsedDownUnions.has(unionId));
    const hasHiddenSpouses = collapsedSidePersons.has(personId);

    const personGeneration = visiblePersonGenerationById.get(personId);
    const focusedGeneration = focusedPersonId ? visiblePersonGenerationById.get(focusedPersonId) : undefined;
    const canShiftGenerationWindow = generationFilter !== null
      && (
        !focusedPersonId
        || personGeneration === undefined
        || focusedGeneration === undefined
        || personGeneration !== focusedGeneration
      );

    const hasHiddenParentsByGenerationFilter = generationFilteredUpPersons.has(personId) && canShiftGenerationWindow;
    const hasHiddenChildrenByGenerationFilter = generationFilteredDownPersons.has(personId) && canShiftGenerationWindow;

    const hasHiddenParents = hasHiddenParentsByCollapsedTree || hasHiddenParentsByGenerationFilter;
    const hasHiddenChildren = hasHiddenChildrenByCollapsedTree || hasHiddenChildrenByGenerationFilter;
    const canBeExpanded = hasHiddenParents || hasHiddenChildren || hasHiddenSpouses;

    return {
      hasHiddenParents,
      hasHiddenChildren,
      hasHiddenSpouses,
      canBeExpanded,
    };
  }, [
    familyTree.persons,
    collapsedUpPersons,
    collapsedDownUnions,
    collapsedSidePersons,
    visiblePersonGenerationById,
    focusedPersonId,
    generationFilter,
    generationFilteredUpPersons,
    generationFilteredDownPersons,
  ]);

  const handlePersonSelection = (personId: string) => {
    if (!familyTree.persons[personId]) return;
    const { canBeExpanded: hasHiddenContent } = getPersonExpandState(personId);

      // If person has hidden content, expand their branch.
      if (hasHiddenContent) {
        suppressAnchoringRef.current = true;
        setLayoutAnimationKey(prev => prev + 1);
        suppressAutoFitRef.current = true;
        pendingCenterDelayRef.current = EXPAND_CENTER_DELAY_MS;
        pendingCenterRef.current = true;
        // Always switch focus to the selected person so the active ancestor path is recalculated from here.
        setFocusedPersonId(personId);
        setExpandedPersons(prev => {
          let nextExpanded = new Set(prev);

            // When opening one spouse branch, collapse expanded states of other spouse branches,
            // including their ancestor/sibling expansions.
            const spouseComponentIds = getSpouseComponentIds(personId);
            if (spouseComponentIds.size > 1) {
              const keepExpandedIds = getDescendantIds(personId);
              keepExpandedIds.add(personId);

              const collapseIds = new Set<string>();
              spouseComponentIds.forEach(spouseId => {
                if (spouseId === personId) return;
                collapseIds.add(spouseId);
                getDescendantIds(spouseId).forEach(descendantId => collapseIds.add(descendantId));
                getAncestorBranchIds(spouseId).forEach(ancestorBranchId => collapseIds.add(ancestorBranchId));
              });

            nextExpanded = new Set(
              Array.from(nextExpanded).filter(expandedId =>
                !collapseIds.has(expandedId) || keepExpandedIds.has(expandedId)
              )
            );
          }

          nextExpanded.add(personId);
          return nextExpanded;
        });
        return;
      }

    // No hidden content to expand, open menu
    centerPersonInView(personId);
    setSelectedPersonId(personId);
  };

  const unionSymbolOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    const visibleUnionX = new Map<string, number>();
    const visiblePersonIds = new Set<string>();
    const offsetProposalsByUnion = new Map<string, number[]>();
    const LANE_STEP = Math.max(10, Math.round(SYMBOL_SIZE * 0.35));

    filteredElements.forEach(element => {
      if (element.type === 'person') {
        visiblePersonIds.add(element.id);
        return;
      }

      visibleUnionX.set(element.id, element.x);
    });

    const addOffsetProposal = (unionId: string, offset: number) => {
      const existing = offsetProposalsByUnion.get(unionId);
      if (existing) {
        existing.push(offset);
      } else {
        offsetProposalsByUnion.set(unionId, [offset]);
      }
    };

    Array.from(visiblePersonIds)
      .sort((a, b) => a.localeCompare(b))
      .forEach(personId => {
        const person = familyTree.persons[personId];
        if (!person) return;

        const spouseUnionIds = person.unionIds
          .filter(unionId => {
            const union = familyTree.unions[unionId];
            return Boolean(union && union.partnerIds.length > 1 && visibleUnionX.has(unionId));
          })
          .slice()
          .sort((a, b) => {
            const ax = visibleUnionX.get(a) ?? 0;
            const bx = visibleUnionX.get(b) ?? 0;
            if (Math.abs(ax - bx) > 0.5) return ax - bx;
            return a.localeCompare(b);
          });

        if (spouseUnionIds.length < 2) return;

        const centerIndex = (spouseUnionIds.length - 1) / 2;
        spouseUnionIds.forEach((unionId, index) => {
          const laneOffset = (index - centerIndex) * LANE_STEP;
          addOffsetProposal(unionId, laneOffset);
        });
      });

    offsetProposalsByUnion.forEach((proposals, unionId) => {
      if (proposals.length === 0) return;
      const averageOffset = proposals.reduce((sum, value) => sum + value, 0) / proposals.length;
      offsets.set(unionId, averageOffset);
    });

    return offsets;
  }, [familyTree.persons, familyTree.unions, filteredElements]);

  const unionSymbolXOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    const visiblePersonPositions = new Map<string, { x: number; y: number }>();
    const visibleUnionPositions = new Map<string, { x: number; y: number }>();
    const placedSymbolCenters: Array<{ x: number; y: number }> = [];

    const AVATAR_COLLISION_CLEARANCE = AVATAR_VISUAL_CENTER + SYMBOL_RADIUS + 4;
    const SYMBOL_TO_SYMBOL_X_CLEARANCE = SYMBOL_SIZE + 8;
    const SYMBOL_TO_SYMBOL_Y_CLEARANCE = SYMBOL_SIZE + 6;
    const HORIZONTAL_STEP = SYMBOL_SIZE + 8;
    const EDGE_PADDING = AVATAR_VISUAL_CENTER + SYMBOL_RADIUS + 4;

    filteredElements.forEach(element => {
      if (element.type === 'person') {
        visiblePersonPositions.set(element.id, { x: element.x, y: element.y });
      } else if (element.type === 'union-symbol') {
        visibleUnionPositions.set(element.id, { x: element.x, y: element.y });
      }
    });

    const unionIds = Array.from(visibleUnionPositions.keys()).sort((aId, bId) => {
      const aPos = visibleUnionPositions.get(aId)!;
      const bPos = visibleUnionPositions.get(bId)!;
      if (Math.abs(aPos.y - bPos.y) > 0.5) return aPos.y - bPos.y;
      if (Math.abs(aPos.x - bPos.x) > 0.5) return aPos.x - bPos.x;
      return aId.localeCompare(bId);
    });

    unionIds.forEach(unionId => {
      const union = familyTree.unions[unionId];
      const basePosition = visibleUnionPositions.get(unionId);
      if (!union || !basePosition) return;

      const baseOffsetY = unionSymbolOffsets.get(unionId) ?? 0;
      const centerY = basePosition.y + SYMBOL_SIZE / 2 + baseOffsetY;
      const partnerCenters = union.partnerIds
        .map(partnerId => visiblePersonPositions.get(partnerId))
        .filter((position): position is { x: number; y: number } => Boolean(position))
        .map(position => ({ x: position.x, y: position.y + AVATAR_VISUAL_CENTER }));

      if (partnerCenters.length === 0) return;

      let minX = Number.NEGATIVE_INFINITY;
      let maxX = Number.POSITIVE_INFINITY;
      if (partnerCenters.length > 1) {
        const partnerXs = partnerCenters.map(partner => partner.x).sort((a, b) => a - b);
        minX = partnerXs[0] + EDGE_PADDING;
        maxX = partnerXs[partnerXs.length - 1] - EDGE_PADDING;
      }

      const candidates = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5].map(step => step * HORIZONTAL_STEP);

      let bestOffsetX = 0;
      let bestAvatarCollisionScore = Number.POSITIVE_INFINITY;
      let bestSymbolCollisionScore = Number.POSITIVE_INFINITY;
      let bestDistanceScore = Number.POSITIVE_INFINITY;

      candidates.forEach(candidateOffsetX => {
        const rawCenterX = basePosition.x + candidateOffsetX;
        const clampedCenterX = clampValue(rawCenterX, minX, maxX);
        const centerX = Number.isFinite(minX) && Number.isFinite(maxX) && maxX >= minX
          ? clampedCenterX
          : rawCenterX;

        const avatarCollisionScore = Array.from(visiblePersonPositions.values()).reduce((count, position) => {
          const personCenterX = position.x;
          const personCenterY = position.y + AVATAR_VISUAL_CENTER;
          const distance = Math.hypot(centerX - personCenterX, centerY - personCenterY);
          return count + (distance < AVATAR_COLLISION_CLEARANCE ? 1 : 0);
        }, 0);

        const symbolCollisionScore = placedSymbolCenters.reduce((count, symbolCenter) => {
          const overlapsX = Math.abs(centerX - symbolCenter.x) < SYMBOL_TO_SYMBOL_X_CLEARANCE;
          const overlapsY = Math.abs(centerY - symbolCenter.y) < SYMBOL_TO_SYMBOL_Y_CLEARANCE;
          return count + (overlapsX && overlapsY ? 1 : 0);
        }, 0);

        const distanceScore = Math.abs(centerX - basePosition.x);
        const isBetter =
          avatarCollisionScore < bestAvatarCollisionScore ||
          (
            avatarCollisionScore === bestAvatarCollisionScore &&
            symbolCollisionScore < bestSymbolCollisionScore
          ) ||
          (
            avatarCollisionScore === bestAvatarCollisionScore &&
            symbolCollisionScore === bestSymbolCollisionScore &&
            distanceScore < bestDistanceScore
          );

        if (isBetter) {
          bestOffsetX = centerX - basePosition.x;
          bestAvatarCollisionScore = avatarCollisionScore;
          bestSymbolCollisionScore = symbolCollisionScore;
          bestDistanceScore = distanceScore;
        }
      });

      if (Math.abs(bestOffsetX) > 0.5) {
        offsets.set(unionId, bestOffsetX);
      }

      placedSymbolCenters.push({
        x: basePosition.x + bestOffsetX,
        y: centerY,
      });
    });

    return offsets;
  }, [familyTree.unions, filteredElements, unionSymbolOffsets]);

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
    const firstLastName = getLastNameList(person)[0] ?? '';
    const personName = [person.firstName ?? '', firstLastName].filter(part => part.length > 0).join(' ').trim();
    const age = calculateAge(person);
    const detailRows = age !== null ? [String(age)] : [];
    const isExpanded = expandedPersons.has(person.id) || focusedPersonId === person.id;
    const isFocused = focusedPersonId === person.id;
    const { hasHiddenParents, hasHiddenChildren, hasHiddenSpouses, canBeExpanded } = getPersonExpandState(person.id);
    const isDragging = dragState.id === person.id && dragState.isDragging;
    const isDragRelated = dragRelatedIds.has(person.id);
    const dragTransform = dragState.id === person.id
      ? `translate3d(${dragState.dx}px, ${dragState.dy}px, 0)`
      : undefined;
    const isHovered = hoveredPersonId === person.id;
    const hoveredConnections = hoveredPersonId ? getConnectedRelatives(hoveredPersonId) : { personIds: new Set<string>(), unionIds: new Set<string>() };
    const isConnected = hoveredConnections.personIds.has(person.id);
    const isSearchMatch = searchMatchIds.has(person.id);
    const isSearchFocus = searchFocusId === person.id;
    const avatarGenderClass = person.gender === 'male' ? 'male' : person.gender === 'female' ? 'female' : 'unknown';
    const avatarClassName = `tree-person-avatar ${avatarGenderClass} ${person.photo ? 'has-photo' : 'is-placeholder'}`;
    return (
      <div
        key={person.id}
        ref={registerPersonRef(person.id)}
        className={`tree-person-card ${isFocused ? 'focused' : ''} ${isExpanded ? 'expanded' : ''} ${isDragging ? 'dragging' : ''} ${isDragRelated ? 'drag-related' : ''} ${isHovered ? 'hovered' : ''} ${hoveredPersonId && isConnected ? 'connected' : ''} ${isSearchMatch ? 'search-match' : ''} ${isSearchFocus ? 'search-focus' : ''}`}
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
        <div className={avatarClassName}>
          {person.photo ? (
            <img src={person.photo} alt={personName || copy.profilePhotoAlt} />
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
          <div className="expand-indicators" title={copy.expandTitle}>
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
          zIndex: 5,
        }}
        onClick={(e) => {
          e.stopPropagation();
          toggleMarriageStatus(unionId);
        }}
        title={isDivorced ? copy.divorcedTitle : copy.marriedTitle}
      >
        {isDivorced ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" />
            <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" />
            <path d="M3 3l18 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1" />
            <path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1" />
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

    const rangesOverlap = (aMin: number, aMax: number, bMin: number, bMax: number) =>
      Math.min(aMax, bMax) - Math.max(aMin, bMin) > 0.5;

    const personPositions = new Map<string, PositionedElement>();
    const unionElements: PositionedElement[] = [];
    const occupiedParentBars: Array<{ y: number; minX: number; maxX: number }> = [];

    const canonicalParentUnionByPerson = new Map<string, string>();
    const listedUnionsByChild = new Map<string, string[]>();
    Object.values(familyTree.unions)
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach(union => {
        union.childIds.forEach(childId => {
          if (!familyTree.persons[childId]) return;
          const existing = listedUnionsByChild.get(childId);
          if (existing) {
            if (!existing.includes(union.id)) {
              existing.push(union.id);
            }
          } else {
            listedUnionsByChild.set(childId, [union.id]);
          }
        });
      });

    Object.values(familyTree.persons).forEach(person => {
      const listed = listedUnionsByChild.get(person.id) ?? [];
      const preferredUnionId = person.parentUnionId && familyTree.unions[person.parentUnionId]
        ? person.parentUnionId
        : undefined;

      let chosenUnionId: string | undefined;
      if (preferredUnionId && listed.includes(preferredUnionId)) {
        chosenUnionId = preferredUnionId;
      } else if (listed.length > 0) {
        chosenUnionId = listed[0];
      } else if (preferredUnionId) {
        chosenUnionId = preferredUnionId;
      }

      if (chosenUnionId) {
        canonicalParentUnionByPerson.set(person.id, chosenUnionId);
      }
    });

    const renderChildIdsByUnion = new Map<string, string[]>();
    canonicalParentUnionByPerson.forEach((unionId, childId) => {
      if (!familyTree.unions[unionId]) return;
      const existing = renderChildIdsByUnion.get(unionId);
      if (existing) {
        existing.push(childId);
      } else {
        renderChildIdsByUnion.set(unionId, [childId]);
      }
    });

    const getRenderChildIds = (union: Union) =>
      renderChildIdsByUnion.get(union.id) ?? [];

    filteredElements.forEach(element => {
      if (element.type === 'person') {
        const draggedPosition = dragState.id === element.id && dragState.isDragging
          ? { ...element, x: element.x + dragState.dx, y: element.y + dragState.dy }
          : element;
        personPositions.set(element.id, draggedPosition);
      } else if (element.type === 'union-symbol') {
        unionElements.push(element);
      }
    });

    const getBlockingRectsForVertical = (
      y1: number,
      y2: number,
      excludedPersonIds: Set<string>
    ) => {
      const segmentTop = Math.min(y1, y2);
      const segmentBottom = Math.max(y1, y2);
      const H_MARGIN = 6;
      const V_MARGIN = 4;
      const rects: Array<{ left: number; right: number; top: number; bottom: number }> = [];

      personPositions.forEach((position, personId) => {
        if (excludedPersonIds.has(personId)) return;

        const left = position.x - PERSON_WIDTH / 2 + H_MARGIN;
        const right = position.x + PERSON_WIDTH / 2 - H_MARGIN;
        const top = position.y + V_MARGIN;
        const bottom = position.y + PERSON_HEIGHT - V_MARGIN;
        const overlapsVertically = segmentBottom > top && segmentTop < bottom;
        if (!overlapsVertically) return;
        rects.push({ left, right, top, bottom });
      });

      return rects;
    };

    const getVerticalCollisionInfo = (
      x: number,
      blockingRects: Array<{ left: number; right: number; top: number; bottom: number }>
    ) => {
      let collisions = 0;
      let clearance = Number.POSITIVE_INFINITY;

      blockingRects.forEach(rect => {
        if (x > rect.left && x < rect.right) {
          collisions += 1;
          clearance = 0;
          return;
        }

        const distance = x < rect.left ? rect.left - x : x - rect.right;
        clearance = Math.min(clearance, distance);
      });

      return {
        collisions,
        clearance: Number.isFinite(clearance) ? clearance : 10_000,
      };
    };

    const getHorizontalIntersections = (
      y: number,
      x1: number,
      x2: number,
      excludedPersonIds: Set<string>
    ) => {
      const leftX = Math.min(x1, x2);
      const rightX = Math.max(x1, x2);
      const H_MARGIN = 6;
      const V_MARGIN = 4;
      let intersections = 0;

      personPositions.forEach((position, personId) => {
        if (excludedPersonIds.has(personId)) return;
        const left = position.x - PERSON_WIDTH / 2 + H_MARGIN;
        const right = position.x + PERSON_WIDTH / 2 - H_MARGIN;
        const top = position.y + V_MARGIN;
        const bottom = position.y + PERSON_HEIGHT - V_MARGIN;

        const overlapsHorizontally = rightX > left && leftX < right;
        const overlapsVertically = y > top && y < bottom;
        if (overlapsHorizontally && overlapsVertically) {
          intersections += 1;
        }
      });

      return intersections;
    };

    const chooseRoutedVerticalX = (
      preferredX: number,
      y1: number,
      y2: number,
      excludedPersonIds: Set<string>
    ) => {
      const blockingRects = getBlockingRectsForVertical(y1, y2, excludedPersonIds);
      const laneStep = PERSON_WIDTH / 2 + 24;
      const edgePadding = 10;
      const maxLane = Math.max(4, Math.min(14, 4 + Math.ceil(blockingRects.length / 2)));
      const candidates: number[] = [preferredX];

      for (let lane = 1; lane <= maxLane; lane += 1) {
        candidates.push(preferredX - lane * laneStep);
        candidates.push(preferredX + lane * laneStep);
      }

      blockingRects.forEach(rect => {
        candidates.push(rect.left - edgePadding);
        candidates.push(rect.right + edgePadding);
      });

      const uniqueCandidates = candidates
        .sort((a, b) => a - b)
        .filter((candidate, index, arr) => index === 0 || Math.abs(candidate - arr[index - 1]) > 0.5);

      let bestX = preferredX;
      let bestCollisions = Number.POSITIVE_INFINITY;
      let bestHorizontalCollisions = Number.POSITIVE_INFINITY;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestClearance = -1;

      uniqueCandidates.forEach(candidateX => {
        const { collisions, clearance } = getVerticalCollisionInfo(candidateX, blockingRects);
        const horizontalCollisions = Math.abs(candidateX - preferredX) > 0.5
          ? getHorizontalIntersections(y1, preferredX, candidateX, excludedPersonIds)
          : 0;
        const distance = Math.abs(candidateX - preferredX);

        const isBetter =
          collisions < bestCollisions
          || (
            collisions === bestCollisions
            && horizontalCollisions < bestHorizontalCollisions
          )
          || (
            collisions === bestCollisions
            && horizontalCollisions === bestHorizontalCollisions
            && distance < bestDistance
          )
          || (
            collisions === bestCollisions
            && horizontalCollisions === bestHorizontalCollisions
            && Math.abs(distance - bestDistance) <= 0.5
            && clearance > bestClearance
          );

        if (isBetter) {
          bestX = candidateX;
          bestCollisions = collisions;
          bestHorizontalCollisions = horizontalCollisions;
          bestDistance = distance;
          bestClearance = clearance;
        }
      });

      return bestX;
    };

    const chooseJunctionY = (
      baseJunctionY: number,
      minX: number,
      maxX: number
    ) => {
      const LANE_STEP = 8;
      const candidates = [0, -1, 1, -2, 2, -3, 3, -4, 4];

      let bestY = baseJunctionY;
      let bestScore = Number.POSITIVE_INFINITY;

      candidates.forEach((lane, index) => {
        const candidateY = baseJunctionY + lane * LANE_STEP;
        const conflicts = occupiedParentBars.reduce((count, bar) => {
          const sameLane = Math.abs(bar.y - candidateY) < 3.5;
          if (!sameLane) return count;
          return count + (rangesOverlap(minX, maxX, bar.minX, bar.maxX) ? 1 : 0);
        }, 0);

        const score = conflicts * 10_000 + Math.abs(lane) * 10 + index * 0.01;
        if (score < bestScore) {
          bestScore = score;
          bestY = candidateY;
        }
      });

      return bestY;
    };

    const getAvatarEdgeXAtY = (
      person: PositionedElement,
      targetY: number,
      direction: -1 | 1
    ) => {
      const centerY = person.y + AVATAR_VISUAL_CENTER;
      const radius = AVATAR_VISUAL_CENTER;
      const deltaY = targetY - centerY;
      const horizontalReachSquared = radius * radius - deltaY * deltaY;
      const horizontalReach = horizontalReachSquared > 0 ? Math.sqrt(horizontalReachSquared) : 0;
      return person.x + direction * horizontalReach;
    };

    // Now draw connections
    unionElements.forEach(element => {
      const union = familyTree.unions[element.id];
      if (!union) return;

      const symbolOffset = unionSymbolOffsets.get(element.id) ?? 0;
      const symbolXOffset = unionSymbolXOffsets.get(element.id) ?? 0;
      const symbolX = element.x + symbolXOffset;
      const symbolY = element.y + SYMBOL_SIZE / 2 + symbolOffset;
      const isDraggingPartnerFromUnion = Boolean(
        dragState.isDragging
        && dragState.id
        && union.partnerIds.includes(dragState.id)
      );

      const partnerPositions = union.partnerIds
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      const drawPartnerToSymbol = (partner: PositionedElement, keySuffix: string) => {
        const partnerCenterX = partner.x;
        const partnerCenterY = partner.y + AVATAR_VISUAL_CENTER;
        const vectorX = symbolX - partnerCenterX;
        const vectorY = symbolY - partnerCenterY;
        const distance = Math.hypot(vectorX, vectorY);
        if (distance <= 0.5) return;

        const unitX = vectorX / distance;
        const unitY = vectorY / distance;
        const startX = partnerCenterX + unitX * AVATAR_VISUAL_CENTER;
        const startY = partnerCenterY + unitY * AVATAR_VISUAL_CENTER;
        const endX = symbolX - unitX * SYMBOL_RADIUS;
        const endY = symbolY - unitY * SYMBOL_RADIUS;

        if (Math.abs(endX - startX) <= 0.5 && Math.abs(endY - startY) <= 0.5) return;

        lines.push(
          <line
            key={`spouse-direct-${element.id}-${partner.id}-${keySuffix}`}
            x1={startX}
            y1={startY}
            x2={endX}
            y2={endY}
            className={getLineClassName(`connection-line spouse ${union.status === 'divorced' ? 'divorced' : ''}`, element.id)}
          />
        );
      };

      if (partnerPositions.length > 1 && !isDraggingPartnerFromUnion) {
        const sortedPartners = partnerPositions
          .slice()
          .sort((a, b) => a.x - b.x);
        const SPOUSE_LINE_OVERLAP = 1.5;

        for (let i = 0; i < sortedPartners.length - 1; i += 1) {
          const left = sortedPartners[i];
          const right = sortedPartners[i + 1];

          let spouseLineStartX = getAvatarEdgeXAtY(left, symbolY, 1) - SPOUSE_LINE_OVERLAP;
          let spouseLineEndX = getAvatarEdgeXAtY(right, symbolY, -1) + SPOUSE_LINE_OVERLAP;

          if (spouseLineEndX <= spouseLineStartX + 1) {
            spouseLineStartX = left.x;
            spouseLineEndX = right.x;
          }

          lines.push(
            <line
              key={`spouse-horizontal-${element.id}-${left.id}-${right.id}`}
              x1={spouseLineStartX}
              y1={symbolY}
              x2={spouseLineEndX}
              y2={symbolY}
              className={getLineClassName(`connection-line spouse ${union.status === 'divorced' ? 'divorced' : ''}`, element.id)}
            />
          );
        }
      } else if (partnerPositions.length > 0) {
        partnerPositions.forEach((partner, index) => {
          drawPartnerToSymbol(partner, isDraggingPartnerFromUnion ? `drag-${index}` : `single-${index}`);
        });
      }

      // Draw line down to children
      const childPositions = getRenderChildIds(union)
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      if (childPositions.length > 0) {
        // Orthogonal connections: vertical down, horizontal bar, vertical drops
        const childTop = Math.min(...childPositions.map(c => c.y));
        const JUNCTION_PAD = 20;
        const baseJunctionY = childTop - JUNCTION_PAD;
        const minChildX = Math.min(...childPositions.map(c => c.x));
        const maxChildX = Math.max(...childPositions.map(c => c.x));
        const excludedForTrunk = new Set<string>([
          ...partnerPositions.map(partner => partner.id),
          ...childPositions.map(child => child.id),
        ]);
        const routedTrunkX = chooseRoutedVerticalX(symbolX, symbolY, baseJunctionY, excludedForTrunk);
        const junctionMinX = Math.min(routedTrunkX, minChildX);
        const junctionMaxX = Math.max(routedTrunkX, maxChildX);
        const junctionY = chooseJunctionY(baseJunctionY, junctionMinX, junctionMaxX);

        if (Math.abs(routedTrunkX - symbolX) > 0.5) {
          lines.push(
            <line
              key={`parent-trunk-route-${element.id}`}
              x1={symbolX}
              y1={symbolY}
              x2={routedTrunkX}
              y2={symbolY}
              className={getLineClassName("connection-line parent", element.id)}
            />
          );
        }

        // Vertical line from symbol down to junction
        lines.push(
          <line
            key={`parent-vertical-${element.id}`}
            x1={routedTrunkX}
            y1={symbolY}
            x2={routedTrunkX}
            y2={junctionY}
            className={getLineClassName("connection-line parent", element.id)}
          />
        );

        // Horizontal bar must also exist for a single off-center child.
        const needsHorizontalBar =
          Math.abs(maxChildX - minChildX) > 0.5 ||
          Math.abs(routedTrunkX - minChildX) > 0.5;
        if (needsHorizontalBar) {
          lines.push(
            <line
              key={`parent-horizontal-${element.id}`}
              x1={junctionMinX}
              y1={junctionY}
              x2={junctionMaxX}
              y2={junctionY}
              className={getLineClassName("connection-line parent", element.id)}
            />
          );
        }

        // Vertical drop from junction to each child (stop at card edge, do not overlap card)
        childPositions.forEach(child => {
          lines.push(
            <line
              key={`parent-child-${element.id}-${child.id}`}
              x1={child.x}
              y1={junctionY}
              x2={child.x}
              y2={child.y}
              className={getLineClassName("connection-line parent", element.id)}
            />
          );
        });

        occupiedParentBars.push({
          y: junctionY,
          minX: needsHorizontalBar ? junctionMinX : routedTrunkX - 2,
          maxX: needsHorizontalBar ? junctionMaxX : routedTrunkX + 2,
        });
      } else if (collapsedDownUnions.has(element.id) && getRenderChildIds(union).length > 0) {
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
  const bounds = useMemo(() => getLayoutBounds(visibleElements), [visibleElements]);
  allBoundsRef.current = bounds;

  const offsetX = -bounds.minX;
  const offsetY = -bounds.minY;
  const treeWidth = bounds.maxX - bounds.minX;
  const treeHeight = bounds.maxY - bounds.minY;
  const lineMaskBaseId = lineMaskIdRef.current;
  const lineInsideMaskId = `${lineMaskBaseId}-inside`;
  const lineBlurFilterId = `${lineMaskBaseId}-blur`;
  const lineMaskTargets = useMemo(() => {
    const targets: Array<{ id: string; x: number; y: number }> = [];
    filteredElements.forEach(element => {
      if (element.type !== 'person') return;
      if (dragState.id === element.id && dragState.isDragging) {
        targets.push({
          id: element.id,
          x: element.x + dragState.dx,
          y: element.y + dragState.dy,
        });
        return;
      }
      targets.push({ id: element.id, x: element.x, y: element.y });
    });
    return targets;
  }, [filteredElements, dragState.id, dragState.isDragging, dragState.dx, dragState.dy]);

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

  const normalizedSearchQuery = normalizeSearchText(searchQuery.trim());
  const searchResults = useMemo(() => {
    if (!normalizedSearchQuery) return [];

    const matches = Object.values(familyTree.persons).filter(person => {
      const firstName = normalizeSearchText(person.firstName ?? '');
      if (firstName.includes(normalizedSearchQuery)) return true;
      return getLastNameList(person).some(lastName =>
        normalizeSearchText(lastName).includes(normalizedSearchQuery)
      );
    });

    matches.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    return matches.slice(0, 12);
  }, [familyTree.persons, normalizedSearchQuery]);

  const searchMatchIds = useMemo(() => new Set(searchResults.map(person => person.id)), [searchResults]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchOpen(false);
      setSearchFocusId(null);
      setActiveSearchIndex(0);
      return;
    }
    setActiveSearchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (searchResults.length === 0) {
      setActiveSearchIndex(0);
      return;
    }
    setActiveSearchIndex(prev => Math.min(prev, searchResults.length - 1));
  }, [searchResults]);

  const handleSearchSelect = (personId: string) => {
    suppressAnchoringRef.current = true;
    pendingCenterDelayRef.current = 0;
    pendingCenterRef.current = true;
    setFocusedPersonId(personId);
    setExpandedPersons(new Set([personId]));
    setSearchFocusId(personId);
    setSearchOpen(false);
    setBottomSearchOpen(false);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen && event.key === 'ArrowDown' && searchResults.length > 0) {
      setSearchOpen(true);
      event.preventDefault();
      return;
    }

    if (!searchResults.length) return;

    if (event.key === 'ArrowDown') {
      setActiveSearchIndex(prev => Math.min(prev + 1, searchResults.length - 1));
      event.preventDefault();
      return;
    }

    if (event.key === 'ArrowUp') {
      setActiveSearchIndex(prev => Math.max(prev - 1, 0));
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter') {
      const target = searchResults[activeSearchIndex];
      if (target) {
        handleSearchSelect(target.id);
        setSearchQuery(getDisplayName(target));
      }
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape') {
      setSearchOpen(false);
      searchInputRef.current?.blur();
    }
  };

  const openBottomSearch = () => {
    if (bottomSearchBlurTimerRef.current !== null) {
      window.clearTimeout(bottomSearchBlurTimerRef.current);
      bottomSearchBlurTimerRef.current = null;
    }
    setBottomSearchOpen(true);
    setSearchOpen(Boolean(searchQuery.trim()));
    window.setTimeout(() => bottomSearchInputRef.current?.focus(), 0);
  };

  const closeBottomSearch = () => {
    if (bottomSearchBlurTimerRef.current !== null) {
      window.clearTimeout(bottomSearchBlurTimerRef.current);
      bottomSearchBlurTimerRef.current = null;
    }
    setBottomSearchOpen(false);
    setSearchOpen(false);
  };

  const handleBottomSearchToggle = () => {
    if (bottomSearchOpen) {
      closeBottomSearch();
      return;
    }
    openBottomSearch();
  };

  const handleBottomSearchBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    if (bottomSearchBlurTimerRef.current !== null) {
      window.clearTimeout(bottomSearchBlurTimerRef.current);
      bottomSearchBlurTimerRef.current = null;
    }

    const nextFocusedElement = event.relatedTarget as Node | null;
    if (nextFocusedElement && searchDockRef.current?.contains(nextFocusedElement)) {
      return;
    }

    bottomSearchBlurTimerRef.current = window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (activeElement && searchDockRef.current?.contains(activeElement)) {
        bottomSearchBlurTimerRef.current = null;
        return;
      }
      setSearchOpen(false);
      if (!searchQuery.trim()) {
        setBottomSearchOpen(false);
      }
      bottomSearchBlurTimerRef.current = null;
    }, 120);
  };

  return (
    <div className={treeViewClassName} ref={viewRef}>
      <div className="family-tree-header">
        <button className="back-to-manager-button" onClick={handleHeaderBackClick} title={backButtonLabel} aria-label={backButtonLabel}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <div className="family-tree-header-content">
          <h1>{activeTreeId ? allTrees[activeTreeId]?.name : copy.defaultTreeTitle}</h1>
          <div className="family-tree-stats">
            {allPersons.length} {allPersons.length === 1 ? copy.personLabelSingular : copy.personLabelPlural}
          </div>
        </div>
      </div>

      <div
        className={`tree-container ${isPanning ? 'panning' : ''}`}
        ref={containerRef}
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerMoveCapture={handleCanvasPointerMoveCapture}
        onPointerUpCapture={handleCanvasPointerUpCapture}
        onPointerCancelCapture={handleCanvasPointerUpCapture}
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
            transition: isPanning ? 'none' : 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
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
              key={`connections-${layoutAnimationKey}`}
              className="tree-connections animate"
              width={treeWidth}
              height={treeHeight}
              style={{ position: 'absolute', top: 0, left: 0 }}
            >
              <defs>
                <filter id={lineBlurFilterId} x="-14%" y="-14%" width="128%" height="128%">
                  <feGaussianBlur stdDeviation="4.5" />
                </filter>
                <mask id={lineInsideMaskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
                  <rect x="0" y="0" width={treeWidth} height={treeHeight} fill="black" />
                  <g transform={`translate(${offsetX}, ${offsetY})`}>
                    {lineMaskTargets.map(target => (
                      <circle
                        key={`line-mask-in-${target.id}`}
                        cx={target.x}
                        cy={target.y + AVATAR_VISUAL_CENTER}
                        r={AVATAR_VISUAL_CENTER + 2}
                        fill="white"
                      />
                    ))}
                  </g>
                </mask>
              </defs>
              <g transform={`translate(${offsetX}, ${offsetY})`}>
                {renderConnections()}
              </g>
              <g
                transform={`translate(${offsetX}, ${offsetY})`}
                mask={`url(#${lineInsideMaskId})`}
                filter={`url(#${lineBlurFilterId})`}
                style={{ pointerEvents: 'none', opacity: 1 }}
              >
                {renderConnections()}
              </g>
            </svg>

            <div style={{ position: 'relative' }}>
              {filteredElements.map(element => {
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

      {!isFullTreeLayout && unconnectedPersons.length > 0 && (
        <div className="tree-unconnected-bar">
          <span>{copy.notLinkedLabel}</span>
          {unconnectedPersons.map(person => (
            <div
              key={person.id}
              className="unconnected-person-chip"
              onClick={() => {
                suppressAnchoringRef.current = true;
                setFocusedPersonId(person.id);
                setExpandedPersons(new Set([person.id]));
              }}
            >
              {person.firstName || copy.unnamedPerson}
            </div>
          ))}
        </div>
      )}

      <div ref={searchDockRef} className={`tree-search-dock ${bottomSearchOpen ? 'open' : ''}`}>
        <button
          type="button"
          className="tree-search-toggle"
          onClick={handleBottomSearchToggle}
          title={copy.treeSearchPlaceholder}
          aria-label={copy.treeSearchPlaceholder}
        >
          {bottomSearchOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <line x1="15.5" y1="15.5" x2="20" y2="20" />
            </svg>
          )}
        </button>
        <div className={`tree-search bottom ${bottomSearchOpen ? 'expanded' : ''}`}>
          <input
            ref={bottomSearchInputRef}
            type="text"
            value={searchQuery}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSearchQuery(nextValue);
              setSearchOpen(Boolean(nextValue.trim()));
            }}
            onFocus={() => {
              if (bottomSearchBlurTimerRef.current !== null) {
                window.clearTimeout(bottomSearchBlurTimerRef.current);
                bottomSearchBlurTimerRef.current = null;
              }
              setSearchOpen(true);
            }}
            onBlur={handleBottomSearchBlur}
            onKeyDown={handleSearchKeyDown}
            placeholder={copy.treeSearchPlaceholder}
            className="tree-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="tree-search-clear"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSearchQuery('');
                setSearchFocusId(null);
                bottomSearchInputRef.current?.focus();
              }}
              aria-label={copy.clearSearch}
              title={copy.clearSearch}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="7" y1="7" x2="17" y2="17" />
                <line x1="17" y1="7" x2="7" y2="17" />
              </svg>
            </button>
          )}
          {searchOpen && searchQuery && (
            <div className="tree-search-results">
              {searchResults.length === 0 ? (
                <div className="tree-search-empty">{copy.treeSearchNoResults}</div>
              ) : (
                searchResults.map((person, index) => (
                  <button
                    key={`search-${person.id}`}
                    type="button"
                    className={`tree-search-result ${index === activeSearchIndex ? 'active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      handleSearchSelect(person.id);
                      setSearchQuery(getDisplayName(person));
                    }}
                  >
                    <span className="tree-search-name">{getDisplayName(person) || copy.unknownPerson}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="tree-controls-top">
        <div className="zoom-bar">
          <button className="zoom-bar-btn" onClick={handleZoomOut} title={copy.zoomOut}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="12" x2="18" y2="12" />
            </svg>
          </button>
          <button className="zoom-bar-label" onClick={handleFitToScreen} title={copy.zoomFit}>
            {Math.round(scale * 100)}%
          </button>
          <button className="zoom-bar-btn" onClick={handleZoomIn} title={copy.zoomIn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="6" x2="12" y2="18" />
              <line x1="6" y1="12" x2="18" y2="12" />
            </svg>
          </button>
        </div>
        <div className="gen-bar gen-bar-desktop">
          {[1, 2, 3, 4].map(n => (
            <button
              key={n}
              className={`gen-bar-btn ${generationFilter === n ? 'active' : ''}`}
              onClick={() => setGenerationFilter(prev => prev === n ? null : n)}
            >
              {n}
            </button>
          ))}
          <button
            className={`gen-bar-btn gen-bar-all ${generationFilter === null ? 'active' : ''}`}
            onClick={() => setGenerationFilter(null)}
          >
            {copy.generationsAll}
          </button>
        </div>
        <button
          className="gen-bar gen-bar-mobile"
          onClick={() => {
            const steps: Array<number | null> = [1, 2, 3, 4, null];
            const currentIndex = steps.indexOf(generationFilter);
            setGenerationFilter(steps[(currentIndex + 1) % steps.length]);
          }}
        >
          <span className="gen-bar-mobile-label">
            {copy.generationsLabel} {generationFilter ?? copy.generationsAll}
          </span>
        </button>
      </div>

      {selectedPersonId && (() => {
        const selectedPerson = familyTree.persons[selectedPersonId];
        if (!selectedPerson) return null;

        const selectedParentUnion = selectedPerson.parentUnionId
          ? familyTree.unions[selectedPerson.parentUnionId]
          : undefined;
        const selectedParentCount = (selectedParentUnion?.partnerIds ?? [])
          .filter(parentId => Boolean(familyTree.persons[parentId]))
          .length;

        return (
          <CircularMenu
            person={selectedPerson}
            canAddParent={selectedParentCount < 2}
            onAddParent={handleAddParent}
            onAddSpouse={handleAddSpouse}
            onAddChild={handleAddChild}
            onEdit={handleEdit}
            onLink={handleLink}
            onUnlink={handleUnlink}
            onDelete={handleDelete}
            onClose={handleCloseMenu}
          />
        );
      })()}

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

