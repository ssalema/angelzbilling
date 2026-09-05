/**
 * Country dialling codes for every contact-number field in the app.
 *
 * The same file lives in `admin/src/utils` and `server/src/utils` so the browser
 * and the API agree on which numbers are valid — edit both together.
 *
 * Each row is [name, iso2, dial, minDigits, maxDigits, primary?] where the digit
 * counts describe the *national* number, i.e. what is typed after the dial code.
 * India is a fixed 10, the US and Canada a fixed 10, Germany a range, and so on.
 */

const ROWS = [
  ['Afghanistan', 'AF', '+93', 9, 9],
  ['Albania', 'AL', '+355', 8, 9],
  ['Algeria', 'DZ', '+213', 8, 9],
  ['American Samoa', 'AS', '+1684', 7, 7],
  ['Andorra', 'AD', '+376', 6, 9],
  ['Angola', 'AO', '+244', 9, 9],
  ['Anguilla', 'AI', '+1264', 7, 7],
  ['Antigua and Barbuda', 'AG', '+1268', 7, 7],
  ['Argentina', 'AR', '+54', 10, 11],
  ['Armenia', 'AM', '+374', 8, 8],
  ['Aruba', 'AW', '+297', 7, 7],
  ['Australia', 'AU', '+61', 9, 9],
  ['Austria', 'AT', '+43', 7, 13],
  ['Azerbaijan', 'AZ', '+994', 9, 9],
  ['Bahamas', 'BS', '+1242', 7, 7],
  ['Bahrain', 'BH', '+973', 8, 8],
  ['Bangladesh', 'BD', '+880', 10, 10],
  ['Barbados', 'BB', '+1246', 7, 7],
  ['Belarus', 'BY', '+375', 9, 9],
  ['Belgium', 'BE', '+32', 8, 9],
  ['Belize', 'BZ', '+501', 7, 7],
  ['Benin', 'BJ', '+229', 8, 10],
  ['Bermuda', 'BM', '+1441', 7, 7],
  ['Bhutan', 'BT', '+975', 7, 8],
  ['Bolivia', 'BO', '+591', 8, 8],
  ['Bosnia and Herzegovina', 'BA', '+387', 8, 8],
  ['Botswana', 'BW', '+267', 7, 8],
  ['Brazil', 'BR', '+55', 10, 11],
  ['British Indian Ocean Territory', 'IO', '+246', 7, 7],
  ['British Virgin Islands', 'VG', '+1284', 7, 7],
  ['Brunei', 'BN', '+673', 7, 7],
  ['Bulgaria', 'BG', '+359', 8, 9],
  ['Burkina Faso', 'BF', '+226', 8, 8],
  ['Burundi', 'BI', '+257', 8, 8],
  ['Cambodia', 'KH', '+855', 8, 9],
  ['Cameroon', 'CM', '+237', 9, 9],
  ['Canada', 'CA', '+1', 10, 10],
  ['Cape Verde', 'CV', '+238', 7, 7],
  ['Cayman Islands', 'KY', '+1345', 7, 7],
  ['Central African Republic', 'CF', '+236', 8, 8],
  ['Chad', 'TD', '+235', 8, 8],
  ['Chile', 'CL', '+56', 9, 9],
  ['China', 'CN', '+86', 11, 11],
  ['Colombia', 'CO', '+57', 10, 10],
  ['Comoros', 'KM', '+269', 7, 7],
  ['Congo (Brazzaville)', 'CG', '+242', 9, 9],
  ['Congo (Kinshasa)', 'CD', '+243', 9, 9],
  ['Cook Islands', 'CK', '+682', 5, 5],
  ['Costa Rica', 'CR', '+506', 8, 8],
  ['Croatia', 'HR', '+385', 8, 9],
  ['Cuba', 'CU', '+53', 8, 8],
  ['Curacao', 'CW', '+599', 7, 8],
  ['Cyprus', 'CY', '+357', 8, 8],
  ['Czechia', 'CZ', '+420', 9, 9],
  ['Denmark', 'DK', '+45', 8, 8],
  ['Djibouti', 'DJ', '+253', 8, 8],
  ['Dominica', 'DM', '+1767', 7, 7],
  ['Dominican Republic', 'DO', '+1809', 7, 7],
  ['Ecuador', 'EC', '+593', 8, 9],
  ['Egypt', 'EG', '+20', 9, 10],
  ['El Salvador', 'SV', '+503', 8, 8],
  ['Equatorial Guinea', 'GQ', '+240', 9, 9],
  ['Eritrea', 'ER', '+291', 7, 7],
  ['Estonia', 'EE', '+372', 7, 8],
  ['Eswatini', 'SZ', '+268', 8, 8],
  ['Ethiopia', 'ET', '+251', 9, 9],
  ['Falkland Islands', 'FK', '+500', 5, 5],
  ['Faroe Islands', 'FO', '+298', 6, 6],
  ['Fiji', 'FJ', '+679', 7, 7],
  ['Finland', 'FI', '+358', 6, 10],
  ['France', 'FR', '+33', 9, 9],
  ['French Guiana', 'GF', '+594', 9, 9],
  ['French Polynesia', 'PF', '+689', 6, 8],
  ['Gabon', 'GA', '+241', 7, 8],
  ['Gambia', 'GM', '+220', 7, 7],
  ['Georgia', 'GE', '+995', 9, 9],
  ['Germany', 'DE', '+49', 6, 11],
  ['Ghana', 'GH', '+233', 9, 9],
  ['Gibraltar', 'GI', '+350', 8, 8],
  ['Greece', 'GR', '+30', 10, 10],
  ['Greenland', 'GL', '+299', 6, 6],
  ['Grenada', 'GD', '+1473', 7, 7],
  ['Guadeloupe', 'GP', '+590', 9, 9, true],
  ['Guam', 'GU', '+1671', 7, 7],
  ['Guatemala', 'GT', '+502', 8, 8],
  ['Guernsey', 'GG', '+44', 10, 10],
  ['Guinea', 'GN', '+224', 9, 9],
  ['Guinea-Bissau', 'GW', '+245', 7, 9],
  ['Guyana', 'GY', '+592', 7, 7],
  ['Haiti', 'HT', '+509', 8, 8],
  ['Honduras', 'HN', '+504', 8, 8],
  ['Hong Kong', 'HK', '+852', 8, 8],
  ['Hungary', 'HU', '+36', 9, 9],
  ['Iceland', 'IS', '+354', 7, 7],
  ['India', 'IN', '+91', 10, 10],
  ['Indonesia', 'ID', '+62', 9, 12],
  ['Iran', 'IR', '+98', 10, 10],
  ['Iraq', 'IQ', '+964', 10, 10],
  ['Ireland', 'IE', '+353', 7, 9],
  ['Isle of Man', 'IM', '+44', 10, 10],
  ['Israel', 'IL', '+972', 9, 9],
  ['Italy', 'IT', '+39', 9, 11, true],
  ['Ivory Coast', 'CI', '+225', 10, 10],
  ['Jamaica', 'JM', '+1876', 7, 7],
  ['Japan', 'JP', '+81', 9, 10],
  ['Jersey', 'JE', '+44', 10, 10],
  ['Jordan', 'JO', '+962', 9, 9],
  ['Kazakhstan', 'KZ', '+7', 10, 10],
  ['Kenya', 'KE', '+254', 9, 9],
  ['Kiribati', 'KI', '+686', 5, 8],
  ['Kosovo', 'XK', '+383', 8, 9],
  ['Kuwait', 'KW', '+965', 8, 8],
  ['Kyrgyzstan', 'KG', '+996', 9, 9],
  ['Laos', 'LA', '+856', 8, 10],
  ['Latvia', 'LV', '+371', 8, 8],
  ['Lebanon', 'LB', '+961', 7, 8],
  ['Lesotho', 'LS', '+266', 8, 8],
  ['Liberia', 'LR', '+231', 7, 9],
  ['Libya', 'LY', '+218', 9, 9],
  ['Liechtenstein', 'LI', '+423', 7, 7],
  ['Lithuania', 'LT', '+370', 8, 8],
  ['Luxembourg', 'LU', '+352', 6, 9],
  ['Macau', 'MO', '+853', 8, 8],
  ['Madagascar', 'MG', '+261', 9, 9],
  ['Malawi', 'MW', '+265', 7, 9],
  ['Malaysia', 'MY', '+60', 9, 10],
  ['Maldives', 'MV', '+960', 7, 7],
  ['Mali', 'ML', '+223', 8, 8],
  ['Malta', 'MT', '+356', 8, 8],
  ['Marshall Islands', 'MH', '+692', 7, 7],
  ['Martinique', 'MQ', '+596', 9, 9],
  ['Mauritania', 'MR', '+222', 8, 8],
  ['Mauritius', 'MU', '+230', 7, 8],
  ['Mayotte', 'YT', '+262', 9, 9],
  ['Mexico', 'MX', '+52', 10, 10],
  ['Micronesia', 'FM', '+691', 7, 7],
  ['Moldova', 'MD', '+373', 8, 8],
  ['Monaco', 'MC', '+377', 8, 9],
  ['Mongolia', 'MN', '+976', 8, 8],
  ['Montenegro', 'ME', '+382', 8, 8],
  ['Montserrat', 'MS', '+1664', 7, 7],
  ['Morocco', 'MA', '+212', 9, 9],
  ['Mozambique', 'MZ', '+258', 9, 9],
  ['Myanmar', 'MM', '+95', 8, 10],
  ['Namibia', 'NA', '+264', 9, 9],
  ['Nauru', 'NR', '+674', 7, 7],
  ['Nepal', 'NP', '+977', 10, 10],
  ['Netherlands', 'NL', '+31', 9, 9],
  ['New Caledonia', 'NC', '+687', 6, 6],
  ['New Zealand', 'NZ', '+64', 8, 10],
  ['Nicaragua', 'NI', '+505', 8, 8],
  ['Niger', 'NE', '+227', 8, 8],
  ['Nigeria', 'NG', '+234', 10, 10],
  ['Niue', 'NU', '+683', 4, 4],
  ['Norfolk Island', 'NF', '+672', 6, 6],
  ['North Korea', 'KP', '+850', 4, 10],
  ['North Macedonia', 'MK', '+389', 8, 8],
  ['Northern Mariana Islands', 'MP', '+1670', 7, 7],
  ['Norway', 'NO', '+47', 8, 8],
  ['Oman', 'OM', '+968', 8, 8],
  ['Pakistan', 'PK', '+92', 10, 10],
  ['Palau', 'PW', '+680', 7, 7],
  ['Palestine', 'PS', '+970', 9, 9],
  ['Panama', 'PA', '+507', 8, 8],
  ['Papua New Guinea', 'PG', '+675', 8, 8],
  ['Paraguay', 'PY', '+595', 9, 9],
  ['Peru', 'PE', '+51', 9, 9],
  ['Philippines', 'PH', '+63', 10, 10],
  ['Poland', 'PL', '+48', 9, 9],
  ['Portugal', 'PT', '+351', 9, 9],
  ['Puerto Rico', 'PR', '+1787', 7, 7],
  ['Qatar', 'QA', '+974', 8, 8],
  ['Reunion', 'RE', '+262', 9, 9, true],
  ['Romania', 'RO', '+40', 9, 9],
  ['Russia', 'RU', '+7', 10, 10, true],
  ['Rwanda', 'RW', '+250', 9, 9],
  ['Saint Barthelemy', 'BL', '+590', 9, 9],
  ['Saint Helena', 'SH', '+290', 4, 4],
  ['Saint Kitts and Nevis', 'KN', '+1869', 7, 7],
  ['Saint Lucia', 'LC', '+1758', 7, 7],
  ['Saint Martin', 'MF', '+590', 9, 9],
  ['Saint Pierre and Miquelon', 'PM', '+508', 6, 6],
  ['Saint Vincent and the Grenadines', 'VC', '+1784', 7, 7],
  ['Samoa', 'WS', '+685', 5, 7],
  ['San Marino', 'SM', '+378', 8, 10],
  ['Sao Tome and Principe', 'ST', '+239', 7, 7],
  ['Saudi Arabia', 'SA', '+966', 9, 9],
  ['Senegal', 'SN', '+221', 9, 9],
  ['Serbia', 'RS', '+381', 8, 9],
  ['Seychelles', 'SC', '+248', 7, 7],
  ['Sierra Leone', 'SL', '+232', 8, 8],
  ['Singapore', 'SG', '+65', 8, 8],
  ['Sint Maarten', 'SX', '+1721', 7, 7],
  ['Slovakia', 'SK', '+421', 9, 9],
  ['Slovenia', 'SI', '+386', 8, 8],
  ['Solomon Islands', 'SB', '+677', 5, 7],
  ['Somalia', 'SO', '+252', 7, 9],
  ['South Africa', 'ZA', '+27', 9, 9],
  ['South Korea', 'KR', '+82', 9, 10],
  ['South Sudan', 'SS', '+211', 9, 9],
  ['Spain', 'ES', '+34', 9, 9],
  ['Sri Lanka', 'LK', '+94', 9, 9],
  ['Sudan', 'SD', '+249', 9, 9],
  ['Suriname', 'SR', '+597', 6, 7],
  ['Sweden', 'SE', '+46', 7, 9],
  ['Switzerland', 'CH', '+41', 9, 9],
  ['Syria', 'SY', '+963', 9, 9],
  ['Taiwan', 'TW', '+886', 9, 9],
  ['Tajikistan', 'TJ', '+992', 9, 9],
  ['Tanzania', 'TZ', '+255', 9, 9],
  ['Thailand', 'TH', '+66', 9, 9],
  ['Timor-Leste', 'TL', '+670', 7, 8],
  ['Togo', 'TG', '+228', 8, 8],
  ['Tokelau', 'TK', '+690', 4, 4],
  ['Tonga', 'TO', '+676', 5, 7],
  ['Trinidad and Tobago', 'TT', '+1868', 7, 7],
  ['Tunisia', 'TN', '+216', 8, 8],
  ['Turkey', 'TR', '+90', 10, 10],
  ['Turkmenistan', 'TM', '+993', 8, 8],
  ['Turks and Caicos Islands', 'TC', '+1649', 7, 7],
  ['Tuvalu', 'TV', '+688', 5, 6],
  ['Uganda', 'UG', '+256', 9, 9],
  ['Ukraine', 'UA', '+380', 9, 9],
  ['United Arab Emirates', 'AE', '+971', 9, 9],
  ['United Kingdom', 'GB', '+44', 10, 10, true],
  ['United States', 'US', '+1', 10, 10, true],
  ['Uruguay', 'UY', '+598', 8, 8],
  ['Uzbekistan', 'UZ', '+998', 9, 9],
  ['Vanuatu', 'VU', '+678', 5, 7],
  ['Vatican City', 'VA', '+39', 9, 11],
  ['Venezuela', 'VE', '+58', 10, 10],
  ['Vietnam', 'VN', '+84', 9, 10],
  ['Wallis and Futuna', 'WF', '+681', 6, 6],
  ['Yemen', 'YE', '+967', 9, 9],
  ['Zambia', 'ZM', '+260', 9, 9],
  ['Zimbabwe', 'ZW', '+263', 9, 9],
];

