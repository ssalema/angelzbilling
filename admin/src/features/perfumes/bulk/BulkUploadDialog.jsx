import { Box, Dialog, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';

import DialogCloseButton from '../../../components/common/DialogCloseButton.jsx';
import BulkPerfumeUpload from './BulkPerfumeUpload.jsx';
import { FONT, brand } from '../../../theme/index.js';

/**
 * The door to the catalogue upload.
 *
 * One panel rather than the tabs the stock and price dialogs carry: those two
 * offer a single-perfume alternative because there is no other screen for it,
 * while adding one perfume by hand already has a home — the Add perfume wizard,
 * which this deliberately does not duplicate or change.
 *
 * The dialog is remounted per opening (`keepMounted` is deliberately off), so a
 * spreadsheet read in one session leaves nothing behind for the next.
 */
const BulkUploadDialog = ({ open, onClose, onCreated }) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogCloseButton onClose={onClose} />

    <DialogTitle sx={{ pb: 1, pr: 6 }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <UploadFileOutlined sx={{ color: brand.plumLight }} />
        <Box>
          <Typography sx={{ fontSize: FONT.lead, fontWeight: 700, lineHeight: 1.3 }}>
            Bulk upload perfumes
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Add a whole catalogue from one sheet — SKUs are numbered for you
          </Typography>
        </Box>
      </Stack>
    </DialogTitle>

    {/* No minimum height: the panel is the height of what is in it, matching
        the stock and price dialogs. */}
    <DialogContent sx={{ pt: 2.5, pb: 3 }}>
      <BulkPerfumeUpload onCreated={onCreated} />
    </DialogContent>
  </Dialog>
);

export default BulkUploadDialog;
