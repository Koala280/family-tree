import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { Person, FamilyTree, FamilyTreesData, FamilyTreeMetadata, Union, UnionStatus, KnownDiseaseEntry } from '../types';
import { PasswordModal } from '../components/PasswordModal';
import {
  translations,
  isLanguageCode,
  parseCustomTranslations,
  applyCustomTranslations,
  resetCustomTranslations,
  type LanguageCode,
} from '../i18n';
import { normalizeRichTextForStorage } from '../utils/richText';
import { normalizeBloodGroup } from '../utils/person';

type AppView = 'manager' | 'tree' | 'table';
const HISTORY_VIEW_KEY = '__family_tree_view';
const SHARED_IMPORT_QUERY_KEY = 'shareImport';
const SHARED_IMPORT_CACHE_PATH = '/__shared-tree-import__.json';

type LaunchParamsWithFiles = {
  files?: Array<{
    getFile: () => Promise<File>;
  }>;
};

type LaunchQueueWithFiles = {
  setConsumer: (consumer: (launchParams: LaunchParamsWithFiles) => void) => void;
};

const isAppView = (value: unknown): value is AppView => (
  value === 'manager' || value === 'tree' || value === 'table'
);

const getViewFromHistoryState = (state: unknown): AppView | null => {
  if (!state || typeof state !== 'object') return null;
  const candidate = (state as Record<string, unknown>)[HISTORY_VIEW_KEY];
  return isAppView(candidate) ? candidate : null;
};

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
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  createTree: (name: string) => void;
  selectTree: (treeId: string) => void;
  renameTree: (treeId: string, newName: string) => void;
  deleteTree: (treeId: string) => void;
  exportTree: (treeId: string) => void;
  importTree: () => void;
  importTreeFile: (file: File) => Promise<boolean>;
  openTableView: (treeId: string) => void;

  // UI language
  language: LanguageCode;
  hasCustomLanguagePack: boolean;
  setLanguage: (language: LanguageCode) => void;
  importCustomLanguage: () => void;
}

const FamilyTreeContext = createContext<FamilyTreeContextType | undefined>(undefined);

const STORAGE_KEY = 'family-trees-data';
const LANGUAGE_KEY = 'family-tree-language';
const CUSTOM_TRANSLATIONS_KEY = 'family-tree-custom-translations';
const CUSTOM_TRANSLATION_IMPORT_ERROR = 'Failed to import language file. Please provide a valid JSON translation file.';
const ENCRYPTION_VERSION = 1;
const ENCRYPTION_ITERATIONS = 310000;
const ENCRYPTION_SALT_BYTES = 16;
const ENCRYPTION_IV_BYTES = 12;
const ENCRYPTION_TYPE = 'family-tree-export';
const LOCAL_STORAGE_ENCRYPTION_VERSION = 1;
const LOCAL_STORAGE_ENCRYPTION_TYPE = 'family-tree-local-storage';
const LOCAL_STORAGE_KEY_DB = 'family-tree-secure-storage';
const LOCAL_STORAGE_KEY_STORE = 'keys';
const LOCAL_STORAGE_KEY_ID = 'local-storage-key';
const APP_DATA_DB = 'family-tree-secure-data';
const APP_DATA_STORE = 'state';
const APP_DATA_KEY_ID = 'trees-data';
const INLINE_WHITESPACE_PATTERN = /[ \t\f\v\u00a0]+/g;

type PasswordModalState = {
  title: string;
  description?: string;
  confirmLabel: string;
  requireConfirm: boolean;
  minLength: number;
};

type LocalStorageEncryptionPayload = {
  version: number;
  type: string;
  cipher: {
    name: 'AES-GCM';
    iv: string;
  };
  ciphertext: string;
};

type StorageLoadResult = {
  data: FamilyTreesData;
  shouldPersist: boolean;
};

const createEmptyTreesData = (): FamilyTreesData => ({
  trees: {},
  metadata: {},
  activeTreeId: null,
});

