import type { TrackingConfig } from './config/env';
import { LiveService } from './domain/live';
import { TelemetryIngestService } from './domain/telemetry/ingest';
import { TripService } from './domain/trips';
import type { LiveEmitter } from './domain/types';
import type { Models } from './infra/mongo/models';
import { createRepositories } from './infra/mongo/repositories';

export function createServices(models: Models, config: TrackingConfig, emitter: LiveEmitter, now?: () => Date) {
  const repos = createRepositories(models);
  return {
    repos,
    ingest: new TelemetryIngestService({ ...repos, emitter, config, now }),
    trips: new TripService({ ...repos, config, now }),
    live: new LiveService({ ...repos, now }),
  };
}
