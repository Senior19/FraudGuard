# FraudGuard — real-time fraud detection platform

FraudGuard is an end-to-end, locally runnable fraud-detection engineering demo. It covers event ingestion, event-time features, Redis serving, offline feature replay, LightGBM training, model promotion, online scoring, analyst feedback, drift checks, and operational dashboards.

> **Scope:** this is a production-minded portfolio system, not a bank-ready payment authorization service. The local SQLite inbox/case store, one Redis instance, and demo thresholds are intentionally simple. Run load tests and security/reliability reviews before treating any performance or availability number as a production guarantee.

## Architecture

```text
Transaction simulator
        |
        v
Redpanda / Kafka: transactions.v1 (online schema; NO is_fraud label)
        |
        v
Kafka consumer --> SQLite WAL inbox (transaction_id unique; DLQ on invalid)
        |
        v
Feature worker --> Redis (event-time sorted sets + payload hashes + Lua atomicity)
        |                 |
        |                 +--> scoring API can compute/update the same Redis state
        v
Online feature audit JSONL

Offline labelled simulator JSONL --> shared feature function --> Parquet
                                                            |
                                                            v
                                              LightGBM temporal training
                                                            |
                                              champion/challenger registry
                                                            |
                                               optional ONNX export
                                                            |
                                                            v
FastAPI scoring API --> approve / review / decline --> SQLite analyst queue
       |                                                 |
       +--> Prometheus metrics                           +--> analyst labels
       +--> rules-only fallback                          +--> export for retraining

Prometheus --> Grafana
React analyst console --> FastAPI /cases
```

## Stack

- Python 3.12, Pydantic, FastAPI
- Redpanda (Kafka protocol), `confluent-kafka`
- Redis sorted sets and Lua script for atomic event-time history reads and idempotency
- Parquet + DuckDB-compatible files for offline analysis
- LightGBM, scikit-learn, optional ONNX Runtime / ONNX export
- SQLite WAL for durable local inbox and analyst cases
- React + TypeScript + Vite analyst console
- Prometheus + Grafana
- Pytest

## Quick start: full local stack

Requirements: Docker Compose, Python 3.12+, and `uv` (for local CLI/data work).

```bash
uv sync --all-extras
cp .env.example .env
docker compose -f infra/docker-compose.yml up --build -d
```

Services:

| Service | URL / address |
|---|---|
| Analyst console | http://localhost:5173 |
| Scoring API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 (default local admin/admin; change it) |
| Redpanda Kafka | localhost:19092 |
| Redis | localhost:6379 |

The Compose file starts Redpanda, Redis, the scoring API, Kafka consumer, feature worker, analyst UI, Prometheus, Grafana, and a retraining scheduler. The scheduler waits until `data/features.parquet` exists, then polls for Parquet changes every 60 seconds and retrains only when the file changes.

## Generate and publish transactions

Publish 100,000 events at a target rate of 1,000 TPS with bursts every 10,000 events:

```bash
uv run fraudguard-simulate --output kafka --count 100000 --tps 1000 \
  --fraud-rate 0.005 --seed 42 --burst-every 10000 --burst-duration 100
```

Inject a new fraud signature after event 50,000 (higher fraud prevalence, coordinated device/card/merchant, Singapore location):

```bash
uv run fraudguard-simulate --output kafka --count 100000 --tps 1000 \
  --fraud-rate 0.005 --drift-after 50000 --drift-fraud-rate 0.03
```

Generate labelled JSONL for offline training (labels are present only in this local offline file, never in Kafka):

```bash
mkdir -p data
uv run fraudguard-simulate --output stdout --count 100000 --tps 100000 --no-throttle \
  --fraud-rate 0.005 --seed 42 > data/simulated-transactions.jsonl
```

Convert public datasets to the same offline event contract:

```bash
# PaySim CSV
uv run fraudguard-adapt-dataset --kind paysim --input data/PS_20174392719_1491204439457_log.csv \
  --output data/paysim.jsonl

# IEEE-CIS transaction CSV, optionally joined to identity fields
uv run fraudguard-adapt-dataset --kind ieee-cis --input data/train_transaction.csv \
  --identity data/train_identity.csv --output data/ieee-cis.jsonl
```

