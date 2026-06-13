# Greenhouse DT — Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate `nkz-module-greenhouse-dt` to production-ready SOTA (State of the Art) quality — security, robustness, test coverage, docs.

**Architecture:** 5 sequential blocks, each self-contained: infra/security fixes → backend hardening → frontend polish → template cleanup → docs/CI. Each block is independently testable.

**Tech Stack:** FastAPI, nkz-platform-sdk, React 18 + CesiumJS, Celery, K8s, GitHub Actions OIDC, Vitest

---

## File Structure Map

### Files to MODIFY:
| File | Change |
|------|--------|
| `src/Module.tsx` | Add `data` manifest to `defineModule` |
| `backend/app/core/orion.py` | Add `hasAgriGreenhouse` to `build_zone_entity` |
| `k8s/backend-deployment.yaml` | Add `CELERY_BROKER_URL` + `REDIS_PASSWORD` env vars |
| `backend/app/api/notify.py` | Make `_extract_greenhouse_id` robust to any parcel naming |
| `src/App.tsx` | Switch imports to `@nekazari/sdk` |
| `src/slots/greenhouse-shell.tsx` | Add Cesium import fallback |
| `frontend/Dockerfile` | Replace `MODULE_DISPLAY_NAME` references |
| `docker-compose.yml` | Replace placeholder values |
| `docs/index.md` | Write real documentation |
| `backend/tests/test_api.py` | Fix settings mutation, add worker auth tests |
| `backend/app/config.py` | Add Redis auth env vars for Celery |

### Files to CREATE:
| File | Purpose |
|------|---------|
| `src/__tests__/Module.test.tsx` | Basic smoke test for module definition |
| `src/__tests__/TimeMachine.test.tsx` | Test timeline context logic |
| `src/__tests__/ContextPanel.test.tsx` | Test panel rendering |
| `backend/tests/test_subscriptions.py` | Test subscription creation logic |
| `docs/architecture.md` | Real architecture documentation |
| `docs/api.md` | API reference documentation |

### Files to REMOVE:
| File | Reason |
|------|--------|
| `src/slots/entity-tree.tsx` | Placeholder returning null — create real implementation or remove |
| `scripts/init-module.sh` | Template scaffolding script, not needed in production module |

---

## Block 1: Security & Infra (CRITICAL)

### Task 1.1: Add `data` manifest to `defineModule`

**Files:**
- Modify: `src/Module.tsx`
- Test: `src/__tests__/Module.test.tsx`

- [ ] **Step 1: Add data manifest to Module.tsx**

Edit `src/Module.tsx` to add `data` property:

```typescript
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
  data: {
    entities: ['AgriGreenhouse', 'AgriSensor', 'Alert', 'AgriParcel'],
    timeseries: ['temperature', 'relativeHumidity', 'humidity', 'leafWetness', 'solarIrradiance', 'co2', 'par'],
  },
});
```

- [ ] **Step 2: Write Module.test.tsx smoke test**

Create `src/__tests__/Module.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import moduleDef from '../Module';

describe('Module definition', () => {
  it('exports a valid module definition', () => {
    expect(moduleDef).toBeDefined();
    expect(moduleDef.id).toBe('greenhouse-dt');
  });

  it('has data manifest for api-gateway enforcement', () => {
    expect(moduleDef.data).toBeDefined();
    expect(moduleDef.data!.entities).toContain('AgriGreenhouse');
    expect(moduleDef.data!.timeseries).toContain('temperature');
  });

  it('has all slot definitions', () => {
    expect(moduleDef.slots).toBeDefined();
    expect(moduleDef.slots).toHaveProperty('map-layer');
    expect(moduleDef.slots).toHaveProperty('context-panel');
    expect(moduleDef.slots).toHaveProperty('bottom-panel');
  });
});
```

- [ ] **Step 3: Add vitest config for frontend tests**

Create/update vitest config. Check if `vitest.config.ts` exists:

Run: `ls /home/g/Documents/nekazari/nkz-module-greenhouse-dt/vitest.config.ts 2>/dev/null || echo "not found"`

If not found, add vitest config to `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import { nkzModulePreset } from '@nekazari/module-builder';

export default defineConfig(
  nkzModulePreset({
    moduleId: 'greenhouse-dt',
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/__tests__/setup.ts'],
    },
  }),
);
```

