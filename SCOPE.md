# SCOPE.md — Anomaly Log & Database Schema

This document details every deliberate data anomaly discovered in `expenses_export.csv`, how each was detected, and the policy applied — along with the full relational database schema implemented in PostgreSQL for **LedgerMate**.

---

## 1. CSV Anomaly Log & Resolution Policies

The CSV file contained **13 distinct data problems**. All anomalies are surfaced in the interactive Staging Sandbox UI before any row is committed to the database.

---

### Anomaly 1 — `########` Date Overflow
- **Rows affected**: 7, 8, 21, 22, 23, 24, 25, 26, 39, 40
- **Detection**: Any cell containing the `#` character sequence — a symptom of Excel column-width overflow or format corruption.
- **Policy**: Chronological interpolation. The parser scans adjacent rows with valid dates and calculates the implied midpoint date. For example, if Row 6 is `2026-02-08` and Row 9 is `2026-02-14`, Rows 7 and 8 are inferred as `2026-02-11` and `2026-02-12`.
- **Resolution**: Interpolated dates are displayed in the Staging Sandbox with a ⚠️ warning badge. The user can override the inferred date before committing.

---

### Anomaly 2 — Inconsistent Date Formats
- **Issue**: Dates entered in at least four different formats across the spreadsheet:
  - `1/2/2026` (D/M/YYYY)
  - `14-02-2026` (DD-MM-YYYY)
  - `14-Mar` (no year)
  - `15-04-202` (truncated year)
- **Detection**: Regex matching against known format patterns in the parser.
- **Policy**: All formats normalized to ISO 8601 `YYYY-MM-DD`. `14-Mar` defaults to year 2026. `15-04-202` is expanded to `2026-04-15`.
- **Resolution**: Normalization is automatic. Affected rows tagged with an INFO badge.

---

### Anomaly 3 — Ambiguous Date `4/5/2026`
- **Issue**: The Deep Cleaning expense date `4/5/2026` is ambiguous — it could be April 5 or May 4.
- **Detection**: Date falls between known entries on Mar 28 and Apr 1; split participants exclude Meera (who left Mar 31), confirming the date is in April.
- **Policy**: Parsed as `2026-04-05` (April 5) using M/D/YYYY convention plus contextual inference.
- **Resolution**: Stored as `2026-04-05` with a ⚠️ flag and a note explaining the inference.

---

### Anomaly 4 — Payer Name Typos and Case Variations
- **Issue**: Names entered as `priya` (lowercase), `rohan` (lowercase), `Priya S` (with suffix).
- **Detection**: Case-insensitive comparison against the registered flatmate list.
- **Policy**: Map all names to their canonical titlecase form using a typo dictionary (`priya` → `Priya`, `Priya S` → `Priya`).
- **Resolution**: Automatically normalized. Row tagged INFO. No user action required.

---

### Anomaly 5 — Missing Payer
- **Issue**: Row 13 (Cleaning Supplies, ₹780) has an empty `paid_by` field. Note in CSV: _"can't remember who paid"_.
- **Detection**: `paid_by` cell is empty or whitespace-only.
- **Policy**: Assign placeholder `u_unknown`. Flag as CRITICAL — the row cannot be committed until a real payer is selected.
- **Resolution**: The Staging Sandbox renders a mandatory dropdown for payer selection. Row is blocked from commit until resolved.

---

### Anomaly 6 — Missing Currency
- **Issue**: Row 28 (DMart Groceries) is missing the `currency` field entirely.
- **Detection**: Empty `currency` cell.
- **Policy**: Default to `INR` (the dominant currency in the dataset).
- **Resolution**: Auto-set to `INR` with a ⚠️ badge. User can change to USD if needed.

---

### Anomaly 7 — Zero Amount
- **Issue**: Row 31 (Swiggy Dinner Order) has amount `₹0`. Note: _"counted twice earlier - fixing later"_.
- **Detection**: Parsed `amount === 0`.
- **Policy**: Flag as WARNING and exclude from import by default (unchecked in sandbox).
- **Resolution**: Row is de-selected by default. User can manually enter a corrected amount and then check it for import.

---

### Anomaly 8 — Negative Amount (Refund)
- **Issue**: Row 26 (Parasailing Refund) has amount `-$30 USD`.
- **Detection**: Parsed `amount < 0`.
- **Policy**: Treat as a legitimate refund — ingest as a negative expense. Splits are also negative, reducing participant debts proportionally.
- **Resolution**: Processed as refund. Tagged INFO. Negative splits written to `expense_splits`.

---

### Anomaly 9 — Percentage Splits Summing to 110%
- **Issue**: Pizza Friday (Row 15) and Weekend Brunch (Row 32) have percentage splits that total 110%.
- **Detection**: `split_type = 'percentage'` and `SUM(percentages) > 100`.
- **Policy**: Proportionally rebalance all percentages to sum to exactly 100% (multiply each by `100 / total`).
- **Resolution**: Auto-rebalanced. ⚠️ badge shows "Percentages normalized from 110% → 100%".

---

### Anomaly 10 — Equal Split Type with Share Weights
- **Issue**: Row 42 (Furniture for Common Room) declares `split_type = equal` but includes explicit share weights: `Aisha 1; Rohan 1; Priya 1; Sam 1`.
- **Detection**: `split_type === 'equal'` combined with non-empty numeric split details.
- **Policy**: Since all weights are equal (all `1`), treat as true equal division. Weights are ignored.
- **Resolution**: Normalized to equal split among listed members. ⚠️ flagged for user confirmation.

---

