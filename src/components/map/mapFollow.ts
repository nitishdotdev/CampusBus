export type MapFollowState = 'following' | 'exploring';

export function mapFollow(state: MapFollowState, event: 'pan' | 'recenter' | 'toggle'): MapFollowState {
  if (event === 'pan') return 'exploring';
  if (event === 'recenter') return 'following';
  return state === 'following' ? 'exploring' : 'following';
}
