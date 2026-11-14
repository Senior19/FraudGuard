# Change log

## 2026-11-13 baseline hardening

### Behavior and validation

- `.env.example` — changed the feature store outage policy default from fail-open `rules_only` to fail-closed `fail_closed`.
- `infra/docker-compose.yml` — made the API service use the same configurable fail-closed default.
- `README.md` — documented the changed outage policy and the opt-in real Redis integration test.
- `scripts/benchmark.py` — catches expected HTTP and response parsing errors rather than suppressing every exception.
- `src/fraudguard/features/redis_store.py` — translates Redis connection errors into a clear runtime error for the API fallback path.
- `src/fraudguard/scoring/api.py` — closes the champion metadata file correctly, narrows Redis initialization catches, and defaults feature store outages to review unless fail-open is explicitly selected.
- `src/fraudguard/ml/train.py` — simplifies threshold candidate generation and documents why ONNX conversion errors are reported as a non-fatal warning.
- `tests/test_api.py` — verifies fail-closed is the default while explicit `rules_only` continues to opt into fail-open.
- `tests/test_consumer.py` — adds broker-stub tests for durable inbox-before-commit ordering, DLQ-before-commit ordering, and refusing to commit when DLQ delivery fails.
- `tests/test_redis_integration.py` — adds an opt-in real Redis Lua idempotency and microsecond event-time integration test, isolated by a unique namespace.
- `uv.lock` — adds a lockfile generated while resolving the declared Python extras.
- `CHANGELOG.md` — records the per-file changes in this delivery.

### Ruff cleanup

These files received import ordering, unused import, UTC alias, collection construction, or equivalent lint-only cleanups:

- `src/fraudguard/cases/api.py`
- `src/fraudguard/cases/export.py`
- `src/fraudguard/cases/store.py`
- `src/fraudguard/contracts/transaction.py`
- `src/fraudguard/features/definitions.py`
- `src/fraudguard/features/replay.py`
- `src/fraudguard/features/worker.py`
- `src/fraudguard/ingestion/adapters.py`
- `src/fraudguard/ingestion/kafka.py`
- `src/fraudguard/ingestion/simulator.py`
- `src/fraudguard/ml/scheduler.py`
- `src/fraudguard/monitoring/drift.py`
- `src/fraudguard/monitoring/metrics.py`
- `src/fraudguard/scoring/rules.py`
- `tests/test_adapters.py`
- `tests/test_cases.py`
- `tests/test_contract.py`
- `tests/test_features.py`
- `tests/test_features_extended.py`
- `tests/test_inbox_worker.py`
- `tests/test_ingestion.py`
- `tests/test_monitoring.py`
- `tests/test_rules.py`
- `tests/test_threshold.py`

## Verification

- `python -m pytest -q` — 31 passed, 1 skipped. The skipped test requires `FRAUDGUARD_TEST_REDIS_URL` and a live Redis service.
- `ruff check .` — passed.
- `python -m compileall -q src tests` — passed.
- Frontend build was not run because npm could not resolve `registry.npmjs.org` in this environment.
- Docker-backed broker and Redis service checks were not run because Docker is unavailable here.
