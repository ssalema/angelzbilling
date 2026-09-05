import { useRef, useState } from 'react';
import { Box } from '@mui/material';
import { surface, brand } from '../../theme/index.js';

/** Corner of the 'frame' outline, in px — the SVG needs the same number. */
const FRAME_RADIUS = 8;

/**
 * The dashed outline of a 'frame' dropzone, as a background SVG. The rect sits
 * on the edge and is stroked at double width, so the outer half is clipped away
 * and a clean 1.5px line is left inside — the usual trick, and it avoids `calc`
 * inside SVG geometry, which browsers do not agree on.
 */
const frameOutline = (color) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="none"><rect width="100%" height="100%" rx="${FRAME_RADIUS}" stroke="${color}" stroke-width="3" stroke-dasharray="8 6"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

/**
 * The one drag-and-drop file target in the panel.
 *
 * It is a real `<button>`, so it takes keyboard focus, fires on Enter and
 * Space, and announces itself to a screen reader — the three hand-rolled
 * `<Box onClick>` dropzones this replaces did none of that.
 *
 * The caller owns what is shown inside: pass a render function and it receives
 * `{ dragging, disabled }` so the idle, hovered and full states stay the
 * caller's business, while focus, keyboard and file plumbing stay here.
 *
 * `variant` picks the frame shape: 'panel' (the wide drag-and-drop area),
 * 'tile' (a grid cell) or 'frame' (a single-image slot — an SVG-stroked dashed
 * outline with a soft corner).
 */
const Dropzone = ({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  label = 'Add files',
  variant = 'panel',
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

  // 'frame' — the single-image slot (logo, favicon, branch logo). A CSS dashed
  // border draws whatever dash length the browser feels like at 1.5px, so the
  // outline is stroked as an SVG instead: one long dash, one clear gap, the
  // same on every browser.
  const dashed =
    variant === 'frame'
      ? {
          border: 0,
          borderRadius: `${FRAME_RADIUS}px`,
          backgroundColor: active ? surface.goldFaint : 'transparent',
          backgroundImage: frameOutline(active ? brand.gold : brand.line),
          transition: 'background-image .18s ease, background-color .18s ease',
          '&:hover': { backgroundImage: frameOutline(disabled ? brand.line : brand.gold) },
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
