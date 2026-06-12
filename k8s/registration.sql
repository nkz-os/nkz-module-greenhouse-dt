-- k8s/registration.sql
-- Register greenhouse-dt module in the marketplace.
-- Apply via: PGPOD=$(kubectl get pods -n nekazari -l app=postgresql -o jsonpath='{.items[0].metadata.name}')
-- kubectl exec -n nekazari $PGPOD -- psql -U postgres -d admin_platform -f /tmp/registration.sql

INSERT INTO marketplace_modules (
  module_id, name, description, category,
  metadata, is_active, created_at
) VALUES (
  'greenhouse-dt',
  '{"en": "Greenhouse Digital Twin", "es": "Digital Twin de Invernadero"}',
  '{"en": "Real-time greenhouse monitoring with 3D visualization, phytopathology alerts, and predictive automation", "es": "Monitorización en tiempo real de invernaderos con visualización 3D, alertas fitopatológicas y automatización predictiva"}',
  'monitoring',
  jsonb_build_object(
    'version', '0.1.0',
    'icon', 'Sprout',
    'min_platform_version', '2.0.0',
    'setup_parcel_url', 'http://greenhouse-dt-backend:8420/api/internal/setup-parcel',
    'entity_types', jsonb_build_array('AgriGreenhouse', 'AgriSensor', 'Alert'),
    'capabilities', jsonb_build_array(
      '3d_visualization',
      'phytopathology_alerts',
      'time_machine',
      'predictive_automation'
    )
  ),
  true,
  NOW()
) ON CONFLICT (module_id) DO UPDATE SET
  metadata = EXCLUDED.metadata,
  is_active = EXCLUDED.is_active;
