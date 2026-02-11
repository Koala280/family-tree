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
const COUPLE_GAP = 84; // Gap between partners (for marriage symbol)
const SIBLING_GAP = 48;
const GENERATION_GAP = 190;
const SYMBOL_SIZE = 36;
const AVATAR_SIZE = 80;
const AVATAR_BORDER = 3;
const AVATAR_VISUAL_CENTER = (AVATAR_SIZE + AVATAR_BORDER * 2) / 2;
const SYMBOL_RADIUS = SYMBOL_SIZE / 2;
const SYMBOL_AVATAR_GAP = 6;
const SINGLE_PARENT_SYMBOL_TOP_OFFSET = PERSON_HEIGHT + SYMBOL_AVATAR_GAP;
const FOCUS_GENERATION = 2;
const COLLAPSED_BRANCH_LENGTH = 14;
const COLLAPSED_BRANCH_RADIUS = 6;
const BOUNDS_MARGIN = Math.max(40, COLLAPSED_BRANCH_LENGTH + COLLAPSED_BRANCH_RADIUS + 8);
const DRAG_THRESHOLD = 6;
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
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bottomSearchInputRef = useRef<HTMLInputElement>(null);
  const personRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const symbolRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const longPressTimerRef = useRef<number | null>(null);
  const suppressAutoFitRef = useRef(false);
  const pendingCenterRef = useRef(false); // Flag to center AFTER next render
  const suppressAnchoringRef = useRef(false);
  const previousVisibleIdsRef = useRef<Set<string>>(new Set());
  const previousTreeIdRef = useRef<string | null>(null);
  const scaleRef = useRef(scale);
  const panOffsetRef = useRef(panOffset);
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

  // Initialize focused person
  useEffect(() => {
    if (!focusedPersonId && familyTree) {
      const persons = Object.values(familyTree.persons);
      if (persons.length > 0) {
        suppressAnchoringRef.current = true;
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

  useEffect(() => {
    document.body.classList.add('tree-view-active');
    return () => {
      document.body.classList.remove('tree-view-active');
    };
  }, []);

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
      suppressAnchoringRef.current = true;
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
    if (!treeRef.current) return;

    const treeWidth = treeRef.current.offsetWidth;
    const treeHeight = treeRef.current.offsetHeight;
    if (treeWidth <= 0 || treeHeight <= 0) return;
    const nextBounds = { minX: 0, maxX: treeWidth, minY: 0, maxY: treeHeight };

    const visibleRect = getVisibleContainerRect();
    const minDim = Math.max(1, Math.min(visibleRect.width, visibleRect.height));
    const padding = Math.min(40, minDim * 0.05);
    const availableWidth = Math.max(1, visibleRect.width - padding * 2);
    const availableHeight = Math.max(1, visibleRect.height - padding * 2);

    const scaleX = availableWidth / treeWidth;
    const scaleY = availableHeight / treeHeight;

    let newScale = Math.min(scaleX, scaleY);
    newScale = Math.max(0.2, Math.min(1.2, newScale));

    const treeCenterX = treeWidth / 2;
    const treeCenterY = treeHeight / 2;
    const nextPan = getCenteringPan(treeCenterX, treeCenterY, nextBounds, newScale);

    setScale(newScale);
    setPanOffset(nextPan);
  }, [getCenteringPan, getVisibleContainerRect]);

  const getPanForZoom = useCallback((nextScale: number, center: { x: number; y: number }) => {
    const tree = treeRef.current;
    if (!tree) return panOffset;

    const origin = { x: tree.offsetWidth / 2, y: tree.offsetHeight / 2 };
    const rect = tree.getBoundingClientRect();
    const layoutOrigin = {
      x: rect.left - (1 - scale) * origin.x - scale * panOffset.x,
      y: rect.top - (1 - scale) * origin.y - scale * panOffset.y,
    };
    const worldPoint = {
      x: origin.x + (center.x - layoutOrigin.x - origin.x) / scale - panOffset.x,
      y: origin.y + (center.y - layoutOrigin.y - origin.y) / scale - panOffset.y,
    };

    return {
      x: (center.x - layoutOrigin.x - origin.x) / nextScale - (worldPoint.x - origin.x),
      y: (center.y - layoutOrigin.y - origin.y) / nextScale - (worldPoint.y - origin.y),
    };
  }, [panOffset, scale]);

  const handleZoomIn = useCallback(() => {
    const center = getViewportCenter();
    const nextScale = clampValue(scale * 1.2, 0.2, 2);
    const nextPan = getPanForZoom(nextScale, center);
    setScale(nextScale);
    setPanOffset(nextPan);
  }, [getPanForZoom, getViewportCenter, scale]);

  const handleZoomOut = useCallback(() => {
    const center = getViewportCenter();
    const nextScale = clampValue(scale / 1.2, 0.2, 2);
    const nextPan = getPanForZoom(nextScale, center);
    setScale(nextScale);
    setPanOffset(nextPan);
  }, [getPanForZoom, getViewportCenter, scale]);

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

    const allPersonIds = Object.keys(familyTree.persons);
    if (allPersonIds.length === 0) {
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

    // Union-find to keep spouses in the same generation band.
    const ufParent = new Map<string, string>();
    allPersonIds.forEach(personId => ufParent.set(personId, personId));

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
      const partners = union.partnerIds.filter(personId => familyTree.persons[personId]);
      if (partners.length < 2) return;
      const anchor = partners[0];
      partners.slice(1).forEach(partnerId => unionGroups(anchor, partnerId));
    });

    const allGroupIds = new Set<string>();
    allPersonIds.forEach(personId => {
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
          .filter(personId => familyTree.persons[personId])
          .map(partnerId => findGroup(partnerId))
      ));
      if (parentGroups.length === 0) return;

      const children = getEffectiveChildIds(union).filter(childId => familyTree.persons[childId]);
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
    allPersonIds.forEach(personId => {
      generationByPerson.set(personId, generationByGroup.get(findGroup(personId)) ?? 0);
    });

    const generations = Array.from(new Set(Array.from(generationByPerson.values()))).sort((a, b) => a - b);
    const personsByGeneration = new Map<number, string[]>();
    generations.forEach(generation => personsByGeneration.set(generation, []));
    allPersonIds.forEach(personId => {
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

    const allPersonPositions = Array.from(positionedPersons.values());
    if (allPersonPositions.length > 0) {
      const minX = Math.min(...allPersonPositions.map(pos => pos.x));
      const maxX = Math.max(...allPersonPositions.map(pos => pos.x));
      const centerX = (minX + maxX) / 2;
      positionedPersons.forEach(pos => {
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

    const elements: PositionedElement[] = [];
    positionedPersons.forEach((pos, personId) => {
      elements.push({ type: 'person', id: personId, x: pos.x, y: pos.y, generation: pos.generation });
    });
    positionedUnions.forEach((pos, unionId) => {
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
  }, [familyTree]);

  useEffect(() => {
    const nextVisible = new Set<string>();
    visibleElements.forEach(element => {
      if (element.type === 'person') {
        nextVisible.add(element.id);
      }
    });
    previousVisibleIdsRef.current = nextVisible;
  }, [visibleElements]);

  // Center AFTER positions are calculated (triggered by visibleElements change)
  useEffect(() => {
    if (!pendingCenterRef.current) return;
    if (!focusedPersonId) return;
    pendingCenterRef.current = false;

    const focusedElement = visibleElements.find(el => el.type === 'person' && el.id === focusedPersonId);
    if (!focusedElement) return;

    const nextBounds = getLayoutBounds(visibleElements);
    const offsetX = -nextBounds.minX;
    const offsetY = -nextBounds.minY;
    const personCenterX = focusedElement.x + offsetX;
    const personCenterY = focusedElement.y + offsetY + PERSON_HEIGHT / 2;
    const nextPan = getCenteringPan(personCenterX, personCenterY, nextBounds);

    setPanOffset(nextPan);
  }, [visibleElements, focusedPersonId]);

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

      // If person has hidden content, expand their branch; re-root only to reveal parents
      if (hasHiddenContent) {
        suppressAnchoringRef.current = true;
        setLayoutAnimationKey(prev => prev + 1);
        if (hasHiddenParents) {
          // Expanding to show parents - center AFTER positions are calculated
          suppressAutoFitRef.current = true;
          pendingCenterRef.current = true;
          const isCurrentFocus = personId === focusedPersonId;
          setFocusedPersonId(personId);
          if (isCurrentFocus) {
            setExpandedPersons(prev => new Set([...prev, personId]));
          } else {
            setExpandedPersons(new Set([personId]));
          }
        } else {
          // When expanding a person with hidden children/spouses (not parents),
          // make them the new focus to avoid collisions with existing content
          // This re-centers the tree around this person - center AFTER positions are calculated
          suppressAutoFitRef.current = true;
          pendingCenterRef.current = true;
          setFocusedPersonId(personId);
          setExpandedPersons(new Set([personId]));
        }
        return;
      }

    // No hidden content to expand, open menu
    centerPersonInView(personId);
    setSelectedPersonId(personId);
  };

  const unionSymbolOffsets = useMemo(() => {
    return new Map<string, number>();
  }, []);

  const unionSymbolXOffsets = useMemo(() => {
    return new Map<string, number>();
  }, []);

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
    const personName = getDisplayName(person);
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
    const isSearchMatch = searchMatchIds.has(person.id);
    const isSearchFocus = searchFocusId === person.id;

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
        <div className={`tree-person-avatar ${person.gender === 'male' ? 'male' : person.gender === 'female' ? 'female' : ''}`}>
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
        }}
        onClick={(e) => {
          e.stopPropagation();
          toggleMarriageStatus(unionId);
        }}
        title={isDivorced ? copy.divorcedTitle : copy.marriedTitle}
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

    // Now draw connections
    unionElements.forEach(element => {
      const union = familyTree.unions[element.id];
      if (!union) return;

      const symbolOffset = unionSymbolOffsets.get(element.id) ?? 0;
      const symbolXOffset = unionSymbolXOffsets.get(element.id) ?? 0;
      const symbolX = element.x + symbolXOffset;
      const symbolY = element.y + SYMBOL_SIZE / 2 + symbolOffset;

      const partnerPositions = union.partnerIds
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      if (partnerPositions.length > 1) {
        const sortedPartners = partnerPositions
          .slice()
          .sort((a, b) => a.x - b.x);

        for (let i = 0; i < sortedPartners.length - 1; i += 1) {
          const left = sortedPartners[i];
          const right = sortedPartners[i + 1];

          let spouseLineStartX = left.x + AVATAR_VISUAL_CENTER;
          let spouseLineEndX = right.x - AVATAR_VISUAL_CENTER;

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
      } else if (partnerPositions.length === 1) {
        const partner = partnerPositions[0];
        const sameColumn = Math.abs(symbolX - partner.x) <= 0.5;

        if (sameColumn) {
          const lineStartY = partner.y + PERSON_HEIGHT;
          const lineEndY = symbolY - SYMBOL_RADIUS;

          if (Math.abs(lineEndY - lineStartY) > 0.5) {
            lines.push(
              <line
                key={`spouse-direct-${element.id}-${partner.id}`}
                x1={partner.x}
                y1={lineStartY}
                x2={symbolX}
                y2={lineEndY}
                className={getLineClassName(`connection-line spouse ${union.status === 'divorced' ? 'divorced' : ''}`, element.id)}
              />
            );
          }
        } else {
          const partnerCenterY = partner.y + AVATAR_VISUAL_CENTER;
          const direction = symbolX >= partner.x ? 1 : -1;
          const partnerEdgeX = partner.x + direction * AVATAR_VISUAL_CENTER;
          const symbolEdgeX = symbolX - direction * SYMBOL_RADIUS;

          if (
            Math.abs(partnerCenterY - symbolY) > 0.5 ||
            Math.abs(symbolEdgeX - partnerEdgeX) > 0.5
          ) {
            lines.push(
              <line
                key={`spouse-direct-${element.id}-${partner.id}`}
                x1={partnerEdgeX}
                y1={partnerCenterY}
                x2={symbolEdgeX}
                y2={symbolY}
                className={getLineClassName(`connection-line spouse ${union.status === 'divorced' ? 'divorced' : ''}`, element.id)}
              />
            );
          }
        }
      }

      // Draw line down to children
      const childPositions = getRenderChildIds(union)
        .map(id => personPositions.get(id))
        .filter(Boolean) as PositionedElement[];

      if (childPositions.length > 0) {
        // Orthogonal connections: vertical down, horizontal bar, vertical drops
        const childTop = Math.min(...childPositions.map(c => c.y));
        const JUNCTION_PAD = 20;
        const junctionY = childTop - JUNCTION_PAD;
        const minChildX = Math.min(...childPositions.map(c => c.x));
        const maxChildX = Math.max(...childPositions.map(c => c.x));

        // Vertical line from symbol down to junction
        lines.push(
          <line
            key={`parent-vertical-${element.id}`}
            x1={symbolX}
            y1={symbolY}
            x2={symbolX}
            y2={junctionY}
            className={getLineClassName("connection-line parent", element.id)}
          />
        );

        // Horizontal bar must also exist for a single off-center child.
        const needsHorizontalBar =
          Math.abs(maxChildX - minChildX) > 0.5 ||
          Math.abs(symbolX - minChildX) > 0.5;
        if (needsHorizontalBar) {
          lines.push(
            <line
              key={`parent-horizontal-${element.id}`}
              x1={Math.min(symbolX, minChildX)}
              y1={junctionY}
              x2={Math.max(symbolX, maxChildX)}
              y2={junctionY}
              className={getLineClassName("connection-line parent", element.id)}
            />
          );
        }

        // Vertical drop from junction to each child
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
    setBottomSearchOpen(true);
    setSearchOpen(Boolean(searchQuery.trim()));
    window.setTimeout(() => bottomSearchInputRef.current?.focus(), 0);
  };

  const closeBottomSearch = () => {
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

  const handleBottomSearchBlur = () => {
    window.setTimeout(() => {
      setSearchOpen(false);
      if (!searchQuery.trim()) {
        setBottomSearchOpen(false);
      }
    }, 120);
  };

  return (
    <div className="family-tree-view">
      <div className="family-tree-header">
        <button className="back-to-manager-button" onClick={() => setCurrentView('manager')} title={copy.backToOverview} aria-label={copy.backToOverview}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
        </button>
        <div className="family-tree-header-content">
          <h1>{activeTreeId ? allTrees[activeTreeId]?.name : copy.defaultTreeTitle}</h1>
          <div className="family-tree-stats">
            {allPersons.length} {allPersons.length === 1 ? 'Person' : 'Personen'}
          </div>
        </div>
        <div className="tree-search">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSearchQuery(nextValue);
              setSearchOpen(Boolean(nextValue.trim()));
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setSearchOpen(false), 120);
            }}
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
                searchInputRef.current?.focus();
              }}
              aria-label={copy.clearSearch}
              title={copy.clearSearch}
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.71 4.29 12 10.59l6.29-6.3z" />
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
              {person.firstName || 'Unbenannt'}
            </div>
          ))}
        </div>
      )}

      <div className={`tree-search-dock ${bottomSearchOpen ? 'open' : ''}`}>
        <button
          type="button"
          className="tree-search-toggle"
          onClick={handleBottomSearchToggle}
          title={copy.treeSearchPlaceholder}
          aria-label={copy.treeSearchPlaceholder}
        >
          {bottomSearchOpen ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.71 4.29 12 10.59l6.29-6.3z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6 6 0 1 0 14 15.5l.27.28v.79L20 21.5 21.5 20l-6-6zm-5.5 0a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" />
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
            onFocus={() => setSearchOpen(true)}
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
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L12 13.41l-6.29 6.3-1.42-1.42L10.59 12 4.29 5.71 5.71 4.29 12 10.59l6.29-6.3z" />
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

      <div className="zoom-controls">
        <button className="zoom-button" onClick={handleZoomIn} title={copy.zoomIn}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
          </svg>
        </button>
        <button className="zoom-button" onClick={handleZoomOut} title={copy.zoomOut}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13H5v-2h14v2z"/>
          </svg>
        </button>
        <button className="zoom-button fit-button" onClick={handleFitToScreen} title={copy.zoomFit}>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/>
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

