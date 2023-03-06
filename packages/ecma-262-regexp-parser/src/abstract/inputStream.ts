export type StringStream = {
  chars(): InputStreamIterator;
  size(): number;
  [Symbol.iterator](): InputStreamIterator;
};

export type InputStreamIterator = Iterator<string, null> & {
  isDone(): boolean;
  collect(regexp: RegExp): { value: string; start: number; end: number } | null;
};

export const createStringStream = (input: string): StringStream => {
  const self: StringStream = {
    chars: () => self[Symbol.iterator](),
    size: () => input.length,
    [Symbol.iterator]: () => {
      let pos = 0;

      const inputIterator: InputStreamIterator = {
        isDone: () => pos === input.length,
        next: () => {
          if (inputIterator.isDone()) {
            return { done: true, value: null };
          }

          const char = input.charAt(pos++);

          return {
            done: false,
            value: char,
          };
        },
        collect: regexp => {
          const normalizedRegexp = new RegExp(regexp, 'g');
          normalizedRegexp.lastIndex = pos;

          const found = normalizedRegexp.exec(input);

          if (!found) {
            return null;
          }
          const fullMatch = found[0];
          const foundValue = found[1] ?? fullMatch;
          if (pos + fullMatch.length === normalizedRegexp.lastIndex) {
            const start = pos;
            pos += fullMatch.length;
            return {
              value: foundValue,
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
