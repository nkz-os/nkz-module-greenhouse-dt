import { defineConfig } from 'vite';
import { nkzModulePreset } from '@nekazari/module-builder';

export default defineConfig({
  presets: [nkzModulePreset({
    moduleId: 'greenhouse-dt',
    expose: {
      './module': './src/Module.tsx',
      './slots': './src/slots/index.ts',
    },
    shared: ['react', 'react-dom', '@nekazari/sdk', 'i18next', 'react-i18next'],
  })],
});