/** ISO 3166-1 alpha-2 to the regional-indicator pair browsers render as a flag. */
const flagOf = (iso2) => iso2.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));

export const COUNTRIES = ROWS.map(([name, iso2, dial, min, max, primary = false]) => ({
  name,
  iso2,
  dial,
  min,
  max,
  /** Several countries share one dial code (+1, +44, +7…); one of them leads. */
  primary,
  flag: flagOf(iso2),
})).sort((a, b) => a.name.localeCompare(b.name));

export const DEFAULT_DIAL_CODE = '+91';

/** The country a stored dial code should highlight in a picker. */
export const countryByDial = (dial) => {
  const matches = COUNTRIES.filter((country) => country.dial === dial);
  return matches.find((country) => country.primary) || matches[0] || null;
};

/**
 * Allowed digit count for a dial code. Where a code is shared the bounds widen
 * to cover every country using it, so nobody is locked out of their own number.
 */
export const digitsFor = (dial) => {
  const matches = COUNTRIES.filter((country) => country.dial === dial);
  if (!matches.length) return { min: 4, max: 15 };
  return {
    min: Math.min(...matches.map((country) => country.min)),
    max: Math.max(...matches.map((country) => country.max)),
  };
};

const isDialCode = (dial) => Boolean(dial) && COUNTRIES.some((country) => country.dial === dial);

