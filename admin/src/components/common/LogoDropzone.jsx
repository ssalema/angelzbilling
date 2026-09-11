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
  // Upload percentage, 0–100, while `busy`.
  progress = null,
  disabled = false,
  onFiles,
  onRemove,
  openRef,
  replaceLabel = 'Replace the logo',
  removeLabel = 'Remove the logo',
  /** Frame height — `LOGO_FRAME.squareHeight` for a slot holding a square mark. */
  height = LOGO_FRAME.height,
  /** Takes the leftover height of a flex column, with `height` as its floor. */
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
      // Dashed while the slot is empty and asking for a file; a plain mount
      // once it holds artwork.
      outline={value ? 'solid' : 'dashed'}
      sx={{
        p: LOGO_FRAME.gap,
        ...(fill ? { flex: 1, minHeight: height } : { height }),
        display: 'flex',
      }}
    >
      {/* The well is the crop the artwork will print in — the dashed line is
          only the drop target around it. It carries no fill of its own: a logo
          is uploaded transparent and prints on white, so a tint here would
          preview a background the bill never has. */}
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
          // The same readout the perfume media grid shows — spinner, percentage,
          // bar — so an upload looks like an upload wherever it is happening.
          <Stack alignItems="center" spacing={1} sx={{ width: '100%', px: 2 }}>
            <CircularProgress size={26} />
            <Typography variant="caption" color="text.secondary">
              {Number.isFinite(progress) ? `Uploading… ${progress}%` : 'Uploading…'}
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
