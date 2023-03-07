import { describe, test, expect } from 'vitest';
import { parseRegexp } from '../api.js';
import { printRegexpNode } from '../regexpPrinter.js';

describe('Printer', () => {
  test.each([
    '//gui',
    /a/,
    /[A-z]/,
    /[\b]/,
    /(hello)/,
    /(?:hello) world/,
    /(?<group>hello)\s\k<group>/,
    /(?=hello)/,
    /(?!hello)/,
    /(?<=hello)/,
    /(?<!hello)/,
    /(he(llo))/,
    /\u0061/,
    /\x61/,
    /\141/,
    /a*/,
    /a*?/,
    /a?/,
    /a??/,
    /a+/,
    /a+?/,
    /a{1}/,
    /a{1}?/,
    /a{2,}/,
    /a{2,}?/,
    /a{3,4}/,
    /a{3,4}?/,

    // just flexin'
    /\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
  ])('Print regexp %s', source => {
    expect(printRegexpNode(parseRegexp(source))).toBe(source.toString());
  });
});
