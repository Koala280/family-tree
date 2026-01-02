import { useRef, useMemo, useState } from 'react';
import { Person, DateInfo } from '../types';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { translations } from '../i18n';
import { getLastNameList } from '../utils/person';

interface PersonEditModalProps {
  person: Person;
  onClose: () => void;
}

export const PersonEditModal = ({ person, onClose }: PersonEditModalProps) => {
  const { updatePerson, familyTree, language } = useFamilyTree();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copy = translations[language];
  const [activeLastNameIndex, setActiveLastNameIndex] = useState<number | null>(null);
  const lastNameInputs = (() => {
    const lastNames = getLastNameList(person);
    return lastNames.length > 0 ? lastNames : [''];
  })();
  const normalizeLastName = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const currentNormalized = new Set(
    lastNameInputs
      .map(value => value.trim())
      .filter(Boolean)
      .map(normalizeLastName)
  );
  const allLastNames = useMemo(() => {
    if (!familyTree) return [];
    const unique = new Set<string>();
    Object.values(familyTree.persons).forEach(entry => {
      getLastNameList(entry).forEach(name => {
        const trimmed = name.trim();
        if (trimmed) {
          unique.add(trimmed);
        }
      });
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [familyTree]);
  const relatedLastNames = useMemo(() => {
    if (!familyTree) return [];
    const related = new Set<string>();

    if (person.parentUnionId) {
      const union = familyTree.unions[person.parentUnionId];
      union?.partnerIds.forEach(parentId => {
        const parent = familyTree.persons[parentId];
        if (!parent) return;
        getLastNameList(parent).forEach(name => {
          const trimmed = name.trim();
          if (trimmed) related.add(trimmed);
        });
      });
    }

    person.unionIds.forEach(unionId => {
      const union = familyTree.unions[unionId];
      union?.partnerIds.forEach(partnerId => {
        if (partnerId === person.id) return;
        const partner = familyTree.persons[partnerId];
        if (!partner) return;
        getLastNameList(partner).forEach(name => {
          const trimmed = name.trim();
          if (trimmed) related.add(trimmed);
        });
      });
    });

    return Array.from(related)
      .filter(name => !currentNormalized.has(normalizeLastName(name)))
      .sort((a, b) => a.localeCompare(b));
  }, [familyTree, person, currentNormalized]);

  const handleInputChange = (field: keyof Person, value: unknown) => {
    updatePerson(person.id, { [field]: value });
  };

  const handleDateChange = (dateType: 'birthDate' | 'deathDate', field: keyof DateInfo, value: string) => {
    const currentDate = person[dateType];
    handleInputChange(dateType, { ...currentDate, [field]: value });
  };

  const handleGenderChange = (gender: 'male' | 'female') => {
    handleInputChange('gender', person.gender === gender ? null : gender);
  };

  const handleLastNameChange = (index: number, value: string) => {
    const next = [...lastNameInputs];
    next[index] = value;
    updatePerson(person.id, { lastNames: next });
  };

  const handleAddLastName = () => {
    updatePerson(person.id, { lastNames: [...lastNameInputs, ''] });
  };

  const handleRemoveLastName = (index: number) => {
    if (lastNameInputs.length <= 1) {
      updatePerson(person.id, { lastNames: [''] });
      return;
    }
    const next = lastNameInputs.filter((_, idx) => idx !== index);
    updatePerson(person.id, { lastNames: next });
  };

  const applySuggestedLastName = (name: string, targetIndex?: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (currentNormalized.has(normalizeLastName(trimmed))) return;

    if (typeof targetIndex === 'number') {
      if (!lastNameInputs[targetIndex]?.trim()) {
        const next = [...lastNameInputs];
        next[targetIndex] = trimmed;
        updatePerson(person.id, { lastNames: next });
        return;
      }
    }

    updatePerson(person.id, { lastNames: [...lastNameInputs, trimmed] });
  };

  const getMatchingLastNames = (value: string) => {
    const normalized = normalizeLastName(value);
    if (!normalized) return [];
    return allLastNames
      .filter(name => normalizeLastName(name).includes(normalized))
      .filter(name => !currentNormalized.has(normalizeLastName(name)))
      .slice(0, 8);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        handleInputChange('photo', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{copy.editPersonTitle}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={copy.closeLabel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="profile-photo-section">
            <div
              className={`profile-photo ${person.gender === 'male' ? 'male' : person.gender === 'female' ? 'female' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {person.photo ? (
                <img src={person.photo} alt={copy.profilePhotoAlt} />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="change-photo-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              {person.photo ? copy.photoChange : copy.photoUpload}
            </button>
            {person.photo && (
              <button
                type="button"
                className="remove-photo-btn"
                onClick={() => handleInputChange('photo', undefined)}
              >
                {copy.photoRemove}
              </button>
            )}
          </div>

          <div className="form-group">
            <label>{copy.firstName}</label>
            <input
              type="text"
              value={person.firstName || ''}
              onChange={(e) => handleInputChange('firstName', e.target.value)}
              placeholder={copy.firstName}
            />
          </div>

          <div className="form-group">
            <label>{copy.columnLastNames}</label>
            <div className="last-name-list">
              {relatedLastNames.length > 0 && (
                <div className="last-name-suggestions">
                  <span className="last-name-suggestions-label">{copy.lastNameSuggestionsLabel}</span>
                  <div className="last-name-suggestions-list">
                    {relatedLastNames.map(name => (
                      <button
                        key={`suggest-last-${person.id}-${name}`}
                        type="button"
                        className="last-name-suggestion"
                        onClick={() => applySuggestedLastName(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {lastNameInputs.map((value, index) => (
                <div key={`last-name-${person.id}-${index}`} className="last-name-row">
                  <div className="last-name-input-wrapper">
                    {(() => {
                      const matching = activeLastNameIndex === index && value.trim()
                        ? getMatchingLastNames(value)
                        : [];
                      return (
                        <>
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => handleLastNameChange(index, e.target.value)}
                            onFocus={() => setActiveLastNameIndex(index)}
                            onBlur={() => window.setTimeout(() => setActiveLastNameIndex(null), 120)}
                            placeholder={copy.lastName}
                          />
                          {matching.length > 0 && (
                            <div className="last-name-dropdown">
                              {matching.map(name => (
                                <button
                                  key={`last-name-option-${person.id}-${index}-${name}`}
                                  type="button"
                                  className="last-name-dropdown-item"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => applySuggestedLastName(name, index)}
                                >
                                  {name}
                                </button>
                              ))}
                            </div>
                          )}
                          {activeLastNameIndex === index && value.trim() && matching.length === 0 && (
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
                    className="btn-inline-remove"
                    onClick={() => handleRemoveLastName(index)}
                  >
                    {copy.removeLastName}
                  </button>
                </div>
              ))}
              <button type="button" className="btn-inline-add" onClick={handleAddLastName}>
                + {copy.addLastName}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>{copy.genderLabel}</label>
            <div className="gender-buttons">
              <button
                type="button"
                className={`gender-btn male ${person.gender === 'male' ? 'active' : ''}`}
                onClick={() => handleGenderChange('male')}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="14" r="4" />
                  <path d="M14 10l6-6" />
                  <path d="M15 4h5v5" />
                </svg>
                {copy.maleLabel}
              </button>
              <button
                type="button"
                className={`gender-btn female ${person.gender === 'female' ? 'active' : ''}`}
                onClick={() => handleGenderChange('female')}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M12 12v8" />
                  <path d="M9 17h6" />
                </svg>
                {copy.femaleLabel}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>{copy.birthDate}</label>
            <div className="date-inputs">
              <input
                type="text"
                value={person.birthDate.day || ''}
                onChange={(e) => handleDateChange('birthDate', 'day', e.target.value)}
                placeholder={copy.day}
                maxLength={2}
              />
              <input
                type="text"
                value={person.birthDate.month || ''}
                onChange={(e) => handleDateChange('birthDate', 'month', e.target.value)}
                placeholder={copy.month}
                maxLength={2}
              />
              <input
                type="text"
                value={person.birthDate.year || ''}
                onChange={(e) => handleDateChange('birthDate', 'year', e.target.value)}
                placeholder={copy.year}
                maxLength={4}
              />
            </div>
          </div>

          <div className="form-group">
            <label>{copy.deathDate}</label>
            <div className="date-inputs">
              <input
                type="text"
                value={person.deathDate.day || ''}
                onChange={(e) => handleDateChange('deathDate', 'day', e.target.value)}
                placeholder={copy.day}
                maxLength={2}
              />
              <input
                type="text"
                value={person.deathDate.month || ''}
                onChange={(e) => handleDateChange('deathDate', 'month', e.target.value)}
                placeholder={copy.month}
                maxLength={2}
              />
              <input
                type="text"
                value={person.deathDate.year || ''}
                onChange={(e) => handleDateChange('deathDate', 'year', e.target.value)}
                placeholder={copy.year}
                maxLength={4}
              />
            </div>
          </div>

          <div className="form-group">
            <label>{copy.causeOfDeath}</label>
            <input
              type="text"
              value={person.causeOfDeath || ''}
              onChange={(e) => handleInputChange('causeOfDeath', e.target.value)}
              placeholder={copy.causeOfDeath}
            />
          </div>

          <div className="form-group">
            <label>{copy.knownDiseases}</label>
            <textarea
              value={person.knownDiseases || ''}
              onChange={(e) => handleInputChange('knownDiseases', e.target.value)}
              placeholder={copy.knownDiseases}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>{copy.notes}</label>
            <textarea
              value={person.notes || ''}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder={copy.notes}
              rows={4}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>
            {copy.done}
          </button>
        </div>
      </div>
    </div>
  );
};
