import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Simple char', () => {
  it('should correctly parse simple value', () => {
    expect(parseRegexp(/a/)).toMatchSnapshot();
  });
});
