# LedgerMate — Shared Expenses Management App

LedgerMate is a premium co-living shared expenses tracker built using the **PERN Stack** (PostgreSQL, Express, React, Node.js) with **raw SQL queries only** (no ORM like Prisma or Sequelize).

It was developed to solve the messy financial logs of five flatmates — Aisha, Rohan, Priya, Meera, and newcomer Sam — resolving date overflows, currency mismatches, duplicate entries, and temporal membership constraints.

**Live App**: https://ledgermate-iota.vercel.app  
**Backend API**: https://ledgermate-r4y0.onrender.com  
**GitHub**: https://github.com/ankitkumar8340/ledgermate

---

## Features

| Feature | Description |
|---------|-------------|
| **Simplified Debt Settlement** | Flow-minimization algorithm calculates minimum peer-to-peer transfers to clear all balances |
| **Detailed Ledger Tracing** | Every calculation, currency conversion, and split is traced step-by-step with running subtotals |
| **Multi-Currency Support** | USD and INR expenses; USD dynamically converted at 1 USD = 83 INR for net standings |
| **Temporal Memberships** | Meera left March 31, Sam joined April 15 — expenses split only among members active on the date |
| **CSV Staging Sandbox** | Interactive UI surfaces all 13 anomalies before committing to the database |
| **Audit Log** | Every write operation is recorded in the `audit_logs` table with before/after values |
| **Session Auth** | Token-based login; password for each user is their name in lowercase |

---

## Technical Stack

- **Frontend**: React 19 + Vite, Vanilla CSS (Space Dark theme), Google Fonts Outfit
- **Backend**: Node.js + Express.js (ES modules), raw `pg` queries
- **Database**: PostgreSQL via `pg` Pool — hosted on [Neon](https://neon.tech)
- **Deployment**: Frontend on [Vercel](https://vercel.com), Backend on [Render](https://render.com)

---

## Local Setup & Installation

### Prerequisites
- **Node.js** v20+
- **PostgreSQL** 14+ (local install or cloud — Neon/Supabase)

### 1. Clone the Repository
```bash
git clone https://github.com/ankitkumar8340/ledgermate.git
cd ledgermate
```

### 2. Configure Backend Environment
Create a `.env` file inside the `backend/` directory:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ledgermate
NODE_ENV=development
JWT_SECRET=your_jwt_secret_here
FRONTEND_URL=http://localhost:5173
```

For Neon cloud database, use the connection string from your Neon project dashboard with `?sslmode=require` appended.

### 3. Create the Database (local PostgreSQL)
```bash
psql -U postgres -c "CREATE DATABASE ledgermate;"
```
> Skip this step if using Neon — the DB is already provisioned.

### 4. Install & Start Backend
```bash
cd backend
npm install
npm run dev
```
The server starts on **http://localhost:5000**, auto-creates all tables, and seeds default members.

### 5. Install & Start Frontend
Open a new terminal:
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173** in your browser.

---

## Default Login Credentials

| User | Password | Status |
|------|----------|--------|
| Aisha | `aisha` | Active (Feb 1 → present) |
| Rohan | `rohan` | Active (Feb 1 → present) |
| Priya | `priya` | Active (Feb 1 → present) |
| Meera | `meera` | Left March 31, 2026 |
| Sam | `sam` | Joined April 15, 2026 |

---

## Database Schema (Overview)

| Table | Purpose |
|-------|---------|
| `users` | Flatmate profiles with join/leave timestamps and password hash |
| `groups` | Flat group (e.g. "Flat 204 Sharing") |
| `group_memberships` | Temporal mapping of user ↔ group with date ranges |
| `expenses` | All expenses with currency, exchange rate, payer, split type |
| `expense_splits` | Per-member INR amount owed for each expense |
| `sessions` | Auth session tokens with expiry |
| `audit_logs` | Append-only log of every DB write (who, what, when, before/after) |

---

## AI Tools Used

- **Primary AI Collaborator**: Google Gemini (via Antigravity IDE agent)
- **Usage**: Architecture planning, raw SQL schema design, CSV anomaly parser logic, React component scaffolding, and deployment configuration.
- **Detailed log**: See [AI_USAGE.md](./AI_USAGE.md) — includes 3 concrete cases where AI produced incorrect output and how it was caught and fixed.

---

## Key Documentation Files

| File | Contents |
|------|---------|
| [SCOPE.md](./SCOPE.md) | All 13 CSV anomalies found, detection method, resolution policy, and full DB schema |
| [DECISIONS.md](./DECISIONS.md) | 5 major architecture decisions with options considered and rationale |
| [IMPORT_REPORT.md](./IMPORT_REPORT.md) | Auto-generated anomaly report produced by the CSV importer |
| [AI_USAGE.md](./AI_USAGE.md) | AI tools used, key prompts, and 3 concrete AI error cases |
