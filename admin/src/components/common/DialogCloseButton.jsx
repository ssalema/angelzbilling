import { IconButton, Tooltip } from '@mui/material';
import { Close } from '@mui/icons-material';

/**
 * The single way out of a dialog: a cross in the top right corner.
 * Dialogs no longer carry a Cancel / Close button in their actions row.
 */
const DialogCloseButton = ({ onClose, disabled = false, label = 'Close', className, sx }) => (
  <Tooltip title={label}>
    <span className={className} style={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
      <IconButton
        aria-label={label}
        onClick={onClose}
        disabled={disabled}
        size="small"
        sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary' }, ...sx }}
      >
        <Close fontSize="small" />
      </IconButton>
    </span>
  </Tooltip>
);

export default DialogCloseButton;
