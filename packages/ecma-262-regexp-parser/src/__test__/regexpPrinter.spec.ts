import { describe, test, expect } from 'vitest';
import { parseRegexp } from '../api.js';
import { printRegexpNode } from '../regexpPrinter.js';

describe('Printer', () => {
  test.each([
    '//gui',
    /a/,
    /^$/,
    /[A-z]/,
    /[\b]/,
    /\cA/,
    /\ca/,
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
    /(?<!\.d)\.(?<ext>[cm]?ts|tsx)$/gm,
    /((?:(?<=(?:[\(\|]))-)?(?:\d+(?:\.\d*)?))/,
    /^N;|[bdi]:[0-9.E-]+;|s:[0-9]+:".*";|a:[0-9]+:{.*}|O:[0-9]+:"[A-Za-z0-9_\\]+":[0-9]+:{.*}$/,
    /^(?<Root>[A-Za-z]:(?:\/|\\))(?<Relative>(?:(?:[^<>:"\/\\|?*\n])+(?:\/|\\))+)(?<File>(?:[^<>:"\/\\|?*\n]+)(?:\.(?:png|jpg|jpeg)))$/,
    /(?:(?:^172\.1[6-9])|(?:^172\.2[0-9])|(?:^172\.3[0-1]))(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){2}$/,
  ])('Print regexp %s', source => {
    expect(printRegexpNode(parseRegexp(source))).toBe(source.toString());
  });
});
