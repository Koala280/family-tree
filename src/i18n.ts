export type LanguageCode = 'de' | 'en' | 'lv' | 'custom';

export const languageOptions: { code: LanguageCode; label: string; name: string }[] = [
  { code: 'de', label: 'DE', name: 'Deutsch' },
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'lv', label: 'LV', name: 'Latviešu' },
  { code: 'custom', label: 'Custom', name: 'Custom' },
];

const languageCodes: LanguageCode[] = ['de', 'en', 'lv', 'custom'];

export const isLanguageCode = (value: string | null): value is LanguageCode => {
  return value !== null && languageCodes.includes(value as LanguageCode);
};

export const getLocale = (language: LanguageCode) => {
  switch (language) {
    case 'de':
      return 'de-DE';
    case 'lv':
      return 'lv-LV';
    default:
      return 'en-US';
  }
};

const englishTranslations = {
  languageLabel: 'Language',
  managerTitle: 'Family Trees',
  managerSubtitle: 'Manage your family trees',
  newTreePlaceholder: 'Name of the new family tree',
  newTreeButton: 'New family tree',
  importButton: 'Import',
  importDropHint: 'Or drag and drop a JSON file here to import',
  importDropActive: 'Drop file to import',
  installApp: 'Install app',
  installAppHint: 'iOS: Tap Share and then "Add to Home Screen".',
  emptyTitle: 'No family trees available',
  emptyDescription: 'Create a new family tree or import an existing one.',
  activeBadge: 'Active',
  createdLabel: 'Created:',
  updatedLabel: 'Updated:',
  viewActive: 'View',
  viewInactive: 'Open',
  renameButton: 'Rename',
  exportButton: 'Export',
  deleteButton: 'Delete',
  tableButton: 'Table',
  defaultTreeName: (date: string) => `Family Tree ${date}`,
  confirmDeleteTree: (name: string) =>
    `Do you really want to delete the family tree "${name}"? This action cannot be undone.`,
  confirmDeletePerson: 'Do you really want to delete this person?',
  tableTitle: 'Table overview',
  tableSearchPlaceholder: 'Search by name or details',
  treeSearchPlaceholder: 'Search the tree',
  treeSearchNoResults: 'No results',
  clearSearch: 'Clear search',
  unknownPerson: 'Unknown',
  unnamedPerson: 'Unnamed',
  tableEmpty: 'No persons available.',
  backToTree: 'Back to tree',
  noTreeTitle: 'No family tree selected',
  noTreeMessage: 'Please select a family tree from the overview.',
  backToOverview: 'Back to overview',
  defaultTreeTitle: 'Family tree',
  columnFirstName: 'First name',
  columnLastNames: 'Last names',
  columnGender: 'Gender',
  columnBloodGroup: 'Blood group',
  columnBirthDate: 'Birth date',
  columnDeathDate: 'Death date',
  columnCauseOfDeath: 'Cause of death',
  columnKnownDiseases: 'Known diseases',
  columnNotes: 'Notes',
  filterGenderLabel: 'Gender',
  filterStatusLabel: 'Status',
  filterBloodGroupLabel: 'Blood group',
  filterAll: 'All',
  filterMale: 'Male',
  filterFemale: 'Female',
  filterUnknown: 'Unknown',
  filterStatusAlive: 'Alive',
  filterStatusDeceased: 'Deceased',
  filterStatusUnknown: 'Unknown',
  filterBirthLabel: 'Birth',
  filterDeathLabel: 'Death',
  filterDateModeLabel: 'Mode',
  filterDateModeYear: 'Single year',
  filterDateModeYearRange: 'Year range',
  filterDateModeDateRange: 'Date range',
  filterFromLabel: 'From',
  filterToLabel: 'To',
  filterClear: 'Reset',
  expandTitle: 'Click to expand',
  marriedTitle: 'Married - click to change',
  divorcedTitle: 'Divorced - click to change',
  notLinkedLabel: 'Not linked:',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Center and fit',
  generationsAll: 'All',
  generationsLabel: 'Gen.',
  profilePhotoAlt: 'Profile photo',
  editPersonTitle: 'Person overview',
  photoChange: 'Change photo',
  photoUpload: 'Upload photo',
  photoRemove: 'Remove photo',
  firstName: 'First name',
  lastName: 'Last name',
  genderLabel: 'Gender',
  bloodGroupLabel: 'Blood group',
  bloodGroupPlaceholder: 'Select blood group',
  bloodGroupSuggestionsLabel: 'Possible from parent pair',
  bloodGroupSuggestionsEmpty: 'No parent-based blood group suggestion',
  maleLabel: 'Male',
  femaleLabel: 'Female',
  birthDate: 'Birth date',
  deathDate: 'Death date',
  day: 'Day',
  month: 'Month',
  year: 'Year',
  causeOfDeath: 'Cause of death',
  knownDiseases: 'Known diseases',
  notes: 'Notes',
  addLastName: 'Add last name',
  removeLastName: 'Remove',
  addKnownDisease: 'Add disease',
  removeKnownDisease: 'Remove',
  knownDiseaseSuggestionsEmpty: 'No suggestions',
  causeOfDeathSuggestionsEmpty: 'No suggestions',
  hereditaryLabel: 'Hereditary',
  potentialHereditaryRisks: 'Potential hereditary risks',
  potentialHereditaryRisksEmpty: 'No known hereditary risks',
  lastNameSuggestionsLabel: 'Suggestions from parents/spouses',
  lastNameSuggestionsEmpty: 'No suggestions',
  done: 'Done',
  menuEdit: 'Edit',
  menuParent: 'Parent',
  menuLink: 'Link',
  menuSpouse: 'Spouse',
  menuUnlink: 'Unlink',
  menuChild: 'Child',
  menuDelete: 'Delete',
  linkBack: 'Back',
  linkChildWith: 'Link child with...',
  linkParents: 'Link parents',
  linkSpouse: 'Link spouse',
  linkChild: 'Link child',
  addChildWith: 'Add child with...',
  removeLink: 'Remove link',
  linkWith: 'Link with...',
  noPersonsAvailable: 'No persons available',
  noLinksAvailable: 'No links available',
  withoutPartner: 'No partner',
  relationParent: 'Parent',
  relationSpouse: 'Spouse',
  relationChild: 'Child',
  passwordLabel: 'Password',
  passwordConfirmLabel: 'Confirm password',
  cancelLabel: 'Cancel',
  closeLabel: 'Close',
  minLengthError: (min: number) => `Password must be at least ${min} characters.`,
  mismatchError: 'Passwords do not match.',
  encryptionUnavailable: 'Encryption is not available. Please use HTTPS.',
  exportTitle: 'Encrypt export',
  exportDescription: 'Please set a password (at least 12 characters).',
  exportConfirm: 'Export',
  exportError: 'Failed to encrypt the file.',
  decryptUnavailable: 'Decryption is not available. Please use HTTPS.',
  importTitle: 'Decrypt import',
  importDescription: 'Please enter the password for the import.',
  importConfirm: 'Decrypt',
  importUnknownFormat: 'Unknown file format.',
  importError: 'Failed to import the file. Please check the file format or password.',
  personLabelSingular: 'person',
  personLabelPlural: 'people',
  richTextToolbarAria: (label: string) => `${label} toolbar`,
  richTextPromptLinkUrl: 'Link URL',
  richTextFormatLabel: 'Format',
  richTextFormatOptionParagraph: 'Text',
  richTextFormatOptionH2: 'H2',
  richTextFormatOptionH3: 'H3',
  richTextFormatOptionQuote: 'Quote',
  richTextFormatOptionCode: 'Code',
  richTextFormatPainterTitle: 'Copy/paste formatting',
  richTextBoldTitle: 'Bold (Ctrl+B)',
  richTextItalicTitle: 'Italic (Ctrl+I)',
  richTextUnderlineTitle: 'Underline (Ctrl+U)',
  richTextStrikeTitle: 'Strikethrough (Ctrl+Shift+X)',
  richTextBulletListTitle: 'Bulleted list (Ctrl+Shift+8)',
  richTextNumberedListTitle: 'Numbered list (Ctrl+Shift+7)',
  richTextQuoteTitle: 'Quote',
  richTextClearFormattingTitle: 'Clear formatting',
  richTextLinkTitle: 'Link (Ctrl+K)',
  richTextLinkButtonLabel: 'Link',
  richTextTextColorTitle: 'Text color',
  richTextTextColorAria: 'Text color',
  richTextHighlightTitle: 'Highlight',
  richTextHighlightAria: 'Highlight',
  richTextUndoTitle: 'Undo (Ctrl+Z)',
  richTextRedoTitle: 'Redo (Ctrl+Y)',
};