const normalizeStoredTreesData = (value: unknown): FamilyTreesData | null => {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<FamilyTreesData>;
  if (!candidate.trees || typeof candidate.trees !== 'object') return null;
  if (!candidate.metadata || typeof candidate.metadata !== 'object') return null;

  return {
    trees: candidate.trees as Record<string, FamilyTree>,
    metadata: candidate.metadata as Record<string, FamilyTreeMetadata>,
    activeTreeId: typeof candidate.activeTreeId === 'string' ? candidate.activeTreeId : null,
  };
};

const isLocalStorageEncryptionPayload = (
  value: unknown
): value is LocalStorageEncryptionPayload => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LocalStorageEncryptionPayload>;

  return Boolean(
    candidate.type === LOCAL_STORAGE_ENCRYPTION_TYPE
    && typeof candidate.version === 'number'
    && candidate.cipher
    && typeof candidate.cipher.iv === 'string'
    && typeof candidate.ciphertext === 'string'
  );
};

const openLocalStorageKeyDatabase = () => (
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(LOCAL_STORAGE_KEY_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_STORAGE_KEY_STORE)) {
        database.createObjectStore(LOCAL_STORAGE_KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open key database.'));
  })
);

const readLocalStorageEncryptionKey = async (): Promise<CryptoKey | null> => {
  const database = await openLocalStorageKeyDatabase();

  try {
    return await new Promise<CryptoKey | null>((resolve, reject) => {
      const transaction = database.transaction(LOCAL_STORAGE_KEY_STORE, 'readonly');
      const request = transaction.objectStore(LOCAL_STORAGE_KEY_STORE).get(LOCAL_STORAGE_KEY_ID);

      request.onsuccess = () => {
        const result = request.result;
        if (result && typeof result === 'object' && 'type' in result && 'algorithm' in result) {
          resolve(result as CryptoKey);
          return;
        }
        resolve(null);
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to read key.'));
    });
  } finally {
    database.close();
  }
};

const writeLocalStorageEncryptionKey = async (key: CryptoKey) => {
  const database = await openLocalStorageKeyDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LOCAL_STORAGE_KEY_STORE, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to persist key.'));
      transaction.objectStore(LOCAL_STORAGE_KEY_STORE).put(key, LOCAL_STORAGE_KEY_ID);
    });
  } finally {
    database.close();
  }
};

const openAppDataDatabase = () => (
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = indexedDB.open(APP_DATA_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(APP_DATA_STORE)) {
        database.createObjectStore(APP_DATA_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open app data database.'));
  })
);

const readAppDataPayload = async (): Promise<unknown | null> => {
  const database = await openAppDataDatabase();

  try {
    return await new Promise<unknown | null>((resolve, reject) => {
      const transaction = database.transaction(APP_DATA_STORE, 'readonly');
      const request = transaction.objectStore(APP_DATA_STORE).get(APP_DATA_KEY_ID);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('Failed to read app data payload.'));
    });
  } finally {
    database.close();
  }
};

const writeAppDataPayload = async (payload: LocalStorageEncryptionPayload) => {
  const database = await openAppDataDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(APP_DATA_STORE, 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to persist app data payload.'));
      transaction.objectStore(APP_DATA_STORE).put(payload, APP_DATA_KEY_ID);
    });
  } finally {
    database.close();
  }
};

const getOrCreateLocalStorageEncryptionKey = async () => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto is unavailable.');
  }

  const storedKey = await readLocalStorageEncryptionKey();
  if (storedKey) return storedKey;

  const generatedKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  await writeLocalStorageEncryptionKey(generatedKey);
  return generatedKey;
};

const encryptTreesDataForStorage = async (data: FamilyTreesData): Promise<LocalStorageEncryptionPayload> => {
  const key = await getOrCreateLocalStorageEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTES));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  );

  return {
    version: LOCAL_STORAGE_ENCRYPTION_VERSION,
    type: LOCAL_STORAGE_ENCRYPTION_TYPE,
    cipher: {
      name: 'AES-GCM',
      iv: encodeBase64(iv),
    },
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
  };
};

