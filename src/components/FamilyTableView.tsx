import { useEffect, useMemo, useRef, useState } from 'react';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { translations } from '../i18n';
import {
  BLOOD_GROUP_OPTIONS,
  formatDateInfo,
  getBloodGroup,
  getInheritedHereditaryDiseaseRisks,
  getKnownDiseaseEntries,
  getKnownDiseaseList,
  getLastNameList,
  hasDateInfo,
  type BloodGroupValue,
} from '../utils/person';
import { Person } from '../types';
import { DateField, normalizeDateInputOnBlur, sanitizeDateInput } from '../utils/dateInput';
import { normalizeInlineTextOnCommit } from '../utils/textInput';
import { getRichTextPlainText } from '../utils/richText';
import { RichTextEditor } from './RichTextEditor';

type StatusFilter = 'all' | 'alive' | 'deceased' | 'unknown';
type GenderFilter = 'male' | 'female' | 'unknown';
type SortKey = 'firstName' | 'lastNames' | 'gender' | 'bloodGroup' | 'birthDate' | 'deathDate' | 'causeOfDeath' | 'knownDiseases' | 'notes';
type DateFilterMode = 'all' | 'year' | 'yearRange' | 'dateRange';
type PersonDateType = 'birthDate' | 'deathDate';
type BloodGroupFilter = 'unknown' | BloodGroupValue;

type DateFilterState = {
  mode: DateFilterMode;
  year: string;
  fromYear: string;
  toYear: string;
  fromDate: string;
  toDate: string;
};

const createEmptyDateFilter = (): DateFilterState => ({
  mode: 'all',
  year: '',
  fromYear: '',
  toYear: '',
  fromDate: '',
  toDate: '',
});

const parseDateNumber = (value?: string): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInputDate = (value: string): Date | null => {
  if (!value) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = parseDateNumber(yearRaw);
  const month = parseDateNumber(monthRaw);
  const day = parseDateNumber(dayRaw);
  if (year === null || month === null || day === null) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const toPersonDate = (dateInfo: Person['birthDate']): Date | null => {
  const year = parseDateNumber(dateInfo.year);
  if (year === null) return null;
  const monthRaw = parseDateNumber(dateInfo.month);
  const dayRaw = parseDateNumber(dateInfo.day);
  const month = monthRaw !== null && monthRaw >= 1 && monthRaw <= 12 ? monthRaw : 1;
  const day = dayRaw !== null && dayRaw >= 1 && dayRaw <= 31 ? dayRaw : 1;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const isWithinDateRange = (date: Date, start: Date | null, end: Date | null) => {
  if (!start && !end) return true;
  const lower = start && end ? (start <= end ? start : end) : start;
  const upper = start && end ? (start <= end ? end : start) : end;
  if (lower && date < lower) return false;
  if (upper && date > upper) return false;
  return true;
};

const matchesDateFilter = (dateInfo: Person['birthDate'], filter: DateFilterState) => {
  switch (filter.mode) {
    case 'year': {
      const filterYear = parseDateNumber(filter.year);
      if (filterYear === null) return true;
      const personYear = parseDateNumber(dateInfo.year);
      return personYear !== null && personYear === filterYear;
    }
    case 'yearRange': {
      const fromYear = parseDateNumber(filter.fromYear);
      const toYear = parseDateNumber(filter.toYear);
      if (fromYear === null && toYear === null) return true;
      const personYear = parseDateNumber(dateInfo.year);
      if (personYear === null) return false;
      const minYear = fromYear !== null && toYear !== null ? Math.min(fromYear, toYear) : (fromYear ?? Number.NEGATIVE_INFINITY);
      const maxYear = fromYear !== null && toYear !== null ? Math.max(fromYear, toYear) : (toYear ?? Number.POSITIVE_INFINITY);
      return personYear >= minYear && personYear <= maxYear;
    }
    case 'dateRange': {
      const fromDate = toInputDate(filter.fromDate);
      const toDate = toInputDate(filter.toDate);
      if (!fromDate && !toDate) return true;
      const personDate = toPersonDate(dateInfo);
      if (!personDate) return false;
      return isWithinDateRange(personDate, fromDate, toDate);
    }
    default:
      return true;
  }
};

const YEAR_MIN = 0;
const YEAR_MAX = 3000;

const clampYear = (year: number) => Math.min(YEAR_MAX, Math.max(YEAR_MIN, year));

const stepYear = (value: string, delta: number) => {
  const base = parseDateNumber(value) ?? new Date().getFullYear();
  return String(clampYear(base + delta));
};

const getSortableDateValue = (dateInfo: Person['birthDate']) => {
  const year = parseDateNumber(dateInfo.year);
  if (year === null) return Number.POSITIVE_INFINITY;
  const month = parseDateNumber(dateInfo.month) ?? 0;
  const day = parseDateNumber(dateInfo.day) ?? 0;
  return year * 10000 + month * 100 + day;
};

const getDateDraftKey = (personId: string, dateType: PersonDateType, field: DateField) =>
  `${personId}:${dateType}:${field}`;

const getDateDraftFieldValue = (
  drafts: Record<string, string>,
  personId: string,
  dateType: PersonDateType,
  field: DateField,
  fallback: string
) => {
  const key = getDateDraftKey(personId, dateType, field);
  return Object.prototype.hasOwnProperty.call(drafts, key) ? drafts[key] : fallback;
};

const normalizeLastName = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const normalizeKnownDisease = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const normalizeCauseOfDeath = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const MOBILE_WHEEL_RANGE = 24;
const MOBILE_WHEEL_ITEM_HEIGHT = 44;
const MOBILE_WHEEL_SPACER_HEIGHT = MOBILE_WHEEL_ITEM_HEIGHT * 2;
const MOBILE_WHEEL_SETTLE_MS = 160;
const DESKTOP_WHEEL_STEP_DELTA = 90;

interface YearWheelInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  ariaLabel: string;
  clearLabel: string;
  yearPlaceholder: string;
}

interface DateRangeInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  ariaLabel: string;
  clearLabel: string;
  min?: string;
  max?: string;
}

