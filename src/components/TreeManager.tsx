import { useState, useEffect, useRef, type DragEvent } from 'react';
import { FamilyTreeMetadata } from '../types';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { translations, getLocale, languageOptions, type LanguageCode } from '../i18n';

interface TreeManagerProps {
  trees: Record<string, FamilyTreeMetadata>;
  activeTreeId: string | null;
  onCreateTree: (name: string) => void;
  onSelectTree: (treeId: string) => void;
  onRenameTree: (treeId: string, newName: string) => void;
  onDeleteTree: (treeId: string) => void;
  onExportTree: (treeId: string) => void;
  onImportTree: () => void;
  onImportTreeFile: (file: File) => Promise<boolean>;
  onOpenTable: (treeId: string) => void;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const renderFlag = (code: LanguageCode) => {
  switch (code) {
    case 'de':
      return (
        <svg viewBox="0 0 3 2" aria-hidden="true" focusable="false">
          <rect width="3" height="0.67" y="0" fill="#000" />
          <rect width="3" height="0.66" y="0.66" fill="#DD0000" />
          <rect width="3" height="0.68" y="1.32" fill="#FFCE00" />
        </svg>
      );
    case 'lv':
      return (
        <svg viewBox="0 0 3 2" aria-hidden="true" focusable="false">
          <rect width="3" height="2" fill="#A11F3B" />
          <rect y="0.75" width="3" height="0.5" fill="#F2F2F2" />
        </svg>
      );
    case 'custom':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3a14 14 0 0 1 0 18" />
          <path d="M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 3 2" aria-hidden="true" focusable="false">
          <rect width="3" height="2" fill="#FFFFFF" />
          <rect x="1.1" width="0.8" height="2" fill="#D80027" />
          <rect y="0.6" width="3" height="0.8" fill="#D80027" />
        </svg>
      );
  }
};

