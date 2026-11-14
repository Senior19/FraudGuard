# Codex instructions — FraudGuard

You are editing a real-time fraud detection platform. Read README.md before changing code.

## Non-negotiable invariants

1. The online Pydantic event contract must reject `is_fraud`. Ground-truth labels exist only in offline dataset adapters/simulator output and analyst label exports.
2. `compute_features()` in `features/definitions.py` is the canonical feature definition. Both Redis online processing and offline replay must use it. Add parity tests when changing a feature.
3. Feature windows are event-time windows. Only events with `event_time < current.event_time` are visible to the current transaction. Preserve microsecond ordering and deterministic same-timestamp exclusion.
4. Redis state mutation and transaction-ID idempotency are atomic in the Lua script. Do not replace it with a read-then-write sequence.
5. Kafka offsets are committed only after durable inbox insertion or acknowledged DLQ publication.
6. Feature-store failure must not silently claim model scoring succeeded. The API currently falls back to rules-only and exposes the mode.
7. Optimize cost, PR-AUC, precision at target recall, and latency percentiles. Accuracy is not a primary metric.

## Development commands

```bash
uv sync --all-extras
uv run pytest -q
uv run ruff check .
python -m compileall -q src tests
docker compose -f infra/docker-compose.yml up --build -d
```

## Architecture map

- `contracts/`: online/offline event contracts
- `ingestion/`: simulator, dataset adapters, Kafka producer/consumer, durable SQLite inbox
- `features/definitions.py`: shared point-in-time feature definitions
- `features/redis_store.py`: Redis Lua-backed online feature state
- `features/worker.py`: inbox-to-Redis worker
- `features/replay.py`: offline event-time replay to Parquet
- `ml/`: LightGBM training, cost thresholds, optional ONNX export, registry, retraining scheduler
- `scoring/`: rules, model inference, shadow inference, FastAPI endpoint
- `cases/`: analyst queue, feedback labels, export
- `monitoring/`: Prometheus metrics and PSI drift analysis
- `frontend/`: React analyst console

## Before finishing a change

- Add/adjust tests.
- Run pytest and compileall.
- Update README commands and known limitations.
- Do not invent throughput or latency benchmarks; report only measured values.
- Do not claim broker, Redis, ONNX, or browser integration tests passed unless those services were actually run.
