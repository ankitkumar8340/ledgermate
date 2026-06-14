# DECISIONS.md — Decision Log

This document records every significant design and engineering decision made during the development of **LedgerMate**, including the options considered and the rationale for the chosen approach.

---

## Decision 1 — Database: PostgreSQL with Raw SQL (No ORM)

**Context**: The assignment required "relational DBs only." The initial AI plan suggested Prisma ORM with SQLite.

**Options Considered**:
| Option | Verdict | Reason |
|--------|---------|--------|
| MongoDB (MERN) | ❌ Rejected | Violated the relational DB constraint |
| SQLite + Prisma ORM | ❌ Rejected | User explicitly forbade ORMs; SQLite not suitable for cloud deploy |
| PostgreSQL + raw `pg` queries | ✅ **Chosen** | Satisfies relational requirement, enables raw SQL precision, cloud-deployable |

**Rationale**: Raw SQL allows every query to be independently verified during an interview. The PostgreSQL `pg` pool also handles connection management without abstraction, making the data layer fully transparent. Neon was chosen as the cloud host because it offers serverless PostgreSQL with a free tier and zero cold-start latency for DB connections.

---

## Decision 2 — CSV Import: Interactive Staging Sandbox (Not Auto-Commit)

**Context**: The CSV contained 13+ deliberate anomalies. An automatic import script would silently swallow errors.

**Options Considered**:
| Option | Verdict | Reason |
|--------|---------|--------|
| Auto-import script | ❌ Rejected | No user visibility; silently corrupts data on bad rows |
| CLI interactive prompts | ❌ Rejected | Clunky for 50+ rows; can't handle duplicate comparison side-by-side |
| Visual Staging Sandbox UI | ✅ **Chosen** | Shows every anomaly inline, lets user approve/reject/edit before commit |

**Rationale**: Meera's requirement was explicit: no deletions or duplicates without approval. A visual sandbox was the only approach that met this while also satisfying the auditor (Rohan) who needs to see exactly what was imported and why.

---

## Decision 3 — Date Overflow Handling: Chronological Interpolation

**Context**: Excel date cells overflowed to `########` strings in ~10 rows. The dates could not simply be discarded.

**Options Considered**:
| Option | Verdict | Reason |
|--------|---------|--------|
| Discard the row | ❌ Rejected | Assignment requires ingesting the full file |
| Default to today's date | ❌ Rejected | Breaks temporal membership logic (places Feb expenses in June) |
| Interpolate from neighboring rows | ✅ **Chosen** | Reconstructs chronological order naturally; still shows warning for user override |

**Rationale**: Adjacent rows in the CSV are chronologically ordered, so interpolation yields a high-confidence inferred date. The Staging Sandbox shows the inference and lets the user override, satisfying both automation and transparency requirements.

---

## Decision 4 — Multi-Currency: Store Original, Convert at Query Time

**Context**: Priya's requirement: USD and INR cannot be treated as equivalent (1:1). Rohan's requirement: show original transaction amounts.

**Options Considered**:
| Option | Verdict | Reason |
|--------|---------|--------|
| Separate ledger per currency | ❌ Rejected | Makes debt simplification impossible across currencies |
| Convert to INR on import (lose original) | ❌ Rejected | Rohan can't see the original USD amounts; loses audit trail |
| Store original + exchange_rate, convert at query time | ✅ **Chosen** | Satisfies both Priya (correct math) and Rohan (original values visible) |

**Rationale**: Each `expenses` row stores `amount`, `currency`, and `exchange_rate`. The ledger query multiplies by `exchange_rate` to compute INR equivalents. The rate (1 USD = 83 INR) is stored on the row at import time, so historical rates are preserved.

---

## Decision 5 — Debt Simplification: Greedy Flow Minimization

**Context**: Aisha's requirement: "one number per person — who pays whom, how much, done."

**Options Considered**:
| Option | Verdict | Reason |
|--------|---------|--------|
| Pairwise settlement (A→B, B→C, A→C) | ❌ Rejected | Produces redundant transfers; N² transactions for N people |
| Greedy flow minimization | ✅ **Chosen** | O(N log N); provably minimal number of transactions |

**Rationale**: The algorithm:
1. Computes each member's net balance (total paid − total owed in INR)
2. Splits into debtors (negative balance) and creditors (positive balance)
3. Greedily matches the largest debtor to the largest creditor
4. Iterates until all balances reach zero

For 5 flatmates this yields at most 4 transactions instead of up to 10 pairwise ones.

---

## Decision 6 — Authentication: Session Tokens (Not JWT)

**Context**: The app needed login to track who is committing CSV imports to the audit log.

**Options Considered**:
| Option | Verdict | Reason |
|--------|---------|--------|
| No auth (open API) | ❌ Rejected | Cannot attribute audit log entries to a specific user |
| JWT (stateless) | ❌ Rejected | Cannot be server-side invalidated; adds complexity without benefit at this scale |
| DB-backed session tokens | ✅ **Chosen** | Simple, auditable, invalidatable; stored in `sessions` table |

**Rationale**: A random token stored in the `sessions` table with an `expires_at` column is sufficient for a co-living app. Server can invalidate it instantly, and every request is traceable to the session's `user_id`.

---

## Decision 7 — Temporal Membership Enforcement: Query-Time Filtering (Not Trigger)

**Context**: Expenses must be split only among members active on the expense date (Meera left Mar 31, Sam joined Apr 15).

**Options Considered**:
| Option | Verdict | Reason |
|--------|---------|--------|
| PostgreSQL trigger on INSERT | ❌ Rejected | Hard to debug; silently drops members with no UI feedback |
| Application-layer filtering at query time | ✅ **Chosen** | Transparent; anomaly shown in Staging Sandbox before commit |

**Rationale**: The CSV parser checks membership windows at import time and surfaces violations in the Staging Sandbox UI (Anomaly 13). The final ledger SQL also filters splits by membership dates for correctness at read time. Double enforcement = zero data integrity risk.
