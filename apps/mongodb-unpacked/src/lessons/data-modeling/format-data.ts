import type { DataValue } from './types.ts';
export function formatData(value: DataValue, depth = 0): string {
  const indent = '  '.repeat(depth),
    next = '  '.repeat(depth + 1);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object'))
      return '[' + value.map((v) => formatData(v)).join(', ') + ']';
    return (
      '[\n' +
      value.map((v) => next + formatData(v, depth + 1)).join(',\n') +
      '\n' +
      indent +
      ']'
    );
  }
  return (
    '{\n' +
    Object.entries(value)
      .map(([k, v]) => next + k + ': ' + formatData(v, depth + 1))
      .join(',\n') +
    '\n' +
    indent +
    '}'
  );
}
