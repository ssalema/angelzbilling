import { Typography, Alert, AlertTitle, Stack } from '@mui/material';
import { useController, useFormContext } from 'react-hook-form';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import MediaUploader from '../../../components/common/MediaUploader.jsx';
import { SectionCard } from './StepBasicInfo.jsx';
import { surface } from '../../../theme/index.js';

const TIPS = [
  'Use a square image, at least 1000×1000px, on a plain background',
  'Lead with the full bottle, then follow with detail and in-use shots',
  'Keep lighting consistent across all images of the same perfume',
  'Upload JPEG, JFIF, PNG, WEBP or GIF files under 5MB each',
];

const StepMedia = () => {
  const { control } = useFormContext();

  const { field: images, fieldState: imagesState } = useController({ control, name: 'images' });

  return (
    <SectionCard
      title="Perfume media"
      description="Upload up to 5 images. The first image is the primary one used on perfume cards, search results and the printed bill — use the arrows to reorder."
    >
      {imagesState.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {imagesState.error.message}
        </Alert>
      )}

      <MediaUploader
        images={images.value || []}
        onImagesChange={images.onChange}
        maxImages={5}
        folder="perfumes"
      />

      <Alert severity="info" icon={<InfoOutlined />} sx={{ mt: 3, bgcolor: surface.plumFaint, color: 'text.primary' }}>
        <AlertTitle sx={{ fontWeight: 700, }}>Tips for good perfume media</AlertTitle>
        <Stack component="ul" sx={{ m: 0, pl: 2.5, gap: 0.4 }}>
          {TIPS.map((tip) => (
            <Typography key={tip} component="li" variant="body2" color="text.secondary">
              {tip}
            </Typography>
          ))}
        </Stack>
      </Alert>
    </SectionCard>
  );
};

export default StepMedia;
