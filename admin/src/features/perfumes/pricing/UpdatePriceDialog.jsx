import { useEffect, useState } from 'react';
import { Box, Dialog, DialogContent, DialogTitle, Stack, Tab, Tabs, Typography } from '@mui/material';
import SellOutlined from '@mui/icons-material/SellOutlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

import DialogCloseButton, { dismiss } from '../../../components/common/DialogCloseButton.jsx';
import SinglePriceUpdate from './SinglePriceUpdate.jsx';
import BulkPriceUpdate from './BulkPriceUpdate.jsx';
import { FONT, ICON, brand } from '../../../theme/index.js';

const TABS = [
  { value: 'single', label: 'Single update', icon: <EditNoteOutlined sx={{ fontSize: ICON.action }} /> },
  { value: 'bulk', label: 'Bulk update', icon: <UploadFileOutlined sx={{ fontSize: ICON.action }} /> },
];

// The two ways a price changes: one perfume by hand, or the whole catalogue from a spreadsheet.
const UpdatePriceDialog = ({ open, onClose, onUpdated }) => {
  const [tab, setTab] = useState('single');

  useEffect(() => {
    if (open) setTab('single');
  }, [open]);

  return (
    <Dialog open={open} onClose={dismiss(onClose)} maxWidth="md" fullWidth>
      <DialogCloseButton onClose={onClose} />

      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <SellOutlined sx={{ color: brand.plumLight }} />
          <Box>
            <Typography sx={{ fontSize: FONT.lead, fontWeight: 700, lineHeight: 1.3 }}>
              Update price
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Set a new price for any size — the sizes you leave alone keep their price
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_event, next) => setTab(next)}
        sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map((item) => (
          <Tab key={item.value} value={item.value} label={item.label} icon={item.icon} iconPosition="start" />
        ))}
      </Tabs>

      {/* No minimum height — the panel is the height of what is in it, as in
          the stock dialog. A floor only added empty white under short panels. */}
      <DialogContent sx={{ pt: 2.5, pb: 3 }}>
        {tab === 'single' ? (
          <SinglePriceUpdate onUpdated={onUpdated} />
        ) : (
          <BulkPriceUpdate onUpdated={onUpdated} />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UpdatePriceDialog;
