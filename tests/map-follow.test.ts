import { expect, it } from 'vitest';
import { mapFollow } from '../src/components/map/mapFollow';

it('pauses follow on manual panning and resumes it on toggle or recenter', () => {
  const panned = mapFollow('following', 'pan');
  expect(panned).toBe('exploring');
  expect(mapFollow(panned, 'pan')).toBe('exploring');
  expect(mapFollow(panned, 'toggle')).toBe('following');
  expect(mapFollow(panned, 'recenter')).toBe('following');
});
