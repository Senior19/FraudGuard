# FraudGuard 🛡️

FraudGuard is a locally runnable, real-time fraud detection engineering demo. It covers transaction ingestion, event-time features, Redis serving, offline feature replay, LightGBM training, model promotion, scoring, analyst feedback, drift checks, and operational dashboards.

> **Scope:** This is a portfolio/demo system, not a bank-ready payment authorization service. The local SQLite inbox and case store, single Redis instance, and demo thresholds are intentionally simple. Do not treat unmeasured performance or availability as production guarantees.

## Architecture

```text
Online transaction simulator
        |
        v
Redpanda / Kafka (online event contract; no is_fraud label)
        |
        v
Kafka consumer -> durable SQLite inbox -> Redis feature worker
                                           |
                                           v
                                  shared event-time features

Offline labelled simulator -> shared feature function -> Parquet -> model training

FastAPI scoring API -> approve / review / decline -> SQLite analyst queue
        |                                                |
        +-> Prometheus metrics                           +-> analyst labels
        +-> rules-only fallback                          +-> label export

React analyst console -> FastAPI /cases
Prometheus -> Grafana
```

## Technology

- Python 3.12+, Pydantic, and FastAPI
- Redpanda (Kafka protocol) and `confluent-kafka`
- Redis sorted sets and Lua for atomic event-time history reads and idempotency
- Parquet, DuckDB, LightGBM, and scikit-learn
- SQLite WAL for the durable inbox and analyst cases
- React, TypeScript, and Vite
- Prometheus and Grafana

## Run the full stack on Windows

Install Docker Desktop with Docker Compose, Git, and [uv](https://docs.astral.sh/uv/). Run these commands in PowerShell from the folder where you want the repository:

```powershell
git clone https://github.com/Senior19/FraudGuard.git
Set-Location FraudGuard
uv sync --all-extras
Copy-Item .env.example .env
docker compose -f infra/docker-compose.yml up --build -d
docker compose -f infra/docker-compose.yml ps
```

`uv sync --all-extras` installs the Python project and its development, streaming, and ML dependencies. It is needed for local CLI tools and tests; the Docker services also install their own runtime dependencies.

Open the services:

| Service | URL |
|---|---|
| Analyst console | http://localhost:5173 |
| Scoring API | http://localhost:8000 |
| API documentation | http://localhost:8000/docs |
| Health | http://localhost:8000/health |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3000 |

Grafana's default local credentials are `admin` / `admin`; change them before using this outside a local demo.

### Put a case in the analyst queue

The console starts with an empty queue. Send a sample transaction to the scoring API; this amount exceeds the demo high-value rule, so it should be declined and create an open analyst case. In PowerShell:

```powershell
$transaction = @{
    transaction_id = "demo-$([guid]::NewGuid())"
    card_id        = "demo-card-1"
    merchant_id    = "demo-merchant-1"
    device_id      = "demo-device-1"
    amount         = "30000.00"
    currency       = "USD"
    country        = "US"
    latitude       = 37.7749
    longitude      = -122.4194
    event_time     = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8000/score" `
    -Method Post -ContentType "application/json" -Body $transaction
```

The response includes the decision and scoring mode. The open case should appear in the console, which refreshes every five seconds. The online request must not contain `is_fraud`; ground-truth labels belong only in offline data and analyst feedback.

### View logs and stop the stack

```powershell
docker compose -f infra/docker-compose.yml logs -f api
docker compose -f infra/docker-compose.yml down
```

The second command stops and removes the containers but preserves the Redis volume. To also remove persisted Redis data, use `docker compose -f infra/docker-compose.yml down -v`.

## Run the frontend locally (optional)

To edit the frontend with a local Vite server, first start only its API and Redis dependencies:

```powershell
docker compose -f infra/docker-compose.yml up -d api redis
Set-Location frontend
npm ci
npm.cmd run dev -- --host 0.0.0.0
```

Use Node.js 22 for local frontend development. The Vite app uses `http://localhost:8000` as its default API URL. Open http://localhost:5173 when Vite is ready. Stop the local Vite process with Ctrl+C.

## Generate and publish transactions

The simulator can publish online transactions to the Compose Redpanda broker. For a small local run:

```powershell
uv run fraudguard-simulate --output kafka --count 100 --tps 10 --fraud-rate 0.02
```

Kafka events flow through the consumer, durable SQLite inbox, and Redis feature worker. To generate labelled JSONL for offline training instead, keep it out of the online Kafka path:

```bash
mkdir -p data
uv run fraudguard-simulate --output stdout --count 100000 --tps 100000 --no-throttle \
    --fraud-rate 0.005 --seed 42 > data/simulated-transactions.jsonl
uv run fraudguard-features --input data/simulated-transactions.jsonl --output data/features.parquet
uv run fraudguard-train --input data/features.parquet --output-dir artifacts
```

The simulator's offline JSONL contains labels for training. The online event contract rejects `is_fraud`.

## Feature and scoring behavior

`compute_features()` in `features/definitions.py` is the canonical feature definition used by Redis serving and offline replay. Feature windows use event time and include only events where `event_time < current.event_time`; equal timestamps are excluded deterministically. Redis event deduplication, history reads, and inserts are atomic in a Lua script.

The feature set includes card velocity and amount history, distinct merchants and countries, merchant activity, and location/travel features. Redis retains a 24-hour event-time window.

The scoring API can use a model when one is available. If Redis or a model is unavailable, the response exposes the rules-only mode; the configured feature-store failure policy affects the decision. The demo defaults to `FEATURE_STORE_FAILURE_POLICY=fail_closed`, which sends transactions to review unless a hard rule declines them.

## Training, analyst feedback, and monitoring

The training pipeline uses a chronological split and reports PR-AUC, precision at target recall, and estimated cost. Promotion compares a candidate against the current champion using validation cost and a PR-AUC guardrail. Optional ONNX export keeps the joblib model as a fallback.

Analysts can label open cases as fraud or legitimate in the console. Export reviewed labels with:

```powershell
uv run fraudguard-export-labels --db data/cases.sqlite3 --output data/analyst-labels.jsonl
```

Only flagged cases routinely receive labels, which creates selection bias. The API also samples approved transactions for audit; this makes the sampling design explicit but does not eliminate all bias.

Prometheus metrics are available at http://localhost:8000/metrics. Grafana is available at http://localhost:3000. The drift command compares reference and current feature Parquet files:

```powershell
uv run fraudguard-drift --reference data/features-reference.parquet `
    --current data/features-current.parquet --output data/drift.json
```

## Development checks

After `uv sync --all-extras`, run:

```powershell
uv run pytest -q
uv run ruff check .
uv run python -m compileall -q src tests
npm.cmd --prefix frontend run build
```

The real Redis integration test requires `FRAUDGUARD_TEST_REDIS_URL`. Broker integration, real Redis behavior, ONNX conversion, browser integration, and sustained throughput are not verified by these commands; run the corresponding services or tests separately when needed.

## Limitations

- The feature worker and SQLite inbox/case store are intended for a local single-worker demo, not horizontal scaling.
- The model demo uses synthetic data. Public dataset adapters use proxy fields where source data lacks device, merchant, or geographic information.
- Demo thresholds and costs are not universal; configure them for the business context.
- The repository has not been benchmarked at 10k TPS or under production load. Measure actual throughput and p50/p95/p99 latency on the target machine before making performance claims.
- Production security controls, including authentication, authorization, encryption, secret management, PII minimization, audit retention, and payment compliance, are outside the demo's scope.
