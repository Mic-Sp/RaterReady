# RaterReady

Stage B account foundation, with the Stage A `DEMO - SYNTHETIC` demo preserved.

## Step 13A — Stage B account lifecycle foundation

Stage A remains available alongside the Stage B schema foundation. The audit found
that `User.isSyntheticFixture` defaulted to true, authentication admitted only three
seeded codes, and sessions/navigation/banner copy always claimed synthetic access.
The capstone profile lock also conflated a synthetic exam with a synthetic account.
There are no public registration or client-selected role-assignment paths; role guards
re-read PostgreSQL in addition to the default-private proxy policy.

`User.isSyntheticFixture` now defaults to false, while scenario/attempt fixture
defaults stay unchanged. `demoLabel` is nullable with no default. Optional unique,
lowercase/trimmed `email`, nullable `emailVerifiedAt`, and paired
`closedAlphaConsentAcceptedAt` / `closedAlphaConsentVersion` record lifecycle state.
The timestamp is the verification status source of truth; no duplicate boolean is
stored. Existing users are preserved by the additive migration. The seed explicitly
marks/pre-verifies only the three approved synthetic codes using a stable fixture
timestamp, never fabricates consent, preserves existing verification, passwords,
status, roles and progress, and refuses reserved-code collisions with live accounts.

`AuthToken` separates `EMAIL_VERIFICATION` and `PASSWORD_RESET`. Internal server-only
transaction primitives generate 256-bit random bearer secrets and persist only
SHA-256 hashes. Unique digest, account/purpose and expiration indexes support lookup
and cleanup. Database checks cap lifetimes at 24 hours for verification and one hour
for reset. Immutable token identity/expiry, irreversible consumption, database time,
account locking and a session-version snapshot enforce single use and revocation.
Future workflow callers must consume and apply their account change in the same
transaction; rollback restores usability. No token issuance/consumption endpoint,
email delivery, registration, verification or reset UI is included in this step.

Sessions expose only database-verified `isSyntheticFixture`, an ISO/null
`emailVerifiedAt` and a derived nullable `demoLabel`, alongside the existing minimal
identity. Seeded account code/role checks remain exact. Separately provisioned live
candidates need an active account, password, email verification and recorded consent;
this does not create an invitation/provisioning flow or enable live reviewer access.
Email, verification and consent changes revoke old sessions and outstanding tokens.
The account header/banner uses amber `DEMO - SYNTHETIC` for demo accounts and
`Closed Alpha` for live accounts. Synthetic practice/exam/credential labels remain
independent. The capstone profile lock checks active candidate status, leaving
synthetic blueprint/scenario validation and all scoring/review rules intact.

Verification includes token hashing/input boundaries, real Auth.js cookies and RBAC,
seed preservation/collision protection, lifecycle defaults/constraints, concurrent
single-use consumption, expiry, rollback, revocation, account rendering, and a
disposable live-account browser fixture. Existing candidate/admin browser flows,
synthetic scenario labels, mobile reflow and WCAG contrast checks remain covered.

Apply this additive migration and seed using the configured `.env` (no reset):

```sh
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

Use separate disposable **local** `raterready_test*` databases for integration and
browser verification. With this workspace's local test cluster running:

```sh
npm run typecheck
npm run lint
TEST_DATABASE_URL='postgresql://raterready@127.0.0.1:55485/raterready_test13a' npm test
LD_LIBRARY_PATH='/tmp/portfolio-preview-browser/libs/usr/lib/x86_64-linux-gnu' PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/home/micsp/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' TEST_DATABASE_URL='postgresql://raterready@127.0.0.1:55485/raterready_test13a_browser' npm run test:browser
npm run dev -- --webpack --hostname 127.0.0.1 --port 3000
```

The library/executable overrides use pre-existing Chromium assets in this workspace;
on a machine with Playwright's matching browser/dependencies installed, omit them.
Preview at `http://127.0.0.1:3000`. Sign in with each configured demo account and
check the amber badge, synthetic notice, role navigation and sign-out. Recheck
onboarding/level switching, practice saves, qualification-exam autosave/final submit,
rubric-first owner review, results/appeals, credential sharing/verification and
opportunities. Check keyboard focus and 320px/200% reflow. A separately provisioned
verified/consenting live candidate must show Closed Alpha in the header and retain
scenario badges; unverified/unconsented accounts and candidate-to-admin access fail
closed. The automated live fixture is removed after its browser test.

Steps 1–7C contain the Next.js App Router shell, strict TypeScript, Tailwind CSS,
server environment validation, a hot-reload-safe Prisma singleton, the PostgreSQL
schema/migrations, repeatable synthetic fixtures, and Auth.js v5 Credentials
authentication with server-side RBAC, accessible sign-in, and protected role landing
shells, adaptive Generalist onboarding, an optional diagnostic and a learning
dashboard, plus a server-only deterministic practice evaluator and expanded scenario
catalog, plus an accessible A/B practice workspace with saved drafts and persisted
practice participation, an optional Workflow Skills Lab and five non-credentialing
Technical Preview exercises, plus the isolated Generalist capstone blueprint,
readiness gate, server timer lifecycle and timed six-slot exam with continuous
autosave and locked deterministic submission, plus durable dual-judge written jobs,
synthetic grading and mandatory owner-review routing. There is no public registration
or role-selection flow. The owner adjudication console is reserved for Step 8.

Use Node.js 22.12+ and run `npm ci`. Configure a root `.env` using `.env.example`:
set `DATABASE_URL` to the Neon pooled connection string and `DIRECT_URL` to the
unpooled connection string for the **same database and branch**. Set a random
`AUTH_SECRET` of at least 32 characters. Keep `ENABLE_LIVE_ZDR_GRADING="false"`.
Set distinct random `DEMO_MARCUS_PASSWORD`, `DEMO_ELENA_PASSWORD`, and
`DEMO_MICHAEL_PASSWORD` values of 8–128 characters before seeding. These are
seed-only inputs for the three `DEMO - SYNTHETIC` accounts; never commit them.
Prisma 6 loads `.env`, not Next.js's `.env.local`; avoid conflicting values if
you already created `.env.local` during Step 1. Neither file belongs in Git.

Apply the checked-in migrations (including adaptive learning, practice workspace and capstone blueprint migrations)
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
(Michael Anthony Sprague, sole owner reviewer). It preserves the two original
published practice fixtures and rubric v1, and adds six published competency-specific
Generalist practice families pinned to rubric v2 (eight Generalist practice scenarios),
plus five Technical Preview practice families pinned to a separate technical rubric v1.
Twelve distinct isolated capstone families provide two fresh six-scenario forms,
pinned to capstone blueprint v1, capstone rubric v1 and immutable scoring policy v1.
Approved alternatives include valid ties and alternate preferences. The two
independent public information links are retained. Only salted scrypt hashes
are stored, using Node's asynchronous scrypt with N=32768, r=8, p=3 and timing-safe
verification ([OWASP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)).
Missing hashes on migrated accounts are provisioned once. Reseeding never resets
existing passwords, roles, disabled/revoked status, or session versions; changing
seed environment values is not password rotation. No attempts, judges or
credentials are seeded. Profile choices, timing
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
destination for their fresh database role. Candidates enter `/dashboard`; new
learners without an explicit level choice continue to `/onboarding`. The owner
reviewer lands on `/admin`. `/login` also redirects existing sessions.
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

The Step 5 learning flow is candidate-only at both the page and Server Action
boundaries:

- `/onboarding` offers the optional, untimed, non-certifying skills check and all
  three levels equally. Choosing any level records that choice in PostgreSQL.
- `/diagnostic` contains six short `DEMO - SYNTHETIC` selection tasks covering
  rubric use, comparison, verification, justification selection and independent
  workflow. No personal narrative or nuanced-prose scoring is collected. Save
  partial selections or skip before/during the check without an explanation.
- Completing the check records advisory G1–G6 feedback and a suggested level in
  `DiagnosticSession`, isolated from assessment and credential tables. Suggestions
  never assign a level; all levels remain selectable. G1–G6 are RaterReady's
  internal Generalist competency identifiers, not an industry standard.
- `/dashboard` reads saved profile/completion records, resumes the next lesson,
  allows level switching, and shows completions separately for each level.
  `/learn/G1` through `/learn/G6` are unscored reference lessons with idempotent,
  self-marked reading completion. These marks are not scored practice results.
- The separate readiness card remains **Not yet assessed** regardless of lesson
  or diagnostic completion. The 85% finalized capstone standard is unchanged,
  and none of these flows issues a credential.
