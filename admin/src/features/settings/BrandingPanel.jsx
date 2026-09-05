import { useRef, useState } from 'react';
import { Card, Box, Typography, Stack, Button, IconButton, CircularProgress, Tooltip, Divider } from '@mui/material';
import { AddPhotoAlternateOutlined, DeleteOutline, RefreshRounded } from '@mui/icons-material';
import { settingsApi } from '../../api/endpoints.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import Dropzone from '../../components/common/Dropzone.jsx';
import { IMAGE_TYPES } from '../../utils/constants.js';
import { CARD_PAD, ICON, surface } from '../../theme/index.js';

/**
 * Logo and favicon upload. Both go to Cloudinary; MongoDB stores only the
 * `{url, publicId}` reference, and replacing an asset deletes the old one.
 *
 * The label/hint row mirrors the `FieldRow` of the General information card so
 * both columns of the settings grid read as one form.
 */
const BrandingSlot = ({ kind, label, hint, aspect, current, onChanged, disabled }) => {
  const inputRef = useRef(null);
  const snackbar = useSnackbar();
  const [busy, setBusy] = useState(false);

  const upload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      snackbar.error('Choose an image file (PNG, JPG, WEBP or GIF)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      snackbar.error('That image is over 5MB. Please choose a smaller one.');
      return;
    }

    setBusy(true);
    try {
      const result = await settingsApi.uploadBranding(kind, file);
      snackbar.success(result.message);
      onChanged?.(result.data);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const result = await settingsApi.removeBranding(kind);
      snackbar.success(result.message);
      onChanged?.(result.data);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mb: 0.6 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'right' }}>
          {hint}
        </Typography>
      </Stack>

      <Dropzone
        openRef={inputRef}
        disabled={busy || disabled}
        accept={IMAGE_TYPES}
        label={current?.url ? `Replace the ${label.toLowerCase()}` : `Upload a ${label.toLowerCase()}`}
        onFiles={(files) => upload(files?.[0])}
        sx={{
          bgcolor: surface.ivoryWash,
          minHeight: aspect === 'square' ? 132 : 108,
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {busy ? (
          <CircularProgress size={26} />
        ) : current?.url ? (
          <Box
            component="img"
            src={current.url}
            alt={label}
            sx={{ maxWidth: '82%', maxHeight: '78%', objectFit: 'contain' }}
          />
        ) : (
          <Stack alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
            <AddPhotoAlternateOutlined />
            <Typography variant="caption">Upload</Typography>
          </Stack>
        )}
      </Dropzone>

      {current?.url && !disabled && (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
          <Button size="small" onClick={() => inputRef.current?.()} disabled={busy}>
            Replace
          </Button>
          <Tooltip title="Remove">
            <IconButton size="small" color="error" onClick={remove} disabled={busy}>
              <DeleteOutline sx={{ fontSize: ICON.action }} />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    </Box>
  );
};

const BrandingPanel = ({ settings, onChanged, onRefresh, canEdit }) => (
  <Card sx={{ p: CARD_PAD, height: '100%', display: 'flex', flexDirection: 'column', gap: 2.25 }}>
    <SectionTitle
      title="Branding"
      description="Your logo appears in the sidebar, on the sign-in screen and at the top of every printed bill. A branch with its own logo prints that one instead."
      sx={{ mb: 0 }}
      action={
        <Tooltip title="Refresh">
          <IconButton
            size="small"
            onClick={onRefresh}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}
          >
            <RefreshRounded sx={{ fontSize: ICON.action }} />
          </IconButton>
        </Tooltip>
      }
    />
    <Divider />

    <BrandingSlot
      kind="logo"
      label="Logo"
      hint="Transparent PNG, around 400×120px"
      current={settings?.branding?.logo}
      onChanged={onChanged}
      disabled={!canEdit}
    />
    <BrandingSlot
      kind="favicon"
      label="Favicon"
      hint="Square PNG, 64×64px or larger"
      aspect="square"
      current={settings?.branding?.favicon}
      onChanged={onChanged}
      disabled={!canEdit}
    />

    {!canEdit && (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Only a Super Admin can change branding.
      </Typography>
    )}
  </Card>
);

export default BrandingPanel;
