const INLINE_WHITESPACE_PATTERN = /[ \t\f\v\u00a0]+/g;

export const normalizeInlineTextOnCommit = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.replace(INLINE_WHITESPACE_PATTERN, ' ').trim();
};

