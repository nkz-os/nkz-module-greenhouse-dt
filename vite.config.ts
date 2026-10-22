import { defineConfig } from 'vite';
import { nkzModulePreset } from '@nekazari/module-builder';

export default defineConfig(
  nkzModulePreset({
    moduleId: 'greenhouse-dt',
    viteConfig: {
      test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/__tests__/setup.ts'],
      },
    },
  }),
);
