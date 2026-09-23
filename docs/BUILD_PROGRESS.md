# Build progress

Status: final local validation and hosted release are in progress. Updated September 23, 2026 (Tashkent). A check is complete only when its result is recorded here; implemented capability, a previous passing subset, or a configured command is not a completed release gate.

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
| Scientific engine | Domain gate passed | Golden chain, independent FAO examples, conservation/bounds, forecast-window projection and provider tests pass. Final suite result is recorded below. |
| Database and security | Local integration gate passed | Local Supabase healthy; migrations, seed and bootstrap succeeded; 17 real database/Auth/RLS/transaction tests passed after adding parameter-registry parity. |
| Simulation and providers | Expanded domain gate passed | 50 domain tests passed, including 12 regressions for explicitly configured zone-soil accounting in addition to rain-window, repeat-run, wetting, future-stage, critical-channel and provider coverage. |
| Farmer product | Browser gate passed; final post-polish rerun pending | Six routes, recommendation explanation and session preview present. All 12 production-server desktop/mobile browser cases passed. |
| Protected admin | Focused browser gate passed | Admin sign-in, scenario mutation, calculation inspection and logout passed after the email-provider configuration fix. Eight tabs, credential list/revoke, DB-backed latest readings/alerts and field binding fixes are present. |
| Realtime and accessibility | Partial verification | Desktop/mobile browser suite and visual review completed; mobile heading layout and reduced-motion chart refinements are saved. Additional device lifecycle/Realtime checks and final rerun are underway. |
| QA and delivery | In progress | Production build passed all 23 routes. Final post-edit build/browser checks and hosted release are separate outstanding gates. |

## Validation ledger

| Command | Result | Evidence / limits |
|---|---|---|
| Domain test suite | Passed | 50 domain tests passed on September 23, 2026 after adding configured zone-soil support. The default audited golden values remain ET₀ 5.009468525935759, ETc 5.788693413486792 and gross volume 60086.09502236647 L. Final combined suite count must not be confused with the domain-only count. |
| `npm run typecheck` | Passed | Entire current UI and API source passed; final post-fix rerun pending. |
| Local Supabase setup, seed, admin bootstrap | Passed | Golden state persisted and admin created by privileged local script; production-server browser checks succeeded after the host restart. |
| `npm run lint` | Final rerun pending | Local scratch directory is now excluded; final result must be recorded after the latest edits. |
| `npm run build` | Passed; final post-edit rerun pending | Production build compiled and typechecked all 23 routes on September 23. Subsequent mobile layout/reduced-motion and acceptance-test changes require final verification. |
| `npm run test:integration` | Passed | 17/17 real PostgreSQL/Supabase Auth checks passed after migration 007: RLS, role escalation, authorized atomic writes, duplicate/concurrent requests, rollback, credential scope/revocation, telemetry validation, observed-rain accounting and exact parameter-registry parity. |
| `npm run db:test` | Passed | 12/12 pgTAP assertions passed again after migration 007: table/RLS coverage, grants, private data, role-write denial and RPC privileges. |
| Focused Playwright admin-login flow | Passed | Root confirms admin login, shared scenario changes, calculation inspector and logout now pass. Earlier HTTP 401 was fixed by enabling the email sign-in provider while retaining disabled public signup. |
| Production-server Playwright | Passed; extended rerun pending | 12/12 desktop/mobile tests passed, with no skips. Earlier development-indicator obstruction is resolved. Device credential lifecycle and authoritative Realtime coverage are being added before the final rebuilt run. |
| Desktop accessibility contrast check | Passed | Root reports the desktop contrast check passed; this does not establish the full browser suite. |
| Desktop/mobile visual review | Reviewed; post-fix verification pending | Production screenshots inspected. Mobile heading/action squeeze corrected; chart reduced-motion behavior made explicit. Final rendered checks remain required after these edits. |
| Hosted Supabase target/access | Selected and authenticated | User selected existing `baraka-agro` (`gunzhtlbpxwpprqwnhfd`); authenticated CLI Management API queries are available. Completed read-only inventory found no user/application tables or collisions. Existing platform `rls_auto_enable` is preserved. |
| Hosted migrations and calculated seed | Passed | Target-restricted scripts committed `202609210001`–`202609210007`; static/calculated seed and exact runtime parameter registry are persisted. Public golden state is 60,086 L with 7 mm forecast / 2 mm observed rain and 12 simulated devices. Engine is `1.0.0`; composite parameter row is `potato-loam-demo-1.0.0`. |
| Hosted database access/security audit | Passed for stated checks | Zero public tables lack RLS; anonymous private reads/role writes/shared mutations and a fabricated authenticated non-admin RPC were denied. Authenticated profile-role update and credential-hash read grants are absent. Realtime publishes product state, alerts and latest devices. Platform `ensure_rls`/`rls_auto_enable` are preserved. The pre-owner-provisioning audit found zero Auth users/admins. |
| Hosted first owner / team management | Identity supplied; implementation/provisioning in progress | Intended owner identity supplied. Trusted bootstrap, owner/manager controls and successful hosted sign-in remain verification gates; no public self-assignment is allowed. |
| Vercel access and environment | Passed | CLI identity and selected `agro` project under `feruzbeks-projects-10a1b6ab` verified. Hosted Supabase public URL/key, server service key and site origin configured in Production and Preview; values remain private. |
| Hosted Vercel deployment and cloud smoke checks | In progress | Final source, Linux-compatible dependency lock and owner-management release are being validated. A successful final candidate URL and acceptance results are not yet recorded. |

