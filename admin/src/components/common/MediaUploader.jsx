import { useState } from 'react';
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
import CloudUpload from '@mui/icons-material/CloudUpload';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import StarRounded from '@mui/icons-material/StarRounded';
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined';
import { uploadApi } from '../../api/endpoints.js';
import { IMAGE_TYPES, rejectImageReason } from '../../utils/constants.js';
import Dropzone from './Dropzone.jsx';
import { useSnackbar } from '../../context/SnackbarContext.jsx';
import { CARD_RADIUS, ICON, brand, surface } from '../../theme/index.js';
import { IMG } from '../../utils/image.js';

// Drag-and-drop image manager for the perfume wizard.
const MediaUploader = ({ images = [], onImagesChange, maxImages = 5, folder = 'perfumes' }) => {
  const snackbar = useSnackbar();
  const [progress, setProgress] = useState(null);

  const imageSlots = maxImages - images.length;

  const handleFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;

    const incomingImages = files.filter((f) => !rejectImageReason(f));

    if (incomingImages.length < files.length) {
      const [firstRejected] = files.filter((f) => rejectImageReason(f));
      snackbar.error(rejectImageReason(firstRejected));
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
      {/* The wide panel is the empty state only — once a tile exists, the grid's
          own 'Add image' dropzone takes over so the two never compete. */}
      {images.length === 0 && (
        <Dropzone
          multiple
          accept={IMAGE_TYPES}
          disabled={uploading}
          label="Add perfume images"
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
                Drag & drop perfume images here
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                or click to browse · {maxImages} image slot{maxImages === 1 ? '' : 's'} remaining
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                JPEG, JFIF, PNG, WEBP or GIF up to 5MB · {maxImages} images maximum
              </Typography>
            </>
          )}
        </Dropzone>
      )}

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
                borderRadius: `${CARD_RADIUS}px`,
                overflow: 'hidden',
                border: 2,
                borderColor: index === 0 ? 'secondary.main' : 'divider',
                bgcolor: '#fff',
              }}
            >
              <Box
                component="img"
                src={IMG.thumb(image.url)}
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
            <Dropzone
              multiple
              accept={IMAGE_TYPES}
              variant="tile"
              disabled={uploading}
              label="Add another image"
              onFiles={handleFiles}
              sx={{
                display: 'grid',
                placeItems: 'center',
                aspectRatio: '1',
                px: 1.5,
                color: 'text.secondary',
              }}
            >
              {uploading ? (
                <Stack alignItems="center" spacing={1} sx={{ width: '100%' }}>
                  <CircularProgress size={24} />
                  <Typography variant="caption" color="text.secondary">
                    Uploading… {progress}%
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{ width: '80%', borderRadius: 2 }}
                  />
                </Stack>
              ) : (
                <Stack alignItems="center" spacing={0.5}>
                  <AddPhotoAlternateOutlined />
                  <Typography variant="caption">Add image</Typography>
                </Stack>
              )}
            </Dropzone>
          )}
        </Box>
      )}

      {images.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {full
            ? `All ${maxImages} image slots are full — remove an image to add another`
            : `Drop or click the empty tile to add more · ${imageSlots} image slot${imageSlots === 1 ? '' : 's'} remaining · JPEG, JFIF, PNG, WEBP or GIF up to 5MB`}
        </Typography>
      )}
    </Box>
  );
};

export default MediaUploader;
