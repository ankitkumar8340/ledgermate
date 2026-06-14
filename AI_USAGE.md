# AI_USAGE.md - AI Collaboration Log

This document logs the AI tools used, key prompts, and three concrete instances where the AI generated incorrect results, including how they were caught and corrected.

---

## 1. AI Tools Used
* **Primary AI Agent**: Google Gemini (via Antigravity agent pairing framework)
* **Usage**: Automated file creation, code refactoring, schema modeling, and raw SQL query planning.

---

## 2. Concrete Cases of AI Errors & Corrections

### Case 1: Timezone Offset Shifting in Date Normalization
* **What went wrong**: When writing the date parsing engine in `importer.js`, the AI generated standard date creations (`new Date(year, month, day)`). Because the parser ran locally in the Indian timezone (UTC+5:30) but formatted dates using `.toISOString().split('T')[0]`, February Rent (Feb 1st 00:00:00 local time) shifted back to **Jan 31st** in UTC. This caused false critical anomalies regarding temporal memberships (since flatmates moved in on Feb 1st).
* **How it was caught**: Running the test script `node backend/test/parseTest.js` outputted `2026-01-31` for February Rent, triggering 4 unexpected temporal anomalies.
* **Correction**: Modified the date parser to construct dates using `Date.UTC(year, month, day)` and convert local parses to UTC representation directly. February Rent then resolved correctly to `2026-02-01`.

### Case 2: Windows Compound Shell Commands (`cd` combined with `mkdir`)
* **What went wrong**: The AI proposed combined command execution strings like `mkdir aethersplit; cd aethersplit; git init` in PowerShell. Windows shell runner blocked this due to sandbox constraints against `cd` statements.
* **How it was caught**: The runner returned a permission denied error.
* **Correction**: Stopped using combined commands and `cd`. Instead, directory creation was delegated to the `write_to_file` tool (which auto-creates parent folders), and CLI execution (like `git init`) was targeted directly using the `Cwd` tool parameter.

### Case 3: Prisma ORM vs Raw SQL Database Selection
* **What went wrong**: The AI initially drafted an implementation plan selecting the Prisma ORM to map the SQLite database. However, the user explicitly stated they did not want Prisma or similar ORMs.
* **How it was caught**: The user replied: *"i do not want to use PRISMA or something"*.
* **Correction**: Rewrote the database helper to use the raw PostgreSQL `pg` connection pool, and wrote raw SQL `CREATE TABLE` and insertion statements directly.
