import { forwardRef } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import { formatAmount, formatDate, currencySymbol } from '../../utils/format.js';
import { PAYMENT_METHOD_LABELS, HEAD_OFFICE } from '../../utils/constants.js';
import { formatContactNumber } from '../../utils/countries.js';
import { brand } from '../../theme/index.js';
import { IMG } from '../../utils/image.js';
import { cachedSiteName } from '../../utils/branding.js';
import { splitGst } from './billSchema.js';

// Printable bill: a thermal receipt slip, not an A4 invoice.

/** Settings come flat from /bills/:id and nested from /settings; accept both. */
const readShop = (store, bill) => {
  const s = store || bill?.store || {};
  return {
    name: s.siteName || cachedSiteName(),
    // No hardcoded fallbacks: the tagline and footer are the store's own text.
    tagline: s.tagline || '',
    favicon: s.favicon || s.branding?.favicon?.url || '',
    gstin: s.gstin || '',
    footer: s.invoiceFooter || s.billing?.invoiceFooter || '',
    terms: s.termsAndConditions || s.billing?.termsAndConditions || '',
    // Falls back to the app's current currency so a reprint matches the screen.
    currency: s.currencySymbol || s.billing?.currencySymbol || currencySymbol(),
    branchesEnabled: s.features?.branches !== false,
  };
};

/** Line columns carry no symbol — their headers already name the currency. */
const money = (value) => formatAmount(value);

/** How a collected instalment is dated on the slip: "06 Sept 2026, 04:49 PM". */
const stamp = (at) => `${formatDate(at, 'medium')}, ${formatDate(at, 'clock').toUpperCase()}`;

/** "upi" → "UPI". Unknown codes print as stored. */
const methodLabel = (method) => PAYMENT_METHOD_LABELS[method] || method || '';

/** Browsers drop background colors when printing, so the black stamps opt back in. */
const KEEP_FILL = { WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

const RULE = { borderTop: `1px solid ${brand.ink}`, opacity: 0.18 };
const DASHED = { borderTop: `1.5px dashed ${brand.ink}`, opacity: 0.28 };

const BillPrintView = forwardRef(({ bill, store }, ref) => {
  if (!bill) return null;

  const shop = readShop(store, bill);
  const cur = shop.currency;
  // Tax is printed the way it is charged: half CGST, half SGST.
  const gst = splitGst(bill.taxPercent, bill.taxAmount);
  const branch = bill.branch || {};
  const isPaid = (bill.status || 'paid') === 'paid';
  // Old bills (before part payments) have no balance field and were paid in full.
  const amountDue = Number(bill.amountDue || 0);
  // Oldest payment first.
  const instalments = [...(bill.payments || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  const showInstalments = amountDue > 0 || instalments.length > 1;

  const latestMethod = instalments.length ? instalments[instalments.length - 1].method : '';
  const modeValue = methodLabel(latestMethod || bill.paymentMethod);

  // Branch bills print the branch's GSTIN, not head office's.
  const gstin = branch.gstin || shop.gstin;
  // Location name, shown under the biller.
  const location = shop.branchesEnabled ? branch.name || HEAD_OFFICE.name : '';
  // Only the favicon is printed as the logo; nothing if none is uploaded.
  const mark = shop.favicon;

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
        // Laid out in px; zoom scales it so 360px = 72mm on an 80mm roll.
        '@media print': { width: 360, maxWidth: 'none', zoom: 0.756, boxShadow: 'none' },
      }}
    >
      <Box sx={{ px: 2.5, pt: 3, pb: 2 }}>
        {mark && (
          <Stack direction="row" alignItems="center" justifyContent="center">
            <Box component="img" src={IMG.print(mark)} alt={shop.name} sx={{ height: 70 }} />
          </Stack>
        )}

        {shop.tagline && (
          <Typography
            sx={{
              mt: mark ? 0.75 : 0,
              textAlign: 'center',
              fontSize: '0.6rem',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: brand.inkSoft,
            }}
          >
            {shop.tagline}
          </Typography>
        )}

        {gstin && (
          <>
            <Box sx={{ ...RULE, my: 1.25 }} />
            <Typography
              sx={{ textAlign: 'center', fontSize: '0.62rem', color: brand.inkSoft, letterSpacing: '0.04em' }}
            >
              GSTIN: {gstin}
            </Typography>
          </>
        )}

        <Box sx={{ ...DASHED, my: 1.75 }} />

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
          <MetaRow
            label="Bill By"
            value={`${bill.billedBy?.name || 'NA'}${location ? ` (${location})` : ''}`}
          />
        </Box>

        <Box sx={{ ...DASHED, my: 1.75 }} />

        <Row sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', color: brand.inkSoft }}>
          <span>#</span>
          <span>PERFUME</span>
          <span style={{ textAlign: 'center' }}>SIZE</span>
          <span style={{ textAlign: 'center' }}>QTY</span>
          <span style={{ textAlign: 'right' }}>{`PRICE (${cur})`}</span>
          <span style={{ textAlign: 'right' }}>{`AMOUNT (${cur})`}</span>
        </Row>

        <Box sx={{ ...RULE, mt: 0.75 }} />

        {bill.items?.map((item, index) => (
          <Row key={`${item.sku}-${item.variantSku}-${index}`} sx={{ py: 1, alignItems: 'flex-start' }}>
            <span style={{ color: brand.inkSoft }}>{index + 1}</span>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, lineHeight: 1.3 }}>
                {item.perfumeName}
              </Typography>
            </Box>
            <span style={{ textAlign: 'center', color: brand.inkSoft }}>{item.variantLabel || '—'}</span>
            <span style={{ textAlign: 'center' }}>{item.quantity}</span>
            <span style={{ textAlign: 'right' }}>{money(item.unitPrice)}</span>
            <span style={{ textAlign: 'right', fontWeight: 700 }}>{money(item.lineTotal)}</span>
          </Row>
        ))}

        <Box sx={{ ...DASHED, my: 1.5 }} />

        <Box sx={{ pl: '32%' }}>
          <TotalRow label="Subtotal" value={`${cur} ${money(bill.subtotal)}`} />
          {bill.totalDiscount > 0 && <TotalRow label="Discount" value={`- ${cur} ${money(bill.totalDiscount)}`} />}
          {bill.taxAmount > 0 && (
            <>
              <TotalRow label={`CGST (${gst.half}%)`} value={`${cur} ${money(gst.cgst)}`} />
              <TotalRow label={`SGST (${gst.half}%)`} value={`${cur} ${money(gst.sgst)}`} />
            </>
          )}

          <Box sx={{ ...RULE, my: 1, opacity: 0.35 }} />

          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em' }}>TOTAL</Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700 }}>{`${cur} ${money(bill.grandTotal)}`}</Typography>
          </Stack>

          {/* Instalment bills list each payment on its own line so the customer can match
              receipts. A bill paid in one go keeps the plain TOTAL. */}
          {showInstalments && (
            <>
              <Box sx={{ ...RULE, my: 1, opacity: 0.35 }} />
              {instalments.map((entry, index) => (
                <TotalRow
                  key={entry._id || `${entry.at}-${index}`}
                  label={entry.atBilling ? 'Paid (During Billing)' : `Paid (${stamp(entry.at)})`}
                  value={`${cur} ${money(entry.amount)}`}
                  plain
                />
              ))}

              {amountDue > 0 ? (
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ pt: 0.3 }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em' }}>
                    BALANCE DUE
                  </Typography>
                  <Typography sx={{ fontSize: '0.88rem', fontWeight: 700 }}>{`${cur} ${money(amountDue)}`}</Typography>
                </Stack>
              ) : (
                <TotalRow label="Balance Due" value={`${cur} ${money(0)}`} />
              )}
            </>
          )}
        </Box>

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
              value={modeValue}
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
            {isPaid && <TickIcon color="#fff" mark={brand.ink} />}
          </Stack>
        </Stack>

        <Box sx={{ textAlign: 'center', mt: 2.5 }}>
          <Typography
            sx={{ fontFamily: "'Great Vibes', 'Cormorant Garamond', cursive", fontSize: '2.2rem', lineHeight: 1.1 }}
          >
            Thank You!
          </Typography>
          {shop.footer && (
            <Typography sx={{ mt: 0.5, fontSize: '0.8rem', fontWeight: 600 }}>{shop.footer}</Typography>
          )}
          {shop.terms && (
            <Typography sx={{ mt: 1, fontSize: '0.58rem', color: brand.inkSoft, whiteSpace: 'pre-line' }}>
              {shop.terms}
            </Typography>
          )}
        </Box>

        <Box sx={{ ...RULE, mt: 2 }} />

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
      gridTemplateColumns: '16px 1fr 40px 26px 60px 72px',
      columnGap: 0.6,
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

