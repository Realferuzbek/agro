# Local setup and hosted deployment

Current delivery status is recorded in [BUILD_PROGRESS.md](BUILD_PROGRESS.md). The selected hosted Supabase target is **baraka-agro** (`gunzhtlbpxwpprqwnhfd`). All nine migrations, the calculated golden seed, parameter registry, protected owner bootstrap and hosted database access checks succeeded on September 23, 2026. Vercel identity and project **agro** under **feruzbeks-projects-10a1b6ab** are verified; the four application environment variables are configured for Production and Preview. The repository is release-ready, and the user-requested Vercel deployment remains the only release action.

## Local Supabase

Use the committed lockfile and Supabase configuration. Install Node.js 24.x, npm and Docker Desktop (or a compatible running container engine). The CLI runs from the project's dev dependencies; do not install an unpinned global substitute merely to get different behavior. The original Windows verification environment used Node 24.6.0; keep deployment on the same supported major and use maintained security updates.

```powershell
npm ci
npm run db:start
npx tsx scripts/setup-local.ts
npx tsx scripts/seed.ts
npx tsx scripts/bootstrap-admin.ts
npm run dev
```

`setup-local.ts` reads `supabase status -o json` and writes the ignored `.env.local` with local keys and generated bootstrap credentials, without logging secrets. It refuses to overwrite a hosted-looking file unless the operator explicitly runs `npx tsx scripts/setup-local.ts --repair-local`; that repair preserves existing private owner inputs while restoring local Supabase bindings. For manual setup, copy `.env.example`, inspect `npx supabase status -o env`, and map `API_URL` to `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` to `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SERVICE_ROLE_KEY` to the strictly server-only `SUPABASE_SERVICE_ROLE_KEY`. These are local values, not hosted project credentials. The CLI configuration already exists; do not rerun `supabase init` over it. See the [Supabase local-development documentation](https://supabase.com/docs/guides/local-development).

The SQL seed provides the demo farm, field and reference parameter versions. `npx tsx scripts/seed.ts` calculates the canonical domain snapshot and seeds device identities; creating tables alone does not create a functioning field state.

Local reset is destructive to local data: `npm run db:reset` reapplies SQL migrations and seed to the disposable local database. Run the calculated seed again after reset. Never point an equivalent reset operation at a hosted production database.

## Local owner provisioning

Run `npx tsx scripts/bootstrap-admin.ts` with private environment values `AGRIFLOW_ADMIN_EMAIL`, `AGRIFLOW_ADMIN_PASSWORD` and `SUPABASE_SERVICE_ROLE_KEY`. It creates/reuses the local Auth account and invokes the server-only `bootstrap_initial_owner` RPC, binding its confirmed UUID as the protected initial owner. Browser clients cannot invoke this process or assign themselves roles. The local setup script generates the email/password into ignored `.env.local` when absent; retrieve them from that file privately.

Bootstrap is repeatable: it reuses an existing matching email and intentionally resets that local account's password to `AGRIFLOW_ADMIN_PASSWORD` from `.env.local`. This keeps the documented local login consistent after interrupted setup. The setup, seed, bootstrap and integration scripts deliberately reject hosted URLs; use the controlled hosted procedure below for remote projects.

After bootstrap, verify `/admin` accepts the account and a non-admin account is forbidden from privileged actions. The local browser test reads private admin credentials from ignored `.env.local`; retain them while validating locally and never copy them into hosted runtime configuration. If provisioning is interrupted, inspect the Auth account and role with privileged tooling before retrying. Do not create another account solely to bypass a missing role.

## Quality and release gates

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

`db:test` and `test:integration` require the local database. The first runs the committed pgTAP SQL assertions; the second runs authenticated transaction tests. Browser tests start or reuse the application at `http://127.0.0.1:3000`; a seeded backend is required for connected-product and admin scenarios. Record skipped/unavailable checks separately from passed checks in [BUILD_PROGRESS.md](BUILD_PROGRESS.md).

The Playwright configuration starts a development server when none is running. To reproduce the local **production-server** browser gate, stop that development server, finish `npm run build`, start `npm run start` in a separate terminal, then run `npm run test:e2e` with `CI` unset so Playwright reuses the production server. Tests run sequentially against shared scenario data, create temporary test devices, and clean up those devices. Use the seeded local database and private local admin credentials.

Inspect the golden regression, all twelve failure scenarios, duplicate/concurrent accounting, role escalation denial, isolated public preview, authoritative Realtime in a second browser, responsive screens, keyboard behavior and error states. A successful `next build` cannot establish database correctness or physical device safety.

## Hosted Supabase and Vercel

Choose an existing hosted Supabase project and a Vercel team/project explicitly. Do not infer the destination from the local folder name. A custom domain is optional; the selected project's HTTPS `vercel.app` domain is sufficient. Keep local credentials in `.env.local`; supply cloud credentials separately through a trusted shell, encrypted release environment or ignored `.env.hosted.local`. Do not paste secret values into documentation or reports.

| Input | Where used | Secret? |
|---|---|---|
| Hosted `NEXT_PUBLIC_SUPABASE_URL` | Application build/runtime; must match selected project and use HTTPS | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Application build/runtime public key | No; low-privilege key only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server runtime, initialization and privileged setup | **Yes** |
| `NEXT_PUBLIC_SITE_URL` | Exact production application origin, without path/trailing slash | No |
| `SUPABASE_PROJECT_REF` | CLI target and deployment preflight; selected value `gunzhtlbpxwpprqwnhfd` | No |
| `SUPABASE_ACCESS_TOKEN` or authenticated Supabase CLI session | Supabase management/CLI operations | **Yes** |
| `SUPABASE_DB_PASSWORD` | Optional for direct database/link/push workflows; not needed by authenticated Management API queries | **Yes**, when used |
| Vercel team/org and project IDs | Explicit target; `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, or verified local project link | No |
| `VERCEL_TOKEN` or authenticated Vercel CLI session | Upload/configure selected Vercel project | **Yes** |
| Hosted first-admin email/password | One-time trusted bootstrap and admin verification | Password is **secret** |
| Deployment protection bypass token, if enabled | Automated requests to protected candidate deployment | **Yes**, optional |

The app retains the historical environment variable names for compatibility. A Supabase **publishable** key can populate `NEXT_PUBLIC_SUPABASE_ANON_KEY`; a server **secret** key can populate `SUPABASE_SERVICE_ROLE_KEY`. Legacy anon/service-role keys also work while enabled. Never put the elevated key in the public variable. Supabase now recommends the newer key types. [API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

Supabase's management access is separate from its application API keys. The installed CLI supports `db query --project-ref` through the authenticated Management API, without requiring a database password; direct database workflows can require that password. Vercel's project/org IDs identify the target rather than authenticate the operator. [Supabase environment deployment](https://supabase.com/docs/guides/deployment/managing-environments), [Vercel CLI workflow](https://vercel.com/kb/guide/using-vercel-cli-for-custom-workflows).

The Vercel team/project and intended owner identity are supplied. CLI identity/link and the four runtime/build variables are configured for Production and Preview. Trusted owner provisioning, hosted Auth verification, database authorization checks and the hosted-environment production build have passed. The final candidate deployment and its origin-specific smoke check remain separate release actions. Inspect the progress ledger before repeating migrations or bootstrap. Keep passwords, recovery/invitation links and service keys in trusted private channels or the platform secret store, never in a commit or report.

The deployment helper reads ignored `.env.hosted.local`, with matching process environment values taking precedence. It does not read local `.env.local`. Check the configuration without printing values:

```powershell
npm run deploy:check
```

This validates configuration shape, public HTTPS URLs, a non-elevated public key, the Supabase reference and explicit Vercel project/org identifiers (environment variables or `.vercel/project.json`). It does **not** authenticate a Vercel token, contact Supabase, apply migrations or prove a deployment. Verify actual CLI identity and the selected targets independently.

For the selected existing project, first inventory schema objects, application tables, migration history, grants/policies and Auth settings without changing them. Resolve name collisions and preserve unrelated data before applying any new schema. A minimal connectivity check, which does not mutate data, is:

```powershell
npx supabase db query --project-ref gunzhtlbpxwpprqwnhfd 'select current_database(), current_user;'
```

For reviewed SQL files the same command supports `--file <path>`. Executing SQL through this path does not automatically establish the normal migration history: the release procedure must record the exact migrations after successful application and verify their state. Do not replay initial `CREATE` statements over an existing unrelated schema or treat a read-only inventory as migration completion.

For the selected project, the reviewed release used these target-restricted scripts:

```powershell
npx tsx scripts/hosted-migrate.ts --project-ref gunzhtlbpxwpprqwnhfd
npx tsx scripts/hosted-apply-registry.ts --project-ref gunzhtlbpxwpprqwnhfd
npx tsx scripts/hosted-seed.ts
npx tsx scripts/hosted-verify.ts
node node_modules/supabase/dist/supabase.js db query --linked --project-ref gunzhtlbpxwpprqwnhfd --file scripts/hosted-audit.sql
```

These commands have already succeeded for `baraka-agro`; they are the release record, not instructions to replay the initial migration. `hosted-migrate.ts` refuses a target with application tables, applies migrations `202609210001`–`202609210006` plus the static seed atomically, and records their SQL/version/name in `supabase_migrations.schema_migrations`. It verifies preservation of the existing `rls_auto_enable` function and `ensure_rls` event trigger. The separate registry transaction adds `202609210007` while retaining older immutable versions.

`hosted-seed.ts` reads private `.env.hosted.local`, requires the selected reference/URL pair, and calls `initialize_demo_state` with `createSimulation('rain-underperforms')` plus `buildForecast`. An existing field snapshot is preserved. `hosted-verify.ts` checks public golden values, distinct 7 mm forecast / 2 mm observed rain, 12 simulated devices and denial of anonymous private reads/role changes/shared mutations. Its restricted mutation probes are expected to fail. `hosted-audit.sql` checks non-admin denial inside a rolled-back transaction, then reads migration/RLS/role/publication/parameter evidence. These checks do not create an Auth account or prove the Vercel UI works.

For a different explicitly selected compatible target using the ordinary linked migration workflow, apply the hosted database in this order. The target-specific scripts above intentionally cannot silently deploy to it:

```powershell
npx supabase link --project-ref $env:SUPABASE_PROJECT_REF
npx supabase db push --dry-run --include-seed
npx supabase db push --include-seed
npx supabase migration list
```

The installed CLI's `--include-seed` explicitly includes `supabase/seed.sql`; `--dry-run` only lists planned migrations. Inspect the target and migration list before the write. Never run `db reset` against a hosted project. A migration apply does not synchronize hosted Auth settings from the local `config.toml`. [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push).

For a newly selected target, initialize the field with a trusted server process calling `initialize_demo_state` using `createSimulation('rain-underperforms')` and `buildForecast(state)` from this repository. The initializer preserves an existing field. For the selected `baraka-agro` target this step is already complete. Provision the first admin using the privileged procedure below. In the hosted Auth settings, enable email/password login, disable public user signup, set the exact application site URL and approved redirect origins, and retain the same role policies. These Auth settings and successful hosted login remain separate release checks. [Auth redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

Configure Vercel as Next.js with root `.`, install command `npm ci`, build command `npm run build`, and Node 24.x. This application needs a server runtime for Auth, APIs and ingestion; it cannot be a static export. Set the four runtime/build variables from the table in the selected Vercel environment, with the service key marked secret. Add secrets through the Vercel dashboard or secure interactive `vercel env add`, avoiding command arguments that contain their values. [Vercel environment variables](https://vercel.com/docs/cli/env).

Next.js inlines `NEXT_PUBLIC_*` values when building. Build with the hosted URL/key, not the local `.env.local` values; changing environment variables after compilation does not update the browser bundle. The installed Next.js deployment and environment guides under `node_modules/next/dist/docs/` were reviewed for this version. See also [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).

The selected project is already linked. Build its production candidate with `vercel deploy --prod --skip-domain --scope feruzbeks-projects-10a1b6ab`, record the returned deployment URL, and run the verification below before `vercel promote <deployment-url>`. Pin the deployment CLI in the release environment. The first deployment of a new Vercel project may be production even when `--prod` is omitted; do not treat an unqualified `vercel deploy` as a preview guarantee. [Project linking](https://vercel.com/docs/cli/link), [deployment flags](https://vercel.com/docs/cli/deploy), [promotion](https://vercel.com/docs/cli/promote).

The first **hosted owner** uses the target-restricted trusted bootstrap. After testing the access migration locally, apply the two additional migrations and bind the user-designated identity:

```powershell
npx tsx scripts/hosted-apply-access.ts --project-ref gunzhtlbpxwpprqwnhfd
npx tsx scripts/hosted-bootstrap-owner.ts --project-ref gunzhtlbpxwpprqwnhfd
```

`hosted-apply-access.ts` records `202609230008_owner_role` and `202609230009_access_management` in separate committed transactions: PostgreSQL must commit the new enum value before using it. It creates no Auth identity. The bootstrap requires the designated email and a strong password already stored in ignored `.env.hosted.local`, creates or confirms that Auth identity, synchronizes the stored password without printing it, then binds the confirmed **UUID** through `bootstrap_initial_owner`. It records `AGRIFLOW_OWNER_ID`, `AGRIFLOW_OWNER_EMAIL` and `AGRIFLOW_OWNER_PASSWORD` privately. These are trusted bootstrap and verification inputs, not application runtime variables.

The selected hosted project has already completed these steps. Repeatable read-only/temporary verification is available through `npx tsx scripts/verify-hosted-owner.ts` and `npx tsx scripts/verify-hosted-access.ts`; the latter creates and removes a disposable user while proving that a regular admin cannot demote, disable or directly rewrite the protected owner.

The initial owner cannot be replaced, disabled or demoted. Repeating bootstrap for its UUID is safe; a different UUID is rejected. Do not use ad hoc `profiles.role` updates or grant profile-table writes to ordinary authenticated users. After verified sign-in, Team & Access permits authorized invitations and permission changes with database safeguards. Configure `/auth/accept` as an approved hosted invitation/recovery redirect and verify the email provider separately from account creation.

For trusted recovery of the same protected initial-owner UUID:

```powershell
npx tsx scripts/owner-recovery.ts --project-ref gunzhtlbpxwpprqwnhfd --user-id <protected-owner-uuid>
# Local equivalent:
npx tsx scripts/owner-recovery.ts --local --user-id <protected-owner-uuid>
```

Recovery requires privileged server credentials, audits the request and saves a private single-use Auth recovery link only to ignored `.local/owner-recovery.txt`. Open it privately and remove the file after use; do not copy it into logs, issue reports or version control. The flow preserves the Auth UUID and owner role. It is not a role reassignment or a bypass of owner protections.

## Hosted acceptance evidence

Before domain promotion, retain the candidate URL, selected project IDs, applied migration versions, commit/build identifier and dated check results. A protected candidate must be tested with the operator's legitimate automation bypass; a Vercel sign-in page is not an AgriFlow success response. Keep any bypass token out of logs. [Vercel automation access](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation).

Run the repository's read-only smoke check against the actual deployed candidate:

```powershell
npm run deploy:verify -- --url https://your-candidate.vercel.app
```

Without `--url`, the script uses hosted `NEXT_PUBLIC_SITE_URL`. It checks the seven page responses, unauthenticated admin login, persisted `/api/product` shape, HTTP 401 on anonymous admin overview, and same-origin JavaScript bundles for the configured service key and local Supabase addresses. It does not mutate a field or prove authenticated control, Realtime, visual quality, or a complete absence of secrets. The current helper does not attach deployment-protection bypass headers; for a protected candidate, use the operator's legitimate authorized test path and retain equivalent checks rather than interpreting a protection page as a pass.

| Check | Passing evidence |
|---|---|
| Public pages | `/`, `/field`, `/irrigation`, `/forecast`, `/history`, `/devices` return/render the product over HTTPS with one persistent simulation disclosure |
| Persisted product | `/api/product` returns schema version 1, finite water values, a database revision and the intended seeded/scenario state |
| Public boundaries | Anonymous `/api/admin/overview` returns 401; `/admin` renders login, not privileged data; raw telemetry/audit/credential reads remain denied |
| Public preview | Delivery advances locally; second browser and authoritative database revision remain unchanged |
| Privileged flow | Hosted admin can sign in, load a scenario, step it, inspect a calculation and sign out; non-admin cannot mutate |
| Realtime | A second browser sees the committed state/recommendation change without resetting its own preview |
| Browser integrity | No hydration/page errors; mobile/tablet/desktop fit, keyboard and reduced motion work; public bundles contain no service key, bootstrap password or local Supabase address |
| Final origin | Repeat smoke/login checks after promotion using the canonical site origin and its Auth configuration |

The current default Playwright suite is local and contains authorized scenario mutations; do not point it at a shared production field without adapting its explicit target, credentials and mutation scope. Read-only cloud smoke checks complement rather than replace the local scientific, SQL/RLS and integration gates.

## Operations and rollback

The client-driven simulation stops when its controlling session closes. Monitor application route errors, Supabase Auth/database failures, rejected telemetry, repeated version conflicts and stale device observations. A missed step does not require inventing delivered water; subsequent requests advance only explicitly requested time.

Keep database backups and retain immutable parameter/calculation versions. Roll back application code to a compatible deployment first; prefer a forward corrective migration for schema changes. Do not edit already-applied migration history or delete accounting records to conceal a faulty calculation. Revoke compromised device tokens and rotate exposed service credentials using Supabase's supported controls.

Before introducing live hardware, separately validate its clock, field/zone binding, unit normalization, resettable counters, acknowledgment/deadline behavior, calibration and fail-safe operating policy. Simulated commissioning is never evidence that a physical pump or valve was tested.
