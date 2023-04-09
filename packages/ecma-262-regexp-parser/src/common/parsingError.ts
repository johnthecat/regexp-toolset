import { createCodeFrame } from './console.js';

export class ParsingError extends Error {
  constructor(
    public readonly source: string,
    public readonly start: number,
    public readonly end: number,
    message: string,
  ) {
    super('\n' + createCodeFrame(source, start, end, message));
  }

  toString() {
    return 'Regexp parsing error:' + this.message;
  }
}
