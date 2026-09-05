import {
  Drawer,
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Chip,
  Stack,
  Avatar,
} from '@mui/material';
import { NavLink, useLocation } from 'react-router-dom';
import { visibleSections } from './navConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { ROLE_LABELS } from '../utils/constants.js';
import { FONT, ICON, brand, onPlum } from '../theme/index.js';

export const SIDEBAR_WIDTH = 264;

const SidebarContent = ({ onNavigate }) => {
  const { user } = useAuth();
  const { siteName, logo: storeLogo } = useSettings();
  // Staff of a branch that carries its own logo work under that logo.
  const branch = user?.branch;
  const logo = (branch?.hasOwnLogo ? branch.logo?.url : '') || storeLogo;
  const location = useLocation();
  const sections = visibleSections(user?.role || 'staff');

  // A section owns everything below it, so creating a bill still highlights
  // Bill records — exactly as adding a perfume highlights Perfumes.
  const isActive = (item) => location.pathname.startsWith(item.to);

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: brand.plum,
        color: onPlum.text,
      }}
    >
      {/* Brand */}
      <Box sx={{ px: 2.5, py: 2.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {logo ? (
          <Box component="img" src={logo} alt={siteName} sx={{ height: 34, maxWidth: 130, objectFit: 'contain' }} />
        ) : (
          <>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                border: `1.5px solid ${brand.gold}`,
                color: brand.gold,
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 700,
                fontSize: ICON.action,
                flexShrink: 0,
              }}
            >
              A
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontWeight: 700,
                  fontSize: '1.12rem',
                  lineHeight: 1.1,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {siteName}
              </Typography>
              <Typography
                sx={{ fontSize: FONT.micro, letterSpacing: '0.18em', color: brand.goldLight, textTransform: 'uppercase' }}
              >
                Billing Admin
              </Typography>
            </Box>
          </>
        )}
      </Box>

      <Divider sx={{ borderColor: onPlum.divider }} />

      {/* Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 2 }}>
        {sections.map((section) => (
          <Box key={section.heading} sx={{ mb: 2 }}>
            <Typography
              variant="overline"
              sx={{ px: 1.5, color: onPlum.textGhost, fontSize: FONT.micro }}
            >
              {section.heading}
            </Typography>

            <List disablePadding sx={{ mt: 0.5 }}>
              {section.items.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <ListItemButton
                    key={item.to}
                    component={NavLink}
                    to={item.to}
                    onClick={onNavigate}
                    sx={{
                      mb: 0.35,
                      py: 0.95,
                      color: active ? '#fff' : onPlum.textMuted,
                      bgcolor: active ? onPlum.selected : 'transparent',
                      borderLeft: active ? `3px solid ${brand.gold}` : '3px solid transparent',
                      borderRadius: 1.5,
                      '&:hover': { bgcolor: onPlum.hover, color: '#fff' },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36, color: active ? brand.goldLight : 'inherit' }}>
                      <Icon sx={{ fontSize: ICON.nav }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontSize: FONT.body, fontWeight: active ? 700 : 500 }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* Signed-in identity + branch scope */}
      <Divider sx={{ borderColor: onPlum.divider }} />
      <Box sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Avatar
            src={user?.avatar?.url || undefined}
            sx={{ width: 34, height: 34, bgcolor: brand.gold, color: brand.ink, fontSize: 13, fontWeight: 700 }}
          >
            {user?.name?.[0]?.toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: FONT.body, fontWeight: 600, color: '#fff' }} noWrap>
              {user?.name}
            </Typography>
            <Typography sx={{ fontSize: FONT.tiny, color: onPlum.textFaint }} noWrap>
              {ROLE_LABELS[user?.role] || user?.role}
            </Typography>
          </Box>
        </Stack>

        <Chip
          size="small"
          label={user?.branch?.name || 'All branches'}
          sx={{
            mt: 1.25,
            width: '100%',
            justifyContent: 'flex-start',
            bgcolor: onPlum.hover,
            color: brand.goldLight,
            fontSize: FONT.micro,
            '& .MuiChip-label': { px: 1 },
          }}
        />
      </Box>
    </Box>
  );
};

const Sidebar = ({ mobileOpen, onClose }) => (
  <>
    {/* Permanent on desktop */}
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', lg: 'block' },
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, border: 0 },
      }}
      open
    >
      <SidebarContent />
    </Drawer>

    {/* Temporary on mobile — keepMounted keeps navigation instant */}
    <Drawer
      variant="temporary"
      open={mobileOpen}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        display: { xs: 'block', lg: 'none' },
        '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, border: 0 },
      }}
    >
      <SidebarContent onNavigate={onClose} />
    </Drawer>
  </>
);

export default Sidebar;
