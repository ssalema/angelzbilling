import { useState, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Box, Container } from '@mui/material';
import Sidebar, { SIDEBAR_WIDTH } from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { RouteSkeleton } from '../components/common/StateViews.jsx';
import ScrollManager from '../components/common/ScrollManager.jsx';

const DashboardLayout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Every route below scrolls the window, so one manager covers them all. */}
      <ScrollManager />
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0, // lets wide tables scroll instead of stretching the page
          width: { lg: `calc(100% - ${SIDEBAR_WIDTH}px)` },
        }}
      >
        <Topbar onMenuClick={() => setMobileOpen((open) => !open)} />

        <Container maxWidth="xl" sx={{ py: { xs: 2.5, md: 3.5 }, px: { xs: 2, md: 3 } }}>
          {/*
            Route-level code splitting: each feature loads on first visit. The
            fallback is the skeleton of the page being fetched — a bare
            progress bar over an empty page told the user nothing about what
            was coming, and the layout jumped once the chunk landed. Keying on
            the path re-picks the skeleton on every navigation.
          */}
          <Suspense fallback={<RouteSkeleton pathname={location.pathname} />} key={location.pathname}>
            <Outlet />
          </Suspense>
        </Container>
      </Box>
    </Box>
  );
};

export default DashboardLayout;
