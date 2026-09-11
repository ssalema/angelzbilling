import { Chip } from '@mui/material';
import { statusColors } from '../../theme/index.js';

/** Consistent status pill across bills, perfumes, users and branches. */
const StatusChip = ({ status, label, size = 'small', sx, onClick, ...rest }) => {
  const key = String(status || '').toLowerCase();
  const tone = statusColors[key] || { color: '#6B5C70', bg: '#EFEAF1' };

  // The pill doubles as the status toggle, and it usually sits in a row that opens an edit dialog when clicked.
  const handleClick = onClick
    ? (event) => {
        event.stopPropagation();
        onClick(event);
      }
    : undefined;

  return (
    <Chip
      size={size}
      label={label || (key ? key[0].toUpperCase() + key.slice(1) : 'NA')}
      {...rest}
      onClick={handleClick}
      sx={{
        color: tone.color,
        backgroundColor: tone.bg,
        border: `1px solid ${tone.color}22`,
        fontWeight: 700,
        // A clickable pill doubles as the status toggle, so it has to look tappable.
        ...(onClick ? { cursor: 'pointer', '&:hover': { filter: 'brightness(0.95)' } } : null),
        ...sx,
      }}
    />
  );
};

export default StatusChip;
