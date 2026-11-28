import { useSyncExternalStore } from 'react';
import { socketV1 } from '../../services/v1/socket';

export function LiveConnectionNotice() {
  const connection = useSyncExternalStore(socketV1.subscribeConnection, socketV1.getConnection);
  if (connection === 'connected' || connection === 'idle') return null;
  return (
    <p role="status" className="mt-1 text-xs font-semibold text-amber-900">
      {connection === 'connecting' ? 'Connecting to live updates.' : 'Live connection interrupted. Showing the latest available positions.'}
    </p>
  );
}
