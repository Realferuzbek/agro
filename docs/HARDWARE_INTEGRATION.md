# Hardware integration

No physical hardware is installed in this MVP. All commissioning, valve/pump behavior and current farm readings are explicitly simulated. The contracts are vendor-neutral so a future gateway can translate a selected device protocol into the same domain model.

## Provider contracts

`src/domain/types.ts` defines the integration boundary. Read methods return `Datum<T>` with `value`, `unit`, `provenance`, `sourceId`, `measuredAt` and `quality`. Supported provenance values are `SIMULATED`, `MEASURED`, `FORECAST`, `ESTIMATED`, `DERIVED`, `MANUAL` and `REFERENCE`. Freshness is derived from the timestamp and the relevant observation clock.

| Interface | Method |
|---|---|
| `WeatherProvider` | `read(at)` → weather datum |
| `RainfallProvider` | `read(at)` → rainfall datum |
| `SoilMoistureProvider` | `read(depthCm, at)` → soil-water datum |
| `FlowProvider` | `read(zoneId, at)` → flow datum |
| `PressureProvider` | `read(zoneId, at)` → pressure datum |
| `DeviceHealthProvider` | `read(deviceId, at)` → health datum |
| `IrrigationController` | `command({ id, zoneId, desiredState, issuedAt, deadline })` → command ID, acknowledgment and observed state |

Controller desired states are `OPEN`/`CLOSED`; observed states may also be `UNKNOWN`. A sent command is not proof of actuation. Preserve command identity across retries and check acknowledgment, deadline, observed valve state, pressure and flow before crediting delivery.

`src/domain/providers.ts` implements all seven simulated provider contracts and their factory. The scenario engine uses `simulatedDeviceReadings`; it does not maintain a second unrelated sensor generator. A controller's dispatch callback belongs to the caller's authorized control boundary. Acknowledgment can precede an observed open valve during startup. See [simulation](SIMULATION.md) for the configured freshness and critical-channel policy.

## Device identity and tokens

An administrator registers the device's identity, kind, field/optional-zone binding, mode and configuration. Credentials are generated with high entropy, stored as hashes, scoped to that device and revocable. Capture the plaintext token when issued; later metadata views show only identifying prefixes and lifecycle timestamps.

Credential metadata uses `id`, `prefix`, `createdAt`, `expiresAt`, `revokedAt` and `lastUsedAt`; it never returns the token hash or plaintext token. The administration console lists this lifecycle and exposes revocation. Device registration binds the database field UUID rather than the domain display identifier.

The generic HTTP boundary is `POST /api/telemetry/ingest` with JSON and `Authorization: Bearer <device-token>`. Register a `MEASURED` device to use this path. The deterministic simulator writes through its own authoritative transaction pipeline, so a real gateway cannot pretend to be a simulated provider by submitting a provenance string.

The server obtains field, zone and provenance from the registered device. It validates event identity, schema version, observation time, measurement units and ranges before calling the restricted ingestion transaction. A device cannot submit an arbitrary field identifier to acquire authority over that field.

The authoritative schema is `src/lib/server/telemetry-contract.ts`:

```json
{
  "version": 1,
  "deviceId": "soil-live-01",
  "eventId": "gateway-20260922-000001",
  "observedAt": "2026-09-22T08:30:00Z",
  "measurements": [
    { "metric": "soilMoisturePct", "value": 24.4, "unit": "%" }
  ],
  "rawPayload": { "adapterVersion": "example-1" }
}
```

Use an actual current observation timestamp when trying the example. `version` must be `1`; device IDs accept letters, digits, `_` and `-` up to 80 characters; event IDs additionally accept `.` and `:` up to 128 characters. Events carry 1–16 unique metrics; unknown fields/units are rejected. Choose either incremental or cumulative rainfall per event, never both. The body limit is 65,536 bytes.

| Registered kind | Accepted metrics and exact units |
|---|---|
| `weather` | `temperatureC`, `temperatureMaxC`, `temperatureMinC` in `°C`; humidity variants in `%`; `windSpeedMps` in `m/s`; `solarRadiationMjM2Day` in `MJ/m²/day` |
| `rain` | `rainfallIncrementMm` or `rainfallCumulativeMm` in `mm` |
| `soil` | `soilMoisturePct` in `%` |
| `flow` | `flowM3h` in `m³/h`; `deliveredVolumeLiters` in `L` |
| `pressure` | `pressureBar` in `bar` |
| `valve` | `valveState` in `state`: `OPEN`, `CLOSED`, `OPENING`, `CLOSING`, `FAILED` |
| `pump` | `pumpState` in `state`: `ON`, `OFF`, `STARTING`, `FAILED` |

