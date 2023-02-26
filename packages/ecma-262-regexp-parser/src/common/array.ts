export const replace = <T>(array: T[], from: T, to: T): T[] => {
  return array.map(x => (x === from ? to : x));
};
