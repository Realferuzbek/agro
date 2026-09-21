# Security model

The farmer product is a public simulated demonstration. Shared-state changes are privileged actions. `/admin` being absent from normal navigation has no security significance.

## Human identity and roles

Supabase Auth verifies the signed-in identity. Server handlers and database functions require the corresponding database `profiles.role = 'admin'`. New Auth users receive `farmer`; client-supplied user metadata cannot grant authority. No anonymous or ordinary authenticated client has direct table write grants.

Browser-visible Supabase anonymous keys are identifiers for RLS-governed access, not admin credentials. `SUPABASE_SERVICE_ROLE_KEY` bypasses ordinary RLS and is strictly server-only. Never prefix it with `NEXT_PUBLIC_`, return it in an API response, put it in browser storage, or commit it. `.env.local` is local secret configuration.

Use verified server-side Auth identity rather than trusting a cookie payload alone. Keep auth/session handling dynamic rather than shared-cacheable. The project uses cookie-aware Supabase server/browser clients; see the [official server-side guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## First administrator

The first admin is created by a privileged server-side bootstrap process using Supabase's administrative user API plus a database role update. Supply the email and a strong unique password through private environment values (`AGRIFLOW_ADMIN_EMAIL`, `AGRIFLOW_ADMIN_PASSWORD`) and the server-only service-role key. The routine must run on the operator's trusted machine or deployment job, never in a client component or public signup endpoint.

The database role is authoritative even if an Auth record contains `role: admin` metadata. Provisioning an Auth account alone does not grant admin access. If provisioning fails between account creation and role assignment, inspect the profile using a privileged database connection; the account remains a farmer until the trusted role update succeeds.

After successful creation, remove the bootstrap password from persistent environment files and use the normal `/admin/login` flow. Do not keep an example administrator password in seed SQL. Local public signup is disabled. TOTP enrollment/verification can be enabled by Supabase, but enforcing MFA assurance level is a future policy change; this MVP's administrator login uses email/password.

## Device credentials and ingestion

Device/gateway tokens are high-entropy, scoped to their registered device, stored only as hashes and revocable. A plaintext token is shown only at issuance. The server derives field binding, zone binding, mode and provenance from the device registry; the submitted body cannot choose these trust attributes.

Ingestion validates a versioned envelope, event identity, timestamp, typed measurement units, payload size and measurement ranges. Duplicate event IDs with different content are conflicts. Quality failures are evidence to retain and investigate, not values to feed blindly into control. A revoked/expired credential cannot submit accepted telemetry.

Raw integration payloads remain private. Normal product reads expose useful normalized values, health and freshness without register numbers, secrets or protocol debugging.

## Shared mutations and controls

Authoritative simulation mutations require both verified admin access and database authorization. Expected revisions prevent stale overwrites; idempotency keys and content hashes protect retries. Related accounting and history records commit atomically.

Public previews operate on an isolated browser/session snapshot. Visitors cannot use preview controls to modify shared crop parameters, scenarios, device identities or bindings. Physical hardware does not exist in this MVP; future live controller adapters must preserve acknowledgment, deadline and observed-state checks.

Critical flow, pressure, valve and inconsistent-telemetry faults pause simulated automatic control. Soil-sensor fallback remains an explicitly degraded model estimate. Alerts state evidence and possible causes rather than claiming a diagnosis.

## Operator checks

Before a hosted release, run the documented type/lint/test/build/browser gates plus real database RLS/transaction tests. Check anonymous and non-admin requests to every mutation endpoint, token revocation, duplicate/concurrent writes, raw-payload privacy and a second browser's preview isolation. Scan source and built browser assets for unintended secrets.

Restrict local Supabase to the local development machine. Use separate hosted environments, credentials and redirect URLs for preview and production. Rotate an exposed token; do not assume deleting it from a file invalidates it. Revoke compromised device credentials in the registry and suspend affected integration until new credentials are installed.

Validation evidence and any tests not run are recorded in [BUILD_PROGRESS.md](BUILD_PROGRESS.md). This document describes implemented boundaries, not an independent penetration-test certification.
