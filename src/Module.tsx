import { defineModule } from '@nekazari/module-kit';
import { lazy } from 'react';
import './i18n';
import { moduleSlots } from './slots';

const MainPage = lazy(() => import('./App'));

export default defineModule({
  id: 'greenhouse-dt',
  displayName: 'Greenhouse Digital Twin',
  version: '0.1.0',
  hostApiVersion: '^2.0.0',
  description: 'Monitorización y control de invernaderos con Digital Twin',
  accent: { base: '#059669', soft: '#D1FAE5', strong: '#047857' },
  icon: 'sprout',
  main: MainPage,
  slots: moduleSlots as never,
});
