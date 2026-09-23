# Deterministic simulation

The simulation exercises the same agronomy, quality and recommendation contracts used by the product. It does not claim physical sensors exist. The initial date is April 25, 2026 in Tashkent; timestamps are persisted as UTC instants.

## Time and replay

Simulation logic receives its clock as data. The engine advances using fixed internal timesteps and deterministic event ordering, not `Math.random()` or wall-clock-dependent scientific values. Replaying the same scenario from the same snapshot produces the same outputs. Several small advance requests must match one equivalent larger request.

Snapshots retain `simulationConfiguration.version = simulation-demo-1.0.0`, including simulation policy, device-quality policy, drip profile and demo crop-stage durations. These records document historical assumptions. Runtime behavior uses the centralized versioned defaults; creating a parameter version in administration does not silently activate arbitrary simulation overrides.

Admin controls provide run, pause, reset and 1×/10×/60× speed. Speed controls elapsed simulation time per wall-clock interval; it never changes formulas or bypasses physical startup. The authenticated application shell keeps stepping when navigating among product pages. Closing the controlling session stops stepping. Vercel is not used as a permanent in-process simulator.

The server reads the current run identity from the canonical snapshot and requires its database `expectedVersion` plus an `idempotencyKey`. Version conflict means reload the authoritative snapshot before another command. A repeated key is a retry, not another elapsed interval. Reset starts a new scenario state; historical records remain separate from its new accounting context.

`POST /api/admin/simulation` accepts `action: run | pause | reset | advance`, `expectedVersion`, a UUID `idempotencyKey`, and action-specific `scenarioId`, `seconds`/`minutes` or `speed` (1, 10, 60). Advances are bounded to 86,400 whole seconds. Run/pause concern the simulation clock. Irrigation is controlled separately through `POST /api/admin/irrigation` with `command: start | pause | resume | stop` and the same revision/idempotency fields. Both are authenticated, same-origin admin actions.

## Water accounting

- ET demand belongs to the elapsed interval; reading telemetry or reopening a page cannot apply another day's ET.
- Forecast rainfall is stored and reconciled separately from observed rain.
- Rain observations update the field once. Configurable dry-gap grouping closes rain events after a period without meaningful rainfall; a rain gauge cannot identify an event's final drop in advance.
- Integrated gross delivery is converted into canonical field-equivalent net depth with one efficiency adjustment.
- Surface evaporation and root-zone depletion are separate balances with explicit drainage/runoff handling.

The default scenario remains homogeneous. An administrator with `simulation.manage` may explicitly configure zone ledgers through `POST /api/admin/soil-model`, supplying `{ expectedVersion, idempotencyKey, configuration }`. `configuration` contains a version, source and exactly four unique `{ zoneId, parameters, rootZoneDepletionMm, surfaceDepletionMm }` entries. Scientific validation checks full parameters, zone area coverage and a stopped/non-running plan. The same compare-and-swap transaction commits state, calculation, recommendation and audit evidence. Local soil balances then own the water and the field is an area-weighted summary; see [agronomy](AGRONOMY_ENGINE.md) for accounting rules. A normal scenario reset restores its original homogeneous configuration.

The initial checkpoint is **18:00 Tashkent time on April 25** (`13:00 UTC`), with the full day's ET already accounted for. Subsequent days calculate a daily FAO budget at local midnight and allocate it uniformly from 06:00–18:00. This timing is a simulation assumption, not an hourly FAO model. No-rain forecast planning distributes projected potential demand over 24 hours and checks hourly/midnight thresholds, making the overnight waiting check conservative.

Shallow/middle/deep simulated sensors use lag constants of 180/600/1,800 seconds. The 60 cm reading is an illustrative response below the 50 cm root zone, not a calibrated deep-soil measurement. Model-derived values never serve as independent evidence to assimilate their own source state. Meaningful rain switches evaporation to full exposed wetting; subsequent drip delivery restores configured partial wetting.

## Irrigation lifecycle

Starting irrigation creates a target volume for each of four equal-area zones. The pump ramps over 20 seconds, then valve flow ramps over 30 seconds. Sustained hydraulic checks allow 45 seconds of stable operation before fault evaluation. Zones operate sequentially A–D; flow integrates into delivered litres using one-second internal steps. Remaining target volume determines completion. Runtime is only an estimate from current valid flow, or clearly qualified nominal flow when observations are unavailable.

Pause retains target and delivered volumes. Resume continues remaining delivery after checking safety. Stop closes control and retains recorded delivery; no completed volume is rolled back. A failed or unacknowledged command is not recorded as delivered water.

Observed flow, pressure, command acknowledgments and closed-valve consistency govern control safety. Critical failures pause automatic delivery and create evidence-bearing alerts. Offline/outlier noncritical soil sensors degrade quality and permit a model fallback only while safe.

`DEVICE_QUALITY_POLICY` requires weather, rain, flow, pressure and pump channels plus each configured valve. A missing, invalid or stale critical channel makes quality `Degraded` and blocks/pauses automatic control. Soil probe loss yields `Moderate` quality with an explained model fallback. Freshness limits are model-clock seconds: weather 3,600; rain 300; soil 900; flow, pressure, pump and valves 30. Future skew beyond 30 seconds is invalid. These control thresholds are distinct from the broader HTTP ingestion acceptance window.

## Scenarios

The twelve fixtures cover hot weather, rain success/failure/underperformance, unexpected storm, high/low flow, low pressure, offline/outlier soil sensors, valve failure and conflicting telemetry. See [scenario acceptance](GOLDEN_SCENARIOS.md) for required behavior and the permanent numerical benchmark.

Warnings describe possible causes rather than diagnoses: high flow can indicate a leak, but the system cannot prove a broken pipe from one observation.

## Public preview

The farmer irrigation preview uses a local/session snapshot and the same deterministic transitions. It may demonstrate delivery, pause/resume and revised state without mutating shared parameters, devices, scenarios or another visitor's field. An authorized administrator's shared simulation is a separate action and travels through protected server/database boundaries.

Preview time continues while irrigation is paused, so observed rain can finish arriving and close its event; hydraulic pause still prevents delivery. Stop/completion ends preview stepping. Reload restores the same session preview and delivered amount. Recorded shared irrigation sessions are read separately from the database and do not include a visitor's local preview.

## Validation

Run `npm test` for replay, physics, water accounting, scenario and scientific checks; run `npm run test:e2e` for browser interactions. Database concurrency and two-browser authoritative Realtime checks require running local Supabase. Do not interpret a successful isolated preview test as evidence of database persistence or RLS. Actual results are tracked in [BUILD_PROGRESS.md](BUILD_PROGRESS.md).