- `/workflow-lab` and `/technical-preview` are optional orientation/reference
  entries only; the Technical Preview is explicitly non-credentialing.
- The native Seven-Step Independent Evaluation Method disclosure is available
  on demand from onboarding, dashboard, diagnostic and every reference level.

Run `npx prisma generate` and `npx prisma migrate deploy` before browser preview.
No additional seed data is needed. For a quick manual check, choose Advanced
Calibration immediately, mark a reference lesson complete, switch levels and
return to verify its completion remains saved. Start the optional check, skip
with no answers, resume/save a partial check, finish it and override its suggestion.

Step 6A adds server-only practice modules without practice UI pages or new endpoints:

- `src/server/practice/index.ts` exposes candidate-guarded `getPracticeScenario()`
  and `evaluatePractice()` entries for the future workspace. The session determines
  ownership; submitted identities/scores cannot grant authority.
- `getPracticeScenario()` selects a minimal learner DTO and deep-allowlists JSON.
  It never selects answer keys, approved alternatives, or expert explanations.
  Published synthetic Generalist **practice** records are the only eligible bank;
  diagnostic/capstone/draft rows cannot be loaded or evaluated through this module.
- `practice-scoring.ts` validates pinned scenario/rubric versions, structured keys,
  and explicit simulated owner approvals. An approved judgment receives all 40
  judgment points. Rubric application receives up to 30 points proportionally by
  aligned criterion; factual verification receives 25 for the exact source-ID set
  (order and duplication do not matter). Each alternative is a coherent interpretation;
  the evaluator never combines fragments from incompatible keys.
- Feedback includes rubric alignment and expert explanations after submission, plus
  the explicit rationale for an accepted alternative. It returns no key JSON or
  full alternative records. Malformed configuration fails closed rather than giving
  a candidate an automatic zero.
- Written justifications are stored verbatim for future practice review, bounded to
  12,000 characters, and never graded with regex, exact text, length heuristics or AI.
  The deterministic maximum is **95**, with the written five-point component and
  final score left unset. No pass/fail decision or credential is produced.
- Each retry creates another unfinalized `PRACTICE` submission and records family
  exposure. There is no capstone submission/timing behavior in this step.
- The new catalog follows the requested internal practice competency definitions:
  G1 Rubric Interpretation; G2 Response Quality Evaluation; G3 Factual Verification;
  G4 Comparative Judgment; G5 Safety & Policy Awareness; G6 Evaluation Justification
  & Calibration. Existing onboarding/diagnostic content and historical fixtures are
  preserved; the new catalog's public labels come from `generalist-competencies.ts`.

No schema migration or new dependency is required for Step 6A. With the existing
`.env` and demo passwords configured, run the seed twice to confirm repeatability:

```sh
npx prisma db seed
npx prisma db seed
npm run typecheck
npm run lint
npm test
```

The database integration suite also tests the expanded seed, all six persisted
primary keys, approved alternatives, independent retries, verbatim review storage,
pre-submission deep DTO isolation, and refusal of capstone keys before/after submission.
Use the earlier `TEST_DATABASE_URL=... npm test` command to include these checks.

Automated browser checks run against an isolated **local** test database; they
refuse a Neon URL and start their own Next.js server on port 3100. Create an empty
PostgreSQL database named `raterready_test*`; the setup migrates and seeds it with
test-only passwords. The test server uses a separate `.next-browser-tests` build
directory so an existing development server is left running.
Do not run the database and browser suites concurrently on
the same test database because both exercise account status changes.

```sh
npx playwright install --with-deps chromium
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
```

The browser suite covers all three demo accounts, sign-out, existing-session
routing, unauthorized direct navigation, generic failures, keyboard focus and
visibility controls, mobile reflow, 200% text sizing, and axe WCAG 2.2 AA checks.
It also covers direct advanced entry, diagnostic skipping before any answer,
saved partial selections, advisory placement overrides, and persisted progress
across level switches and reloads.
Automated accessibility checks supplement manual keyboard and screen-reader
review. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an existing local
Chromium executable. A development environment with restricted Turbopack workers
can preview using `npm run dev -- --webpack`.

Prisma 6 remains pinned to support `@prisma/client` without
adding a driver adapter. Existing npm audit findings in Prisma 6 CLI dependencies
remain outside this step's scope.

## Step 6B: A/B practice workspace

Candidate-only `/practice` filters the published synthetic Generalist practice
catalog by internal competency and scenario difficulty. `/practice/[scenarioId]`
renders a deep allowlisted DTO; capstone banks, answer keys and approved-alternative
records never enter its pre-submission HTML/RSC payload. Historical rubric-v1
fixtures receive public control labels without rewriting their pinned content.
The two responses sit side by side on desktop and follow the same A-then-B reading
order on mobile. Native fieldsets, radio controls, reference/scratchpad disclosures,
associated errors and focused feedback support keyboard and screen-reader use.

`updatePractice` rechecks the current candidate session for every save or submit.
`PracticeDraft` persists that learner's own partial selections and justification,
with server-confirmed save times and a revision comparison that rejects stale tabs.
Draft saves create no assessment or progress. Submitting atomically advances the
revision, evaluates against the pinned private practice key, creates an unfinalized
practice attempt, and increments `PracticeProgress` by competency/difficulty.
Retries have no quota. Practice participation and reference-lesson completions
remain separate; changing learning levels preserves both. The dashboard resumes
the most recently saved unfinished draft and links to every competency's scenarios.
Practice never establishes capstone eligibility, issues credentials or grades prose.
Scratchpad notes stay in page memory only: they are excluded from forms, actions,
database writes and browser storage. Reload or Clear research notes discards them.

Apply the new migration and regenerate the client before starting/restarting Next:

```sh
npx prisma generate
npx prisma migrate deploy
npm run typecheck
npm run lint
npm test
npm run dev
```

The integration suite tests partial saves, own-draft isolation, stale revision
rejection, atomic submissions/retries, approved ties, progress preservation and
capstone exclusion. Enable it with a disposable local database (never Neon):

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
```

The browser suite also checks real draft reloads, timestamps, scratchpad exclusion,
field-error focus, side-by-side/mobile layouts, 200% text reflow, axe accessibility,
alternative explanations, retries and dashboard participation updates.

Manual check using `demo-marcus` and your configured demo password:

1. From the dashboard, browse practice. Try competency/difficulty filters, clear
   them, and open G6 “Calibrate a judgment with evidence” at Advanced difficulty.
2. Tab through the response sections, reference disclosure and evaluation controls.
   Compare desktop and a 320px viewport/200% text view; all content should remain
   available in A-then-B order with visible keyboard focus.
3. Choose “A and B are tied,” enter a justification and temporary scratchpad note,
   then Save draft. Confirm the server timestamp/revision; no feedback or progress
   should appear. Return to the dashboard and use Resume saved draft. Reload to
   confirm selections/prose persist and scratchpad notes clear.
4. Rate all three criteria “Both meet the criterion,” select the supplied
   `demo-calibration-record` source, and submit. Confirm 95/95 structured points,
   “Approved alternative accepted,” its explanation and the expert explanation.
   Written/final scores and credentials remain unassigned.
5. Use Try again and submit another evaluation. Confirm another submission and
   the dashboard's G6 submission count, while capstone readiness stays unassessed.
   Switch learning levels and confirm prior lesson/practice progress remains.
6. Open one scenario in two tabs. Save in one, then save from the stale tab.
   Confirm a reload instruction appears and the newer server draft is preserved.

## Step 6C: Optional Workflow Skills Lab and limited Technical Preview

Candidate-only `/workflow-lab` offers a self-paced guide and five native-checkbox
self-checks for window arrangement, keyboard/tab navigation, evidence notes, time
allocation, and primary-source verification/triangulation. The checklist stays in
page memory, announces changes politely, and can be reset. It writes no database
progress and is never a Generalist credential prerequisite. The visible rules
notice reminds learners to follow third-party assessment/employer restrictions.

Candidate-only `/technical-preview` lists five original `DEMO - SYNTHETIC`
JavaScript review exercises: positive-sum comprehension, a strict-boundary bug,
input-preserving sorting, empty-input behavior, and ranking equivalent solutions.
The final exercise accepts an explicitly approved tie. Each published scenario
pins `demo-technical-evaluation` rubric v1 and supplies a synthetic contract/hand
trace for verification and expert explanations after submission. Seeding uses
stable family/version/bank upserts, preserving existing content and learner data.

`/technical-preview/[scenarioId]` reuses the responsive A/B practice workspace,
reference panel, temporary scratchpad, draft revision checks and deterministic
40/30/25 evaluation. Code is escaped text inside `pre`/`code`; nothing is executed.
Written prose remains ungraded, and the deterministic subtotal remains out of 95.
Catalog and workspace both prominently state that the preview is a future-track
exploration, grants no Technical credential, and does not alter Generalist capstone
eligibility. Technical submissions create only unfinalized `PRACTICE` attempts
tagged `TECHNICAL_PREVIEW` and their own scenario drafts. The fixed server track
prevents cross-track lookups; technical visits/submissions never update Generalist
practice progress, lesson completion, exposure history, profile placement, capstone
attempts, review cases or credentials. G1–G6 links are optional references to
RaterReady's internal Generalist habits, not Technical mastery credit.

No new schema migration or dependency is needed for Step 6C. Apply all existing
migrations first (including Step 6B's `PracticeDraft`/`PracticeProgress` tables),
then seed twice to verify repeatability and restart the development server:

```sh
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npx prisma db seed
npm run typecheck
npm run lint
npm test
npm run dev
```

The full opt-in database and browser suites use a disposable local test database,
never Neon. Run them sequentially as described earlier:

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
```

