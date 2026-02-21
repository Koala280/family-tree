import DOMPurify from 'dompurify';

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

const ALLOWED_RICH_TEXT_TAGS = [
  'p',
  'div',
  'br',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'font',
  'a',
];

const ALLOWED_RICH_TEXT_ATTRIBUTES = ['href', 'target', 'rel', 'style', 'color'];

const CONTENT_TAGS = new Set([
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'CODE',
  'HR',
]);

const ALLOWED_STYLE_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
  'font-family',
  'font-size',
]);

const FORBIDDEN_STYLE_SNIPPET_PATTERN = /(url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:)/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;
const RGB_COLOR_PATTERN = /^rgba?\(\s*[\d.%\s,]+\)$/i;
const HSL_COLOR_PATTERN = /^hsla?\(\s*[\d.%\s,]+\)$/i;
const NAMED_COLOR_PATTERN = /^[a-z]+$/i;
const FONT_WEIGHT_PATTERN = /^(normal|bold|bolder|lighter|[1-9]00)$/i;
const FONT_STYLE_PATTERN = /^(normal|italic|oblique)$/i;
const FONT_FAMILY_PATTERN = /^[a-z0-9 ,'"-]+$/i;
const FONT_SIZE_PATTERN = /^(\d+(\.\d+)?(px|em|rem|%)|xx-small|x-small|small|medium|large|x-large|xx-large)$/i;
const TEXT_DECORATION_TOKEN_PATTERN = /^(none|underline|line-through|overline|solid|double|dotted|dashed|wavy)$/i;
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const sanitizeStyleValue = (property: string, value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (FORBIDDEN_STYLE_SNIPPET_PATTERN.test(trimmed)) return '';

  switch (property) {
    case 'color':
    case 'background-color':
      if (
        HEX_COLOR_PATTERN.test(trimmed)
        || RGB_COLOR_PATTERN.test(trimmed)
        || HSL_COLOR_PATTERN.test(trimmed)
        || NAMED_COLOR_PATTERN.test(trimmed)
      ) {
        return trimmed;
      }
      return '';
    case 'font-weight':
      return FONT_WEIGHT_PATTERN.test(trimmed) ? trimmed : '';
    case 'font-style':
      return FONT_STYLE_PATTERN.test(trimmed) ? trimmed : '';
    case 'text-decoration':
    case 'text-decoration-line': {
      const tokens = trimmed.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return '';
      return tokens.every(token => TEXT_DECORATION_TOKEN_PATTERN.test(token)) ? tokens.join(' ') : '';
    }
    case 'font-family':
      return FONT_FAMILY_PATTERN.test(trimmed) ? trimmed : '';
    case 'font-size':
      return FONT_SIZE_PATTERN.test(trimmed) ? trimmed : '';
    default:
      return '';
  }
};

const sanitizeStyleAttribute = (value: string) => {
  const safeDeclarations: string[] = [];

  value.split(';').forEach(declaration => {
    const separatorIndex = declaration.indexOf(':');
    if (separatorIndex <= 0) return;

    const rawProperty = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = declaration.slice(separatorIndex + 1).trim();

    if (!ALLOWED_STYLE_PROPERTIES.has(rawProperty)) return;

    const safeValue = sanitizeStyleValue(rawProperty, rawValue);
    if (!safeValue) return;

    safeDeclarations.push(`${rawProperty}: ${safeValue}`);
  });

  return safeDeclarations.join('; ');
};

const getSafeHref = (href: string) => {
  const trimmed = href.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#') || trimmed.startsWith('/')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, 'https://local.invalid');
    if (SAFE_LINK_PROTOCOLS.has(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
};

const sanitizeRichTextLinksAndStyles = (html: string) => {
  if (typeof document === 'undefined') return html;

  const temp = document.createElement('div');
  temp.innerHTML = html;

  Array.from(temp.querySelectorAll('*')).forEach(element => {
    if (element.tagName.toUpperCase() === 'FONT') {
      const colorAttr = element.getAttribute('color');
      if (colorAttr) {
        const safeColor = sanitizeStyleValue('color', colorAttr);
        if (safeColor) {
          const currentStyle = element.getAttribute('style');
          const mergedStyle = [currentStyle, `color: ${safeColor}`].filter(Boolean).join('; ');
          element.setAttribute('style', mergedStyle);
        }
      }
      element.removeAttribute('color');
    }

    const styleAttr = element.getAttribute('style');
    if (styleAttr) {
      const cleanedStyle = sanitizeStyleAttribute(styleAttr);
      if (cleanedStyle) {
        element.setAttribute('style', cleanedStyle);
      } else {
        element.removeAttribute('style');
      }
    }

    if (element.tagName.toUpperCase() === 'A') {
      const href = element.getAttribute('href');
      if (!href) {
        element.removeAttribute('target');
        element.removeAttribute('rel');
        return;
      }

      const safeHref = getSafeHref(href);
      if (!safeHref) {
        element.removeAttribute('href');
        element.removeAttribute('target');
        element.removeAttribute('rel');
        return;
      }

      element.setAttribute('href', safeHref);

      if (/^https?:\/\//i.test(safeHref)) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer nofollow');
      } else {
        element.removeAttribute('target');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
  });

  return temp.innerHTML;
};

export const sanitizeRichTextHtml = (value: unknown) => {
  if (typeof value !== 'string') return '';

  const cleaned = value.replace(/\u200B/g, '');
  if (!cleaned.trim()) return '';

  const sanitized = DOMPurify.sanitize(cleaned, {
    ALLOWED_TAGS: ALLOWED_RICH_TEXT_TAGS,
    ALLOWED_ATTR: ALLOWED_RICH_TEXT_ATTRIBUTES,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'canvas', 'video', 'audio', 'img', 'form', 'input', 'button', 'textarea', 'select'],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
    RETURN_TRUSTED_TYPE: false,
  });

  return sanitizeRichTextLinksAndStyles(sanitized);
};

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
  const sanitized = sanitizeRichTextHtml(value);
  if (!sanitized.includes('<') && !sanitized.includes('&')) {
    return sanitized.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
  }

  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = sanitized;
    return (temp.textContent ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n');
  }

  return decodeBasicEntities(
    sanitized
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, '\n')
      .replace(HTML_TAG_PATTERN, '')
  ).replace(/\r\n?/g, '\n');
};

export const isRichTextEmpty = (value: unknown) => {
  if (typeof value !== 'string') return true;

  const sanitized = sanitizeRichTextHtml(value);
  if (!sanitized.includes('<') && !sanitized.includes('&')) {
    return sanitized.trim().length === 0;
  }

  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = sanitized;
    return !Array.from(temp.childNodes).some(node => hasVisualContentInNode(node));
  }

  return getRichTextPlainText(sanitized).trim().length === 0;
};

export const normalizeRichTextForStorage = (value: unknown) => {
  const sanitized = sanitizeRichTextHtml(value);
  return isRichTextEmpty(sanitized) ? '' : sanitized;
};
