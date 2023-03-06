import { expect, it } from 'vitest';
import { parseRegexp } from '../../index.js';

it.each(['L', 'Hex', 'General_Category=Letter', 'Script=Latin'])('property %o', input => {
  expect(parseRegexp(`/\\p{${input}}/u`)).toMatchSnapshot('Unicode Property');
  expect(parseRegexp(`/\\P{${input}}/u`)).toMatchSnapshot('Non Unicode Property');
});
