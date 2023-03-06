export type LintedListNode<Value extends object> = Value & {
  index: number;
  prev(): LintedListNode<Value>;
  next(): LintedListNode<Value> | null;
  __linkedListValue?: Value | undefined;
};

export class LazyDoublyLinkedList<Value extends object> {
  private length = 0;
  private rootNode: LintedListNode<Value> | null = null;
  private lastNode: LintedListNode<Value> | null = null;

  private forwardCache: WeakMap<LintedListNode<Value>, LintedListNode<Value> | null> = new WeakMap();
  private backwardCache: WeakMap<LintedListNode<Value>, LintedListNode<Value> | null> = new WeakMap();

  constructor(private valueFactory: () => Value | null) {}

  private next(prevNode: LintedListNode<Value>) {
    let nextNode = this.forwardCache.get(prevNode) ?? null;
    if (!nextNode) {
      nextNode = this.createNode(this.valueFactory());
      this.forwardCache.set(prevNode, nextNode);
    }
    return nextNode;
  }

  private prev(node: LintedListNode<Value>) {
    const prevNode = this.backwardCache.get(node);
    if (!prevNode) {
      throw new Error('There is not previous node');
    }
    return prevNode;
  }

  private createNode(value: Value | null): LintedListNode<Value> | null {
    if (value === null) {
      return null;
    }

    const node = {
      ...value,
      index: this.length,
      next: () => this.next(node),
      prev: () => this.prev(node),
    } as LintedListNode<Value>;

    if (this.lastNode) {
      this.backwardCache.set(node, this.lastNode);
    }

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
