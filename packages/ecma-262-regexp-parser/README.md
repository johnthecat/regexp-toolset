# ECMA-262 regexp parser

Regexp Parser, implemented according to [EMCA-262 Specification](https://tc39.es/ecma262/#sec-patterns).
Implemented all syntax constructions from es2022.

## Requirements
- `Typescript >= 4.9`
- `Node.js >= 16`

## Install
```shell
$ npm i ecma-262-regexp-parser --save
```

## API Reference

### `parseRegexp(source: string): RegexpNode`
Returns AST of full regexp expression (e.g. `/Hello!/gm`).
Throws, if got any syntax error.

```typescript
import { parseRegexp } from 'ecma-262-regexp-parser';
const regexpAST = parseRegexp('/[A-z]*/gm');
```

### `parseRegexpNode(source: string): AnyRegexpNode`
Returns AST of any regexp expression (e.g. `(Hello|Hi)!`).
Throws, if got any syntax error.

```typescript
import { parseRegexpNode } from 'ecma-262-regexp-parser';
const regexpAST = parseRegexp('(?:Maybe)\\snot');
```

### `SyntaxKind`
Enum, which describes all possible node types.

