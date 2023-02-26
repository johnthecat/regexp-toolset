import { expect, describe, it } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Null Character', () => {
  it('should parse null character', () => {
    expect(parseRegexp(/\0/)).toMatchSnapshot();
  });
});
