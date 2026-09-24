# Baraka Agro

Production site: `https://barakaagro.app`. The public demo has English (`/en`), Uzbek (`/uz`), and Russian (`/ru`) routes. See [branding](docs/BRANDING.md) and the [production checklist](docs/PRODUCTION_CHECKLIST.md) for assets, domain setup, Supabase Auth URLs, and search indexing.

A deterministic irrigation product for a one-hectare potato field in Tashkent Region, Uzbekistan. The root page is the farmer dashboard; the same application contains a protected engineering workspace.

**Demo — simulated field data.** Crop-water calculations, contracts, PostgreSQL persistence, Auth, RLS and application logic are real software. Weather, soil sensors, pump, valves and delivery are simulated. Baraka Agro uses FAO-56-based methodology and is not certified or endorsed by FAO. It makes no measured yield or water-saving claims.

## Run locally

Prerequisites: Node.js 24.x, npm, and a running Docker-compatible container engine. Windows users should start Docker Desktop before Supabase. Dependencies are pinned in `package-lock.json`; the installed test runner also supports Node 22.12+, but Node 24 is the documented default.

```powershell
cd F:\agro
npm ci
npm run db:start
npx tsx scripts/setup-local.ts
npx tsx scripts/seed.ts
npx tsx scripts/bootstrap-admin.ts
npm run dev
```

`setup-local.ts` reads the running local Supabase configuration and writes ignored `.env.local` without printing secrets. It also generates private bootstrap credentials if none exist. `bootstrap-admin.ts` binds that confirmed Auth UUID as the protected initial local owner. Read the email/password locally from the ignored file to sign in; the local admin browser test also uses them. Keep them out of hosted runtime variables. For manual configuration, copy `.env.example` and map `API_URL`, `ANON_KEY` and `SERVICE_ROLE_KEY` from `npx supabase status -o env` to:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server connection to Supabase; local default `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key for RLS-governed reads and authentication |
| `NEXT_PUBLIC_SITE_URL` | Exact application origin used by server mutation origin checks; local default `http://127.0.0.1:3000` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only privileged setup/ingestion key |
| `BARAKA_ADMIN_EMAIL` | Bootstrap administrator email; server-side setup only |
| `BARAKA_ADMIN_PASSWORD` | Strong unique local bootstrap/admin-test password; never deploy as an app runtime variable |

Open [the product](http://127.0.0.1:3000) and [Supabase Studio](http://127.0.0.1:54323). The administrator login is at `/admin`; normal navigation intentionally contains only farmer pages. Missing backend configuration produces an unavailable state, not a successful database simulation.

`npm run db:reset` recreates the disposable local database, reapplies migrations and its SQL seed. It deletes local data; reinitialize the calculated field snapshot and administrator afterwards. `npm run db:stop` stops the local stack.

## Product behavior

- **Today** explains the recommendation, net/gross water, zone and total runtime, rain reconciliation and system health.
- **Field** shows the homogeneous field's canonical soil state, crop growth and sensor depths.
- **Irrigation** tracks sequential zone targets, actual simulated delivery and control state. Public previews are session-isolated.
- **Forecast** separates expected weather from observed water and evaluates the wait for rain through its expected window.
- **History** exposes water balance, irrigation and alerts; **Devices** shows understandable quality and freshness.
- **Admin** controls the authoritative simulation, device integration, simulated commissioning, calculation inspection, versioned parameters and audit records. **Team & Access** lets owners and explicitly authorized managers administer access within database-enforced limits.

One persistent product-level disclosure identifies simulated data. Each important datum retains source, units, timestamp, quality and provenance. Four zones share the homogeneous field water model; their primary state tracks delivery. Forecast rain never becomes observed water until an observation is applied.

## Validation

```powershell
npm run typecheck
npm run lint
npm test
npm run db:test
npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

The scientific golden fixture expects ET₀ `5.00947 mm/day`, ETc `5.78869 mm/day`, net irrigation `5.40775 mm`, and gross delivery `60,086.10 L`. Four sequential zones require about 5 h 48 min of nominal pumping before startup/transitions. See [the fixture](docs/GOLDEN_SCENARIOS.md) for inputs and tolerances. `npm run db:test` runs the SQL privilege/RLS assertions; `npm run test:integration` exercises real local Supabase/Auth transactions. Ordinary `npm test` does not opt into the backend integration suite.

**[BUILD_PROGRESS.md](docs/BUILD_PROGRESS.md) is the verification record and Definition of Done matrix.** It distinguishes local and hosted evidence from unrun or environment-limited gates; availability of a test command does not mean it has passed.

Hosted Vercel/Supabase deployment is a separate recorded gate. [Deployment instructions](docs/DEPLOYMENT.md) list the selected Supabase project, remaining Vercel/admin configuration, build settings, `npm run deploy:check` preflight and `npm run deploy:verify -- --url <deployment-url>` read-only smoke check. The local setup does not establish a live cloud URL.

## Engineering guide

| Document | Contents |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Boundaries, ownership, public preview versus authoritative state |
| [Agronomy engine](docs/AGRONOMY_ENGINE.md) | Equations, ordering, units, reference sources and model limits |
| [Golden scenarios](docs/GOLDEN_SCENARIOS.md) | Numerical benchmark, twelve scenarios and invariants |
| [Simulation](docs/SIMULATION.md) | Clock, replay, water accounting, pump/valves and failures |
| [Hardware integration](docs/HARDWARE_INTEGRATION.md) | Provider contracts, normalized ingestion and future adapters |
| [Database](docs/DATABASE.md) | Tables, transactions, RLS, Realtime and local lifecycle |
| [Security](docs/SECURITY.md) | Admin provisioning, credentials, authorization and control boundaries |
| [Deployment](docs/DEPLOYMENT.md) | Reproducible local setup and Vercel/Supabase release procedure |

The stack is Next.js App Router, strict TypeScript, React, Tailwind, Radix, Lucide, Motion, Recharts, Zod, Supabase, Vitest and Playwright. Branding and presentation conventions live in `src/config/` and `src/lib/`; scientific formulas stay in `src/domain/`.

Physical hardware commissioning, local agronomic calibration and field validation remain prerequisites for live operational use. No hosted deployment or live hardware connection is implied by this repository.
