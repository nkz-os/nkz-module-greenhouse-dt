import { defineModule } from '@nekazari/sdk';

export default defineModule({
  id: 'greenhouse-dt',
  name: 'Greenhouse Digital Twin',
  version: '0.1.0',
  description: 'Monitorización y control de invernaderos con Digital Twin',
  data: {
    entities: [
      'AgriGreenhouse',
      'AgriSensor',
      'Alert',
      'AgriParcel',
    ],
    timeseries: [
      'temperature',
      'relativeHumidity',
      'humidity',
      'leafWetness',
      'solarIrradiance',
      'co2',
      'par',
    ],
  },
  viewerSlots: () => import('./slots/index'),
});
