import { describe, it, expect } from 'vitest';
import moduleDef from '../Module';

describe('greenhouse-dt module definition', () => {
  it('exports a valid definition with id === "greenhouse-dt"', () => {
    expect(moduleDef).toBeDefined();
    expect(moduleDef.id).toBe('greenhouse-dt');
  });

  it('has data manifest with entities and timeseries', () => {
    expect(moduleDef.data).toBeDefined();
    expect(moduleDef.data!.entities).toEqual([
      'AgriGreenhouse',
      'AgriSensor',
      'Alert',
      'AgriParcel',
    ]);
    expect(moduleDef.data!.timeseries).toEqual([
      'temperature',
      'relativeHumidity',
      'humidity',
      'leafWetness',
      'solarIrradiance',
      'co2',
      'par',
    ]);
  });

  it('has all three slot definitions (map-layer, context-panel, bottom-panel)', () => {
    expect(moduleDef.slots).toBeDefined();
    expect(moduleDef.slots).toHaveProperty('map-layer');
    expect(moduleDef.slots).toHaveProperty('context-panel');
    expect(moduleDef.slots).toHaveProperty('bottom-panel');

    expect(Array.isArray(moduleDef.slots!['map-layer'])).toBe(true);
    expect(Array.isArray(moduleDef.slots!['context-panel'])).toBe(true);
    expect(Array.isArray(moduleDef.slots!['bottom-panel'])).toBe(true);

    expect(moduleDef.slots!['map-layer']!.length).toBeGreaterThan(0);
    expect(moduleDef.slots!['context-panel']!.length).toBeGreaterThan(0);
    expect(moduleDef.slots!['bottom-panel']!.length).toBeGreaterThan(0);

    // Validate slot item structure
    const firstLayer = moduleDef.slots!['map-layer']![0];
    expect(firstLayer).toHaveProperty('id');
    expect(firstLayer).toHaveProperty('localComponent');

    const firstPanel = moduleDef.slots!['context-panel']![0];
    expect(firstPanel).toHaveProperty('id');
    expect(firstPanel).toHaveProperty('localComponent');
  });
});
