import type { TrackingConfig } from './config/env';
import { AuthService, DEFAULT_AUTH_CONFIG, type AuthConfig } from './auth/service';
import { LiveService } from './domain/live';
import { TelemetryIngestService } from './domain/telemetry/ingest';
import { TripService } from './domain/trips';
import type {
  BusRepository, CampusRepository, EmailSender, EmailTokenRepository,
  EmergencyAlertRepository, LiveEmitter, NotificationRepository,
  RefreshTokenRepository, RouteRepository, ScheduleRepository,
  TelemetryRepository, TripRepository, UserRepository, VehicleLocationRepository,
} from './domain/types';
import { ConsoleEmailSender } from './infra/email/stub';

export interface AppRepositories {
  campuses: CampusRepository;
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  emailTokens: EmailTokenRepository;
  buses: BusRepository;
  routes: RouteRepository;
  trips: TripRepository;
  live: VehicleLocationRepository;
  telemetry: TelemetryRepository;
  schedules: ScheduleRepository;
  notifications: NotificationRepository;
  alerts: EmergencyAlertRepository;
}

export function createServices(
  repos: AppRepositories,
  config: TrackingConfig,
  emitter: LiveEmitter,
  email?: EmailSender,
  authConfig?: Partial<AuthConfig>,
  now?: () => Date,
) {
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
