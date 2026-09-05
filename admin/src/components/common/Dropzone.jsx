import { useRef, useState } from 'react';
import { Box } from '@mui/material';
import { surface } from '../../theme/index.js';

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

  const dashed = {
    border: '1.5px dashed',
    borderColor: dragging && !disabled ? 'secondary.main' : 'divider',
    bgcolor: dragging && !disabled ? surface.goldFaint : 'transparent',
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
