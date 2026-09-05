import { useRef, useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';

import { branchApi } from '../../api/endpoints.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import LogoDropzone from '../../components/common/LogoDropzone.jsx';
import { MAX_UPLOAD_BYTES } from '../../utils/constants.js';

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
      <LogoDropzone
        openRef={inputRef}
        value={preview}
        alt="Branch logo"
        busy={busy}
        disabled={disabled}
        onFiles={(files) => choose(files?.[0])}
        onRemove={remove}
        replaceLabel="Replace the branch logo"
        removeLabel="Remove — the branch goes back to the store logo"
      />

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {pendingUrl ? 'Uploads when you create the branch' : 'Transparent PNG, around 400×120px'}
      </Typography>
    </Box>
  );
};

export default BranchLogoField;
