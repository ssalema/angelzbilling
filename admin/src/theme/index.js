import { createTheme, alpha } from '@mui/material/styles';

// Angelz Desire brand system.

export const brand = {
  plum: '#3E2545',
  plumLight: '#5C3D64',
  plumDark: '#2A1730',
  gold: '#C0952F',
  goldLight: '#DCBB6A',
  goldDark: '#96721F',
  rose: '#B98A7A',
  ivory: '#FAF7F2',
  ivoryDeep: '#F2ECE3',
  ink: '#241826',
  inkSoft: '#6B5C70',
  line: '#E8DFD2',
};

// Surface tints — the faint washes used for hover rows, avatar wells, icon halos and selected states.
export const surface = {
  plumFaint: alpha(brand.plum, 0.04),
  plumSoft: alpha(brand.plum, 0.06),
  plumMuted: alpha(brand.plum, 0.09),
  goldFaint: alpha(brand.gold, 0.05),
  goldSoft: alpha(brand.gold, 0.14),
  successSoft: alpha('#1E6B4F', 0.1),
  errorSoft: alpha('#9B2C2C', 0.1),
  // Ivory wash for inset panels; ink overlay for badges laid over an image.
  ivoryWash: alpha(brand.ivory, 0.7),
  // The topbar frosts over the page, so it needs a heavier ivory than a panel.
  ivoryBar: alpha(brand.ivory, 0.92),
  inkOverlay: alpha(brand.ink, 0.78),
};

// A field that reports a value rather than takes one — Bill by, Branch, the tax
// rate. Tinted on the input itself, since the outlined field paints its own
// white, so it reads as locked beside the fields that do accept typing.
export const readOnlyField = {
  '& .MuiOutlinedInput-root': { backgroundColor: surface.plumFaint },
  '& .MuiOutlinedInput-input': { cursor: 'default' },
};

// The corner a Card turns, in px.
export const CARD_RADIUS = 14;

// The corner a *small* block inside a card turns — a tinted totals well, a collapsed row, a summary strip.
export const INSET_RADIUS = 10;

// Grid gutters.
export const GUTTER = {
  /** Top-level page grid: panels laid side by side. */
  page: 2.5,
  /** A row of equal tiles — stat cards, media slots. */
  cards: 2.25,
  /** Form fields inside a card or dialog. */
  fields: 2,
};

// The bar that sticks to the bottom of a long form carrying its save actions.
export const STICKY_BAR = {
  /** Clear of the viewport edge on a desktop, flush to it on a phone. */
  bottom: { xs: 0, sm: 12 },
  /** Above page content and the sticky summary cards, below the topbar menu. */
  zIndex: 3,
  padding: 2,
};

/** Elevation is a token too, so a toast and a sticky bar cast the same light. */
export const SHADOW = {
  card: `0 1px 2px ${alpha(brand.ink, 0.04)}`,
  toast: `0 8px 24px ${alpha(brand.ink, 0.18)}`,
  sticky: `0 -2px 16px ${alpha(brand.ink, 0.1)}`,
};

export const onPlum = {
  text: 'rgba(255,255,255,0.9)',
  textMuted: 'rgba(255,255,255,0.72)',
  textFaint: 'rgba(255,255,255,0.55)',
  textGhost: 'rgba(255,255,255,0.42)',
  divider: 'rgba(255,255,255,0.1)',
  hover: 'rgba(255,255,255,0.08)',
  selected: alpha(brand.gold, 0.2),
};

// One padding scale for cards, so a panel body sits the same distance from its edge on every screen.
export const CARD_PAD = { xs: 2, sm: 2.5 };

/** The corner every input wears, shared with the controls built to match one. */
export const FIELD_RADIUS = '10px';
export const CARD_HEAD_PAD = { px: { xs: 2, sm: 2.5 }, pt: { xs: 2, sm: 2.25 }, pb: 1.75 };