Tests cover all five deterministic fixtures, the approved tie, repeatable seeds,
unchanged Generalist/capstone/credential records, fixed-track authorization,
pre-submission key isolation, checklist labels/live feedback, native keyboard
controls, desktop/mobile code reflow, axe accessibility and dashboard navigation.

Manual check after signing in with either synthetic learner account:

1. Open Workflow Skills Lab from the dashboard. Read the optional/non-required and
   third-party rules notices. Use Tab/Space to toggle checks; confirm the announced
   count, Reset self-check, and reload behavior. Return to the dashboard.
2. Open Technical Preview. Confirm five exercises and the non-credentialing notice.
   Open any exercise; check both labeled synthetic code outputs, pinned rubric,
   contract/trace evidence, and Seven-Step reference. Check desktop and narrow views.
3. Save a partial draft and reload to verify persistence. Submit your completed
   comparison and review the immediate structured feedback and expert explanation.
4. In “Rank technical solutions,” choose “A and B are tied,” rate all three criteria
   “Both meet the criterion,” select `demo-positive-count-trace`, and justify the
   equivalence. Confirm 95/95 and the specific approved-alternative explanation.
5. Retry, browse back to the preview catalog, and return to the dashboard. Generalist
   lesson/practice counts and capstone readiness should remain unchanged; no
   Technical credential should appear.

## Step 7A: Capstone readiness, blueprint and timer lifecycle

The candidate-only `/capstone` screen checks actual submitted Generalist practice
coverage across all six internal G1–G6 areas. A practice submission is participation:
no minimum practice score or selected learning level is required. Self-marked
lessons, diagnostic scores, Workflow Skills Lab checks and Technical Preview do not
substitute. These activities never change the capstone's finalized 85% passing bar.
The dashboard links to this screen. The owned exam workspace and final submission
flow are described under Step 7B below; readiness itself discloses no questions or keys.

The repeatable seed adds twelve distinct Generalist `CAPSTONE` cases, covering
rubric scope, completeness, source verification, comparative judgment, safety and
calibration. They use separate families and a dedicated pinned rubric; practice
routes cannot list, load or evaluate them. `CapstoneBlueprint` v1 defines one slot
per G-area, exactly three written prompts (G1/G3/G6), **60 minutes** base duration,
**48 hours** retake cooldown and mandatory Generalist practice coverage. Immutable
`ScoringPolicy` v1 fixes 40 judgment / 30 rubric / 25 verification / 5 written points
and an 85% threshold after finalization. Step 7B averages deterministic dimensions;
normalizing the three written rubrics remains reserved for the grading/review steps.

Independent-Work Policy v1 prohibits external generative AI assistants, including
ChatGPT, Claude and Gemini; traditional search, primary sources and ordinary notes
are allowed. Its exact rules are pinned in the published blueprint and explicit
unchecked acknowledgment is required. The server stores acknowledgment and start
at the same database instant. Changed policy/version pins require reloading.

`src/server/capstone/service.ts` serializes start/read/resume requests with a
`CandidateProfile FOR UPDATE` lock, sampling PostgreSQL `clock_timestamp()` after
the lock. New starts atomically create the attempt, six pinned blank responses and
family-exposure records. Selection excludes every previously exposed family across
versions/banks. Duplicate starts return the existing active attempt; an additional
partial unique index prevents multiple open capstones even from another caller.
The finite demo bank initially supports two fresh forms per learner; after exhaustion
the gate requests more owner-provided capacity rather than recycling questions.

Deadline math is `startedAt + ceil(baseDurationSeconds * timeMultiplier)` seconds.
Only the numeric profile multiplier is used and snapshotted; no diagnosis/reason is
requested or stored. Resuming or changing profile/learning settings cannot change
an existing deadline. Published blueprints, their memberships, referenced capstone
content/rubrics and scoring policies are protected by SQL immutability triggers.
Attempt timing/version pins cannot be rewritten or closed attempts reopened.
New capstones must reference matching published pins; old unpinned history is kept
but cannot be resumed through this service.

Every capstone status/start/resume request records `EXPIRED` once database time is
at or past `expiresAt`; a denied start still commits that expiry observation.
Response writes are also blocked by a database trigger at the deadline even before
a page read persists the status. The visible active page refreshes server status
every 15 seconds and on returning to the tab; its displayed remaining seconds are
a server snapshot, never a client-clock authorization. Closed pages are reconciled
on the next server request (there is no background scheduler). Cooldown runs from
logical expiry, not a late visit; a finalized failure uses its finalized timestamp.
Abandoned attempts conservatively use their reserved deadline. Submitted/grading/
pending-review attempts remain held for owner review and are not expired while queued.

No lifecycle operation assigns scores, finalizes results or issues a credential.
The DAL selects only allocation metadata and returns a closed readiness DTO; no
scenario prompts, simulated outputs, keys, alternatives or expert explanations
are serialized by this screen. The start action ignores posted identities, clocks,
timing multipliers, pass flags and scores; all actions recheck candidate RBAC.

Apply the new migration before running the updated app and seed twice:

```sh
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npx prisma db seed
npm run typecheck
npm run lint
npm test
npm run dev
```

The migration preserves existing data. It requires no duplicate open capstones for
a candidate when creating its unique index; it does not silently delete or reset
such history. Neon is not modified automatically by development/tests.

