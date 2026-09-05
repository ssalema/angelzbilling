import { useRef, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Stack,
  Chip,
  LinearProgress,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  CloudUpload,
  DeleteOutline,
  ChevronLeft,
  ChevronRight,
  StarRounded,
  AddPhotoAlternateOutlined,
} from '@mui/icons-material';
import { uploadApi } from '../../api/endpoints.js';
import { IMAGE_TYPES } from '../../utils/constants.js';
import Dropzone from './Dropzone.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { ICON, brand, surface } from '../../theme/index.js';


/**
 * Drag-and-drop image manager for the perfume wizard.
 *
 * Files upload to Cloudinary immediately and the parent form only ever holds
 * `{url, publicId}` references — so an abandoned wizard never saves a broken
 * image, and reordering is a pure array operation.
 */
const MediaUploader = ({ images = [], onImagesChange, maxImages = 5, folder = 'perfumes' }) => {
  const inputRef = useRef(null);
  const snackbar = useSnackbar();
  const [progress, setProgress] = useState(null);

  const imageSlots = maxImages - images.length;

  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;

    const incomingImages = files.filter((f) => f.type.startsWith('image/'));

    if (incomingImages.length < files.length) {
      snackbar.warning('Only images can be uploaded — the other files were skipped.');
    }
    if (incomingImages.length > imageSlots) {
      snackbar.warning(
        `You can add ${imageSlots} more image${imageSlots === 1 ? '' : 's'} — the extras were skipped.`
      );
    }

    const accepted = incomingImages.slice(0, Math.max(0, imageSlots));
    if (!accepted.length) return;

    setProgress(0);
    try {
      const assets = await uploadApi.upload(accepted, folder, setProgress);

      const uploadedImages = assets.filter((a) => a.resourceType === 'image');

      if (uploadedImages.length) onImagesChange([...images, ...uploadedImages.map(toMedia)]);

      snackbar.success(
        `${uploadedImages.length} image${uploadedImages.length === 1 ? '' : 's'} uploaded`
      );
    } catch (error) {
      snackbar.error(error.message);
    } finally {
      setProgress(null);
    }
  };

  const toMedia = (asset) => ({ url: asset.url, publicId: asset.publicId, alt: '' });

  const removeImage = async (index) => {
    const [removed] = images.slice(index, index + 1);
    onImagesChange(images.filter((_, i) => i !== index));
    if (removed?.publicId) uploadApi.remove(removed.publicId, 'image').catch(() => {});
  };

  /** Reordering matters — image 0 is the primary shown on cards and bills. */
  const move = (index, direction) => {
    const next = index + direction;
    if (next < 0 || next >= images.length) return;
    const reordered = [...images];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    onImagesChange(reordered);
  };

  const makePrimary = (index) => {
    if (index === 0) return;
    const reordered = [...images];
    const [item] = reordered.splice(index, 1);
    onImagesChange([item, ...reordered]);
  };

  const uploading = progress !== null;
  const full = imageSlots <= 0;

  return (
    <Box>
      <Dropzone
        openRef={inputRef}
        multiple
        accept={IMAGE_TYPES}
        disabled={uploading || full}
        label={full ? 'All image slots are full' : 'Add perfume images'}
        onFiles={handleFiles}
        sx={{ py: 4, px: 3 }}
      >
        {uploading ? (
          <Stack alignItems="center" spacing={1.5}>
            <CircularProgress size={30} />
            <Typography variant="body2" color="text.secondary">
              Uploading… {progress}%
            </Typography>
            <LinearProgress variant="determinate" value={progress} sx={{ width: '60%', borderRadius: 2 }} />
          </Stack>
        ) : (
          <>
            <CloudUpload sx={{ fontSize: ICON.illustration, color: brand.plumLight, mb: 1 }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {full ? 'All image slots are full' : 'Drag & drop perfume images here'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {full
                ? 'Remove an image to add another'
                : `or click to browse · ${Math.max(0, imageSlots)} image slot${imageSlots === 1 ? '' : 's'} remaining`}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              JPEG, JFIF, PNG, WEBP or GIF up to 5MB · {maxImages} images maximum
            </Typography>
          </>
        )}
      </Dropzone>

      {/* Image grid — first tile is the primary */}
      {images.length > 0 && (
        <Box
          sx={{
            mt: 2,
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 1.5,
          }}
        >
          {images.map((image, index) => (
            <Box
              key={image.publicId || image.url || index}
              sx={{
                position: 'relative',
                borderRadius: 2.5,
                overflow: 'hidden',
                border: 2,
                borderColor: index === 0 ? 'secondary.main' : 'divider',
                bgcolor: '#fff',
              }}
            >
              <Box
                component="img"
                src={image.url}
                alt={image.alt || `Perfume image ${index + 1}`}
                loading="lazy"
                sx={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
              />

              <Chip
                size="small"
                label={index + 1}
                sx={{ position: 'absolute', top: 6, left: 6, bgcolor: surface.inkOverlay, color: '#fff' }}
              />

              {index === 0 && (
                <Chip
                  size="small"
                  icon={<StarRounded sx={{ fontSize: ICON.micro, color: '#fff !important' }} />}
                  label="Primary"
                  color="secondary"
                  sx={{ position: 'absolute', top: 6, right: 6, color: '#fff', bgcolor: brand.plum }}
                />
              )}

              <Stack
                direction="row"
                justifyContent="center"
                sx={{ borderTop: 1, borderColor: 'divider', bgcolor: '#fff' }}
              >
                <Tooltip title="Move left">
                  <span>
                    <IconButton size="small" disabled={index === 0} onClick={() => move(index, -1)}>
                      <ChevronLeft fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Make primary">
                  <span>
                    <IconButton size="small" disabled={index === 0} onClick={() => makePrimary(index)}>
                      <StarRounded fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Remove">
                  <IconButton size="small" color="error" onClick={() => removeImage(index)}>
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Move right">
                  <span>
                    <IconButton
                      size="small"
                      disabled={index === images.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ChevronRight fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Box>
          ))}

          {!full && (
            <Box
              component="button"
              type="button"
              aria-label="Add another image"
              onClick={() => inputRef.current?.()}
              sx={{
                borderRadius: 2.5,
                border: '1.5px dashed',
                borderColor: 'divider',
                display: 'grid',
                placeItems: 'center',
                aspectRatio: '1',
                cursor: 'pointer',
                font: 'inherit',
                p: 0,
                color: 'text.secondary',
                '&:hover': { borderColor: 'secondary.main' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              }}
            >
              <Stack alignItems="center" spacing={0.5}>
                <AddPhotoAlternateOutlined />
                <Typography variant="caption">Add image</Typography>
              </Stack>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default MediaUploader;
