import { describe, bench } from 'vitest';
import { parseRegexp } from '../../index.js';

describe('Small', () => {
  bench(
    'Small regexp',
    () => {
      parseRegexp(/(Hello)\s([Ww]orld)!?/g);
    },
    { iterations: 2000, warmupTime: 1000 },
  );
});

describe('Medium', () => {
  bench(
    'Medium regexp',
    () => {
      parseRegexp(/\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g);
    },
    { iterations: 1000, warmupTime: 1000 },
  );
});

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
