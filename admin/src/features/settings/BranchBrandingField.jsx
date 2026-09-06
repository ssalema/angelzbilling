import { useRef, useState, useEffect } from 'react';
import { Box, Stack, Typography } from '@mui/material';

import { branchApi } from '../../api/endpoints.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import LogoDropzone from '../../components/common/LogoDropzone.jsx';
import { MAX_UPLOAD_BYTES } from '../../utils/constants.js';

/**
 * One branding slot — logo or favicon — for a single branch.
 *
 * It reads like the store's own Branding panel on purpose: same dropzone, same
 * label/hint row, same two artwork sizes. The difference is when the file
 * moves. An existing branch uploads straight away; a branch being created has
 * no id yet, so the file is held here and the dialog uploads it once the branch
 * exists.
 */
const BranchBrandingField = ({
  kind,
  label,
  hint,
  branchId,
  current,
  pendingFile,
  onPendingFile,
  onUploaded,
  disabled,
  frameHeight,
}) => {
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
    if (file.size > MAX_UPLOAD_BYTES) {
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
      const result = await branchApi.uploadBranding(branchId, kind, file);
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
      const result = await branchApi.removeBranding(branchId, kind);
      snackbar.success(result.message);
      onUploaded?.(result.data);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const preview = pendingUrl || current || '';
  const name = label.toLowerCase();

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mb: 0.75 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'right' }}>
          {pendingUrl ? 'Uploads when you create the branch' : hint}
        </Typography>
      </Stack>

      <LogoDropzone
        openRef={inputRef}
        value={preview}
        alt={label}
        busy={busy}
        disabled={disabled}
        height={frameHeight}
        onFiles={(files) => choose(files?.[0])}
        onRemove={remove}
        replaceLabel={`Replace the ${name}`}
        removeLabel={`Remove — the branch goes back to the store ${kind}`}
      />
    </Box>
  );
};

export default BranchBrandingField;
