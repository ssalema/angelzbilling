import { useEffect, useRef, useState } from 'react';
import { Alert, AlertTitle, Collapse } from '@mui/material';
import { getNetworkCondition, subscribeNetwork } from '../../api/network.js';
import { ConnectionIcon, severityOf } from './StateViews.jsx';

// How long "back online" stays up once the problem has cleared.
const RECOVERED_MS = 3500;

/**
 * Shows the current connection problem (offline, slow, or server down) in one place.
 * Clears itself on the next response from the server.
 */
const NetworkBanner = ({ sx }) => {
  const [condition, setCondition] = useState(getNetworkCondition);
  const [recovered, setRecovered] = useState(false);
  const last = useRef(condition);

  useEffect(
    () =>
      subscribeNetwork((next) => {
        if (last.current && !next) setRecovered(true);
        last.current = next;
        setCondition(next);
      }),
    []
  );

  useEffect(() => {
    if (!recovered) return undefined;
    const timer = setTimeout(() => setRecovered(false), RECOVERED_MS);
    return () => clearTimeout(timer);
  }, [recovered]);

  // Keep the last problem while collapsing so the text doesn't vanish first.
  const [shown, setShown] = useState(condition);
  useEffect(() => {
    if (condition) setShown(condition);
  }, [condition]);

  return (
    <>
      <Collapse in={Boolean(condition)} unmountOnExit>
        {shown && (
          <Alert
            severity={severityOf(shown)}
            icon={<ConnectionIcon kind={shown.kind} size={22} />}
            sx={{ mb: 2, ...sx }}
            role="status"
          >
            <AlertTitle sx={{ fontWeight: 700, mb: 0 }}>{shown.title}</AlertTitle>
            {shown.message}
          </Alert>
        )}
      </Collapse>
      <Collapse in={!condition && recovered} unmountOnExit>
        <Alert severity="success" sx={{ mb: 2, ...sx }} role="status">
          Connection restored — everything is up to date again.
        </Alert>
      </Collapse>
    </>
  );
};

export default NetworkBanner;
