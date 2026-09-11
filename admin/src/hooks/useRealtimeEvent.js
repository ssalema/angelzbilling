import { useEffect, useRef } from 'react';
import { useRealtime } from '../context/RealtimeContext.jsx';

// Runs `handler` when the server announces `event` — a resource name such as
// 'bills', or a server event such as 'bill:created'. The handler is held in a
// ref so an inline arrow does not re-subscribe on every render.
export const useRealtimeEvent = (event, handler, { enabled = true } = {}) => {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled || !event) return undefined;
    return subscribe(event, (payload) => ref.current?.(payload));
  }, [event, enabled, subscribe]);
};

// The same, but only for changes somebody else made — what a toast wants, since
// nobody needs telling about the bill they just raised.
export const useRemoteChange = (event, handler, options) => {
  const { selfId } = useRealtime();
  useRealtimeEvent(
    event,
    (payload) => {
      if (payload?.actor?.id && selfId && payload.actor.id === selfId) return;
      handler(payload);
    },
    options
  );
};

export default useRealtimeEvent;