export type TranslationBundle = typeof englishTranslations;

const germanTranslations: TranslationBundle = {
  languageLabel: 'Sprache',
  managerTitle: 'Familienstammbäume',
  managerSubtitle: 'Verwalte deine Familienstammbäume',
  newTreePlaceholder: 'Name des neuen Familienstammbaums',
  newTreeButton: 'Neuer Familienstammbaum',
  importButton: 'Importieren',
  importDropHint: 'Oder ziehe eine JSON-Datei hierher, um sie zu importieren',
  importDropActive: 'Datei zum Importieren hier ablegen',
  installApp: 'App installieren',
  installAppHint: 'iOS: Tippe auf "Teilen" und dann auf "Zum Home-Bildschirm".',
  emptyTitle: 'Keine Familienstammbäume vorhanden',
  emptyDescription: 'Erstelle einen neuen Familienstammbaum oder importiere einen bestehenden.',
  activeBadge: 'Aktiv',
  createdLabel: 'Erstellt:',
  updatedLabel: 'Aktualisiert:',
  viewActive: 'Ansehen',
  viewInactive: 'Öffnen',
  renameButton: 'Umbenennen',
  exportButton: 'Exportieren',
  deleteButton: 'Löschen',
  tableButton: 'Tabelle',
  defaultTreeName: (date: string) => `Familienstammbaum ${date}`,
  confirmDeleteTree: (name: string) =>
    `Möchtest du den Familienstammbaum "${name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
  confirmDeletePerson: 'Möchtest du diese Person wirklich löschen?',
  tableTitle: 'Tabellenübersicht',
  tableSearchPlaceholder: 'Nach Namen oder Details suchen',
  treeSearchPlaceholder: 'Im Stammbaum suchen',
  treeSearchNoResults: 'Keine Ergebnisse',
  clearSearch: 'Suche löschen',
  unknownPerson: 'Unbekannt',
  unnamedPerson: 'Unbenannt',
  tableEmpty: 'Keine Personen vorhanden.',
  backToTree: 'Zurück zum Stammbaum',
  noTreeTitle: 'Kein Familienstammbaum ausgewählt',
  noTreeMessage: 'Bitte wähle einen Familienstammbaum aus der Übersicht aus.',
  backToOverview: 'Zurück zur Übersicht',
  defaultTreeTitle: 'Familienstammbaum',
  columnFirstName: 'Vorname',
  columnLastNames: 'Nachnamen',
  columnGender: 'Geschlecht',
  columnBloodGroup: 'Blutgruppe',
  columnBirthDate: 'Geburtsdatum',
  columnDeathDate: 'Todesdatum',
  columnCauseOfDeath: 'Todesursache',
  columnKnownDiseases: 'Bekannte Krankheiten',
  columnNotes: 'Notizen',
  filterGenderLabel: 'Geschlecht',
  filterStatusLabel: 'Status',
  filterBloodGroupLabel: 'Blutgruppe',
  filterAll: 'Alle',
  filterMale: 'Männlich',
  filterFemale: 'Weiblich',
  filterUnknown: 'Unbekannt',
  filterStatusAlive: 'Lebend',
  filterStatusDeceased: 'Verstorben',
  filterStatusUnknown: 'Unbekannt',
  filterBirthLabel: 'Geburt',
  filterDeathLabel: 'Tod',
  filterDateModeLabel: 'Modus',
  filterDateModeYear: 'Einzeljahr',
  filterDateModeYearRange: 'Jahresbereich',
  filterDateModeDateRange: 'Datumsbereich',
  filterFromLabel: 'Von',
  filterToLabel: 'Bis',
  filterClear: 'Zurücksetzen',
  expandTitle: 'Zum Erweitern klicken',
  marriedTitle: 'Verheiratet - klicken zum Ändern',
  divorcedTitle: 'Geschieden - klicken zum Ändern',
  notLinkedLabel: 'Nicht verknüpft:',
  zoomIn: 'Vergrößern',
  zoomOut: 'Verkleinern',
  zoomFit: 'Zentrieren und anpassen',
  generationsAll: 'Alle',
  generationsLabel: 'Gen.',
  profilePhotoAlt: 'Profilfoto',
  editPersonTitle: 'Personenübersicht',
  photoChange: 'Foto ändern',
  photoUpload: 'Foto hochladen',
  photoRemove: 'Foto entfernen',
  firstName: 'Vorname',
  lastName: 'Nachname',
  genderLabel: 'Geschlecht',
  bloodGroupLabel: 'Blutgruppe',
  bloodGroupPlaceholder: 'Blutgruppe wählen',
  bloodGroupSuggestionsLabel: 'Möglich aus Elternpaar',
  bloodGroupSuggestionsEmpty: 'Kein Blutgruppen-Vorschlag aus Elternpaar',
  maleLabel: 'Männlich',
  femaleLabel: 'Weiblich',
  birthDate: 'Geburtsdatum',
  deathDate: 'Todesdatum',
  day: 'Tag',
  month: 'Monat',
  year: 'Jahr',
  causeOfDeath: 'Todesursache',
  knownDiseases: 'Bekannte Krankheiten',
  notes: 'Notizen',
  addLastName: 'Nachnamen hinzufügen',
  removeLastName: 'Entfernen',
  addKnownDisease: 'Krankheit hinzufügen',
  removeKnownDisease: 'Entfernen',
  knownDiseaseSuggestionsEmpty: 'Keine Vorschläge',
  causeOfDeathSuggestionsEmpty: 'Keine Vorschläge',
  hereditaryLabel: 'Vererbbar',
  potentialHereditaryRisks: 'Potenziell vererbte Risiken',
  potentialHereditaryRisksEmpty: 'Keine bekannten vererbbaren Risiken',
  lastNameSuggestionsLabel: 'Vorschläge von Eltern/Partnern',
  lastNameSuggestionsEmpty: 'Keine Vorschläge',
  done: 'Fertig',
  menuEdit: 'Bearbeiten',
  menuParent: 'Elternteil',
  menuLink: 'Verknüpfen',
  menuSpouse: 'Partner',
  menuUnlink: 'Trennen',
  menuChild: 'Kind',
  menuDelete: 'Löschen',
  linkBack: 'Zurück',
  linkChildWith: 'Kind verknüpfen mit...',
  linkParents: 'Eltern verknüpfen',
  linkSpouse: 'Partner verknüpfen',
  linkChild: 'Kind verknüpfen',
  addChildWith: 'Kind hinzufügen mit...',
  removeLink: 'Verknüpfung entfernen',
  linkWith: 'Verknüpfen mit...',
  noPersonsAvailable: 'Keine Personen verfügbar',
  noLinksAvailable: 'Keine Verknüpfungen verfügbar',
  withoutPartner: 'Kein Partner',
  relationParent: 'Elternteil',
  relationSpouse: 'Partner',
  relationChild: 'Kind',
  passwordLabel: 'Passwort',
  passwordConfirmLabel: 'Passwort bestätigen',
  cancelLabel: 'Abbrechen',
  closeLabel: 'Schließen',
  minLengthError: (min: number) => `Passwort muss mindestens ${min} Zeichen lang sein.`,
  mismatchError: 'Passwörter stimmen nicht überein.',
  encryptionUnavailable: 'Verschlüsselung ist nicht verfügbar. Bitte verwende HTTPS.',
  exportTitle: 'Export verschlüsseln',
  exportDescription: 'Bitte setze ein Passwort (mindestens 12 Zeichen).',
  exportConfirm: 'Exportieren',
  exportError: 'Datei konnte nicht verschlüsselt werden.',
  decryptUnavailable: 'Entschlüsselung ist nicht verfügbar. Bitte verwende HTTPS.',
  importTitle: 'Import entschlüsseln',
  importDescription: 'Bitte gib das Passwort für den Import ein.',
  importConfirm: 'Entschlüsseln',
  importUnknownFormat: 'Unbekanntes Dateiformat.',
  importError: 'Datei konnte nicht importiert werden. Bitte prüfe Dateiformat oder Passwort.',
  personLabelSingular: 'Person',
  personLabelPlural: 'Personen',
  richTextToolbarAria: (label: string) => `${label} Werkzeugleiste`,
  richTextPromptLinkUrl: 'Link-URL',
  richTextFormatLabel: 'Format',
  richTextFormatOptionParagraph: 'Text',
  richTextFormatOptionH2: 'Überschrift 2',
  richTextFormatOptionH3: 'Überschrift 3',
  richTextFormatOptionQuote: 'Zitat',
  richTextFormatOptionCode: 'Code',
  richTextFormatPainterTitle: 'Format kopieren/einfügen',
  richTextBoldTitle: 'Fett (Ctrl+B)',
  richTextItalicTitle: 'Kursiv (Ctrl+I)',
  richTextUnderlineTitle: 'Unterstrichen (Ctrl+U)',
  richTextStrikeTitle: 'Durchgestrichen (Ctrl+Shift+X)',
  richTextBulletListTitle: 'Aufzählung (Ctrl+Shift+8)',
  richTextNumberedListTitle: 'Nummerierung (Ctrl+Shift+7)',
  richTextQuoteTitle: 'Zitat',
  richTextClearFormattingTitle: 'Formatierung entfernen',
  richTextLinkTitle: 'Link (Ctrl+K)',
  richTextLinkButtonLabel: 'Link',
  richTextTextColorTitle: 'Textfarbe',
  richTextTextColorAria: 'Textfarbe',
  richTextHighlightTitle: 'Highlight',
  richTextHighlightAria: 'Highlight',
  richTextUndoTitle: 'Rückgängig (Ctrl+Z)',
  richTextRedoTitle: 'Wiederholen (Ctrl+Y)',
};

const latvianTranslations: TranslationBundle = {
  languageLabel: 'Valoda',
  managerTitle: 'Ģimenes koki',
  managerSubtitle: 'Pārvaldi savus ģimenes kokus',
  newTreePlaceholder: 'Jaunā ģimenes koka nosaukums',
  newTreeButton: 'Jauns ģimenes koks',
  importButton: 'Importēt',
  importDropHint: 'Vai ievelc šeit JSON failu, lai importētu',
  importDropActive: 'Nomet failu, lai importētu',
  installApp: 'Instalēt lietotni',
  installAppHint: 'iOS: nospied "Share" un pēc tam "Add to Home Screen".',
  emptyTitle: 'Nav pieejamu ģimenes koku',
  emptyDescription: 'Izveido jaunu ģimenes koku vai importē esošu.',
  activeBadge: 'Aktīvs',
  createdLabel: 'Izveidots:',
  updatedLabel: 'Atjaunināts:',
  viewActive: 'Skatīt',
  viewInactive: 'Atvērt',
  renameButton: 'Pārdēvēt',
  exportButton: 'Eksportēt',
  deleteButton: 'Dzēst',
  tableButton: 'Tabula',
  defaultTreeName: (date: string) => `Ģimenes koks ${date}`,
  confirmDeleteTree: (name: string) =>
    `Vai tiešām vēlies dzēst ģimenes koku "${name}"? Šo darbību nevar atsaukt.`,
  confirmDeletePerson: 'Vai tiešām vēlies dzēst šo personu?',
  tableTitle: 'Tabulas pārskats',
  tableSearchPlaceholder: 'Meklēt pēc vārda vai detaļām',
  treeSearchPlaceholder: 'Meklēt kokā',
  treeSearchNoResults: 'Nav rezultātu',
  clearSearch: 'Notīrīt meklēšanu',
  unknownPerson: 'Nezināms',
  unnamedPerson: 'Bez vārda',
  tableEmpty: 'Nav pieejamu personu.',
  backToTree: 'Atpakaļ uz koku',
  noTreeTitle: 'Nav izvēlēts ģimenes koks',
  noTreeMessage: 'Lūdzu, izvēlies ģimenes koku no pārskata.',
  backToOverview: 'Atpakaļ uz pārskatu',
  defaultTreeTitle: 'Ģimenes koks',
  columnFirstName: 'Vārds',
  columnLastNames: 'Uzvārdi',
  columnGender: 'Dzimums',
  columnBloodGroup: 'Asinsgrupa',
  columnBirthDate: 'Dzimšanas datums',
  columnDeathDate: 'Nāves datums',
  columnCauseOfDeath: 'Nāves cēlonis',
  columnKnownDiseases: 'Zināmās slimības',
  columnNotes: 'Piezīmes',
  filterGenderLabel: 'Dzimums',
  filterStatusLabel: 'Statuss',
  filterBloodGroupLabel: 'Asinsgrupa',
  filterAll: 'Visi',
  filterMale: 'Vīrietis',
  filterFemale: 'Sieviete',
  filterUnknown: 'Nezināms',
  filterStatusAlive: 'Dzīvs',
  filterStatusDeceased: 'Miris',
  filterStatusUnknown: 'Nezināms',
  filterBirthLabel: 'Dzimšana',
  filterDeathLabel: 'Nāve',
  filterDateModeLabel: 'Režīms',
  filterDateModeYear: 'Viens gads',
  filterDateModeYearRange: 'Gadu diapazons',
  filterDateModeDateRange: 'Datumu diapazons',
  filterFromLabel: 'No',
  filterToLabel: 'Līdz',
  filterClear: 'Atiestatīt',
  expandTitle: 'Noklikšķini, lai izvērstu',
  marriedTitle: 'Precējušies - noklikšķini, lai mainītu',
  divorcedTitle: 'Šķīrušies - noklikšķini, lai mainītu',
  notLinkedLabel: 'Nav sasaistīts:',
  zoomIn: 'Pietuvināt',
  zoomOut: 'Attālināt',
  zoomFit: 'Centrēt un pielāgot',
  generationsAll: 'Visas',
  generationsLabel: 'Paaudzes',
  profilePhotoAlt: 'Profila foto',
  editPersonTitle: 'Personas pārskats',
  photoChange: 'Mainīt foto',
  photoUpload: 'Augšupielādēt foto',
  photoRemove: 'Noņemt foto',
  firstName: 'Vārds',
  lastName: 'Uzvārds',
  genderLabel: 'Dzimums',
  bloodGroupLabel: 'Asinsgrupa',
  bloodGroupPlaceholder: 'Izvēlies asinsgrupu',
  bloodGroupSuggestionsLabel: 'Iespējams no vecāku pāra',
  bloodGroupSuggestionsEmpty: 'Nav asinsgrupas ieteikumu no vecāku pāra',
  maleLabel: 'Vīrietis',
  femaleLabel: 'Sieviete',
  birthDate: 'Dzimšanas datums',
  deathDate: 'Nāves datums',
  day: 'Diena',
  month: 'Mēnesis',
  year: 'Gads',
  causeOfDeath: 'Nāves cēlonis',
  knownDiseases: 'Zināmās slimības',
  notes: 'Piezīmes',
  addLastName: 'Pievienot uzvārdu',
  removeLastName: 'Noņemt',
  addKnownDisease: 'Pievienot slimību',
  removeKnownDisease: 'Noņemt',
  knownDiseaseSuggestionsEmpty: 'Nav ieteikumu',
  causeOfDeathSuggestionsEmpty: 'Nav ieteikumu',
  hereditaryLabel: 'Iedzimta',
  potentialHereditaryRisks: 'Potenciālie iedzimtie riski',
  potentialHereditaryRisksEmpty: 'Nav zināmu iedzimtu risku',
  lastNameSuggestionsLabel: 'Ieteikumi no vecākiem/partneriem',
  lastNameSuggestionsEmpty: 'Nav ieteikumu',
  done: 'Gatavs',
  menuEdit: 'Rediģēt',
  menuParent: 'Vecāks',
  menuLink: 'Sasaistīt',
  menuSpouse: 'Partneris',
  menuUnlink: 'Atsaistīt',
  menuChild: 'Bērns',
  menuDelete: 'Dzēst',
  linkBack: 'Atpakaļ',
  linkChildWith: 'Sasaistīt bērnu ar...',
  linkParents: 'Sasaistīt vecākus',
  linkSpouse: 'Sasaistīt partneri',
  linkChild: 'Sasaistīt bērnu',
  addChildWith: 'Pievienot bērnu ar...',
  removeLink: 'Noņemt saiti',
  linkWith: 'Sasaistīt ar...',
  noPersonsAvailable: 'Nav pieejamu personu',
  noLinksAvailable: 'Nav pieejamu saišu',
  withoutPartner: 'Nav partnera',
  relationParent: 'Vecāks',
  relationSpouse: 'Partneris',
  relationChild: 'Bērns',
  passwordLabel: 'Parole',
  passwordConfirmLabel: 'Apstiprini paroli',
  cancelLabel: 'Atcelt',
  closeLabel: 'Aizvērt',
  minLengthError: (min: number) => `Parolei jābūt vismaz ${min} rakstzīmes garai.`,
  mismatchError: 'Paroles nesakrīt.',
  encryptionUnavailable: 'Šifrēšana nav pieejama. Lūdzu, izmanto HTTPS.',
  exportTitle: 'Šifrēt eksportu',
  exportDescription: 'Lūdzu, iestati paroli (vismaz 12 rakstzīmes).',
  exportConfirm: 'Eksportēt',
  exportError: 'Neizdevās šifrēt failu.',
  decryptUnavailable: 'Atšifrēšana nav pieejama. Lūdzu, izmanto HTTPS.',
  importTitle: 'Atšifrēt importu',
  importDescription: 'Lūdzu, ievadi importa paroli.',
  importConfirm: 'Atšifrēt',
  importUnknownFormat: 'Nezināms faila formāts.',
  importError: 'Neizdevās importēt failu. Lūdzu, pārbaudi faila formātu vai paroli.',
  personLabelSingular: 'persona',
  personLabelPlural: 'personas',
  richTextToolbarAria: (label: string) => `${label} rīkjosla`,
  richTextPromptLinkUrl: 'Saites URL',
  richTextFormatLabel: 'Formāts',
  richTextFormatOptionParagraph: 'Teksts',
  richTextFormatOptionH2: 'Virsraksts 2',
  richTextFormatOptionH3: 'Virsraksts 3',
  richTextFormatOptionQuote: 'Citāts',
  richTextFormatOptionCode: 'Kods',
  richTextFormatPainterTitle: 'Kopēt/ielīmēt formatējumu',
  richTextBoldTitle: 'Treknraksts (Ctrl+B)',
  richTextItalicTitle: 'Slīpraksts (Ctrl+I)',
  richTextUnderlineTitle: 'Pasvītrots (Ctrl+U)',
  richTextStrikeTitle: 'Pārsvītrots (Ctrl+Shift+X)',
  richTextBulletListTitle: 'Aizzīmju saraksts (Ctrl+Shift+8)',
  richTextNumberedListTitle: 'Numurēts saraksts (Ctrl+Shift+7)',
  richTextQuoteTitle: 'Citāts',
  richTextClearFormattingTitle: 'Noņemt formatējumu',
  richTextLinkTitle: 'Saite (Ctrl+K)',
  richTextLinkButtonLabel: 'Saite',
  richTextTextColorTitle: 'Teksta krāsa',
  richTextTextColorAria: 'Teksta krāsa',
  richTextHighlightTitle: 'Izcēlums',
  richTextHighlightAria: 'Izcēlums',
  richTextUndoTitle: 'Atsaukt (Ctrl+Z)',
  richTextRedoTitle: 'Atkārtot (Ctrl+Y)',
};

export const translations: Record<LanguageCode, TranslationBundle> = {
  en: englishTranslations,
  de: germanTranslations,
  lv: latvianTranslations,
  custom: englishTranslations,
};

const translationTemplateKeys = [
  'defaultTreeName',
  'confirmDeleteTree',
  'minLengthError',
  'richTextToolbarAria',
] as const;
type PersistedCustomTranslationMap = Partial<Record<keyof TranslationBundle, string>>;

const translationKeys = Object.keys(englishTranslations) as Array<keyof TranslationBundle>;
const translationTemplateKeySet = new Set<string>(translationTemplateKeys);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const countTranslationMatches = (candidate: Record<string, unknown>) => {
  return translationKeys.reduce((count, key) => {
    return Object.prototype.hasOwnProperty.call(candidate, key) ? count + 1 : count;
  }, 0);
};

const pickBestTranslationCandidate = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) return null;

  const queue: Array<{ value: Record<string, unknown>; depth: number }> = [{ value, depth: 0 }];
  const visited = new Set<Record<string, unknown>>();
  let bestCandidate: Record<string, unknown> | null = null;
  let bestScore = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const { value: currentValue, depth } = current;
    if (visited.has(currentValue)) continue;
    visited.add(currentValue);

    const score = countTranslationMatches(currentValue);
    if (score > bestScore) {
      bestCandidate = currentValue;
      bestScore = score;
    }

    if (depth >= 2) continue;
    Object.values(currentValue).forEach((nestedValue) => {
      if (isRecord(nestedValue)) {
        queue.push({ value: nestedValue, depth: depth + 1 });
      }
    });
  }

  return bestScore > 0 ? bestCandidate : null;
};

const applyTemplate = (template: string, replacements: Record<string, string | number>) => {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, placeholder: string) => {
    if (Object.prototype.hasOwnProperty.call(replacements, placeholder)) {
      return String(replacements[placeholder] ?? '');
    }
    return `{${placeholder}}`;
  });
};

const buildCustomTranslationBundle = (source: Record<string, unknown>): TranslationBundle => {
  const bundle: TranslationBundle = { ...englishTranslations };
  const writableBundle = bundle as Record<string, unknown>;

  translationKeys.forEach((key) => {
    if (translationTemplateKeySet.has(key)) return;
    const value = source[key];
    if (typeof value === 'string') {
      writableBundle[key] = value;
    }
  });

  const defaultTreeNameTemplate = typeof source.defaultTreeName === 'string'
    ? source.defaultTreeName
    : null;
  const confirmDeleteTreeTemplate = typeof source.confirmDeleteTree === 'string'
    ? source.confirmDeleteTree
    : null;
  const minLengthErrorTemplate = typeof source.minLengthError === 'string'
    ? source.minLengthError
    : null;
  const richTextToolbarAriaTemplate = typeof source.richTextToolbarAria === 'string'
    ? source.richTextToolbarAria
    : null;

  bundle.defaultTreeName = defaultTreeNameTemplate
    ? (date: string) => applyTemplate(defaultTreeNameTemplate, { date })
    : englishTranslations.defaultTreeName;
  bundle.confirmDeleteTree = confirmDeleteTreeTemplate
    ? (name: string) => applyTemplate(confirmDeleteTreeTemplate, { name })
    : englishTranslations.confirmDeleteTree;
  bundle.minLengthError = minLengthErrorTemplate
    ? (min: number) => applyTemplate(minLengthErrorTemplate, { min })
    : englishTranslations.minLengthError;
  bundle.richTextToolbarAria = richTextToolbarAriaTemplate
    ? (label: string) => applyTemplate(richTextToolbarAriaTemplate, { label })
    : englishTranslations.richTextToolbarAria;

  return bundle;
};

const getPersistedCustomTranslationMap = (
  source: Record<string, unknown>
): PersistedCustomTranslationMap => {
  const map: PersistedCustomTranslationMap = {};
  translationKeys.forEach((key) => {
    const value = source[key];
    if (typeof value === 'string') {
      map[key] = value;
    }
  });
  return map;
};

export type ParsedCustomTranslations = {
  bundle: TranslationBundle;
  serialized: string;
};

export const parseCustomTranslations = (rawText: string): ParsedCustomTranslations | null => {
  try {
    const sanitized = rawText.replace(/^\uFEFF/, '').trim();
    const parsed = JSON.parse(sanitized);
    const candidate = pickBestTranslationCandidate(parsed);
    if (!candidate) return null;

    const persistedMap = getPersistedCustomTranslationMap(candidate);
    if (Object.keys(persistedMap).length === 0) return null;

    return {
      bundle: buildCustomTranslationBundle(candidate),
      serialized: JSON.stringify(persistedMap),
    };
  } catch {
    return null;
  }
};

export const applyCustomTranslations = (bundle: TranslationBundle) => {
  translations.custom = bundle;
};

export const resetCustomTranslations = () => {
  translations.custom = englishTranslations;
};
