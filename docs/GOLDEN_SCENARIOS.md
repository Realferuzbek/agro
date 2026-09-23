# Golden regression and scenario acceptance

## Permanent scientific fixture

`golden-tashkent-potato-hot-day-rain-underperforms` isolates a daily calculation on **2026-04-25**. It is a deterministic engineering benchmark, not observed field evidence.

| Input | Value |
|---|---:|
| Latitude / elevation | 41.3° N / 450 m |
| Tmax / Tmin / Tmean | 28 / 14 / 21 °C |
| RHmax / RHmin | 75 / 35% |
| Wind at 2 m | 2.2 m/s |
| Solar radiation / daily soil heat flux | 20.5 / 0 MJ/m²/day |
| Supplied Kcb / crop height | 1.10 / 0.60 m |
| Field capacity / wilting point | 0.30 / 0.14 m³/m³ |
| Evaporation-layer depth / REW / starting De | 0.10 m / 9 mm / 17 mm |
| Root depth / starting Dr | 0.50 m / 22 mm |
| Forecast rain / observed late-day rain | 7 / 2 mm |
| Runoff / capillary rise | 0 / 0 mm |
| Application efficiency / field area | 0.90 / 10,000 m² |
| Simulated flow A / B / C / D | 10.5 / 10.3 / 10.4 / 10.2 m³/h |

Expected intermediate values include `TEW = 23 mm`, `Kr = 6 / 14`, `TAW = 80 mm`, `Kcmax ≈ 1.2296`, and `Ke ≈ 0.05555`. The exposed/wetted fraction cap does not limit Ke in this fixture. Use initial depletion for evaporation and stress, then apply the late-day observed rain. Do not adjust the supplied basal coefficient a second time.

| Output | Expected | Acceptance tolerance |
|---|---:|---:|
| ET₀ | 5.00947 mm/day | ±0.001 |
| ETc | 5.78869 mm/day | ±0.002 |
| RAW | 25.47618 mm | ±0.01 |
| Depletion after observed rain and ET | 25.78869 mm | ±0.01 |
| Target depletion | 20.38094 mm | ±0.01 |
| Net irrigation depth | 5.40775 mm | ±0.01 |
| Gross delivery | 60,086.10 L | ±50 |
| Zone A runtime | 85.84 min | ±0.1 |
| Zone B runtime | 87.50 min | ±0.1 |
| Zone C runtime | 86.66 min | ±0.1 |
| Zone D runtime | 88.36 min | ±0.1 |

The gross volume is divided evenly among the four zones. Total nominal pumping is approximately 348.36 minutes (5 h 48 min), before startup and transition overhead. This is not the same as one zone's runtime.

## Twelve simulation scenarios

| Scenario ID | Required observable behavior |
|---|---|
| `normal-hot-day` | ET increases depletion; recommendation and zone delivery remain coherent. |
| `rain-succeeds` | Forecast is not actual water; observed rain later reduces depletion. |
| `rain-fails` | No rain credit; reconcile after the window and reassess irrigation. |
| `rain-underperforms` | Show forecast and received amounts separately; derive the remaining need. |
| `unexpected-storm` | Book observed water; reduce need and account for excess drainage. |
| `high-flow` | Present possible leak/line issue as a hypothesis; pause unsafe control. |
| `low-flow` | Present possible restriction, valve, supply or configuration issues; pause unsafe control. |
| `low-pressure` | Flag pressure evidence and pause automatic simulated delivery. |
| `sensor-offline` | Mark freshness/quality; continue a qualified model recommendation when safe. |
| `sensor-outlier` | Reject the observation for control; retain quality evidence. |
| `valve-failure` | Detect missing/failed acknowledgment; pause control without fictional delivery. |
| `telemetry-conflict` | Closed valve/off pump plus significant flow is inconsistent; pause control. |

## Regression invariants

- Equal inputs and elapsed simulation time produce equal state, regardless of the grouping of step requests.
- Forecast changes alone never mutate observed rainfall or canonical depletion.
- Forecast delay fails when an intermediate projected point reaches the action boundary, even if a later projection is lower.
- Rain, ET and delivery are applied once; duplicate requests and recalculation do not reapply them.
- Field-equivalent delivery conserves volume; completing only one zone does not irrigate all four.
- Delivered volume follows integrated flow; target volume, not an uncorrected timer, ends a zone.
- Pause/resume preserves delivered totals; stop closes simulated control and retains history.
- Invalid values, invalid efficiency and impossible soil/meteorological bounds are rejected or explicitly degraded.
- Stress and storage stay bounded, with drainage or unmet demand represented when needed.
- Critical telemetry failures pause control; model-derived sensors never validate themselves as independent measurements.
- Explicit zone-soil configuration preserves the default golden fixture, requires complete area-matched configuration, preserves the supplied checkpoint, credits delivery only to its receiving zone and projects each zone's rainfall waiting boundary independently.

Run `npm test`. Database concurrency/RLS and browser checks are additional gates, not substitutes for scientific tests. The current results and any unrun environment-dependent checks are recorded in [BUILD_PROGRESS.md](BUILD_PROGRESS.md).
