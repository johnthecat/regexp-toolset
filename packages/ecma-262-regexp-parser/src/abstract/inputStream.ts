export type StringStream = {
  chars(): InputStreamIterator;
  size(): number;
  [Symbol.iterator](): InputStreamIterator;
};

export type InputStreamIterator = Iterator<string, null> & {
  isDone(): boolean;
  getPosition(): number;
  collect(regexp: RegExp): { value: string; start: number; end: number } | null;
};

export const createStringStream = (input: string): StringStream => {
  const collectRegexpCache: Map<string, RegExp> = new Map();
  const size = input.length - 1;

  const self: StringStream = {
    chars: () => self[Symbol.iterator](),
    size: () => size,
    [Symbol.iterator]: () => {
      let pos = 0;
      const inputIterator: InputStreamIterator = {
        isDone: () => pos === input.length,
        getPosition: () => pos,
        next: () => {
          if (inputIterator.isDone()) {
            return { done: true, value: null };
          }

          return { done: false, value: input.charAt(pos++) };
        },
        collect: regexp => {
          let normalizedRegexp = collectRegexpCache.get(regexp.source);
          if (!normalizedRegexp) {
            normalizedRegexp = new RegExp(regexp.source, 'g');
            collectRegexpCache.set(regexp.source, normalizedRegexp);
          }
          normalizedRegexp.lastIndex = pos;

          const found = normalizedRegexp.exec(input);
          if (!found) {
            return null;
          }

          const fullMatch = found[0];
          const possibleNextPos = pos + fullMatch.length;

          if (possibleNextPos === normalizedRegexp.lastIndex) {
            const start = pos;
            pos = possibleNextPos;
            return {
              value: fullMatch,
              start,
              end: pos - 1,
            };
          }

          return null;
        },
      };
      return inputIterator;
    },
  };
  return self;
};
