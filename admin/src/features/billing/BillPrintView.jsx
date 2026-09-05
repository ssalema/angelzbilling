import { forwardRef } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import { formatDate } from '../../utils/format.js';
import { PAYMENT_METHOD_LABELS } from '../../utils/constants.js';
import { DEFAULT_DIAL_CODE, formatContactNumber } from '../../utils/countries.js';
import { brand } from '../../theme/index.js';

/**
 * The printable bill — a thermal receipt slip, not an A4 invoice.
 *
 * Wrapped in `#print-area`, which the global print stylesheet isolates, so
 * `window.print()` from anywhere in the app produces just this slip on an
 * 80mm roll with no sidebar, buttons or chrome.
 */

/** Settings arrive flattened from /bills/:id and nested from /settings — accept both. */
const readShop = (store, bill) => {
  const s = store || bill?.store || {};
  return {
    name: s.siteName || 'Angelz Perfume',
    tagline: s.tagline || 'More than a fragrance',
    logo: s.logo || s.branding?.logo?.url || '',
    address: s.companyAddress || '',
    phone: s.contactNumber || '',
    phoneCountryCode: s.contactNumberCountryCode || DEFAULT_DIAL_CODE,
    email: s.contactEmail || '',
    gstin: s.gstin || '',
    footer: s.invoiceFooter || s.billing?.invoiceFooter || 'Keep Smelling Amazing!',
    terms: s.termsAndConditions || s.billing?.termsAndConditions || '',
  };
};

/** Line columns carry no symbol — their headers already say (₹). */
const money = (value) =>
  Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Browsers drop background fills when printing — the black stamps must opt back in. */
const KEEP_FILL = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

const RULE = { borderTop: `1px solid ${brand.ink}`, opacity: 0.18 };
const DASHED = { borderTop: `1.5px dashed ${brand.ink}`, opacity: 0.28 };

