import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

/**
 * @see parseSimpleChar
 */
describe('Simple char', () => {
  it('should correctly parse simple value', () => {
    expect(parseRegexp(/a/)).toMatchSnapshot();
  });
});
