# Database and persistence

The local database is real PostgreSQL provided by Supabase. Schema, grants, RLS, transaction functions and Realtime publication are defined in versioned SQL under `supabase/migrations/`; reproducible demonstration configuration lives in `supabase/seed.sql`.

## Local lifecycle

Start Docker Desktop, then run:

```powershell
npm run db:start
npx supabase status -o env
```

Copy the local API URL, anonymous key and service-role key into the corresponding values in `.env.local`. The service-role value is server-only. `npm run db:reset` **recreates the local database and its data**, reapplies migrations and runs the SQL seed; use it only for a disposable local environment. Run `npm run test:integration` for real database tests when the Docker stack is available. `npm run db:stop` stops the local stack.

Alternatively, `npx tsx scripts/setup-local.ts` writes local connection values and private bootstrap credentials without displaying them. After SQL setup/reset, run `npx tsx scripts/seed.ts` to create the calculated product snapshot and devices, then `npx tsx scripts/bootstrap-admin.ts` to provision the privileged login. See [deployment](DEPLOYMENT.md).

The configured ports are API `54321`, PostgreSQL `54322`, Studio `54323`, and local email viewer `54324`. Public email sign-up is disabled. Do not initialize a second Supabase configuration: this repository already contains one. The [Supabase local-development guide](https://supabase.com/docs/guides/local-development) explains the CLI/container prerequisites.

## Data ownership

| Tables | Purpose |
|---|---|
| `profiles` | Auth user mapping; database-owned `farmer` / `admin` / `owner` role, operational permissions, management flag and disabled state |
| `private.owner_registry`, `admin_invitations` | Immutable initial-owner UUID binding and audited administration invitation lifecycle |
| `farms`, `fields` | Public-demo designation, field identity, area and configuration |
| `parameter_sets` | Versioned crop, soil, policy, irrigation and simulation parameters with source metadata |
| `devices`, `device_credentials` | Server-owned bindings/mode/configuration and hashed revocable credentials |
| `product_state`, `state_mutations`, `simulation_controls` | Canonical snapshot/revision, committed idempotency records and persisted simulation control settings |
| `calculation_runs`, `recommendations` | Immutable versioned input/output snapshots and derived recommendations |
| `telemetry`, `device_latest_state` | Deduplicated observation history, private raw payload and current normalized values |
| `weather_observations`, `weather_forecasts` | Separate observed and forecast weather domains |
| `irrigation_runs` | Delivery/run history, including targets and progress |
| `alerts`, `simulation_events` | Evidence-bearing incidents and deterministic scenario events |
| `commissioning_runs`, `audit_logs` | Simulated engineering checks and privileged-action history |

The `product_state.state` JSON snapshot is the serialized, versioned domain `SimulationState`; `revision` is the authoritative database concurrency token. Do not confuse database revision with the simulation's own transition count. The homogeneous field's soil water resides inside this canonical field snapshot. Zone delivery history is retained within run snapshots.

Calculation rows store engine version, parameter version, calculation time, full inputs and outputs, including intermediates. The rows permit reproducing a historical recommendation without reading today's mutable field state. Application clients have no update/delete permission on these records.

Migration `202609210007_parameter_registry.sql` persists the exact tested runtime composite `potato-loam-demo-1.0.0`, crop reference `potato-reference-1.0.0` and current policy `policy-1.0.1`. The composite includes agronomy values, crop-stage assumptions, device-quality policy, simulation configuration and component versions. The older policy draft remains immutable; it is not silently rewritten to resemble the runtime. A registry-parity integration test compares the active persisted composite to domain exports.

## Transactions and replay

The simulation commit function locks the current field row, checks the existing idempotency record, checks the expected revision, and commits the new state and associated bundle as one PostgreSQL transaction. The bundle includes calculation/recommendation snapshots, generated observations, telemetry/latest values, events, alerts, delivery history and audit evidence.

An identical retry returns a duplicate acknowledgment without reapplying state. Reusing the same key with different request content is an error. A stale expected revision is a conflict, not an instruction to overwrite another client's state. A failure during any bundled write rolls back the transaction.

Telemetry has a uniqueness constraint on `(device_id, event_id)` and a content hash. Device observations preserve both observation and server receipt time. Older events must not overwrite a newer latest-device value. Rain and delivered water require the same deduplication protection as ordinary telemetry; UI refreshes cannot be accounting events.

The optional measured-model transaction locks credential, device, field configuration and canonical state in a consistent order. Approved observed-rain assimilation checks the state revision and cumulative-counter baseline, then commits telemetry/latest values, water balance, observation history, calculation, recommendation and audit atomically. Duplicate receipts contribute no second rainfall. See [hardware integration](HARDWARE_INTEGRATION.md) for the explicit field approval and date requirements.

## Reads and security

RLS is enabled on every exposed application table. Anonymous reads are limited to intentionally public demo projections and reference parameter data. Raw telemetry payloads, mutation logs, commissioning history, audits and credentials are not public reads. Ordinary authenticated users can read their own profile; they cannot update their role.

Administrative authority comes from `profiles`, not user-editable metadata. New Auth users always receive the `farmer` default. Controlled server/database bootstrap binds the confirmed initial owner's UUID; profile/Auth triggers protect that owner and prevent client role escalation. Capability-aware RLS/RPC checks restrict operational and team-management access. Private security-definer functions use an empty search path and explicit schema names; exposed wrappers use invoker context. See [security](SECURITY.md).

Realtime publishes compact current product state, alerts and latest device state. History queries should be bounded and ordered by the indexed field/device timestamp columns; never reload all raw history for a dashboard refresh.

The public `/api/history` read exposes the latest 20 shared irrigation sessions through RLS, including target versus delivered volume, zone progress and status. Public browser previews are not written into this session history. Admin integration views query persisted latest-device readings and alerts, including accepted measured telemetry, rather than showing only the simulator's device array.

## Verification

Database tests must verify anonymous read limits, role escalation denial, admin checks, duplicate requests, conflicts, revocation, out-of-order observation handling, and rollback. These are integration checks against running PostgreSQL/Auth; unit mocks cannot establish that RLS works. See [build progress](BUILD_PROGRESS.md) for executed versus environment-blocked results.

Run `npm run db:test` for the 12 pgTAP assertions in `supabase/tests/security.test.sql`: required tables, RLS coverage, anonymous/authenticated grants, role-write denial, private credential/telemetry access, restricted ingestion and exposed RPC security mode. The SQL suite runs inside a rolled-back transaction.

Run the TypeScript integration suite explicitly with `npm run test:integration`; it loads the local environment, rejects hosted URLs, and enables real PostgreSQL/Auth transaction tests. This complements SQL privilege assertions with authenticated behavior, concurrency, rollback and telemetry accounting. A normal domain-only Vitest run is not evidence that either local backend gate passed.