// The single-image frame — store logo, favicon, branch logo.
export const LOGO_FRAME = {
  height: 176,
  // The frame for a square mark.
  squareHeight: 260,
  /** Breathing room between the dashed drop target and the well inside it. */
  gap: 1.25,
  /** The well's corner, a touch tighter than the dashed frame around it. */
  radius: '6px',
  preview: {
    position: 'absolute',
    inset: 0,
    margin: 'auto',
    maxWidth: '94%',
    maxHeight: '94%',
    objectFit: 'contain',
  },
};

// The five type sizes available outside the Typography variants.
export const FONT = {
  micro: '0.68rem', // eyebrows, dense chips
  tiny: '0.72rem', // chart tooltips, secondary metadata
  small: '0.8rem', // breadcrumbs, dropdown values, toggle buttons
  body: '0.87rem', // matches body2
  lead: '0.95rem', // matches h6 — a figure or name that leads a block
  // Headline figures: a total, a final price, a stat.
  figureSm: '1.05rem',
  figureMd: '1.35rem',
  figureLg: '1.5rem',
};

/** Three icon sizes: inline with text, table action, sidebar nav. */
export const ICON = {
  /** Sits inside a line of text — chip icons, growth arrows. */
  micro: 14,
  /** Beside a label — buttons, adornments, list bullets. */
  inline: 16,
  /** Table row actions and icon buttons. */
  action: 18,
  /** Sidebar navigation and stat card badges. */
  nav: 20,
  /** The single glyph in an empty, error or placeholder state. */
  illustration: 32,
};

export const numericText = {
  fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontWeight: 700,
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums',
};

/** Chart series, ordered so neighbouring slices always contrast. */
export const chartPalette = [
  brand.plum,
  brand.gold,
  brand.rose,
  '#7E9B8A',
  '#8C6A9E',
  '#C97B5A',
  '#5C7C99',
  '#A8894B',
];

export const statusColors = {
  paid: { color: '#1E6B4F', bg: '#E3F3EB' },
  // Money still owed is a "come back to this", not a fault — the same amber
  // low stock wears, rather than error red.
  pending: { color: '#B4801A', bg: '#FBF1DE' },
  refunded: { color: '#5C4B8A', bg: '#EDE9F7' },
  published: { color: '#1E6B4F', bg: '#E3F3EB' },
  draft: { color: '#6B5C70', bg: '#EFEAF1' },
  archived: { color: '#7A6A5A', bg: '#F0EAE1' },
  active: { color: '#1E6B4F', bg: '#E3F3EB' },
  inactive: { color: '#9B2C2C', bg: '#FBE6E6' },
  cancelled: { color: '#9B2C2C', bg: '#FBE6E6' },
  // Stock level is a status like any other, so it wears the same pill.
  in_stock: { color: '#1E6B4F', bg: '#E3F3EB' },
  low_stock: { color: '#B4801A', bg: '#FBF1DE' },
  out_of_stock: { color: '#9B2C2C', bg: '#FBE6E6' },
};

