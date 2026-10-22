/**
 * Slot definitions — declare which host slots this module occupies.
 *
 * Each entry follows the canonical Nekazari module slot pattern:
 * { id, component, localComponent, priority, showWhen }
 *
 * Available slot types:
 *   map-layer         — overlay or toolbar button on the 3D map
 *   context-panel     — side panel shown when an entity is selected
 *   bottom-panel      — tabbed panel at the bottom of the viewer
 *   entity-tree       — context menu entry in the entity tree
 */
import GreenhouseMapLayer from './map-layer';
import GreenhouseContextPanel from './context-panel';
import TimeMachine from './time-machine';

const MODULE_ID = 'greenhouse-dt';

export const moduleSlots = {
  'map-layer': [
    {
      id: 'greenhouse-dt-map-layer',
      moduleId: MODULE_ID,
      component: 'GreenhouseMapLayer',
      localComponent: GreenhouseMapLayer,
      priority: 10,
      showWhen: { entityType: ['AgriGreenhouse'] },
    },
  ],
  'context-panel': [
    {
      id: 'greenhouse-dt-context-panel',
      moduleId: MODULE_ID,
      component: 'GreenhouseContextPanel',
      localComponent: GreenhouseContextPanel,
      priority: 10,
      showWhen: { entityType: ['AgriGreenhouse'] },
    },
  ],
  'bottom-panel': [
    {
      id: 'greenhouse-dt-time-machine',
      moduleId: MODULE_ID,
      component: 'TimeMachine',
      localComponent: TimeMachine,
      priority: 10,
      showWhen: { entityType: ['AgriGreenhouse'] },
    },
  ],
};
