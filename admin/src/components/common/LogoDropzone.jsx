import { Box, Typography, Stack, CircularProgress } from '@mui/material';
import { AddPhotoAlternateOutlined } from '@mui/icons-material';

import Dropzone from './Dropzone.jsx';
import ImageActions, { imageActionsHover } from './ImageActions.jsx';
import { IMAGE_TYPES } from '../../utils/constants.js';
import { LOGO_FRAME, brand, ICON } from '../../theme/index.js';

/**
 * The single-image slot — store logo, favicon, branch logo.
 *
 * All three used to hand-roll the same dropzone with three different heights,
 * two empty states and two preview insets, so the same picture looked like a
 * different control depending on which panel you opened. The frame lives here
 * now: a dashed hairline outside, the inset well inside, the preview and the
 * hover replace/remove pill on top of it.
 *
 * Upload, validation and removal stay with the caller — only one of them holds
 * a file back until its branch exists, and none of that is a frame's business.
 */
const LogoDropzone = ({
  /** Current image URL, or a local object URL while an upload is pending. */
  value,
  alt = 'Logo',
  busy = false,
  disabled = false,
  onFiles,
  onRemove,
  openRef,
  replaceLabel = 'Replace the logo',
  removeLabel = 'Remove the logo',
  /** Fills the height of a flex column instead of standing at its own height. */
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
      sx={{
        p: LOGO_FRAME.gap,
        ...(fill ? { flex: 1, minHeight: LOGO_FRAME.height } : { height: LOGO_FRAME.height }),
        display: 'flex',
      }}
    >
      {/* The well is the crop the artwork will print in — the dashed line is
          only the drop target around it. It carries no fill of its own: a logo
          is uploaded transparent and prints on white, so a tint here would
          preview a background the bill never has. */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          borderRadius: LOGO_FRAME.radius,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      >
        {busy ? (
          <CircularProgress size={26} />
        ) : value ? (
          <Box component="img" src={value} alt={alt} sx={LOGO_FRAME.preview} />
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
