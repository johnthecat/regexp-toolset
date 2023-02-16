export type LintedListNode<T, K extends PropertyKey = 'value'> = Record<K, T> & {
  index: number;
  next(): LintedListNode<T, K> | null;
};

export class LazyLinkedList<T, K extends string = 'value'> {
  private length = 0;
  private rootNode: LintedListNode<T, K> | null = null;
  private lastNode: LintedListNode<T, K> | null = null;

  private cache: WeakMap<LintedListNode<T, K>, LintedListNode<T, K> | null> = new WeakMap();

  constructor(private valueFactory: () => [K, T] | null) {}

  private next(prevNode: LintedListNode<T, K>) {
    let nextNode = this.cache.get(prevNode) ?? null;
    if (!nextNode) {
      nextNode = this.createNode(this.valueFactory());
      this.cache.set(prevNode, nextNode);
    }
    return nextNode;
  }

  private createNode(value: [K, T] | null): LintedListNode<T, K> | null {
    if (value === null) {
      return null;
    }

    // @ts-expect-error
    const node: LintedListNode<T, K> = {
      ...{ [value[0]]: value[1] },
      index: this.length,
      next: () => this.next(node),
    };

    if (this.rootNode === null) {
      this.rootNode = node;
    }

    this.length++;
    this.lastNode = node;

    return node;
  }

  getHead() {
    if (!this.rootNode) {
      this.rootNode = this.createNode(this.valueFactory());
    }
    return this.rootNode;
  }

  getTail() {
    if (!this.rootNode) {
      this.rootNode = this.createNode(this.valueFactory());
    }
    return this.lastNode;
  }

  isEmpty(): boolean {
    return !this.rootNode;
  }
}
