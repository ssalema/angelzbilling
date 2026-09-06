import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';

/**
 * Single source of truth for navigation.
 * `roles` here drives what the sidebar shows; the same rules are enforced again
 * on the route guard and a third time on the API — the menu is convenience,
 * never the security boundary.
 *
 * No item is an exact match: a section stays lit for everything beneath it, so
 * /billing/new and /settings/branches keep telling you where you are.
 */
const navSections = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: SpaceDashboardOutlined, roles: ['superadmin', 'admin', 'staff'] },
    ],
  },
  {
    heading: 'Catalogue',
    items: [
      { label: 'Perfumes', to: '/perfumes', icon: Inventory2Outlined, roles: ['superadmin', 'admin', 'staff'] },
    ],
  },
  {
    heading: 'Billing',
    items: [
      { label: 'Bill records', to: '/billing', icon: ReceiptLongOutlined, roles: ['superadmin', 'admin', 'staff'] },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { label: 'Users', to: '/users', icon: GroupOutlined, roles: ['superadmin'] },
      { label: 'Settings', to: '/settings', icon: SettingsOutlined, roles: ['superadmin', 'admin'] },
    ],
  },
];

export const visibleSections = (role) =>
  navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => item.roles.includes(role)) }))
    .filter((section) => section.items.length > 0);