Humidity metric names are `relativeHumidityPct`, `relativeHumidityMaxPct` and `relativeHumidityMinPct`. Device kind restricts accepted metrics. An observation more than five minutes in the future is rejected. Values outside the contract's physical ranges are stored as `outlier`; observations older than 24 hours are `stale`. Neither replaces the valid latest reading. The database accepts at most 120 new events per device per minute.

To submit a current example from PowerShell after registering the measured device and setting `BARAKA_DEVICE_TOKEN` privately:

```powershell
$event = @{
  version = 1
  deviceId = 'soil-live-01'
  eventId = [guid]::NewGuid().ToString()
  observedAt = [DateTimeOffset]::UtcNow.ToString('o')
  measurements = @(@{ metric = 'soilMoisturePct'; value = 24.4; unit = '%' })
}
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/telemetry/ingest' `
  -ContentType 'application/json' `
  -Headers @{ Authorization = "Bearer $env:BARAKA_DEVICE_TOKEN" } `
  -Body ($event | ConvertTo-Json -Depth 5)
```

New events return HTTP 201; identical retries return 200 with `duplicate: true`. Responses include quality and whether latest state changed. HTTP 400/415 indicate malformed contract/content type, 401/403 invalid identity/binding, 409 conflicting identity/configuration, 413 body size, 429 rate limit and 503 unavailable backend. Revocation is exposed to administrators by `DELETE /api/admin/devices/{deviceId}/credentials` with `{ "id": "credential-uuid" }`; metadata is read with GET and issuance uses POST with optional `expiresAt`.

## Event handling

Choose a stable event identifier at the gateway and reuse it when retrying the same event. The database deduplicates by device/event identity and compares content hashes; a changed payload under the same identity is a conflict. Store observation time and server receipt time separately. Older observations may remain useful history but must not replace newer valid current state.

Invalid/outlier/stale readings must not drive control. Retain quality evidence for diagnosis. Raw payloads are admin-only debugging data; farmer pages consume normalized values and health. A rejected credential, invalid request, conflict or unavailable backend is an explicit error, not a successful ingest.

The server rechecks credential expiry/revocation and enabled device binding inside the transaction. Device serialization must cover all active credentials for that device so token rotation cannot bypass duplicate, rate or latest-value safeguards.

## Water accounting boundary

An instantaneous flow measurement is a rate, not a delivered volume. It must not be added directly to the soil balance. A live adapter needs a validated integration interval or calibrated monotonic volume counter with reset/rollover semantics. Rainfall likewise needs an unambiguous incremental event or reconciled cumulative counter so a retry does not add rain twice.

The endpoint stores measured history/latest-device state and quality alerts, and explicitly returns **`controlApplied: false`** because it issues no hardware command. Optional model updates are reported separately by `fieldModelUpdated` and require all of: a registered `MEASURED` device, `device.configuration.fieldModelApproved = true`, `field.settings.dataMode = 'MEASURED'`, a valid/latest observation, and an observation date matching the field model's Tashkent day.

Approved rain increments update root/surface balance and recommendation in the same transaction as the receipt. Cumulative rainfall establishes a baseline on first observation, then contributes only positive deltas; a reset contributes zero and becomes the next baseline. Transaction checks protect the latest baseline and canonical revision together, so a conflict rolls back receipt and accounting. The April 2026 simulated field cannot be changed by an ordinary current-day live ingest. Forecast values never enter this path.

The model can retain other approved measured device observations, but neither instantaneous flow nor a volume sample invents irrigation delivery. Independent soil probes do not overwrite the whole field balance. Live delivery feedback still requires commissioned counter/integration semantics and a separately validated controller.

The current soil sensor simulator derives observations from canonical field state. Its output is not independent ground truth for recalibrating that same state. Independent live soil-sensor assimilation needs a separately validated calibration and fusion policy.

## Future gateway implementation

1. Select and calibrate the physical hardware; record its units, operating ranges, sampling intervals and clock behavior.
2. Implement protocol translation outside the agronomy engine. Modbus, MQTT, LoRaWAN and vendor APIs are possible future transports, not presently claimed supported devices.
3. Normalize units and timestamp semantics before submitting the generic contract. Retain bounded raw evidence for debugging without exposing credentials.
4. Register field/zone bindings and provision a token through protected administration. Verify delivery with synthetic events before connecting actuation.
5. Test retries, duplicate IDs, event reordering, offline periods, outliers, reset counters and token rotation/revocation.
6. Independently validate command acknowledgment, pressure startup, fail-safe valve closure, observed flow and volume-based completion using the selected controller.
7. Run physical commissioning and field validation as an explicitly separate activity. A saved simulated commissioning result cannot certify those checks.

See [security](SECURITY.md) for trust boundaries and [database](DATABASE.md) for persistence/concurrency. See [build progress](BUILD_PROGRESS.md) for which end-to-end integration checks have actually run.