const BillPrintView = forwardRef(({ bill, store }, ref) => {
  if (!bill) return null;

  const shop = readShop(store, bill);
  const branch = bill.branch || {};
  const isPaid = (bill.status || 'paid') === 'paid';

  // A bill rung up at a branch prints that branch's identity, not head office's —
  // except for the address, which always comes from the store's companyAddress
  // setting so every slip carries one consistently formatted address. The branch
  // snapshot is machine-joined from address parts and would otherwise render in a
  // different style on branch bills than on head-office ones.
  const address = shop.address || branch.address;
  const phone = branch.phone
    ? formatContactNumber(branch.phoneCountryCode, branch.phone, '')
    : formatContactNumber(shop.phoneCountryCode, shop.phone, '');
  const gstin = branch.gstin || shop.gstin;
  const logo = branch.logo || shop.logo;

  return (
    <Box
      id="print-area"
      ref={ref}
      sx={{
        maxWidth: 360,
        mx: 'auto',
        bgcolor: '#fff',
        color: brand.ink,
        fontSize: '0.78rem',
        boxShadow: '0 10px 30px rgba(36,24,38,0.10)',
        // The slip is laid out in px; zoom scales type and column widths together,
        // so 360px lands at exactly 72mm of a 80mm roll.
        '@media print': { width: 360, maxWidth: 'none', zoom: 0.756, boxShadow: 'none' },
      }}
    >
      <Box sx={{ px: 2.5, pt: 3, pb: 2 }}>
        {/* ── Masthead ── */}
        <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
          {logo ? (
            <Box component="img" src={logo} alt={shop.name} sx={{ height: 40 }} />
          ) : (
            <BottleMark />
          )}
          <Typography
            component="span"
            sx={{
              fontFamily: "'Cormorant Garamond', serif",
              fontWeight: 700,
              fontSize: '2.1rem',
              lineHeight: 1,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {shop.name}
          </Typography>
        </Stack>

        <Typography
          sx={{
            mt: 0.75,
            textAlign: 'center',
            fontSize: '0.6rem',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: brand.inkSoft,
          }}
        >
          {shop.tagline}
        </Typography>

        <Box sx={{ ...RULE, my: 1.25 }} />

        {/* ── Contact ── */}
        <Stack spacing={0.4} sx={{ alignItems: 'center' }}>
          {address && (
            <ContactLine>
              <PinIcon />
              {address}
            </ContactLine>
          )}
          {(phone || shop.email) && (
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap">
              {phone && (
                <ContactLine>
                  <PhoneIcon />
                  {phone}
                </ContactLine>
              )}
              {shop.email && (
                <ContactLine>
                  <MailIcon />
                  {shop.email}
                </ContactLine>
              )}
            </Stack>
          )}
          {gstin && (
            <Typography sx={{ fontSize: '0.62rem', color: brand.inkSoft, letterSpacing: '0.04em' }}>
              GSTIN: {gstin}
            </Typography>
          )}
        </Stack>

        <Box sx={{ ...DASHED, my: 1.75 }} />

        {/* ── Meta ── */}
        <Box sx={{ minWidth: 0 }}>
          <MetaRow label="Bill No" value={bill.billNumber} strong />
          {bill.customer?.name && <MetaRow label="Customer" value={bill.customer.name} />}
          {bill.customer?.mobile && (
            <MetaRow
              label="Contact"
              value={formatContactNumber(bill.customer.mobileCountryCode, bill.customer.mobile)}
            />
          )}
          <MetaRow
            label="Date"
            value={`${formatDate(bill.createdAt, 'medium')}, ${formatDate(bill.createdAt, 'clock').toUpperCase()}`}
          />
          <MetaRow label="Bill By" value={bill.billedBy?.name || '—'} />
        </Box>

        <Box sx={{ ...DASHED, my: 1.75 }} />

        {/* ── Lines ── */}
        <Row sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: brand.inkSoft }}>
          <span>#</span>
          <span>PERFUME</span>
          <span style={{ textAlign: 'center' }}>QTY</span>
          <span style={{ textAlign: 'right' }}>PRICE (₹)</span>
          <span style={{ textAlign: 'right' }}>AMOUNT (₹)</span>
        </Row>

        <Box sx={{ ...RULE, mt: 0.75 }} />

        {bill.items?.map((item, index) => (
          <Row key={`${item.sku}-${item.variantSku}-${index}`} sx={{ py: 1, alignItems: 'flex-start' }}>
            <span style={{ color: brand.inkSoft }}>{index + 1}</span>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.3 }}>
                {item.perfumeName}
              </Typography>
              {item.variantLabel && (
                <Typography sx={{ fontSize: '0.62rem', color: brand.inkSoft, lineHeight: 1.4 }}>
                  {item.variantLabel}
                </Typography>
              )}
            </Box>
            <span style={{ textAlign: 'center' }}>{item.quantity}</span>
            <span style={{ textAlign: 'right' }}>{money(item.unitPrice)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{money(item.lineTotal)}</span>
          </Row>
        ))}

        <Box sx={{ ...DASHED, my: 1.5 }} />

        {/* ── Totals ── */}
        <Box sx={{ pl: '32%' }}>
          <TotalRow label="Subtotal" value={`₹ ${money(bill.subtotal)}`} />
          {bill.totalDiscount > 0 && <TotalRow label="Discount" value={`- ₹ ${money(bill.totalDiscount)}`} />}
          {bill.taxAmount > 0 && (
            <TotalRow label={`Tax (${bill.taxPercent}%)`} value={`₹ ${money(bill.taxAmount)}`} />
          )}

          <Box sx={{ ...RULE, my: 1, opacity: 0.35 }} />

          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em' }}>TOTAL</Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700 }}>₹ {money(bill.grandTotal)}</Typography>
          </Stack>
        </Box>

        {/* ── Payment ── */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ mt: 2, p: 1.25, borderRadius: 1, border: `1px solid ${brand.line}`, bgcolor: brand.ivory, ...KEEP_FILL }}
        >
          <Box sx={{ minWidth: 0 }}>
            <MetaRow
              label="Payment Mode"
              value={PAYMENT_METHOD_LABELS[bill.paymentMethod] || bill.paymentMethod}
              width={bill.transactionId ? 104 : 'auto'}
              nowrap
            />
            {bill.transactionId && (
              <MetaRow label="Transaction ID" value={bill.transactionId} width={104} nowrap />
            )}
          </Box>

          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{
              flexShrink: 0,
              bgcolor: isPaid ? brand.ink : brand.goldDark,
              ...KEEP_FILL,
              color: '#fff',
              px: 1.25,
              py: 0.65,
              borderRadius: 0.75,
            }}
          >
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em' }}>
              {(bill.status || 'paid').toUpperCase()}
            </Typography>
            {isPaid && <TickIcon />}
          </Stack>
        </Stack>

        {/* ── Sign-off ── */}
        <Box sx={{ textAlign: 'center', mt: 2.5 }}>
          <Typography
            sx={{ fontFamily: "'Great Vibes', 'Cormorant Garamond', cursive", fontSize: '2.2rem', lineHeight: 1.1 }}
          >
            Thank You!
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: '0.8rem', fontWeight: 600 }}>{shop.footer}</Typography>
          {shop.terms && (
            <Typography sx={{ mt: 1, fontSize: '0.58rem', color: brand.inkSoft, whiteSpace: 'pre-line' }}>
              {shop.terms}
            </Typography>
          )}
        </Box>

        <Box sx={{ ...RULE, mt: 2 }} />

        {/* ── Trust badges ── */}
        <Stack direction="row" sx={{ pt: 1.5 }}>
          <Badge icon={<BottleGlyph />} label={'Original\nPerfumes'} />
          <Badge icon={<GiftGlyph />} label={'Great\nFragrances'} divider />
          <Badge icon={<HeartGlyph />} label={'Happy\nCustomers'} divider />
        </Stack>
      </Box>
    </Box>
  );
});

