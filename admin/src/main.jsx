import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider, CssBaseline, StyledEngineProvider } from '@mui/material';

import theme from './theme/index.js';
import router, { warmFirstScreens } from './routes/index.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { SnackbarProvider } from './context/SnackbarContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { RealtimeProvider } from './context/RealtimeContext.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';

// Start loading the first screens alongside the session refresh, not after it.
warmFirstScreens();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorBoundary>
          {/* Auth is outermost: Settings needs to know whether we are signed in. */}
          <AuthProvider>
            <SnackbarProvider>
              {/* Realtime needs a session, so it sits inside Auth. */}
              <RealtimeProvider>
                <SettingsProvider>
                  <RouterProvider router={router} />
                </SettingsProvider>
              </RealtimeProvider>
            </SnackbarProvider>
          </AuthProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </StyledEngineProvider>
  </React.StrictMode>
);
