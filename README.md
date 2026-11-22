# Sahelha

Smart home services & maintenance platform for Egypt. Graduation Project, ESLSCA University.

| Folder | What | Status |
| --- | --- | --- |
| `/` (root) | Clickable prototype of the customer, technician and admin apps | UI done; the technician list comes from the backend, the rest is simulated |
| `backend/` | Node.js + Express REST API on MongoDB | Matching + reliability score working |
| `classifier/` | Python AI request classifier (D12) | Trained & evaluated |

## Run it

```bash
cd backend
npm install
npm test        # 9 tests: reliability score, match score, matching API
npm start       # open http://localhost:4000
```

Without `MONGO_URI` set, `npm start` runs an in-memory MongoDB filled with 6 demo technicians.
In the prototype, sign in (the demo number and code `4829` are filled in), describe a problem and
tap **Find technicians**: the ranked list and the reliability scores come from the backend.

## Backend: what works now (D07)

`GET /api/matches?category=ac&lat=29.96&lng=31.25&sort=best|nearest|cheapest|rating`

| Rule | SRS |
| --- | --- |
| Only verified, online technicians in the right trade whose service area covers the location | FR-MAT-01, FR-VER-05 |
| Ranked by a weighted match score: reliability 30%, rating 20%, distance 20%, price 15%, experience 15% | FR-MAT-02/03 |
| Reliability score from five inputs: on-time 30%, few cancellations 20%, rating 20%, completed jobs 15%, repeat customers 15% | FR-REL-01/02 |
| Fewer than 5 completed jobs → shown as "New" | FR-REL-06 |
| Sort by nearest, cheapest or rating; at most 10 results; a message when nobody is found | FR-MAT-05/06/07 |

Database: one `Technician` collection (trades, experience, service area, fee, verified, job statistics).

Not built yet (next milestones): accounts and sign-in, saving requests, bookings and job status,
quotations, admin, notifications, reviews, history, chat and complaints.

## Classifier

```bash
cd classifier
pip install scikit-learn pandas joblib matplotlib
python train.py   # compares 4 models, writes results/metrics.json + confusion_matrix.png, saves model.joblib
python serve.py   # http://127.0.0.1:5001/classify
```

Data: 120 team-written requests for the six SRS categories (20 per category, half Egyptian Arabic,
half English) in `data/requests.csv`. This is a small seed set, not real user data, so the scores below are a baseline.

| Model (TF-IDF char 2–5 n-grams) | Accuracy | Macro P | Macro R | Macro F1 | 5-fold CV F1 |
| --- | --- | --- | --- | --- | --- |
| Majority baseline | 0.17 | 0.03 | 0.17 | 0.05 | 0.05 |
| Multinomial Naive Bayes | 0.43 | 0.42 | 0.43 | 0.41 | 0.53 ± 0.14 |
| Logistic Regression | 0.53 | 0.55 | 0.53 | 0.53 | 0.60 ± 0.13 |
| **Linear SVM (selected)** | 0.47 | 0.46 | 0.47 | 0.45 | **0.60 ± 0.14** |

Hold-out test set: 30 requests (5 per class). Model chosen by cross-validated macro F1;
Logistic Regression is almost tied and does better on the hold-out set.
