export type LintedListNode<LocalValue extends object, NextValues extends object = LocalValue> = LocalValue extends any
  ? LocalValue & {
      index: number;
      next(): LintedListNode<NextValues, NextValues> | null;
      __linkedListValue?: LocalValue | undefined;
    }
  : never;

export class LazyLinkedList<Value extends object> {
  private length = 0;
  private rootNode: LintedListNode<Value> | null = null;
  private lastNode: LintedListNode<Value> | null = null;

  private cache: WeakMap<LintedListNode<Value>, LintedListNode<Value> | null> = new WeakMap();

  constructor(private valueFactory: () => Value | null) {}

  private next(prevNode: LintedListNode<Value>) {
    let nextNode = this.cache.get(prevNode) ?? null;
    if (!nextNode) {
      nextNode = this.createNode(this.valueFactory());
      this.cache.set(prevNode, nextNode);
    }
    return nextNode;
  }

  private createNode(value: Value | null): LintedListNode<Value> | null {
    if (value === null) {
      return null;
    }

    // @ts-expect-error
    const node: LintedListNode<Value> = {
      ...value,
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