const decryptTreesDataFromStorage = async (payload: LocalStorageEncryptionPayload): Promise<FamilyTreesData> => {
  if (payload.version !== LOCAL_STORAGE_ENCRYPTION_VERSION || payload.type !== LOCAL_STORAGE_ENCRYPTION_TYPE) {
    throw new Error('Unsupported local storage payload.');
  }

  const key = await getOrCreateLocalStorageEncryptionKey();
  const iv = decodeBase64(payload.cipher.iv);
  const ciphertext = decodeBase64(payload.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  const decoder = new TextDecoder();
  const parsed = JSON.parse(decoder.decode(plaintext));
  const normalized = normalizeStoredTreesData(parsed);

  if (!normalized) {
    throw new Error('Invalid local storage payload.');
  }

  return normalized;
};

const loadTreesDataFromStorage = async (): Promise<StorageLoadResult> => {
  try {
    const idbPayload = await readAppDataPayload();
    if (idbPayload) {
      if (isLocalStorageEncryptionPayload(idbPayload)) {
        return {
          data: await decryptTreesDataFromStorage(idbPayload),
          shouldPersist: false,
        };
      }

      const plaintextIdbData = normalizeStoredTreesData(idbPayload);
      if (plaintextIdbData) {
        return {
          data: plaintextIdbData,
          shouldPersist: true,
        };
      }
    }
  } catch {
    // Continue with legacy localStorage fallback if IndexedDB is unavailable.
  }

  const legacyLocalStorage = localStorage.getItem(STORAGE_KEY);
  if (legacyLocalStorage) {
    try {
      const parsed = JSON.parse(legacyLocalStorage);
      if (isLocalStorageEncryptionPayload(parsed)) {
        return {
          data: await decryptTreesDataFromStorage(parsed),
          shouldPersist: true,
        };
      }

      const plaintextData = normalizeStoredTreesData(parsed);
      if (plaintextData) {
        return {
          data: plaintextData,
          shouldPersist: true,
        };
      }
    } catch {
      // Ignore malformed storage content and start with an empty tree set.
    }
  }

  return {
    data: createEmptyTreesData(),
    shouldPersist: false,
  };
};

const persistTreesDataToStorage = async (data: FamilyTreesData) => {
  const encrypted = await encryptTreesDataForStorage(data);
  try {
    await writeAppDataPayload(encrypted);
    localStorage.removeItem(STORAGE_KEY);
    return;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
  }
};

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const toHex = (value: number) => value.toString(16).padStart(2, '0');
    const hex = Array.from(bytes, toHex).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const deriveEncryptionKey = async (password: string, salt: Uint8Array, iterations: number) => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const encryptExportPayload = async (payload: unknown, password: string) => {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(ENCRYPTION_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(ENCRYPTION_IV_BYTES));
  const key = await deriveEncryptionKey(password, salt, ENCRYPTION_ITERATIONS);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(payload))
  );

  return {
    version: ENCRYPTION_VERSION,
    type: ENCRYPTION_TYPE,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: ENCRYPTION_ITERATIONS,
      salt: encodeBase64(salt),
    },
    cipher: {
      name: 'AES-GCM',
      iv: encodeBase64(iv),
    },
    ciphertext: encodeBase64(new Uint8Array(ciphertextBuffer)),
  };
};

const decryptExportPayload = async (payload: any, password: string) => {
  if (!payload || payload.type !== ENCRYPTION_TYPE || payload.version !== ENCRYPTION_VERSION) {
    throw new Error('Unsupported encrypted export format.');
  }

  const salt = decodeBase64(payload.kdf?.salt ?? '');
  const iv = decodeBase64(payload.cipher?.iv ?? '');
  const iterations = Number(payload.kdf?.iterations ?? ENCRYPTION_ITERATIONS);
  const key = await deriveEncryptionKey(password, salt, iterations);
  const ciphertext = decodeBase64(payload.ciphertext ?? '');
  const plaintextBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(plaintextBuffer));
};

const normalizeInlineText = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.replace(INLINE_WHITESPACE_PATTERN, ' ').trim();
};

const normalizeMultilineText = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n');
};

const normalizeKnownDiseases = (value: unknown): KnownDiseaseEntry[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry): KnownDiseaseEntry | null => {
        if (typeof entry === 'string') {
          return { name: entry, hereditary: false };
        }
        if (entry && typeof entry === 'object') {
          const candidate = entry as { name?: unknown; hereditary?: unknown };
          if (typeof candidate.name === 'string') {
            return {
              name: candidate.name,
              hereditary: candidate.hereditary === true,
            };
          }
        }
        return null;
      })
      .filter((entry): entry is KnownDiseaseEntry => entry !== null);
  }
  if (typeof value === 'string') {
    return [{ name: value, hereditary: false }];
  }
  return [];
};

