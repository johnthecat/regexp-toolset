export const replace = <T>(array: T[], from: T | null, to: T): T[] => {
  const index = array.findIndex(x => x === from);
  array.splice(index, 1, to);
  return array;
};

export const concat = <T>(array: T[], item: T | T[]): T[] => {
  if (Array.isArray(item)) {
    return array.concat(item);
  }
  array.push(item);
  return array;
};

export const remove = <T>(array: T[], item: T): T[] => {
  const index = array.findIndex(x => x === item);
  array.splice(index, 1);
  return array;
};
