# RaterReady

Stage A synthetic stakeholder demo — `DEMO - SYNTHETIC`.

Steps 1–4 contain the Next.js App Router shell, strict TypeScript, Tailwind CSS,
server environment validation, a hot-reload-safe Prisma singleton, the PostgreSQL
schema/migrations, repeatable synthetic fixtures, and Auth.js v5 Credentials
authentication with server-side RBAC, accessible sign-in, and protected role landing
shells. There is no public registration or role-selection flow. Onboarding,
diagnostics, evaluation workspaces and owner review tools are not implemented yet.

Use Node.js 22.12+ and run `npm ci`. Configure a root `.env` using `.env.example`:
set `DATABASE_URL` to the Neon pooled connection string and `DIRECT_URL` to the
unpooled connection string for the **same database and branch**. Set a random
`AUTH_SECRET` of at least 32 characters. Keep `ENABLE_LIVE_ZDR_GRADING="false"`.
Set distinct random `DEMO_MARCUS_PASSWORD`, `DEMO_ELENA_PASSWORD`, and
`DEMO_MICHAEL_PASSWORD` values of 8–128 characters before seeding. These are
seed-only inputs for the three `DEMO - SYNTHETIC` accounts; never commit them.
Prisma 6 loads `.env`, not Next.js's `.env.local`; avoid conflicting values if
you already created `.env.local` during Step 1. Neither file belongs in Git.

Apply the checked-in migrations (including the Step 3 authentication migration)
and run the seed twice:

```sh
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npx prisma db seed
```

Use the migration rather than `prisma db push`: the migration also installs
PostgreSQL CHECK constraints, append-only audit triggers, and session-revocation
triggers, which Prisma's schema language cannot express. No migration or seed is
automatically applied to Neon during development of these files. `package.json#prisma.seed` is the
Prisma 6 seed configuration (its Prisma 7 deprecation warning is expected).

The seed transaction upserts `demo-marcus` (Marcus Vance, Generalist/Foundations),
`demo-elena` (Elena Rostova, Technical Preview/Advanced), and `admin-michael`
(Michael Anthony Sprague, sole owner reviewer). It adds two published Generalist
practice scenarios with synthetic owner-approved alternate judgments, one pinned
rubric, and two independent public information links. Only salted scrypt hashes
are stored, using Node's asynchronous scrypt with N=32768, r=8, p=3 and timing-safe
verification ([OWASP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)).
Missing hashes on migrated accounts are provisioned once. Reseeding never resets
existing passwords, roles, disabled/revoked status, or session versions; changing
seed environment values is not password rotation. No attempts, judges,
credentials, or capstone scenarios are seeded. Profile choices, timing
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

