# Greenhouse Digital Twin — nkz-module-greenhouse-dt

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![FIWARE](https://img.shields.io/badge/FIWARE-NGSI--LD-orange)](https://fiware.github.io/data-models/)
[![Nekazari](https://img.shields.io/badge/Nekazari-Module-6366f1)](https://github.com/nkz-os)

Módulo de **Digital Twin para invernaderos** de la plataforma [Nekazari](https://nekazari.robotika.cloud). Proporciona monitorización 3D en tiempo real, alertas fitopatológicas predictivas, máquina del tiempo forense y control predictivo (auto-pilot) para AgriGreenhouses.

---

## Funcionalidades

### Fase 1 — MVP ✅
- **Visualización 3D en Cesium** — Estructura del invernadero semitransparente con puntos de sensor coloreados por temperatura, integrada en el Unified Viewer vía slot `map-layer`
- **Panel de estado en tiempo real** — Temperatura, humedad, VPD, alertas activas y agregados por zona en el slot `context-panel`
- **API REST** — CRUD de entidades `AgriGreenhouse`, estado agregado por sensores, consulta de alertas
- **Activación de parcela** — Flujo `POST /api/internal/setup-parcel` conforme al contrato de `entity-manager`
- **Traducciones** — Español e inglés (32 claves cada uno)

### Fase 2 — Alertas Fitopatológicas 🚧
- Worker patológico (Celery) que monitoriza leaf wetness vía subscripción NGSI-LD
- Creación automática de entidades `Alert` con severidad (low/medium/high/critical)
- Notificaciones push

### Fase 3 — Máquina del Tiempo 🚧
- Reconstrucción de interpolación termodinámica desde TimescaleDB
- Generación de COG heatmaps para superposición en Cesium
- Timeline interactivo en el slot `bottom-panel`

### Fase 4 — Auto-Pilot 🚧
- MPC con lookahead de 2 horas usando surrogate model (ONNX)
- Comandos idempotentes al IoT Agent (ventilación, sombreo, riego)
- Guardarraíles validados contra `tenant_limits`

---

## Arquitectura

```
┌─────────────────────────────────────────────┐
│              Unified Viewer (Cesium)         │
│  map-layer ── shell semitransparente + sensores │
│  context-panel ── estado + alertas + VPD       │
│  entity-tree ── Agrilistado de Greenhouses      │
└──────────────────────┬──────────────────────┘
                       │
              api-gateway (X-Tenant-ID)
                       │
         ┌─────────────┴─────────────┐
         │                           │
   greenhouse-bff              entity-manager
   (FastAPI, :8430)           (activación)
         │
    ┌────┴────┐           ┌──────────┐
    │ Celery  │           │ Orion-LD │
    │ workers │◄──────────│ Context  │
    │(v2-4)   │           │ Broker   │
    └─────────┘           └────┬─────┘
                               │
                          IoT Agent
                          (MQTT)
```

### Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, TypeScript, CesiumJS, Module Federation 2.0 |
| Backend | Python 3.12, FastAPI, nkz-platform-sdk |
| Workers | Celery + Redis (Fases 2-4) |
| Context Broker | Orion-LD (FIWARE NGSI-LD) |
| Base de datos | TimescaleDB (series temporales), PostgreSQL (admin_platform) |
| Almacenamiento | MinIO (modelos 3D, COG heatmaps) |
| Contenedores | Docker, GitHub Container Registry |
| Infra | Kubernetes, ArgoCD |

---

## Modelo de Datos (FIWARE Smart Data Models)

### AgriGreenhouse

```jsonld
{
  "id": "urn:ngsi-ld:AgriGreenhouse:greenhouse-42",
  "type": "AgriGreenhouse",
  "name": {"type": "Property", "value": "Invernadero Norte"},
  "location": {"type": "GeoProperty", "value": {
    "type": "Polygon",
    "coordinates": [[[lon,lat], ...]]
  }},
  "hasAgriParcel": {
    "type": "Relationship",
    "object": ["urn:ngsi-ld:AgriParcel:gh-42-zone-NO", "..."]
  },
  "refAgriFarm": {
    "type": "Relationship",
    "object": "urn:ngsi-ld:AgriFarm:farm-1"
  },
  "coverType": {"type": "Property", "value": "polyethylene"},
  "area": {"type": "Property", "value": 500, "unitCode": "MTK"},
  "orientation": {"type": "Property", "value": "N-S"}
}
```

### Relaciones

| Entidad | Relación | Destino | Estándar |
|---------|----------|---------|----------|
| `AgriGreenhouse` | `hasAgriParcel` | `AgriParcel` (zonas) | SDM |
| `AgriGreenhouse` | `refAgriFarm` (legacy) → `hasAgriFarm` | `AgriFarm` | SDM |
| `AgriParcel` (zona) | `refAgriGreenhouse` (legacy) → `hasAgriGreenhouse` | `AgriGreenhouse` | SDM |
| `AgriSensor` | `refAgriParcel` (legacy) → `hasAgriParcel` | `AgriParcel` (zona) | SDM |
| `AgriSensor` | `hasDevice` | `Device` | SDM |
| `Alert` | `alertSource` | `AgriGreenhouse` | SDM |

> **Nota:** Las relaciones `ref<Type>` son legacy. El módulo consulta tanto nombres nuevos como antiguos para compatibilidad durante la migración. El código nuevo usa nombres SDM estándar (`hasAgriParcel`, `hasDevice`, `hasAgriGreenhouse`).

---

## Multitenancy

El módulo es **estrictamente multitenant**. Todas las operaciones se realizan en el contexto del tenant autenticado:

- Cada petición lleva `X-Tenant-ID` inyectado por el api-gateway
- `OrionClient(tenant_id)` del SDK inyecta automáticamente `NGSILD-Tenant` y `Fiware-Service`
- El endpoint `/internal/setup-parcel` se autentica con `X-Internal-Service-Secret` (no JWT de tenant)
- Los límites de seguridad se validan contra `admin_platform.tenant_limits` (Fase 4)

---

## API

### Endpoints Públicos (con autenticación de tenant)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/greenhouse` | Listar greenhouses del tenant |
| `GET` | `/api/greenhouse/{id}` | Detalle de greenhouse |
| `POST` | `/api/greenhouse` | Crear greenhouse |
| `DELETE` | `/api/greenhouse/{id}` | Eliminar greenhouse |
| `GET` | `/api/greenhouse/{id}/state` | Estado agregado por zonas |
| `GET` | `/api/greenhouse/{id}/alerts` | Alertas activas |

### Endpoints Internos (solo entity-manager)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/internal/setup-parcel` | Activar módulo para una parcela |

---

## Desarrollo

```bash
# Backend
cd backend
pip install -r requirements.txt
POSTGRES_URL="postgresql://..." INTERNAL_SERVICE_SECRET="..." uvicorn app.main:app --port 8430 --reload

# Frontend
pnpm install
pnpm run dev
```

### Tests

```bash
POSTGRES_URL="postgresql://test:test@localhost:5432/test" \
INTERNAL_SERVICE_SECRET="test-secret" \
python -m pytest backend/tests/ -v
```

---

## Despliegue

### Base de datos

Registrar el módulo en el marketplace:

```bash
PGPOD=$(kubectl get pods -n nekazari -l app=postgresql -o jsonpath='{.items[0].metadata.name}')
kubectl cp k8s/registration.sql nekazari/$PGPOD:/tmp/
kubectl exec -n nekazari $PGPOD -- psql -U postgres -d admin_platform -f /tmp/registration.sql
```

### K8s

```bash
kubectl apply -f k8s/
```

### CI/CD

El workflow `.github/workflows/build-push.yml` publica automáticamente el frontend en MinIO vía OIDC y la imagen backend en GHCR al pushear a `main`.

---

## Licencia

**GNU Affero General Public License v3.0** — ver [LICENSE](LICENSE).

Copyright 2026 nkz-os.

Este módulo se distribuye con la esperanza de que sea útil, pero SIN GARANTÍA ALGUNA; sin siquiera la garantía implícita de COMERCIABILIDAD o IDONEIDAD PARA UN PROPÓSITO PARTICULAR.

---

## Atribuciones

- [FIWARE](https://www.fiware.org) — Context Broker y Smart Data Models
- [CesiumJS](https://cesium.com/platform/cesiumjs/) — Visualización 3D geoespacial
- [Nekazari Platform](https://nekazari.robotika.cloud) — Plataforma agrotech de código abierto
