import { useRef, useState, useEffect } from 'react';
import { Card, Box, Typography, Stack, Chip, Divider } from '@mui/material';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import LogoDropzone from '../../components/common/LogoDropzone.jsx';
import { ResetIconButton } from '../../components/common/FilterBar.jsx';
import { MAX_UPLOAD_BYTES } from '../../utils/constants.js';
import { CARD_PAD, LOGO_FRAME } from '../../theme/index.js';

/**
 * Logo and favicon for the store.
 *
 * Nothing here reaches Cloudinary on its own: a chosen file is held as pending
 * and previewed locally, and the page's "Save changes" bar uploads it with the
 * rest of the form — the same bargain every other field on the tab offers, so
 * "Discard changes" really does undo everything on screen. `BranchBrandingField`
 * already held a file back this way while its branch was being created.
 *
 * `pending[kind]` is a File to upload, `null` to remove, or absent for
 * untouched — `undefined` cannot say "remove this", which is why absent and
 * null are different states here.
 */
const BrandingSlot = ({ kind, label, hint, current, pending, onPending, disabled, frameHeight, grow }) => {
  const inputRef = useRef(null);
  const snackbar = useSnackbar();
  const [pendingUrl, setPendingUrl] = useState('');

  const file = pending instanceof File ? pending : null;

  useEffect(() => {
    if (!file) {
      setPendingUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPendingUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (chosen) => {
    if (!chosen) return;
    if (!chosen.type.startsWith('image/')) {
      snackbar.error('Choose an image file (PNG, JPG, WEBP or GIF)');
      return;
    }
    if (chosen.size > MAX_UPLOAD_BYTES) {
      snackbar.error('That image is over 5MB. Please choose a smaller one.');
      return;
    }
    onPending(kind, chosen);
  };

  // A staged removal blanks the slot; otherwise the pending file wins over
  // whatever is saved.
  const preview = pending === null ? '' : pendingUrl || current?.url || '';

  return (
    <Box sx={grow ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : null}>
      {/* Name left, spec right — the label/hint row of the General information
          card, so both columns of the settings grid read as one form. */}
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mb: 0.75 }}>
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', textAlign: 'right' }}>
          {pending === undefined ? hint : 'Uploads when you save'}
        </Typography>
      </Stack>

      <LogoDropzone
        openRef={inputRef}
        value={preview}
        alt={label}
        disabled={disabled}
        height={frameHeight}
        fill={grow}
        onFiles={(files) => choose(files?.[0])}
        onRemove={() => onPending(kind, null)}
        replaceLabel={`Replace the ${label.toLowerCase()}`}
        removeLabel={`Remove the ${label.toLowerCase()}`}
      />
    </Box>
  );
};

const BrandingPanel = ({ settings, pending, onPending, onResetPending, canEdit, disabled }) => {
  const logo = settings?.branding?.logo;
  const favicon = settings?.branding?.favicon;

  // "Edited" is about this sitting, not about the store owning artwork: it marks
  // a pick that has not been saved yet, so saving clears it. That is exactly
  // what the reset beside it undoes, and what the page's unsaved-changes bar is
  // offering to save.
  const edited = Object.keys(pending || {}).length > 0;

  return (
    // Full column height, so the card squares off with the form beside it.
    // The frames keep the fixed heights their artwork was sized for — growing
    // them to eat the slack blew the logo up and pushed the favicon past the
    // card — so any slack is left below them.
    <Card sx={{ p: CARD_PAD, height: '100%', display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      <SectionTitle
        title="Branding"
        description="Your logo appears in the sidebar, on the sign-in screen and at the top of every printed bill. A branch with its own logo prints that one instead."
        descriptionAs="tooltip"
        sx={{ mb: 0 }}
        action={
          <Stack direction="row" alignItems="center" spacing={1}>
            {edited && (
              <Chip
                size="small"
                label="Edited"
                sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', fontWeight: 700 }}
              />
            )}
            <ResetIconButton
              onClick={onResetPending}
              disabled={!canEdit || disabled || !edited}
              title="Reset changes"
              disabledTitle={canEdit ? 'No unsaved changes' : 'Only a Super Admin can change branding'}
            />
          </Stack>
        }
      />
      <Divider />

      <BrandingSlot
        kind="logo"
        label="Logo"
        hint="Transparent PNG, around 400×120px"
        current={logo}
        pending={pending?.logo}
        onPending={onPending}
        disabled={!canEdit || disabled}
      />
      <BrandingSlot
        kind="favicon"
        label="Favicon"
        // A square mark needs a square-ish frame to land at a useful size, and
        // as the last slot it takes whatever height the card has left over —
        // otherwise squaring the card off with the form beside it just leaves a
        // strip of nothing under the favicon.
        frameHeight={LOGO_FRAME.squareHeight}
        grow
        hint="Square PNG, 64×64px or larger"
        current={favicon}
        pending={pending?.favicon}
        onPending={onPending}
        disabled={!canEdit || disabled}
      />

      {!canEdit && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          Only a Super Admin can change branding.
        </Typography>
      )}
    </Card>
  );
};

export default BrandingPanel;