Create `src/__tests__/setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Run frontend tests to verify**

Run: `cd /home/g/Documents/nekazari/nkz-module-greenhouse-dt && pnpm run test`
Expected: tests pass (or at least typecheck + vitest run succeed)

- [ ] **Step 5: Commit**

```bash
git add src/Module.tsx src/__tests__/ vitest.config.ts src/__tests__/
git commit -m "fix: add data manifest to defineModule for api-gateway enforcement"
```

### Task 1.2: Add `hasAgriGreenhouse` relationship to zone entity

**Files:**
- Modify: `backend/app/core/orion.py`
- Test: backend tests pass

- [ ] **Step 1: Add `hasAgriGreenhouse` alongside legacy `refAgriGreenhouse`**

Edit `backend/app/core/orion.py`, function `build_zone_entity`:

Old:
```python
entity = {
    "@context": settings.context_url,
    "id": f"urn:ngsi-ld:AgriParcel:{zone_id}",
    "type": "AgriParcel",
    "name": {"type": "Property", "value": name},
    "refAgriGreenhouse": {  # Legacy — will be migrated to hasAgriGreenhouse
        "type": "Relationship",
        "object": f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}",
    },
}
```

New:
```python
entity = {
    "@context": settings.context_url,
    "id": f"urn:ngsi-ld:AgriParcel:{zone_id}",
    "type": "AgriParcel",
    "name": {"type": "Property", "value": name},
    "refAgriGreenhouse": {  # Legacy — kept for backward compat during migration
        "type": "Relationship",
        "object": f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}",
    },
    "hasAgriGreenhouse": {  # SDM standard (FIWARE Relationship Naming)
        "type": "Relationship",
        "object": f"urn:ngsi-ld:AgriGreenhouse:{greenhouse_id}",
    },
}
```

- [ ] **Step 2: Run backend tests**

Run: `cd /home/g/Documents/nekazari/nkz-module-greenhouse-dt && POSTGRES_URL="postgresql://test:test@localhost:5432/test" INTERNAL_SERVICE_SECRET="test-secret" python3 -m pytest backend/tests/ -v`

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/app/core/orion.py
git commit -m "fix: add hasAgriGreenhouse SDM relationship alongside legacy refAgriGreenhouse"
```

### Task 1.3: Fix Celery broker auth in backend deployment

**Files:**
- Modify: `k8s/backend-deployment.yaml`
- Modify: `k8s/worker-deployment.yaml`

- [ ] **Step 1: Add Redis auth env vars to backend-deployment.yaml**

Add after existing env block in `k8s/backend-deployment.yaml`:

```yaml
            - name: REDIS_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: redis-secret
                  key: password
            - name: CELERY_BROKER_URL
              value: "redis://:$(REDIS_PASSWORD)@redis-service:6379/1"
            - name: CELERY_BACKEND_URL
              value: "redis://:$(REDIS_PASSWORD)@redis-service:6379/2"
```

Also add to `backend/app/config.py` to support separate broker/backend URL env vars (already supported via pydantic BaseSettings — the fields `celery_broker_url` and `celery_backend_url` are read from env. But verify the worker env var names match).

Check that worker-deployment also has `CELERY_BROKER_URL` and `CELERY_BACKEND_URL` set correctly (it does, but verify):

The worker-deployment currently sets:
- `CELERY_BROKER_URL: redis://:$(REDIS_PASSWORD)@redis-service:6379/1`
- `CELERY_BACKEND_URL: redis://:$(REDIS_PASSWORD)@redis-service:6379/2`