`npm test` includes the real Auth.js CSRF/Credentials/cookie exchange with an
in-memory database test double, password hashing, middleware and guard tests.
PostgreSQL integration tests are opt-in: supply `TEST_DATABASE_URL` for a disposable
local PostgreSQL database named `raterready_test*` (for example,
`postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test`). The suite applies
the migrations, seeds repeatedly with test-only passwords, and checks identity
stability, preserved progress, score boundaries, judge slots, sharing defaults,
audit mutation rejection, database credential verification and session revocation.
It refuses remote URLs; never use your Neon application database.

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
```

Auth.js uses only the Credentials provider at `/api/auth/[...nextauth]`; sign-in
accepts `accountCode` and `password`. Invalid passwords, unknown identifiers,
disabled/revoked accounts, and non-fixture/unapproved accounts all produce the
same generic `CredentialsSignin` result. Each attempt performs one fixed-cost
KDF, including unknown accounts, to avoid a cheap account-enumeration timing
shortcut. Password hashes and credentials never enter session payloads. Auth.js
provides CSRF protection and encrypted HttpOnly session cookies; production uses
secure cookies over HTTPS. Only the three seeded account codes with their
expected database roles are eligible during Stage A.

JWT sessions last at most eight hours between refreshes. Every server session
check reads the database for active status, current role, synthetic eligibility,
and matching `sessionVersion`. Increment `User.sessionVersion` to revoke all
sessions; a PostgreSQL trigger automatically increments it on changes to the
password hash, account status, role, account code, or fixture eligibility. This
prevents old cookies from reviving after an account is re-enabled. Deleted users
and database outages also fail closed.

Call `requireSession()`, `requireCandidate()`, or `requireAdmin()` from
`src/lib/auth.ts` at the start of **every future protected route handler and
Server Action**. They independently re-read PostgreSQL and return a minimal
identity; failures throw `AuthorizationError` with generic 401/403 status/message.
`requireCandidate()` also denies admins because accounts have distinct roles.
Never take a session/user/role from a submitted form or client payload.

Request middleware lives in `src/proxy.ts`, the
[Next.js 16 middleware convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
Routes are private by default. Only `/`, `/login`, `/verify/*`, and the Auth.js
protocol endpoints are public; framework static assets are excluded. `/admin/*`
and `/api/admin/*` require the current owner reviewer role. Anonymous requests
receive generic 401 JSON, candidates receive 403 on admin routes, and permitted
requests continue. `/dashboard/*` additionally requires the candidate role.
Anonymous browser page GET/HEAD requests go to `/login`; API, RSC and mutation
requests retain explicit denials. This includes direct URL and Server Action access.
For production outside Vercel, configure Auth.js's trusted deployment URL/host
according to your reverse proxy rather than assuming forwarded headers are safe.

Database constraints cover structural invariants. Later server workflows must
use these authorization guards, compare judge criteria, enforce policy and
timer locks, require Michael's preliminary rubric before AI reveal and explicit
final review before certification, select only learner-safe scenario fields,
and return uniform unavailable public verification states. The schema itself
does not expose any content or perform these workflows. Public credential
fields use a closed enum allowlist, with sharing off by default. Audit triggers
reject updates, deletes and truncation; a database owner can still change DDL,
so deployed application connections should use a non-owner role.

`npm run dev` starts the development server. Open `http://localhost:3000/login`.
The root `/` sends anonymous visitors to sign-in and signed-in users to the
destination for their fresh database role. Candidates land on `/dashboard` and
the owner reviewer lands on `/admin`. `/login` also redirects existing sessions.
Both pages authorize independently on the server, display the current identity
and role, keep the `DEMO - SYNTHETIC` notice visible, and provide sign-out.
The form uses labeled inputs, associated field errors, an accessible visibility
toggle, a polite failure live region, and keyboard submission. Generic errors
never reveal whether an account exists or is disabled; form state never returns
the submitted password. Successful sign-in uses a fixed `/` gateway rather than
client-supplied roles or redirect URLs.

For manual browser checks, sign in with each of the three seeded account codes
and the corresponding password you configured in `.env`. Check password visibility
and submission using Tab/Enter/Space, try invalid credentials, confirm the role
destination, revisit `/login` while signed in, try the other role's landing URL
(403), and sign out. Check a narrow viewport and browser zoom as well.

Automated browser checks run against an isolated **local** test database; they
refuse a Neon URL and start their own Next.js server on port 3100. Create an empty
PostgreSQL database named `raterready_test*`; the setup migrates and seeds it with
test-only passwords. Stop any other development server for this checkout first.
Do not run the database and browser suites concurrently on
the same test database because both exercise account status changes.

```sh
npx playwright install --with-deps chromium
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
```

The browser suite covers all three demo accounts, sign-out, existing-session
routing, unauthorized direct navigation, generic failures, keyboard focus and
visibility controls, mobile reflow, 200% text sizing, and axe WCAG 2.2 AA checks.
Automated accessibility checks supplement manual keyboard and screen-reader
review. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an existing local
Chromium executable. A development environment with restricted Turbopack workers
can preview using `npm run dev -- --webpack`.

Prisma 6 remains pinned to support `@prisma/client` without
adding a driver adapter. Existing npm audit findings in Prisma 6 CLI dependencies
remain outside this step's scope.
