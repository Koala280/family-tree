import { useEffect, useState, type ReactNode } from 'react';
import { Person, Union } from '../types';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { translations } from '../i18n';
import { formatDateInfo, getLastNameList } from '../utils/person';

interface LinkMenuProps {
  personId: string;
  type: 'link' | 'unlink' | 'add-child';
  onClose: () => void;
}

type LinkAction = 'parent' | 'spouse' | 'child';

export const LinkMenu = ({ personId, type, onClose }: LinkMenuProps) => {
  const { familyTree, addPerson, addParent, addSpouse, addChild, linkChildToUnion, removeRelationship, language } = useFamilyTree();
  const [linkAction, setLinkAction] = useState<LinkAction | null>(null);
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const copy = translations[language];

  if (!familyTree) return null;

  const person = familyTree.persons[personId];
  if (!person) return null;

  const getTargetName = (target: { firstName?: string; lastName?: string; lastNames?: string[] }) => {
    const firstName = typeof target.firstName === 'string' ? target.firstName.trim() : '';
    const firstLastName = getLastNameList(target as Person)[0]?.trim() ?? '';
    const compactName = [firstName, firstLastName].filter(Boolean).join(' ').trim();
    return compactName || copy.unknownPerson;
  };

  const normalizeText = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  const compareStrings = (left: string, right: string) =>
    left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });

  const comparePersonsByName = (left: Person, right: Person) => {
    const nameDiff = compareStrings(getTargetName(left), getTargetName(right));
    if (nameDiff !== 0) return nameDiff;
    return compareStrings(left.id, right.id);
  };

  const getUnionTitle = (union: Union) => {
    const partnerNames = getUnionPartners(union)
      .map(target => getTargetName(target))
      .sort(compareStrings);
    return partnerNames.length > 0 ? partnerNames.join(' & ') : copy.withoutPartner;
  };

  const compareUnionsByTitle = (left: Union, right: Union) => {
    const titleDiff = compareStrings(getUnionTitle(left), getUnionTitle(right));
    if (titleDiff !== 0) return titleDiff;
    return compareStrings(left.id, right.id);
  };

  const normalizedLinkSearchQuery = normalizeText(linkSearchQuery);

  const personMatchesSearch = (target: Person) => {
    if (!normalizedLinkSearchQuery) return true;
    const haystack = normalizeText(`${getTargetName(target)} ${getPersonMeta(target)}`);
    return haystack.includes(normalizedLinkSearchQuery);
  };

  const unionMatchesSearch = (union: Union) => {
    if (!normalizedLinkSearchQuery) return true;
    const haystack = normalizeText(getUnionTitle(union));
    return haystack.includes(normalizedLinkSearchQuery);
  };

  useEffect(() => {
    setLinkSearchQuery('');
  }, [type, linkAction, pendingChildId, personId]);

  const getPersonUnions = () => {
    const unions = person.unionIds
      .map(id => familyTree.unions[id])
      .filter((union): union is Union => Boolean(union));
    const bySignature = new Map<string, Union>();

    unions.forEach(union => {
      const signature = union.partnerIds
        .filter(partnerId => partnerId !== personId)
        .slice()
        .sort()
        .join('|');
      const existing = bySignature.get(signature);
      if (!existing || union.childIds.length > existing.childIds.length) {
        bySignature.set(signature, union);
      }
    });

    return Array.from(bySignature.values());
  };

  const getUnionPartners = (union: Union) =>
    union.partnerIds
      .map(id => familyTree.persons[id])
      .filter((target): target is Person => Boolean(target));

  const getGenderClass = (target: Person) =>
    target.gender === 'male' ? 'male' : target.gender === 'female' ? 'female' : 'unknown';

  const getGenderLabel = (target: Person) =>
    target.gender === 'male'
      ? copy.filterMale
      : target.gender === 'female'
        ? copy.filterFemale
        : copy.filterUnknown;

  const getDateLabel = (target: Person) => {
    const birth = formatDateInfo(target.birthDate);
    const death = formatDateInfo(target.deathDate);
    if (birth && death) return `* ${birth}  + ${death}`;
    if (birth) return `* ${birth}`;
    if (death) return `+ ${death}`;
    return copy.filterUnknown;
  };

  const getPersonMeta = (target: Person) => `${getGenderLabel(target)} • ${getDateLabel(target)}`;

  const getAvailableParentUnions = () => {
    return Object.values(familyTree.unions)
      .filter(union => {
        if (union.partnerIds.length !== 2) return false;
        if (union.partnerIds.includes(personId)) return false;
        if (union.childIds.includes(personId)) return false;
        if (person.parentUnionId === union.id) return false;
        return true;
      })
      .sort(compareUnionsByTitle);
  };

  const handleAddChildWithUnion = (unionId: string) => {
    const childId = addPerson({});
    addChild(personId, childId, unionId);
    onClose();
  };

  const handleLinkChild = (targetPersonId: string) => {
    const child = familyTree.persons[targetPersonId];
    if (!child) return;

    if (child.parentUnionId) {
      addChild(personId, targetPersonId);
      onClose();
      return;
    }

    const unions = getPersonUnions();
    if (unions.length > 1) {
      setPendingChildId(targetPersonId);
      return;
    }

    addChild(personId, targetPersonId, unions[0]?.id);
    onClose();
  };

  const handleLinkToPerson = (targetPersonId: string) => {
    if (linkAction === 'parent') {
      addParent(personId, targetPersonId);
      onClose();
      return;
    }
    if (linkAction === 'spouse') {
      addSpouse(personId, targetPersonId);
      onClose();
      return;
    }
    if (linkAction === 'child') {
      handleLinkChild(targetPersonId);
    }
  };

  const handleUnlinkPerson = (targetPersonId: string, relType: 'spouse' | 'child') => {
    if (relType === 'spouse') {
      removeRelationship(personId, targetPersonId, 'spouse');
    } else {
      removeRelationship(personId, targetPersonId, 'child');
    }
    onClose();
  };

  const parentUnion = person.parentUnionId ? familyTree.unions[person.parentUnionId] : null;
  const handleUnlinkParentPair = () => {
    if (!parentUnion) return;
    const anchorParentId = parentUnion.partnerIds.find(parentId => Boolean(familyTree.persons[parentId]));
    if (!anchorParentId) return;
    // Removes this child from the full parent union (both parents as one partnership).
    removeRelationship(anchorParentId, personId, 'child');
    onClose();
  };

  const spouseRelations = (() => {
    const seen = new Set<string>();
    const relations: Person[] = [];
    person.unionIds.forEach(unionId => {
      const union = familyTree.unions[unionId];
      if (!union) return;
      union.partnerIds.forEach(targetId => {
        if (targetId === personId || seen.has(targetId)) return;
        const target = familyTree.persons[targetId];
        if (!target) return;
        seen.add(targetId);
        relations.push(target);
      });
    });
    return relations.sort(comparePersonsByName);
  })();

  const childRelations = (() => {
    const seen = new Set<string>();
    const relations: Person[] = [];
    person.unionIds.forEach(unionId => {
      const union = familyTree.unions[unionId];
      if (!union) return;
      union.childIds.forEach(targetId => {
        if (seen.has(targetId)) return;
        const target = familyTree.persons[targetId];
        if (!target) return;
        seen.add(targetId);
        relations.push(target);
      });
    });
    return relations.sort(comparePersonsByName);
  })();

  const getAvailablePersonsForLinking = () => {
    const allPersons = Object.values(familyTree.persons);
    const assignedParentUnion = person.parentUnionId ? familyTree.unions[person.parentUnionId] : null;
    const canAddParent = !assignedParentUnion || assignedParentUnion.partnerIds.length < 2;

    return allPersons
      .filter(target => {
        if (target.id === personId) return false;

        if (linkAction === 'parent') {
          if (!canAddParent) return false;
          return !assignedParentUnion || !assignedParentUnion.partnerIds.includes(target.id);
        }
        if (linkAction === 'spouse') {
          const hasUnion = person.unionIds.some(unionId => {
            const union = familyTree.unions[unionId];
            return union && union.partnerIds.includes(target.id);
          });
          return !hasUnion;
        }
        if (linkAction === 'child') {
          const childUnion = target.parentUnionId ? familyTree.unions[target.parentUnionId] : null;
          const alreadyLinked = childUnion ? childUnion.partnerIds.includes(personId) : false;
          if (alreadyLinked) return false;
          const parentUnionMatch = assignedParentUnion ? assignedParentUnion.partnerIds.includes(target.id) : false;
          const spouseUnionMatch = person.unionIds.some(unionId => {
            const union = familyTree.unions[unionId];
            return union && union.partnerIds.includes(target.id);
          });
          if (parentUnionMatch || spouseUnionMatch) return false;
          return !childUnion || childUnion.partnerIds.length < 2;
        }
        return false;
      })
      .sort(comparePersonsByName);
  };

  const renderGenderIcon = (target: Person) => {
    if (target.gender === 'male') {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10" cy="14" r="4" />
          <path d="M14 10l6-6" />
          <path d="M15 4h5v5" />
        </svg>
      );
    }
    if (target.gender === 'female') {
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

  const renderPersonCard = (
    target: Person,
    relationLabel: string,
    onClick: () => void,
    options?: { danger?: boolean }
  ) => {
    const danger = options?.danger === true;
    return (
      <button
        key={`${relationLabel}-${target.id}`}
        type="button"
        className={`link-menu-card ${danger ? 'danger' : ''}`}
        onClick={onClick}
      >
        <div className={`link-menu-avatar ${getGenderClass(target)}`} aria-hidden="true">
          {renderGenderIcon(target)}
        </div>
        <div className="link-menu-card-main">
          <span className="link-menu-card-title">{getTargetName(target)}</span>
          <span className="link-menu-card-subtitle">{getPersonMeta(target)}</span>
        </div>
        <span className={`link-menu-chip ${danger ? 'danger' : ''}`}>{relationLabel}</span>
      </button>
    );
  };

  const renderUnionCard = (
    union: Union,
    relationLabel: string,
    onClick: () => void,
    options?: { danger?: boolean; hideTitle?: boolean }
  ) => {
    const partners = getUnionPartners(union);
    const title = getUnionTitle(union);
    const danger = options?.danger === true;
    const hideTitle = options?.hideTitle === true;
    const childCountLabel = `${copy.relationChild}: ${union.childIds.length}`;
    return (
      <button
        key={`union-card-${union.id}-${relationLabel}`}
        type="button"
        className={`link-menu-card union ${danger ? 'danger' : ''}`}
        onClick={onClick}
      >
        <div className="link-menu-avatar union" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.5 13.5l3-3" />
            <path d="M7 16a3 3 0 010-4.2l2-2a3 3 0 014.2 0" />
            <path d="M17 8a3 3 0 010 4.2l-2 2a3 3 0 01-4.2 0" />
          </svg>
        </div>
        <div className="link-menu-card-main">
          {!hideTitle && <span className="link-menu-card-title">{title}</span>}
          <div className={`link-menu-partner-tags ${hideTitle ? 'standalone' : ''}`}>
            {partners.map(target => (
              <span key={`union-${union.id}-partner-${target.id}`} className={`link-menu-tag ${getGenderClass(target)}`}>
                {getTargetName(target)}
              </span>
            ))}
          </div>
        </div>
        <div className="link-menu-card-side">
          <span className="link-menu-chip subtle" title={childCountLabel}>{childCountLabel}</span>
          <span className={`link-menu-chip ${danger ? 'danger' : ''}`}>{relationLabel}</span>
        </div>
      </button>
    );
  };

  const renderPanel = (title: string, content: ReactNode, options?: { onBack?: () => void; subtitle?: string }) => (
    <div className="modal-overlay" onClick={onClose}>
      <div className="link-menu" onClick={(event) => event.stopPropagation()}>
        <div className="link-menu-header">
          {options?.onBack && (
            <button type="button" className="link-menu-back" onClick={options.onBack}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
                <path d="M9 12h10" />
              </svg>
              {copy.linkBack}
            </button>
          )}
          <div className="link-menu-header-text">
            <span className="link-menu-title">{title}</span>
            <span className="link-menu-subtitle">{options?.subtitle ?? getTargetName(person)}</span>
          </div>
        </div>
        <div className="link-menu-scroll">{content}</div>
      </div>
    </div>
  );

  const renderSearch = () => (
    <label className="link-menu-search-shell" aria-label={copy.tableSearchPlaceholder}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input
        type="text"
        className="link-menu-search-input"
        placeholder={copy.tableSearchPlaceholder}
        value={linkSearchQuery}
        onChange={(event) => setLinkSearchQuery(event.target.value)}
      />
      {linkSearchQuery && (
        <button
          type="button"
          className="link-menu-search-clear"
          onClick={() => setLinkSearchQuery('')}
          title={copy.clearSearch}
          aria-label={copy.clearSearch}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </label>
  );

  if (type === 'link' && linkAction === 'child' && pendingChildId) {
    const targetChild = familyTree.persons[pendingChildId];
    const unions = getPersonUnions();
    const visibleUnions = unions.filter(unionMatchesSearch);
    return renderPanel(
      copy.linkChildWith,
      unions.length === 0 ? (
        <div className="link-menu-empty">{copy.noPersonsAvailable}</div>
      ) : (
        <div className="link-menu-sections">
          {renderSearch()}
          {visibleUnions.length === 0 ? (
            <div className="link-menu-empty">{copy.treeSearchNoResults}</div>
          ) : (
            <div className="link-menu-list">
              {visibleUnions.map(union => renderUnionCard(
                union,
                copy.linkChild,
                () => {
                  addChild(personId, pendingChildId, union.id);
                  onClose();
                },
                { hideTitle: true }
              ))}
            </div>
          )}
        </div>
      ),
      {
        onBack: () => setPendingChildId(null),
        subtitle: targetChild ? getTargetName(targetChild) : getTargetName(person),
      }
    );
  }

  if (type === 'link' && linkAction === 'parent') {
    const availableUnions = getAvailableParentUnions();
    const visibleUnions = availableUnions.filter(unionMatchesSearch);
    return renderPanel(
      copy.linkParents,
      availableUnions.length === 0 ? (
        <div className="link-menu-empty">{copy.noPersonsAvailable}</div>
      ) : (
        <div className="link-menu-sections">
          {renderSearch()}
          {visibleUnions.length === 0 ? (
            <div className="link-menu-empty">{copy.treeSearchNoResults}</div>
          ) : (
            <div className="link-menu-list">
              {visibleUnions.map(union => renderUnionCard(
                union,
                copy.linkParents,
                () => {
                  linkChildToUnion(personId, union.id);
                  onClose();
                },
                { hideTitle: true }
              ))}
            </div>
          )}
        </div>
      ),
      { onBack: () => setLinkAction(null) }
    );
  }

  if (type === 'link' && linkAction) {
    const availablePersons = getAvailablePersonsForLinking();
    const visiblePersons = availablePersons.filter(personMatchesSearch);
    const relationLabel = linkAction === 'spouse' ? copy.relationSpouse : copy.relationChild;
    return renderPanel(
      linkAction === 'spouse' ? copy.linkSpouse : copy.linkChild,
      availablePersons.length === 0 ? (
        <div className="link-menu-empty">{copy.noPersonsAvailable}</div>
      ) : (
        <div className="link-menu-sections">
          {renderSearch()}
          {visiblePersons.length === 0 ? (
            <div className="link-menu-empty">{copy.treeSearchNoResults}</div>
          ) : (
            <div className="link-menu-list">
              {visiblePersons.map(target =>
                renderPersonCard(target, relationLabel, () => handleLinkToPerson(target.id))
              )}
            </div>
          )}
        </div>
      ),
      { onBack: () => setLinkAction(null) }
    );
  }

  if (type === 'add-child') {
    const unions = getPersonUnions();
    return renderPanel(
      copy.addChildWith,
      unions.length === 0 ? (
        <div className="link-menu-empty">{copy.noPersonsAvailable}</div>
      ) : (
        <div className="link-menu-list">
          {unions.map(union => renderUnionCard(
            union,
            copy.relationChild,
            () => handleAddChildWithUnion(union.id),
            { hideTitle: true }
          ))}
        </div>
      ),
      { onBack: onClose }
    );
  }

  if (type === 'unlink') {
    const hasAnyRelations = Boolean(parentUnion) || spouseRelations.length > 0 || childRelations.length > 0;
    return renderPanel(
      copy.removeLink,
      !hasAnyRelations ? (
        <div className="link-menu-empty">{copy.noLinksAvailable}</div>
      ) : (
        <div className="link-menu-sections">
          <section className="link-menu-section">
            <div className="link-menu-section-title">{copy.linkParents}</div>
            {parentUnion ? (
              renderUnionCard(parentUnion, copy.linkParents, handleUnlinkParentPair, { danger: true, hideTitle: true })
            ) : (
              <div className="link-menu-empty inline">{copy.noLinksAvailable}</div>
            )}
          </section>

          <section className="link-menu-section">
            <div className="link-menu-section-title">{copy.relationSpouse}</div>
            {spouseRelations.length === 0 ? (
              <div className="link-menu-empty inline">{copy.noLinksAvailable}</div>
            ) : (
              <div className="link-menu-list">
                {spouseRelations.map(target =>
                  renderPersonCard(target, copy.relationSpouse, () => handleUnlinkPerson(target.id, 'spouse'), { danger: true })
                )}
              </div>
            )}
          </section>

          <section className="link-menu-section">
            <div className="link-menu-section-title">{copy.relationChild}</div>
            {childRelations.length === 0 ? (
              <div className="link-menu-empty inline">{copy.noLinksAvailable}</div>
            ) : (
              <div className="link-menu-list">
                {childRelations.map(target =>
                  renderPersonCard(target, copy.relationChild, () => handleUnlinkPerson(target.id, 'child'), { danger: true })
                )}
              </div>
            )}
          </section>
        </div>
      ),
      { onBack: onClose }
    );
  }

  return renderPanel(
    copy.linkWith,
    <div className="link-menu-options">
      <button type="button" className="link-menu-option" onClick={() => setLinkAction('parent')}>
        <span className="link-menu-option-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 5.9c1.16 0 2.1.94 2.1 2.1s-.94 2.1-2.1 2.1S9.9 9.16 9.9 8s.94-2.1 2.1-2.1m0 9c2.97 0 6.1 1.46 6.1 2.1v1.1H5.9V17c0-.64 3.13-2.1 6.1-2.1M12 4C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 9c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z" />
          </svg>
        </span>
        <span className="link-menu-option-text">
          <span className="link-menu-option-title">{copy.linkParents}</span>
          <span className="link-menu-option-subtitle">{copy.relationParent}</span>
        </span>
      </button>

      <button type="button" className="link-menu-option" onClick={() => setLinkAction('spouse')}>
        <span className="link-menu-option-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
          </svg>
        </span>
        <span className="link-menu-option-text">
          <span className="link-menu-option-title">{copy.linkSpouse}</span>
          <span className="link-menu-option-subtitle">{copy.relationSpouse}</span>
        </span>
      </button>

      <button type="button" className="link-menu-option" onClick={() => setLinkAction('child')}>
        <span className="link-menu-option-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </span>
        <span className="link-menu-option-text">
          <span className="link-menu-option-title">{copy.linkChild}</span>
          <span className="link-menu-option-subtitle">{copy.relationChild}</span>
        </span>
      </button>
    </div>,
    { subtitle: getTargetName(person) }
  );
};