// `plain` drops the uppercase tracking for labels that carry a date.
const TotalRow = ({ label, value, plain }) => (
  <Stack
    direction="row"
    justifyContent="space-between"
    spacing={1}
    sx={{ py: 0.3, fontSize: plain ? '0.62rem' : '0.72rem' }}
  >
    <Box
      sx={
        plain
          ? { color: brand.inkSoft, minWidth: 0 }
          : { letterSpacing: '0.08em', textTransform: 'uppercase', color: brand.inkSoft }
      }
    >
      {label}
    </Box>
    <Box sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{value}</Box>
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

const GLYPH = { display: 'inline-block', flexShrink: 0, overflow: 'visible' };

const BottleGlyph = () => (
  <svg width="17" height="22" viewBox="0 0 30 42" fill="none" aria-hidden="true" style={GLYPH}>
    <rect x="11" y="1" width="8" height="6" rx="1.5" fill={brand.ink} />
    <rect x="13" y="7" width="4" height="4" fill={brand.ink} />
    <rect x="2.5" y="11" width="25" height="30" rx="5" stroke={brand.ink} strokeWidth="2.5" />
  </svg>
);

const GiftGlyph = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={brand.ink} strokeWidth="1.6" aria-hidden="true" style={GLYPH}>
    <rect x="2.5" y="8.5" width="19" height="12.5" rx="1.5" />
    <path d="M2.5 12.5h19M12 8.5V21" />
    <path d="M12 8.5S9.5 3 7 4.2s-.2 4.3 5 4.3zM12 8.5S14.5 3 17 4.2s.2 4.3-5 4.3z" />
  </svg>
);

const HeartGlyph = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={brand.ink} strokeWidth="1.6" aria-hidden="true" style={GLYPH}>
    <path d="M12 20.5 3.8 12.4a4.9 4.9 0 0 1 7-6.9l1.2 1.2 1.2-1.2a4.9 4.9 0 0 1 7 6.9z" />
  </svg>
);

// Status stamp tick, drawn the same on screen, paper and PDF.
const TickIcon = ({ color = '#fff', mark = brand.ink }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
  >
    <circle cx="12" cy="12" r="10" fill={color} />
    <path
      d="M7.4 12.4 10.6 15.6 16.8 9.4"
      fill="none"
      stroke={mark}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

BillPrintView.displayName = 'BillPrintView';

export default BillPrintView;
