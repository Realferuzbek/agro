# Build progress

Status: implementation in progress. A check is complete only when its result is recorded here; planned capability is not validation evidence.

## Agreed implementation constraints

- One product, with the farmer dashboard at `/` and authenticated, authorized engineering tools at `/admin`.
- One hectare, 100 × 100 m, Tashkent Region, potato, loam, four sequential drip zones; physical hardware is simulated.
- Canonical crop/soil water state belongs to the homogeneous field. Zones track irrigation delivery unless separate soil state is explicitly configured.
- Forecast delay checks the depletion trajectory through the expected rain window. Forecast rainfall is never booked as observed water.
- One persistent product-level simulation disclosure; provenance remains part of data contracts.
- The first administrator is created by a privileged server/database bootstrap. Browser clients cannot assign roles.
- Real local PostgreSQL, Auth, RLS, and Realtime use the Supabase Docker stack. No external deployment is implied by local implementation.

## Phase ledger

| Phase | State | Evidence / next gate |
|---|---|---|
| Repository inspection | Complete | Workspace began empty; user specification and approved clarifications inspected. |
| Application/domain foundation | Implemented | Strict TypeScript, pinned npm stack, parameter versions, units, and provenance are present. |
| Scientific engine | Foundation gate passed | `npm test -- tests/domain/agronomy.test.ts`: 7 tests passed, including exact golden chain, independent FAO examples, conservation and bounds. Further simulation integration checks remain. |
| Database and security | Local integration gate passed | Local Supabase healthy; migrations, seed and bootstrap succeeded; 16 real database/Auth/RLS/transaction tests passed. |
| Simulation and providers | Domain gate passed | Domain owner reports 30 passing tests after rain-window, repeat-run, wetting and future-stage regressions. |
| Farmer product | Implemented; browser QA pending | Six routes, recommendation explanation and session preview present. |
| Protected admin | Focused browser gate passed | Admin sign-in, scenario mutation, calculation inspection and logout passed after the email-provider configuration fix. Eight tabs, credential list/revoke, DB-backed latest readings/alerts and field binding fixes are present. |
| Realtime and accessibility | Pending verification | Authoritative updates, responsive layouts, keyboard and reduced-motion behavior. |
| QA and delivery | Pending verification | TypeScript, lint, tests, build, browser, real database security checks. |

## Validation ledger

| Command | Result | Evidence / limits |
|---|---|---|
| `npm test -- tests/domain/agronomy.test.ts` | Passed | 7 tests on September 22, 2026; golden chain, vapour-pressure/evaporation examples, crop stages, conservation, validation and determinism. |
| Domain test suite | Passed | Domain owner reports 30 passing tests on September 22, 2026 after the latest scientific/simulation fixes; final combined suite rerun pending. |
| `npm run typecheck` | Passed | Entire current UI and API source passed; final post-fix rerun pending. |
| Local Supabase setup, seed, admin bootstrap | Passed | Running healthy stack; golden state persisted and admin created by privileged local script. |
| Lint / production build | Pending | Final checks still outstanding. |
| `npm run test:integration` | Passed | 16 real PostgreSQL/Supabase Auth checks: RLS, role escalation, authorized atomic writes, duplicate/concurrent requests, rollback, credential scope/revocation, telemetry validation and observed-rain accounting. |
| Focused Playwright admin-login flow | Passed | Root confirms admin login, shared scenario changes, calculation inspector and logout now pass. Earlier HTTP 401 was fixed by enabling the email sign-in provider while retaining disabled public signup. |
| Playwright / responsive / browser checks | Pending | All routes implemented; browser QA still outstanding. |
| Desktop accessibility contrast check | Passed | Root reports the desktop contrast check passed; this does not establish the full browser suite. |
| Hosted Supabase target/access | Selected and authenticated | User selected existing `baraka-agro` (`gunzhtlbpxwpprqwnhfd`); authenticated CLI Management API queries are available. Read-only schema inventory is underway before any migration. |
| Hosted Vercel deployment and cloud smoke checks | Pending valid access | Available Vercel token was rejected; no successful application deployment or final hosted URL is recorded. Deployment preparation continues independently. |

The scientific run emitted a non-fatal Vite configuration loader warning about ESM syntax in the current TypeScript config. No scientific test failed. Final quality results will replace pending entries when measured.

## Environment and limitations

- Development workspace: `F:\agro` on Windows PowerShell.
- Application deployment requires user-controlled Vercel and Supabase projects and their environment configuration.
- The selected existing Supabase project must retain unrelated existing data. Its schema inventory and migration compatibility must be established before applying this application's schema; no hosted reset is authorized or needed.
- Physical sensor calibration, live valve/pump operation, field validation, yield improvements, and measured water savings are outside this simulated MVP.
- Measured ingestion can atomically assimilate approved, model-day-compatible rainfall into an explicitly measured field. It never actuates hardware (`controlApplied: false`); `fieldModelUpdated` identifies optional model changes. Independent soil fusion and measured irrigation integration remain separate commissioning work.