Use a disposable local test database to include migration, immutable seed, race,
timing, cooldown, bank-capacity and key-isolation integration checks:

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
```

Manual browser checks using a synthetic learner:

1. Follow **Check capstone readiness** from the dashboard. Confirm missing-area
   links, numeric timing multiplier, fresh capacity, 85% standard and policy rules.
   Submit Generalist practice covering every G-area, regardless of score, then
   revisit. Diagnostic/lab/Technical activity must not waive missing areas.
2. When eligible, try Start without checking the policy box; confirm the associated
   error and no attempt. Read and explicitly acknowledge the policy, then start.
   Starting begins the synthetic timer and reserves fresh families. Use Resume to
   enter the timed workspace described below.
3. Confirm start, acknowledgment, fixed deadline and pinned versions. At multiplier
   1 the grant is 60 minutes; at 1.5 it is 90 minutes. Reload, use Resume and change
   the device clock: the same attempt reference and deadline must remain.
4. Leave the page open until its server deadline, or return afterward. Confirm the
   expired/locked state, removal of Resume/Start and the 48-hour cooldown timestamp.
   The browser suite exercises this quickly with a near-deadline historical fixture
   in its disposable database; it never shortens an existing immutable deadline.
5. Use keyboard navigation and a narrow/zoomed view, check the policy error/status
   announcements and return to the dashboard. Questions appear only in the owned
   active workspace; coaching, written grading and credentials remain unavailable here.

## Step 7B: Timed capstone workspace, autosave and locked scoring

The readiness screen's **Resume active attempt** action opens candidate-only
`/capstone/[attemptId]`. Ownership is checked before any exam text is selected;
unknown, other-owned and unsupported attempts share the same unavailable page.
The six assigned scenarios retain immutable slot/scenario/rubric order and versions.
A shared A/B comparison component provides side-by-side desktop responses and
equivalent sequential mobile content with explicit `DEMO - SYNTHETIC` output labels.
Native judgment/rating/source controls and the three designated written fields
are keyboard operable. Slot navigation reports required-field completion.

The persistent **Capstone Mode — Coaching Disabled** timer banner uses a display
estimate based on the latest PostgreSQL time and monotonic `performance.now()`
elapsed time, never `Date.now()`. The server is polled every 10 seconds, on return
to the tab and when the display reaches zero. Server-side deadline checks remain
authoritative even if the browser clock/display is stale. The exam omits practice
guidance, the Seven-Step coaching panel, correctness feedback, expert explanations
and all answer-key/alternative records. Only explicit public rubric fields and
supplied source material are allowed through the deep DTO projection.

Changes debounce for 750ms and manual **Save now** uses the same server path.
Each autosave is a coherent six-slot snapshot with an attempt-wide revision CAS.
The client permits one in-flight save and queues later edits using the acknowledged
revision; older acknowledgments cannot replace newer local prose. Saves update
the response revisions and server timestamps atomically. Stale-tab conflicts pause
autosave and require an explicit reload instead of silently merging/overwriting.
Only server-confirmed timestamps are displayed. Leaving with unconfirmed changes
produces a browser warning; reloading before a save is confirmed can lose those
local edits. The research scratchpad is separate page memory, excluded from
autosave/submission and browser storage; reload clears it.

Save, status and final-submit services share candidate/attempt row locks and
PostgreSQL `clock_timestamp()` deadline checks. The response trigger also locks its
parent row before checking editability. A save that crosses the deadline rolls back
all six writes, then records expiry separately. Expiry preserves earlier saved data
and never fabricates a zero/failing score. Locked status screens return no questions.

**Review final submission** first flushes pending saves and validates that all six
structured judgments/criterion groups and the three written fields are present.
An explicit unchecked confirmation is then required; inputs are paused while the
candidate confirms. The server independently verifies confirmation, ownership,
deadline, completeness and the saved revision. It scores only database-saved
responses against the pinned private keys, reusing coherent approved-alternative
matching. Each slot contributes equally to judgment/rubric/verification dimensions;
the aggregate is normalized to **95 points** and rounded once to two decimal places.
Written prose is retained verbatim and never regex/exact-string scored.

One atomic update records the deterministic subtotal, `submittedAt`, a stable
server-generated `submissionKey`, and `PENDING_REVIEW`, while written score, final
score and pass/fail remain null. Duplicate final requests return the same locked
receipt (with a current server clock), without rescoring or changing the responses.
The SQL-only submission-lock migration prevents reopening submitted attempts or
rewriting their submission key, timestamp, deterministic subtotal or autosave revision.
Candidate save endpoints and database response-update guards deny later edits.
No dual-AI job, review case, final result or credential is created in this step.

No Prisma model change or new dependency is needed; apply the new SQL migration
before restarting the updated app. Existing seeds remain repeatable and unchanged:

```sh
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run typecheck
npm run lint
npm test
npm run dev
```

Run the database and browser suites sequentially using a disposable local database:

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
```

Checks cover queued in-flight edits, debounced server-confirmed timestamps,
multi-slot reloads, stale revisions, save/submit races, ownership, approved alternatives,
95-point normalization, immutable submissions, late-save rollback, expired response
preservation, scratchpad exclusion, deep key isolation, pending review, mobile reflow
and WCAG/keyboard semantics. Browser expiry cases use historical near-deadline
fixtures in the test database; application deadlines are never shortened.

Manual browser checks:

1. Satisfy Generalist practice coverage, acknowledge the policy, start and Resume.
   Confirm the countdown, fixed deadline, pinned versions, six-slot navigation and
   Coaching Disabled indicator. Practice hints/reference guides must be absent.
2. Enter partial selections and prose in two written slots. Wait for a server save
   timestamp, reload, and revisit both slots. Confirm persistence and scratchpad
   clearing; ordinary scratchpad notes must not become saved answers.
3. Tab through controls and slot buttons; compare desktop and narrow/zoomed layouts.
   Open the attempt in another tab, save in one, and confirm the other pauses on
   a stale revision instead of overwriting it. Explicitly reload the server draft.
4. Complete all six structured evaluations and three designated justifications.
   Review final submission: verify pending edits save first, the confirmation box
   starts unchecked, and Return to editing preserves the draft.
5. Confirm submission. Verify locked responses, the deterministic subtotal out of
   95 and pending written/owner review. Reload; no answer editing, answer keys,
   explanations, pass/fail decision or credential should appear.
6. Let another attempt reach its server deadline (or run the automated expiry case).
   Confirm the locked expiry screen and that only previously confirmed saves remain.

## Step 7C: Independent written judges and mandatory owner review

Final submission atomically creates six uniquely keyed `AiGradingJob` rows: two
independent judge slots for each designated G1/G3/G6 written response. Jobs pin the
model/prompt version, rubric ID, immutable allowlisted rubric/text snapshot, SHA-256
input hash and stable dispatch key. No scenario keys, other judge outputs, candidate
identity, system secrets or research notes enter a judge input. Untrusted text is
JSON-escaped inside `<candidate_submission>` delimiters; instructions inside it
are data, not privileged instructions.

With `ENABLE_LIVE_ZDR_GRADING="false"`, deterministic `DEMO - SYNTHETIC` fixture
votes illustrate criterion scores and rationales without inspecting prose for
keywords or making external calls. They are demonstrations, not semantic grading.
The three written rubrics remain alignment 0–2, evidence/reasoning 0–2, clarity 0–1.
Exact criterion equality is required: `[2,1,1]` versus `[1,2,1]` is disagreement
despite equal totals. All raw votes remain private, including from the owner until
a future rubric-first review implementation saves the preliminary assessment.

The `next/server` after-response worker claims each job once. Concurrent/repeated
workers skip claimed or terminal jobs. There are no automatic paid retries;
`retryCount` stays zero. A call that times out, fails validation or fails at the
provider becomes a terminal failure category with **no criterion scores**. An
interrupted claim is marked timed out on a later worker invocation after its
30-second lease, without dispatching it again. The stable dispatch key is also
passed to any future approved live adapter for provider deduplication.

No live provider transport or approval is configured or seeded. Setting the flag
to `true` alone therefore makes no external calls: jobs fall back to human review.
A future server-owned adapter must have a current, matching provider/model ZDR
approval from `admin-michael`, evidence of verification, disabled retention and
training, and support for idempotency before its transport may execute. Browser
inputs cannot configure adapters, approvals, models or fixture modes.

`ReviewCase` is created **before** any judge runs. Stage A mandatory audit cannot
be disabled: even six successful agreeing votes remain `PENDING_REVIEW`. All
causes are retained in `gradingReasons`; disagreements, invalid output, timeout,
API failure and blocked live grading require human review, never an automatic
candidate failure or pass. The five-point written result, final score and pass/fail
stay null. SQL guards prevent premature finalization and credential issuance; the
sole active owner must resolve the review after all six jobs settle. No adjudication
UI, score finalizer or credential issuer is introduced here.

Each terminal job writes an append-only `AiGradingReceipt` with its raw vote,
versions, input hash, dispatch key, latency and retry metadata. Updates, deletes
and truncation are rejected by PostgreSQL. Receipts deliberately have no
operational foreign keys, so authorized fixture/job maintenance cannot erase the
grading history. Completed jobs and their pinned inputs cannot be rewritten.

Expiry still freezes only previously saved responses and never manufactures a
deterministic or final score. It queues the designated frozen written snapshots
for review, including blank text, without reopening the expired attempt. Missing
legacy assignments safely create a review case rather than rolling expiry back.

The existing `/capstone/[attemptId]` status screen shows queued, evaluating or
awaiting-owner-review states through a deep allowlist of job statuses only. It
polls while work is pending and offers **Refresh grading status**. No rationale,
criterion vote, disagreement reason, raw receipt or answer key enters the candidate
RSC/action payload. The final score and credential remain pending.

Apply the new migration before restarting the app; seed data is unchanged:

```sh
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run typecheck
npm run lint
npm test
```

For a submitted Step 7B attempt or interrupted worker, the trusted local operator
can run the following with the existing root `.env`. This requires the active
synthetic owner in the database, exposes no judge votes, and does not finalize:

```sh
npm run grade:written -- ATTEMPT_ID
```

There is also a fresh-owner-guarded recovery Server Action, without a new console
UI. Both paths deduplicate existing jobs. Retrying can recover abandoned work,
but intentionally does not rerun a terminal failed/ambiguous provider call.

