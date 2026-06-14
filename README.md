# LedgerMate - Shared Expenses Management App

LedgerMate is a premium co-living shared expenses tracker built using the **PERN Stack** (PostgreSQL, Express, React, Node.js) with **raw SQL queries** (no Prisma or other ORMs). 

It was developed to solve the messy financial logs of four flatmates—Aisha, Rohan, Priya, and Meera—and their newcomer Sam, resolving date overflows, currency mismatches, duplicates, and temporal membership constraints.

## Features & Resolving Flatmate Requests

1. **Aisha (Simplified Debts)**: A flow-minimization debt simplification algorithm calculates the minimum peer-to-peer transfers required to settle the flat, presented on the *Settlements P2P* tab.
2. **Rohan (Traceability)**: Every single calculation, exchange rate conversion, and split share is traced step-by-step with a running subtotal on the *Detailed Ledgers* view.
3. **Priya (Multi-Currency)**: Fully integrates USD and INR expenses. USD is dynamically converted using a standard exchange rate (1 USD = 83 INR) for net standing calculations.
4. **Sam & Meera (Temporal Memberships)**: Members have distinct active timelines (Meera left March 31, Sam joined April 15). Expenses are split *only* among members who were active on the transaction date.
5. **CSV Ingest & Sandbox Staging**: Surfaced all 12+ deliberate anomalies in `expenses_export.csv` inside an interactive *Staging Sandbox*, giving full approval and editing capabilities before final commits.

---

## Technical Stack
* **Frontend**: React (Vite, Vanilla CSS Space Dark Theme, Google Fonts Outfit)
* **Backend**: Node.js & Express.js (module type imports, raw queries)
* **Database**: PostgreSQL (connected via `pg` Pool helper)

---

## Installation & Setup

### Prerequisites
* **Node.js** (v20+ recommended)
* **PostgreSQL** database service (running locally or hosted on cloud like Supabase/Aiven)

### 1. Database Setup
Create a PostgreSQL database named `ledgermate` (or any custom name) on your server.

### 2. Configure Environment Variables
Create a `.env` file inside the `backend/` directory:

```env
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ledgermate
```
*(Replace `postgres:postgres` with your PostgreSQL username and password, and `ledgermate` with your database name).*

### 3. Install & Start Backend
From the root directory:
```bash
# Navigate to backend and install dependencies
cd backend
npm install

# Start the Express server in development mode (with nodemon)
npm run dev
```
The backend server will start and automatically run the schema initialization scripts to create tables and seed default members.

### 4. Install & Start Frontend
Open a new terminal window:
```bash
# Navigate to frontend and install dependencies
cd frontend
npm install

# Start the Vite development server
npm run dev
```
Open `http://localhost:5173` in your browser to access LedgerMate.

---

## AI Collaboration
* **Primary AI Collaborator**: Google Gemini (via Antigravity agent pairing framework)
* **Usage details**: See [AI_USAGE.md](file:///C:/Users/HP/.gemini/antigravity-ide/scratch/ledgermate/AI_USAGE.md) for prompts, corrections, and lessons learned.

## Deployment / Public URL

Public deployed app URL: (not deployed yet) — replace this line with your live app URL after deployment.

Quick deploy options:
- Vercel: connect the `frontend` directory to Vercel and set the `backend` as a separate Server or deploy the backend to Render/Heroku and point the frontend API base URL to it.
- Netlify + serverless functions: suitable for static frontend and lightweight API proxies.

If you want, I can add a `vercel.json`/`netlify.toml` and help push the repo to GitHub to enable automated deploys.
