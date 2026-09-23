# Architecture

AgriFlow is one Next.js application. The root route is the irrigation product; the engineering workspace is protected at `/admin`. Hardware currently runs behind simulated adapters. The scientific model and application contracts are intended to remain when independently validated live adapters are introduced.

## Boundaries

```mermaid
flowchart TD
    A[Provider / gateway observation] --> B[Authentication and normalization]
    B --> C[Units, timestamp and quality validation]
    C --> D[Canonical field state]
    F[Forecast data] --> G[Scheduling projection]
    D --> E[Pure agronomy engine]
    E --> G
    G --> H[Recommendation and explanation]
    H --> I[Authorized controller command]
    I --> J[Observed delivery and device state]
    J --> C
    D --> K[Atomic persisted snapshots and events]
    K --> L[Public projection and Realtime]
    L --> M[Farmer product]
```

Forecast input has no edge into actual water accounting. An expected rainfall amount is a planning input until an observation arrives.

| Layer | Responsibility |
|---|---|
| Domain | Scientific equations, versioned parameters, units, crop/soil state, decisions and simulation transitions; no React/database imports |
| Providers and validation | Vendor-neutral observation/control contracts; provenance, quality and freshness |
| Server | Verified identity, authorization, API validation and trusted calls to database transactions |
| Supabase | PostgreSQL persistence, Auth, RLS, immutable history, idempotency/concurrency and Realtime |
| UI | Read models, plain-language explanations, responsive visualization and interaction; no agronomic formulas |

## State ownership

The default homogeneous field owns canonical root-zone and surface evaporation depletion. Four equal zones own irrigation targets, commands and delivery records. Gross delivered zone volumes are summed and converted into field-equivalent net depth exactly once. Independent zone-soil ledgers are available only through explicit versioned configuration of every zone. In that mode the local ledgers own soil water; field values are area-weighted summaries. Four valve identities alone never create four soil models, and the same water is never booked in both accounting modes.

Simulation state owns its injected clock, active scenario, physical command/observed state, accounting history and event sequence. Fixed internal steps make replay independent of how clients group elapsed-time requests. Store timestamps in UTC; render in `Asia/Tashkent`. A simulated reading's freshness is relative to the simulation clock, not today's wall clock.

Scientific parameter versions and calculation snapshots make historical recommendations reproducible. Parameter edits create new versions rather than rewriting the interpretation of previous calculations.

## Authoritative state versus preview

Anonymous visitors can read the public demo and explore session-local irrigation previews. Preview state is isolated from authoritative Supabase data and from other browsers. Both use the same deterministic engine.

Authenticated administrators can modify the shared simulation through authorized server routes. The application shell owns the simulation controller so navigation to a farmer page does not reset its timer. A closed controlling session stops stepping; this is deliberately not a permanent background job. Version checks reject competing stale writes, and idempotency keys prevent a retried request from delivering water twice.

## Persistence and delivery

Group state transitions, associated observations, recommendations, calculations and alerts in one transaction. Failure must leave no partial accounting. History reads are bounded and indexed; compact current-state changes notify the UI through Supabase Realtime instead of broadcasting raw telemetry histories.

Backend absence is a visible state. An explicitly identified local demonstration can remain explorable, but cannot impersonate a connected database, successful admin mutation or live hardware.

Measured ingestion records validated history/latest-device data and quality alerts. Explicitly approved measured field bindings can atomically assimilate observed rainfall when the model day matches; the result reports `fieldModelUpdated`. `controlApplied: false` remains explicit because no hardware is actuated. Ordinary current-day telemetry cannot mix into the April 2026 simulated field merely by changing its provenance label.

## Product decisions

Farmer routes are Today, Field, Irrigation, Forecast, History and Devices. Technical details appear on demand in the recommendation explanation. Admin navigation is outside the farmer navigation; access protection is still enforced independently.

One persistent product-level disclosure explains that field/device data are simulated. Value-level provenance remains available in the model and technical explanations. There are no unsupported water-saving/yield claims, fake confidence percentages or claims of FAO endorsement.

English is the current language. `src/config/copy.ts` holds the product/admin headings, labels, explanations, actions, fallback messages and chart descriptions, with small formatter functions for interpolated copy; `src/config/access-copy.ts` owns the access-management and invitation/recovery interface. Branding/navigation, unit formatting and scientific/simulation assumptions retain their separate centralized modules. Technical identifiers, units and versioned domain scenario/recommendation messages are not translated as UI labels. Future Uzbek/Russian catalogues can replace presentation copy without duplicating calculations; those translations are not included in this MVP.

See [database](DATABASE.md), [security](SECURITY.md), [simulation](SIMULATION.md), and [hardware integration](HARDWARE_INTEGRATION.md) for operational contracts. [Build progress](BUILD_PROGRESS.md) distinguishes implemented behavior from checks actually run.