const DateRangeInput = ({
  value,
  onChange,
  ariaLabel,
  clearLabel,
  min,
  max,
}: DateRangeInputProps) => {
  return (
    <div className={`table-date-input-shell ${value ? 'has-value' : ''}`} role="group" aria-label={ariaLabel}>
      <input
        type="date"
        className="table-date-native-input"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
      />
      {value && (
        <button
          type="button"
          className="table-date-input-clear"
          onClick={() => onChange('')}
          aria-label={clearLabel}
          title={clearLabel}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

const YearWheelInput = ({
  value,
  onChange,
  ariaLabel,
  clearLabel,
  yearPlaceholder,
}: YearWheelInputProps) => {
  const currentYearValue = String(new Date().getFullYear());
  const desktopWheelRef = useRef<HTMLDivElement | null>(null);
  const mobileViewportRef = useRef<HTMLDivElement | null>(null);
  const mobileSettleTimerRef = useRef<number | null>(null);
  const desktopWheelAccumulatorRef = useRef(0);
  const activeYear = parseDateNumber(value) ?? new Date().getFullYear();
  const wheelYears = useMemo(() => {
    const years: number[] = [];
    for (let offset = -MOBILE_WHEEL_RANGE; offset <= MOBILE_WHEEL_RANGE; offset += 1) {
      years.push(clampYear(activeYear + offset));
    }
    return Array.from(new Set(years));
  }, [activeYear]);

  const activeIndex = Math.max(0, wheelYears.findIndex(year => year === activeYear));

  useEffect(() => {
    const viewport = mobileViewportRef.current;
    if (!viewport) return;

    const targetTop = MOBILE_WHEEL_SPACER_HEIGHT + activeIndex * MOBILE_WHEEL_ITEM_HEIGHT - (viewport.clientHeight / 2 - MOBILE_WHEEL_ITEM_HEIGHT / 2);
    if (Math.abs(viewport.scrollTop - targetTop) <= 1) return;

    viewport.scrollTo({ top: targetTop, behavior: 'auto' });
  }, [activeIndex]);

  useEffect(() => {
    return () => {
      if (mobileSettleTimerRef.current !== null) {
        window.clearTimeout(mobileSettleTimerRef.current);
        mobileSettleTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const desktopWheelElement = desktopWheelRef.current;
    if (!desktopWheelElement) return;

    const handleDesktopWheel = (event: WheelEvent) => {
      event.preventDefault();
      desktopWheelAccumulatorRef.current += event.deltaY;
      const stepCount = Math.trunc(Math.abs(desktopWheelAccumulatorRef.current) / DESKTOP_WHEEL_STEP_DELTA);
      if (stepCount <= 0) return;

      const direction = desktopWheelAccumulatorRef.current < 0 ? 1 : -1;
      desktopWheelAccumulatorRef.current -= Math.sign(desktopWheelAccumulatorRef.current) * stepCount * DESKTOP_WHEEL_STEP_DELTA;

      const baseYear = parseDateNumber(value) ?? new Date().getFullYear();
      const nextYear = clampYear(baseYear + direction * stepCount);
      onChange(String(nextYear));
    };

    desktopWheelElement.addEventListener('wheel', handleDesktopWheel, { passive: false });
    return () => {
      desktopWheelElement.removeEventListener('wheel', handleDesktopWheel);
    };
  }, [onChange, value]);

  const getClosestScrollIndex = () => {
    const viewport = mobileViewportRef.current;
    if (!viewport) return null;

    const centerY = viewport.scrollTop + viewport.clientHeight / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    wheelYears.forEach((_, index) => {
      const yearCenter = MOBILE_WHEEL_SPACER_HEIGHT + index * MOBILE_WHEEL_ITEM_HEIGHT + MOBILE_WHEEL_ITEM_HEIGHT / 2;
      const distance = Math.abs(centerY - yearCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  };

  const commitClosestYearFromScroll = () => {
    const viewport = mobileViewportRef.current;
    if (!viewport) return;
    const closestIndex = getClosestScrollIndex();
    if (closestIndex === null) return;

    const nextYear = wheelYears[closestIndex];
    const targetTop = MOBILE_WHEEL_SPACER_HEIGHT + closestIndex * MOBILE_WHEEL_ITEM_HEIGHT - (viewport.clientHeight / 2 - MOBILE_WHEEL_ITEM_HEIGHT / 2);
    if (Math.abs(viewport.scrollTop - targetTop) > 1) {
      viewport.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
    if (String(nextYear) !== value) {
      onChange(String(nextYear));
    }
  };

  const handleMobileScroll = () => {
    if (mobileSettleTimerRef.current !== null) {
      window.clearTimeout(mobileSettleTimerRef.current);
    }
    mobileSettleTimerRef.current = window.setTimeout(() => {
      commitClosestYearFromScroll();
      mobileSettleTimerRef.current = null;
    }, MOBILE_WHEEL_SETTLE_MS);
  };

  const handleMobileYearClick = (index: number, year: number) => {
    if (mobileSettleTimerRef.current !== null) {
      window.clearTimeout(mobileSettleTimerRef.current);
      mobileSettleTimerRef.current = null;
    }

    const viewport = mobileViewportRef.current;
    if (viewport) {
      const targetTop = MOBILE_WHEEL_SPACER_HEIGHT + index * MOBILE_WHEEL_ITEM_HEIGHT - (viewport.clientHeight / 2 - MOBILE_WHEEL_ITEM_HEIGHT / 2);
      if (Math.abs(viewport.scrollTop - targetTop) > 1) {
        viewport.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    }

    if (String(year) !== value) {
      onChange(String(year));
    }
  };

  const handleDesktopInputChange = (raw: string) => {
    const sanitized = raw.replace(/\D+/g, '').slice(0, 4);
    onChange(sanitized);
  };

  const clampDesktopInputYear = () => {
    if (!value) return;
    const parsed = parseDateNumber(value);
    if (parsed === null) {
      onChange('');
      return;
    }
    const clamped = String(clampYear(parsed));
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  return (
    <>
      <div
        ref={desktopWheelRef}
        className="table-year-wheel table-year-wheel-desktop"
      >
        <button
          type="button"
          className="table-year-wheel-btn"
          onClick={() => onChange(stepYear(value, 1))}
          aria-label={`${ariaLabel} +1`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]*"
          className={`table-year-wheel-value ${value ? '' : 'is-empty'}`}
          value={value}
          placeholder={yearPlaceholder}
          onChange={(event) => handleDesktopInputChange(event.target.value)}
          onBlur={clampDesktopInputYear}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              clampDesktopInputYear();
              event.currentTarget.blur();
            }
          }}
          aria-label={ariaLabel}
        />
        <button
          type="button"
          className="table-year-wheel-btn"
          onClick={() => onChange(stepYear(value, -1))}
          aria-label={`${ariaLabel} -1`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {value && (
          <button
            type="button"
            className="table-year-wheel-clear"
            onClick={() => onChange(currentYearValue)}
            aria-label={clearLabel}
            title={clearLabel}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        )}
      </div>

      <div className="table-year-wheel-mobile" aria-label={ariaLabel}>
        <div className="table-year-wheel-mobile-shade top" aria-hidden="true" />
        <div className="table-year-wheel-mobile-shade bottom" aria-hidden="true" />
        <div className="table-year-wheel-mobile-focus" aria-hidden="true" />
        <div
          ref={mobileViewportRef}
          className="table-year-wheel-mobile-viewport"
          onScroll={handleMobileScroll}
        >
          <div className="table-year-wheel-mobile-spacer" aria-hidden="true" />
          {wheelYears.map((year, index) => (
            <button
              key={`mobile-wheel-${ariaLabel}-${year}`}
              type="button"
              className={`table-year-wheel-mobile-item ${year === activeYear ? 'is-active' : ''}`}
              onClick={() => handleMobileYearClick(index, year)}
            >
              {year}
            </button>
          ))}
          <div className="table-year-wheel-mobile-spacer" aria-hidden="true" />
        </div>
        {value && (
          <button
            type="button"
            className="table-year-wheel-mobile-clear"
            onClick={() => onChange(currentYearValue)}
            aria-label={clearLabel}
            title={clearLabel}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
};

export const FamilyTableView = () => {
  const { familyTree, setCurrentView, allTrees, activeTreeId, updatePerson, language } = useFamilyTree();
  const copy = translations[language];
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilters, setGenderFilters] = useState<GenderFilter[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [bloodGroupFilters, setBloodGroupFilters] = useState<BloodGroupFilter[]>([]);
  const [birthDateFilter, setBirthDateFilter] = useState<DateFilterState>(createEmptyDateFilter);
  const [deathDateFilter, setDeathDateFilter] = useState<DateFilterState>(createEmptyDateFilter);
  const [activeLastNameField, setActiveLastNameField] = useState<{ personId: string; index: number } | null>(null);
  const [activeKnownDiseaseField, setActiveKnownDiseaseField] = useState<{ personId: string; index: number } | null>(null);
  const [activeCauseOfDeathPersonId, setActiveCauseOfDeathPersonId] = useState<string | null>(null);
  const [dateDrafts, setDateDrafts] = useState<Record<string, string>>({});
  const [selectedKnownDiseases, setSelectedKnownDiseases] = useState<string[]>([]);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isBloodGroupDropdownOpen, setIsBloodGroupDropdownOpen] = useState(false);
  const bloodGroupDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isKnownDiseaseDropdownOpen, setIsKnownDiseaseDropdownOpen] = useState(false);
  const knownDiseaseDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isBirthModeDropdownOpen, setIsBirthModeDropdownOpen] = useState(false);
  const birthModeDropdownRef = useRef<HTMLDivElement | null>(null);
  const [isDeathModeDropdownOpen, setIsDeathModeDropdownOpen] = useState(false);
  const deathModeDropdownRef = useRef<HTMLDivElement | null>(null);
  const [activeRowBloodGroupPersonId, setActiveRowBloodGroupPersonId] = useState<string | null>(null);
  const rowBloodGroupDropdownRef = useRef<HTMLDivElement | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  const [expandedMobilePersonId, setExpandedMobilePersonId] = useState<string | null>(null);

  const toggleStatusDropdown = () => {
    setIsStatusDropdownOpen(prev => {
      const next = !prev;
      if (next) {
        setActiveRowBloodGroupPersonId(null);
        setIsBloodGroupDropdownOpen(false);
        setIsKnownDiseaseDropdownOpen(false);
        setIsBirthModeDropdownOpen(false);
        setIsDeathModeDropdownOpen(false);
      }
      return next;
    });
  };

  const toggleBloodGroupDropdown = () => {
    setIsBloodGroupDropdownOpen(prev => {
      const next = !prev;
      if (next) {
        setActiveRowBloodGroupPersonId(null);
        setIsStatusDropdownOpen(false);
        setIsKnownDiseaseDropdownOpen(false);
        setIsBirthModeDropdownOpen(false);
        setIsDeathModeDropdownOpen(false);
      }
      return next;
    });
  };

  const toggleKnownDiseaseDropdown = () => {
    setIsKnownDiseaseDropdownOpen(prev => {
      const next = !prev;
      if (next) {
        setActiveRowBloodGroupPersonId(null);
        setIsStatusDropdownOpen(false);
        setIsBloodGroupDropdownOpen(false);
        setIsBirthModeDropdownOpen(false);
        setIsDeathModeDropdownOpen(false);
      }
      return next;
    });
  };

  const toggleBirthModeDropdown = () => {
    setIsBirthModeDropdownOpen(prev => {
      const next = !prev;
      if (next) {
        setActiveRowBloodGroupPersonId(null);
        setIsStatusDropdownOpen(false);
        setIsBloodGroupDropdownOpen(false);
        setIsKnownDiseaseDropdownOpen(false);
        setIsDeathModeDropdownOpen(false);
      }
      return next;
    });
  };

  const toggleDeathModeDropdown = () => {
    setIsDeathModeDropdownOpen(prev => {
      const next = !prev;
      if (next) {
        setActiveRowBloodGroupPersonId(null);
        setIsStatusDropdownOpen(false);
        setIsBloodGroupDropdownOpen(false);
        setIsKnownDiseaseDropdownOpen(false);
        setIsBirthModeDropdownOpen(false);
      }
      return next;
    });
  };

  const toggleGenderFilter = (filter: GenderFilter) => {
    setGenderFilters(prev => (
      prev.includes(filter)
        ? prev.filter(value => value !== filter)
        : [...prev, filter]
    ));
  };

  const toggleMobilePersonRow = (personId: string) => {
    setActiveRowBloodGroupPersonId(null);
    setExpandedMobilePersonId(prev => (prev === personId ? null : personId));
  };

  useEffect(() => {
    if (
      !isStatusDropdownOpen
      && !isBloodGroupDropdownOpen
      && !isKnownDiseaseDropdownOpen
      && !isBirthModeDropdownOpen
      && !isDeathModeDropdownOpen
      && !activeRowBloodGroupPersonId
    ) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(target)) {
        setIsStatusDropdownOpen(false);
      }
      if (bloodGroupDropdownRef.current && !bloodGroupDropdownRef.current.contains(target)) {
        setIsBloodGroupDropdownOpen(false);
      }
      if (knownDiseaseDropdownRef.current && !knownDiseaseDropdownRef.current.contains(target)) {
        setIsKnownDiseaseDropdownOpen(false);
      }
      if (birthModeDropdownRef.current && !birthModeDropdownRef.current.contains(target)) {
        setIsBirthModeDropdownOpen(false);
      }
      if (deathModeDropdownRef.current && !deathModeDropdownRef.current.contains(target)) {
        setIsDeathModeDropdownOpen(false);
      }
      if (rowBloodGroupDropdownRef.current && !rowBloodGroupDropdownRef.current.contains(target)) {
        setActiveRowBloodGroupPersonId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsStatusDropdownOpen(false);
        setIsBloodGroupDropdownOpen(false);
        setIsKnownDiseaseDropdownOpen(false);
        setIsBirthModeDropdownOpen(false);
        setIsDeathModeDropdownOpen(false);
        setActiveRowBloodGroupPersonId(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [
    isStatusDropdownOpen,
    isBloodGroupDropdownOpen,
    isKnownDiseaseDropdownOpen,
    isBirthModeDropdownOpen,
    isDeathModeDropdownOpen,
    activeRowBloodGroupPersonId,
  ]);

  if (!familyTree) {
    return (
      <div className="family-table-view">
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

  const getLastNames = (person: Person) => {
    const names = getLastNameList(person);
    return names.length > 0 ? names : [''];
  };

  const getKnownDiseases = (person: Person) => {
    const diseases = getKnownDiseaseEntries(person);
    return diseases.length > 0 ? diseases : [{ name: '', hereditary: false }];
  };

  const inheritedRiskByPersonId = useMemo(() => {
    const result = new Map<string, string[]>();
    Object.keys(familyTree.persons).forEach(personId => {
      result.set(personId, getInheritedHereditaryDiseaseRisks(familyTree, personId));
    });
    return result;
  }, [familyTree]);

  const allLastNames = useMemo(() => {
    const unique = new Set<string>();
    Object.values(familyTree.persons).forEach(entry => {
      getLastNameList(entry).forEach(name => {
        const trimmed = name.trim();
        if (trimmed) unique.add(trimmed);
      });
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [familyTree.persons]);

  const allKnownDiseases = useMemo(() => {
    const unique = new Set<string>();
    Object.values(familyTree.persons).forEach(entry => {
      getKnownDiseaseList(entry).forEach(disease => {
        const trimmed = disease.trim();
        if (trimmed) unique.add(trimmed);
      });
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [familyTree.persons]);

  const allCausesOfDeath = useMemo(() => {
    const unique = new Set<string>();
    Object.values(familyTree.persons).forEach(entry => {
      const trimmed = (entry.causeOfDeath ?? '').trim();
      if (trimmed) unique.add(trimmed);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [familyTree.persons]);

  const handleLastNameChange = (personId: string, index: number, value: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const next = [...getLastNames(person)];
    next[index] = value;
    updatePerson(personId, { lastNames: next });
  };

  const handleFirstNameBlur = (personId: string, value: string) => {
    updatePerson(personId, { firstName: normalizeInlineTextOnCommit(value) });
  };

  const handleBloodGroupChange = (personId: string, value: string) => {
    updatePerson(personId, { bloodGroup: value });
  };

  const toggleRowBloodGroupDropdown = (personId: string) => {
    setActiveRowBloodGroupPersonId(prev => (prev === personId ? null : personId));
    setIsStatusDropdownOpen(false);
    setIsBloodGroupDropdownOpen(false);
    setIsKnownDiseaseDropdownOpen(false);
    setIsBirthModeDropdownOpen(false);
    setIsDeathModeDropdownOpen(false);
  };

  const handleLastNameBlur = (personId: string, index: number, value: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const next = [...getLastNames(person)];
    next[index] = normalizeInlineTextOnCommit(value);
    updatePerson(personId, { lastNames: next });
  };

  const handleAddLastName = (personId: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    updatePerson(personId, { lastNames: [...getLastNames(person), ''] });
  };

  const handleRemoveLastName = (personId: string, index: number) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const current = getLastNames(person);
    if (current.length <= 1) {
      updatePerson(personId, { lastNames: [''] });
      return;
    }
    const next = current.filter((_, idx) => idx !== index);
    updatePerson(personId, { lastNames: next });
  };

  const getMatchingLastNames = (personId: string, inputValue: string) => {
    const normalizedInput = normalizeLastName(inputValue);
    if (!normalizedInput) return [];
    const person = familyTree.persons[personId];
    if (!person) return [];
    const currentNormalized = new Set(
      getLastNames(person)
        .map(name => name.trim())
        .filter(Boolean)
        .map(normalizeLastName)
    );
    return allLastNames
      .filter(name => normalizeLastName(name).includes(normalizedInput))
      .filter(name => !currentNormalized.has(normalizeLastName(name)))
      .slice(0, 8);
  };

  const applySuggestedLastName = (personId: string, index: number, name: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = getLastNames(person);
    const normalized = normalizeLastName(trimmed);
    const duplicateElsewhere = current.some((entry, entryIndex) => (
      entryIndex !== index && normalizeLastName(entry) === normalized
    ));
    if (duplicateElsewhere) return;
    const next = [...current];
    next[index] = trimmed;
    updatePerson(personId, { lastNames: next });
  };

  const handleKnownDiseaseChange = (personId: string, index: number, value: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const next = [...getKnownDiseases(person)];
    next[index] = { ...next[index], name: value };
    updatePerson(personId, { knownDiseases: next });
  };

  const handleKnownDiseaseBlur = (personId: string, index: number, value: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const next = [...getKnownDiseases(person)];
    next[index] = { ...next[index], name: normalizeInlineTextOnCommit(value) };
    updatePerson(personId, { knownDiseases: next });
  };

  const handleKnownDiseaseHereditaryChange = (personId: string, index: number, hereditary: boolean) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const next = [...getKnownDiseases(person)];
    next[index] = { ...next[index], hereditary };
    updatePerson(personId, { knownDiseases: next });
  };

  const handleAddKnownDisease = (personId: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    updatePerson(personId, { knownDiseases: [...getKnownDiseases(person), { name: '', hereditary: false }] });
  };

  const handleRemoveKnownDisease = (personId: string, index: number) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const current = getKnownDiseases(person);
    if (current.length <= 1) {
      updatePerson(personId, { knownDiseases: [{ name: '', hereditary: false }] });
      return;
    }
    const next = current.filter((_, idx) => idx !== index);
    updatePerson(personId, { knownDiseases: next });
  };

  const getMatchingKnownDiseases = (personId: string, inputValue: string) => {
    const normalizedInput = normalizeKnownDisease(inputValue);
    if (!normalizedInput) return [];
    const person = familyTree.persons[personId];
    if (!person) return [];
    const currentNormalized = new Set(
      getKnownDiseases(person)
        .map(entry => entry.name.trim())
        .filter(Boolean)
        .map(normalizeKnownDisease)
    );
    return allKnownDiseases
      .filter(name => normalizeKnownDisease(name).includes(normalizedInput))
      .filter(name => !currentNormalized.has(normalizeKnownDisease(name)))
      .slice(0, 8);
  };

  const applySuggestedKnownDisease = (personId: string, index: number, disease: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const trimmed = disease.trim();
    if (!trimmed) return;
    const current = getKnownDiseases(person);
    const normalized = normalizeKnownDisease(trimmed);
    const duplicateElsewhere = current.some((entry, entryIndex) => (
      entryIndex !== index && normalizeKnownDisease(entry.name) === normalized
    ));
    if (duplicateElsewhere) return;
    const next = [...current];
    next[index] = { ...next[index], name: trimmed };
    updatePerson(personId, { knownDiseases: next });
  };

  const applyInheritedRiskSuggestion = (personId: string, disease: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const trimmed = disease.trim();
    if (!trimmed) return;

    const current = getKnownDiseases(person);
    const normalized = normalizeKnownDisease(trimmed);
    const existingIndex = current.findIndex((entry) => normalizeKnownDisease(entry.name) === normalized);

    if (existingIndex >= 0) {
      if (current[existingIndex].hereditary === true) return;
      const next = [...current];
      next[existingIndex] = { ...next[existingIndex], hereditary: true };
      updatePerson(personId, { knownDiseases: next });
      return;
    }

    const firstEmptyIndex = current.findIndex(entry => !entry.name.trim());
    if (firstEmptyIndex >= 0) {
      const next = [...current];
      next[firstEmptyIndex] = { ...next[firstEmptyIndex], name: trimmed, hereditary: true };
      updatePerson(personId, { knownDiseases: next });
      return;
    }

    updatePerson(personId, { knownDiseases: [...current, { name: trimmed, hereditary: true }] });
  };

  const getMatchingCausesOfDeath = (personId: string, inputValue: string) => {
    const normalizedInput = normalizeCauseOfDeath(inputValue);
    if (!normalizedInput) return [];
    const person = familyTree.persons[personId];
    if (!person) return [];
    const currentNormalized = normalizeCauseOfDeath(person.causeOfDeath ?? '');
    return allCausesOfDeath
      .filter(cause => normalizeCauseOfDeath(cause).includes(normalizedInput))
      .filter(cause => normalizeCauseOfDeath(cause) !== currentNormalized)
      .slice(0, 8);
  };

  const applySuggestedCauseOfDeath = (personId: string, cause: string) => {
    const trimmed = cause.trim();
    if (!trimmed) return;
    updatePerson(personId, { causeOfDeath: trimmed });
    setActiveCauseOfDeathPersonId(null);
  };

  const handleCauseOfDeathBlur = (personId: string, value: string) => {
    updatePerson(personId, { causeOfDeath: normalizeInlineTextOnCommit(value) });
  };

  const getDateInputValue = (person: Person, dateType: PersonDateType, field: DateField) =>
    getDateDraftFieldValue(dateDrafts, person.id, dateType, field, person[dateType][field] ?? '');

  const getDateValidationMessage = (field: DateField) => {
    if (field === 'day') return `${copy.day}: 01-31`;
    if (field === 'month') return `${copy.month}: 01-12`;
    return `${copy.year}: ${new Date().getFullYear()}`;
  };

  const handleDateChange = (personId: string, dateType: PersonDateType, field: DateField, value: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;

    setDateDrafts(prev => {
      const currentDate = {
        day: getDateDraftFieldValue(prev, personId, dateType, 'day', person[dateType].day ?? ''),
        month: getDateDraftFieldValue(prev, personId, dateType, 'month', person[dateType].month ?? ''),
        year: getDateDraftFieldValue(prev, personId, dateType, 'year', person[dateType].year ?? ''),
      };
      const nextDate = sanitizeDateInput(currentDate, field, value);
      if (!nextDate) return prev;

      return {
        ...prev,
        [getDateDraftKey(personId, dateType, 'day')]: nextDate.day ?? '',
        [getDateDraftKey(personId, dateType, 'month')]: nextDate.month ?? '',
        [getDateDraftKey(personId, dateType, 'year')]: nextDate.year ?? '',
      };
    });
  };

  const handleDateBlur = (
    personId: string,
    dateType: PersonDateType,
    field: DateField,
    input: HTMLInputElement
  ) => {
    const person = familyTree.persons[personId];
    if (!person) return;

    const dayKey = getDateDraftKey(personId, dateType, 'day');
    const monthKey = getDateDraftKey(personId, dateType, 'month');
    const yearKey = getDateDraftKey(personId, dateType, 'year');
    const hasDraft = dayKey in dateDrafts || monthKey in dateDrafts || yearKey in dateDrafts;
    if (!hasDraft) return;

    const currentDate = {
      ...person[dateType],
      day: getDateDraftFieldValue(dateDrafts, personId, dateType, 'day', person[dateType].day ?? ''),
      month: getDateDraftFieldValue(dateDrafts, personId, dateType, 'month', person[dateType].month ?? ''),
      year: getDateDraftFieldValue(dateDrafts, personId, dateType, 'year', person[dateType].year ?? ''),
      [field]: input.value,
    };
    const { nextDate, invalidField } = normalizeDateInputOnBlur(currentDate, field);
    if (invalidField) {
      input.setCustomValidity(getDateValidationMessage(invalidField));
      input.reportValidity();
    } else {
      input.setCustomValidity('');
    }

    updatePerson(personId, { [dateType]: nextDate } as Partial<Person>);
    setDateDrafts(prev => {
      const next = { ...prev };
      delete next[dayKey];
      delete next[monthKey];
      delete next[yearKey];
      return next;
    });
  };

  const cyclePersonGender = (person: Person) => {
    const cycle: Person['gender'][] = ['male', 'female', null];
    const currentIndex = cycle.findIndex(value => value === person.gender);
    const safeIndex = currentIndex >= 0 ? currentIndex : 2;
    const nextGender = cycle[(safeIndex + 1) % cycle.length];
    updatePerson(person.id, { gender: nextGender });
  };

  const getStatus = (person: Person) => {
    if (hasDateInfo(person.deathDate)) return 'deceased';
    if (hasDateInfo(person.birthDate)) return 'alive';
    return 'unknown';
  };

  const getPrimaryLastName = (person: Person) => {
    const firstFilled = getLastNameList(person).find(name => name.trim().length > 0);
    return firstFilled ?? '';
  };

  const getCompactDateLabel = (date: Person['birthDate']) => {
    const formatted = formatDateInfo(date).trim();
    return formatted;
  };

  const getAgeYears = (person: Person) => {
    const birthYear = parseDateNumber(person.birthDate.year);
    if (birthYear === null) return null;

    const birthMonth = parseDateNumber(person.birthDate.month);
    const birthDay = parseDateNumber(person.birthDate.day);
    const deathYear = parseDateNumber(person.deathDate.year);
    const deathMonth = parseDateNumber(person.deathDate.month);
    const deathDay = parseDateNumber(person.deathDate.day);

    const now = new Date();
    const endYear = deathYear ?? now.getFullYear();
    const endMonth = deathYear !== null ? (deathMonth ?? 12) : now.getMonth() + 1;
    const endDay = deathYear !== null ? (deathDay ?? 31) : now.getDate();

    let age = endYear - birthYear;
    if (birthMonth !== null) {
      const safeBirthDay = birthDay ?? 1;
      const beforeBirthday = endMonth < birthMonth || (endMonth === birthMonth && endDay < safeBirthDay);
      if (beforeBirthday) age -= 1;
    }

    return age >= 0 ? age : null;
  };

  const renderGenderIcon = (gender: Person['gender']) => {
    if (gender === 'male') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10" cy="14" r="4" />
          <path d="M14 10l6-6" />
          <path d="M15 4h5v5" />
        </svg>
      );
    }
    if (gender === 'female') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M12 12v8" />
          <path d="M9 17h6" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <path d="M9 12h6" />
      </svg>
    );
  };

  const getSearchText = (person: Person) => {
    const inheritedRisks = inheritedRiskByPersonId.get(person.id) ?? [];
    const notesPlain = getRichTextPlainText(person.notes ?? '');
    const parts = [
      person.firstName,
      ...getLastNameList(person),
      getBloodGroup(person),
      ...getKnownDiseaseList(person),
      ...inheritedRisks,
      person.gender ?? '',
      formatDateInfo(person.birthDate),
      formatDateInfo(person.deathDate),
      person.causeOfDeath ?? '',
      notesPlain,
    ];
    return parts.join(' ').toLowerCase();
  };

  const sortValue = (person: Person, key: SortKey) => {
    switch (key) {
      case 'firstName':
        return (person.firstName ?? '').toLowerCase();
      case 'lastNames':
        return getLastNameList(person).join(' ').toLowerCase();
      case 'gender':
        return (person.gender ?? '').toLowerCase();
      case 'bloodGroup':
        return getBloodGroup(person);
      case 'birthDate':
        return getSortableDateValue(person.birthDate);
      case 'deathDate':
        return getSortableDateValue(person.deathDate);
      case 'causeOfDeath':
        return (person.causeOfDeath ?? '').toLowerCase();
      case 'knownDiseases':
        return getKnownDiseaseList(person).join(' ').toLowerCase();
      case 'notes':
        return getRichTextPlainText(person.notes ?? '').toLowerCase();
      default:
        return '';
    }
  };

  const people = useMemo(() => {
    const list = Object.values(familyTree.persons);
    const term = searchTerm.trim().toLowerCase();
    const normalizedSelectedKnownDiseases = selectedKnownDiseases.map(normalizeKnownDisease);
    const hasGenderFilters = genderFilters.length > 0;

    let filtered = list.filter(person => {
      if (term && !getSearchText(person).includes(term)) {
        return false;
      }
      if (hasGenderFilters) {
        const personGender: GenderFilter = person.gender ?? 'unknown';
        if (!genderFilters.includes(personGender)) {
          return false;
        }
      }
      if (statusFilter !== 'all') {
        const status = getStatus(person);
        if (statusFilter !== status) return false;
      }
      if (bloodGroupFilters.length > 0) {
        const personBloodGroup = getBloodGroup(person);
        if (personBloodGroup) {
          if (!bloodGroupFilters.includes(personBloodGroup)) return false;
        } else if (!bloodGroupFilters.includes('unknown')) return false;
      }
      if (normalizedSelectedKnownDiseases.length > 0) {
        const personKnownDiseaseSet = new Set(
          getKnownDiseaseList(person)
            .map(name => normalizeKnownDisease(name))
            .filter(Boolean)
        );
        const hasMatchingKnownDisease = normalizedSelectedKnownDiseases.some(disease => personKnownDiseaseSet.has(disease));
        if (!hasMatchingKnownDisease) return false;
      }
      if (!matchesDateFilter(person.birthDate, birthDateFilter)) {
        return false;
      }
      if (!matchesDateFilter(person.deathDate, deathDateFilter)) {
        return false;
      }
      return true;
    });

    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const aValue = sortValue(a, sortConfig.key);
        const bValue = sortValue(b, sortConfig.key);
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [familyTree.persons, genderFilters, searchTerm, sortConfig, statusFilter, bloodGroupFilters, birthDateFilter, deathDateFilter, inheritedRiskByPersonId, selectedKnownDiseases]);

  useEffect(() => {
    if (!expandedMobilePersonId) return;
    if (!people.some(person => person.id === expandedMobilePersonId)) {
      setExpandedMobilePersonId(null);
    }
  }, [expandedMobilePersonId, people]);

  const setSort = (key: SortKey) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortIndicator = (key: SortKey) => {
    const isActive = Boolean(sortConfig && sortConfig.key === key);
    const direction = isActive ? sortConfig?.direction : null;
    const className = `table-sort-indicator ${direction === 'asc' ? 'is-asc' : direction === 'desc' ? 'is-desc' : 'is-idle'}`;

    return (
      <span className={className} aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path className="table-sort-up" d="M5 6.2 8 3.2l3 3" />
          <path className="table-sort-down" d="M5 9.8 8 12.8l3-3" />
        </svg>
      </span>
    );
  };

  const treeName = activeTreeId ? allTrees[activeTreeId]?.name : copy.defaultTreeTitle;
  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: copy.filterAll },
    { value: 'alive', label: copy.filterStatusAlive },
    { value: 'deceased', label: copy.filterStatusDeceased },
    { value: 'unknown', label: copy.filterStatusUnknown },
  ];
  const bloodGroupFilterOptions: { value: BloodGroupFilter; label: string }[] = [
    ...BLOOD_GROUP_OPTIONS.map(group => ({ value: group, label: group })),
    { value: 'unknown', label: copy.filterUnknown },
  ];
  const getBloodGroupFilterLabel = (value: BloodGroupFilter) => (
    value === 'unknown' ? copy.filterUnknown : value
  );
  const selectedBloodGroupLabel = bloodGroupFilters.length === 0
    ? copy.filterAll
    : bloodGroupFilters.length === 1
      ? getBloodGroupFilterLabel(bloodGroupFilters[0])
      : `${getBloodGroupFilterLabel(bloodGroupFilters[0])} +${bloodGroupFilters.length - 1}`;
  const selectedBloodGroupTitle = bloodGroupFilters.length === 0
    ? copy.filterAll
    : bloodGroupFilters.map(getBloodGroupFilterLabel).join(', ');
  const selectedStatusLabel = statusOptions.find(option => option.value === statusFilter)?.label ?? copy.filterAll;
  const selectedKnownDiseaseLabel = selectedKnownDiseases.length === 0
    ? copy.filterAll
    : selectedKnownDiseases.length === 1
      ? selectedKnownDiseases[0]
      : `${selectedKnownDiseases[0]} +${selectedKnownDiseases.length - 1}`;
  const dateFilterModes: { value: DateFilterMode; label: string }[] = [
    { value: 'all', label: copy.filterAll },
    { value: 'year', label: copy.filterDateModeYear },
    { value: 'yearRange', label: copy.filterDateModeYearRange },
    { value: 'dateRange', label: copy.filterDateModeDateRange },
  ];
  const selectedBirthModeLabel = dateFilterModes.find(mode => mode.value === birthDateFilter.mode)?.label ?? copy.filterAll;
  const selectedDeathModeLabel = dateFilterModes.find(mode => mode.value === deathDateFilter.mode)?.label ?? copy.filterAll;
  const hasBirthFilterValue = birthDateFilter.mode !== 'all'
    || Boolean(birthDateFilter.year || birthDateFilter.fromYear || birthDateFilter.toYear || birthDateFilter.fromDate || birthDateFilter.toDate);
  const hasDeathFilterValue = deathDateFilter.mode !== 'all'
    || Boolean(deathDateFilter.year || deathDateFilter.fromYear || deathDateFilter.toYear || deathDateFilter.fromDate || deathDateFilter.toDate);

  return (
    <div className="family-table-view">
      <div className="family-table-header">
        <div className="family-table-actions">
          <button type="button" className="btn-secondary" onClick={() => setCurrentView('manager')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
              <path d="M9 12h10" />
            </svg>
            {copy.backToOverview}
          </button>
          <button type="button" className="btn-primary" onClick={() => setCurrentView('tree')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="5" r="2.5" />
              <circle cx="6" cy="19" r="2.5" />
              <circle cx="18" cy="19" r="2.5" />
              <path d="M12 7.5v4" />
              <path d="M12 11.5L6 16.5" />
              <path d="M12 11.5l6 5" />
            </svg>
            {copy.backToTree}
          </button>
        </div>
        <h1>{copy.tableTitle}</h1>
        <p className="family-table-tree-name">{treeName}</p>
      </div>

      <div className="family-table-controls">
        <label className="table-search-shell" aria-label={copy.tableSearchPlaceholder}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="text"
            className="table-search"
            placeholder={copy.tableSearchPlaceholder}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>
        <div className="table-filters">
          <div className="table-filters-row">
          <div className="table-gender-toggle" role="group" aria-label={copy.filterGenderLabel}>
            <button
              type="button"
              className={`table-gender-btn all ${genderFilters.length === 0 ? 'active' : ''}`}
              onClick={() => setGenderFilters([])}
              title={copy.filterAll}
              aria-pressed={genderFilters.length === 0}
              aria-label={copy.filterAll}
            >
              <span className="table-gender-btn-label">{copy.filterAll}</span>
            </button>
            <button
              type="button"
              className={`table-gender-btn female ${genderFilters.includes('female') ? 'active' : ''}`}
              onClick={() => toggleGenderFilter('female')}
              title={copy.filterFemale}
              aria-pressed={genderFilters.includes('female')}
              aria-label={copy.filterFemale}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M12 12v8" />
                <path d="M9 17h6" />
              </svg>
            </button>
            <button
              type="button"
              className={`table-gender-btn male ${genderFilters.includes('male') ? 'active' : ''}`}
              onClick={() => toggleGenderFilter('male')}
              title={copy.filterMale}
              aria-pressed={genderFilters.includes('male')}
              aria-label={copy.filterMale}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="10" cy="14" r="4" />
                <path d="M14 10l6-6" />
                <path d="M15 4h5v5" />
              </svg>
            </button>
            <button
              type="button"
              className={`table-gender-btn unknown ${genderFilters.includes('unknown') ? 'active' : ''}`}
              onClick={() => toggleGenderFilter('unknown')}
              title={copy.filterUnknown}
              aria-pressed={genderFilters.includes('unknown')}
              aria-label={copy.filterUnknown}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8" />
                <path d="M9 12h6" />
              </svg>
            </button>
          </div>
          <div className={`table-status-filter ${isStatusDropdownOpen ? 'open' : ''}`}>
            <span>{copy.filterStatusLabel}</span>
            <div className={`table-status-dropdown ${isStatusDropdownOpen ? 'open' : ''}`} ref={statusDropdownRef}>
              <button
                type="button"
                className="table-status-trigger"
                onClick={toggleStatusDropdown}
                aria-haspopup="listbox"
                aria-expanded={isStatusDropdownOpen}
                aria-label={copy.filterStatusLabel}
              >
                <span>{selectedStatusLabel}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isStatusDropdownOpen && (
                <div className="table-status-menu" role="listbox" aria-label={copy.filterStatusLabel}>
                  {statusOptions.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={`table-status-option ${statusFilter === option.value ? 'active' : ''}`}
                      role="option"
                      aria-selected={statusFilter === option.value}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setStatusFilter(option.value);
                        setIsStatusDropdownOpen(false);
                        setIsBloodGroupDropdownOpen(false);
                        setIsKnownDiseaseDropdownOpen(false);
                        setIsBirthModeDropdownOpen(false);
                        setIsDeathModeDropdownOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className={`table-status-filter table-bloodgroup-filter ${isBloodGroupDropdownOpen ? 'open' : ''}`}>
            <span>{copy.filterBloodGroupLabel}</span>
            <div className={`table-status-dropdown ${isBloodGroupDropdownOpen ? 'open' : ''}`} ref={bloodGroupDropdownRef}>
              <button
                type="button"
                className="table-status-trigger"
                onClick={toggleBloodGroupDropdown}
                aria-haspopup="listbox"
                aria-expanded={isBloodGroupDropdownOpen}
                aria-label={copy.filterBloodGroupLabel}
                title={selectedBloodGroupTitle}
              >
                <span>{selectedBloodGroupLabel}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isBloodGroupDropdownOpen && (
                <div
                  className="table-status-menu table-bloodgroup-filter-menu"
                  role="listbox"
                  aria-label={copy.filterBloodGroupLabel}
                  aria-multiselectable="true"
                >
                  <button
                    type="button"
                    className={`table-status-option table-disease-option ${bloodGroupFilters.length === 0 ? 'active' : ''}`}
                    role="option"
                    aria-selected={bloodGroupFilters.length === 0}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setBloodGroupFilters([]);
                    }}
                  >
                    <span>{copy.filterAll}</span>
                    <span className="table-disease-check" aria-hidden="true">{bloodGroupFilters.length === 0 ? '✓' : ''}</span>
                  </button>
                  {bloodGroupFilterOptions.map(option => {
                    const isSelected = bloodGroupFilters.includes(option.value);
                    return (
                      <button
                        key={`blood-group-filter-${option.value}`}
                        type="button"
                        className={`table-status-option table-disease-option ${isSelected ? 'active' : ''}`}
                        role="option"
                        aria-selected={isSelected}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setBloodGroupFilters(prev => (
                            prev.includes(option.value)
                              ? prev.filter(value => value !== option.value)
                              : [...prev, option.value]
                          ));
                        }}
                      >
                        <span>{option.label}</span>
                        <span className="table-disease-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className={`table-status-filter table-disease-filter ${isKnownDiseaseDropdownOpen ? 'open' : ''}`}>
            <span>{copy.columnKnownDiseases}</span>
            <div className={`table-status-dropdown ${isKnownDiseaseDropdownOpen ? 'open' : ''}`} ref={knownDiseaseDropdownRef}>
              <button
                type="button"
                className="table-status-trigger"
                onClick={toggleKnownDiseaseDropdown}
                aria-haspopup="listbox"
                aria-expanded={isKnownDiseaseDropdownOpen}
                aria-label={copy.columnKnownDiseases}
                title={selectedKnownDiseases.length > 0 ? selectedKnownDiseases.join(', ') : copy.filterAll}
              >
                <span>{selectedKnownDiseaseLabel}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isKnownDiseaseDropdownOpen && (
                <div className="table-status-menu table-disease-menu" role="listbox" aria-label={copy.columnKnownDiseases} aria-multiselectable="true">
                  <button
                    type="button"
                    className={`table-status-option table-disease-option ${selectedKnownDiseases.length === 0 ? 'active' : ''}`}
                    role="option"
                    aria-selected={selectedKnownDiseases.length === 0}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedKnownDiseases([]);
                    }}
                  >
                    <span>{copy.filterAll}</span>
                  </button>
                  {allKnownDiseases.length === 0 ? (
                    <div className="table-disease-empty">{copy.knownDiseaseSuggestionsEmpty}</div>
                  ) : (
                    allKnownDiseases.map(disease => {
                      const isSelected = selectedKnownDiseases.includes(disease);
                      return (
                        <button
                          key={`filter-known-disease-${disease}`}
                          type="button"
                          className={`table-status-option table-disease-option ${isSelected ? 'active' : ''}`}
                          role="option"
                          aria-selected={isSelected}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setSelectedKnownDiseases(prev => {
                              if (prev.includes(disease)) {
                                return prev.filter(entry => entry !== disease);
                              }
                              return [...prev, disease];
                            });
                          }}
                        >
                          <span>{disease}</span>
                          <span className="table-disease-check" aria-hidden="true">{isSelected ? '✓' : ''}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
          </div>
          <div className="table-filters-dates">
          <div className={`table-date-filter ${isBirthModeDropdownOpen ? 'open' : ''}`}>
            <div className="table-date-filter-header">
              <span>{copy.filterBirthLabel}</span>
              <button
                type="button"
                className="table-date-filter-reset"
                onClick={() => setBirthDateFilter(createEmptyDateFilter())}
                disabled={!hasBirthFilterValue}
              >
                {copy.filterClear}
              </button>
            </div>
            <div className="table-date-filter-row">
              <span>{copy.filterDateModeLabel}</span>
              <div className={`table-date-mode-dropdown ${isBirthModeDropdownOpen ? 'open' : ''}`} ref={birthModeDropdownRef}>
                <button
                  type="button"
                  className="table-date-mode-trigger"
                  onClick={toggleBirthModeDropdown}
                  aria-haspopup="listbox"
                  aria-expanded={isBirthModeDropdownOpen}
                  aria-label={copy.filterDateModeLabel}
                >
                  <span>{selectedBirthModeLabel}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {isBirthModeDropdownOpen && (
                  <div className="table-date-mode-menu" role="listbox" aria-label={copy.filterDateModeLabel}>
                    {dateFilterModes.map(mode => (
                      <button
                        key={mode.value}
                        type="button"
                        className={`table-date-mode-option ${birthDateFilter.mode === mode.value ? 'active' : ''}`}
                        role="option"
                        aria-selected={birthDateFilter.mode === mode.value}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setBirthDateFilter(prev => ({ ...prev, mode: mode.value }));
                          setIsBirthModeDropdownOpen(false);
                          setIsStatusDropdownOpen(false);
                          setIsBloodGroupDropdownOpen(false);
                          setIsKnownDiseaseDropdownOpen(false);
                          setIsDeathModeDropdownOpen(false);
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {birthDateFilter.mode === 'year' && (
              <label className="table-date-filter-row">
                <span>{copy.year}</span>
                <YearWheelInput
                  value={birthDateFilter.year}
                  onChange={(nextValue) => setBirthDateFilter(prev => ({ ...prev, year: nextValue }))}
                  ariaLabel={`${copy.filterBirthLabel} ${copy.year}`}
                  clearLabel={copy.filterClear}
                  yearPlaceholder={copy.year}
                />
              </label>
            )}
            {birthDateFilter.mode === 'yearRange' && (
              <div className="table-date-filter-grid">
                <label className="table-date-filter-row">
                  <span>{copy.filterFromLabel}</span>
                  <YearWheelInput
                    value={birthDateFilter.fromYear}
                    onChange={(nextValue) => setBirthDateFilter(prev => ({ ...prev, fromYear: nextValue }))}
                    ariaLabel={`${copy.filterBirthLabel} ${copy.filterFromLabel}`}
                    clearLabel={copy.filterClear}
                    yearPlaceholder={copy.year}
                  />
                </label>
                <label className="table-date-filter-row">
                  <span>{copy.filterToLabel}</span>
                  <YearWheelInput
                    value={birthDateFilter.toYear}
                    onChange={(nextValue) => setBirthDateFilter(prev => ({ ...prev, toYear: nextValue }))}
                    ariaLabel={`${copy.filterBirthLabel} ${copy.filterToLabel}`}
                    clearLabel={copy.filterClear}
                    yearPlaceholder={copy.year}
                  />
                </label>
              </div>
            )}
            {birthDateFilter.mode === 'dateRange' && (
              <div className="table-date-filter-grid">
                <label className="table-date-filter-row">
                  <span>{copy.filterFromLabel}</span>
                  <DateRangeInput
                    value={birthDateFilter.fromDate}
                    max={birthDateFilter.toDate || undefined}
                    onChange={(nextFromDate) => {
                      setBirthDateFilter(prev => ({
                        ...prev,
                        fromDate: nextFromDate,
                        toDate: prev.toDate && nextFromDate && prev.toDate < nextFromDate ? nextFromDate : prev.toDate,
                      }));
                    }}
                    ariaLabel={`${copy.filterBirthLabel} ${copy.filterFromLabel}`}
                    clearLabel={copy.filterClear}
                  />
                </label>
                <label className="table-date-filter-row">
                  <span>{copy.filterToLabel}</span>
                  <DateRangeInput
                    value={birthDateFilter.toDate}
                    min={birthDateFilter.fromDate || undefined}
                    onChange={(nextToDate) => {
                      setBirthDateFilter(prev => ({
                        ...prev,
                        fromDate: prev.fromDate && nextToDate && prev.fromDate > nextToDate ? nextToDate : prev.fromDate,
                        toDate: nextToDate,
                      }));
                    }}
                    ariaLabel={`${copy.filterBirthLabel} ${copy.filterToLabel}`}
                    clearLabel={copy.filterClear}
                  />
                </label>
              </div>
            )}
          </div>
          <div className={`table-date-filter ${isDeathModeDropdownOpen ? 'open' : ''}`}>
            <div className="table-date-filter-header">
              <span>{copy.filterDeathLabel}</span>
              <button
                type="button"
                className="table-date-filter-reset"
                onClick={() => setDeathDateFilter(createEmptyDateFilter())}
                disabled={!hasDeathFilterValue}
              >
                {copy.filterClear}
              </button>
            </div>
            <div className="table-date-filter-row">
              <span>{copy.filterDateModeLabel}</span>
              <div className={`table-date-mode-dropdown ${isDeathModeDropdownOpen ? 'open' : ''}`} ref={deathModeDropdownRef}>
                <button
                  type="button"
                  className="table-date-mode-trigger"
                  onClick={toggleDeathModeDropdown}
                  aria-haspopup="listbox"
                  aria-expanded={isDeathModeDropdownOpen}
                  aria-label={copy.filterDateModeLabel}
                >
                  <span>{selectedDeathModeLabel}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {isDeathModeDropdownOpen && (
                  <div className="table-date-mode-menu" role="listbox" aria-label={copy.filterDateModeLabel}>
                    {dateFilterModes.map(mode => (
                      <button
                        key={mode.value}
                        type="button"
                        className={`table-date-mode-option ${deathDateFilter.mode === mode.value ? 'active' : ''}`}
                        role="option"
                        aria-selected={deathDateFilter.mode === mode.value}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDeathDateFilter(prev => ({ ...prev, mode: mode.value }));
                          setIsDeathModeDropdownOpen(false);
                          setIsStatusDropdownOpen(false);
                          setIsBloodGroupDropdownOpen(false);
                          setIsKnownDiseaseDropdownOpen(false);
                          setIsBirthModeDropdownOpen(false);
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {deathDateFilter.mode === 'year' && (
              <label className="table-date-filter-row">
                <span>{copy.year}</span>
                <YearWheelInput
                  value={deathDateFilter.year}
                  onChange={(nextValue) => setDeathDateFilter(prev => ({ ...prev, year: nextValue }))}
                  ariaLabel={`${copy.filterDeathLabel} ${copy.year}`}
                  clearLabel={copy.filterClear}
                  yearPlaceholder={copy.year}
                />
              </label>
            )}
            {deathDateFilter.mode === 'yearRange' && (
              <div className="table-date-filter-grid">
                <label className="table-date-filter-row">
                  <span>{copy.filterFromLabel}</span>
                  <YearWheelInput
                    value={deathDateFilter.fromYear}
                    onChange={(nextValue) => setDeathDateFilter(prev => ({ ...prev, fromYear: nextValue }))}
                    ariaLabel={`${copy.filterDeathLabel} ${copy.filterFromLabel}`}
                    clearLabel={copy.filterClear}
                    yearPlaceholder={copy.year}
                  />
                </label>
                <label className="table-date-filter-row">
                  <span>{copy.filterToLabel}</span>
                  <YearWheelInput
                    value={deathDateFilter.toYear}
                    onChange={(nextValue) => setDeathDateFilter(prev => ({ ...prev, toYear: nextValue }))}
                    ariaLabel={`${copy.filterDeathLabel} ${copy.filterToLabel}`}
                    clearLabel={copy.filterClear}
                    yearPlaceholder={copy.year}
                  />
                </label>
              </div>
            )}
            {deathDateFilter.mode === 'dateRange' && (
              <div className="table-date-filter-grid">
                <label className="table-date-filter-row">
                  <span>{copy.filterFromLabel}</span>
                  <DateRangeInput
                    value={deathDateFilter.fromDate}
                    max={deathDateFilter.toDate || undefined}
                    onChange={(nextFromDate) => {
                      setDeathDateFilter(prev => ({
                        ...prev,
                        fromDate: nextFromDate,
                        toDate: prev.toDate && nextFromDate && prev.toDate < nextFromDate ? nextFromDate : prev.toDate,
                      }));
                    }}
                    ariaLabel={`${copy.filterDeathLabel} ${copy.filterFromLabel}`}
                    clearLabel={copy.filterClear}
                  />
                </label>
                <label className="table-date-filter-row">
                  <span>{copy.filterToLabel}</span>
                  <DateRangeInput
                    value={deathDateFilter.toDate}
                    min={deathDateFilter.fromDate || undefined}
                    onChange={(nextToDate) => {
                      setDeathDateFilter(prev => ({
                        ...prev,
                        fromDate: prev.fromDate && nextToDate && prev.fromDate > nextToDate ? nextToDate : prev.fromDate,
                        toDate: nextToDate,
                      }));
                    }}
                    ariaLabel={`${copy.filterDeathLabel} ${copy.filterToLabel}`}
                    clearLabel={copy.filterClear}
                  />
                </label>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      <div className="family-table-container">
        {people.length === 0 ? (
          <div className="table-empty">{copy.tableEmpty}</div>
        ) : (
          <table className="family-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('firstName')}>
                    <span className="table-sort-label">{copy.columnFirstName}</span>
                    {sortIndicator('firstName')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('lastNames')}>
                    <span className="table-sort-label">{copy.columnLastNames}</span>
                    {sortIndicator('lastNames')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('gender')}>
                    <span className="table-sort-label">{copy.columnGender}</span>
                    {sortIndicator('gender')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('bloodGroup')}>
                    <span className="table-sort-label">{copy.columnBloodGroup}</span>
                    {sortIndicator('bloodGroup')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('birthDate')}>
                    <span className="table-sort-label">{copy.columnBirthDate}</span>
                    {sortIndicator('birthDate')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('deathDate')}>
                    <span className="table-sort-label">{copy.columnDeathDate}</span>
                    {sortIndicator('deathDate')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('knownDiseases')}>
                    <span className="table-sort-label">{copy.columnKnownDiseases}</span>
                    {sortIndicator('knownDiseases')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('causeOfDeath')}>
                    <span className="table-sort-label">{copy.columnCauseOfDeath}</span>
                    {sortIndicator('causeOfDeath')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('notes')}>
                    <span className="table-sort-label">{copy.columnNotes}</span>
                    {sortIndicator('notes')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map(person => {
                const isMobileExpanded = expandedMobilePersonId === person.id;
                const firstName = person.firstName?.trim() || copy.unknownPerson;
                const primaryLastName = getPrimaryLastName(person);
                const birthLabel = getCompactDateLabel(person.birthDate);
                const deathLabel = getCompactDateLabel(person.deathDate);
                const bloodGroup = getBloodGroup(person);
                const inheritedRiskSuggestions = inheritedRiskByPersonId.get(person.id) ?? [];
                const ageYears = getAgeYears(person);
                const ageLabel = ageYears !== null ? `${ageYears} J.` : '';
                const hasMobileSummaryMeta = Boolean(bloodGroup || birthLabel || deathLabel || ageLabel);
                const firstNameInputId = `table-first-editor-${person.id}`;
                const genderLabel = person.gender === 'male'
                  ? copy.filterMale
                  : person.gender === 'female'
                    ? copy.filterFemale
                    : copy.filterUnknown;

                return (
                  <tr
                    key={person.id}
                    className={`table-person-row ${isMobileExpanded ? 'is-expanded' : 'is-collapsed'} ${activeRowBloodGroupPersonId === person.id ? 'is-bloodgroup-open' : ''}`}
                  >
                    <td data-label={copy.columnFirstName} className="table-first-cell">
                      <div
                        className="table-mobile-summary"
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleMobilePersonRow(person.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleMobilePersonRow(person.id);
                          }
                        }}
                        aria-expanded={isMobileExpanded}
                        aria-controls={firstNameInputId}
                        aria-label={`${copy.expandTitle}: ${firstName}`}
                      >
                        <div className={`table-mobile-avatar ${person.gender ?? 'unknown'}`} aria-hidden="true">
                          {renderGenderIcon(person.gender)}
                        </div>
                        <div className="table-mobile-summary-main">
                          <div className="table-mobile-summary-name">{firstName}</div>
                          <div className="table-mobile-summary-subline">{primaryLastName || '-'}</div>
                        </div>
                        {hasMobileSummaryMeta && (
                          <div className="table-mobile-summary-meta">
                            {bloodGroup && (
                              <span className="table-mobile-meta blood">{bloodGroup}</span>
                            )}
                            {birthLabel && (
                              <span className="table-mobile-meta birth">
                                <span className="table-mobile-meta-icon" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
                                    <path d="M8 2.5v4" />
                                    <path d="M16 2.5v4" />
                                    <path d="M3.5 9h17" />
                                    <circle cx="12" cy="15" r="2.4" />
                                  </svg>
                                </span>
                                {birthLabel}
                              </span>
                            )}
                            {deathLabel && (
                              <span className="table-mobile-meta death">
                                <span className="table-mobile-meta-icon" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M8 20v-9a4 4 0 0 1 8 0v9" />
                                    <path d="M6 20h12" />
                                    <path d="M12 11v4" />
                                    <path d="M10 13h4" />
                                  </svg>
                                </span>
                                {deathLabel}
                              </span>
                            )}
                            {ageLabel && (
                              <span className="table-mobile-meta age">{ageLabel}</span>
                            )}
                          </div>
                        )}
                        <span
                          className="table-mobile-toggle"
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </span>
                      </div>
                      {isMobileExpanded && (
                        <label className="table-mobile-field-label" htmlFor={firstNameInputId}>
                          {copy.columnFirstName}
                        </label>
                      )}
                      <input
                        id={firstNameInputId}
                        className="table-first-editor"
                        type="text"
                        value={person.firstName || ''}
                        onChange={(event) => updatePerson(person.id, { firstName: event.target.value })}
                        onBlur={(event) => handleFirstNameBlur(person.id, event.currentTarget.value)}
                      />
                    </td>
                  <td data-label={copy.columnLastNames}>
                    <div className="table-lastnames">
                      {getLastNames(person).map((value, index) => (
                        <div key={`${person.id}-last-${index}`} className="table-lastname-row">
                          <div className="last-name-input-wrapper">
                            {(() => {
                              const isActive = activeLastNameField?.personId === person.id && activeLastNameField.index === index;
                              const matching = isActive && value.trim() ? getMatchingLastNames(person.id, value) : [];
                              return (
                                <>
                                  <input
                                    type="text"
                                    value={value}
                                    onChange={(event) => handleLastNameChange(person.id, index, event.target.value)}
                                    onFocus={() => setActiveLastNameField({ personId: person.id, index })}
                                    onBlur={(event) => {
                                      handleLastNameBlur(person.id, index, event.currentTarget.value);
                                      window.setTimeout(() => setActiveLastNameField(null), 120);
                                    }}
                                  />
                                  {isActive && value.trim() && matching.length > 0 && (
                                    <div className="last-name-dropdown">
                                      {matching.map(name => (
                                        <button
                                          key={`table-last-name-option-${person.id}-${index}-${name}`}
                                          type="button"
                                          className="last-name-dropdown-item"
                                          onMouseDown={(event) => event.preventDefault()}
                                          onClick={() => {
                                            applySuggestedLastName(person.id, index, name);
                                            setActiveLastNameField(null);
                                          }}
                                        >
                                          {name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {isActive && value.trim() && matching.length === 0 && (
                                    <div className="last-name-dropdown">
                                      <div className="last-name-dropdown-empty">{copy.lastNameSuggestionsEmpty}</div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          <button
                            type="button"
                            className="btn-inline-remove btn-inline-remove-icon"
                            onClick={() => handleRemoveLastName(person.id, index)}
                            aria-label={copy.removeLastName}
                            title={copy.removeLastName}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn-inline-add" onClick={() => handleAddLastName(person.id)}>
                        + {copy.addLastName}
                      </button>
                    </div>
                  </td>
                  <td data-label={copy.columnGender}>
                    <div className="table-gender-mobile-buttons" role="group" aria-label={`${copy.columnGender}: ${firstName}`}>
                      <button
                        type="button"
                        className={`table-gender-mobile-btn male ${person.gender === 'male' ? 'active' : ''}`}
                        onClick={() => updatePerson(person.id, { gender: 'male' })}
                        aria-pressed={person.gender === 'male'}
                        title={copy.filterMale}
                      >
                        {renderGenderIcon('male')}
                        <span>{copy.maleLabel}</span>
                      </button>
                      <button
                        type="button"
                        className={`table-gender-mobile-btn female ${person.gender === 'female' ? 'active' : ''}`}
                        onClick={() => updatePerson(person.id, { gender: 'female' })}
                        aria-pressed={person.gender === 'female'}
                        title={copy.filterFemale}
                      >
                        {renderGenderIcon('female')}
                        <span>{copy.femaleLabel}</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`table-gender-cycle ${person.gender ?? 'unknown'}`}
                      onClick={() => cyclePersonGender(person)}
                      title={genderLabel}
                      aria-label={`${copy.columnGender}: ${genderLabel}`}
                    >
                      {renderGenderIcon(person.gender)}
                    </button>
                  </td>
                  <td data-label={copy.columnBloodGroup}>
                    {(() => {
                      const isOpen = activeRowBloodGroupPersonId === person.id;
                      const selectedLabel = bloodGroup || copy.bloodGroupPlaceholder;

                      return (
                        <div
                          className={`table-status-dropdown table-row-bloodgroup-dropdown ${isOpen ? 'open' : ''}`}
                          ref={isOpen ? rowBloodGroupDropdownRef : undefined}
                        >
                          <button
                            type="button"
                            className="table-status-trigger table-row-bloodgroup-trigger"
                            onClick={() => toggleRowBloodGroupDropdown(person.id)}
                            aria-haspopup="listbox"
                            aria-expanded={isOpen}
                            aria-label={`${copy.columnBloodGroup}: ${firstName}`}
                          >
                            <span>{selectedLabel}</span>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                          {isOpen && (
                            <div className="table-status-menu table-row-bloodgroup-menu" role="listbox" aria-label={copy.columnBloodGroup}>
                              <button
                                type="button"
                                className={`table-status-option ${bloodGroup ? '' : 'active'}`}
                                role="option"
                                aria-selected={!bloodGroup}
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleBloodGroupChange(person.id, '');
                                  setActiveRowBloodGroupPersonId(null);
                                }}
                              >
                                {copy.bloodGroupPlaceholder}
                              </button>
                              {BLOOD_GROUP_OPTIONS.map(group => (
                                <button
                                  key={`table-blood-group-${person.id}-${group}`}
                                  type="button"
                                  className={`table-status-option ${bloodGroup === group ? 'active' : ''}`}
                                  role="option"
                                  aria-selected={bloodGroup === group}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleBloodGroupChange(person.id, group);
                                    setActiveRowBloodGroupPersonId(null);
                                  }}
                                >
                                  {group}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td data-label={copy.columnBirthDate}>
                    <div className="table-date-inputs">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={getDateInputValue(person, 'birthDate', 'day')}
                        onChange={(event) => {
                          event.currentTarget.setCustomValidity('');
                          handleDateChange(person.id, 'birthDate', 'day', event.target.value);
                        }}
                        onBlur={(event) => handleDateBlur(person.id, 'birthDate', 'day', event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder={copy.day}
                        maxLength={2}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={getDateInputValue(person, 'birthDate', 'month')}
                        onChange={(event) => {
                          event.currentTarget.setCustomValidity('');
                          handleDateChange(person.id, 'birthDate', 'month', event.target.value);
                        }}
                        onBlur={(event) => handleDateBlur(person.id, 'birthDate', 'month', event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder={copy.month}
                        maxLength={2}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={getDateInputValue(person, 'birthDate', 'year')}
                        onChange={(event) => {
                          event.currentTarget.setCustomValidity('');
                          handleDateChange(person.id, 'birthDate', 'year', event.target.value);
                        }}
                        onBlur={(event) => handleDateBlur(person.id, 'birthDate', 'year', event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder={copy.year}
                        maxLength={4}
                      />
                    </div>
                  </td>
                  <td data-label={copy.columnDeathDate}>
                    <div className="table-date-inputs">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={getDateInputValue(person, 'deathDate', 'day')}
                        onChange={(event) => {
                          event.currentTarget.setCustomValidity('');
                          handleDateChange(person.id, 'deathDate', 'day', event.target.value);
                        }}
                        onBlur={(event) => handleDateBlur(person.id, 'deathDate', 'day', event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder={copy.day}
                        maxLength={2}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={getDateInputValue(person, 'deathDate', 'month')}
                        onChange={(event) => {
                          event.currentTarget.setCustomValidity('');
                          handleDateChange(person.id, 'deathDate', 'month', event.target.value);
                        }}
                        onBlur={(event) => handleDateBlur(person.id, 'deathDate', 'month', event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder={copy.month}
                        maxLength={2}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={getDateInputValue(person, 'deathDate', 'year')}
                        onChange={(event) => {
                          event.currentTarget.setCustomValidity('');
                          handleDateChange(person.id, 'deathDate', 'year', event.target.value);
                        }}
                        onBlur={(event) => handleDateBlur(person.id, 'deathDate', 'year', event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur();
                          }
                        }}
                        placeholder={copy.year}
                        maxLength={4}
                      />
                    </div>
                  </td>
                  <td data-label={copy.columnKnownDiseases}>
                    <div className="table-lastnames">
                      <div className="last-name-suggestions table-risk-suggestions">
                        <span className="last-name-suggestions-label">{copy.potentialHereditaryRisks}</span>
                        {inheritedRiskSuggestions.length > 0 ? (
                          <div className="last-name-suggestions-list">
                            {inheritedRiskSuggestions.map(disease => (
                              <button
                                key={`table-risk-suggestion-${person.id}-${disease}`}
                                type="button"
                                className="last-name-suggestion"
                                onClick={() => applyInheritedRiskSuggestion(person.id, disease)}
                              >
                                {disease}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="table-disease-empty">{copy.potentialHereditaryRisksEmpty}</div>
                        )}
                      </div>
                      {getKnownDiseases(person).map((entry, index) => (
                        <div key={`${person.id}-disease-${index}`} className="table-lastname-row table-known-disease-row">
                          <div className="last-name-input-wrapper">
                            {(() => {
                              const isActive = activeKnownDiseaseField?.personId === person.id && activeKnownDiseaseField.index === index;
                              const matching = isActive && entry.name.trim() ? getMatchingKnownDiseases(person.id, entry.name) : [];
                              return (
                                <>
                                  <input
                                    type="text"
                                    value={entry.name}
                                    onChange={(event) => handleKnownDiseaseChange(person.id, index, event.target.value)}
                                    onFocus={() => setActiveKnownDiseaseField({ personId: person.id, index })}
                                    onBlur={(event) => {
                                      handleKnownDiseaseBlur(person.id, index, event.currentTarget.value);
                                      window.setTimeout(() => setActiveKnownDiseaseField(null), 120);
                                    }}
                                  />
                                  {isActive && entry.name.trim() && matching.length > 0 && (
                                    <div className="last-name-dropdown">
                                      {matching.map(name => (
                                        <button
                                          key={`table-known-disease-option-${person.id}-${index}-${name}`}
                                          type="button"
                                          className="last-name-dropdown-item"
                                          onMouseDown={(event) => event.preventDefault()}
                                          onClick={() => {
                                            applySuggestedKnownDisease(person.id, index, name);
                                            setActiveKnownDiseaseField(null);
                                          }}
                                        >
                                          {name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {isActive && entry.name.trim() && matching.length === 0 && (
                                    <div className="last-name-dropdown">
                                      <div className="last-name-dropdown-empty">{copy.knownDiseaseSuggestionsEmpty}</div>
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          <div className="table-known-disease-controls">
                            <label className="known-disease-hereditary known-disease-hereditary-table">
                              <input
                                type="checkbox"
                                checked={entry.hereditary === true}
                                onChange={(event) => handleKnownDiseaseHereditaryChange(person.id, index, event.target.checked)}
                              />
                              <span>{copy.hereditaryLabel}</span>
                            </label>
                            <button
                              type="button"
                              className="btn-inline-remove"
                              onClick={() => handleRemoveKnownDisease(person.id, index)}
                              aria-label={copy.removeKnownDisease}
                              title={copy.removeKnownDisease}
                            >
                              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                      <button type="button" className="btn-inline-add" onClick={() => handleAddKnownDisease(person.id)}>
                        + {copy.addKnownDisease}
                      </button>
                    </div>
                  </td>
                  <td data-label={copy.columnCauseOfDeath}>
                    <div className="last-name-input-wrapper">
                      {(() => {
                        const causeValue = person.causeOfDeath || '';
                        const isActive = activeCauseOfDeathPersonId === person.id;
                        const matching = isActive && causeValue.trim()
                          ? getMatchingCausesOfDeath(person.id, causeValue)
                          : [];
                        return (
                          <>
                            <input
                              type="text"
                              value={causeValue}
                              onChange={(event) => updatePerson(person.id, { causeOfDeath: event.target.value })}
                              onFocus={() => setActiveCauseOfDeathPersonId(person.id)}
                              onBlur={(event) => {
                                handleCauseOfDeathBlur(person.id, event.currentTarget.value);
                                window.setTimeout(() => setActiveCauseOfDeathPersonId(null), 120);
                              }}
                            />
                            {matching.length > 0 && (
                              <div className="last-name-dropdown">
                                {matching.map(cause => (
                                  <button
                                    key={`table-cause-option-${person.id}-${cause}`}
                                    type="button"
                                    className="last-name-dropdown-item"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => {
                                      applySuggestedCauseOfDeath(person.id, cause);
                                      setActiveCauseOfDeathPersonId(null);
                                    }}
                                  >
                                    {cause}
                                  </button>
                                ))}
                              </div>
                            )}
                            {isActive && causeValue.trim() && matching.length === 0 && (
                              <div className="last-name-dropdown">
                                <div className="last-name-dropdown-empty">{copy.causeOfDeathSuggestionsEmpty}</div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </td>
                  <td data-label={copy.columnNotes}>
                    <RichTextEditor
                      className="table-rich-notes"
                      compact
                      value={person.notes || ''}
                      onChange={(nextValue) => updatePerson(person.id, { notes: nextValue })}
                      placeholder={copy.notes}
                      ariaLabel={`${copy.columnNotes}: ${firstName}`}
                    />
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
