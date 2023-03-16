export const replace = <T>(array: T[], from: T | null, to: T): T[] => {
  return array.map(x => (x === from ? to : x));
};

export const remove = <T>(array: T[], item: T): T[] => {
  return array.filter(x => x !== item);
};
