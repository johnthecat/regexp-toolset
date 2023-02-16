# Ecma-262 RegExp parser

RegExp Parser, implemented according to [Specification](https://tc39.es/ecma262/#sec-patterns).



## How to generate contract

### Requirements
- `Node >= 16`
- `Typescript >= 4.9`

### Installation
  ```bash
  npm i ecma-262-spec-compliant-regexp-parser --save
  ```

### Usage

#### Node.js

```js
import { parseRegexp } from 'ecma-262-spec-compliant-regexp-parser';
```

#### CLI
You can use parser as a cli for analyze or storing parser result for later use.
AST always outputs into `stdout`, so you should pipe it to desired file.
```sh
npx parse-regexp "/[A-z]+/" > ./regexp-ast.json
```
##### options
  * `-f, --format`, adds indent into JSON for readability.
