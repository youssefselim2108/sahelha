# Sahelha

Smart home services & maintenance platform for Egypt. Graduation Project, ESLSCA University.

| Folder | What | Status |
| --- | --- | --- |
| `/` (root) | Clickable prototype of the customer, technician and admin apps (mock data) | UI mocked |
| `backend/` | Node.js + Express REST API on MongoDB | Foundation working (see below) |
| `classifier/` | Python AI-assisted request classifier (D12) | Trained & evaluated |

## Clickable prototype (connected to the backend)

Start the backend (below), then open http://localhost:4000. The backend serves the page and the API together.
Sign-in, AI suggestion, matching, booking, job status and quotations go through the API;
payment, chat, reviews and history are still simulated in the browser.

| Role | Mobile number | Password |
| --- | --- | --- |
| Customer (Nour Hassan) | `01001234567` | `sahelha123` |
| Technician (Ahmed Salah) | `01112345678` | `sahelha123` |

New accounts use the one-time code `4829` (simulated; no SMS yet).

## Backend

```bash
cd backend
npm install
npm test        # 20 tests: auth, matching, booking state machine, quotations, admin, SRS rule checks
npm start       # http://localhost:4000/api
```

Without `MONGO_URI` set, `npm start` runs an in-memory MongoDB (one-node replica set, needed for
transactions) seeded with demo data (password for all demo accounts: `sahelha123`; admin phone `01000000000`).
For a real deployment set `MONGO_URI` (a replica set, e.g. MongoDB Atlas) and `JWT_SECRET`;
without `JWT_SECRET` a random signing key is used and sign-ins end when the server restarts.

What works now:

| Deliverable | Endpoints | Rules enforced |
| --- | --- | --- |
| D04 Authentication | `POST /api/auth/register/customer`, `/register/technician`, `/login`, `GET /me` | JWT (24 h), bcrypt hashes, one role per account, no public admin sign-up |
| D01 Requests | `POST /api/requests` | Six SRS categories, 10–1000 character description, slot in the next 14 days |
| D05 Booking | `POST /api/bookings`, `/:id/accept`, `/decline`, `/status`, `/cancel` | BR-01 legal moves only, BR-05 no cancel after start, BR-07 no double booking, BR-08 verified only, 30-min accept window (unanswered bookings lapse and free the slot), status changes saved atomically with their append-only events |
| D07 Matching + reliability score | `GET /api/requests/:id/matches?sort=best\|nearest\|cheapest\|rating` | Weighted reliability (30/20/20/15/15) and match score (30/20/20/15/15), "New" below 5 jobs, ≤ 10 results |
| D09 Quotations | `POST /api/bookings/:id/quotation`, `/decision`, `/extra`, `/extra/:item/decision` | BR-02 no start without approved quote, BR-03 extras count only once approved, BR-04 decided items locked, server-side totals |
| D12 AI suggestion | `POST /api/requests/suggest`, `POST /api/requests` | Suggestion stored apart from the confirmed category; 3 s timeout falls back to manual |
| D03 Admin (API) | `GET /api/admin/technicians`, `POST /:id/verify`, `GET /:id/decisions`, `GET/PUT /api/admin/settings/weights` | Approve / reject / ask for more info / suspend, with a required reason except for approval; every decision recorded with admin and time; weights must sum to 1, every change logged |

Not built yet: notifications, reviews, service history/invoices, chat, complaints, the admin dashboard
screens, document uploads, and Google Maps (distance is straight-line haversine for now).

## Classifier

```bash
cd classifier
pip install scikit-learn pandas joblib matplotlib
python train.py   # compares 4 models, writes results/metrics.json + confusion_matrix.png, saves model.joblib
python serve.py   # http://127.0.0.1:5001/classify  (the backend calls this)
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
