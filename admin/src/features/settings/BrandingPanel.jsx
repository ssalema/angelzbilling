import { useRef, useState, useEffect } from 'react';
import { Card, Box, Typography, Stack, Chip, Divider } from '@mui/material';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import SectionTitle from '../../components/common/SectionTitle.jsx';
import LogoDropzone from '../../components/common/LogoDropzone.jsx';
import { ResetIconButton } from '../../components/common/FilterBar.jsx';
import { rejectImageReason } from '../../utils/constants.js';
import { CARD_PAD, LOGO_FRAME } from '../../theme/index.js';

// Logo and favicon for the store.
const BrandingSlot = ({
  kind,
  label,
  hint,
  current,
  pending,
  onPending,
  disabled,
  frameHeight,
  grow,
  /** Percentage while the page's save is uploading this slot; null otherwise. */
  progress = null,
}) => {
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
    const rejected = rejectImageReason(chosen);
    if (rejected) {
      snackbar.error(rejected);
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
          {progress !== null ? 'Uploading…' : pending === undefined ? hint : 'Uploads when you save'}
        </Typography>
      </Stack>

      <LogoDropzone
        openRef={inputRef}
        value={preview}
        alt={label}
        disabled={disabled}
        busy={progress !== null}
        progress={progress}
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

const BrandingPanel = ({
  settings,
  pending,
  onPending,
  onResetPending,
  canEdit,
  disabled,
  /** `{ logo, favicon }` percentages the page's save reports while uploading. */
  progress = {},
}) => {
  const logo = settings?.branding?.logo;
  const favicon = settings?.branding?.favicon;

  const edited = Object.keys(pending || {}).length > 0;

  return (
    // Full column height, so the card squares off with the form beside it.
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
        progress={progress?.logo ?? null}
        disabled={!canEdit || disabled}
      />
      <BrandingSlot
        kind="favicon"
        label="Favicon"
        frameHeight={LOGO_FRAME.squareHeight}
        grow
        hint="Square PNG, 64×64px or larger"
        current={favicon}
        pending={pending?.favicon}
        onPending={onPending}
        progress={progress?.favicon ?? null}
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
