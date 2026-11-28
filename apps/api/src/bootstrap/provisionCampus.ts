import type { CampusDTO, CampusRepository } from '../domain/types';

export type CampusProvisionInput = Omit<CampusDTO, 'id'>;

export async function provisionCampus(
  campuses: CampusRepository,
  input: CampusProvisionInput,
): Promise<{ created: boolean; campus: CampusDTO }> {
  const shortCode = input.shortCode.toUpperCase();
  const existing = await campuses.findByCode(shortCode);
  if (existing) return { created: false, campus: existing };
  try {
    const campus = await campuses.create({ ...input, shortCode });
    return { created: true, campus };
  } catch (error) {
    // A concurrent bootstrap may have inserted this short code since the lookup.
    if ((error as { code?: string } | null)?.code === '23505') {
      const winner = await campuses.findByCode(shortCode);
      if (winner) return { created: false, campus: winner };
    }
    throw error;
  }
}
