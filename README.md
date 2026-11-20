# RaterReady

Stage A recruiter demo — `DEMO - SYNTHETIC`.

Step 1 contains the Next.js App Router shell, strict TypeScript, Tailwind CSS,
server environment validation, and a hot-reload-safe Prisma singleton. No UI
pages, authentication routes, or Prisma schema are included yet.

Use Node.js 22.12+ and run `npm ci`. Copy `.env.example` to `.env.local`, then set
your Neon PostgreSQL `DATABASE_URL` and a random `AUTH_SECRET` of at least 32
characters. Keep `ENABLE_LIVE_ZDR_GRADING="false"` for Stage A.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run dev` starts the development server. With no UI pages, the app currently
returns Next.js's default 404. Prisma 6 is pinned to support `@prisma/client`
without introducing a driver adapter. The singleton cannot be used at runtime
until Step 2 adds the schema and runs `prisma generate`; no database connection
or migration runs in Step 1.
