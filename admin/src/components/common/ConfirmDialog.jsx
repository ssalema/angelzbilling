import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  CircularProgress,
} from '@mui/material';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import DialogCloseButton from './DialogCloseButton.jsx';
import { FONT, ICON, surface } from '../../theme/index.js';

/**
 * Confirmation for anything destructive or irreversible.
 * Holds its own busy state so the caller just passes an async onConfirm.
 */
const ConfirmDialog = ({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  severity = 'error',
  onConfirm,
  onClose,
}) => {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm?.();
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogCloseButton onClose={onClose} disabled={busy} label="Cancel" />

      <DialogTitle sx={{ display: 'flex', gap: 1.5, alignItems: 'center', pb: 1, pr: 6 }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: severity === 'error' ? surface.errorSoft : surface.goldSoft,
            flexShrink: 0,
          }}
        >
          <WarningAmberRounded
            sx={{ fontSize: ICON.nav, color: severity === 'error' ? 'error.main' : 'warning.main' }}
          />
        </Box>
        <Box sx={{ fontSize: FONT.lead, fontWeight: 700 }}>{title}</Box>
      </DialogTitle>

      <DialogContent>
        <DialogContentText sx={{ fontSize: FONT.body, color: 'text.secondary' }}>{message}</DialogContentText>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color={severity === 'error' ? 'error' : 'primary'}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={15} color="inherit" /> : null}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
