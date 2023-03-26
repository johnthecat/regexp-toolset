export type GraphNode<T> = {
  level: number;
  value: T;
  children: Set<GraphNode<T>>;
};

export class Graph<T> {
  private map = new Map<T, GraphNode<T>>();

  constructor(...nodes: T[]) {
    for (const node of nodes) {
      this.add(node);
    }
  }

  add(value: T): GraphNode<T> {
    const existingValue = this.map.get(value);
    if (existingValue) {
      return existingValue;
    }
    const node: GraphNode<T> = {
      value,
      level: 0,
      children: new Set(),
    };
    this.map.set(value, node);
    return node;
  }

  addChild(parent: T, child: T): GraphNode<T> {
    const parentNode = this.add(parent);
    const childNode = this.add(child);
    childNode.level = parentNode.level;
    this.bfs(childNode.value, x => (x.level += 1));
    parentNode.children.add(childNode);
    return childNode;
  }

  bfs(start: T, fn: (node: GraphNode<T>) => unknown) {
    const startNode = this.getNodeOrThrow(start);
    const queue: GraphNode<T>[] = [startNode];
    const visited = new Map<GraphNode<T>, boolean>();

    while (queue.length) {
      const currentNode = queue.shift();
      if (!currentNode) {
        break;
      }

      fn(currentNode);
      for (const child of currentNode.children) {
        if (visited.get(child)) {
          continue;
        }
        visited.set(child, true);
        queue.push(child);
      }
    }
  }

  private getNodeOrThrow(key: T): GraphNode<T> {
    const node = this.map.get(key);
    if (!node) {
      throw new Error(`Node ${JSON.stringify(key)} not found.`);
    }
    return node;
  }
}