The IEEE-CIS adapter uses ProductCD as a merchant-category proxy and `ZZ`/zero coordinates because the public data does not supply real country or geographic coordinates. PaySim uses origin/destination account IDs as card/merchant proxies and has no true device/geography. Do not interpret those proxy features as real-world merchant/device/travel signals.

## Redis streaming features

The consumer persists valid events to a SQLite WAL inbox before committing Kafka offsets. The feature worker drains that inbox and updates Redis.

```bash
# Already running in Compose; to run locally instead:
uv run fraudguard-consume --bootstrap-servers localhost:19092 --inbox data/transaction-inbox.sqlite3
uv run fraudguard-feature-worker --inbox data/transaction-inbox.sqlite3 --redis-url redis://localhost:6379/0
```

Features are computed strictly from transactions with `event_time < current.event_time`; the current event is excluded. State is retained for a 24-hour event-time window. The Redis Lua script atomically:

1. claims a transaction ID (duplicate protection),
2. prunes state older than the 24-hour window,
3. reads card and merchant history before the event timestamp,
4. inserts the current event into card and merchant sorted sets and payload hashes.

The same pure `compute_features()` function is used by Redis serving and offline replay. It de-duplicates history records because a transaction can be present in both the card and merchant histories.

Feature definitions:

- Card transaction count: 1 minute, 1 hour, 24 hours
- Card average amount and current amount / historical average
- Distinct merchants and countries for the card over 24 hours
- Seconds since the last card transaction
- Merchant transaction count (1 hour) and average amount (24 hours)
- Haversine distance from last card transaction and implied travel speed

**Late events:** Redis indexes by event time, not arrival time. A late event gets features from earlier event-time history and is inserted at its historical timestamp. Equal timestamps are excluded to keep deterministic tie semantics. Redis stores event-time scores at microsecond precision.

## Offline feature build and model training

```bash
uv run fraudguard-features --input data/simulated-transactions.jsonl --output data/features.parquet
uv run fraudguard-train --input data/features.parquet --output-dir artifacts
# Optional: merge analyst-reviewed labels and inverse-probability weights
uv run fraudguard-train --input data/features.parquet --analyst-labels data/analyst-labels.jsonl --output-dir artifacts
```

Training uses a chronological 80/20 split, class-weighted LightGBM, PR-AUC, precision at 80% recall, and a cost-based threshold. The demo cost matrix is:

- missed fraud: transaction amount,
- false decline: configurable fixed friction cost (`--false-decline-cost`, default 5.0).

It also reports estimated cost and savings versus a simple amount-only rules baseline. The threshold is not universal: set the false-decline cost to match the business context.

`--label-maturity-days N` excludes the newest N days before splitting, representing delayed labels. Synthetic labels are immediate; use a realistic maturity interval when training on delayed chargeback data.

A candidate is compared with the existing champion. Promotion requires lower estimated validation cost and at least 95% of champion PR-AUC. Every version is saved; `--no-promote` trains without promoting. If ONNX conversion dependencies work, the registry points to an ONNX artifact; the `.joblib` artifact is retained as fallback.

### Analyst feedback and sampling bias

Only flagged cases receive routine analyst labels, which is selection-biased. The scoring API therefore sends a configurable random sample of approved transactions to the analyst queue (`APPROVED_AUDIT_SAMPLE_RATE`, default 0.2%). Export reviewed labels:

```bash
uv run fraudguard-export-labels --db data/cases.sqlite3 --output data/analyst-labels.jsonl
```

The export distinguishes randomly sampled approved transactions from flagged cases and includes a sample weight. This makes the sampling design explicit; it does not magically remove all selection bias. For a real deployment, use a statistically designed audit sample and propensity-aware evaluation.

### Scheduled retraining and shadow deployment

Run the scheduler after feature data exists:

```bash
uv run fraudguard-retrain --input data/features.parquet --poll-seconds 60 --output-dir artifacts
```

It trains only when the Parquet file changes. The API watches `artifacts/champion.json` and reloads a promoted champion without restarting. To run a challenger in shadow mode, set `SHADOW_MODEL_PATH` to a candidate `.joblib` or `.onnx` artifact in the environment and recreate the API service (for example, `SHADOW_MODEL_PATH=/app/artifacts/model-<version>.joblib docker compose -f infra/docker-compose.yml up -d --force-recreate api`). Shadow scores are returned separately and do not affect decisions.

