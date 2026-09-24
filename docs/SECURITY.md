# Security model

The farmer product is a public simulated demonstration. Shared-state changes are privileged actions. `/admin` being absent from normal navigation has no security significance.

## Human identity and roles

Supabase Auth verifies the signed-in identity. Server handlers and database functions require an enabled database profile with role `admin` or `owner`, plus the permission required by the operation. New Auth users receive `farmer`; client-supplied user metadata cannot grant authority. No anonymous or ordinary authenticated client has direct profile-role write grants.

Operational permissions are `simulation.manage`, `devices.manage`, `parameters.manage` and `audit.read`. Owners have all of them. An admin receives an explicit subset; the separate `can_manage_admins` flag permits delegated team management. Server checks and database RPC/RLS checks enforce these boundaries independently, including fresh profile reads after disabling access.

Browser-visible Supabase anonymous keys are identifiers for RLS-governed access, not admin credentials. `SUPABASE_SERVICE_ROLE_KEY` bypasses ordinary RLS and is strictly server-only. Never prefix it with `NEXT_PUBLIC_`, return it in an API response, put it in browser storage, or commit it. `.env.local` is local secret configuration.

Use verified server-side Auth identity rather than trusting a cookie payload alone. Keep auth/session handling dynamic rather than shared-cacheable. The project uses cookie-aware Supabase server/browser clients; see the [official server-side guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Initial owner and team management

The first local owner is created by `npx tsx scripts/bootstrap-admin.ts`, using Supabase's administrative user API and the server-only `bootstrap_initial_owner` RPC. Supply the email and a strong unique password through private environment values (`BARAKA_ADMIN_EMAIL`, `BARAKA_ADMIN_PASSWORD`) and the server-only service-role key. The routine must run on the operator's trusted machine, never in a client component or public signup endpoint.

The database role is authoritative even if an Auth record contains `role: admin` or `owner` metadata. Provisioning an Auth account alone does not grant administrative access. The bootstrap requires a confirmed identity and stores its UUID in `private.owner_registry`, serializes concurrent attempts, audits the binding, and rejects replacement by a different UUID. Repeating it for the same UUID is idempotent. An interrupted account creation remains unprivileged until trusted binding succeeds.

The local bootstrap rejects hosted URLs and resets an existing local account's password to the private bootstrap value so repeated setup has a consistent login. The separate target-restricted hosted bootstrap preserves an existing account's password and creates a generated password only for a missing designated identity. It binds that UUID through the same protected RPC. See [deployment](DEPLOYMENT.md) for commands and recovery. No browser self-assignment or direct-profile promotion path is offered.

The initial owner cannot be demoted, disabled, deleted or replaced. Other owners can be managed only by owners, and the final enabled owner cannot be removed. No actor can edit its own access through management. Delegated admin managers cannot grant ownership, affect an owner, or delegate operational permissions they do not hold. Database triggers also protect owner Auth UUID/email/phone changes, deletion and bans; ordinary password-change/recovery flows remain available. Trusted recovery preserves identity and roles.

Team & Access uses `GET /api/admin/access`, `POST /api/admin/access/invitations`, and `PATCH /api/admin/access/users/{id}`. Mutations require same-origin requests, verified manager authorization and schema validation. Invitations record the request first, use the server Auth API for a new identity, then recheck the initiating manager's current permissions before granting rights. An existing identity is reused without changing its password. Failed provider/grant outcomes are audited; a recorded invitation is not proof that email reached an inbox. Raw invitation records are limited by management RLS.

After successful creation, use the normal `/admin` flow. Invitation/recovery acceptance uses `/auth/accept`; tokens are removed from the visible URL before status/error rendering. The local admin browser test reads credentials from ignored `.env.local`; keep them private and out of hosted runtime variables. Do not keep an example administrator password in seed SQL. Local public signup is disabled. TOTP enrollment/verification can be enabled by Supabase, but enforcing MFA assurance level is a future policy change; this MVP's administrator login uses email/password.

The local configuration keeps the email/password provider enabled under `[auth.email]` while top-level `[auth].enable_signup = false` prevents public registration. Disabling the email provider itself prevents administrator password login too. Real admin browser login has been verified with this separation.

## Device credentials and ingestion

Device/gateway tokens are high-entropy, scoped to their registered device, stored only as hashes and revocable. A plaintext token is shown only at issuance. The server derives field binding, zone binding, mode and provenance from the device registry; the submitted body cannot choose these trust attributes.

Ingestion validates a versioned envelope, event identity, timestamp, typed measurement units, payload size and measurement ranges. Duplicate event IDs with different content are conflicts. Quality failures are evidence to retain and investigate, not values to feed blindly into control. A revoked/expired credential cannot submit accepted telemetry.

Raw integration payloads remain private. Normal product reads expose useful normalized values, health and freshness without register numbers, secrets or protocol debugging.

## Shared mutations and controls

Authoritative simulation mutations require both verified admin access and database authorization. Expected revisions prevent stale overwrites; idempotency keys and content hashes protect retries. Related accounting and history records commit atomically.

Public previews operate on an isolated browser/session snapshot. Visitors cannot use preview controls to modify shared crop parameters, scenarios, device identities or bindings. Physical hardware does not exist in this MVP; future live controller adapters must preserve acknowledgment, deadline and observed-state checks.

Missing/invalid/stale critical weather, rainfall, flow, pressure, pump or valve channels and inconsistent telemetry restrict or pause simulated automatic control. Soil-sensor loss permits an explicitly qualified model fallback with `Moderate` quality. Alerts state evidence and possible causes rather than claiming a diagnosis. The model-clock freshness thresholds are documented in [simulation](SIMULATION.md).

## Operator checks

Before a hosted release, run the documented type/lint/test/build/browser gates plus real database RLS/transaction tests. Check anonymous and non-admin requests to every mutation endpoint, token revocation, duplicate/concurrent writes, raw-payload privacy and a second browser's preview isolation. Scan source and built browser assets for unintended secrets.

Restrict local Supabase to the local development machine. Use separate hosted environments, credentials and redirect URLs for preview and production. Rotate an exposed token; do not assume deleting it from a file invalidates it. Revoke compromised device credentials in the registry and suspend affected integration until new credentials are installed.

Validation evidence and any tests not run are recorded in [BUILD_PROGRESS.md](BUILD_PROGRESS.md). This document describes implemented boundaries, not an independent penetration-test certification.
