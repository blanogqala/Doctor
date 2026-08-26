function snakeCaseKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

export function toSnakeCase<T>(obj: T): unknown {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj === 'object' && 'toNumber' in obj && typeof (obj as { toNumber: () => number }).toNumber === 'function') {
    return Number(obj);
  }
  if (!isPlainObject(obj)) return obj;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeCaseKey(key)] = toSnakeCase(value);
  }
  return result;
}

export function generateInvoiceNumber(): string {
  const hex = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `INV-${hex}`;
}
