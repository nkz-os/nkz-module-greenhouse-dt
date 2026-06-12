# backend/app/celery_app.py
"""
Celery application for greenhouse-dt background workers.

Broker/backend use Redis DB 1 and DB 2. The FastAPI BFF imports this module
to send tasks (evaluate_leaf_wetness.delay(...)) and the worker pod imports
it to register and run tasks.
"""

from celery import Celery

from app.config import settings


def _make_celery_app() -> Celery:
    app = Celery(
        "greenhouse_dt",
        broker=settings.celery_broker_url,
        backend=settings.celery_backend_url,
    )
    app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="Europe/Madrid",
        enable_utc=True,
        worker_prefetch_multiplier=1,
        task_acks_late=True,
        worker_concurrency=1,
        task_time_limit=120,
        task_soft_time_limit=90,
    )
    # Task imports for worker auto-discovery (worker pod needs this)
    app.conf.imports = ["app.workers.pathological"]

    # No beat schedule for Phase 2 — workers triggered by NGSI-LD subscription
    return app


celery_app = _make_celery_app()
