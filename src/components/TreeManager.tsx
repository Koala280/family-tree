import { useState } from 'react';
import { FamilyTreeMetadata } from '../types';

interface TreeManagerProps {
  trees: Record<string, FamilyTreeMetadata>;
  activeTreeId: string | null;
  onCreateTree: (name: string) => void;
  onSelectTree: (treeId: string) => void;
  onRenameTree: (treeId: string, newName: string) => void;
  onDeleteTree: (treeId: string) => void;
  onExportTree: (treeId: string) => void;
  onImportTree: () => void;
}

export const TreeManager = ({
  trees,
  activeTreeId,
  onCreateTree,
  onSelectTree,
  onRenameTree,
  onDeleteTree,
  onExportTree,
  onImportTree,
}: TreeManagerProps) => {
  const [newTreeName, setNewTreeName] = useState('');
  const [editingTreeId, setEditingTreeId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const treeList = Object.values(trees).sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const handleCreateTree = () => {
    const treeName = newTreeName.trim() || `Stammbaum ${new Date().toLocaleDateString('de-DE')}`;
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
    return date.toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="tree-manager">
      <div className="tree-manager-header">
        <h1>Familienstammbäume</h1>
        <p className="tree-manager-subtitle">Verwalten Sie Ihre Familienstammbäume</p>
      </div>

      <div className="tree-manager-actions">
        <div className="create-tree-section">
          <input
            type="text"
            placeholder="Name des neuen Stammbaums"
            value={newTreeName}
            onChange={(e) => setNewTreeName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateTree()}
            className="tree-name-input"
          />
          <button onClick={handleCreateTree} className="btn-create-tree">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            Neuer Stammbaum
          </button>
          <button onClick={onImportTree} className="btn-import-tree">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6-.67l-2.59 2.58L9 12.5l5-5 5 5-1.41 1.41L13 11.33V21h-2z"/>
            </svg>
            Importieren
          </button>
        </div>
      </div>

      <div className="tree-list">
        {treeList.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            <h3>Keine Stammbäume vorhanden</h3>
            <p>Erstellen Sie einen neuen Stammbaum oder importieren Sie einen bestehenden.</p>
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
                    <button onClick={handleSaveRename} className="btn-save-rename">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    </button>
                    <button onClick={handleCancelRename} className="btn-cancel-rename">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <h2>{tree.name}</h2>
                    {activeTreeId === tree.id && <span className="active-badge">Aktiv</span>}
                  </>
                )}
              </div>

              <div className="tree-card-info">
                <div className="tree-card-meta">
                  <span>Erstellt: {formatDate(tree.createdAt)}</span>
                  <span>Aktualisiert: {formatDate(tree.updatedAt)}</span>
                </div>
              </div>

              <div className="tree-card-actions">
                <button
                  onClick={() => onSelectTree(tree.id)}
                  className="btn-select-tree"
                  disabled={activeTreeId === tree.id}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                  </svg>
                  {activeTreeId === tree.id ? 'Geöffnet' : 'Öffnen'}
                </button>
                <button onClick={() => handleStartRename(tree)} className="btn-rename-tree">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                  Umbenennen
                </button>
                <button onClick={() => onExportTree(tree.id)} className="btn-export-tree">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/>
                  </svg>
                  Exportieren
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Möchten Sie den Stammbaum "${tree.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
                      onDeleteTree(tree.id);
                    }
                  }}
                  className="btn-delete-tree"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                  Löschen
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
