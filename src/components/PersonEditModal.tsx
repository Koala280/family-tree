import { useRef, useMemo, useState } from 'react';
import { Person } from '../types';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { translations } from '../i18n';
import {
  BLOOD_GROUP_OPTIONS,
  getBloodGroup,
  getLastNameList,
  getKnownDiseaseEntries,
  getKnownDiseaseList,
  getInheritedHereditaryDiseaseRisks,
  getParentBloodGroupInfo,
} from '../utils/person';
import { DateField, normalizeDateInputOnBlur, sanitizeDateInput } from '../utils/dateInput';
import { normalizeInlineTextOnCommit } from '../utils/textInput';
import { RichTextEditor } from './RichTextEditor';

interface PersonEditModalProps {
  person: Person;
  onClose: () => void;
}

export const PersonEditModal = ({ person, onClose }: PersonEditModalProps) => {
  const { updatePerson, familyTree, language } = useFamilyTree();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copy = translations[language];
  const [activeLastNameIndex, setActiveLastNameIndex] = useState<number | null>(null);
  const [activeKnownDiseaseIndex, setActiveKnownDiseaseIndex] = useState<number | null>(null);
  const [isCauseOfDeathFocused, setIsCauseOfDeathFocused] = useState(false);
  const lastNameInputs = (() => {
    const lastNames = getLastNameList(person);
    return lastNames.length > 0 ? lastNames : [''];
  })();
  const knownDiseaseInputs = (() => {
    const knownDiseases = getKnownDiseaseEntries(person);
    return knownDiseases.length > 0 ? knownDiseases : [{ name: '', hereditary: false }];
  })();
  const normalizeLastName = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const normalizeKnownDisease = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const normalizeCauseOfDeath = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const currentNormalized = new Set(
    lastNameInputs
      .map(value => value.trim())
      .filter(Boolean)
      .map(normalizeLastName)
  );
  const currentKnownDiseaseNormalized = new Set(
    knownDiseaseInputs
      .map(entry => entry.name.trim())
      .filter(Boolean)
      .map(normalizeKnownDisease)
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
  const allKnownDiseases = useMemo(() => {
    if (!familyTree) return [];
    const unique = new Set<string>();
    Object.values(familyTree.persons).forEach(entry => {
      getKnownDiseaseList(entry).forEach(disease => {
        const trimmed = disease.trim();
        if (trimmed) {
          unique.add(trimmed);
        }
      });
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [familyTree]);
  const allCausesOfDeath = useMemo(() => {
    if (!familyTree) return [];
    const unique = new Set<string>();
    Object.values(familyTree.persons).forEach(entry => {
      const trimmed = (entry.causeOfDeath ?? '').trim();
      if (trimmed) {
        unique.add(trimmed);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [familyTree]);
  const inheritedDiseaseRisks = useMemo(() => {
    if (!familyTree) return [];
    return getInheritedHereditaryDiseaseRisks(familyTree, person.id);
  }, [familyTree, person.id]);
  const parentBloodGroupInfo = useMemo(() => {
    if (!familyTree) {
      return {
        parentGroups: [] as string[],
        suggestions: [] as string[],
      };
    }
    return getParentBloodGroupInfo(familyTree, person.id);
  }, [familyTree, person.id]);
  const currentBloodGroup = getBloodGroup(person);
  const suggestedBloodGroups = parentBloodGroupInfo.suggestions.filter(group => group !== currentBloodGroup);
  const hasSuggestedBloodGroups = suggestedBloodGroups.length > 0;

  const handleInputChange = (field: keyof Person, value: unknown) => {
    updatePerson(person.id, { [field]: value });
  };

  const handleDateChange = (dateType: 'birthDate' | 'deathDate', field: DateField, value: string) => {
    const currentDate = person[dateType];
    const nextDate = sanitizeDateInput(currentDate, field, value);
    if (!nextDate) return;
    handleInputChange(dateType, nextDate);
  };

  const getDateValidationMessage = (field: DateField) => {
    if (field === 'day') return `${copy.day}: 01-31`;
    if (field === 'month') return `${copy.month}: 01-12`;
    return `${copy.year}: ${new Date().getFullYear()}`;
  };

  const handleDateBlur = (
    dateType: 'birthDate' | 'deathDate',
    field: DateField,
    input: HTMLInputElement
  ) => {
    const currentDate = {
      ...person[dateType],
      [field]: input.value,
    };
    const { nextDate, invalidField } = normalizeDateInputOnBlur(currentDate, field);
    if (invalidField) {
      input.setCustomValidity(getDateValidationMessage(invalidField));
      input.reportValidity();
    } else {
      input.setCustomValidity('');
    }
    handleInputChange(dateType, nextDate);
  };

  const handleGenderChange = (gender: 'male' | 'female') => {
    handleInputChange('gender', person.gender === gender ? null : gender);
  };

  const handleFirstNameBlur = (value: string) => {
    handleInputChange('firstName', normalizeInlineTextOnCommit(value));
  };

  const handleLastNameChange = (index: number, value: string) => {
    const next = [...lastNameInputs];
    next[index] = value;
    updatePerson(person.id, { lastNames: next });
  };

  const handleLastNameBlur = (index: number, value: string) => {
    const next = [...lastNameInputs];
    next[index] = normalizeInlineTextOnCommit(value);
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
      if (lastNameInputs[targetIndex]?.trim()) {
        const next = [...lastNameInputs];
        next[targetIndex] = trimmed;
        updatePerson(person.id, { lastNames: next });
        return;
      }
    }

    const firstEmptyIndex = lastNameInputs.findIndex(value => !value.trim());
    if (firstEmptyIndex >= 0) {
      const next = [...lastNameInputs];
      next[firstEmptyIndex] = trimmed;
      updatePerson(person.id, { lastNames: next });
      return;
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

  const handleKnownDiseaseChange = (index: number, value: string) => {
    const next = [...knownDiseaseInputs];
    next[index] = { ...next[index], name: value };
    updatePerson(person.id, { knownDiseases: next });
  };

  const handleKnownDiseaseBlur = (index: number, value: string) => {
    const next = [...knownDiseaseInputs];
    next[index] = { ...next[index], name: normalizeInlineTextOnCommit(value) };
    updatePerson(person.id, { knownDiseases: next });
  };

  const handleKnownDiseaseHereditaryChange = (index: number, hereditary: boolean) => {
    const next = [...knownDiseaseInputs];
    next[index] = { ...next[index], hereditary };
    updatePerson(person.id, { knownDiseases: next });
  };

  const handleAddKnownDisease = () => {
    updatePerson(person.id, { knownDiseases: [...knownDiseaseInputs, { name: '', hereditary: false }] });
  };

  const handleRemoveKnownDisease = (index: number) => {
    if (knownDiseaseInputs.length <= 1) {
      updatePerson(person.id, { knownDiseases: [{ name: '', hereditary: false }] });
      return;
    }
    const next = knownDiseaseInputs.filter((_, idx) => idx !== index);
    updatePerson(person.id, { knownDiseases: next });
  };

  const applySuggestedKnownDisease = (name: string, targetIndex?: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (currentKnownDiseaseNormalized.has(normalizeKnownDisease(trimmed))) return;

    if (typeof targetIndex === 'number') {
      if (knownDiseaseInputs[targetIndex]?.name.trim()) {
        const next = [...knownDiseaseInputs];
        next[targetIndex] = { ...next[targetIndex], name: trimmed };
        updatePerson(person.id, { knownDiseases: next });
        return;
      }
    }

    const firstEmptyIndex = knownDiseaseInputs.findIndex(entry => !entry.name.trim());
    if (firstEmptyIndex >= 0) {
      const next = [...knownDiseaseInputs];
      next[firstEmptyIndex] = { ...next[firstEmptyIndex], name: trimmed };
      updatePerson(person.id, { knownDiseases: next });
      return;
    }

    updatePerson(person.id, { knownDiseases: [...knownDiseaseInputs, { name: trimmed, hereditary: false }] });
  };

  const applyInheritedRiskSuggestion = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const normalized = normalizeKnownDisease(trimmed);
    const existingIndex = knownDiseaseInputs.findIndex(
      (entry) => normalizeKnownDisease(entry.name) === normalized
    );

    if (existingIndex >= 0) {
      if (knownDiseaseInputs[existingIndex].hereditary === true) return;
      const next = [...knownDiseaseInputs];
      next[existingIndex] = { ...next[existingIndex], hereditary: true };
      updatePerson(person.id, { knownDiseases: next });
      return;
    }

    const firstEmptyIndex = knownDiseaseInputs.findIndex(entry => !entry.name.trim());
    if (firstEmptyIndex >= 0) {
      const next = [...knownDiseaseInputs];
      next[firstEmptyIndex] = { ...next[firstEmptyIndex], name: trimmed, hereditary: true };
      updatePerson(person.id, { knownDiseases: next });
      return;
    }

    updatePerson(person.id, { knownDiseases: [...knownDiseaseInputs, { name: trimmed, hereditary: true }] });
  };

  const getMatchingKnownDiseases = (value: string) => {
    const normalized = normalizeKnownDisease(value);
    if (!normalized) return [];
    return allKnownDiseases
      .filter(name => normalizeKnownDisease(name).includes(normalized))
      .filter(name => !currentKnownDiseaseNormalized.has(normalizeKnownDisease(name)))
      .slice(0, 8);
  };

  const applySuggestedCauseOfDeath = (cause: string) => {
    const trimmed = cause.trim();
    if (!trimmed) return;
    handleInputChange('causeOfDeath', trimmed);
    setIsCauseOfDeathFocused(false);
  };

  const handleCauseOfDeathBlur = (value: string) => {
    handleInputChange('causeOfDeath', normalizeInlineTextOnCommit(value));
  };

  const handleBloodGroupChange = (value: string) => {
    handleInputChange('bloodGroup', value);
  };

  const getMatchingCausesOfDeath = (value: string) => {
    const normalized = normalizeCauseOfDeath(value);
    if (!normalized) return [];
    return allCausesOfDeath
      .filter(cause => normalizeCauseOfDeath(cause).includes(normalized))
      .filter(cause => normalizeCauseOfDeath(cause) !== normalized)
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
      <div className="modal-content person-edit-modal" onClick={(e) => e.stopPropagation()}>
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
              onBlur={(event) => handleFirstNameBlur(event.currentTarget.value)}
              placeholder={copy.firstName}
            />
          </div>

          <div className="form-group person-last-name-group">
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
                <div key={`last-name-${person.id}-${index}`} className="last-name-row person-last-name-row">
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
                            onBlur={(event) => {
                              handleLastNameBlur(index, event.currentTarget.value);
                              window.setTimeout(() => setActiveLastNameIndex(null), 120);
                            }}
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
                    className="btn-inline-remove btn-inline-remove-icon"
                    onClick={() => handleRemoveLastName(index)}
                    aria-label={copy.removeLastName}
                    title={copy.removeLastName}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
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
                inputMode="numeric"
                value={person.birthDate.day || ''}
                onChange={(event) => {
                  event.currentTarget.setCustomValidity('');
                  handleDateChange('birthDate', 'day', event.target.value);
                }}
                onBlur={(event) => handleDateBlur('birthDate', 'day', event.currentTarget)}
                placeholder={copy.day}
                maxLength={2}
              />
              <input
                type="text"
                inputMode="numeric"
                value={person.birthDate.month || ''}
                onChange={(event) => {
                  event.currentTarget.setCustomValidity('');
                  handleDateChange('birthDate', 'month', event.target.value);
                }}
                onBlur={(event) => handleDateBlur('birthDate', 'month', event.currentTarget)}
                placeholder={copy.month}
                maxLength={2}
              />
              <input
                type="text"
                inputMode="numeric"
                value={person.birthDate.year || ''}
                onChange={(event) => {
                  event.currentTarget.setCustomValidity('');
                  handleDateChange('birthDate', 'year', event.target.value);
                }}
                onBlur={(event) => handleDateBlur('birthDate', 'year', event.currentTarget)}
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
                inputMode="numeric"
                value={person.deathDate.day || ''}
                onChange={(event) => {
                  event.currentTarget.setCustomValidity('');
                  handleDateChange('deathDate', 'day', event.target.value);
                }}
                onBlur={(event) => handleDateBlur('deathDate', 'day', event.currentTarget)}
                placeholder={copy.day}
                maxLength={2}
              />
              <input
                type="text"
                inputMode="numeric"
                value={person.deathDate.month || ''}
                onChange={(event) => {
                  event.currentTarget.setCustomValidity('');
                  handleDateChange('deathDate', 'month', event.target.value);
                }}
                onBlur={(event) => handleDateBlur('deathDate', 'month', event.currentTarget)}
                placeholder={copy.month}
                maxLength={2}
              />
              <input
                type="text"
                inputMode="numeric"
                value={person.deathDate.year || ''}
                onChange={(event) => {
                  event.currentTarget.setCustomValidity('');
                  handleDateChange('deathDate', 'year', event.target.value);
                }}
                onBlur={(event) => handleDateBlur('deathDate', 'year', event.currentTarget)}
                placeholder={copy.year}
                maxLength={4}
              />
            </div>
          </div>

          <div className="form-group person-known-disease-group">
            <label>{copy.knownDiseases}</label>
            <div className="last-name-list">
              <div className="last-name-suggestions">
                <span className="last-name-suggestions-label">{copy.potentialHereditaryRisks}</span>
                {inheritedDiseaseRisks.length > 0 ? (
                  <div className="last-name-suggestions-list">
                    {inheritedDiseaseRisks.map(disease => (
                      <button
                        key={`risk-suggestion-${person.id}-${disease}`}
                        type="button"
                        className="last-name-suggestion"
                        onClick={() => applyInheritedRiskSuggestion(disease)}
                      >
                        {disease}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="hereditary-risk-empty">{copy.potentialHereditaryRisksEmpty}</div>
                )}
              </div>
              {knownDiseaseInputs.map((entry, index) => (
                <div key={`known-disease-${person.id}-${index}`} className="last-name-row known-disease-row">
                  <div className="last-name-input-wrapper">
                    {(() => {
                      const matching = activeKnownDiseaseIndex === index && entry.name.trim()
                        ? getMatchingKnownDiseases(entry.name)
                        : [];
                      return (
                        <>
                          <input
                            type="text"
                            value={entry.name}
                            onChange={(e) => handleKnownDiseaseChange(index, e.target.value)}
                            onFocus={() => setActiveKnownDiseaseIndex(index)}
                            onBlur={(event) => {
                              handleKnownDiseaseBlur(index, event.currentTarget.value);
                              window.setTimeout(() => setActiveKnownDiseaseIndex(null), 120);
                            }}
                            placeholder={copy.knownDiseases}
                          />
                          {matching.length > 0 && (
                            <div className="last-name-dropdown">
                              {matching.map(name => (
                                <button
                                  key={`known-disease-option-${person.id}-${index}-${name}`}
                                  type="button"
                                  className="last-name-dropdown-item"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => applySuggestedKnownDisease(name, index)}
                                >
                                  {name}
                                </button>
                              ))}
                            </div>
                          )}
                          {activeKnownDiseaseIndex === index && entry.name.trim() && matching.length === 0 && (
                            <div className="last-name-dropdown">
                              <div className="last-name-dropdown-empty">{copy.knownDiseaseSuggestionsEmpty}</div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="known-disease-controls">
                    <label className="known-disease-hereditary">
                      <input
                        type="checkbox"
                        checked={entry.hereditary === true}
                        onChange={(event) => handleKnownDiseaseHereditaryChange(index, event.target.checked)}
                      />
                      <span>{copy.hereditaryLabel}</span>
                    </label>
                    <button
                      type="button"
                      className="btn-inline-remove btn-inline-remove-icon"
                      onClick={() => handleRemoveKnownDisease(index)}
                      aria-label={copy.removeKnownDisease}
                      title={copy.removeKnownDisease}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="btn-inline-add" onClick={handleAddKnownDisease}>
                + {copy.addKnownDisease}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>{copy.bloodGroupLabel}</label>
            {hasSuggestedBloodGroups && (
              <div className="last-name-suggestions blood-group-suggestions">
                <span className="last-name-suggestions-label">
                  {copy.bloodGroupSuggestionsLabel}
                  {parentBloodGroupInfo.parentGroups.length >= 2
                    ? `: ${parentBloodGroupInfo.parentGroups[0]} x ${parentBloodGroupInfo.parentGroups[1]}`
                    : ''}
                </span>
                <div className="last-name-suggestions-list">
                  {suggestedBloodGroups.map(group => (
                    <button
                      key={`blood-group-suggestion-${person.id}-${group}`}
                      type="button"
                      className="last-name-suggestion"
                      onClick={() => handleBloodGroupChange(group)}
                    >
                      {group}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <select
              className="blood-group-select"
              value={currentBloodGroup}
              onChange={(event) => handleBloodGroupChange(event.target.value)}
            >
              <option value="">{copy.bloodGroupPlaceholder}</option>
              {BLOOD_GROUP_OPTIONS.map(group => (
                <option key={`blood-group-option-${group}`} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>{copy.causeOfDeath}</label>
            <div className="last-name-input-wrapper">
              {(() => {
                const causeValue = person.causeOfDeath || '';
                const matching = isCauseOfDeathFocused && causeValue.trim()
                  ? getMatchingCausesOfDeath(causeValue)
                  : [];
                return (
                  <>
                    <input
                      type="text"
                      value={causeValue}
                      onChange={(e) => handleInputChange('causeOfDeath', e.target.value)}
                      onFocus={() => setIsCauseOfDeathFocused(true)}
                      onBlur={(event) => {
                        handleCauseOfDeathBlur(event.currentTarget.value);
                        window.setTimeout(() => setIsCauseOfDeathFocused(false), 120);
                      }}
                      placeholder={copy.causeOfDeath}
                    />
                    {matching.length > 0 && (
                      <div className="last-name-dropdown">
                        {matching.map(cause => (
                          <button
                            key={`cause-of-death-option-${person.id}-${cause}`}
                            type="button"
                            className="last-name-dropdown-item"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => applySuggestedCauseOfDeath(cause)}
                          >
                            {cause}
                          </button>
                        ))}
                      </div>
                    )}
                    {isCauseOfDeathFocused && causeValue.trim() && matching.length === 0 && (
                      <div className="last-name-dropdown">
                        <div className="last-name-dropdown-empty">{copy.causeOfDeathSuggestionsEmpty}</div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          <div className="form-group">
            <label>{copy.notes}</label>
            <RichTextEditor
              value={person.notes || ''}
              onChange={(nextValue) => handleInputChange('notes', nextValue)}
              placeholder={copy.notes}
              ariaLabel={copy.notes}
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