## Scoring API

```bash
uv run uvicorn fraudguard.scoring.api:app --reload --port 8000
```

Example request (no `is_fraud` field is allowed):

```bash
curl -X POST http://localhost:8000/score \
  -H 'content-type: application/json' \
  -d '{"transaction_id":"tx-demo-1","card_id":"card-1","merchant_id":"merchant-1","device_id":"device-1","amount":"149.99","currency":"USD","country":"US","latitude":37.7749,"longitude":-122.4194,"event_time":"2026-11-13T10:00:00Z"}'
```

Decisions:

- `decline`: hard rule, velocity/impossible-travel rule, or model decline threshold
- `review`: model review threshold or model/feature unavailable
- `approve`: score below review threshold

If Redis is down, the default `FEATURE_STORE_FAILURE_POLICY=fail_closed` routes transactions to review unless a hard rule declines them. Set it to `rules_only` only when you explicitly want the fail-open behavior that approves transactions that do not hit a hard rule. High-value and blocked-device rules still apply in either mode. Model and feature-store status are exposed by `/health`. Redis reconnection is retried on requests. Tune thresholds and fallback policy before real payments.

## Analyst console

The React UI refreshes `/cases` every five seconds and supports approve-as-legitimate / confirm-fraud labels. It displays transaction context, feature snapshot, reasons, and top LightGBM TreeSHAP contribution values when the model is available.

API endpoints:

- `GET /cases?status=open|reviewed`
- `POST /cases/{transaction_id}/label` with `{"label":"fraud"}` or `{"label":"legitimate"}`

## Load testing

With the Compose stack running, measure actual API throughput and latency on your machine:

```bash
python scripts/benchmark.py --url http://localhost:8000 --count 20000 --concurrency 100
```

The script reports achieved requests/second and p50/p95/p99 latency. It is an HTTP benchmark, not a claim that the entire Kafka-to-Redis pipeline sustains the same throughput.

## Monitoring and drift

- `GET /metrics`: Prometheus counters/histograms for decision counts, scoring latency, score distribution, and Redis feature failures.
- Grafana: http://localhost:3000
- `fraudguard-drift` computes per-feature PSI between reference and current Parquet files:

```bash
uv run fraudguard-drift --reference data/features-reference.parquet \
  --current data/features-after-drift.parquet --output data/drift.json
```

Rule of thumb for PSI: below 0.1 often indicates little shift, 0.1–0.25 deserves investigation, above 0.25 is a strong shift signal. These are heuristics, not universal thresholds.

## Tests and quality checks

```bash
uv run pytest -q
uv run ruff check .
python -m compileall -q src
```

Redis Lua parity test uses `fakeredis[lua]` and skips when the optional test dependency is unavailable. Broker integration, Redis server behavior, ONNX conversion, browser UI build, and sustained TPS must be verified on a machine with Docker and the optional dependencies installed.

For a real Redis server integration check, set `FRAUDGUARD_TEST_REDIS_URL` and run `uv run pytest -q tests/test_redis_integration.py`. The test uses a unique Redis key namespace and removes its keys afterward. Kafka broker integration still requires a separately provisioned broker and is not part of the default pytest run.

## Failure semantics and limitations

- Kafka publisher uses idempotent producer settings and transaction ID keys.
- Consumer disables auto-commit and persists to SQLite before committing offsets.
- Invalid payloads are acknowledged only after a DLQ publish succeeds.
- SQLite primary key deduplicates redelivery into the inbox.
- Redis Lua makes event dedupe/history-read/insert atomic for the local single Redis primary.
- Feature worker is deliberately a single local worker. For horizontal scaling, add partition-aware state ownership, consumer group coordination, and durable offset/state transactions.
- The local SQLite inbox and case store are not a horizontally scalable database.
- The model demo trains on synthetic events. Replace with IEEE-CIS / PaySim / ULB and document dataset limitations; anonymized ULB PCA features cannot support device/country feature engineering.
- The project has not been benchmarked at 10k TPS or under production load. Report measured p50/p95/p99 and sustained throughput from your machine, never target values as achieved results.
- Security hardening (authentication, authorization, encryption, secret management, PII minimization, audit retention, and payment-network compliance) is outside this local demo.
