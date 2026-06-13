-- Register greenhouse-dt module in the marketplace.
-- Schema: marketplace_modules(id, name, display_name, description, metadata, ...)
-- Apply via:
--   PGPOD=$(kubectl get pods -n nekazari -l app=postgresql -o jsonpath='{.items[0].metadata.name}')
--   kubectl exec -n nekazari $PGPOD -- psql -U postgres -d nekazari -f /tmp/registration.sql

INSERT INTO marketplace_modules (
  id, name, display_name, description, category,
  metadata, is_active, version
) VALUES (
  'greenhouse-dt',
  'greenhouse-dt',
  'Greenhouse Digital Twin',
  'Monitorización en tiempo real de invernaderos con visualización 3D, alertas fitopatológicas y automatización predictiva',
  'monitoring',
  jsonb_build_object(
    'version', '0.1.0',
    'icon', 'sprout',
    'setup_parcel_url', 'http://greenhouse-dt-backend:8420/api/internal/setup-parcel',
    'entity_types', jsonb_build_array('AgriGreenhouse', 'AgriSensor', 'Alert'),
    'capabilities', jsonb_build_array(
      '3d_visualization',
      'phytopathology_alerts',
      'time_machine',
      'predictive_automation'
    ),
    'slots', jsonb_build_object(
      'map-layer', jsonb_build_array(jsonb_build_object(
        'id', 'greenhouse-dt-map-layer',
        'priority', 10,
        'showWhen', jsonb_build_object('entityType', jsonb_build_array('AgriGreenhouse'))
      )),
      'context-panel', jsonb_build_array(jsonb_build_object(
        'id', 'greenhouse-dt-context-panel',
        'priority', 10,
        'showWhen', jsonb_build_object('entityType', jsonb_build_array('AgriGreenhouse'))
      )),
      'bottom-panel', jsonb_build_array(jsonb_build_object(
        'id', 'greenhouse-dt-time-machine',
        'priority', 10,
        'showWhen', jsonb_build_object('entityType', jsonb_build_array('AgriGreenhouse'))
      ))
    )
  ),
  true,
  '0.1.0'
) ON CONFLICT (id) DO UPDATE SET
  metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active,
  version = EXCLUDED.version;
