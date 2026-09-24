# Build progress

Status: repository and hosted Supabase are ready. Baraka Agro branding, three-language product copy, canonical domain behavior, and technical SEO are implemented. Vercel deployment, dashboard/DNS changes, and checks against the actual HTTPS origin remain open release gates. Updated September 24, 2026 (Tashkent).

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
| Farmer and admin product | Complete | Six farmer routes, explanation drawer, preview isolation, nine protected admin sections including Team & Access, loading/degraded/forbidden states, responsive layouts, keyboard navigation, and accessible charts are implemented. Explicit zone soil mode now labels field figures as area-weighted summaries, shows each zone's depletion/action boundary/target/efficiency, and explains zone-specific gross delivery. |
| Brand, languages, and SEO | Complete in repository | Supplied logo and reveal assets are integrated, English/Uzbek/Russian routes and copy are available, and canonical/hreflang/social metadata, sitemap, robots, manifest, and host redirects are implemented. Dashboard and DNS acceptance are documented in `docs/PRODUCTION_CHECKLIST.md`. |
| Hosted Supabase | Complete | Existing `baraka-agro` project `gunzhtlbpxwpprqwnhfd` has migrations `001`–`009`, seed/configuration, protected owner UUID, verified owner sign-in/authorization boundaries, and observed anonymous Realtime propagation. |
| Vercel readiness | Ready | Existing linked project `agro` under `feruzbeks-projects-10a1b6ab` has Production and Preview environment configuration. The lockfile installs cleanly on Windows and Linux, and a hosted-environment production build passes. |
| Vercel deployment and final-origin acceptance | Pending by instruction | No deployment was performed. The user must deploy the candidate, then run the documented cloud smoke checks and verify the candidate HTTPS origin before promotion. |

## Validation ledger

| Gate | Result |
|---|---|
| `npm ci --no-audit --no-fund` on Windows | Passed again after the UI work; 631 packages installed from the final lockfile. npm emitted nonfatal Windows cleanup warnings for two optional directories. |
| Clean Linux `npm ci` in `node:24-bookworm-slim` | Passed; 494 packages installed, including the required optional platform packages. |
| `npm run lint` | Passed with no warnings or errors. |
| `npm run typecheck` | Passed. |
| Domain/scientific and translation tests | Passed, 52 tests. Golden values remain ET₀ 5.009468525935759 mm/day, ETc 5.788693413486792 mm/day, RAW 25.47618 mm, net irrigation 5.40775 mm, gross delivery 60086.09502236647 L, and zone runtimes 85.84 / 87.50 / 86.66 / 88.36 min. |
| `npm run test:integration` | Passed, 29 real PostgreSQL/Auth/RLS/API checks. |
| `npm run db:test` | Passed, 12 pgTAP assertions. |
| `npm run test:e2e` | Passed, 26/26 desktop and mobile Playwright cases, including localized metadata and switching, redirects, realtime, preview isolation, owner access management, keyboard navigation, axe checks, viewport checks, and configured zone soil presentation. |
| `npm run build` | Passed with Next.js 16.3.5 against local configuration after the brand and language work. A prior hosted-environment build passed before this phase; repeat candidate checks on the final hosted deployment. |
| `npm run deploy:check` | Passed hosted configuration shape and canonical site-origin preflight. This is not a live deployment check. |
| Local owner verification | Passed: the designated owner can sign in and is bound as the protected initial owner. |
| Hosted migration verification | Passed: repeatable application confirmed `008`–`009` were already present; hosted audit records nine migrations, zero public tables without RLS, one active protected initial owner, and no authenticated direct profile-update or credential-hash-read grants. |
| Hosted owner verification | Passed: `iamrealferuzbek@gmail.com` signs in with the privately stored password, has the protected owner UUID, all four administrative permissions, and active owner status. |
| Hosted privilege-boundary verification | Passed: a disposable regular admin could not demote, disable, or directly update the owner; cleanup succeeded and the owner remained active. |
| Hosted Realtime propagation | Passed: an anonymous Supabase Realtime subscriber received a committed public-demo alert insert; the temporary alert was removed. |
| Hosted-backed production browser | Passed: the final production build running locally against hosted Supabase completed owner login, public API boundary, all six farmer routes, axe checks, no page errors, and desktop/tablet/mobile viewport checks. The tablet audit found unnamed compact navigation links, which were fixed and reverified. |
| Public asset isolation | Passed: compiled public JS/CSS/HTML/JSON assets contained no hosted or local service credential, owner password, or local Supabase API address. |

## Security state

- Migrations `008_owner_role` and `009_access_management` are applied locally and to the selected hosted project. Their hosted application script normalizes Management API migration versions and remains idempotent.
- The designated owner account exists in hosted Supabase Auth and ownership is bound to its Auth UUID. The configured email is only the designated bootstrap identity after binding.
- The bootstrap script consumes the existing ignored `.env.hosted.local` values, confirms or creates the account, synchronizes the privately stored password, invokes the database bootstrap function, and never prints credentials.
- Ordinary admins cannot grant owner privileges, change any owner account, change the protected initial owner, or bypass the rules with direct profile updates. The database prevents demotion/deletion of the last owner.
- Owner recovery requires trusted service/database access, preserves the protected UUID, writes a private recovery artifact under ignored local storage, and produces an audit record. It is not exposed through the public client.
- Raw credentials, service-role values, integration payloads, and audit records remain outside anonymous access.

## Remaining action

Complete the Vercel, Supabase Auth URL, DNS, and Search Console tasks in [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md). From the linked repository, create the production candidate without promoting the canonical domain:

```powershell
vercel deploy --prod --skip-domain --scope feruzbeks-projects-10a1b6ab
```

Record the returned candidate URL and run `npm run deploy:verify -- --url <candidate-url>` plus browser login, accessibility and Realtime checks against that actual HTTPS origin before promotion. The current browser evidence uses a local production server connected to hosted Supabase; it does not claim that a Vercel candidate or canonical domain was tested. The repository was intentionally not deployed in this session.

Historical `agriflow` names remain only in applied SQL migrations, migration tooling's advisory lock/baseline identifier, and the existing local Supabase project ID. They are compatibility identifiers, not product copy. Changing applied migrations or lock keys would be unsafe and is unnecessary for the visible rebrand.

## Scope limits

Physical sensor calibration, live valve/pump actuation, field validation, measured yield improvement, and measured water savings remain outside this simulated MVP.