/** "10 digits" / "9–11 digits" — used for helper text and error messages. */
export const digitsLabel = (dial) => {
  const { min, max } = digitsFor(dial);
  return min === max ? `${min} digits` : `${min}–${max} digits`;
};

export const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');

/**
 * Validates one contact number against its dial code.
 * Returns an error message, or null when the number is acceptable.
 */
const contactNumberIssue = (dial, number) => {
  if (!isDialCode(dial)) return 'Choose a country code';
  const raw = String(number ?? '').trim();
  const digits = onlyDigits(raw);
  if (!digits) return 'Enter a contact number';
  if (digits !== raw) return 'Enter digits only';
  const { min, max } = digitsFor(dial);
  if (digits.length < min || digits.length > max) {
    return `Enter a valid contact number — ${digitsLabel(dial)} after ${dial}`;
  }
  return null;
};

/**
 * Zod glue: report a bad contact number on the *number* field, since that is
 * where the user is looking. Kept free of a zod import so this file stays a
 * plain data module both halves of the app can share.
 */
export const addContactNumberIssue = (ctx, { dial, number, path, required = true }) => {
  const digits = onlyDigits(number);
  if (!digits) {
    if (required) ctx.addIssue({ code: 'custom', path, message: 'Contact number is required' });
    return;
  }
  // A partial update may omit the code; it then means "whatever is stored",
  // which for every record in this system defaults to +91.
  const message = contactNumberIssue(dial || DEFAULT_DIAL_CODE, number);
  if (message) ctx.addIssue({ code: 'custom', path, message });
};

