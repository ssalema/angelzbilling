import { useRef, useState, useEffect } from 'react';
import { Box, Stack, Typography } from '@mui/material';

import { branchApi } from '../../api/endpoints.js';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import LogoDropzone from '../../components/common/LogoDropzone.jsx';
import { rejectImageReason } from '../../utils/constants.js';

// One branding slot — logo or favicon — for a single branch.
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
  uploading = false,
  uploadProgress = null,
}) => {
  const inputRef = useRef(null);
  const snackbar = useSnackbar();
  // Null when idle, otherwise 'upload' or 'remove' — the frame reads back the
  // work it is actually doing, so a delete never announces itself as an upload.
  const [busy, setBusy] = useState(null);
  // Null except while a file is on the wire — a removal is busy with nothing to
  // measure, so it leaves this alone and the frame runs an indeterminate bar.
  const [progress, setProgress] = useState(null);
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
    const rejected = rejectImageReason(file);
    if (rejected) {
      snackbar.error(rejected);
      return;
    }

    // No branch id yet — hold the file until the branch is created.
    if (!branchId) {
      onPendingFile?.(file);
      return;
    }

    setBusy('upload');
    setProgress(0);
    try {
      const result = await branchApi.uploadBranding(branchId, kind, file, setProgress);
      snackbar.success(result.message);
      onUploaded?.(result.data);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const remove = async () => {
    if (!branchId) {
      onPendingFile?.(null);
      return;
    }
    setBusy('remove');
    setProgress(null);
    try {
      const result = await branchApi.removeBranding(branchId, kind);
      snackbar.success(result.message);
      onUploaded?.(result.data);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setBusy(null);
    }
  };

  const preview = pendingUrl || current || '';
  const name = label.toLowerCase();
  const removing = busy === 'remove';

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mb: 0.75 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'right' }}>
          {/* State first, then the staged note, then the spec — the order the
              store's own branding slot reads in. */}
          {removing
            ? 'Removing…'
            : busy || uploading
              ? 'Uploading…'
              : pendingUrl
                ? 'Uploads when you create the branch'
                : hint}
        </Typography>
      </Stack>

      <LogoDropzone
        openRef={inputRef}
        value={preview}
        alt={label}
        busy={Boolean(busy) || uploading}
        // The wording the profile photo shows for the same two states.
        busyLabel={removing ? 'Removing…' : 'Uploading…'}
        progress={removing ? null : busy ? progress : uploadProgress}
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
