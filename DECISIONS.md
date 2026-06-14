# DECISIONS.md - Decision Log

This document records the significant design and engineering decisions made during the development of **LedgerMate**, along with the options considered and rationales for selection.

---

## 1. Database Choice: PostgreSQL with Raw SQL (No ORM)
* **Context**: The assignment description requires "Use relational DBs only". The user requested the MERN/PERN stack.
* **Options Considered**:
  1. **MongoDB (MERN)**: Denied. Violated the relational DB assignment constraint.
  2. **Prisma ORM with SQLite**: Denied. The user requested not to use Prisma or similar ORMs.
  3. **PostgreSQL with raw `pg` queries**: **Selected**. complied with the relational requirement, satisfied the user's stack preference, and utilized raw queries.
* **Rationale**: Raw SQL queries allow precise mapping of transactions and split aggregates, which are easily trace-verified during evaluation. PostgreSQL was the selected relational choice.

---

## 2. In-App Sandbox Staging for CSV Import (Meera's Request)
* **Context**: Meera requested approval control over any deletions or duplicate cleaning before database commits.
* **Options Considered**:
  1. **Automatic Script Ingestion**: Denied. Users cannot verify adjustments or exclude rows interactively.
  2. **Interactive Command-Line Prompts**: Denied. Too clunky and error-prone.
  3. **Visual Sandbox Staging Board**: **Selected**. Ingests the CSV, highlights anomalies/warnings with tags, displays imputed dates, and provides checkable rows to approve or reject items before writing to Postgres.
* **Rationale**: Offers the highest quality user experience and satisfies Meera's constraints completely.

---

## 3. Date Overflow Re-interpolation
* **Context**: Excel overflow corrupted dates into `########` sequences.
* **Options Considered**:
  1. **Discard rows**: Denied. Violates the requirement to ingest the file exactly.
  2. **Default to today's date**: Denied. Messes up chronological timelines (e.g., placing February electricity in April).
  3. **Chronological interpolation**: **Selected**. Scans adjacent valid date cells and calculates the midpoint date.
* **Rationale**: Reconstructs chronological ordering naturally without manual intervention, while still showing warnings so the user can verify.

---

## 4. Multi-Currency Consolidation Strategy (Priya's Request)
* **Context**: Priya complained that the sheet treated USD and INR as equivalent, which is incorrect.
* **Options Considered**:
  1. **Separate Ledgers per Currency**: Denied. Makes calculating simplified net balances complex (who pays whom is hard to tell with multiple currencies).
  2. **Convert everything to INR on ingestion**: **Selected**. Keeps database entries in original currencies but applies `exchange_rate` conversion (1 USD = 83 INR) when calculating net balances.
* **Rationale**: Satisfies Rohan's request to see original currency values in his ledger, while satisfying Priya's request for mathematically accurate conversions.

---

## 5. Debt Simplification Algorithm (Aisha's Request)
* **Context**: Aisha wanted "one number per person: who pays whom, how much, done."
* **Options Considered**:
  1. **Direct Pairwise Settlement**: Denied. Leads to redundant transfers (e.g. A pays B, B pays C, A pays C).
  2. **Greedy Flow Minimization Algorithm**: **Selected**. Calculates net balances, sorts debtors and creditors, and greedily matches the largest of each, outputting the minimal transaction path.
* **Rationale**: Yields the absolute minimum number of settlement payments.
