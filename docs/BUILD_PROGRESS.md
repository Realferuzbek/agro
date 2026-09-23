# Build progress

Status: release-ready; the user-requested Vercel deployment is the only remaining release action. Updated September 23, 2026 (Tashkent).

## Approved product constraints

- One Next.js product with the farmer experience at `/` and protected engineering tools at `/admin`.
- Tashkent Region, potato, one hectare of loam, four sequential drip zones, and simulated hardware.
- Canonical crop/soil water state belongs to the homogeneous field. Zones record delivery unless separate zone soil state is explicitly configured.
- Forecast deferral checks projected depletion at every timestep through the expected rain window. Forecast rain never changes canonical depletion before observation.
- One persistent product-level simulated-data disclosure, with first-class provenance on relevant values.
- The initial owner is created only through trusted server/database bootstrap and is bound to the Supabase Auth UUID.

## Delivery state

| Area | State | Evidence |
|---|---|---|
| Foundation and scientific engine | Complete | Strict TypeScript, pinned npm dependencies, centralized copy/configuration, deterministic FAO-56 engine, injected clocks, 12 scenarios, and the golden regression are implemented. |
| Database and simulation | Complete | Local Supabase migrations `001`–`009`, calculated seed, canonical field accounting, version checks, idempotency, transactional writes, telemetry, providers, controller state, and Realtime are verified. |
| Security and owner management | Complete | Local and hosted owners are provisioned. Server/database roles, scoped permissions, owner protections, invitation flow, role-change audit records, credential revocation, RLS, and recovery tooling are present and verified. |
| Farmer and admin product | Complete | Six farmer routes, explanation drawer, preview isolation, nine protected admin sections including Team & Access, loading/degraded/forbidden states, responsive layouts, keyboard navigation, and accessible charts are implemented. |
| Hosted Supabase | Complete | Existing `baraka-agro` project `gunzhtlbpxwpprqwnhfd` has migrations `001`–`009`, seed/configuration, protected owner UUID, and verified owner sign-in and authorization boundaries. |
| Vercel readiness | Ready | Existing linked project `agro` under `feruzbeks-projects-10a1b6ab` has Production and Preview environment configuration. The lockfile installs cleanly on Windows and Linux, and a hosted-environment production build passes. |
| Vercel deployment | Pending by instruction | No deployment was performed. The user must run the final command recorded below. |

## Validation ledger

| Gate | Result |
|---|---|
| `npm ci --no-audit --no-fund` on Windows | Passed; 631 packages installed from the final lockfile. |
| Clean Linux `npm ci` in `node:24-bookworm-slim` | Passed; 494 packages installed, including the required optional platform packages. |
| `npm run lint` | Passed with no warnings or errors. |
| `npm run typecheck` | Passed. |
| Domain/scientific tests | Passed, 50 tests. Golden values remain ET₀ 5.009468525935759 mm/day, ETc 5.788693413486792 mm/day, RAW 25.47618 mm, net irrigation 5.40775 mm, gross delivery 60086.09502236647 L, and zone runtimes 85.84 / 87.50 / 86.66 / 88.36 min. |
| `npm run test:integration` | Passed, 29 real PostgreSQL/Auth/RLS/API checks. |
| `npm run db:test` | Passed, 12 pgTAP assertions. |
| `npm run test:e2e` | Passed, 20/20 desktop and mobile Playwright cases, including realtime, preview isolation, owner access management, keyboard navigation, axe checks, and viewport checks. |
| `npm run build` | Passed with Next.js 16.3.5 against the hosted environment; 27 application routes compiled. |
| Local owner verification | Passed: the designated owner can sign in and is bound as the protected initial owner. |
| Hosted migration verification | Passed: local/remote migration ledgers match through `202609230009`. |
| Hosted owner verification | Passed: `iamrealferuzbek@gmail.com` signs in with the privately stored password, has the protected owner UUID, all four administrative permissions, and active owner status. |
| Hosted privilege-boundary verification | Passed: a disposable regular admin could not demote, disable, or directly update the owner; cleanup succeeded and the owner remained active. |
| Production `/admin` verification | Passed locally against hosted Supabase: owner login, session role/permissions, Team & Access, and protected-owner presentation all succeeded without page errors. |

## Security state

- Migrations `008_owner_role` and `009_access_management` are applied locally and to the selected hosted project. Their hosted application script normalizes Management API migration versions and remains idempotent.
- The designated owner account exists in hosted Supabase Auth and ownership is bound to its Auth UUID. The configured email is only the designated bootstrap identity after binding.
- The bootstrap script consumes the existing ignored `.env.hosted.local` values, confirms or creates the account, synchronizes the privately stored password, invokes the database bootstrap function, and never prints credentials.
- Ordinary admins cannot grant owner privileges, change any owner account, change the protected initial owner, or bypass the rules with direct profile updates. The database prevents demotion/deletion of the last owner.
- Owner recovery requires trusted service/database access, preserves the protected UUID, writes a private recovery artifact under ignored local storage, and produces an audit record. It is not exposed through the public client.
- Raw credentials, service-role values, integration payloads, and audit records remain outside anonymous access.

## Remaining action

No additional credential or project configuration is required. From the linked repository, create the production candidate without promoting the canonical domain:

```powershell
vercel deploy --prod --skip-domain --scope feruzbeks-projects-10a1b6ab
```

Record the returned candidate URL and run the documented cloud smoke checks before promotion. The repository was intentionally not deployed in this session.

## Scope limits

Physical sensor calibration, live valve/pump actuation, field validation, measured yield improvement, and measured water savings remain outside this simulated MVP.
