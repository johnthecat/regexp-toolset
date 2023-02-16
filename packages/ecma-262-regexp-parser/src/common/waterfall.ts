export const waterfall = <T extends ((...args: any[]) => any)[]>(list: T): T[number] => {
  return (...args) => {
    for (let index = 0; index < list.length; index++) {
      const fn = list[index];
      if (!fn) {
        continue;
      }

      const result = fn(...args);
      if (result !== void 0 && result !== null) {
        return result;
      }
    }

    return null;
  };
};