export const TreeManager = ({
  trees,
  activeTreeId,
  onCreateTree,
  onSelectTree,
  onRenameTree,
  onDeleteTree,
  onExportTree,
  onImportTree,
  onImportTreeFile,
  onOpenTable,
}: TreeManagerProps) => {
  const [newTreeName, setNewTreeName] = useState('');
  const [editingTreeId, setEditingTreeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const { language, hasCustomLanguagePack, setLanguage, importCustomLanguage } = useFamilyTree();
  const copy = translations[language];
  const locale = getLocale(language);

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };

    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalone(isStandaloneMode);
    };

    checkStandalone();
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('resize', checkStandalone);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('resize', checkStandalone);
    };
  }, []);

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  const isSafari = /safari/i.test(userAgent) && !/crios|fxios|edgios|android/i.test(userAgent);
  const canInstall = !isStandalone && (installPrompt || (isIos && isSafari));

  const handleInstallClick = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallPrompt(null);
      }
      return;
    }

    if (isIos && isSafari) {
      setShowInstallHint(true);
    }
  };

  const treeList = Object.values(trees).sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const handleCreateTree = () => {
    const dateLabel = new Date().toLocaleDateString(locale);
    const treeName = newTreeName.trim() || copy.defaultTreeName(dateLabel);
    onCreateTree(treeName);
    setNewTreeName('');
  };

  const handleStartRename = (tree: FamilyTreeMetadata) => {
    setEditingTreeId(tree.id);
    setEditingName(tree.name);
  };

  const handleSaveRename = () => {
    if (editingTreeId && editingName.trim()) {
      onRenameTree(editingTreeId, editingName.trim());
      setEditingTreeId(null);
      setEditingName('');
    }
  };

  const handleCancelRename = () => {
    setEditingTreeId(null);
    setEditingName('');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasFilePayload = (event: DragEvent<HTMLDivElement>) => {
    const { dataTransfer } = event;
    if (!dataTransfer) return false;
    if (dataTransfer.files && dataTransfer.files.length > 0) return true;
    if (dataTransfer.items && Array.from(dataTransfer.items).some((item) => item.kind === 'file')) return true;
    return Array.from(dataTransfer.types ?? []).includes('Files');
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    setIsDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void onImportTreeFile(file);
  };

  const handleLanguageSelect = (code: LanguageCode) => {
    if (code !== 'custom') {
      setLanguage(code);
      return;
    }

    if (language !== 'custom' && hasCustomLanguagePack) {
      setLanguage('custom');
      return;
    }

    importCustomLanguage();
  };

  return (
    <div
      className={`tree-manager ${isDragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="tree-manager-header">
        <div className="language-switch">
          <span className="language-switch-label">{copy.languageLabel}</span>
          <div className="language-switch-buttons">
            {languageOptions.map(option => {
              const isCustomOption = option.code === 'custom';
              const customOptionLabel = (!hasCustomLanguagePack || language === 'custom')
                ? 'Custom (Import JSON)'
                : option.name;

              return (
                <button
                  key={option.code}
                  type="button"
                  className={`language-button ${language === option.code ? 'active' : ''}`}
                  onClick={() => handleLanguageSelect(option.code)}
                  aria-pressed={language === option.code}
                  aria-label={isCustomOption ? customOptionLabel : option.name}
                  title={isCustomOption ? customOptionLabel : option.name}
                >
                  <span className={`language-flag ${option.code === 'custom' ? 'is-custom' : ''}`}>
                    {renderFlag(option.code)}
                  </span>
                  <span className="language-code">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <h1>{copy.managerTitle}</h1>
        <p className="tree-manager-subtitle">{copy.managerSubtitle}</p>
      </div>

      <div className="tree-manager-actions">
        <div className="create-tree-section">
          <input
            type="text"
            placeholder={copy.newTreePlaceholder}
            value={newTreeName}
            onChange={(e) => setNewTreeName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateTree()}
            className="tree-name-input"
          />
          <button type="button" onClick={handleCreateTree} className="btn-create-tree">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
            {copy.newTreeButton}
          </button>
          <button type="button" onClick={onImportTree} className="btn-import-tree">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {copy.importButton}
          </button>
          {canInstall && (
            <button type="button" onClick={handleInstallClick} className="btn-install-app">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm0 2v16h10V4H7zm5 3-3 3h2v4h2v-4h2l-3-3z" />
              </svg>
              {copy.installApp}
            </button>
          )}
        </div>
        <div className={`import-drop-zone ${isDragActive ? 'active' : ''}`}>
          {isDragActive ? copy.importDropActive : copy.importDropHint}
        </div>
        {showInstallHint && isIos && isSafari && (
          <div className="pwa-install-hint">{copy.installAppHint}</div>
        )}
      </div>

      <div className="tree-list">
        {treeList.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
            </svg>
            <h3>{copy.emptyTitle}</h3>
            <p>{copy.emptyDescription}</p>
          </div>
        ) : (
          treeList.map((tree) => (
            <div
              key={tree.id}
              className={`tree-card ${activeTreeId === tree.id ? 'active' : ''}`}
            >
              <div className="tree-card-header">
                {editingTreeId === tree.id ? (
                  <div className="tree-card-edit">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSaveRename()}
                      className="tree-rename-input"
                      autoFocus
                    />
                    <button type="button" onClick={handleSaveRename} className="btn-save-rename">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    </button>
                    <button type="button" onClick={handleCancelRename} className="btn-cancel-rename">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <h2>{tree.name}</h2>
                    {activeTreeId === tree.id && <span className="active-badge">{copy.activeBadge}</span>}
                  </>
                )}
              </div>

              <div className="tree-card-info">
                <div className="tree-card-meta">
                  <span>{copy.createdLabel} {formatDate(tree.createdAt)}</span>
                  <span>{copy.updatedLabel} {formatDate(tree.updatedAt)}</span>
                </div>
              </div>

              <div className="tree-card-actions">
                <button
                  type="button"
                  onClick={() => onSelectTree(tree.id)}
                  className="btn-select-tree"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                  </svg>
                  {activeTreeId === tree.id ? copy.viewActive : copy.viewInactive}
                </button>
                <button type="button" onClick={() => handleStartRename(tree)} className="btn-rename-tree">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                  </svg>
                  {copy.renameButton}
                </button>
                <button type="button" onClick={() => onOpenTable(tree.id)} className="btn-table-tree">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 5c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5zm2 0v3h14V5H5zm0 5v3h6v-3H5zm8 0v3h6v-3h-6zm-8 5v3h6v-3H5zm8 0v3h6v-3h-6z" />
                  </svg>
                  {copy.tableButton}
                </button>
                <button type="button" onClick={() => onExportTree(tree.id)} className="btn-export-tree">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z" />
                  </svg>
                  {copy.exportButton}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(copy.confirmDeleteTree(tree.name))) {
                      onDeleteTree(tree.id);
                    }
                  }}
                  className="btn-delete-tree"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                  </svg>
                  {copy.deleteButton}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

