# SCOPE.md - Anomaly Log & Database Schema

This document details the deliberate data anomalies discovered in `expenses_export.csv` and outlines the relational database schema implemented in PostgreSQL for **LedgerMate**.

---

## 1. CSV Anomaly Log & Resolution Policies

The CSV file contained 12+ distinct, messy data problems. They were parsed, flagged, and resolved using the following policies:

### 1. `########` Date Overflow
* **Issue**: Cell date values in Excel overflowed to `########` due to width issues or format corruption (occurring on rows 7, 8, 21, 22, 23, 24, 25, 26, 39, 40).
* **Detection**: Identified any cells containing string sequences like `###`.
* **Policy**: Chronologically reconstruct dates by looking at neighboring rows. If Row A is Feb 8 and Row D is Feb 14, Row B and C are interpolated as Feb 11 and Feb 12 respectively.
* **Resolution**: The sandbox displays the interpolated date and allows the user to override it if needed.

### 2. Inconsistent Date Formats
* **Issue**: Dates were written in various formats, such as `1/2/2026` (D/M/YYYY), `14-02-2026` (DD-MM-YYYY), `14-Mar` (no year), and `15-04-202` (cut-off year).
* **Detection**: Regex matching patterns for date string structures.
* **Policy**: Convert all date strings to standard ISO `YYYY-MM-DD`. `14-Mar` defaults to the year 2026. `15-04-202` expands to `2026-04-15`.
* **Resolution**: Normalization is automated in the parser.

### 3. Ambiguous Date (`4/5/2026`)
* **Issue**: The date for deep cleaning was entered as `4/5/2026`. This could mean April 5 or May 4.
* **Detection**: Identified row placement (positioned between Mar 28 and Apr 1) and split participants (excludes Meera, who moved out March 31).
* **Policy**: Determined chronologically to be **April 5, 2026** (using M/D/YYYY).
* **Resolution**: Parsed as `2026-04-05` and flagged as warning.

### 4. Payer/Member Name Case and Typos
* **Issue**: Lowercase names (`priya`, `rohan`) and typo additions (`Priya S`).
* **Detection**: Case-insensitive lookup against the registered list of flatmates.
* **Policy**: Map names case-insensitively. Map known typos (like `Priya S` to `Priya`).
* **Resolution**: Normalized to titlecase matching flatmates.

### 5. Missing Payer (Cleaning Supplies)
* **Issue**: Row 13 had amount ₹780 but `paid_by` was blank, noted as "can't remember who paid".
* **Detection**: Empty cell in `paid_by`.
* **Policy**: Flag as critical warning. Prompt the user to select the payer in the staging dropdown before committing (defaults to `u_unknown`).
* **Resolution**: Interactive selector in the UI.

### 6. Missing Currency (DMart Groceries)
* **Issue**: Row 28 (DMart groceries) was missing its currency field.
* **Detection**: Empty cell in `currency`.
* **Policy**: Default to `INR`.
* **Resolution**: Auto-selected `INR` and flagged as warning.

### 7. Zero Amount (Swiggy Dinner Order)
* **Issue**: Row 31 had amount ₹0, with note "counted twice earlier - fixing later".
* **Detection**: Amount parsed equals 0.
* **Policy**: Flag as warning. Exclude from general ledger or allow user to input a correct value.
* **Resolution**: Staged as unchecked (do not import) by default.

### 8. Negative Amount (Parasailing Refund)
* **Issue**: Row 26 had amount -$30 USD, representing a refund.
* **Detection**: Amount is less than 0.
* **Policy**: Ingest as a negative expense, where the splits subtract from the debts of participants, decreasing their overall balances.
* **Resolution**: Processed as a refund.

### 9. Percentages Summing to 110%
* **Issue**: Pizza Friday (Row 15) and Weekend Brunch (Row 32) percentage splits sum to 110%.
* **Detection**: Check if `split_type = 'percentage'` and splits sum to > 100%.
* **Policy**: Normalize percentages proportionally so they total exactly 100% (e.g., multiply each by `100/110`).
* **Resolution**: Automate re-balancing.

### 10. Equal Split with Share Weight details
* **Issue**: Row 42 (Furniture for Common Room) says split type is `equal`, but split details list `Aisha 1; Rohan 1; Priya 1; Sam 1` (shares).
* **Detection**: Equal split type combined with numeric split details.
* **Policy**: Default to equal division among listed members.
* **Resolution**: Normalized to equal splits and flagged warning.

### 11. Settlements Logged as Expenses
* **Issue**: Row 14 (Rohan paid Aisha ₹5,000) and Row 38 (Sam deposit ₹15,000 to Aisha) are peer-to-peer repayments/deposits, not general group expenses.
* **Detection**: Filter descriptions containing payment terms or single-member splits.
* **Policy**: Flag as `is_settlement = TRUE`. Exclude from shared expense divisions and apply as direct balances transfers.
* **Resolution**: Categorized as repayments.

### 12. Duplicate Entries
* **Issue**: Dinner at Marina (Rows 4 and 5) logged twice. Dinner at Thalassa logged by Rohan (₹2,450) and Aisha (₹2,400) with slight discrepancies.
* **Detection**: Exact duplicate search (same payer, date, amount, description) and conflict duplicates search (similar name, date, different amounts).
* **Policy**: Staged sandbox flags duplicates. Meera can toggle off duplicates, choosing which one to import.
* **Resolution**: Interactive checkbox selection in the importer UI.

### 13. Temporal Membership Violations
* **Issue**: Row 36 (Groceries) includes Meera, who moved out March 31. Rows 39, 40, and 41 include Sam, who moved in April 15 (but dates are earlier: April 10, 12, 14).
* **Detection**: Compare expense date against member move-in/move-out boundaries.
* **Policy**: Filter out inactive members from splits and divide the cost only among active members.
* **Resolution**: Automated exclusion during split calculations.

---

## 2. PostgreSQL Relational Schema Design

```sql
-- Schema version 1.0.0
-- Dialect: PostgreSQL

-- Users Table
CREATE TABLE users (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  joined_at TIMESTAMP NOT NULL,
  left_at TIMESTAMP
);

-- Groups Table
CREATE TABLE groups (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Group Memberships Table
CREATE TABLE group_memberships (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  group_id VARCHAR(50) NOT NULL,
  joined_at TIMESTAMP NOT NULL,
  left_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_group UNIQUE (user_id, group_id)
);

-- Expenses Table
CREATE TABLE expenses (
  id VARCHAR(50) PRIMARY KEY,
  group_id VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  exchange_rate DECIMAL(12, 6) DEFAULT 1.0,
  date TIMESTAMP NOT NULL,
  paid_by_id VARCHAR(50) NOT NULL,
  split_type VARCHAR(50) NOT NULL,
  split_details TEXT,
  notes TEXT,
  is_settlement BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (paid_by_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Expense Splits Table
CREATE TABLE expense_splits (
  id VARCHAR(50) PRIMARY KEY,
  expense_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT unique_expense_user UNIQUE (expense_id, user_id)
);
```