The latest production browser run exercised both desktop and mobile without skips. Newly added cases and any source edits must pass a final run against the rebuilt application. Vitest configuration now uses `.mts`, removing the earlier ESM loader warning.

## Definition of Done matrix

This maps all 20 master-spec completion items. **Implemented** means source is present; **passed** means the stated check ran; **pending** remains an open acceptance gate. The hosted column refers to the selected cloud environment and released application, not the local Docker database.

| # | Required outcome | Local evidence / status | Hosted evidence / status |
|---|---|---|---|
| 1 | One polished application | One Next.js product/admin app implemented; final visual acceptance pending | Application deployment pending |
| 2 | Today, Field, Irrigation, Forecast, History, Devices | Six-route navigation/viewport tests passed on desktop/mobile; final post-edit rerun pending | HTTPS route/browser smoke pending |
| 3 | Clear persistent demo disclosure | Single product-level disclosure browser assertion passed on desktop/mobile | Rendered disclosure pending verification |
| 4 | Deterministic scientific calculations | Domain replay, injected-clock and boundary tests passed in the 50-test suite | Release must identify the same tested engine/build |
| 5 | Golden scientific regression passes | Exact ET₀, ETc, RAW, net/gross and zone-runtime regression passed | Persisted golden initialization verified; deployed UI display pending |
| 6 | Forecast and observed rain remain separate | Whole-window projection and observed-only accounting regressions passed | Persisted 7 mm forecast / 2 mm observed verified; hosted control smoke pending |
| 7 | Canonical root-zone state persists | Real Supabase persistence and atomic update tests passed; field owns water state | Seven migrations and canonical field snapshot verified |
| 8 | Correct mm → litres → gross delivery → zones → runtime | Golden chain, mass balance, partial delivery and exactly-once efficiency tested | Candidate must expose the matching snapshot and runtime |
| 9 | Coherent simulated devices | Provider, ramps, acknowledgments, integrated flow, lag and quality tests passed | Shared simulation browser verification pending |
| 10 | Failure scenarios work | All twelve deterministic scenarios represented and tested in the passing domain suite | Authorized scenario/recovery smoke pending |
| 11 | Transparent recommendation explanation | Calculation chain, accessible drawer, Escape handling and golden values passed desktop/mobile browser checks | Candidate explanation/keyboard check pending |
| 12 | Understandable farmer devices page | Health, freshness, assignment and values implemented; route/viewport checks passed | Candidate devices verification pending |
| 13 | Hidden and protected admin | Farmer navigation excludes admin; verified Auth/server roles/RLS tested; focused login flow passed | Database anonymous/non-admin denials passed; first admin and deployed HTTP boundaries pending |
| 14 | Simulation Lab works | Run/pause/reset/speeds and protected stepping implemented; scenario/step browser flow passed | Hosted session/navigation/close and mutation smoke pending |
| 15 | Calculation Inspector works | Immutable input/intermediate/output/version records and admin browser check passed | Hosted authenticated historical inspection pending |
| 16 | Future hardware adapter/telemetry contract | Seven providers, validated ingest, scoped/revocable tokens and measured-rain tests passed; physical commissioning outside MVP | Ingestion boundary/revocation checks in selected environment pending |
| 17 | Sound database and RLS | 17 authenticated integration tests including registry parity and 12 SQL assertions passed | Seven migrations, RLS/grants/publication and non-admin transaction denial verified; application integration pending |
| 18 | Production build succeeds | All 23 routes compiled/typechecked; final post-polish rebuild pending | Vercel production build and candidate pending |
| 19 | No critical TypeScript/lint/test failures | TypeScript/domain/backend/SQL/browser gates have passed; final lint and post-edit release rerun pending | No cloud release claim before matching checks and smoke pass |
| 20 | Premium, responsive UI | Desktop/mobile screenshots inspected; reference palette/distinct views/contrast checks passed; layout fixes need final review | Final-origin mobile/tablet/desktop acceptance pending |

