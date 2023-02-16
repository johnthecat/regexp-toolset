import { createCodeFrame } from './console.js';

export class ParsingError extends Error {
  constructor(source: string, start: number, end: number, message: string) {
    super('\n' + createCodeFrame(source, start, end, message));
  }

  toString() {
    return 'Regexp parsing error:' + this.message;
  }
}
