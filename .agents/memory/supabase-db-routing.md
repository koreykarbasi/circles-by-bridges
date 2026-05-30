---
name: Supabase DB routing
description: server/db.ts prefers SUPABASE_URL over DATABASE_URL; migrations must target the same connection string the server uses.
---

## Rule
`server/db.ts` connects via: `const connectionString = process.env.SUPABASE_URL || process.env.DATABASE_URL;`

Any schema migration (ALTER TABLE, etc.) must be run against `SUPABASE_URL` if that env var is set, not just `DATABASE_URL`.

**Why:** Two separate databases exist — local PostgreSQL (DATABASE_URL, `heliumdb`) and Supabase (`SUPABASE_URL`, `postgres`). Running migrations against DATABASE_URL only leaves the server's actual database unchanged.

**How to apply:** In migration scripts, replicate the same fallback logic:
```js
const connectionString = process.env.SUPABASE_URL || process.env.DATABASE_URL;
const isExternal = connectionString && (connectionString.includes('supabase.com') || connectionString.includes('neon.tech') || connectionString.includes('sslmode=require'));
const pool = new Pool({ connectionString, ...(isExternal ? { ssl: { rejectUnauthorized: false } } : {}) });
```
