import type { AnyToken } from './entities.js';

export class LinkedListNode<Value extends AnyToken = AnyToken, Siblings extends AnyToken = Value> {
  public readonly kind: Value['kind'];
  public readonly value: Value['value'];
  public readonly start: number;
  public readonly end: number;

  constructor(
    value: Value,
    private _next: (x: LinkedListNode<Value>) => LinkedListNode<Siblings> | null,
    private _prev: (x: LinkedListNode<Value>) => LinkedListNode<Siblings>,
  ) {
    this.kind = value.kind;
    this.value = value.value;
    this.start = value.start;
    this.end = value.end;
  }

  next(): LinkedListNode<Siblings> | null {
    return this._next(this);
  }

  prev(): LinkedListNode<Siblings> {
    return this._prev(this);
  }
}

export class LazyTokenLinkedList<Value extends AnyToken> {
  private rootNode: LinkedListNode<Value> | null = null;
  private lastNode: LinkedListNode<Value> | null = null;

  private forwardCache: WeakMap<LinkedListNode<Value>, LinkedListNode<Value> | null> = new WeakMap();
  private backwardCache: WeakMap<LinkedListNode<Value>, LinkedListNode<Value> | null> = new WeakMap();

  private next = (prevNode: LinkedListNode<Value>) => {
    let nextNode = this.forwardCache.get(prevNode);
    if (!nextNode) {
      nextNode = this.createNode(this.valueFactory());
      this.forwardCache.set(prevNode, nextNode);
    }
    return nextNode;
  };

  private prev = (node: LinkedListNode<Value>) => {
    const prevNode = this.backwardCache.get(node);
    if (!prevNode) {
      throw new Error('There is not previous node');
    }
    return prevNode;
  };

  constructor(private valueFactory: () => Value | null) {}

  private createNode(value: Value | null): LinkedListNode<Value> | null {
    if (value === null) {
      return null;
    }

    const node = new LinkedListNode(value, this.next, this.prev);

    if (this.lastNode) {
      this.backwardCache.set(node, this.lastNode);
    }

    if (this.rootNode === null) {
      this.rootNode = node;
    }

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
