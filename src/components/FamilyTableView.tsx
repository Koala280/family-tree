import { useMemo, useState } from 'react';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { translations } from '../i18n';
import { getLastNameList, formatDateInfo, hasDateInfo } from '../utils/person';
import { Person } from '../types';

type GenderFilter = 'all' | 'male' | 'female' | 'unknown';
type StatusFilter = 'all' | 'alive' | 'deceased' | 'unknown';
type SortKey = 'firstName' | 'lastNames' | 'gender' | 'birthDate' | 'deathDate' | 'causeOfDeath' | 'knownDiseases' | 'notes';

export const FamilyTableView = () => {
  const { familyTree, setCurrentView, allTrees, activeTreeId, updatePerson, language } = useFamilyTree();
  const copy = translations[language];
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

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

  const handleLastNameChange = (personId: string, index: number, value: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    const next = [...getLastNames(person)];
    next[index] = value;
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

  const handleDateChange = (personId: string, dateType: 'birthDate' | 'deathDate', field: 'day' | 'month' | 'year', value: string) => {
    const person = familyTree.persons[personId];
    if (!person) return;
    updatePerson(personId, {
      [dateType]: {
        ...person[dateType],
        [field]: value,
      },
    });
  };

  const getStatus = (person: Person) => {
    if (hasDateInfo(person.deathDate)) return 'deceased';
    if (hasDateInfo(person.birthDate)) return 'alive';
    return 'unknown';
  };

  const getSearchText = (person: Person) => {
    const parts = [
      person.firstName,
      ...getLastNameList(person),
      person.gender ?? '',
      formatDateInfo(person.birthDate),
      formatDateInfo(person.deathDate),
      person.causeOfDeath ?? '',
      person.knownDiseases ?? '',
      person.notes ?? '',
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
      case 'birthDate':
        return formatDateInfo(person.birthDate);
      case 'deathDate':
        return formatDateInfo(person.deathDate);
      case 'causeOfDeath':
        return (person.causeOfDeath ?? '').toLowerCase();
      case 'knownDiseases':
        return (person.knownDiseases ?? '').toLowerCase();
      case 'notes':
        return (person.notes ?? '').toLowerCase();
      default:
        return '';
    }
  };

  const people = useMemo(() => {
    const list = Object.values(familyTree.persons);
    const term = searchTerm.trim().toLowerCase();

    let filtered = list.filter(person => {
      if (term && !getSearchText(person).includes(term)) {
        return false;
      }
      if (genderFilter !== 'all') {
        if (genderFilter === 'unknown' && person.gender !== null) return false;
        if (genderFilter !== 'unknown' && person.gender !== genderFilter) return false;
      }
      if (statusFilter !== 'all') {
        const status = getStatus(person);
        if (statusFilter !== status) return false;
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
  }, [familyTree.persons, genderFilter, searchTerm, sortConfig, statusFilter]);

  const setSort = (key: SortKey) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortIndicator = (key: SortKey) => {
    if (!sortConfig || sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' ^' : ' v';
  };

  const treeName = activeTreeId ? allTrees[activeTreeId]?.name : copy.defaultTreeTitle;

  return (
    <div className="family-table-view">
      <div className="family-table-header">
        <div className="family-table-actions">
          <button type="button" className="btn-secondary" onClick={() => setCurrentView('manager')}>
            {copy.backToOverview}
          </button>
          <button type="button" className="btn-primary" onClick={() => setCurrentView('tree')}>
            {copy.backToTree}
          </button>
        </div>
        <h1>{copy.tableTitle}</h1>
        <p className="family-table-tree-name">{treeName}</p>
        <p>{copy.tableSubtitle}</p>
      </div>

      <div className="family-table-controls">
        <input
          type="text"
          className="table-search"
          placeholder={copy.tableSearchPlaceholder}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        <div className="table-filters">
          <label>
            <span>{copy.filterGenderLabel}</span>
            <select value={genderFilter} onChange={(event) => setGenderFilter(event.target.value as GenderFilter)}>
              <option value="all">{copy.filterAll}</option>
              <option value="male">{copy.filterMale}</option>
              <option value="female">{copy.filterFemale}</option>
              <option value="unknown">{copy.filterUnknown}</option>
            </select>
          </label>
          <label>
            <span>{copy.filterStatusLabel}</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">{copy.filterAll}</option>
              <option value="alive">{copy.filterStatusAlive}</option>
              <option value="deceased">{copy.filterStatusDeceased}</option>
              <option value="unknown">{copy.filterStatusUnknown}</option>
            </select>
          </label>
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
                    {copy.columnFirstName}{sortIndicator('firstName')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('lastNames')}>
                    {copy.columnLastNames}{sortIndicator('lastNames')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('gender')}>
                    {copy.columnGender}{sortIndicator('gender')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('birthDate')}>
                    {copy.columnBirthDate}{sortIndicator('birthDate')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('deathDate')}>
                    {copy.columnDeathDate}{sortIndicator('deathDate')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('causeOfDeath')}>
                    {copy.columnCauseOfDeath}{sortIndicator('causeOfDeath')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('knownDiseases')}>
                    {copy.columnKnownDiseases}{sortIndicator('knownDiseases')}
                  </button>
                </th>
                <th>
                  <button type="button" className="table-sort-button" onClick={() => setSort('notes')}>
                    {copy.columnNotes}{sortIndicator('notes')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map(person => (
                <tr key={person.id}>
                  <td>
                    <input
                      type="text"
                      value={person.firstName || ''}
                      onChange={(event) => updatePerson(person.id, { firstName: event.target.value })}
                    />
                  </td>
                  <td>
                    <div className="table-lastnames">
                      {getLastNames(person).map((value, index) => (
                        <div key={`${person.id}-last-${index}`} className="table-lastname-row">
                          <input
                            type="text"
                            value={value}
                            onChange={(event) => handleLastNameChange(person.id, index, event.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-inline-remove"
                            onClick={() => handleRemoveLastName(person.id, index)}
                            aria-label={copy.removeLastName}
                            title={copy.removeLastName}
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <button type="button" className="btn-inline-add" onClick={() => handleAddLastName(person.id)}>
                        + {copy.addLastName}
                      </button>
                    </div>
                  </td>
                  <td>
                    <select
                      value={person.gender ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        updatePerson(person.id, { gender: value === '' ? null : (value as Person['gender']) });
                      }}
                    >
                      <option value="">{copy.filterUnknown}</option>
                      <option value="male">{copy.filterMale}</option>
                      <option value="female">{copy.filterFemale}</option>
                    </select>
                  </td>
                  <td>
                    <div className="table-date-inputs">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={person.birthDate.day || ''}
                        onChange={(event) => handleDateChange(person.id, 'birthDate', 'day', event.target.value)}
                        placeholder={copy.day}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={person.birthDate.month || ''}
                        onChange={(event) => handleDateChange(person.id, 'birthDate', 'month', event.target.value)}
                        placeholder={copy.month}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={person.birthDate.year || ''}
                        onChange={(event) => handleDateChange(person.id, 'birthDate', 'year', event.target.value)}
                        placeholder={copy.year}
                      />
                    </div>
                  </td>
                  <td>
                    <div className="table-date-inputs">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={person.deathDate.day || ''}
                        onChange={(event) => handleDateChange(person.id, 'deathDate', 'day', event.target.value)}
                        placeholder={copy.day}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={person.deathDate.month || ''}
                        onChange={(event) => handleDateChange(person.id, 'deathDate', 'month', event.target.value)}
                        placeholder={copy.month}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={person.deathDate.year || ''}
                        onChange={(event) => handleDateChange(person.id, 'deathDate', 'year', event.target.value)}
                        placeholder={copy.year}
                      />
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      value={person.causeOfDeath || ''}
                      onChange={(event) => updatePerson(person.id, { causeOfDeath: event.target.value })}
                    />
                  </td>
                  <td>
                    <textarea
                      rows={2}
                      value={person.knownDiseases || ''}
                      onChange={(event) => updatePerson(person.id, { knownDiseases: event.target.value })}
                    />
                  </td>
                  <td>
                    <textarea
                      rows={2}
                      value={person.notes || ''}
                      onChange={(event) => updatePerson(person.id, { notes: event.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
