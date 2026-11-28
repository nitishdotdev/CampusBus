import { bootstrapAdminSchema, type AuthService } from '../auth/service';
import type { CampusRepository } from '../domain/types';

export type StartupAdminResult = 'disabled' | 'created' | 'already-exists';

/** Trusted, opt-in provisioning. Never logs or returns credentials. */
export async function bootstrapAdminOnStartup(
  env: NodeJS.ProcessEnv,
  campuses: Pick<CampusRepository, 'findByCode'>,
  auth: Pick<AuthService, 'bootstrapAdmin'>,
): Promise<StartupAdminResult> {
  const flag = env.BOOTSTRAP_ADMIN_ENABLED;
  if (flag === undefined || flag === '' || flag === 'false') return 'disabled';
  if (flag !== 'true') throw new Error('Invalid BOOTSTRAP_ADMIN_ENABLED; expected true or false');
  const shortCode = env.CAMPUS_SHORT_CODE?.trim().toUpperCase();
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const name = env.BOOTSTRAP_ADMIN_NAME?.trim();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!shortCode || !email || !name || !password) {
    throw new Error('Admin startup bootstrap configuration is incomplete');
  }
  if (env.BOOTSTRAP_SECRET) {
    throw new Error('Disable HTTP bootstrap before enabling admin startup bootstrap');
  }
  const campus = await campuses.findByCode(shortCode);
  if (!campus) throw new Error('Admin startup bootstrap campus does not exist');
  if (!bootstrapAdminSchema.safeParse({ campusId: campus.id, email, name, password }).success) {
    throw new Error('Invalid admin startup bootstrap credentials');
  }
  try {
    await auth.bootstrapAdmin(campus.id, email, password, name);
    return 'created';
  } catch (err) {
    if ((err as { code?: string } | null)?.code === 'ADMIN_ALREADY_EXISTS') return 'already-exists';
    // Do not propagate raw database or validation messages to deployment logs.
    throw new Error('Admin startup bootstrap failed; verify configuration and database');
  }
}