/** The 5-column grid the header and every line share, so they always align. */
const Row = ({ children, sx }) => (
  <Box
    sx={{
      display: 'grid',
      gridTemplateColumns: '18px 1fr 30px 66px 78px',
      columnGap: 0.75,
      alignItems: 'center',
      ...sx,
    }}
  >
    {children}
  </Box>
);

const MetaRow = ({ label, value, strong, width = 74, nowrap }) => (
  <Stack direction="row" sx={{ py: 0.15, fontSize: '0.72rem' }}>
    <Box
      sx={{
        width,
        flexShrink: 0,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        ...(nowrap ? { whiteSpace: 'nowrap' } : {}),
      }}
    >
      {label}
    </Box>
    <Box sx={{ px: 0.5, color: brand.inkSoft }}>:</Box>
    <Box sx={{ fontWeight: strong ? 700 : 500, minWidth: 0, wordBreak: 'break-word' }}>{value}</Box>
  </Stack>
);

const TotalRow = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between" sx={{ py: 0.3, fontSize: '0.72rem' }}>
    <Box sx={{ letterSpacing: '0.08em', textTransform: 'uppercase', color: brand.inkSoft }}>{label}</Box>
    <Box sx={{ fontWeight: 600 }}>{value}</Box>
  </Stack>
);

const ContactLine = ({ children }) => (
  <Stack direction="row" spacing={0.6} alignItems="center" sx={{ fontSize: '0.68rem', textAlign: 'center' }}>
    {children}
  </Stack>
);

const Badge = ({ icon, label, divider }) => (
  <Box sx={{ flex: 1, textAlign: 'center', px: 0.5, borderLeft: divider ? `1px solid ${brand.line}` : 'none' }}>
    {icon}
    <Typography sx={{ mt: 0.4, fontSize: '0.55rem', color: brand.inkSoft, whiteSpace: 'pre-line', lineHeight: 1.3 }}>
      {label}
    </Typography>
  </Box>
);

/* ── Glyphs: inline SVG, so the slip prints identically without an icon font ── */

const BottleMark = () => (
  <svg width="30" height="42" viewBox="0 0 30 42" fill="none" aria-hidden="true">
    <rect x="11" y="1" width="8" height="6" rx="1.5" fill="currentColor" />
    <rect x="13" y="7" width="4" height="4" fill="currentColor" />
    <rect x="2.5" y="11" width="25" height="30" rx="5" stroke="currentColor" strokeWidth="2.5" />
    <rect x="8" y="19" width="8" height="14" rx="2" fill="currentColor" />
  </svg>
);

const BottleGlyph = () => (
  <svg width="17" height="22" viewBox="0 0 30 42" fill="none" aria-hidden="true">
    <rect x="11" y="1" width="8" height="6" rx="1.5" fill="currentColor" />
    <rect x="13" y="7" width="4" height="4" fill="currentColor" />
    <rect x="2.5" y="11" width="25" height="30" rx="5" stroke="currentColor" strokeWidth="2.5" />
  </svg>
);

const GiftGlyph = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <rect x="2.5" y="8.5" width="19" height="12.5" rx="1.5" />
    <path d="M2.5 12.5h19M12 8.5V21" />
    <path d="M12 8.5S9.5 3 7 4.2s-.2 4.3 5 4.3zM12 8.5S14.5 3 17 4.2s.2 4.3-5 4.3z" />
  </svg>
);

const HeartGlyph = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M12 20.5 3.8 12.4a4.9 4.9 0 0 1 7-6.9l1.2 1.2 1.2-1.2a4.9 4.9 0 0 1 7 6.9z" />
  </svg>
);

const PinIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
  </svg>
);

const PhoneIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .6 3.6 1 1 0 0 1-.25 1z" />
  </svg>
);

const MailIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z" />
  </svg>
);

const TickIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.6-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4z" />
  </svg>
);

BillPrintView.displayName = 'BillPrintView';

export default BillPrintView;
