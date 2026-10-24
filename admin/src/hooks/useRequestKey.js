import { useMemo, useRef } from 'react';
import { newRequestKey } from '../api/network.js';

// One key per thing the person means to do once — a bill, a payment, a sheet of
// stock. Every attempt at it carries the same key, so pressing save again after
// a reply that never arrived replays the first result instead of writing twice.
// `renew` is called once it has worked, ready for the next one.
export const useRequestKey = () => {
  const key = useRef(null);

  return useMemo(
    () => ({
      get: () => {
        if (!key.current) key.current = newRequestKey();
        return key.current;
      },
      renew: () => {
        key.current = newRequestKey();
      },
    }),
    []
  );
};

export default useRequestKey;
