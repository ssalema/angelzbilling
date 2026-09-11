import { useRef, useState } from 'react';
import { Box } from '@mui/material';
import { surface, brand } from '../../theme/index.js';

/** Corner of the 'frame' outline, in px — the SVG needs the same number. */
const FRAME_RADIUS = 8;

// The dashed outline of a 'frame' dropzone, as a background SVG.
const frameOutline = (color, dashes = true) => {
  const dash = dashes ? ' stroke-dasharray="8 6"' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="none"><rect width="100%" height="100%" rx="${FRAME_RADIUS}" stroke="${color}" stroke-width="3"${dash}/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

// The one drag-and-drop file target in the panel.
const Dropzone = ({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  label = 'Add files',
  variant = 'panel',
  /** 'dashed' (empty, still asking for a file) or 'solid' (already filled). */
  outline = 'dashed',
  // Lets a sibling control ("Replace") reopen the picker without owning an
  // input of its own.
  openRef,
  sx,
  children,
}) => {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const open = () => {
    if (!disabled) inputRef.current?.click();
  };
  if (openRef) openRef.current = open;

  const active = dragging && !disabled;

  // 'frame' — the single-image slot (logo, favicon, branch logo).
  const dashes = outline !== 'solid';
  const dashed =
    variant === 'frame'
      ? {
          border: 0,
          borderRadius: `${FRAME_RADIUS}px`,
          backgroundColor: active ? surface.goldFaint : 'transparent',
          backgroundImage: frameOutline(active ? brand.gold : brand.line, dashes || active),
          transition: 'background-image .18s ease, background-color .18s ease',
          '&:hover': { backgroundImage: frameOutline(disabled ? brand.line : brand.gold, dashes) },
        }
      : {
          border: '1.5px dashed',
          borderColor: active ? 'secondary.main' : 'divider',
          bgcolor: active ? surface.goldFaint : 'transparent',
          borderRadius: variant === 'tile' ? 2.5 : 3,
          transition: 'border-color .18s ease, background-color .18s ease',
          '&:hover': { borderColor: disabled ? 'divider' : 'secondary.main' },
        };

  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={open}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) onFiles?.(event.dataTransfer.files);
      }}
      sx={{
        // Reset the button chrome — the dashed frame below is the whole visual.
        width: '100%',
        display: 'block',
        font: 'inherit',
        color: 'inherit',
        textAlign: 'center',
        p: 0,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
        ...dashed,
        ...sx,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={multiple}
        accept={accept}
        onChange={(event) => {
          onFiles?.(event.target.files);
          event.target.value = '';
        }}
      />
      {typeof children === 'function' ? children({ dragging, disabled }) : children}
    </Box>
  );
};

export default Dropzone;
