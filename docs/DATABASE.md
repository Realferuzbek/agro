# Database and persistence

The local database is real PostgreSQL provided by Supabase. Schema, grants, RLS, transaction functions and Realtime publication are defined in versioned SQL under `supabase/migrations/`; reproducible demonstration configuration lives in `supabase/seed.sql`.

## Local lifecycle

Start Docker Desktop, then run:

```powershell
npm run db:start
npx supabase status -o env
```

Copy the local API URL, anonymous key and service-role key into the corresponding values in `.env.local`. The service-role value is server-only. `npm run db:reset` **recreates the local database and its data**, reapplies migrations and runs the SQL seed; use it only for a disposable local environment. Run `npm run db:test` for database tests when the Docker stack is available. `npm run db:stop` stops the local stack.

The configured ports are API `54321`, PostgreSQL `54322`, Studio `54323`, and local email viewer `54324`. Public email sign-up is disabled. Do not initialize a second Supabase configuration: this repository already contains one. The [Supabase local-development guide](https://supabase.com/docs/guides/local-development) explains the CLI/container prerequisites.

## Data ownership

| Tables | Purpose |
|---|---|
| `profiles` | Auth user mapping and database-owned `farmer` / `admin` role |
| `farms`, `fields` | Public-demo designation, field identity, area and configuration |
| `parameter_sets` | Versioned crop, soil, policy, irrigation and simulation parameters with source metadata |
| `devices`, `device_credentials` | Server-owned bindings/mode/configuration and hashed revocable credentials |
| `product_state`, `state_mutations` | Current canonical snapshot/revision and committed idempotency records |
| `calculation_runs`, `recommendations` | Immutable versioned input/output snapshots and derived recommendations |
| `telemetry`, `device_latest_state` | Deduplicated observation history, private raw payload and current normalized values |
| `weather_observations`, `weather_forecasts` | Separate observed and forecast weather domains |
| `irrigation_runs` | Delivery/run history, including targets and progress |
| `alerts`, `simulation_events` | Evidence-bearing incidents and deterministic scenario events |
| `commissioning_runs`, `audit_logs` | Simulated engineering checks and privileged-action history |

The `product_state.state` JSON snapshot is the serialized, versioned domain `SimulationState`; `revision` is the authoritative database concurrency token. Do not confuse database revision with the simulation's own transition count. The homogeneous field's soil water resides inside this canonical field snapshot. Zone delivery history is retained within run snapshots.

Calculation rows store engine version, parameter version, calculation time, full inputs and outputs, including intermediates. The rows permit reproducing a historical recommendation without reading today's mutable field state. Application clients have no update/delete permission on these records.

## Transactions and replay

The simulation commit function locks the current field row, checks the existing idempotency record, checks the expected revision, and commits the new state and associated bundle as one PostgreSQL transaction. The bundle includes calculation/recommendation snapshots, generated observations, telemetry/latest values, events, alerts, delivery history and audit evidence.

An identical retry returns a duplicate acknowledgment without reapplying state. Reusing the same key with different request content is an error. A stale expected revision is a conflict, not an instruction to overwrite another client's state. A failure during any bundled write rolls back the transaction.

Telemetry has a uniqueness constraint on `(device_id, event_id)` and a content hash. Device observations preserve both observation and server receipt time. Older events must not overwrite a newer latest-device value. Rain and delivered water require the same deduplication protection as ordinary telemetry; UI refreshes cannot be accounting events.

## Reads and security

RLS is enabled on every exposed application table. Anonymous reads are limited to intentionally public demo projections and reference parameter data. Raw telemetry payloads, mutation logs, commissioning history, audits and credentials are not public reads. Ordinary authenticated users can read their own profile; they cannot update their role.

Admin status comes from `profiles`, not user-editable metadata. New Auth users always receive the `farmer` default. Controlled server/database bootstrap is the only first-admin path. Private security-definer functions use an empty search path and explicit schema names; exposed wrappers use invoker context. See [security](SECURITY.md).

Realtime publishes compact current product state, alerts and latest device state. History queries should be bounded and ordered by the indexed field/device timestamp columns; never reload all raw history for a dashboard refresh.

## Verification

Database tests must verify anonymous read limits, role escalation denial, admin checks, duplicate requests, conflicts, revocation, out-of-order observation handling, and rollback. These are integration checks against running PostgreSQL/Auth; unit mocks cannot establish that RLS works. See [build progress](BUILD_PROGRESS.md) for executed versus environment-blocked results.
