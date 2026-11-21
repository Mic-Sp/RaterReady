# RaterReady

Stage A synthetic stakeholder demo — `DEMO - SYNTHETIC`.

Steps 1–7B contain the Next.js App Router shell, strict TypeScript, Tailwind CSS,
server environment validation, a hot-reload-safe Prisma singleton, the PostgreSQL
schema/migrations, repeatable synthetic fixtures, and Auth.js v5 Credentials
authentication with server-side RBAC, accessible sign-in, and protected role landing
shells, adaptive Generalist onboarding, an optional diagnostic and a learning
dashboard, plus a server-only deterministic practice evaluator and expanded scenario
catalog, plus an accessible A/B practice workspace with saved drafts and persisted
practice participation, an optional Workflow Skills Lab and five non-credentialing
Technical Preview exercises, plus the isolated Generalist capstone blueprint,
readiness gate, server timer lifecycle and timed six-slot exam with continuous
autosave and locked deterministic submission. There is no public registration or
role-selection flow. Dual-AI written grading and owner review tools are not implemented yet.

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
