import { useEffect, useState } from 'react';
import { Box, Dialog, DialogContent, DialogTitle, Stack, Tab, Tabs, Typography } from '@mui/material';
import SellOutlined from '@mui/icons-material/SellOutlined';
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

import DialogCloseButton from '../../../components/common/DialogCloseButton.jsx';
import SinglePriceUpdate from './SinglePriceUpdate.jsx';
import BulkPriceUpdate from './BulkPriceUpdate.jsx';
import { BASE_LABEL } from './priceLadder.js';
import { FONT, ICON, brand } from '../../../theme/index.js';

const TABS = [
  { value: 'single', label: 'Single update', icon: <EditNoteOutlined sx={{ fontSize: ICON.action }} /> },
  { value: 'bulk', label: 'Bulk update', icon: <UploadFileOutlined sx={{ fontSize: ICON.action }} /> },
];

/**
 * The two ways a price changes: one perfume by hand, or the whole catalogue
 * from a spreadsheet. Both sit behind one door because they answer the same
 * question, and both take the same single figure — what a kilo costs — and
 * derive every fill size from it.
 *
 * They are tabs rather than a menu on the button, for the same reason the
 * stock dialog uses tabs: with a menu the admin has to decide which one they
 * want before seeing either, and picking wrong means closing and reopening.
 * Here the wrong guess costs one click.
 *
 * The dialog is remounted per opening (`keepMounted` is deliberately off), so a
 * spreadsheet read in one session leaves nothing behind for the next.
 */
const UpdatePriceDialog = ({ open, onClose, onUpdated }) => {
  const [tab, setTab] = useState('single');

  useEffect(() => {
    if (open) setTab('single');
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseButton onClose={onClose} />

      <DialogTitle sx={{ pb: 1, pr: 6 }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <SellOutlined sx={{ color: brand.plumLight }} />
          <Box>
            <Typography sx={{ fontSize: FONT.lead, fontWeight: 700, lineHeight: 1.3 }}>
              Update price
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Give the {BASE_LABEL} price only — every other size is worked out for you
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_event, next) => setTab(next)}
        sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
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
