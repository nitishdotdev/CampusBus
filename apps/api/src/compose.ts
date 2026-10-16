import type { TrackingConfig } from './config/env';
import { AuthService, DEFAULT_AUTH_CONFIG, type AuthConfig } from './auth/service';
import { LiveService } from './domain/live';
import { TelemetryIngestService } from './domain/telemetry/ingest';
import { TripService } from './domain/trips';
import type { EmailSender, LiveEmitter } from './domain/types';
import { ConsoleEmailSender } from './infra/email/stub';
import type { Models } from './infra/mongo/models';
import { createRepositories } from './infra/mongo/repositories';

export function createServices(
  models: Models,
  config: TrackingConfig,
  emitter: LiveEmitter,
  email?: EmailSender,
  authConfig?: Partial<AuthConfig>,
  now?: () => Date,
) {
  const repos = createRepositories(models);
  const auth = new AuthService({
    users: repos.users, refreshTokens: repos.refreshTokens, emailTokens: repos.emailTokens,
    email: email ?? new ConsoleEmailSender(),
    config: { ...DEFAULT_AUTH_CONFIG, ...(authConfig ?? {}), env: authConfig?.env ?? process.env },
    now,
  });
  const extraRepos = {
    schedules: repos.schedules,
    notifications: repos.notifications,
    alerts: repos.alerts,
  };
  return {
    repos, auth, extraRepos,
    ingest: new TelemetryIngestService({ ...repos, emitter, config, now }),
    trips: new TripService({ ...repos, config, now }),
    live: new LiveService({ ...repos, now }),
  };
}