### Anomaly 11 — Settlements Logged as Expenses
- **Issue**: Row 14 (Rohan pays Aisha ₹5,000) and Row 38 (Sam deposit ₹15,000 to Aisha) are peer-to-peer repayments, not group expenses.
- **Detection**: Description keywords (`paid`, `deposit`, `repay`) and single-beneficiary split pattern.
- **Policy**: Flag `is_settlement = TRUE`. Exclude from shared split calculations. Apply as a direct balance transfer between the two parties.
- **Resolution**: Written to `expenses` with `is_settlement = true`. Not included in ledger or simplified debt calculations.

---

### Anomaly 12 — Duplicate Entries
- **Issue**:
  - _Exact duplicate_: Dinner at Marina (Rows 4 and 5) — identical payer, date, amount, description.
  - _Conflict duplicate_: Dinner at Thalassa — logged by both Rohan (₹2,450) and Aisha (₹2,400) with slight discrepancies.
- **Detection**: Exact duplicate check on (payer, date, amount, description). Fuzzy check on (description similarity, same date, different payer/amount).
- **Policy**: Both entries are staged. The user is presented with a comparison and must choose exactly one to import.
- **Resolution**: Interactive dual-row comparison in the Staging Sandbox with "Import this one" radio buttons.

---

### Anomaly 13 — Temporal Membership Violations
- **Issue**:
  - Row 36 (Groceries Apr 2) includes Meera, who left **March 31, 2026**.
  - Rows 39, 40, 41 include Sam for dates Apr 10, 12, 14 — but Sam only joined **April 15, 2026**.
- **Detection**: For every expense, compare `expense.date` against `membership.joined_at` and `membership.left_at` for each listed member.
- **Policy**: Automatically exclude members who were not active on the expense date. Recalculate splits among the remaining active members.
- **Resolution**: Affected rows show a ⚠️ badge listing excluded members. The corrected active-member split is auto-calculated and shown.

---

## 2. PostgreSQL Relational Schema

The schema is initialized transactionally on server startup via `backend/db/index.js`.

```sql
-- ================================================
-- LedgerMate Database Schema v1.1
-- Dialect: PostgreSQL | No ORM — raw pg queries
-- ================================================

-- Users (Flatmates)
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(50)  PRIMARY KEY,
  name          VARCHAR(100) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE,
  joined_at     TIMESTAMP    NOT NULL,
  left_at       TIMESTAMP,                      -- NULL = currently active
  password_hash VARCHAR(255)                    -- scrypt hash, salt in env
);

-- Groups (Flats / Expense pools)
CREATE TABLE IF NOT EXISTS groups (
  id          VARCHAR(50)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Temporal Group Memberships
-- Tracks exactly when each user was part of each group
CREATE TABLE IF NOT EXISTS group_memberships (
  id        VARCHAR(50) PRIMARY KEY,
  user_id   VARCHAR(50) NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  group_id  VARCHAR(50) NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMP   NOT NULL,
  left_at   TIMESTAMP,
  CONSTRAINT unique_user_group UNIQUE (user_id, group_id)
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id            VARCHAR(50)     PRIMARY KEY,
  group_id      VARCHAR(50)     NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description   VARCHAR(255)    NOT NULL,
  amount        DECIMAL(12, 2)  NOT NULL,
  currency      VARCHAR(10)     DEFAULT 'INR',
  exchange_rate DECIMAL(12, 6)  DEFAULT 1.0,  -- stored for audit; INR = 1.0, USD = 83.0
  date          TIMESTAMP       NOT NULL,
  paid_by_id    VARCHAR(50)     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  split_type    VARCHAR(50)     NOT NULL,      -- 'equal' | 'percentage' | 'exact' | 'shares'
  split_details TEXT,                          -- raw CSV split spec for audit trail
  notes         TEXT,
  is_settlement BOOLEAN         DEFAULT FALSE  -- TRUE = P2P repayment, excluded from ledger
);

-- Expense Splits (computed per-member share in INR)
CREATE TABLE IF NOT EXISTS expense_splits (
  id         VARCHAR(50)    PRIMARY KEY,
  expense_id VARCHAR(50)    NOT NULL REFERENCES expenses(id)  ON DELETE CASCADE,
  user_id    VARCHAR(50)    NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  amount     DECIMAL(12, 2) NOT NULL,           -- member's share in INR
  CONSTRAINT unique_expense_user UNIQUE (expense_id, user_id)
);

-- Auth Sessions
CREATE TABLE IF NOT EXISTS sessions (
  token      VARCHAR(100) PRIMARY KEY,
  user_id    VARCHAR(50)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP    NOT NULL
);

-- Audit Log (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
  id         VARCHAR(50) PRIMARY KEY,
  user_id    VARCHAR(50) NOT NULL,
  action     VARCHAR(50) NOT NULL,              -- 'INSERT' | 'UPDATE' | 'DELETE'
  table_name VARCHAR(50) NOT NULL,
  row_id     VARCHAR(50) NOT NULL,
  old_values TEXT,                              -- JSON snapshot before change
  new_values TEXT,                              -- JSON snapshot after change
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_memberships_user  ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_group ON group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_group    ON expenses(group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_payer    ON expenses(paid_by_id);
CREATE INDEX IF NOT EXISTS idx_splits_expense    ON expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_splits_user       ON expense_splits(user_id);
```

### Key Design Decisions in the Schema

| Decision | Rationale |
|----------|-----------|
| `exchange_rate` stored on expense row | Preserves the rate at import time for audit traceability (Rohan's request) |
| `is_settlement` flag on expenses | Lets settlements coexist in the same table without polluting the shared ledger |
| `left_at` on both `users` and `group_memberships` | Supports temporal queries without deleting data |
| `split_details TEXT` | Keeps the raw split spec alongside computed splits for dispute resolution |
| Append-only `audit_logs` | Meets compliance-grade traceability; rows are never updated, only inserted |
