import { useState } from 'react';
import { Union } from '../types';
import { useFamilyTree } from '../context/FamilyTreeContext';
import { translations } from '../i18n';
import { getDisplayName } from '../utils/person';

interface LinkMenuProps {
  personId: string;
  type: 'link' | 'unlink' | 'add-child';
  onClose: () => void;
}

export const LinkMenu = ({ personId, type, onClose }: LinkMenuProps) => {
  const { familyTree, addPerson, addParent, addSpouse, addChild, linkChildToUnion, removeRelationship, language } = useFamilyTree();
  const [linkAction, setLinkAction] = useState<'parent' | 'spouse' | 'child' | null>(null);
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  const copy = translations[language];

  if (!familyTree) return null;

  const person = familyTree.persons[personId];
  if (!person) return null;

  const getTargetName = (target: { firstName?: string; lastName?: string; lastNames?: string[] }) => {
    return getDisplayName(target as any);
  };

  const getPersonUnions = () => {
    return person.unionIds
      .map(id => familyTree.unions[id])
      .filter((union): union is Union => Boolean(union));
  };

  const getUnionLabel = (union: Union) => {
    const partnerNames = union.partnerIds
      .filter(id => id !== personId)
      .map(id => familyTree.persons[id])
      .filter(Boolean)
      .map(target => getTargetName(target))
      .filter(name => name.length > 0);

    if (partnerNames.length === 0) return copy.withoutPartner;
    if (partnerNames.length === 1) return partnerNames[0];
    return partnerNames.join(' & ');
  };

  const getAvailableParentUnions = () => {
    return Object.values(familyTree.unions).filter(union => {
      if (union.partnerIds.length !== 2) return false;
      if (union.partnerIds.includes(personId)) return false;
      if (union.childIds.includes(personId)) return false;
      if (person.parentUnionId === union.id) return false;
      return true;
    });
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

    const unionId = unions[0]?.id;
    addChild(personId, targetPersonId, unionId);
    onClose();
  };

  const handleLinkToPerson = (targetPersonId: string) => {
    if (linkAction === 'parent') {
      addParent(personId, targetPersonId);
      onClose();
    } else if (linkAction === 'spouse') {
      addSpouse(personId, targetPersonId);
      onClose();
    } else if (linkAction === 'child') {
      handleLinkChild(targetPersonId);
    }
  };

  const handleUnlink = (targetPersonId: string, relType: 'parent' | 'spouse' | 'child') => {
    if (relType === 'parent') {
      removeRelationship(targetPersonId, personId, 'parent');
    } else if (relType === 'spouse') {
      removeRelationship(personId, targetPersonId, 'spouse');
    } else if (relType === 'child') {
      removeRelationship(personId, targetPersonId, 'child');
    }
    onClose();
  };

  const getAvailablePersonsForLinking = () => {
    const allPersons = Object.values(familyTree.persons);
    const parentUnion = person.parentUnionId ? familyTree.unions[person.parentUnionId] : null;
    const canAddParent = !parentUnion || parentUnion.partnerIds.length < 2;

    return allPersons.filter(p => {
      if (p.id === personId) return false;

      if (linkAction === 'parent') {
        if (!canAddParent) return false;
        return !parentUnion || !parentUnion.partnerIds.includes(p.id);
      } else if (linkAction === 'spouse') {
        const hasUnion = person.unionIds.some(unionId => {
          const union = familyTree.unions[unionId];
          return union && union.partnerIds.includes(p.id);
        });
        return !hasUnion;
      } else if (linkAction === 'child') {
        const childUnion = p.parentUnionId ? familyTree.unions[p.parentUnionId] : null;
        const alreadyLinked = childUnion ? childUnion.partnerIds.includes(personId) : false;
        if (alreadyLinked) return false;
        const parentUnionMatch = parentUnion ? parentUnion.partnerIds.includes(p.id) : false;
        const spouseUnionMatch = person.unionIds.some(unionId => {
          const union = familyTree.unions[unionId];
          return union && union.partnerIds.includes(p.id);
        });
        if (parentUnionMatch || spouseUnionMatch) return false;
        return !childUnion || childUnion.partnerIds.length < 2;
      }
      return false;
    });
  };

  const getRelatedPersons = () => {
    const related: { id: string; name: string; type: 'parent' | 'spouse' | 'child' }[] = [];
    const seen = new Set<string>();

    if (person.parentUnionId) {
      const parentUnion = familyTree.unions[person.parentUnionId];
      parentUnion?.partnerIds.forEach(id => {
        const parent = familyTree.persons[id];
        if (parent) {
          const key = `parent:${id}`;
          if (!seen.has(key)) {
            seen.add(key);
            related.push({
              id,
              name: getTargetName(parent),
              type: 'parent',
            });
          }
        }
      });
    }

    person.unionIds.forEach(unionId => {
      const union = familyTree.unions[unionId];
      if (!union) return;

      union.partnerIds.forEach(id => {
        if (id === personId) return;
        const spouse = familyTree.persons[id];
        if (spouse) {
          const key = `spouse:${id}`;
          if (!seen.has(key)) {
            seen.add(key);
            related.push({
              id,
              name: getTargetName(spouse),
              type: 'spouse',
            });
          }
        }
      });

      union.childIds.forEach(id => {
        const child = familyTree.persons[id];
        if (child) {
          const key = `child:${id}`;
          if (!seen.has(key)) {
            seen.add(key);
            related.push({
              id,
              name: getTargetName(child),
              type: 'child',
            });
          }
        }
      });
    });

    return related;
  };

  if (type === 'link' && linkAction === 'child' && pendingChildId) {
    const unions = getPersonUnions();
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="link-menu" onClick={(e) => e.stopPropagation()}>
          <div className="link-menu-header">
            <button onClick={() => setPendingChildId(null)}>{copy.linkBack}</button>
            <span>{copy.linkChildWith}</span>
          </div>
          <div className="link-menu-list">
            {unions.length === 0 ? (
              <div className="link-menu-item disabled">{copy.noPersonsAvailable}</div>
            ) : (
              unions.map(union => (
                <button
                  key={union.id}
                  className="link-menu-item"
                  onClick={() => {
                    addChild(personId, pendingChildId, union.id);
                    onClose();
                  }}
                >
                  {getUnionLabel(union)}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'link' && linkAction === 'parent') {
    const availableUnions = getAvailableParentUnions();
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="link-menu" onClick={(e) => e.stopPropagation()}>
          <div className="link-menu-header">
            <button onClick={() => setLinkAction(null)}>{copy.linkBack}</button>
            <span>{copy.linkParents}</span>
          </div>
          <div className="link-menu-list">
            {availableUnions.length === 0 ? (
              <div className="link-menu-item disabled">{copy.noPersonsAvailable}</div>
            ) : (
              availableUnions.map(union => (
                <button
                  key={union.id}
                  className="link-menu-item"
                  onClick={() => {
                    linkChildToUnion(personId, union.id);
                    onClose();
                  }}
                >
                  {getUnionLabel(union)}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'link' && linkAction) {
    const availablePersons = getAvailablePersonsForLinking();
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="link-menu" onClick={(e) => e.stopPropagation()}>
          <div className="link-menu-header">
            <button onClick={() => setLinkAction(null)}>{copy.linkBack}</button>
            <span>
              {linkAction === 'spouse' && copy.linkSpouse}
              {linkAction === 'child' && copy.linkChild}
            </span>
          </div>
          <div className="link-menu-list">
            {availablePersons.length === 0 ? (
              <div className="link-menu-item disabled">{copy.noPersonsAvailable}</div>
            ) : (
              availablePersons.map(p => (
                <button
                  key={p.id}
                  className="link-menu-item"
                  onClick={() => handleLinkToPerson(p.id)}
                >
                  {getTargetName(p)}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'add-child') {
    const unions = getPersonUnions();
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="link-menu" onClick={(e) => e.stopPropagation()}>
          <div className="link-menu-header">
            <button onClick={onClose}>{copy.linkBack}</button>
            <span>{copy.addChildWith}</span>
          </div>
          <div className="link-menu-list">
            {unions.length === 0 ? (
              <div className="link-menu-item disabled">{copy.noPersonsAvailable}</div>
            ) : (
              unions.map(union => (
                <button
                  key={union.id}
                  className="link-menu-item"
                  onClick={() => handleAddChildWithUnion(union.id)}
                >
                  {getUnionLabel(union)}
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'unlink') {
    const relatedPersons = getRelatedPersons();
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="link-menu" onClick={(e) => e.stopPropagation()}>
          <div className="link-menu-header">
            <button onClick={onClose}>{copy.linkBack}</button>
            <span>{copy.removeLink}</span>
          </div>
          <div className="link-menu-list">
            {relatedPersons.length === 0 ? (
              <div className="link-menu-item disabled">{copy.noLinksAvailable}</div>
            ) : (
              relatedPersons.map(rel => {
                const relationLabel = rel.type === 'parent'
                  ? copy.relationParent
                  : rel.type === 'spouse'
                    ? copy.relationSpouse
                    : copy.relationChild;
                return (
                  <button
                    key={rel.id}
                    className="link-menu-item"
                    onClick={() => handleUnlink(rel.id, rel.type)}
                  >
                    {rel.name} ({relationLabel})
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="link-menu" onClick={(e) => e.stopPropagation()}>
        <div className="link-menu-header">
          <span>{copy.linkWith}</span>
        </div>
        <div className="link-menu-list">
          <button className="link-menu-item" onClick={() => setLinkAction('parent')}>
            {copy.linkParents}
          </button>
          <button className="link-menu-item" onClick={() => setLinkAction('spouse')}>
            {copy.linkSpouse}
          </button>
          <button className="link-menu-item" onClick={() => setLinkAction('child')}>
            {copy.linkChild}
          </button>
        </div>
      </div>
    </div>
  );
};
