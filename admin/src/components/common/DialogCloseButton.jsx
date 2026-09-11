import { IconButton, Tooltip } from '@mui/material';
import Close from '@mui/icons-material/Close';

// The single way out of a dialog: a cross in the top right corner.
// Dialog `onClose` that ignores a click on the backdrop.
export const dismiss = (onClose) => (_event, reason) => {
  if (reason !== 'backdropClick') onClose?.();
};

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
