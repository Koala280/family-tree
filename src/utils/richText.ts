const HTML_TAG_PATTERN = /<[^>]*>/g;

const decodeBasicEntities = (value: string) => (
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
);

const CONTENT_TAGS = new Set([
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'CODE',
  'TABLE',
  'IMG',
  'VIDEO',
  'AUDIO',
  'IFRAME',
  'SVG',
  'CANVAS',
  'HR',
]);

const hasVisualContentInNode = (node: Node): boolean => {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\u200B/g, '')
      .trim();
    return text.length > 0;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const element = node as Element;
  const tagName = element.tagName.toUpperCase();

  if (tagName === 'BR') return false;
  if (CONTENT_TAGS.has(tagName)) return true;

  return Array.from(element.childNodes).some(child => hasVisualContentInNode(child));
};

export const getRichTextPlainText = (value: unknown) => {
  if (typeof value !== 'string' || value.length === 0) return '';
  if (!value.includes('<') && !value.includes('&')) {
    return value.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
  }

  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = value;
    return (temp.textContent ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n');
  }

  return decodeBasicEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
      .replace(HTML_TAG_PATTERN, '')
  ).replace(/\r\n?/g, '\n');
};

export const isRichTextEmpty = (value: unknown) => {
  if (typeof value !== 'string') return true;

  const cleaned = value.replace(/\u200B/g, '');
  if (!cleaned.includes('<') && !cleaned.includes('&')) {
    return cleaned.trim().length === 0;
  }

  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = cleaned;
    return !Array.from(temp.childNodes).some(node => hasVisualContentInNode(node));
  }

  return getRichTextPlainText(cleaned).trim().length === 0;
};

export const normalizeRichTextForStorage = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/\u200B/g, '');
  return isRichTextEmpty(cleaned) ? '' : cleaned;
};
