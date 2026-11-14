# FraudGuard 🛡️
### Real-Time Payment Fraud Detection System

FraudGuard is a real-time payment fraud detection platform designed to identify suspicious transactions before they cause financial damage.

It analyzes transaction details and customer spending behaviour, uses machine learning and predefined security rules to estimate fraud risk, and recommends whether a transaction should be **approved, reviewed, or declined**.

The goal is to go beyond checking individual transactions and understand whether a payment is unusual for a particular customer.

---

## Why FraudGuard?

Imagine someone usually makes payments of ₹200–₹2,000 in India.

Suddenly, a payment of ₹85,000 is attempted from another country just two minutes after their previous transaction.

Is it legitimate or fraudulent?

FraudGuard evaluates this situation by examining transaction details, recent activity, location changes, spending patterns, and other risk indicators.

Instead of relying on a single rule, it combines real-time data processing, machine learning, and explainable decisions.

## How It Works

```text
       Payment Transaction
                |
                v
         Event Ingestion
              Kafka
                |
                v
       Real-Time Processing
                |
                v
        Feature Generation
              Redis
                |
                v
        Fraud Detection
       ML Model + Rules
                |
                v
        Risk Assessment
                |
       +--------+--------+
       |        |        |
       v        v        v
     Approve  Review   Decline
                |
                v
       Analyst Dashboard
                |
                v
       Feedback & Retraining
```

### Main Components

| Component | Purpose |
|---|---|
| Kafka | Receives and distributes transaction events. |
| Redis | Stores recent customer activity for fast feature retrieval. |
| Feature Engineering | Calculates spending patterns and behavioural indicators. |
| Machine Learning | Estimates the probability that a transaction is fraudulent. |
| Rules Engine | Applies additional fraud detection rules. |
| FastAPI | Provides the fraud detection API. |
| Analyst Dashboard | Allows analysts to inspect suspicious transactions. |
| Monitoring | Tracks system performance, latency, and model behaviour. |

## Key Features

- **Real-Time Detection:** Evaluates transactions as they arrive.
- **Behavioural Analysis:** Identifies unusual spending patterns and transaction activity.
- **Machine Learning:** Uses trained models to estimate fraud risk.
- **Rule-Based Detection:** Combines ML predictions with configurable security rules.
- **Risk-Based Decisions:** Classifies transactions as approved, requiring review, or declined.
- **Explainable Predictions:** Helps analysts understand which factors influenced a prediction.
- **Feedback Loop:** Uses analyst decisions and confirmed outcomes to support future model improvements.
- **Performance Monitoring:** Tracks transaction throughput, response time, and model performance.

## Technology Stack

| Technology | Usage |
|---|---|
| Python | Core development and ML |
| Apache Kafka / Redpanda | Event streaming |
| Redis | Real-time feature storage |
| LightGBM / XGBoost | Fraud classification |
| FastAPI | Backend API |
| DuckDB / Parquet | Historical data storage and analysis |
| SHAP | Model explainability |
| React + TypeScript | Frontend dashboard |
| Prometheus + Grafana | Monitoring |
| Docker | Containerization |
| Pytest | Automated testing |

## Project Structure

```text
FraudGuard/
│
├── backend/
│   ├── api/
│   ├── ingestion/
│   ├── processing/
│   ├── features/
│   ├── models/
│   └── rules/
│
├── frontend/
│   └── dashboard/
│
├── data/
│   ├── raw/
│   └── processed/
│
├── training/
│   ├── train.py
│   └── evaluate.py
│
├── monitoring/
│
├── tests/
│
├── docker-compose.yml
├── requirements.txt
├── .env.example
└── README.md
```

*The structure above describes the intended organization; adapt it to match the actual repository.*

## Example

Consider three incoming transactions:

| Transaction | Risk Level | Suggested Decision |
|---|---|---|
| Regular purchase from a familiar location | Low | Approve |
| Unusual purchase amount | Medium | Review |
| Large payment with suspicious location activity | High | Decline |

These are illustrative examples, not measured model results. Actual decisions depend on the model, configured thresholds, and available transaction data.

## Dataset

FraudGuard can be developed and evaluated using publicly available datasets:

- [Credit Card Fraud Detection – ULB](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud)
- [IEEE-CIS Fraud Detection](https://www.kaggle.com/competitions/ieee-fraud-detection)
- [PaySim Mobile Money Dataset](https://www.kaggle.com/datasets/ealaxi/paysim1)

Each dataset has different characteristics, so preprocessing and feature engineering may need to be adapted.

## Getting Started

### Prerequisites

Make sure you have installed:

- Python 3.12+
- Docker and Docker Compose
- Git

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd FraudGuard
```

### 2. Create a Virtual Environment

```bash
python -m venv venv
```

Activate it:

**Windows**
```bash
venv\Scripts\activate
```

**Linux / macOS**
```bash
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Copy `.env.example` to `.env` and configure the required settings.

### 5. Start the Infrastructure

```bash
docker compose up -d
```

### 6. Run the Application

Follow the backend and frontend startup instructions in their respective directories.

*These commands assume the corresponding configuration and application entry points are present in the repository.*

## Model Evaluation

Fraud detection is an imbalanced classification problem: legitimate transactions greatly outnumber fraudulent ones.

Therefore, accuracy alone is not enough to evaluate the model.

FraudGuard should be evaluated using:

- **Precision:** How many transactions flagged as fraud were actually fraudulent?
- **Recall:** How many actual fraudulent transactions were successfully detected?
- **PR-AUC:** How effectively does the model distinguish fraud from legitimate activity?
- **F1-Score:** Balance between precision and recall.
- **Latency:** How quickly the system processes a transaction.
- **Throughput:** How many transactions the system can process per second.

## Future Improvements

- Advanced behavioural profiling
- Real-time anomaly detection
- Improved model explainability
- Automated model retraining
- Champion–challenger model deployment
- Advanced fraud pattern detection
- Distributed deployment and scalability
- Better analyst investigation workflows

## Project Goals

FraudGuard aims to demonstrate how machine learning can be integrated into a practical, real-time software system.

It focuses on more than model accuracy: the project also explores data engineering, event-driven architecture, low-latency inference, explainability, monitoring, and continuous model improvement.

---

**Built by Ashish Jha \: with Python, Machine Learning, and Real-Time Data Engineering.**
