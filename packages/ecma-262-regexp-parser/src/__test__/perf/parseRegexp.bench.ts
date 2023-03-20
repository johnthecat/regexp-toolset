import { describe, bench } from 'vitest';
import { parseRegexp } from '../../index.js';

const scanL = <T, R>(arr: T[], fn: (acc: R, item: T, index: number) => R, initial: R): R[] => {
  const result: R[] = [];

  arr.reduce<R>((acc, item, index) => {
    const a = fn(acc, item, index);
    result.push(a);
    return a;
  }, initial);

  return result;
};

const printNumber = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(2));

const createTitle = (regexp: string, repetitionsCount: number): string => {
  return `${regexp.slice(0, 10)}${regexp.length > 10 ? '...' : ''} (reps: ${printNumber(repetitionsCount)})`;
};

const alphabetUppercase = Array.from({ length: 26 }).map((_, index) => String.fromCharCode(index + 65));
const alphabetLowercase = Array.from({ length: 26 }).map((_, index) => String.fromCharCode(index + 97));

const highlights = [1, 2, 5, 10, 20, 40];
const smallRegExps = scanL<string, string[]>(
  alphabetUppercase.concat(alphabetLowercase),
  (a, t) => a.concat(t),
  [],
).filter((_, i) => highlights.includes(i + 1));

const createSyntaxBench = (title: string, prepare: (rawValues: string[]) => string) => {
  describe(title, () => {
    for (const rawValues of smallRegExps) {
      const regExpBody = prepare(rawValues);
      const regExp = new RegExp(regExpBody, 'g');
      bench(
        createTitle(regExpBody, rawValues.length),
        () => {
          parseRegexp(regExp);
        },
        { iterations: 100, time: 250, warmupTime: 50 },
      );
    }
  });
};

createSyntaxBench('Disjunction', x => x.join('|'));
createSyntaxBench('Range Quantifier', x => x.map(x => `${x}{1,}`).join(''));
createSyntaxBench('Greedy Quantifier', x => x.map(x => `${x}*`).join(''));
createSyntaxBench('Char Class', x => `[${x.join('')}]`);
createSyntaxBench('Char Classes', x => x.map(x => `[${x}]`).join(''));
createSyntaxBench('Group', x => `(${x.join('')})`);
createSyntaxBench('Groups', x => x.map(x => `(${x})`).join(''));
createSyntaxBench('Char Range', x => `[${x.map(a => `${a}-${String.fromCharCode(a.charCodeAt(0) + 1)}`).join('')}]`);

describe('Large', () => {
  bench(
    'Large regexp',
    () => {
      parseRegexp(
        // eslint-disable-next-line no-control-regex
        /^([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x22([^\x0d\x22\x5c\x80-\xff]|\x5c[\x00-\x7f])*\x22))*\x40([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d)(\x2e([^\x00-\x20\x22\x28\x29\x2c\x2e\x3a-\x3c\x3e\x40\x5b-\x5d\x7f-\xff]+|\x5b([^\x0d\x5b-\x5d\x80-\xff]|\x5c[\x00-\x7f])*\x5d))*$/g,
      );
    },
    { iterations: 500, warmupTime: 1000 },
  );
});