const createEmptyPerson = (): Person => ({
  id: createId(),
  firstName: '',
  lastName: '',
  lastNames: [],
  bloodGroup: '',
  gender: null,
  birthDate: {},
  deathDate: {},
  causeOfDeath: '',
  knownDiseases: [],
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
  id: createId(),
  partnerIds: Array.from(new Set(partnerIds)),
  status,
  childIds: [],
});

const normalizeTree = (tree: any): FamilyTree => {
  const persons: Record<string, Person> = {};
  const unions: Record<string, Union> = tree.unions && typeof tree.unions === 'object' ? tree.unions : {};

  Object.values(tree.persons || {}).forEach((person: any) => {
    const normalizedLastNames: string[] = Array.isArray(person.lastNames)
      ? person.lastNames.map((name: unknown) => normalizeInlineText(name))
      : person.lastName
        ? [normalizeInlineText(person.lastName)]
        : [];
    const primaryLastName = normalizedLastNames.find(name => name.length > 0) ?? '';
    persons[person.id] = {
      id: person.id,
      firstName: normalizeInlineText(person.firstName ?? ''),
      lastName: primaryLastName,
      lastNames: normalizedLastNames,
      bloodGroup: normalizeBloodGroup(person.bloodGroup),
      gender: person.gender ?? null,
      birthDate: person.birthDate ?? {},
      deathDate: person.deathDate ?? {},
      causeOfDeath: normalizeInlineText(person.causeOfDeath ?? ''),
      knownDiseases: normalizeKnownDiseases(person.knownDiseases),
      notes: normalizeRichTextForStorage(normalizeMultilineText(person.notes ?? '')),
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
  const [treesData, setTreesData] = useState<FamilyTreesData>(createEmptyTreesData);
  const [isStorageHydrated, setIsStorageHydrated] = useState(false);
  const [shouldPersistHydratedData, setShouldPersistHydratedData] = useState(false);
  const [hasCustomLanguagePack, setHasCustomLanguagePack] = useState(false);
  const [, setCustomTranslationRevision] = useState(0);

  const [currentView, setCurrentViewState] = useState<AppView>(() => {
    return treesData.activeTreeId ? 'tree' : 'manager';
  });
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (isLanguageCode(stored)) {
      return stored;
    }
    const browserLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : '';
    if (browserLang.startsWith('lv')) return 'lv';
    if (browserLang.startsWith('en')) return 'en';
    return 'de';
  });
  const [passwordModal, setPasswordModal] = useState<PasswordModalState | null>(null);
  const passwordResolverRef = useRef<((value: string | null) => void) | null>(null);
  const hasPrimedHistoryRef = useRef(false);
  const skipInitialStoragePersistRef = useRef(true);
  const copy = translations[language];

  const setCurrentView = (view: AppView) => {
    if (view === currentView) return;

    if (typeof window !== 'undefined') {
      const existing = window.history.state;
      const existingState = existing && typeof existing === 'object'
        ? (existing as Record<string, unknown>)
        : {};
      const currentHistoryView = getViewFromHistoryState(existing);

      // Keep one in-app step back from tree to manager across devices/browser back.
      if (view === 'tree' && currentHistoryView !== 'manager') {
        window.history.pushState(
          {
            ...existingState,
            [HISTORY_VIEW_KEY]: 'manager',
          },
          ''
        );
      }

      window.history.pushState(
        {
          ...existingState,
          [HISTORY_VIEW_KEY]: view,
        },
        ''
      );
    }

    setCurrentViewState(view);
  };

  const requestPassword = (options: PasswordModalState) => {
    return new Promise<string | null>((resolve) => {
      passwordResolverRef.current = resolve;
      setPasswordModal(options);
    });
  };

  const handlePasswordCancel = () => {
    if (passwordResolverRef.current) {
      passwordResolverRef.current(null);
    }
    passwordResolverRef.current = null;
    setPasswordModal(null);
  };

  const handlePasswordSubmit = (value: string) => {
    if (passwordResolverRef.current) {
      passwordResolverRef.current(value);
    }
    passwordResolverRef.current = null;
    setPasswordModal(null);
  };

  useEffect(() => {
    let isCancelled = false;

    const hydrateStorage = async () => {
      const result = await loadTreesDataFromStorage();
      if (isCancelled) return;

      setTreesData(result.data);
      setShouldPersistHydratedData(result.shouldPersist);
      setCurrentViewState(result.data.activeTreeId ? 'tree' : 'manager');
      setIsStorageHydrated(true);
    };

    void hydrateStorage();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isStorageHydrated) return;
    if (skipInitialStoragePersistRef.current) {
      skipInitialStoragePersistRef.current = false;
      if (!shouldPersistHydratedData) return;
    }

    void persistTreesDataToStorage(treesData).catch(() => {
      // Keep the app usable even if encrypted persistence fails in this environment.
    });
  }, [treesData, isStorageHydrated, shouldPersistHydratedData]);

  useEffect(() => {
    const storedCustomTranslations = localStorage.getItem(CUSTOM_TRANSLATIONS_KEY);
    if (!storedCustomTranslations) {
      resetCustomTranslations();
      setHasCustomLanguagePack(false);
      return;
    }

    const parsedCustomTranslations = parseCustomTranslations(storedCustomTranslations);
    if (!parsedCustomTranslations) {
      localStorage.removeItem(CUSTOM_TRANSLATIONS_KEY);
      resetCustomTranslations();
      setHasCustomLanguagePack(false);
      return;
    }

    applyCustomTranslations(parsedCustomTranslations.bundle);
    setHasCustomLanguagePack(true);
    setCustomTranslationRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language === 'custom' ? 'en' : language;
  }, [language]);

  useEffect(() => {
    if (typeof window === 'undefined' || hasPrimedHistoryRef.current || !isStorageHydrated) return;

    const existing = window.history.state;
    const existingState = existing && typeof existing === 'object'
      ? (existing as Record<string, unknown>)
      : {};

    hasPrimedHistoryRef.current = true;
    window.history.replaceState(
      {
        ...existingState,
        [HISTORY_VIEW_KEY]: currentView,
      },
      ''
    );

    // If app starts in a sub view, create one in-app step back to overview.
    if (currentView !== 'manager') {
      window.history.pushState(
        {
          ...existingState,
          [HISTORY_VIEW_KEY]: 'manager',
        },
        ''
      );
      window.history.pushState(
        {
          ...existingState,
          [HISTORY_VIEW_KEY]: currentView,
        },
        ''
      );
    }
  }, [currentView, isStorageHydrated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = (event: PopStateEvent) => {
      const historyView = getViewFromHistoryState(event.state);
      if (historyView) {
        setCurrentViewState(historyView);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

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
    newPerson.firstName = normalizeInlineText(newPerson.firstName);
    newPerson.lastNames = Array.isArray(newPerson.lastNames)
      ? newPerson.lastNames.map(name => normalizeInlineText(name))
      : [];
    newPerson.lastName = normalizeInlineText(newPerson.lastName);
    if (!newPerson.lastName) {
      newPerson.lastName = newPerson.lastNames.find(name => name.trim().length > 0) ?? '';
    }
    newPerson.bloodGroup = normalizeBloodGroup(newPerson.bloodGroup);
    newPerson.causeOfDeath = normalizeInlineText(newPerson.causeOfDeath);
    newPerson.notes = normalizeRichTextForStorage(normalizeMultilineText(newPerson.notes));
    if (Array.isArray(newPerson.lastNames) && !newPerson.lastName) {
      newPerson.lastName = newPerson.lastNames.find(name => name.trim().length > 0) ?? '';
    }
    newPerson.knownDiseases = normalizeKnownDiseases(newPerson.knownDiseases);

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
    const nextUpdates = { ...updates };
    if (Array.isArray(updates.lastNames)) {
      nextUpdates.lastNames = updates.lastNames
        .filter((name): name is string => typeof name === 'string');
    }
    if (Array.isArray(updates.lastNames) && updates.lastName === undefined) {
      const normalizedLastNames = (nextUpdates.lastNames as string[]) ?? [];
      const primary = normalizedLastNames.find(name => name.trim().length > 0) ?? '';
      nextUpdates.lastName = primary;
    }
    if (updates.knownDiseases !== undefined) {
      nextUpdates.knownDiseases = normalizeKnownDiseases(updates.knownDiseases);
    }
    if (updates.bloodGroup !== undefined) {
      nextUpdates.bloodGroup = normalizeBloodGroup(updates.bloodGroup);
    }
    if (updates.notes !== undefined) {
      nextUpdates.notes = normalizeRichTextForStorage(normalizeMultilineText(updates.notes));
    }
    updateCurrentTree(tree => ({
      ...tree,
      persons: {
        ...tree.persons,
        [id]: {
          ...tree.persons[id],
          ...nextUpdates,
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

      const singleParentUnions = person1.unionIds
        .map(id => newUnions[id])
        .filter((union): union is Union => Boolean(
          union
          && union.partnerIds.length === 1
          && union.partnerIds[0] === person1Id
        ));

      if (singleParentUnions.length >= 1) {
        const targetUnion = singleParentUnions.reduce((best, candidate) => {
          if (candidate.childIds.length !== best.childIds.length) {
            return candidate.childIds.length > best.childIds.length ? candidate : best;
          }
          return candidate.id < best.id ? candidate : best;
        });
        newUnions[targetUnion.id] = {
          ...targetUnion,
          partnerIds: targetUnion.partnerIds.includes(person2Id)
            ? targetUnion.partnerIds
            : [...targetUnion.partnerIds, person2Id],
          status: targetUnion.status === 'divorced' ? 'active' : targetUnion.status,
        };
        newPersons[person1Id] = {
          ...person1,
          unionIds: person1.unionIds.includes(targetUnion.id)
            ? person1.unionIds
            : [...person1.unionIds, targetUnion.id],
        };
        newPersons[person2Id] = {
          ...person2,
          unionIds: person2.unionIds.includes(targetUnion.id)
            ? person2.unionIds
            : [...person2.unionIds, targetUnion.id],
        };
        createdUnionId = targetUnion.id;

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
    const treeId = createId();
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

  const openTableView = (treeId: string) => {
    setTreesData(prev => ({
      ...prev,
      activeTreeId: treeId,
    }));
    setCurrentView('table');
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

    if (!crypto?.subtle || !crypto?.getRandomValues) {
      alert(copy.encryptionUnavailable);
      return;
    }

    void (async () => {
      const password = await requestPassword({
        title: copy.exportTitle,
        description: copy.exportDescription,
        confirmLabel: copy.exportConfirm,
        requireConfirm: true,
        minLength: 12,
      });
      if (!password) return;
      try {
        const encryptedPayload = await encryptExportPayload(exportData, password);
        const dataStr = JSON.stringify(encryptedPayload, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${metadata.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        alert(copy.exportError);
      }
    })();
  };

  const commitImportedTree = useCallback((decryptedData: any) => {
    if (decryptedData.tree && decryptedData.metadata) {
      const newTreeId = createId();
      const now = new Date().toISOString();
      const normalizedTree = normalizeTree(decryptedData.tree);

      setTreesData(prev => ({
        trees: {
          ...prev.trees,
          [newTreeId]: normalizedTree,
        },
        metadata: {
          ...prev.metadata,
          [newTreeId]: {
            ...decryptedData.metadata,
            id: newTreeId,
            createdAt: now,
            updatedAt: now,
          },
        },
        activeTreeId: newTreeId,
      }));

      setCurrentView('tree');
      return true;
    }

    alert(copy.importUnknownFormat);
    return false;
  }, [copy.importUnknownFormat, setCurrentView]);

  const importTreeFromRawText = useCallback(async (rawText: string) => {
    try {
      const importedData = JSON.parse(rawText);
      const decryptedData = importedData?.ciphertext
        ? await (async () => {
            if (!crypto?.subtle || !crypto?.getRandomValues) {
              alert(copy.decryptUnavailable);
              return null;
            }
            const password = await requestPassword({
              title: copy.importTitle,
              description: copy.importDescription,
              confirmLabel: copy.importConfirm,
              requireConfirm: false,
              minLength: 1,
            });
            if (!password) return null;
            return decryptExportPayload(importedData, password);
          })()
        : importedData;

      if (!decryptedData) return false;
      return commitImportedTree(decryptedData);
    } catch (error) {
      alert(copy.importError);
      return false;
    }
  }, [
    commitImportedTree,
    copy.decryptUnavailable,
    copy.importConfirm,
    copy.importDescription,
    copy.importError,
    copy.importTitle,
    requestPassword,
  ]);

  const importTreeFromFile = useCallback(async (file: File) => {
    try {
      const rawText = await file.text();
      return importTreeFromRawText(rawText);
    } catch (error) {
      alert(copy.importError);
      return false;
    }
  }, [copy.importError, importTreeFromRawText]);

  const importTree = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    const cleanup = () => {
      input.value = '';
      input.remove();
    };
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (file) {
        void importTreeFromFile(file);
      }
      cleanup();
    };
    input.click();
  };

  const importTreeFile = useCallback((file: File) => {
    return importTreeFromFile(file);
  }, [importTreeFromFile]);

  const importCustomLanguageFromRawText = useCallback(async (rawText: string) => {
    const parsedCustomTranslations = parseCustomTranslations(rawText);
    if (!parsedCustomTranslations) {
      alert(CUSTOM_TRANSLATION_IMPORT_ERROR);
      return false;
    }

    applyCustomTranslations(parsedCustomTranslations.bundle);
    localStorage.setItem(CUSTOM_TRANSLATIONS_KEY, parsedCustomTranslations.serialized);
    setHasCustomLanguagePack(true);
    setCustomTranslationRevision((value) => value + 1);
    setLanguage('custom');
    return true;
  }, []);

  const importCustomLanguageFromFile = useCallback(async (file: File) => {
    try {
      const rawText = await file.text();
      return importCustomLanguageFromRawText(rawText);
    } catch {
      alert(CUSTOM_TRANSLATION_IMPORT_ERROR);
      return false;
    }
  }, [importCustomLanguageFromRawText]);

  const importCustomLanguage = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    const cleanup = () => {
      input.value = '';
      input.remove();
    };
    input.onchange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const file = target?.files?.[0];
      if (file) {
        void importCustomLanguageFromFile(file);
      }
      cleanup();
    };
    input.click();
  }, [importCustomLanguageFromFile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const launchQueue = (window as Window & { launchQueue?: LaunchQueueWithFiles }).launchQueue;
    if (!launchQueue || typeof launchQueue.setConsumer !== 'function') return;

    launchQueue.setConsumer((launchParams: LaunchParamsWithFiles) => {
      const firstHandle = launchParams.files?.[0];
      if (!firstHandle || typeof firstHandle.getFile !== 'function') return;

      void (async () => {
        try {
          const file = await firstHandle.getFile();
          await importTreeFromFile(file);
        } catch (error) {
          alert(copy.importError);
        }
      })();
    });
  }, [copy.importError, importTreeFromFile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get(SHARED_IMPORT_QUERY_KEY) !== '1') return;

    void (async () => {
      try {
        const response = await fetch(SHARED_IMPORT_CACHE_PATH, { cache: 'no-store' });
        if (response.ok) {
          const sharedText = await response.text();
          if (sharedText.trim()) {
            await importTreeFromRawText(sharedText);
          }
        }
      } catch (error) {
        alert(copy.importError);
      } finally {
        currentUrl.searchParams.delete(SHARED_IMPORT_QUERY_KEY);
        const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
        window.history.replaceState(window.history.state, '', nextUrl);
      }
    })();
  }, [copy.importError, importTreeFromRawText]);

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
        openTableView,
        renameTree,
        deleteTree,
        exportTree,
        importTree,
        importTreeFile,
        language,
        hasCustomLanguagePack,
        setLanguage,
        importCustomLanguage,
      }}
    >
      {children}
      {passwordModal && (
        <PasswordModal
          title={passwordModal.title}
          description={passwordModal.description}
          confirmLabel={passwordModal.confirmLabel}
          requireConfirm={passwordModal.requireConfirm}
          minLength={passwordModal.minLength}
          language={language}
          onCancel={handlePasswordCancel}
          onSubmit={handlePasswordSubmit}
        />
      )}
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
