import type { Bus, Route } from '../types';

/** A straight-line estimate based on the latest measured or derived speed. */
export function estimateArrivalSeconds(bus: Bus | undefined, route: Route | undefined): number | undefined {
  const position = bus?.lastLocation;
  const stop = route?.stops.find(item => item.id === bus?.nextStopId);
  const speed = (bus?.speedKmh ?? 0) / 3.6;
  if (!bus?.canTrack || bus.isSimulated || bus.trackingStatus !== 'LIVE' || !position || !stop || speed <= 0.5) return;
  const radians = Math.PI / 180;
  const a = Math.sin((stop.lat - position.lat) * radians / 2) ** 2
    + Math.cos(position.lat * radians) * Math.cos(stop.lat * radians) * Math.sin((stop.lng - position.lng) * radians / 2) ** 2;
  const distance = 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
  const seconds = Math.ceil(distance / speed);
  return seconds > 0 && seconds <= 1800 ? seconds : undefined;
}
