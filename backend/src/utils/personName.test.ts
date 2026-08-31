import { describe, expect, it } from 'vitest';
import { joinPersonName, splitFullName } from './personName';

describe('personName', () => {
  it('splits a two-part name', () => {
    expect(splitFullName('Nomsa Dlamini')).toEqual({ firstName: 'Nomsa', lastName: 'Dlamini' });
  });

  it('copies a single token into both fields', () => {
    expect(splitFullName('Nomsa')).toEqual({ firstName: 'Nomsa', lastName: 'Nomsa' });
  });

  it('joins distinct names', () => {
    expect(joinPersonName('Nomsa', 'Dlamini')).toBe('Nomsa Dlamini');
  });
});
