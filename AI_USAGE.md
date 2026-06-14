# AI_USAGE.md — AI Collaboration Log

This document records the AI tools used during the development of **LedgerMate**, key prompts, and — critically — three concrete cases where the AI produced incorrect output, how I caught each error, and what I changed.

---

## 1. AI Tools Used

| Tool | Purpose |
|------|---------|
| **Google Gemini** (via Antigravity IDE agent) | Primary pair-programmer: architecture planning, schema design, raw SQL queries, React component scaffolding, CSV parser logic, deployment configuration |
| **GitHub Copilot** (inline) | Autocomplete for repetitive patterns (e.g., SQL INSERT parameter arrays) |

---

## 2. Key Prompts Used

### Architecture & Setup
- _"Analyze the entire repository structure, generate a current architecture report, feature inventory, missing assignment requirements, potential bugs, and security issues. DO NOT generate code yet."_
- _"Design a PostgreSQL schema for a shared-expenses app. Requirements: temporal memberships (users have join/leave dates), multi-currency support, settlement vs expense distinction, audit logging. Use raw SQL only — no ORM."_

### CSV Anomaly Handling
- _"Write a JavaScript CSV parser that detects: date overflows (########), inconsistent date formats, missing payers, negative amounts, percentage splits > 100%, duplicate entries (exact and fuzzy), and temporal membership violations. Return structured anomaly objects for each row."_
- _"The importer must stage all anomalies in a React UI before committing to PostgreSQL. Design the staging sandbox component with per-row checkboxes, anomaly badges, and a mandatory payer selector for missing-payer rows."_

### Debt Simplification
- _"Implement a greedy flow-minimization algorithm in JavaScript. Input: array of {userId, netBalanceINR}. Output: minimum set of P2P transactions to zero out all balances."_

### Deployment
- _"Create a render.yaml for the backend Express app, a vercel.json for the Vite React frontend, and update CORS to read the frontend URL from a FRONTEND_URL environment variable."_

---

## 3. Three Concrete Cases Where AI Was Wrong

---

### Case 1 — SQL Syntax Error: Missing `BY` in `ORDER BY`

**What the AI generated**:
In `backend/routes/api.js` (around line 417), the AI wrote:
```sql
ORDER e.date ASC
```
instead of:
```sql
ORDER BY e.date ASC
```

**How I caught it**:  
The backend server crashed on startup with a PostgreSQL syntax error. Running `nodemon` showed the error in the console. I searched the route file and found `ORDER e.date ASC` — a classic SQL typo where `BY` was omitted.

**What I changed**:  
Fixed the query to `ORDER BY e.date ASC`. This was the root cause of the initial server startup failure. I also searched for similar patterns in other queries to confirm it was isolated.

---

### Case 2 — Date Parsing Timezone Shift (UTC vs Local Time)

**What the AI generated**:
In the CSV date normalization logic, the AI wrote:
```javascript
const date = new Date(year, month - 1, day);
const isoDate = date.toISOString().split('T')[0]; // e.g. "2026-02-01"
```

**What went wrong**:  
`new Date(year, month, day)` creates a date in **local time** (IST = UTC+5:30). When `.toISOString()` converts to UTC, February 1st at 00:00:00 IST becomes **January 31st** at 18:30 UTC. This caused `2026-02-01` to be stored as `2026-01-31` in the database — triggering 4 false temporal membership violations (since flatmates joined February 1st).

**How I caught it**:  
Running a test parse of the February Rent row returned `2026-01-31` instead of `2026-02-01`. The temporal violation alert was appearing for Aisha even though she was active on the expense date.

**What I changed**:  
Replaced all date construction with `Date.UTC()`:
```javascript
const isoDate = new Date(Date.UTC(year, month - 1, day)).toISOString().split('T')[0];
```
This constructs the date in UTC from the start, eliminating the timezone shift. All February dates then resolved correctly.

---

### Case 3 — ORM Selection (Prisma) vs Raw SQL

**What the AI generated**:
In the initial implementation plan, the AI selected **Prisma ORM with SQLite** as the database layer:
> _"I'll use Prisma as the ORM for type-safe database access and SQLite for local development simplicity."_

**What went wrong**:  
This violated two explicit constraints: (1) the assignment required "relational DBs only" with no ORM, and (2) the user explicitly said _"I do not want to use Prisma or something like that."_ SQLite is also not suitable for cloud deployment.

**How I caught it**:  
The user rejected the implementation plan when it was presented for review, before any code was written.

**What I changed**:  
Rewrote the entire data layer using the raw `pg` (node-postgres) library with a connection pool. All database operations became explicit SQL strings with parameterized `$1, $2...` placeholders. The database was changed to PostgreSQL (hosted on Neon for production). This produced a far more auditable and interview-ready codebase where every query is visible and reviewable.

---

## 4. AI Limitations Observed

| Limitation | Impact | Mitigation |
|------------|--------|-----------|
| AI used `&&` in PowerShell commands | Commands failed (Windows uses `;` not `&&`) | Used `;` separator in PowerShell; used `Cwd` parameter instead of `cd` |
| AI proposed `pg_isready` before PostgreSQL was installed | Script failed silently | Verified PostgreSQL installation with `Test-Path` before running pg commands |
| AI generated `app.use(cors())` with no origin restriction | CORS would allow any domain in production | Updated to read `FRONTEND_URL` env var and restrict to specific Vercel domain |
| AI initially set `ssl: false` for all environments | Would fail against Neon (requires SSL) | Added `ssl: { rejectUnauthorized: false }` for `NODE_ENV === 'production'` |