The local PostgreSQL integration suite verifies six-job deduplication under
concurrent workers, immutable raw history, exact agreement, all failure fallbacks,
interrupted claims, hidden candidate data and database finalization/credential
guards. It remains opt-in and refuses remote databases:

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
npm run dev
```

For browser verification, sign in as `demo-marcus`, meet the existing G1–G6
practice participation prerequisites, acknowledge the policy and submit a complete
six-slot attempt. Confirm locked responses and the deterministic subtotal out of
95. Refresh grading status (or reload); expect **Written grading checks completed.
Awaiting owner review.** Verify there is no final score, pass/fail, credential,
judge rationale or answer feedback. Re-run `grade:written` with that attempt ID;
there should still be six jobs, six receipts and one pending review case in Prisma
Studio. Return to the dashboard; owner adjudication remains Step 8.

## Step 8B: owner console and finalized results

`/admin` requires a fresh `ADMIN_REVIEWER` session for `admin-michael`. It lists
up to 50 pending submitted reviews and the latest 25 finalized reviews, with total
counts, candidate synthetic names, attempt references, timestamps and review links.
Before independent scoring, the queue displays **Pilot mandatory audit**; detailed
disagreement/provider fallback reasons unlock only after preliminary scores are saved.
Operations show aggregate synthetic/live job counts. Synthetic API spend is $0;
live spend and quota are explicitly unavailable without usage/pricing configuration.

`/admin/reviews/[reviewCaseId]` resolves its attempt on the server. Stage 1 renders
the three pinned task/response/rubric/evidence/justification sets and requires nine
independent criterion scores. AI votes are absent from its HTML and RSC payload.
Saving the independent baseline unlocks Stage 2, with owner/Judge 1/Judge 2 comparisons,
versions and exact criterion agreement flags. Final owner scores start from the
independent scores. A nonblank written rationale is mandatory. Finalization uses
Step 8A's immutable audit and 100-point scoring transaction; completed reviews are
read-only. Every Server Action repeats authorization and server-side validation.

Finalized candidate attempts show their deterministic subtotal, written score,
total and outcome on `/capstone/[attemptId]`, `/dashboard` and `/capstone`.
G1–G6 practice guidance describes transferable skills, with filtered practice links;
it does not reveal item answers or judge/owner rationales. Non-passing attempts show
the pinned cooldown end, and `/capstone` enforces the full retake policy. This step
does not issue credentials or add verification, appeals or opportunities features.
No schema migration or seed changes are required.

Verification (replace the URL with your disposable local `raterready_test*` database):

```sh
npm run typecheck
npm run lint
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
npm run dev
```

Playwright uses an isolated development server at port 3100. Its setup applies the
existing migrations and synthetic test seed only to the validated local test database.
The adjudication browser tests cover both passing and non-passing finalizations,
server-chosen stages, rationale errors, payload isolation, role denial, keyboard
submission, WCAG 2.2 AA checks and 320px/200% reflow. To run only those tests, append
`-- tests/browser/reviews.spec.ts` to `npm run test:browser`.

For manual preview at `http://localhost:3000`, use the configured synthetic account
passwords from your own environment:

1. Sign in as `admin-michael`; open Marcus's submitted capstone from the pending queue.
   If no submitted attempt exists, sign in as `demo-marcus`, complete the existing
   practice/readiness flow and submit a capstone first.
2. Confirm Stage 1 has three written prompts, labeled simulated A/B outputs and
   frozen rubrics, with no judge vote cards. Changing `?stage=ADJUDICATION` must not unlock them.
3. Score alignment (0–2), evidence/reasoning (0–2) and clarity (0–1) for each prompt.
   Save independent scores; reload and confirm Stage 2 remains unlocked.
4. Compare the independent baseline with both judge votes and their versions. Adjust
   final scores if warranted. Try a blank rationale, then whitespace; neither may finalize.
5. Write a rubric-grounded rationale and finalize. Confirm the read-only review and
   its entry in finalized history; there should be no duplicate pending entry.
6. Sign out, sign in as `demo-marcus`, and check the dashboard result link, finalized
   score breakdown, outcome and all six practice links. For a non-pass, inspect the
   cooldown on `/capstone`. Visiting the saved admin review URL must return 403.

## Step 9A: credential issuance, consent and lifecycle

A reviewed, finalized synthetic Generalist capstone pass (85.00 or higher) now
issues one private credential in the same transaction as finalization. `attemptId`
is the unique issuance idempotency key; retries preserve the original UUIDv4 code,
issue date, sharing preference and lifecycle status. The credential's immutable
attempt links bind blueprint and scoring-policy versions; issuance audit metadata
also snapshots those versions and G1–G6 coverage. Other assessment modes, pending
reviews and scores below 85 cannot issue a credential.

Dashboard and finalized-result credential cards display the evidence disclosures
and a preview of the metadata before sharing. The candidate explicitly enables or
disables public verification, with ownership checks and an immutable audit event
for every actual transition. Private records remain visible after withdrawal,
suspension or revocation. Public verification never publishes candidate names,
internal IDs, answers, scores, model votes or private review/lifecycle reasons.

`/verify/[credentialCode]` is unauthenticated, dynamically evaluated and marked
`no-store`. An active, consented credential displays its public code, issue date,
covered internal competencies, and blueprint/scoring-policy versions. Unknown,
private, suspended and revoked codes all render the identical generic unavailable
state with HTTP 200. Both public verification and private credential cards show
**DEMO - SYNTHETIC / PRELIMINARY PILOT CREDENTIAL**, the internal G1–G6 disclosure,
and the limits of RaterReady's own unproctored browser-based assessment.

The `/admin` issued-credential inventory supports suspension, revocation and
reinstatement with a mandatory nonblank written reason. Each transition and reason
are appended atomically to `AuditEvent`. Reinstatement respects the candidate's
current sharing consent and preserves historical lifecycle timestamps. No appeals
or curated opportunity UI is included.

No schema migration or seed-data change is required. Existing reviewed passes
from before Step 9A can be reconciled using the trusted operator command below;
it requires the active synthetic owner and never changes an existing credential:

```sh
npm run credentials:reconcile
```

Verify using the existing local database/browser instructions above. Credential
coverage is included in Vitest and the `reviews.spec.ts` browser scenarios,
including opt-in/out, anonymous verification, privacy disclosures, equivalent
unavailable states, lifecycle reasons/audits, keyboard submission and WCAG checks.

Manual browser verification at `http://127.0.0.1:3000`:

1. Finalize Marcus's pending capstone as `admin-michael` using the two-stage review
   flow. A result of at least 85 earns one private credential. For an earlier reviewed
   pass, run `npm run credentials:reconcile` once instead of rescoring.
2. Sign in as `demo-marcus`. Check **Your earned credentials** on the dashboard and
   finalized result; confirm the pilot disclosures, UUID code, versions and disabled sharing.
3. Open `/verify/CREDENTIAL_CODE` in a logged-out window. It must show the same
   unavailable page as an unknown code and contain no candidate details.
4. Enable public verification as Marcus and reload the logged-out window. Check
   active status, metadata and disclosures. Disable sharing and reload again;
   the generic unavailable page must return while the private record remains.
5. Enable sharing, then sign in as `admin-michael` in another browser context. Under
   **Issued credentials**, choose **Suspend**, supply a written reason and save.
   Public verification must become unavailable. Choose **Active / Reinstate** with
   a reason; it becomes available again only while Marcus's consent remains enabled.
6. Repeat with **Revoke**. Confirm blank/whitespace reasons are rejected. Withdraw
   sharing as Marcus while restricted, then reinstate; public verification must
   remain unavailable until Marcus explicitly opts in again.

## Step 9B: grading appeals and gated opportunity curation

Finalized candidate result views now include **Grading appeals** with a structured
grading concern, evidence note, UUID reference, status and resolved disposition.
The pilot target is three business days (Monday–Friday excluding weekends), with
an explicit notice that holidays and owner availability may delay review. There
is no guaranteed response date. A database partial unique index and parent-row
lock prevent duplicate OPEN appeals. Submission evidence is immutable; its hash,
reason and reference are recorded in the append-only audit without copying
candidate prose into operational audit metadata.

`/admin` lists pending and resolved appeals. `/admin/appeals/[reference]` shows the
candidate evidence and current finalized result, with a link to the original
rubric-first review. The owner can uphold the current grade or supply corrected
40/30/25 category points and three 0–5 written criterion evaluations, plus a
mandatory candidate-visible rationale. Resolved dispositions cannot be replaced.