This is correct and matches what config.py reads (CELERY_BROKER_URL → `celery_broker_url`, CELERY_BACKEND_URL → `celery_backend_url` by pydantic's UPPER_CASE convention).

- [ ] **Step 2: Verify consistency — worker and backend URLs match**

Run: `grep -A2 'CELERY_BROKER_URL\|CELERY_BACKEND_URL' k8s/backend-deployment.yaml k8s/worker-deployment.yaml`
Expected: both deployments set the same values (possibly with `$(REDIS_PASSWORD)` interpolation)

- [ ] **Step 3: Commit**

```bash
git add k8s/backend-deployment.yaml
git commit -m "fix: add Redis auth for Celery broker to backend deployment"
```

---

## Block 2: Backend Hardening

### Task 2.1: Robust `_extract_greenhouse_id` for any zone naming

**Files:**
- Modify: `backend/app/api/notify.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/test_pathological.py`:

```python
class TestExtractGreenhouseId:
    """Test _extract_greenhouse_id for various zone naming patterns."""
    from app.api.notify import _extract_greenhouse_id

    def test_standard_zone_naming(self):
        """zone format {gh_id}-zone-{quadrant}"""
        entity = {
            "hasAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:gh42-zone-NO",
            }
        }
        result = self._extract_greenhouse_id(entity)
        assert result == "gh42"

    def test_direct_parcel_reference(self):
        """Parcel without zone suffix returns None."""
        entity = {
            "hasAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:parcel-001",
            }
        }
        result = self._extract_greenhouse_id(entity)
        assert result is None

    def test_no_relationship(self):
        """Missing relationship returns None."""
        result = self._extract_greenhouse_id({})
        assert result is None

    def test_multiple_zone_dashes(self):
        """Zone IDs with multiple hyphens still parse correctly."""
        entity = {
            "hasAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:my-gh-Zone-A",
            }
        }
        result = self._extract_greenhouse_id(entity)
        assert result == "my-gh"

    def test_legacy_refAgriParcel(self):
        """Legacy relationship name also works."""
        entity = {
            "refAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:gh42-zone-NO",
            }
        }
        result = self._extract_greenhouse_id(entity)
        assert result == "gh42"
```

Wait, the test imports from the module using `from app.api.notify import _extract_greenhouse_id` — this won't work from test file directly. Actually it will, since conftest adds backend/ to sys.path. But the function is imported inside test methods using `self._extract_greenhouse_id` which doesn't set it up. Let me fix the test approach.

Better test:

```python
class TestExtractGreenhouseId:
    def test_standard_zone_naming(self):
        from app.api.notify import _extract_greenhouse_id
        entity = {
            "hasAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:gh42-zone-NO",
            }
        }
        assert _extract_greenhouse_id(entity) == "gh42"

    def test_direct_parcel_reference(self):
        from app.api.notify import _extract_greenhouse_id
        entity = {
            "hasAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:parcel-001",
            }
        }
        assert _extract_greenhouse_id(entity) is None

    def test_no_relationship(self):
        from app.api.notify import _extract_greenhouse_id
        assert _extract_greenhouse_id({}) is None

    def test_multiple_zone_dashes(self):
        from app.api.notify import _extract_greenhouse_id
        entity = {
            "hasAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:my-gh-Zone-A",
            }
        }
        assert _extract_greenhouse_id(entity) == "my-gh"

    def test_legacy_refAgriParcel(self):
        from app.api.notify import _extract_greenhouse_id
        entity = {
            "refAgriParcel": {
                "type": "Relationship",
                "object": "urn:ngsi-ld:AgriParcel:gh42-zone-NO",
            }
        }
        assert _extract_greenhouse_id(entity) == "gh42"
```

- [ ] **Step 2: Run the test to see it fail (current code can't handle multi-dash zones)**

Run: `cd /home/g/Documents/nekazari/nkz-module-greenhouse-dt && POSTGRES_URL="postgresql://test:test@localhost:5432/test" INTERNAL_SERVICE_SECRET="test-secret" python3 -m pytest backend/tests/test_pathological.py::TestExtractGreenhouseId -v`

Expected: test `test_multiple_zone_dashes` fails because `split("-zone-")[0]` on `"my-gh-Zone-A"` returns `"my-gh-Zone"` not `"my-gh"`.

- [ ] **Step 3: Fix `_extract_greenhouse_id`**

Replace the current implementation in `backend/app/api/notify.py`:

Old:
```python
def _extract_greenhouse_id(entity: dict) -> str | None:
    for rel_key in ("hasAgriParcel", "refAgriParcel"):
        rel = entity.get(rel_key, {})
        if not isinstance(rel, dict):
            continue
        parcel_id = rel.get("object", "")
        if not isinstance(parcel_id, str) or not parcel_id:
            continue
        zone_id = parcel_id.split(":")[-1]
        if "-zone-" in zone_id:
            return zone_id.split("-zone-")[0]
        logger.debug("Parcel %s is not a zone entity, skipping greenhouse extraction", zone_id)
        return None
    return None
```

New:
```python
def _extract_greenhouse_id(entity: dict) -> str | None:
    """Extract greenhouse ID from sensor entity via relationships.

    Sensors link to zone parcels via refAgriParcel/hasAgriParcel.
    Zones are named {greenhouse_id}-zone-{quadrant} or similar patterns.
    Uses standardized suffix "-zone-" as delimiter. If the parcel ID doesn't
    match the pattern, returns None (not a zone).
    """
    ZONE_SUFFIX = "-zone-"

    for rel_key in ("hasAgriParcel", "refAgriParcel"):
        rel = entity.get(rel_key, {})
        if not isinstance(rel, dict):
            continue
        parcel_urn = rel.get("object", "")
        if not isinstance(parcel_urn, str) or not parcel_urn:
            continue
        parcel_id = parcel_urn.split(":")[-1]
        zone_idx = parcel_id.lower().find(ZONE_SUFFIX)
        if zone_idx != -1:
            return parcel_id[:zone_idx]
        logger.debug("Parcel %s is not a zone entity (no '%s' found), skipping greenhouse extraction",
                     parcel_id, ZONE_SUFFIX)
        return None
    return None
```

- [ ] **Step 4: Run tests to verify fix**

Run: `cd /home/g/Documents/nekazari/nkz-module-greenhouse-dt && POSTGRES_URL="postgresql://test:test@localhost:5432/test" INTERNAL_SERVICE_SECRET="test-secret" python3 -m pytest backend/tests/test_pathological.py::TestExtractGreenhouseId -v`

Expected: all 5 tests pass

- [ ] **Step 5: Run full backend test suite**

Run: `cd /home/g/Documents/nekazari/nkz-module-greenhouse-dt && POSTGRES_URL="postgresql://test:test@localhost:5432/test" INTERNAL_SERVICE_SECRET="test-secret" python3 -m pytest backend/tests/ -v`

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/notify.py backend/tests/test_pathological.py
git commit -m "fix: robust _extract_greenhouse_id for any zone naming pattern"
```

### Task 2.2: Fix settings mutation in tests

**Files:**
- Modify: `backend/tests/test_api.py`

- [ ] **Step 1: Fix `test_lifespan_fails_without_postgres_url` to not mutate global settings**

Old approach: mutates `settings.postgres_url` globally, which can affect other tests.

Replace with approach that uses `monkeypatch` via pytest fixture or saves/restores properly. Since FastAPI's TestClient doesn't easily support monkeypatch, the simplest fix is to use try/finally with proper restore.

New code for the test:

```python
@pytest.mark.asyncio
async def test_lifespan_fails_without_postgres_url():
    """Lifespan raises RuntimeError if POSTGRES_URL is not set."""
    from app.config import settings

    # Save originals
    orig_url = settings.postgres_url
    orig_secret = settings.internal_service_secret
    try:
        settings.postgres_url = ""
        settings.internal_service_secret = ""
        with pytest.raises(RuntimeError, match="POSTGRES_URL is not set"):
            async with lifespan(app):
                pass
    finally:
        # Restore for other tests
        settings.postgres_url = orig_url
        settings.internal_service_secret = orig_secret
```

This is actually the same code already in the file! Let me re-check...

Looking at the current test:

```python
old_url = settings.postgres_url
old_secret = settings.internal_service_secret
settings.postgres_url = ""
settings.internal_service_secret = ""
try:
    with pytest.raises(RuntimeError, match="POSTGRES_URL is not set"):
        async with lifespan(app):
            pass
finally:
    settings.postgres_url = old_url
    settings.internal_service_secret = old_secret
```

This already has try/finally! OK, so this is fine. The note in the audit was about it being a pattern that could contaminate if settings were used concurrently, but for synchronous tests in a single thread it's actually safe.

So we can skip this task — already correctly implemented.

- [ ] **Step 1: Verify test passes**

Run: `cd /home/g/Documents/nekazari/nkz-module-greenhouse-dt && POSTGRES_URL="postgresql://test:test@localhost:5432/test" INTERNAL_SERVICE_SECRET="test-secret" python3 -m pytest backend/tests/test_api.py::test_lifespan_fails_without_postgres_url -v`

Expected: PASS

### Task 2.3: Add subscription creation tests

**Files:**
- Create: `backend/tests/test_subscriptions.py`

- [ ] **Step 1: Write test for subscription body construction**

```python
"""Tests for NGSI-LD subscription management."""
import pytest
from unittest.mock import AsyncMock, patch

from app.core.subscriptions import _subscription_body, SUBSCRIPTION_DESCRIPTION, NOTIFY_PATH


class TestSubscriptionBody:
    def test_subscription_body_structure(self):
        """Subscription body has correct NGSI-LD structure."""
        callback_url = "http://greenhouse-bff:8430/api/ngsi-ld/notify"
        body = _subscription_body(callback_url)

        assert body["type"] == "Subscription"
        assert body["description"] == SUBSCRIPTION_DESCRIPTION
        assert body["entities"] == [{"type": "AgriSensor"}]
        assert "leafWetness" in body["watchedAttributes"]
        assert "temperature" in body["watchedAttributes"]
        assert "relativeHumidity" in body["watchedAttributes"]
        assert body["notification"]["endpoint"]["uri"] == callback_url
        assert body["notification"]["endpoint"]["accept"] == "application/json"
        assert body["notification"]["format"] == "normalized"
        assert body["throttling"] == 60
        assert body["isActive"] is True

    def test_notify_path_constant(self):
        """NOTIFY_PATH matches the route registered in main.py."""
        assert NOTIFY_PATH == "/api/ngsi-ld/notify"


class TestEnsureSubscription:
    @patch("app.core.subscriptions.OrionClient")
    @pytest.mark.asyncio
    async def test_creates_subscription_when_not_exists(self, mock_orion_cls):
        """ensure_pathological_subscription creates subscription if none exists."""
        mock_client = AsyncMock()
        mock_client.query_subscriptions.return_value = []
        mock_client.create_subscription.return_value = "/ngsi-ld/v1/subscriptions/abc-123"
        mock_orion_cls.return_value = mock_client

        from app.core.subscriptions import ensure_pathological_subscription

        result = await ensure_pathological_subscription("test-tenant")
        assert result == "abc-123"
        mock_client.create_subscription.assert_called_once()

    @patch("app.core.subscriptions.OrionClient")
    @pytest.mark.asyncio
    async def test_skips_when_subscription_exists(self, mock_orion_cls):
        """ensure_pathological_subscription returns None if subscription exists."""
        mock_client = AsyncMock()
        mock_client.query_subscriptions.return_value = [
            {"description": "nkz-module: AgriSensor -> greenhouse-dt (pathological)"}
        ]
        mock_orion_cls.return_value = mock_client

        from app.core.subscriptions import ensure_pathological_subscription

        result = await ensure_pathological_subscription("test-tenant")
        assert result is None
        mock_client.create_subscription.assert_not_called()
```

- [ ] **Step 2: Run tests**

Run: `cd /home/g/Documents/nekazari/nkz-module-greenhouse-dt && POSTGRES_URL="postgresql://test:test@localhost:5432/test" INTERNAL_SERVICE_SECRET="test-secret" python3 -m pytest backend/tests/test_subscriptions.py -v`

Expected: 4 tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_subscriptions.py
git commit -m "test: add subscription creation tests"
```

---

## Block 3: Frontend Polish

### Task 3.1: Switch App.tsx to @nekazari/sdk imports

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace imports in App.tsx**

Old:
```typescript
import { useAuth, useI18n } from '@nekazari/module-kit';
```

New:
```typescript
import { useAuth, useI18n } from '@nekazari/sdk';
```

But wait — `useI18n` might not exist in `@nekazari/sdk`. Let me check what's actually available. Looking at `src/i18n.ts`, it imports `{ i18n }` from `@nekazari/sdk`, so `i18n` is available. But `useI18n` is a React hook that should be in `@nekazari/module-kit` or `@nekazari/sdk`.

Actually, looking at the canonical pattern more carefully: the AGENTS.md says to use `@nekazari/sdk` for platform hooks. But if `useI18n` is not in `@nekazari/sdk`, we should check.

Let me look at what `@nekazari/sdk` exports. Actually, I can check:

```bash
cd /home/g/Documents/nekazari/nkz-module-greenhouse-dt && node -e "const sdk = require('@nekazari/sdk'); console.log(Object.keys(sdk))"
```

But we might not have the package accessible that way. Let me just check the types file.

Actually, the `src/types/nekazari-sdk.d.ts` has type declarations. Let me read it.

Let me just check what's available.<｜end▁of▁thinking｜>

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="read">
<｜｜DSML｜｜parameter name="path" string="true">/home/g/Documents/nekazari/nkz-module-greenhouse-dt/src/types/nekazari-sdk.d.ts