// Money coming off a price is good news.
export const DISCOUNT_COLOR = '#1E6B4F';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: brand.plum,
      light: brand.plumLight,
      dark: brand.plumDark,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: brand.gold,
      light: brand.goldLight,
      dark: brand.goldDark,
      contrastText: '#241826',
    },
    background: { default: brand.ivory, paper: '#FFFFFF' },
    text: { primary: brand.ink, secondary: brand.inkSoft },
    divider: brand.line,
    success: { main: '#1E6B4F' },
    warning: { main: '#B4801A' },
    error: { main: '#9B2C2C' },
    info: { main: brand.plumLight },
  },

  shape: { borderRadius: 12 },

  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    h1: { fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontSize: '2.4rem', letterSpacing: '-0.01em' },
    h2: { fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontSize: '2rem' },
    h3: { fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: '1.65rem' },
    h4: { fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: '1.4rem' },
    h5: { fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.01em' },
    h6: { fontWeight: 700, fontSize: '0.95rem' },
    subtitle2: { fontWeight: 600, fontSize: '0.82rem' },
    body2: { fontSize: '0.87rem' },
    caption: { fontSize: '0.75rem' },
    overline: { fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.12em', lineHeight: 1.8 },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: brand.ivory },
        // Slim, on-brand scrollbars — the default grey ones break the palette.
        '*::-webkit-scrollbar': { width: 9, height: 9 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: alpha(brand.plum, 0.22),
          borderRadius: 8,
          '&:hover': { backgroundColor: alpha(brand.plum, 0.38) },
        },
        // The bill prints as an 80mm thermal slip, so the page is the roll.
        '@page': { size: '80mm auto', margin: '4mm' },
        '@media print': {
          'body *': { visibility: 'hidden' },
          '#print-area, #print-area *': { visibility: 'visible' },
          '#print-area': { position: 'absolute', left: 0, top: 0, width: '100%' },
          '.no-print': { display: 'none !important' },
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: CARD_RADIUS },
      },
    },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: `1px solid ${brand.line}`,
          borderRadius: CARD_RADIUS,
          boxShadow: SHADOW.card,
        },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: FIELD_RADIUS, paddingInline: 18, minHeight: 40 },
        contained: {
          '&.Mui-disabled': { color: '#fff', backgroundColor: alpha(brand.plum, 0.55) },
          '&.Mui-disabled .MuiCircularProgress-root': { color: '#fff' },
        },
        containedPrimary: {
          '&:hover': { backgroundColor: brand.plumDark },
          '&.Mui-disabled': { color: '#fff', backgroundColor: alpha(brand.plum, 0.55) },
        },
        containedSecondary: {
          color: brand.ink,
          '&:hover': { backgroundColor: brand.goldDark, color: '#fff' },
          '&.Mui-disabled': { color: '#fff', backgroundColor: alpha(brand.goldDark, 0.6) },
        },
        containedError: {
          '&.Mui-disabled': { color: '#fff', backgroundColor: alpha('#9B2C2C', 0.55) },
        },
        containedSuccess: {
          '&.Mui-disabled': { color: '#fff', backgroundColor: alpha('#1E6B4F', 0.55) },
        },
        // Outlined and text buttons sit on ivory, so white would vanish there —
        // they get a dimmed plum instead, which their spinners inherit.
        outlined: {
          borderColor: brand.line,
          '&:hover': { borderColor: brand.plum },
          '&.Mui-disabled': { color: alpha(brand.plum, 0.55), borderColor: brand.line },
          '&.Mui-disabled .MuiCircularProgress-root': { color: alpha(brand.plum, 0.55) },
        },
        text: {
          '&.Mui-disabled': { color: alpha(brand.plum, 0.5) },
          '&.Mui-disabled .MuiCircularProgress-root': { color: alpha(brand.plum, 0.5) },
        },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 7, fontWeight: 600, fontSize: '0.74rem' },
        sizeSmall: { height: 22 },
      },
    },

    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiSelect: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: FIELD_RADIUS,
          backgroundColor: '#fff',
          '& fieldset': { borderColor: brand.line },
          '&:hover fieldset': { borderColor: alpha(brand.plum, 0.4) },
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: brand.line, paddingBlock: 12 },
        head: {
          backgroundColor: brand.ivoryDeep,
          color: brand.inkSoft,
          fontWeight: 700,
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: { '&:hover': { backgroundColor: alpha(brand.gold, 0.05) } },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: brand.plumDark, fontSize: '0.74rem', borderRadius: 8, padding: '6px 10px' },
        arrow: { color: brand.plumDark },
      },
    },

    MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 10, alignItems: 'center' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 46 } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiSkeleton: { styleOverrides: { root: { backgroundColor: alpha(brand.plum, 0.07) } } },
  },
});

export default theme;

