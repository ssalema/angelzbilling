import { useEffect, useState } from 'react';
import { Box, Dialog, DialogContent, DialogTitle, Stack, Tab, Tabs, Typography } from '@mui/material';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

import DialogCloseButton, { dismiss } from '../../../components/common/DialogCloseButton.jsx';
import SingleStockUpdate from './SingleStockUpdate.jsx';
import BulkStockUpdate from './BulkStockUpdate.jsx';
import { FONT, ICON, brand } from '../../../theme/index.js';

const TABS = [
  { value: 'single', label: 'Single update', icon: <EditNoteOutlined sx={{ fontSize: ICON.action }} /> },
  { value: 'bulk', label: 'Bulk update', icon: <UploadFileOutlined sx={{ fontSize: ICON.action }} /> },
];

// The two ways stock goes up: one perfume by hand, or a whole delivery from a spreadsheet.
const UpdateStockDialog = ({ open, onClose, onUpdated }) => {
  const [tab, setTab] = useState('single');

  useEffect(() => {
    if (open) setTab('single');
  }, [open]);

  return (
    <Dialog open={open} onClose={dismiss(onClose)} maxWidth="md" fullWidth>
      <DialogCloseButton onClose={onClose} />

      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Inventory2Outlined sx={{ color: brand.plumLight }} />
          <Box>
            <Typography sx={{ fontSize: FONT.lead, fontWeight: 700, lineHeight: 1.3 }}>
              Update stock
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Whatever you enter is added to the stock already on hand
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

      {/* No minimum height: the panel is the height of what is in it. Holding a
          floor kept the dialog from resizing between tabs, but it bought that
          with a band of empty white under every panel shorter than the floor. */}
      <DialogContent sx={{ pt: 2.5, pb: 3 }}>
        {tab === 'single' ? (
          <SingleStockUpdate onUpdated={onUpdated} />
        ) : (
          <BulkStockUpdate onUpdated={onUpdated} />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UpdateStockDialog;
