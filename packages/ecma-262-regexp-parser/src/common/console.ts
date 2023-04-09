export const createUnderline = (start: number, end: number): string => {
  const padding = ' '.repeat(start);
  return padding + (start === end ? '↑' : '═'.repeat(1 + end - start));
};
export const createCodeFrame = (source: string, start: number, end: number, message: string) => {
  const commonPadding = ' ';
  const lineStart = '❯ ';

  if (source.length === 0) {
    return lineStart + message;
  }

  return (
    commonPadding +
    lineStart +
    source +
    '\n' +
    commonPadding +
    commonPadding.repeat(lineStart.length) +
    createUnderline(start, end) +
    '\n' +
    commonPadding +
    message.padStart(
      commonPadding.length + Math.min(start + message.length, source.length + Math.round(message.length / 2)),
      ' ',
    )
  );
};
