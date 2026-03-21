---
name: db-migrations-only
description: Never use db:push, always use db:migrate for database changes
type: feedback
---

NEVER run `db:push` on the database. Always use `db:migrate` instead.

**Why:** db:push can destructively alter tables and lose data. Migrations are safe and reversible.

**How to apply:** When schema changes are needed:
1. Run `bun run db:generate` to create a migration file
2. Run `bun run db:migrate` to apply it
3. Never run `bun run db:push`
