// src/slots/entity-tree.tsx
/**
 * entity-tree slot widget — adds greenhouse-specific tree items or filters.
 *
 * For MVP, this is minimal. AgriGreenhouse entities already appear in
 * the core entity tree via standard NGSI-LD entity query.
 * Phase 2 will add zone-level tree expansion.
 */

import React from 'react';

const GreenhouseEntityTree: React.FC = () => {
  // MVP: minimal — just returns null.
  // The AgriGreenhouse entities already appear in the core entity tree
  // via the standard NGSI-LD entity query.
  // Phase 2 will add zone-level tree items with sensor counts.
  return null;
};

export default GreenhouseEntityTree;
