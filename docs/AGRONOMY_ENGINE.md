# Agronomy engine

AgriFlow uses deterministic TypeScript calculations independent of React, the database, and device vendors. Calculations are estimates from versioned inputs, not a substitute for local field calibration. The method is FAO-56 based; AgriFlow is not certified or endorsed by FAO.

## Sources and parameter categories

The primary reference is Allen, Pereira, Raes and Smith, *Crop Evapotranspiration: Guidelines for Computing Crop Water Requirements*, FAO Irrigation and Drainage Paper 56 (1998).

| Source | Used for |
|---|---|
| [Chapter 2](https://www.fao.org/4/x0490e/x0490e06.htm) | Daily Penman–Monteith reference evapotranspiration, equation 6 |
| [Chapter 3](https://www.fao.org/4/x0490e/x0490e07.htm) | Meteorology, radiation, pressure and vapour-pressure calculations |
| [Chapter 7](https://www.fao.org/4/x0490e/x0490e0c.htm) | Basal coefficient, soil evaporation, exposed/wetted fraction and surface balance |
| [Chapter 8](https://www.fao.org/4/x0490e/x0490e0e.htm) | Root-zone storage, depletion fraction, water stress and water balance |

Reference coefficients and equations are distinct from local assumptions and management policy. Potato coefficients `0.15 / 1.10 / 0.65`, maximum crop height `0.60 m`, and base depletion fraction `0.35` are versioned reference parameters, not universal crop constants. The 130-day stage sequence `25 / 30 / 45 / 30` is retained separately from the **simulation assumption** `20 / 20 / 30 / 20` (90 days).

The one-hectare loam profile, `0.90` application efficiency, zero capillary rise, geometry, nominal flows and initial soil depletions are configurable demo assumptions. Warning/action/target multipliers `0.90 / 1.00 / 0.80 × RAW` are management policy.

## Calculation order and units

1. Validate temperatures in °C, relative humidity in percent, wind at 2 m in m/s, daily radiation in MJ/m²/day, elevation in m, latitude in degrees and date.
2. Calculate daily reference ET₀ with FAO-56 Penman–Monteith. Daily soil heat flux defaults to zero. Preserve intermediate meteorology for explanation and reproducibility.
3. Resolve crop stage and basal coefficient `Kcb`; interpolate development and late stages. The golden fixture supplies `Kcb = 1.10` directly and must not receive a second climate adjustment.
4. Derive soil evaporation coefficient from initial surface depletion. Calculate unstressed crop demand before the demand-adjusted depletion fraction and water-stress coefficient.
5. Apply stress only to basal crop transpiration: `ETc = (Ks × Kcb + Ke) × ET₀`.
6. Apply actual water fluxes to stored soil state exactly once. The golden fixture's light rain occurs after the day's ET calculation.
7. Derive irrigation depth, gross volume, zone volumes and estimated runtimes from the updated state and configured policy.

Depth-to-volume conversion is exact: **1 mm over 1 m² is 1 L**. For the demo, 1 mm over 10,000 m² is 10,000 L. Runtime in minutes is `targetVolumeLiters / flowM3h × 0.06`. Presentation rounds values; domain calculations retain floating-point precision.

## Soil water and evaporation

`TAW = 1000 × (thetaFC − thetaWP) × rootDepthM` gives total available water in mm. Adjust the base depletion fraction using unstressed crop demand, constrain it to the supported agronomic range, and compute `RAW = p × TAW`. Above RAW, `Ks` decreases with depletion and is constrained to `[0, 1]`.

Surface evaporation tracks its own depletion `De`. `TEW = 1000 × (thetaFC − 0.5 × thetaWP) × evaporationLayerDepthM`; `REW` defines readily evaporable water. The evaporation calculation includes `Kcmax`, `Kr` and the exposed/wetted fraction cap. Surface depletion and root-zone depletion are different state variables; neither may be reconstructed from a dashboard percentage.

Root-zone conservation is:

```text
Dr_end = Dr_start − (rain − runoff) − netIrrigation − capillaryRise + ETc + drainage
```

Water beyond field capacity becomes explicitly recorded drainage rather than negative depletion. Runoff is an input assumption, not a universal rainfall discount. No fixed "80% effective rainfall" shortcut is used. Water demand beyond available storage must be represented without silently inventing water.

## Field and zone semantics

The homogeneous MVP has one canonical field soil/crop balance. Zones A–D each cover 2,500 m² and primarily own delivery state. For canonical field accounting:

```text
fieldEquivalentNetDepthMm = deliveredGrossLiters × efficiency / fieldAreaM2
```

Do not divide a zone's delivered volume by zone area and then apply that depth to the entire field. Do not apply efficiency twice. Partial delivery remains in the zone run, while the field receives only the amount actually delivered. An explicitly configured heterogeneous model may own separate zone soil states; it must not run both accounting modes for the same water.

Soil sensor values generated from this same field model are consistency observations, not independent evidence for assimilating or correcting their own source state.

## Decision policy and rain

Net irrigation is `max(0, currentDr − targetDr)` when policy calls for irrigation. Gross depth divides net depth by application efficiency; gross volume multiplies by field area. Zones run sequentially; total pump time is the sum of zone times, excluding startup and transitions.

Forecast rainfall never enters observed root-zone or surface accounting. To defer irrigation, evaluate the depletion trajectory at every projected timestep from now through the expected rain window. Without crediting that forecast rain, the trajectory must remain below the action threshold throughout the waiting interval. Insufficient critical telemetry prevents automatic control. Reevaluate on new observations and when the forecast window ends.

The forecast may influence scheduling; only observed rain reduces actual depletion. A failed forecast therefore requires no reversal of fictional rain. Reconciliation displays forecast, received amount and difference as separate values.

## Limits and validation

Daily FAO-56 ET is not a validated hourly weather model. Fine simulation steps distribute demand deterministically for timing and delivery; field validation is still required before operational use. Simulated infiltration/sensor lag is deliberately simpler than a physical Richards-equation model. Automatic salinity/leaching recommendations, calibrated runoff prediction, real sensor assimilation and live pump control are outside this MVP.

Run `npm test` for scientific regressions and boundaries. See [golden scenarios](GOLDEN_SCENARIOS.md) for the fixed benchmark and [build progress](BUILD_PROGRESS.md) for actual verification results.
