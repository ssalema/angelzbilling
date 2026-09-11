import { Stack, IconButton, Tooltip } from '@mui/material';
import SwapHorizRounded from '@mui/icons-material/SwapHorizRounded';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { ICON, surface, brand } from '../../theme/index.js';

// The replace/remove pill that floats over an uploaded image.

// Spread onto the positioned wrapper around a preview + `<ImageActions />`.
export const imageActionsHover = {
  position: 'relative',
  '& .ImageActions': {
    opacity: 0,
    pointerEvents: 'none',
    transition: 'opacity .18s ease, transform .18s ease',
    transform: 'translate(-50%, 4px)',
  },
  '&:hover .ImageActions, &:focus-within .ImageActions': {
    opacity: 1,
    pointerEvents: 'auto',
    transform: 'translate(-50%, 0)',
  },
  '@media (hover: none)': {
    '& .ImageActions': { opacity: 1, pointerEvents: 'auto', transform: 'translate(-50%, 0)' },
  },
};

const ImageActions = ({
  onReplace,
  onRemove,
  replaceLabel = 'Replace',
  removeLabel = 'Remove',
  disabled = false,
  bottom = 8,
}) => (
  <Stack
    className="ImageActions"
    direction="row"
    spacing={0.25}
    alignItems="center"
    sx={{
      position: 'absolute',
      left: '50%',
      bottom,
      px: 0.25,
      borderRadius: 999,
      bgcolor: surface.inkOverlay,
      backdropFilter: 'blur(3px)',
      boxShadow: `0 2px 10px ${brand.ink}33`,
      zIndex: 1,
    }}
  >
    <Tooltip title={replaceLabel}>
      <span>
        <IconButton size="small" onClick={onReplace} disabled={disabled} aria-label={replaceLabel}>
          <SwapHorizRounded sx={{ fontSize: ICON.action, color: '#fff' }} />
        </IconButton>
      </span>
    </Tooltip>
    <Tooltip title={removeLabel}>
      <span>
        <IconButton size="small" onClick={onRemove} disabled={disabled} aria-label={removeLabel}>
          <DeleteOutline sx={{ fontSize: ICON.action, color: '#FF8A8A' }} />
        </IconButton>
      </span>
    </Tooltip>
  </Stack>
);

export default ImageActions;
