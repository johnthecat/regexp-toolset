export type Lens<S, A> = (f: (y: A) => A, x: S) => S;
export const view =
  <S, A>(lens: Lens<S, A>) =>
  (x: S) => {
    let variable: unknown = null;
    lens(x => (variable = x), x);
    return variable as A;
  };

export const set =
  <S, A>(lens: Lens<S, A>) =>
  (x: S, v: A) =>
    lens(() => v, x);
