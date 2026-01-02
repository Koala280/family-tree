import { useEffect, useRef, useState, type FormEvent } from 'react';
import { translations, type LanguageCode } from '../i18n';

interface PasswordModalProps {
  title: string;
  description?: string;
  confirmLabel: string;
  requireConfirm: boolean;
  minLength: number;
  language: LanguageCode;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}

export const PasswordModal = ({
  title,
  description,
  confirmLabel,
  requireConfirm,
  minLength,
  language,
  onCancel,
  onSubmit,
}: PasswordModalProps) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const copy = translations[language];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const validate = () => {
    if (password.length < minLength) {
      return copy.minLengthError(minLength);
    }
    if (requireConfirm && password !== confirm) {
      return copy.mismatchError;
    }
    return null;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }
    setError(null);
    onSubmit(password);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onCancel} aria-label={copy.closeLabel}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {description && <p className="modal-description">{description}</p>}
            <div className="form-group">
              <label>{copy.passwordLabel}</label>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            {requireConfirm && (
              <div className="form-group">
                <label>{copy.passwordConfirmLabel}</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                />
              </div>
            )}
            {error && <div className="modal-error">{error}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              {copy.cancelLabel}
            </button>
            <button type="submit" className="btn-primary">
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
