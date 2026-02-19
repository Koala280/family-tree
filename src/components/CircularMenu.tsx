import { useEffect, useState, type MouseEvent } from 'react';
import { Person } from '../types';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { translations } from '../i18n';
import { getLastNameList } from '../utils/person';

interface CircularMenuProps {
  person: Person;
  canAddParent: boolean;
  onAddParent: () => void;
  onAddSpouse: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onLink: () => void;
  onUnlink: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const CircularMenu = ({
  person,
  canAddParent,
  onAddParent,
  onAddSpouse,
  onAddChild,
  onEdit,
  onLink,
  onUnlink,
  onDelete,
  onClose,
}: CircularMenuProps) => {
  const firstName = (person.firstName ?? '').trim();
  const firstLastName = getLastNameList(person).find((name) => name.trim().length > 0)?.trim() ?? '';
  const personName = [firstName, firstLastName].filter(Boolean).join(' ').trim();
  const [isReady, setIsReady] = useState(false);
  const { language } = useFamilyTree();
  const copy = translations[language];
  const handleItemClick = (action: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
    if (!isReady) return;
    event.stopPropagation();
    action();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => setIsReady(true), 240);
    return () => window.clearTimeout(timer);
  }, []);

  const handleOverlayClick = () => {
    if (!isReady) return;
    onClose();
  };

  return (
    <div className="circular-menu-overlay" onClick={handleOverlayClick}>
      <div className={`circular-menu ${isReady ? 'ready' : 'opening'}`}>
        <div className="circular-menu-center" onClick={(e) => e.stopPropagation()}>
          {person.photo && (
            <div className="circular-menu-photo">
              <img src={person.photo} alt={personName} />
            </div>
          )}
          {!person.photo && (
            <div className={`circular-menu-avatar ${person.gender === 'male' ? 'male' : person.gender === 'female' ? 'female' : ''}`}>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
          )}
          <div className="circular-menu-name">{personName}</div>
          <button className="circular-menu-edit-btn" onClick={handleItemClick(onEdit)}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
            {copy.menuEdit}
          </button>
        </div>

        <div className="circular-menu-items">
          <button
            className="circular-menu-item pos-up"
            onClick={handleItemClick(onAddParent)}
            disabled={!canAddParent}
            aria-disabled={!canAddParent}
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5.9c1.16 0 2.1.94 2.1 2.1s-.94 2.1-2.1 2.1S9.9 9.16 9.9 8s.94-2.1 2.1-2.1m0 9c2.97 0 6.1 1.46 6.1 2.1v1.1H5.9V17c0-.64 3.13-2.1 6.1-2.1M12 4C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 9c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z" />
            </svg>
            <span>{copy.menuParent}</span>
          </button>

          <button className="circular-menu-item pos-up-right" onClick={handleItemClick(onAddSpouse)}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
            <span>{copy.menuSpouse}</span>
          </button>

          <button className="circular-menu-item pos-down-right" onClick={handleItemClick(onAddChild)}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <span>{copy.menuChild}</span>
          </button>

          <button className="circular-menu-item danger pos-down" onClick={handleItemClick(onDelete)}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            <span>{copy.menuDelete}</span>
          </button>

          <button className="circular-menu-item pos-down-left" onClick={handleItemClick(onUnlink)}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1 0 1.43-.98 2.63-2.31 2.98l1.46 1.46C20.88 15.61 22 13.95 22 12c0-2.76-2.24-5-5-5zm-1 4h-2.19l2 2H16zM2 4.27l3.11 3.11C3.29 8.12 2 9.91 2 12c0 2.76 2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1 0-1.59 1.21-2.9 2.76-3.07L8.73 11H8v2h2.73L13 15.27V17h1.73l4.01 4.01 1.27-1.27L3.27 3 2 4.27z" />
            </svg>
            <span>{copy.menuUnlink}</span>
          </button>

          <button className="circular-menu-item pos-up-left" onClick={handleItemClick(onLink)}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
            </svg>
            <span>{copy.menuLink}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
