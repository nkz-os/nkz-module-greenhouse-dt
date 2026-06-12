/**
 * Generate dist/manifest.json for Module Federation 2.0.
 * Describes module metadata and slots for the host and entity-manager.
 *
 * Called after vite build as: node tools/generate-manifest.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Read package.json for module metadata
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

// Read the built mf-manifest.json to extract slot metadata
const mfPath = resolve(ROOT, 'dist', 'mf-manifest.json');
const mf = existsSync(mfPath) ? JSON.parse(readFileSync(mfPath, 'utf8')) : {};

// Extract exposed component names from mf-manifest
const exposes = mf.exposes || {};
const slots = {};

// Map known slot types from our module
// These match what Module.tsx + slots/index.ts define
const knownSlots = {
  'map-layer': [{ id: 'greenhouse-dt-map-layer', priority: 10, showWhen: { entityType: ['AgriGreenhouse'] } }],
  'context-panel': [{ id: 'greenhouse-dt-context-panel', priority: 10, showWhen: { entityType: ['AgriGreenhouse'] } }],
  'bottom-panel': [{ id: 'greenhouse-dt-time-machine', priority: 10, showWhen: { entityType: ['AgriGreenhouse'] } }],
};

const manifest = {
  id: 'greenhouse-dt',
  displayName: 'Greenhouse Digital Twin',
  version: pkg.version || '0.1.0',
  hostApiVersion: '^2.0.0',
  description: 'Monitorización y control de invernaderos con Digital Twin',
  accent: { base: '#059669', soft: '#D1FAE5', strong: '#047857' },
  icon: 'sprout',
  slots: knownSlots,
  // Data manifest for API gateway enforcement
  data: {
    entities: ['AgriGreenhouse', 'AgriSensor', 'Alert', 'AgriParcel'],
    timeseries: ['temperature', 'relativeHumidity', 'humidity', 'leafWetness', 'solarIrradiance', 'co2', 'par'],
  },
};

writeFileSync(resolve(ROOT, 'dist', 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Generated dist/manifest.json');
