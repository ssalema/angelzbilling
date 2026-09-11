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

// Before the first render, so the login and dashboard chunks are on the wire at
// the same time as the session refresh rather than waiting behind it.
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
              {/* The live connection opens once a session exists, so it sits
                  under Auth and over everything that reads from the server. */}
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
