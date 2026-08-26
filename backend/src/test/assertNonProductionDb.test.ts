import { describe, expect, it } from 'vitest';
import { assertNonProductionDatabaseUrl } from './assertNonProductionDb';

describe('assertNonProductionDatabaseUrl', () => {
  it('allows localhost', () => {
    expect(() =>
      assertNonProductionDatabaseUrl('postgresql://u:p@localhost:5432/medspace_db')
    ).not.toThrow();
  });

  it('allows medspace_test name', () => {
    expect(() =>
      assertNonProductionDatabaseUrl('postgresql://u:p@127.0.0.1:5432/medspace_test')
    ).not.toThrow();
  });

  it('refuses empty URL', () => {
    expect(() => assertNonProductionDatabaseUrl('')).toThrow(/empty/i);
  });

  it('refuses render / production-looking hosts', () => {
    expect(() =>
      assertNonProductionDatabaseUrl(
        'postgresql://u:p@dpg-xxx-a.oregon-postgres.render.com/medspace'
      )
    ).toThrow(/render\.com|production-looking/i);
    expect(() =>
      assertNonProductionDatabaseUrl('postgresql://u:p@db.example.com/production')
    ).toThrow(/prod/i);
  });

  it('refuses remote non-local URLs', () => {
    expect(() =>
      assertNonProductionDatabaseUrl('postgresql://u:p@db.example.com/medspace')
    ).toThrow(/localhost/i);
  });
});
