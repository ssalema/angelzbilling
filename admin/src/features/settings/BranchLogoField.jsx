import { useRef, useState, useEffect } from 'react';
import { Box, Typography, Stack, Button, IconButton, CircularProgress, Tooltip } from '@mui/material';
import { AddPhotoAlternateOutlined, DeleteOutline } from '@mui/icons-material';

import { branchApi } from '../../api/endpoints.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import Dropzone from '../../components/common/Dropzone.jsx';
import { IMAGE_TYPES, MAX_UPLOAD_BYTES } from '../../utils/constants.js';
import { ICON, surface } from '../../theme/index.js';

const MAX_BYTES = MAX_UPLOAD_BYTES;

/**
 * Logo slot for a single branch. An existing branch uploads straight away; a
 * branch being created has no id yet, so the file is held here and the dialog
 * uploads it once the branch exists.
 */
const BranchLogoField = ({ branchId, current, pendingFile, onPendingFile, onUploaded, disabled }) => {
  const inputRef = useRef(null);
  const snackbar = useSnackbar();
  const [busy, setBusy] = useState(false);
  const [pendingUrl, setPendingUrl] = useState('');

  useEffect(() => {
    if (!pendingFile) {
      setPendingUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const choose = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      snackbar.error('Choose an image file (PNG, JPG, WEBP or GIF)');
      return;
    }
    if (file.size > MAX_BYTES) {
      snackbar.error('That image is over 5MB. Please choose a smaller one.');
      return;
    }

    // No branch id yet — hold the file until the branch is created.
    if (!branchId) {
      onPendingFile?.(file);
      return;
    }

    setBusy(true);
    try {
      const result = await branchApi.uploadLogo(branchId, file);
      snackbar.success(result.message);
      onUploaded?.(result.data);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!branchId) {
      onPendingFile?.(null);
      return;
    }
    setBusy(true);
    try {
      const result = await branchApi.removeLogo(branchId);
      snackbar.success(result.message);
      onUploaded?.(result.data);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const preview = pendingUrl || current || '';

  return (
    <Box>
      <Dropzone
        openRef={inputRef}
        disabled={busy || disabled}
        accept={IMAGE_TYPES}
        label={preview ? 'Replace the branch logo' : 'Upload a branch logo'}
        onFiles={(files) => choose(files?.[0])}
        sx={{
          bgcolor: surface.ivoryWash,
          height: 104,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
        }}
      >
        {busy ? (
          <CircularProgress size={24} />
        ) : preview ? (
          <Box
            component="img"
            src={preview}
            alt="Branch logo"
            sx={{ maxWidth: '80%', maxHeight: '76%', objectFit: 'contain' }}
          />
        ) : (
          <Stack alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
            <AddPhotoAlternateOutlined />
            <Typography variant="caption">Upload branch logo</Typography>
          </Stack>
        )}
      </Dropzone>

      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {pendingUrl
            ? 'Uploads when you create the branch'
            : 'Transparent PNG, around 400×120px'}
        </Typography>

        {preview && !disabled && (
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Button size="small" onClick={() => inputRef.current?.()} disabled={busy}>
              Replace
            </Button>
            <Tooltip title="Remove — the branch goes back to the store logo">
              <IconButton size="small" color="error" onClick={remove} disabled={busy}>
                <DeleteOutline sx={{ fontSize: ICON.action }} />
              </IconButton>
            </Tooltip>
          </Stack>
        )}
      </Stack>
    </Box>
  );
};

export default BranchLogoField;