The original `AssessmentAttempt` score columns, original owner evaluations and AI
receipts remain unchanged. `AssessmentAppeal` stores audited result revisions.
`effectiveResult()` (and the equivalent database credential guard) reads the
latest RESOLVED/ADJUSTED appeal as the current result. Readiness, candidate views,
credential issuance, public verification and opportunity gates all use this rule;
future result consumers must not infer current eligibility from raw historical
`passed`/`finalScore` columns alone. A newly passing revision issues one private
credential in the resolution transaction. A revision below 85 suspends an active
credential with an audit event. Later passing revisions do not silently override
existing credential lifecycle restrictions; the owner may reinstate separately.

`/opportunities` and `/opportunities/referral-demo` require the candidate role and
a finalized effective score >=85 with an ACTIVE credential on that same attempt.
Private credential sharing is not required. Locked views never select listing
URLs. Dashboard access cards explain missing passes or credential restrictions.

The additive seed now contains four idempotent listings: the two original public
information sources, a public application example attributed to the official
[DataAnnotation Generalist role](https://www.dataannotation.tech/job-board/generalist),
and a fictional personal-referral preview. The application/source was checked on
2026-11-23. Referral permission, eligibility and benefits are explicitly simulated;
there is no real personal referral token or live employer claim. The referral
opens an internal gated preview rather than a fake external application. Every
card shows organization, source, link type, last verification date, eligibility,
limitations and `NO_FORMAL_PARTNERSHIP`/non-preferential-hiring disclosures.

The owner can pause/reactivate listings or enter an actual verification date in
`/admin`, with immutable change auditing. Future dates are rejected. Reseeding
preserves owner edits and never advances verification dates automatically.

Apply the additive migration and seed before preview (no reset is required):

```sh
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run typecheck
npm run lint
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
npm run dev -- --webpack --hostname 127.0.0.1 --port 3000
```

Manual checks at `http://127.0.0.1:3000`:

1. Sign in as a candidate with a finalized attempt. Submit a concern/evidence note
   from its result. Check the UUID reference, OPEN status, pilot target notice and
   absence of a second submission form while it remains open.
2. As `admin-michael`, open the pending appeal. Reject a blank disposition rationale,
   then uphold the grade with a written explanation. As the candidate, reload and
   confirm the resolved rationale and unchanged score.
3. For the threshold test, use a finalized non-pass. Submit a new appeal and apply
   an evidence-supported correction reaching >=85 through the category/criterion
   controls. Confirm the revised result, original score disclosure and one private
   credential, with no replacement of the original review.
4. Check `/opportunities` before and after passing. Suspend/revoke the credential
   and confirm the dashboard and guessed queue/referral routes remain locked.
   Reinstate with an admin reason and confirm access returns for a passing result.
5. Inspect every source, link type, last-verified date, eligibility and independence
   disclosure. Open the synthetic referral preview and confirm its permission and
   benefit disclosures explicitly describe simulation, not live referral access.
6. In `/admin`, pause a listing and confirm it disappears from the queue. Change
   its verification date after checking its source; confirm reseeding preserves the
   curation. The integration suite verifies the append-only audit events.

## Step 10A: shared navigation, desktop layout and rubric reference

The pre-implementation audit found exact server-side candidate/admin page guards,
independent action guards (including shared mutation helpers), a default-private
proxy policy and no registration route. Synthetic banners, simulated-output labels,
internal G1–G6 disclosures and independent opportunity/credential disclosures are
retained. Dashboard, onboarding and admin contained duplicate identity/sign-out
blocks; other authenticated pages had no consistent navigation. The shared 31rem
shell constrained dashboard, onboarding, diagnostic, lessons, Workflow Lab,
capstone readiness and opportunities. Practice/Technical Preview catalogs and
reviewer pages used broad 78rem overrides instead of distinguishing catalogs from
comparison workspaces.

The root layout now verifies the current identity on the server and renders one
shared navigation/identity/sign-out header. Candidates receive Dashboard, Practice,
Workflow Lab, Technical Preview, Capstone and Opportunities; reviewers receive
Reviewer Console. A text role badge and `DEMO - SYNTHETIC` badge remain visible.
Page/action authorization remains independent of navigation. Active links announce
the current page or parent section. The skip link bypasses the entire header, and
links wrap in DOM order on narrow screens without a collapsed menu or focus trap.

Authenticated dashboard/admin/catalog pages use `max-w-6xl` (72rem). A/B practice,
technical comparisons, active capstone exams and rubric-first review comparisons
use an 80rem (`max-w-7xl`) canvas. Dashboard summary cards pair at 48rem, curriculum
modules use three columns at 64rem, and admin operational metrics retain four
desktop columns. Mobile layouts remain sequential. Public sign-in stays compact.

**Understanding Rubrics & Evaluation Criteria** is linked near the dashboard
intro and rendered directly below its cards. The same guide is available inside
Practice's on-demand Seven-Step reference disclosure at every learning level.
It explains rubric weights/priorities, factual accuracy, instruction following,
and safety against supplied guidelines, with clearly synthetic examples. It is
absent from the locked capstone workspace. Workspace card order, practice submission
behavior and capstone save confirmations are unchanged.

Verification uses a disposable local `raterready_test*` database, never the main
Neon database. Use the earlier setup instructions, then run sequentially:

```sh
npm run typecheck
npm run lint
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
npm run dev -- --webpack --hostname 127.0.0.1 --port 3000
```

If Chromium is already installed at a different version, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable before the browser command.
The unit/component tests cover role-specific links, current-section updates,
server-verified root identity, one shared sign-out control, anonymous layout, and
rubric content. Browser tests cover real navigation, sign-out, keyboard reference
access, desktop geometry, 320px reflow with 200% text, and axe WCAG checks. Existing
capstone and reviewer tests also assert the shared navigation and retained coaching
and rubric-first locks. Screenshots are written to Playwright's `test-results/`.

Manual checks at `http://127.0.0.1:3000`:

1. As a candidate, visit every global destination and a lesson, diagnostic and
   practice scenario. Confirm the name, Candidate badge, demo label and exactly
   one Sign out button. Sign out from an interior page and confirm protected
   navigation returns to sign-in.
2. As `admin-michael`, check `/admin`, a pending review and an appeal. Confirm
   Reviewer Console is the only global destination, Sign out works, and AI votes
   stay hidden until the independent preliminary review is saved.
3. At a wide desktop viewport, inspect dashboard card pairs and three-column
   curriculum, the Practice catalog and A/B workspace, and admin metrics. Verify
   the workspaces are wider than their catalogs.
4. At 320px and with 200% text/zoom, check wrapping navigation, sequential cards,
   no horizontal scrolling, visible keyboard focus and Skip to main content.
5. Follow the dashboard rubric link and open Practice's Seven-Step reference by
   keyboard. Read all three criteria, weights/priorities and the Safety & stated
   policy example; verify the guide does not appear inside the capstone exam.

## Step 10B: evidence-first workspaces, practice results and capstone save status

Generalist Practice, Technical Preview and every active capstone slot now share
the same DOM reading order: task prompt, supplied evidence/policy notes, pinned
versioned rubric, simulated Response A/B, then judgment controls, written
justification and scratchpad. A/B remains side by side on desktop and sequential
on mobile. Practice retains its optional evaluation reference; capstone coaching
and answer keys remain unavailable.

A successful practice submission replaces the form with **Results & Feedback**
and moves focus to its heading. It shows the submitted choice and accepted
judgments with explicit Response (A), Response (B), or Valid Tie labels, including
approved alternatives, alongside the expert explanation and submitted reasoning.
An unaccepted candidate tie is labeled Tie rather than Valid Tie. Only safe
choice identifiers leave the evaluator; raw keys and approval objects stay on
the server. Reloading an owned submitted draft reconstructs feedback without
creating another attempt or awarding participation again.

**Start new attempt** saves an empty draft using the acknowledged revision and
server-selected track. It clears selections, source checks, justification and
temporary notes, then focuses the first judgment control. Reloading keeps the
new draft empty. Completed participation and prior assessment/submission rows
remain intact. A stale or failed reset retains the locked results and its
feedback instead of re-enabling the submitted form.

Capstone now has a persistent, polite live-region banner for unsaved, saving,
saved and error states, plus a compact confirmation beside Save now with no
duplicate live announcement. The contrasting saved state displays **Saved to server
at HH:MM:SS UTC** using the server-returned timestamp and revision. New edits,
in-flight requests, conflicts and unavailable server status remove the current
success treatment; any previous timestamp is identified as historical. Timer,
autosave serialization, final-submission locking and owner review are unchanged.

No schema migration is needed. Run the following with an existing disposable
local test database, sequentially so browser and integration fixtures do not
interfere:

```sh
npm run typecheck
npm run lint
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
npm run dev -- --webpack --hostname 127.0.0.1 --port 3000
```

Use the earlier Chromium executable override if needed. Unit/integration coverage
checks source order, result transitions, truthful A/B/tie labels, persisted empty
resets, stale revisions, preserved history and delayed server acknowledgments.
Browser checks exercise both practice tracks, results/reset reloads, keyboard
focus, desktop/mobile reading order, capstone timestamps against PostgreSQL,
contrast/reflow and the retained key/coaching boundaries.

Manual verification at `http://127.0.0.1:3000`:

1. Open a Generalist Practice scenario and a Technical Preview exercise. At
   desktop and mobile widths, verify task → evidence/policy → versioned rubric
   → simulated A/B → controls/justification/scratchpad.
2. Submit a completed exercise. Verify Results & Feedback receives focus, the
   submitted and accepted choices explicitly identify (A), (B) or a valid tie,
   and no editable submission controls remain. Reload and verify results remain
   locked without adding another practice submission.
3. Choose Start new attempt. Check all radio buttons/source checkboxes are
   unchecked, justification/notes are empty and keyboard focus returns to the
   judgment controls. Reload to confirm the empty draft persists. Submitting
   without answering should request the required fields; fill them to practice
   again. Confirm completed practice remains recorded on the dashboard.
4. After meeting the existing capstone readiness policy, start/resume an exam.
   Check source-first order in several slots. Edit a response, then test both
   debounced autosave and Save now. Verify the banner changes from unsaved/saving
   to Saved to server at a UTC timestamp. Make another edit and confirm success
   clears until acknowledgment; reload after saving to confirm the text persists.

## Step 11A: qualification terminology, synthetic badges and workspace cards

Candidate and reviewer product copy now calls the assessment the **Generalist
Qualification Exam**; compact navigation, mode and action labels use
**Qualification Exam**. Dashboard readiness, metadata titles, eligibility, timed
workspace, locked/pending/finalized states, opportunity gates and credential
disclosures use the same terminology. `/capstone` and its attempt URLs, Prisma
models/enums, published fixture data and grading contracts remain unchanged.
`qualificationExamText()` maps legacy human-readable fixture/error copy only at
presentation boundaries. Learners see readable exam/rubric names and their pinned
versions; internal identifiers remain available in server metadata.

`DemoBadge` supplies the shared amber pill: dark text, a crisp two-pixel border
and a literal `DEMO - SYNTHETIC` label. `SyntheticText` uses the same badge for
markers embedded in titles, sources, examples, explanations and reviewer text.
It renders escaped React text and does not add announcements or focus targets.
Candidate prose and code retain their original text; rebranding is opt-in for
product/fixture copy. Editable form values and serialized data are not decorated.
The global notice and credential disclosures share the amber callout treatment.

`WorkspaceSection` separates task, evidence and pinned-rubric content with named
cards and header bars. The shared A/B comparison uses matching individual cards
with simulated-output badges. Borders, padding, distinct surfaces and spacing
separate long passages without altering source-first DOM order, desktop A/B
columns, mobile stacking, practice reset behavior or server save confirmation.
Optional Skills Check results retain their existing layout and flow; no Welcome
Check-In has been added.

No migration or reseed is required. Verify with the existing disposable local
test database and browser setup, running the database/browser suites sequentially:

```sh
npm run typecheck
npm run lint
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm test
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser
npm run dev -- --webpack --hostname 127.0.0.1 --port 3000
```

Presentation unit tests cover legacy-copy mapping, retained routes/codes, escaped
embedded badges and named card boundaries. Browser checks inspect actual badge
colors/borders, detect visible unstyled synthetic markers, and verify workspace
header/body surfaces and spacing alongside the existing contrast, keyboard,
320px/200% reflow, assessment-integrity and credential-privacy checks.

Manual checks at `http://127.0.0.1:3000`:

1. As a candidate, follow Qualification Exam from the navigation to `/capstone`.
   Check dashboard readiness, screen title, start action, timed exam and locked/
   pending/finalized result terminology. Existing attempt URLs should still work.
2. Inspect synthetic markers in the global header, practice catalog and scenario,
   source text, results/expert explanations, reviewer console/votes, credential
   preview and public verification. Every visible marker should have the same
   readable amber pill, including markers embedded in paragraphs.
3. Open a Generalist Practice scenario, Technical Preview exercise and timed exam.
   Check distinct task, evidence, rubric and A/B cards with header bars and space
   between them. Verify source-first order, desktop columns and sequential mobile
   layout at 320px and 200% text/zoom, with no clipped content or horizontal scroll.
4. Confirm practice submission/reset, exam saves and final submission still work.
   Check the rubric-first owner lock and the retained G1–G6/internal-competency,
   independent-platform and non-endorsement disclosures beside credentials.

## Step 11B — Optional Skills Check advisory scorecard

Completed `/diagnostic` results now show a Suggested Starting Level summary with
an explanation and an explicit invitation to choose any level or switch later.
Six named competency cards use the current practice titles, textual Strong signal
or Suggested focus area badges, varied evidence-based guidance and Practice G1–G6
links. Unanswered samples say Not sampled; they are not presented as incorrect.
The grid has three columns on desktop, two on tablet and one on mobile, with
code/title on separate lines and the same reading and keyboard order throughout.

Version-1 diagnostic IDs follow the original lesson order. The presentation maps
the factual sample to current G3, comparison to G4, instruction boundaries to G5
and justification to G6. Existing selections, keys, advisory thresholds and
explicit level choices remain intact. Completed sessions are evaluated on the
server for display; this change needs no migration or reseed.

Visible disclosures state that this is optional, untimed and non-certifying,
never grants credentials, never waives the finalized 85% Generalist Qualification
Exam standard after owner review, and uses RaterReady's internal G1–G6 identifiers.
Unit tests cover all level suggestions, signal mapping, varied messages and
disclosures. Database integration verifies persisted feedback, independent level
choices, preserved lesson completion and no assessment/credential creation.
Browser checks cover the real save/resume/finish flow, statuses, practice links,
keyboard focus, contrast, 3/2/1-column layouts and 320px/200% text reflow.

Run the verification commands in Step 11A above with a disposable local test
database. Start the local browser preview with:

```sh
npm run dev -- --webpack --hostname 127.0.0.1 --port 3000
```

Manual checks at `http://127.0.0.1:3000`:

1. Sign in as a synthetic candidate and open Optional Skills Check. Select some
   responses, leave one unanswered and choose Get advisory feedback.
2. Check Suggested Starting Level, its explanation, the freedom to switch and
   all six cards. Each should have a separate code/title, a textual status,
   specific guidance and a Practice G1–G6 link. Unanswered items say Not sampled.
3. Read the non-certifying disclosures, then use Tab/Enter to choose a starting
   level or follow a practice link. Return to `/diagnostic`; feedback persists.
   Choosing a different level must preserve completed lessons.
4. Check desktop, tablet and 320px mobile widths, then 200% zoom/text. Confirm the
   cards reflow in G1–G6 order with readable badges, visible focus and no clipping
   or horizontal scrolling. No Welcome Check-In is included in this step.

## Step 11C — Welcome & starting-level check-in

`/welcome` is a candidate-only, revisitable self-report check-in, linked from
the initial `/onboarding` page and the dashboard's learning-level card. Warm
copy defines AI, large language model (LLM), RLHF and rubric in plain language.
Three optional native radio groups ask about AI tools, comparing answers with
a guide, and windows/tabs/copy-paste/find shortcuts. There are no scored tasks,
required answers, time limits or personal-disclosure fields.

The public, pure recommendation helper suggests Advanced Calibration when all
three areas feel comfortable; Intermediate Practice when both AI and evaluation
are at least somewhat familiar; otherwise Foundations for any answered sample.
An empty check-in makes no suggestion. These are starting suggestions, not
assessment results. Workflow Skills Lab help appears for Foundations or when
computer comfort is partial, new or unanswered; it is always optional.

Answers stay in component memory, are not saved to the server, and clear on
reload. Only choosing a level uses the existing candidate-authorized `chooseLevel` Server Action and
`CandidateProfile.selectedLevel`. Accepting takes one click; all three choices,
skip links and the separate Optional Skills Check remain available without
answering. Skipping returns new members to direct level choices and existing
members to their dashboard without changing placement or progress. No schema,
migration or seed changes are needed, and no database sync is required.

Named question/result/choice regions preserve reading order and keyboard access.
Showing advice focuses its heading; editing answers removes stale advice. The
questions are deliberately outside an answer-submission form so they cannot
be sent in a query or saved, including with JavaScript disabled. Native level
forms and skip links still work independently. Visible disclosures retain the
non-certifying boundary, finalized 85% Generalist Qualification Exam standard
after owner review, and RaterReady's internal G1–G6 identifiers.

Unit tests cover every full-answer combination, blank/partial responses,
encouraging copy, native groups, accessible focus, unrestricted choices and
server guards. Integration tests verify acceptance/overrides preserve lessons,
practice, diagnostic, exposure and credential/assessment state. Browser tests
exercise skip before/during/after advice, all three suggestions, one-click
acceptance, overrides, revisits, optional workflow help, skills-check handoff,
anonymous/admin restrictions, WCAG contrast and 320px/200% text reflow.

Use the typecheck, lint, test and preview commands listed in Step 11A above.
For just the welcome browser scenarios, use the same disposable test database:

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser -- tests/browser/welcome.spec.ts
```

Manual checks at `http://127.0.0.1:3000`:

1. From onboarding choose Try the welcome check-in, or use Revisit the welcome
   check-in on the dashboard. Read the reassurance and three plain-language topics.
2. Skip immediately, with a partial answer, and after viewing a suggestion.
   Confirm no learning level or completed lesson changes just from using or skipping it.
3. Choose the first option in each group: check Foundations and optional Workflow
   Skills Lab help. Choose the middle options for Intermediate Practice, or the
   last options for Advanced Calibration. Every other level remains selectable.
4. Accept a suggestion, reload the dashboard and revisit. Confirm the chosen level
   persists and lessons remain saved. Try an override and the separate Optional
   Skills Check handoff; the check-in must never grant a credential or exam result.
5. Use Tab, arrow keys, Space and Enter; inspect mobile at 320px and 200% zoom/text.
   Check clear focus, readable disclosures and no horizontal scrolling or clipping.

## Step 12A — Global design system and card hierarchy

The shared shell now uses slate text/canvas surfaces, indigo actions and active
tabs, emerald progress accents, consistent card radii/spacing and small elevation
tokens. Body text stays readable with tabular numerals for metrics, scores and
timers. Token tests calculate unrounded WCAG contrast: normal text is at least
4.5:1 on each named light surface; control borders and focus rings are at least
3:1. The lighter `--line` token separates decorative regions only. Interactive
controls retain stronger boundaries and three-pixel offset keyboard focus rings.
Amber `DEMO - SYNTHETIC` marker colors and all disclosures remain intact.

Brand and account controls share the desktop header row, followed by active
route tabs. At narrower widths they stack with all destinations visible and no
menu prerequisite. Identity/role, synthetic status and sign-out remain in DOM
order, with no horizontal navigation scroller or clipped labels.

`LearningCard` provides the shared metadata → plain heading → summary → footer
pattern for `/practice`, `/technical-preview` and dashboard practice/lesson cards.
Catalog-only title cleanup removes the leading marker/known competency prefix
from the display heading; metadata retains the marker and tags. It never changes
stored titles or evaluation content. Every card has one CTA, with heading context
available to assistive technology. Progress, level controls and rubric-reference
regions have separate surfaces and balanced padding. Server business logic,
schema, grading, keys, routes and non-certifying boundaries are unchanged.

Unit tests cover contrast, plain headings, synthetic metadata, escaped content
and contextual CTA destinations. Browser checks measure desktop header/card
geometry, exercise Open scenario with the keyboard, inspect card boundaries and
focus rings, and run WCAG checks at 1440px, 1024px, 720px (1440px at 200% layout
zoom), and 320px with normal and 200% text sizing across dashboard, catalogs,
welcome and onboarding. Existing functional/security checks remain in place;
catalog locators now target a named card's Open scenario action.

Use the standard verification/preview commands above. For the additional visual
browser checks, use the same disposable local test database:

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser -- tests/browser/design-system.spec.ts
```

Manual checks at `http://127.0.0.1:3000`:

1. Sign in as a candidate, then as a reviewer. Check brand/account alignment,
   active route tabs, role/synthetic pills and the single Sign out control.
2. Browse Practice and Technical Preview. Check separate metadata, clean headings,
   short summaries and footer CTAs; follow a card to its existing workspace.
3. Check dashboard competency/lesson cards, progress values, starting-level
   controls and the distinct Understanding Rubrics & Evaluation Criteria panel.
4. Revisit Welcome and onboarding; confirm readable hierarchy, balanced cards,
   freely selectable levels and visible advisory/non-certifying disclosures.
5. Use Tab/Enter and inspect at 320px and 200% zoom/text. All navigation/actions
   should remain visible with clear focus and no clipped text or horizontal scroll.

## Step 12B — Surface depth, readiness, workspaces and verification

The cool-slate `#eef2f6` canvas and nested containers now separate crisp white
cards with layered small/medium elevation and decorative top/left highlights.
Scenario/action cards lift slightly on hover or emphasize keyboard focus;
reduced-motion preferences disable movement/transitions. Grid children and
metadata can shrink/wrap at intermediate widths. Text/control contrast tokens
retain their tested AA bounds; synthetic amber styling remains distinct.

Qualification Exam readiness keeps the same server DTO and eligibility actions,
but groups G1–G6 coverage, pinned 40/30/25/5-point weights, the finalized 85%
passing standard, timing settings and cooldown into labeled cards/grids.
The threshold bar is decorative, explicitly not a candidate score. The separate
Independent-Work Policy card retains the required acknowledgment/start action.

`WorkspaceBar` is a named sticky landmark in Generalist Practice, Technical
Preview and the active Qualification Exam. Its compact title/status/reference
controls remain anchored; the full H1 and detailed authoritative save region
remain in the page. A resize observer measures the wrapping bar for scroll
padding, and later keyboard controls are revealed below it. Small fixed gutters
preserve width at mobile text zoom. Quick reference uses a native disclosure,
Escape/close focus return, and closes when keyboard focus leaves. Practice can
open its existing learning guide; the exam exposes only its pinned criterion
labels and independent-work reminder, never coaching or expected answers.
The exam's compact save mirror reuses server-confirmed status and adds no live
announcement; the original single live save region remains authoritative.

Reviewer KPI/queue/appeal cards now have elevation and text status badges.
Independent rubric cards and Stage 2 judge-comparison surfaces are distinct;
the latter still render only from the server-unlocked projection. Public
verification uses a certificate surface with structured evidence-only metadata,
the full synthetic/preliminary pilot label, internal G1–G6 and independence
disclosures. Unknown, unshared, suspended and revoked credentials retain the
same generic unavailable view. No server/domain, schema, scoring or seed changes
are required.

Unit checks cover native reference focus/cleanup, readiness values, certificate
metadata and generic unavailable output. Browser coverage adds intermediate
grid widths, card overflow inspection, hover/reduced motion, sticky keyboard
focus at 320px/200% text, exam save mirrors and coaching suppression. Existing
review/credential browser flows also verify stage boundaries, certificate rows,
consent withdrawal and identical unavailable states.

Use the standard verification and preview commands above. Focused checks use
the same disposable local test database:

```sh
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/raterready_test' npm run test:browser -- tests/browser/surface-depth.spec.ts tests/browser/capstone-workspace.spec.ts
```

Manual checks at `http://127.0.0.1:3000`:

1. Compare the slate canvas with white cards. Check hover depth and keyboard
   focus, then inspect scenario grids at 1024px, 900px, 768px and 640px.
2. Open Qualification Exam readiness. Check coverage pills, pinned scoring and
   timing/cooldown cards, the 85% standard and Independent-Work Policy.
3. Scroll long Practice, Technical Preview and exam workspaces. Check the sticky
   title/status, slot/timer/save display and Quick reference with Enter/Escape.
   In exam mode, confirm coaching stays unavailable and Save now/autosave show
   server-confirmed timestamps. Tab to later fields; focus must remain visible.
4. As the owner, inspect `/admin` KPI/queue/appeal cards and both reviewer stages.
   AI comparison must stay absent until independent scores are saved.
5. Open a shared demo credential's verification URL. Check structured metadata,
   pilot/independence disclosures and 320px/200% text reflow. Withdraw sharing;
   the URL must return the same unavailable view as an unknown code.
