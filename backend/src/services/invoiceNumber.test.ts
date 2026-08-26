import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber } from './invoiceNumber';

describe('invoiceNumber', () => {
  it('formats padded sequences', () => {
    expect(formatInvoiceNumber(2026, 1)).toBe('MS-2026-00001');
    expect(formatInvoiceNumber(2026, 42)).toBe('MS-2026-00042');
  });
});
