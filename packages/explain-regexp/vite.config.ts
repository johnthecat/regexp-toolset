import * as path from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { externals } from 'rollup-plugin-node-externals';

const config = defineConfig({
  build: {
    reportCompressedSize: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      fileName: 'index',
      formats: ['es'],
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
    {
      ...externals(),
      enforce: 'pre',
    },
  ],
});

export default config;