Additional approved-plan gates remain explicit:

| Gate | Local status | Hosted status |
|---|---|---|
| Preview isolation, reload and partial delivery | Session-local preview, reload and authoritative-revision isolation passed desktop/mobile; final rerun pending | Two-session isolation pending |
| Idempotency, concurrency, rollback and daily transitions | Database integration and deterministic domain tests passed; final rerun pending | Selected-environment policy/transaction evidence pending |
| Realtime propagation | Subscription implemented; two-browser authoritative propagation acceptance pending | Candidate Realtime acceptance pending |
| Loading, empty, degraded, forbidden, unavailable, stopped states | Implemented; final state review pending | Deployed unavailable/authorization paths pending |
| Accessible charts, keyboard, reduced motion; no hydration/console failures | Desktop axe check passed; full browser/manual review pending | Candidate and final-origin review pending |
| No exposed secrets | Server-only boundaries implemented; final browser-bundle/environment inspection pending | Build with hosted public values; configured-secret/local-URL smoke pending |
| Explicitly configured zone-specific soil support | Implemented behind versioned complete-zone configuration; 12 zone regressions passed, with default homogeneous golden unchanged. Authenticated configuration API and mode-specific presentation need final combined acceptance | Same tested-build requirement |
| Centralized English copy | Shared interface catalogue consumed by the existing product/admin components; scoped ESLint passed. Final browser regression pending after extraction | Same tested-build requirement |
| Setup, migrations, seed, environment example and requested documentation | Files present; local lifecycle succeeded; links/commands reviewed | Executed hosted schema/seed/audit procedure recorded; Vercel/admin procedure awaiting inputs |

## Remaining hosted configuration

Supabase access and Vercel CLI identity/target are verified. The user has supplied the intended owner identity; the four hosted runtime/build variables are configured in Production and Preview for Vercel `agro` under `feruzbeks-projects-10a1b6ab`. Complete trusted owner bootstrap and record successful hosted sign-in/deployment checks. Verify the final application origin against `NEXT_PUBLIC_SITE_URL` and hosted Auth settings. Service credentials and invitation/recovery links remain private. See [deployment](DEPLOYMENT.md) for variable names and preflight/smoke command limits.

## Environment and limitations

- Development workspace: `F:\agro` on Windows PowerShell.
- Application deployment requires user-controlled Vercel and Supabase projects and their environment configuration.
- The selected existing Supabase project retains its platform objects. Read-only inventory, reviewed migrations, seed and database security checks are complete. No hosted reset was used.
- Physical sensor calibration, live valve/pump operation, field validation, yield improvements, and measured water savings are outside this simulated MVP.
- Measured ingestion can atomically assimilate approved, model-day-compatible rainfall into an explicitly measured field. It never actuates hardware (`controlApplied: false`); `fieldModelUpdated` identifies optional model changes. Independent soil fusion and measured irrigation integration remain separate commissioning work.
