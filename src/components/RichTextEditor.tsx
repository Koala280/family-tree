import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { isRichTextEmpty, normalizeRichTextForStorage } from '../utils/richText';

type RichTextEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  compact?: boolean;
};

type LegacyExecCommandDocument = Document & {
  execCommand?: (commandId: string, showUi?: boolean, value?: string) => boolean;
};

type FormatPainterSnapshot = {
  fontWeight: string;
  fontStyle: string;
  textDecorationLine: string;
  color: string;
  backgroundColor: string;
  fontFamily: string;
  fontSize: string;
};

const runExecCommand = (command: string, value?: string) => {
  if (typeof document === 'undefined') return false;
  const doc = document as LegacyExecCommandDocument;
  if (typeof doc.execCommand === 'function') {
    return doc.execCommand(command, false, value);
  }
  return false;
};

const isModifierPressed = (event: KeyboardEvent) => event.ctrlKey || event.metaKey;

export const RichTextEditor = ({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
  compact = false,
}: RichTextEditorProps) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [formatPainterSnapshot, setFormatPainterSnapshot] = useState<FormatPainterSnapshot | null>(null);

  const rootClassName = useMemo(
    () => `rich-text-input ${compact ? 'compact' : ''} ${className}`.trim(),
    [className, compact]
  );

  const refreshEmptyState = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setIsEmpty(isRichTextEmpty(editor.innerHTML));
  };

  const emitEditorValue = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = normalizeRichTextForStorage(editor.innerHTML);
    setIsEmpty(isRichTextEmpty(nextValue));
    onChange(nextValue);
  };

  const saveSelection = () => {
    if (typeof window === 'undefined') return;
    const editor = editorRef.current;
    if (!editor) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedRangeRef.current = range.cloneRange();
  };

  const getEditorSelectionRange = () => {
    if (typeof window === 'undefined') return null;
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    return range;
  };

  const restoreSelection = () => {
    if (typeof window === 'undefined') return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return;
    if (savedRangeRef.current) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
  };

  const executeCommand = (command: string, commandValue?: string) => {
    restoreSelection();
    runExecCommand(command, commandValue);
    saveSelection();
    emitEditorValue();
  };

  const wrapSelectionWithStyle = (cssProperty: 'color' | 'background-color', cssValue: string) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const range = getEditorSelectionRange();
    if (!range || range.collapsed) return false;

    const styleWrapper = document.createElement('span');
    styleWrapper.style.setProperty(cssProperty, cssValue);

    try {
      range.surroundContents(styleWrapper);
    } catch {
      const extracted = range.extractContents();
      styleWrapper.appendChild(extracted);
      range.insertNode(styleWrapper);
    }

    const selection = window.getSelection();
    if (selection) {
      const nextRange = document.createRange();
      nextRange.selectNodeContents(styleWrapper);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    }
    return true;
  };

  const wrapSelectionWithStyles = (styles: Record<string, string>) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const range = getEditorSelectionRange();
    if (!range || range.collapsed) return false;

    const styleWrapper = document.createElement('span');
    Object.entries(styles).forEach(([property, styleValue]) => {
      styleWrapper.style.setProperty(property, styleValue);
    });

    try {
      range.surroundContents(styleWrapper);
    } catch {
      const extracted = range.extractContents();
      styleWrapper.appendChild(extracted);
      range.insertNode(styleWrapper);
    }

    const selection = window.getSelection();
    if (selection) {
      const nextRange = document.createRange();
      nextRange.selectNodeContents(styleWrapper);
      selection.removeAllRanges();
      selection.addRange(nextRange);
    }
    return true;
  };

  const captureFormatPainterSnapshot = () => {
    if (typeof window === 'undefined') return null;
    const range = getEditorSelectionRange();
    if (!range) return null;

    const baseElement = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : (range.startContainer as Element | null);

    if (!baseElement) return null;

    const computed = window.getComputedStyle(baseElement);
    return {
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle,
      textDecorationLine: computed.textDecorationLine,
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
    } satisfies FormatPainterSnapshot;
  };

  const activateFormatPainter = () => {
    restoreSelection();
    const snapshot = captureFormatPainterSnapshot();
    if (!snapshot) return;
    setFormatPainterSnapshot(snapshot);
  };

  const applyFormatPainterToSelection = () => {
    if (!formatPainterSnapshot) return false;
    restoreSelection();
    const applied = wrapSelectionWithStyles({
      'font-weight': formatPainterSnapshot.fontWeight,
      'font-style': formatPainterSnapshot.fontStyle,
      'text-decoration-line': formatPainterSnapshot.textDecorationLine,
      color: formatPainterSnapshot.color,
      'background-color': formatPainterSnapshot.backgroundColor,
      'font-family': formatPainterSnapshot.fontFamily,
      'font-size': formatPainterSnapshot.fontSize,
    });
    if (!applied) return false;
    saveSelection();
    emitEditorValue();
    setFormatPainterSnapshot(null);
    return true;
  };

  const handleFormatPainterButtonClick = () => {
    if (formatPainterSnapshot) {
      const applied = applyFormatPainterToSelection();
      if (!applied) {
        setFormatPainterSnapshot(null);
      }
      return;
    }
    activateFormatPainter();
  };

  const executeColorCommand = (command: 'foreColor' | 'hiliteColor', colorValue: string) => {
    restoreSelection();
    const cssProperty = command === 'foreColor' ? 'color' : 'background-color';
    let applied = wrapSelectionWithStyle(cssProperty, colorValue);

    if (!applied) {
      runExecCommand('styleWithCSS', 'true');
      applied = runExecCommand(command, colorValue);
      if (!applied && command === 'hiliteColor') {
        runExecCommand('backColor', colorValue);
      }
    }
    saveSelection();
    emitEditorValue();
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || isFocused) return;
    const nextValue = normalizeRichTextForStorage(value);
    if (editor.innerHTML !== nextValue) {
      editor.innerHTML = nextValue;
    }
    setIsEmpty(isRichTextEmpty(nextValue));
  }, [isFocused, value]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleSelectionChange = () => {
      saveSelection();
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && formatPainterSnapshot) {
      setFormatPainterSnapshot(null);
      return;
    }

    if (!isModifierPressed(event)) {
      if (event.key === 'Tab') {
        event.preventDefault();
        executeCommand('insertText', '    ');
      }
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      executeCommand('bold');
      return;
    }
    if (key === 'i') {
      event.preventDefault();
      executeCommand('italic');
      return;
    }
    if (key === 'u') {
      event.preventDefault();
      executeCommand('underline');
      return;
    }
    if (event.shiftKey && key === 'x') {
      event.preventDefault();
      executeCommand('strikeThrough');
      return;
    }
    if (event.shiftKey && event.code === 'Digit7') {
      event.preventDefault();
      executeCommand('insertOrderedList');
      return;
    }
    if (event.shiftKey && event.code === 'Digit8') {
      event.preventDefault();
      executeCommand('insertUnorderedList');
      return;
    }
    if (key === 'k') {
      event.preventDefault();
      const linkUrl = window.prompt('Link URL');
      if (linkUrl?.trim()) {
        executeCommand('createLink', linkUrl.trim());
      }
      return;
    }
    if (key === 'z') {
      event.preventDefault();
      executeCommand(event.shiftKey ? 'redo' : 'undo');
      return;
    }
    if (key === 'y') {
      event.preventDefault();
      executeCommand('redo');
    }
  };

  const handleBlockTypeChange = (value: string) => {
    if (!value) return;
    executeCommand('formatBlock', value);
  };

  const handleSelectionInteraction = () => {
    saveSelection();
    if (formatPainterSnapshot) {
      applyFormatPainterToSelection();
    }
  };

  return (
    <div className={rootClassName}>
      <div className="rich-text-toolbar" role="toolbar" aria-label={`${ariaLabel} toolbar`}>
        <select
          className="rich-text-select"
          defaultValue=""
          onPointerDown={() => saveSelection()}
          onMouseDown={() => saveSelection()}
          onChange={(event) => {
            handleBlockTypeChange(event.target.value);
            event.target.value = '';
          }}
          aria-label="Format"
        >
          <option value="" disabled>
            Format
          </option>
          <option value="P">Text</option>
          <option value="H2">H2</option>
          <option value="H3">H3</option>
          <option value="BLOCKQUOTE">Zitat</option>
          <option value="PRE">Code</option>
        </select>
        <button
          type="button"
          className={`rich-text-btn ${formatPainterSnapshot ? 'active' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleFormatPainterButtonClick}
          title="Format kopieren / einfügen"
          aria-pressed={Boolean(formatPainterSnapshot)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 3h10v4H7V3zm-2 6h14v2h-1v10H6V11H5V9zm3 2v8h8v-8H8z" />
          </svg>
        </button>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('bold')} title="Fett (Ctrl+B)">B</button>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('italic')} title="Kursiv (Ctrl+I)">I</button>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('underline')} title="Unterstrichen (Ctrl+U)">U</button>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('strikeThrough')} title="Durchgestrichen (Ctrl+Shift+X)">S</button>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('insertUnorderedList')} title="Aufzählung (Ctrl+Shift+8)">•</button>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('insertOrderedList')} title="Nummerierung (Ctrl+Shift+7)">1.</button>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('formatBlock', 'BLOCKQUOTE')} title="Zitat">"</button>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('removeFormat')} title="Formatierung entfernen">Tx</button>
        <button
          type="button"
          className="rich-text-btn"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const linkUrl = window.prompt('Link URL');
            if (linkUrl?.trim()) {
              executeCommand('createLink', linkUrl.trim());
            }
          }}
          title="Link (Ctrl+K)"
        >
          Link
        </button>
        <label className="rich-text-color-label" title="Textfarbe">
          A
          <input
            type="color"
            className="rich-text-color-input"
            defaultValue="#0f172a"
            onPointerDown={() => saveSelection()}
            onMouseDown={() => saveSelection()}
            onChange={(event) => executeColorCommand('foreColor', event.target.value)}
            aria-label="Textfarbe"
          />
        </label>
        <label className="rich-text-color-label" title="Highlight">
          H
          <input
            type="color"
            className="rich-text-color-input"
            defaultValue="#fef08a"
            onPointerDown={() => saveSelection()}
            onMouseDown={() => saveSelection()}
            onChange={(event) => executeColorCommand('hiliteColor', event.target.value)}
            aria-label="Highlight"
          />
        </label>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('undo')} title="Rückgängig (Ctrl+Z)">↶</button>
        <button type="button" className="rich-text-btn" onMouseDown={(event) => event.preventDefault()} onClick={() => executeCommand('redo')} title="Wiederholen (Ctrl+Y)">↷</button>
      </div>
      <div
        ref={editorRef}
        className={`rich-text-editor-surface ${isEmpty ? 'is-empty' : ''}`}
        data-placeholder={placeholder}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onFocus={() => {
          setIsFocused(true);
          saveSelection();
          refreshEmptyState();
        }}
        onBlur={() => {
          setIsFocused(false);
          emitEditorValue();
        }}
        onMouseUp={handleSelectionInteraction}
        onKeyUp={handleSelectionInteraction}
        onInput={emitEditorValue}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};
