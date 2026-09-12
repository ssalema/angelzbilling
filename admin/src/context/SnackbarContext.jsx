import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react';
import { Snackbar, Alert, Slide } from '@mui/material';
import { SHADOW } from '../theme/index.js';
import { useAuth } from './AuthContext.jsx';

const SnackbarContext = createContext(null);

const SlideUp = (props) => <Slide {...props} direction="up" />;

/** One toast surface for the whole app, so feedback always looks the same. */
export const SnackbarProvider = ({ children }) => {
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  const notify = useCallback((message, severity = 'success') => {
    if (!message) return;
    setToast({ open: true, message, severity });
  }, []);

  const { isAuthenticated } = useAuth();

  // A session that ends mid-request leaves the refusal behind as a toast, and it
  // would float over the sign-in page repeating the banner there word for word.
  // The screen it belonged to is gone, so the toast goes with it.
  useEffect(() => {
    if (!isAuthenticated) setToast((current) => (current.open ? { ...current, open: false } : current));
  }, [isAuthenticated]);

  const value = useMemo(
    () => ({
      notify,
      success: (message) => notify(message, 'success'),
      error: (message) => notify(message || 'Something went wrong', 'error'),
      warning: (message) => notify(message, 'warning'),
      info: (message) => notify(message, 'info'),
    }),
    [notify]
  );

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      <Snackbar
        open={toast.open}
        autoHideDuration={toast.severity === 'error' ? 7000 : 4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        TransitionComponent={SlideUp}
      >
        <Alert
          severity={toast.severity}
          variant="filled"
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          sx={{ maxWidth: 480, boxShadow: SHADOW.toast }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) throw new Error('useSnackbar must be used inside a SnackbarProvider');
  return context;
};
