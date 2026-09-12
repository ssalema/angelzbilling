import { useRef, useState } from 'react';
import { Avatar, Badge, Box, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';

import ConfirmDialog from '../../components/common/ConfirmDialog.jsx';
import ImageActions, { imageActionsHover } from '../../components/common/ImageActions.jsx';
import { authApi } from '../../api/endpoints.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { initials } from '../../utils/format.js';
import { IMAGE_TYPES, rejectImageReason } from '../../utils/constants.js';
import { brand } from '../../theme/index.js';
import { IMG } from '../../utils/image.js';

const SIZE = 84;

// The account's own photo — upload, replace, remove — on the identity card.
// The single-image slots elsewhere (store logo, branch marks) are a Dropzone
// wearing the same hover pill; a circle cannot take a dashed frame, so the
// camera badge stands in as the affordance while the slot is empty.
const ProfilePhoto = () => {
  const { user, setUser } = useAuth();
  const snackbar = useSnackbar();
  const inputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  // Null except while bytes are on the wire; a removal has nothing to measure.
  const [progress, setProgress] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const current = user?.avatar?.url || '';

  const open = () => {
    if (!busy) inputRef.current?.click();
  };

  const choose = async (file) => {
    if (!file) return;

    const rejected = rejectImageReason(file);
    if (rejected) {
      snackbar.error(rejected);
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const result = await authApi.uploadAvatar(file, setProgress);
      setUser(result.data.user);
      snackbar.success(result.message);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const result = await authApi.removeAvatar();
      setUser(result.data.user);
      snackbar.success(result.message);
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadLabel = 'Upload a photo';

  const photo = (
    <Box sx={{ ...imageActionsHover, width: SIZE, height: SIZE }}>
      <Tooltip title={current ? 'Replace your photo' : uploadLabel}>
        <Avatar
          src={IMG.thumb(current) || undefined}
          alt={user?.name || 'Profile photo'}
          onClick={open}
          sx={{
            width: SIZE,
            height: SIZE,
            bgcolor: brand.plum,
            fontSize: 30,
            fontWeight: 700,
            cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.45 : 1,
            transition: 'opacity .18s ease',
          }}
        >
          {initials(user?.name)}
        </Avatar>
      </Tooltip>

      {/* Only once the slot holds a photo — the rule the logo slots follow. No
          replace button here: the photo itself is the picker. */}
      {current && !busy && (
        <ImageActions onRemove={() => setConfirmRemove(true)} removeLabel="Remove your photo" bottom={4} />
      )}
    </Box>
  );

  return (
    <Stack alignItems="center" spacing={1}>
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES}
        hidden
        onChange={(event) => {
          choose(event.target.files?.[0]);
          // Cleared so picking the same file twice still fires a change.
          event.target.value = '';
        }}
      />

      {current ? (
        photo
      ) : (
        <Badge
          overlap="circular"
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          badgeContent={
            <Tooltip title={uploadLabel}>
              <span>
                <IconButton
                  size="small"
                  aria-label={uploadLabel}
                  disabled={busy}
                  onClick={open}
                  sx={{
                    bgcolor: brand.gold,
                    color: brand.ink,
                    boxShadow: `0 2px 8px ${brand.ink}33`,
                    '&:hover': { bgcolor: brand.goldDark, color: '#fff' },
                  }}
                >
                  <PhotoCameraOutlined sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>
          }
        >
          {photo}
        </Badge>
      )}

      {/* The readout every other upload in the app shows, sized for this card. */}
      {busy && (
        <Stack alignItems="center" spacing={0.75} sx={{ width: SIZE + 40 }}>
          <Typography variant="caption" color="text.secondary">
            {Number.isFinite(progress) ? `Uploading… ${progress}%` : 'Removing…'}
          </Typography>
          <LinearProgress
            variant={Number.isFinite(progress) ? 'determinate' : 'indeterminate'}
            value={Number.isFinite(progress) ? progress : undefined}
            sx={{ width: '100%', borderRadius: 2 }}
          />
        </Stack>
      )}

      <ConfirmDialog
        open={confirmRemove}
        title="Remove your profile photo?"
        message="Your initials go back on the avatar everywhere. You can upload a new photo at any time."
        confirmLabel="Remove photo"
        onConfirm={remove}
        onClose={() => setConfirmRemove(false)}
      />
    </Stack>
  );
};

export default ProfilePhoto;