/** "+91 9812521138" — the one way a contact number is rendered anywhere. */
export const formatContactNumber = (dial, number, fallback = '—') => {
  const digits = onlyDigits(number);
  if (!digits) return fallback;
  return `${isDialCode(dial) ? dial : DEFAULT_DIAL_CODE} ${digits}`;
};

/* ───────────────────────────── Postal codes ───────────────────────────── */

/**
 * Countries whose postal code the address form can resolve to a place.
 * India goes through India Post; every other code here goes through Zippopotam.
 * A country left out is still labelled and validated below — it just never
 * fills itself in.
 */
const POSTAL_LOOKUP_COUNTRIES = new Set(
  'IN US CA GB AU NZ MY ZA JP PH TH RU HU PL PT NL AT BE CH CZ DE DK ES FI FR IT NO SE TR MX PK BD'.split(
    ' '
  )
);

/**
 * What a postal code is called locally, plus a sample. `digits` is a fixed
 * numeric length; countries with alphanumeric or variable-length codes leave it
 * out and fall back to POSTAL_PATTERN, so an unusual but genuine code is never
 * rejected. Anything missing from the table is simply "Postal code".
 */
const POSTAL_META = {
  IN: { label: 'Pincode', example: '400001', digits: 6 },
  US: { label: 'ZIP code', example: '90210', digits: 5 },
  GB: { label: 'Postcode', example: 'SW1A 1AA' },
  CA: { label: 'Postal code', example: 'K1A 0B1' },
  IE: { label: 'Eircode', example: 'D02 AF30' },
  AU: { label: 'Postcode', example: '2000', digits: 4 },
  NZ: { label: 'Postcode', example: '6011', digits: 4 },
  DE: { label: 'Postleitzahl', example: '10115', digits: 5 },
  AT: { label: 'Postleitzahl', example: '1010', digits: 4 },
  CH: { label: 'Postleitzahl', example: '8001', digits: 4 },
  FR: { label: 'Code postal', example: '75001', digits: 5 },
  BE: { label: 'Postcode', example: '1000', digits: 4 },
  NL: { label: 'Postcode', example: '1011 AB' },
  IT: { label: 'CAP', example: '00184', digits: 5 },
  ES: { label: 'Código postal', example: '28001', digits: 5 },
  PT: { label: 'Postal code', example: '1000-001' },
  DK: { label: 'Postnummer', example: '1050', digits: 4 },
  NO: { label: 'Postnummer', example: '0150', digits: 4 },
  SE: { label: 'Postnummer', example: '11120', digits: 5 },
  FI: { label: 'Postinumero', example: '00100', digits: 5 },
  PL: { label: 'Kod pocztowy', example: '00-001' },
  CZ: { label: 'PSČ', example: '110 00' },
  HU: { label: 'Irányítószám', example: '1051', digits: 4 },
  RO: { label: 'Cod poștal', example: '010011', digits: 6 },
  RU: { label: 'Postal code', example: '101000', digits: 6 },
  TR: { label: 'Posta kodu', example: '34000', digits: 5 },
  BR: { label: 'CEP', example: '01001-000' },
  MX: { label: 'Código postal', example: '06000', digits: 5 },
  AR: { label: 'Código postal', example: 'C1002' },
  JP: { label: 'Postal code', example: '100-0001' },
  SG: { label: 'Postal code', example: '018956', digits: 6 },
  MY: { label: 'Postcode', example: '50450', digits: 5 },
  PH: { label: 'ZIP code', example: '1000', digits: 4 },
  TH: { label: 'Postal code', example: '10200', digits: 5 },
  BD: { label: 'Postcode', example: '1000', digits: 4 },
  LK: { label: 'Postal code', example: '00100', digits: 5 },
  NP: { label: 'Postal code', example: '44600', digits: 5 },
  PK: { label: 'Postal code', example: '44000', digits: 5 },
  ZA: { label: 'Postal code', example: '8001', digits: 4 },
  AE: { label: 'PO Box', example: '' },
};

