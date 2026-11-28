# Critical telemetry and emergency reliability

Base `9da9b25f92e55291b79fd1b866cc011f0ac7c76c` from GitHub `main`. This integrates the uploaded patch on top of the upstream GPS and live map improvements.

- Synchronize queued fixes by driver and original trip. Delay device-wide failures, preserve uncertain batches, and let unblocked trips continue. Drop acknowledged entries by event ID and retain unanswered entries.
- Handle emergency submission independently of trip mutations. Reconcile by exact client-generated alert ID with server-side deduplication. The server owns acknowledgement and resolution. Drivers can read their own alerts and administrators can read their campus alerts.
- Emit and expose `Retry-After` for telemetry rate limiting. The client parses it and delays retries.
- Upgrade the IndexedDB queue in place. Keep bounded quarantine metadata without coordinates and purge it after the driver leaves. Active queued readings remain scoped to the original driver and trip.

Deploy the API first. Keep its scoped reads during a rollback. Use a browser build compatible with IndexedDB version 2 or fix forward. An old browser bundle that explicitly opens version 1 receives `VersionError`. Preserve both stores. See [GPS tracking](docs/GPS_TRACKING.md) and the [verification log](VERIFICATION_LOG.md).
