import { describe, it, expect } from 'vitest';
import { parseRegexp } from '../../index.js';

/**
 * @see parseUnicodeProperty
 */
describe.each(['L', 'Hex', 'General_Category=Letter', 'Script=Latin'])('Unicode property %o', unicodeProperty => {
  it('should parse unicode property', () => {
    expect(parseRegexp(`/\\p{${unicodeProperty}}/u`)).toMatchSnapshot();
  });
  it('should parse non unicode property', () => {
    expect(parseRegexp(`/\\P{${unicodeProperty}}/u`)).toMatchSnapshot();
  });
});
