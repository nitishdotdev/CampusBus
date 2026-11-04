import { describe, expect, it } from 'vitest';
import { provisionCampus } from '../src/bootstrap/provisionCampus';
import type { CampusDTO, CampusRepository } from '../src/domain/types';

const input = {
  name: 'Apex State University',
  shortCode: 'ASU',
  city: 'Los Angeles',
  lat: 34.0537,
  lng: -118.257,
  zoom: 15,
  timezone: 'America/Los_Angeles',
};

function memoryCampuses(seed: CampusDTO[] = []): CampusRepository {
  const rows = [...seed];
  return {
    list: async () => [...rows],
    findById: async (id) => rows.find((c) => c.id === id) ?? null,
    findByCode: async (shortCode) =>
      rows.find((c) => c.shortCode.toUpperCase() === shortCode.toUpperCase()) ?? null,
    create: async (c) => {
      const created: CampusDTO = { id: `${rows.length + 1}`.padStart(24, '0'), ...c, shortCode: c.shortCode.toUpperCase() };
      rows.push(created);
      return created;
    },
  };
}

describe('provisionCampus', () => {
  it('creates a campus when the short code is new', async () => {
    const campuses = memoryCampuses();
    const result = await provisionCampus(campuses, input);
    expect(result.created).toBe(true);
    expect(result.campus).toMatchObject({
      name: input.name,
      shortCode: 'ASU',
      city: input.city,
      lat: input.lat,
      lng: input.lng,
      zoom: input.zoom,
      timezone: input.timezone,
    });
    expect(result.campus.id).toMatch(/^[a-f0-9]{24}$/i);
    expect(await campuses.list()).toHaveLength(1);
  });

  it('is idempotent: a second call with the same short code does not create another campus', async () => {
    const campuses = memoryCampuses();
    const first = await provisionCampus(campuses, input);
    const second = await provisionCampus(campuses, { ...input, name: 'Apex State University Main' });
    expect(second.created).toBe(false);
    expect(second.campus.id).toBe(first.campus.id);
    expect(second.campus.name).toBe(first.campus.name);
    expect(await campuses.list()).toHaveLength(1);
  });
});
