// src/slots/entity-tree.tsx
/**
 * entity-tree slot widget — adds greenhouse-specific tree items or filters.
 *
 * For MVP, this is minimal. AgriGreenhouse entities already appear in
 * the core entity tree via standard NGSI-LD entity query.
 * Phase 2 will add zone-level tree expansion.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { SlotWidgetDefinition } from '@nekazari/sdk';

const GreenhouseEntityTree: React.FC = () => {
  const { t } = useTranslation('greenhouse-dt');

  // MVP: minimal — just returns null.
  // The AgriGreenhouse entities already appear in the core entity tree
  // via the standard NGSI-LD entity query.
  // Phase 2 will add zone-level tree items with sensor counts.
  return null;
};

export const greenhouseEntityTree: SlotWidgetDefinition = {
  id: 'greenhouse-dt-entity-tree',
  component: 'GreenhouseEntityTree',
  priority: 20,
};

export default GreenhouseEntityTree;
