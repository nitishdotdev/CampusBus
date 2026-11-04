import type { CampusDTO, CampusRepository } from '../domain/types';

export type CampusProvisionInput = Omit<CampusDTO, 'id'>;

export async function provisionCampus(
  campuses: CampusRepository,
  input: CampusProvisionInput,
): Promise<{ created: boolean; campus: CampusDTO }> {
  const shortCode = input.shortCode.toUpperCase();
  const existing = await campuses.findByCode(shortCode);
  if (existing) return { created: false, campus: existing };
  const campus = await campuses.create({ ...input, shortCode });
  return { created: true, campus };
}