const DEFAULT_POSTAL_META = { label: 'Postal code', example: '' };

/**
 * 2–12 characters of letters, digits, spaces and hyphens. Tight per-country
 * rules belong in a postal directory, not in a form that has to accept every
 * address a shop might have.
 */
const POSTAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/;

export const DEFAULT_COUNTRY = 'India';

const BY_ISO = new Map(COUNTRIES.map((country) => [country.iso2, country]));
const BY_NAME = new Map(COUNTRIES.map((country) => [country.name.toLowerCase(), country]));

/** Accepts an ISO2 code or a country name — address fields store the name. */
export const findCountry = (value) => {
  const key = String(value ?? '').trim();
  if (!key) return null;
  return BY_ISO.get(key.toUpperCase()) || BY_NAME.get(key.toLowerCase()) || null;
};

/** Label, example and lookup support for whatever the country field holds. */
export const postalMetaFor = (country) => {
  const match = findCountry(country);
  const meta = (match && POSTAL_META[match.iso2]) || DEFAULT_POSTAL_META;
  return {
    iso2: match?.iso2 || '',
    label: meta.label,
    example: meta.example,
    digits: meta.digits || null,
    supportsLookup: Boolean(match) && (match.iso2 === 'IN' || POSTAL_LOOKUP_COUNTRIES.has(match.iso2)),
  };
};

/**
 * Validates a postal code against its country.
 * Returns an error message, or null when the code is acceptable (blank included
 * — a branch address is allowed to be incomplete).
 */
const postalCodeIssue = (country, value) => {
  const code = String(value ?? '').trim();
  if (!code) return null;
  const { label, digits } = postalMetaFor(country);
  if (digits) {
    return new RegExp(`^[0-9]{${digits}}$`).test(code)
      ? null
      : `Enter a valid ${digits} digit ${label.toLowerCase()}`;
  }
  return POSTAL_PATTERN.test(code) ? null : `Enter a valid ${label.toLowerCase()}`;
};

/** Zod glue, mirroring addContactNumberIssue above. */
export const addPostalCodeIssue = (ctx, { country, value, path }) => {
  const message = postalCodeIssue(country, value);
  if (message) ctx.addIssue({ code: 'custom', path, message });
};
