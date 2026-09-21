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
| Application/domain foundation | In progress | Establish strict TypeScript, npm scripts, parameter versions, units, and provenance. |
| Scientific engine | In progress | Golden regression and conservation/boundary tests must pass before UI polish. |
| Database and security | In progress | Migrations, RLS, bootstrap, immutable records, and concurrency safeguards. |
| Simulation and providers | Pending verification | Twelve deterministic scenarios; water-event idempotency and volume feedback. |
| Farmer product | Pending verification | Six routes, transparent recommendation, isolated public preview. |
| Protected admin | Pending verification | Authentication, simulation, integration, commissioning, inspection, and audit. |
| Realtime and accessibility | Pending verification | Authoritative updates, responsive layouts, keyboard and reduced-motion behavior. |
| QA and delivery | Pending verification | TypeScript, lint, tests, build, browser, real database security checks. |

## Validation ledger

No final quality gate has been recorded yet. See the final update below for exact commands, outcomes, and any environment limitations.

## Environment and limitations

- Development workspace: `F:\agro` on Windows PowerShell.
- Application deployment requires user-controlled Vercel and Supabase projects and their environment configuration.
- Physical sensor calibration, live valve/pump operation, field validation, yield improvements, and measured water savings are outside this simulated MVP.
