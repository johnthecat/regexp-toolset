import { builtinModules } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

const externals = () => {
  const packageJson = JSON.parse(readFileSync(resolve('./package.json'), { encoding: 'utf-8' }));

  return [
    ...builtinModules,
    ...builtinModules.map(x => `node:${x}`),
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ];
};

const config = defineConfig({
  build: {
    reportCompressedSize: true,
    lib: {
      entry: './src/index.ts',
      fileName: 'index',
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: externals(),
    },
  },
  plugins: [
    dts({
      noEmitOnError: true,
      copyDtsFiles: true,
      include: ['./src/**'],
    }),
  ],
  test: {
    testTimeout: 3000,
    reporters: ['verbose'],
    coverage: {
      provider: 'c8',
      reporter: ['html'],
      reportsDirectory: './.coverage',
    },
  },
});

export default config;
