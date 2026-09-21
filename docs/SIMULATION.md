# Deterministic simulation

The simulation exercises the same agronomy, quality and recommendation contracts used by the product. It does not claim physical sensors exist. The initial date is April 25, 2026 in Tashkent; timestamps are persisted as UTC instants.

## Time and replay

Simulation logic receives its clock as data. The engine advances using fixed internal timesteps and deterministic event ordering, not `Math.random()` or wall-clock-dependent scientific values. Replaying the same scenario from the same snapshot produces the same outputs. Several small advance requests must match one equivalent larger request.

Admin controls provide run, pause, reset and 1×/10×/60× speed. Speed controls elapsed simulation time per wall-clock interval; it never changes formulas or bypasses physical startup. The authenticated application shell keeps stepping when navigating among product pages. Closing the controlling session stops stepping. Vercel is not used as a permanent in-process simulator.

The server requires a run identity, expected state version and idempotency key. Version conflict means reload the authoritative snapshot before another command. A repeated key is a retry, not another elapsed interval. Reset starts a new scenario state; historical records remain separate from its new accounting context.

## Water accounting

- ET demand belongs to the elapsed interval; reading telemetry or reopening a page cannot apply another day's ET.
- Forecast rainfall is stored and reconciled separately from observed rain.
- Rain observations update the field once. Configurable dry-gap grouping closes rain events after a period without meaningful rainfall; a rain gauge cannot identify an event's final drop in advance.
- Integrated gross delivery is converted into canonical field-equivalent net depth with one efficiency adjustment.
- Surface evaporation and root-zone depletion are separate balances with explicit drainage/runoff handling.

Fine-step timing is a deterministic demonstration of a daily agronomic model, not a claim of calibrated hourly hydrology. Shallow soil sensors respond before deep ones. Model-derived sensor values remain consistent with the field model and never serve as independent evidence to assimilate their own source state.

## Irrigation lifecycle

Starting irrigation creates a target volume for each of four equal-area zones. The pump starts, pressure ramps, a valve command is acknowledged and flow rises. Zones operate sequentially A–D; flow integrates into delivered litres. Remaining target volume determines completion. Runtime is only an estimate from current valid flow, or clearly qualified nominal flow when observations are unavailable.

Pause retains target and delivered volumes. Resume continues remaining delivery after checking safety. Stop closes control and retains recorded delivery; no completed volume is rolled back. A failed or unacknowledged command is not recorded as delivered water.

Observed flow, pressure, command acknowledgments and closed-valve consistency govern control safety. Critical failures pause automatic delivery and create evidence-bearing alerts. Offline/outlier noncritical soil sensors degrade quality and permit a model fallback only while safe.

## Scenarios

The twelve fixtures cover hot weather, rain success/failure/underperformance, unexpected storm, high/low flow, low pressure, offline/outlier soil sensors, valve failure and conflicting telemetry. See [scenario acceptance](GOLDEN_SCENARIOS.md) for required behavior and the permanent numerical benchmark.

Warnings describe possible causes rather than diagnoses: high flow can indicate a leak, but the system cannot prove a broken pipe from one observation.

## Public preview

The farmer irrigation preview uses a local/session snapshot and the same deterministic transitions. It may demonstrate delivery, pause/resume and revised state without mutating shared parameters, devices, scenarios or another visitor's field. An authorized administrator's shared simulation is a separate action and travels through protected server/database boundaries.

## Validation

Run `npm test` for replay, physics, water accounting, scenario and scientific checks; run `npm run test:e2e` for browser interactions. Database concurrency and two-browser authoritative Realtime checks require running local Supabase. Do not interpret a successful isolated preview test as evidence of database persistence or RLS. Actual results are tracked in [BUILD_PROGRESS.md](BUILD_PROGRESS.md).
