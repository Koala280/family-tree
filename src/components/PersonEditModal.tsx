import { useRef } from 'react';
import { Person, DateInfo } from '../types';
import { useFamilyTree } from '../context/FamilyTreeContext';

interface PersonEditModalProps {
  person: Person;
  onClose: () => void;
}

export const PersonEditModal = ({ person, onClose }: PersonEditModalProps) => {
  const { updatePerson } = useFamilyTree();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          <h2>Person bearbeiten</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="profile-photo-section">
            <div
              className={`profile-photo ${person.gender === 'male' ? 'male' : person.gender === 'female' ? 'female' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {person.photo ? (
                <img src={person.photo} alt="Profilbild" />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
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
              {person.photo ? 'Foto ändern' : 'Foto hochladen'}
            </button>
            {person.photo && (
              <button
                type="button"
                className="remove-photo-btn"
                onClick={() => handleInputChange('photo', undefined)}
              >
                Foto entfernen
              </button>
            )}
          </div>

          <div className="form-group">
            <label>Vorname</label>
            <input
              type="text"
              value={person.firstName || ''}
              onChange={(e) => handleInputChange('firstName', e.target.value)}
              placeholder="Vorname"
            />
          </div>

          <div className="form-group">
            <label>Nachname</label>
            <input
              type="text"
              value={person.lastName || ''}
              onChange={(e) => handleInputChange('lastName', e.target.value)}
              placeholder="Nachname"
            />
          </div>

          <div className="form-group">
            <label>Geschlecht</label>
            <div className="gender-buttons">
              <button
                type="button"
                className={`gender-btn ${person.gender === 'male' ? 'active' : ''}`}
                onClick={() => handleGenderChange('male')}
              >
                ♂ Männlich
              </button>
              <button
                type="button"
                className={`gender-btn ${person.gender === 'female' ? 'active' : ''}`}
                onClick={() => handleGenderChange('female')}
              >
                ♀ Weiblich
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Geburtsdatum</label>
            <div className="date-inputs">
              <input
                type="text"
                value={person.birthDate.day || ''}
                onChange={(e) => handleDateChange('birthDate', 'day', e.target.value)}
                placeholder="Tag"
                maxLength={2}
              />
              <input
                type="text"
                value={person.birthDate.month || ''}
                onChange={(e) => handleDateChange('birthDate', 'month', e.target.value)}
                placeholder="Monat"
                maxLength={2}
              />
              <input
                type="text"
                value={person.birthDate.year || ''}
                onChange={(e) => handleDateChange('birthDate', 'year', e.target.value)}
                placeholder="Jahr"
                maxLength={4}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Todestag</label>
            <div className="date-inputs">
              <input
                type="text"
                value={person.deathDate.day || ''}
                onChange={(e) => handleDateChange('deathDate', 'day', e.target.value)}
                placeholder="Tag"
                maxLength={2}
              />
              <input
                type="text"
                value={person.deathDate.month || ''}
                onChange={(e) => handleDateChange('deathDate', 'month', e.target.value)}
                placeholder="Monat"
                maxLength={2}
              />
              <input
                type="text"
                value={person.deathDate.year || ''}
                onChange={(e) => handleDateChange('deathDate', 'year', e.target.value)}
                placeholder="Jahr"
                maxLength={4}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Todesursache</label>
            <input
              type="text"
              value={person.causeOfDeath || ''}
              onChange={(e) => handleInputChange('causeOfDeath', e.target.value)}
              placeholder="Todesursache"
            />
          </div>

          <div className="form-group">
            <label>Bekannte Krankheiten</label>
            <textarea
              value={person.knownDiseases || ''}
              onChange={(e) => handleInputChange('knownDiseases', e.target.value)}
              placeholder="Bekannte Krankheiten"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>Notizen</label>
            <textarea
              value={person.notes || ''}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Notizen"
              rows={4}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>Fertig</button>
        </div>
      </div>
    </div>
  );
};
