import { Box, Typography, Stack, CircularProgress, LinearProgress } from '@mui/material';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';

import Dropzone from './Dropzone.jsx';
import ImageActions, { imageActionsHover } from './ImageActions.jsx';
import { IMAGE_TYPES } from '../../utils/constants.js';
import { LOGO_FRAME, brand, ICON } from '../../theme/index.js';
import { IMG } from '../../utils/image.js';

// The single-image slot — store logo, favicon, branch logo.
const LogoDropzone = ({
  /** Current image URL, or a local object URL while an upload is pending. */
  value,
  alt = 'Logo',
  busy = false,
  // Label while busy, so a removal doesn't read as an upload.
  busyLabel = 'Uploading…',
  // Upload percentage, 0–100, while `busy`.
  progress = null,
  disabled = false,
  onFiles,
  onRemove,
  openRef,
  replaceLabel = 'Replace the logo',
  removeLabel = 'Remove the logo',
  /** Frame height; use `LOGO_FRAME.squareHeight` for a square mark. */
  height = LOGO_FRAME.height,
  /** Fills the rest of a flex column, with `height` as the minimum. */
  fill = false,
  sx,
}) => (
  <Box
    sx={{
      ...imageActionsHover,
      ...(fill ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : null),
      ...sx,
    }}
  >
    <Dropzone
      openRef={openRef}
      disabled={busy || disabled}
      accept={IMAGE_TYPES}
      label={value ? replaceLabel : `Upload the ${alt.toLowerCase()}`}
      onFiles={onFiles}
      variant="frame"
      outline={value ? 'solid' : 'dashed'}
      sx={{
        p: LOGO_FRAME.gap,
        ...(fill ? { flex: 1, minHeight: height } : { height }),
        display: 'flex',
      }}
    >
      {/* No background fill: logos are transparent and print on white. */}
      <Box
        sx={{
          position: 'relative', // the preview centres itself against this box
          flex: 1,
          minWidth: 0,
          borderRadius: LOGO_FRAME.radius,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      >
        {busy ? (
          // Same progress readout as the perfume media grid.
          <Stack alignItems="center" spacing={1} sx={{ width: '100%', px: 2 }}>
            <CircularProgress size={26} />
            <Typography variant="caption" color="text.secondary">
              {Number.isFinite(progress) ? `${busyLabel} ${progress}%` : busyLabel}
            </Typography>
            <LinearProgress
              variant={Number.isFinite(progress) ? 'determinate' : 'indeterminate'}
              value={Number.isFinite(progress) ? progress : undefined}
              sx={{ width: '80%', borderRadius: 2 }}
            />
          </Stack>
        ) : value ? (
          <Box component="img" src={IMG.logo(value)} alt={alt} sx={LOGO_FRAME.preview} />
        ) : (
          <Stack alignItems="center" spacing={0.5}>
            <AddPhotoAlternateOutlined sx={{ fontSize: ICON.illustration, color: brand.inkSoft }} />
            <Typography variant="caption" sx={{ color: brand.plumLight, fontWeight: 600 }}>
              Upload
            </Typography>
          </Stack>
        )}
      </Box>
    </Dropzone>

    {value && !disabled && !busy && (
      <ImageActions
        onReplace={() => openRef?.current?.()}
        onRemove={onRemove}
        replaceLabel={replaceLabel}
        removeLabel={removeLabel}
      />
    )}
  </Box>
);

export default LogoDropzone;
