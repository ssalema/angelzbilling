import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  IconButton,
  Box,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
  Typography,
  Chip,
  Tooltip,
  Button,
} from '@mui/material';
import {
  MenuRounded,
  LogoutOutlined,
  PersonOutline,
  LockResetOutlined,
  AddCardOutlined,
  StorefrontOutlined,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useSnackbar } from '../context/SnackbarContext.jsx';
import ConfirmDialog from '../components/common/ConfirmDialog.jsx';
import { ROLE_LABELS } from '../utils/constants.js';
import { ICON, brand, surface } from '../theme/index.js';

const Topbar = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const { branchesEnabled } = useSettings();
  const navigate = useNavigate();
  const snackbar = useSnackbar();
  const [anchor, setAnchor] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = async () => {
    await logout();
    snackbar.success('You have been signed out');
    navigate('/login', { replace: true });
  };

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        color="transparent"
        sx={{
          // Rendered inside <main>, which already sits beside the permanent drawer —
          // re-applying the sidebar width here would offset the bar a second time.
          top: 0,
          width: '100%',
          zIndex: (theme) => theme.zIndex.appBar,
          bgcolor: surface.ivoryBar,
          backdropFilter: 'blur(10px)',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ gap: 1, minHeight: { xs: 60, sm: 64 } }}>
          <IconButton onClick={onMenuClick} sx={{ display: { lg: 'none' } }} edge="start">
            <MenuRounded />
          </IconButton>

          {/* Which branch the numbers on screen belong to — important in multi-branch use */}
          {branchesEnabled && (
          <Tooltip title="Data on screen is scoped to this branch">
            <Chip
              icon={<StorefrontOutlined sx={{ fontSize: ICON.inline }} />}
              label={user?.branch?.name || 'All branches'}
              size="small"
              sx={{
                bgcolor: surface.plumSoft,
                color: 'primary.main',
                fontWeight: 600,
                maxWidth: { xs: 150, sm: 280 },
              }}
            />
          </Tooltip>
          )}

          <Box sx={{ flexGrow: 1 }} />

          {/* The app's primary action stays reachable on a phone at the
              counter — the full button on wider screens, the same action as an
              icon button below `sm`, never nothing. */}
          <Button
            variant="contained"
            startIcon={<AddCardOutlined />}
            onClick={() => navigate('/billing/new')}
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          >
            Create bill
          </Button>

          <Tooltip title="Create bill">
            <IconButton
              onClick={() => navigate('/billing/new')}
              color="primary"
              sx={{
                display: { xs: 'inline-flex', sm: 'none' },
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <AddCardOutlined sx={{ fontSize: ICON.action }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Account">
            <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ ml: 0.5 }}>
              <Avatar
                src={user?.avatar?.url || undefined}
                sx={{ width: 34, height: 34, bgcolor: brand.plum, fontSize: 13, fontWeight: 700 }}
              >
                {user?.name?.[0]?.toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { minWidth: 235, mt: 1, borderRadius: 2.5 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" noWrap>
            {user?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
            {user?.email}
          </Typography>
          <Chip
            size="small"
            label={ROLE_LABELS[user?.role] || user?.role}
            color="secondary"
            sx={{ mt: 1, color: brand.ink }}
          />
        </Box>
        <Divider />

        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate('/profile');
          }}
        >
          <ListItemIcon>
            <PersonOutline fontSize="small" />
          </ListItemIcon>
          My profile
        </MenuItem>

        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate('/profile?tab=password');
          }}
        >
          <ListItemIcon>
            <LockResetOutlined fontSize="small" />
          </ListItemIcon>
          Change password
        </MenuItem>

        <Divider />

        <MenuItem
          onClick={() => {
            setAnchor(null);
            setConfirmLogout(true);
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <LogoutOutlined fontSize="small" color="error" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={confirmLogout}
        title="Sign out?"
        message="You will need to sign in again to access the admin panel."
        confirmLabel="Sign out"
        severity="warning"
        onConfirm={handleLogout}
        onClose={() => setConfirmLogout(false)}
      />
    </>
  );
};

export default Topbar;
