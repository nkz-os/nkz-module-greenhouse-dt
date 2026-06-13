---
title: "Greenhouse Digital Twin"
description: "Monitorización y Digital Twin de invernaderos con sensores IoT, alertas fitopatológicas y visualización 3D en CesiumJS."
sidebar:
  order: 1
---

# Greenhouse Digital Twin — nkz-module-greenhouse-dt

Módulo de [Nekazari Platform](https://nekazari.robotika.cloud) que proporciona un **Digital Twin para invernaderos** con monitorización en tiempo real, alertas predictivas y visualización 3D geoespacial.

## Funcionalidades

### Fase 1 — MVP ✅
- **Visualización 3D en CesiumJS** — Estructura semitransparente del invernadero con puntos de sensor coloreados por temperatura
- **Panel de estado contextual** — Temperatura, humedad, VPD, alertas activas y agregados por zona
- **API REST** — CRUD de entidades `AgriGreenhouse`, estado agregado por sensores, consulta de alertas
- **Activación de parcela** — Flujo `POST /api/internal/setup-parcel` con entity-manager
- **Traducciones** — Español e inglés completas

### Fase 2 — Alertas Fitopatológicas 🚧
- Worker Celery que monitoriza leaf wetness vía suscripción NGSI-LD
- Creación automática de entidades `Alert` con severidad (low/medium/high/critical)
- Evaluación de Botrytis cinerea y mildiu basada en umbrales de temperatura + horas de humedad foliar

### Fase 3 — Máquina del Tiempo 🚧
- Reconstrucción de interpolación termodinámica desde TimescaleDB
- Generación de COG heatmaps + PNG display para Cesium
- Timeline interactivo con slider temporal

### Fase 4 — Auto-Pilot 🚧
- MPC con lookahead para control predictivo (ventilación, sombreo, riego)
- Comandos idempotentes vía IoT Agent

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, TypeScript, CesiumJS, Module Federation 2.0 |
| Backend | Python 3.12, FastAPI, nkz-platform-sdk |
| Workers | Celery + Redis |
| Context Broker | Orion-LD (FIWARE NGSI-LD) |
| DB | TimescaleDB (series), PostgreSQL (admin_platform) |
| Storage | MinIO (COG heatmaps, modelos 3D) |

## Licencia

GNU Affero General Public License v3.0 — ver [LICENSE](../LICENSE).
