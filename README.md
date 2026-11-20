# RaterReady

Stage A recruiter demo — `DEMO - SYNTHETIC`.

Steps 1–2 contain the Next.js App Router shell, strict TypeScript, Tailwind CSS,
server environment validation, a hot-reload-safe Prisma singleton, the PostgreSQL
schema, an initial migration, and repeatable synthetic fixtures. No UI pages,
authentication routes, middleware, or API endpoints are included yet.

Use Node.js 22.12+ and run `npm ci`. Configure a root `.env` using `.env.example`:
set `DATABASE_URL` to the Neon pooled connection string and `DIRECT_URL` to the
unpooled connection string for the **same database and branch**. Set a random
`AUTH_SECRET` of at least 32 characters. Keep `ENABLE_LIVE_ZDR_GRADING="false"`.
Prisma 6 loads `.env`, not Next.js's `.env.local`; avoid conflicting values if
you already created `.env.local` during Step 1. Neither file belongs in Git.

Apply the checked-in initial migration and run the seed twice:

```sh
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npx prisma db seed
```

Use the migration rather than `prisma db push`: the migration also installs
PostgreSQL CHECK constraints and append-only audit triggers, which Prisma's
schema language cannot express. No migration or seed is automatically applied
to Neon during development of these files. `package.json#prisma.seed` is the
Prisma 6 seed configuration (its Prisma 7 deprecation warning is expected).

The seed transaction upserts `demo-marcus` (Marcus Vance, Generalist/Foundations),
`demo-elena` (Elena Rostova, Technical Preview/Advanced), and `admin-michael`
(Michael Anthony Sprague, sole owner reviewer). It adds two published Generalist
practice scenarios with synthetic owner-approved alternate judgments, one pinned
rubric, and two independent public information links. No passwords, attempts,
judges, credentials, or capstone scenarios are seeded. Profile choices, timing
settings, diagnostics, completed modules, existing versioned scenario content,
and audit history survive reruns. Changed rubric/scenario content needs a new
version. Stable unique keys prevent duplicate rows; seed history uses an
insert-on-conflict-do-nothing audit event.

The public [DataAnnotation](https://www.dataannotation.tech/) and
[Outlier](https://outlier.ai/) information pages were checked on November 20,
2026. The demo listings make no claim about acceptance, work availability,
compensation, or recognition of RaterReady credentials, and both explicitly
disclose `NO_FORMAL_PARTNERSHIP`. Rerunning the seed does not refresh verification
dates or overwrite later curation.

Verify the source:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

`npm test` runs 20 tests without database access. Ten additional integration
tests are opt-in: supply `TEST_DATABASE_URL` for a disposable local PostgreSQL
database named `raterready_test*` (for example,
`postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test`). The suite applies
the migration, seeds repeatedly, and checks identity stability, preserved
progress, score boundaries, judge slots, sharing defaults, and audit mutation
rejection. It refuses remote URLs; never use your Neon application database.

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
```

Database constraints cover structural invariants. Later server workflows must
authorize candidate/admin actions, compare judge criteria, enforce policy and
timer locks, require Michael's preliminary rubric before AI reveal and explicit
final review before certification, select only learner-safe scenario fields,
and return uniform unavailable public verification states. The schema itself
does not expose any content or perform these workflows. Public credential
fields use a closed enum allowlist, with sharing off by default. Audit triggers
reject updates, deletes and truncation; a database owner can still change DDL,
so deployed application connections should use a non-owner role.

`npm run dev` starts the development server; the empty shell returns Next.js's
default 404. Prisma 6 remains pinned to support `@prisma/client` without adding
a driver adapter. Existing npm audit findings in Prisma 6 CLI dependencies
remain outside this step's scope.
