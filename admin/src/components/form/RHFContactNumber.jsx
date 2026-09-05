import { useMemo, useRef, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import {
  TextField,
  InputAdornment,
  ButtonBase,
  Menu,
  MenuItem,
  ListItemText,
  Typography,
  Box,
  Divider,
} from '@mui/material';
import { ArrowDropDown } from '@mui/icons-material';

import {
  COUNTRIES,
  DEFAULT_DIAL_CODE,
  countryByDial,
  digitsFor,
  digitsLabel,
  onlyDigits,
} from '../../utils/countries.js';
import { ICON } from '../../theme/index.js';

/**
 * The one contact-number input used everywhere in the admin.
 *
 * It drives two form fields: `codeName` holds the dial code ("+91") and `name`
 * holds the national digits, so a saved number always renders as "+91 9812521138".
 * The digit length is enforced per country — a fixed 10 for India, 8 for
 * Singapore, a range where the country genuinely allows one.
 */
const RHFContactNumber = ({
  name,
  codeName,
  label = 'Contact number',
  placeholder,
  helperText,
  disabled = false,
  autoFocus = false,
  ...props
}) => {
  const { control, setValue, getValues, trigger } = useFormContext();
  const [anchorEl, setAnchorEl] = useState(null);
  const [search, setSearch] = useState('');
  const numberRef = useRef(null);

  const dial = useWatch({ control, name: codeName }) || DEFAULT_DIAL_CODE;
  const country = countryByDial(dial);
  const { max } = digitsFor(dial);

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return COUNTRIES;
    return COUNTRIES.filter(
      (item) =>
        item.name.toLowerCase().includes(term) ||
        item.iso2.toLowerCase().includes(term) ||
        item.dial.includes(term.startsWith('+') ? term : `+${term}`)
    );
  }, [search]);

  const closeMenu = () => {
    setAnchorEl(null);
    setSearch('');
  };

  const pickCountry = (picked) => {
    setValue(codeName, picked.dial, { shouldDirty: true, shouldValidate: true });
    // A shorter country means the tail of the old number can no longer be valid.
    const current = onlyDigits(getValues(name));
    if (current.length > picked.max) {
      setValue(name, current.slice(0, picked.max), { shouldDirty: true });
    }
    closeMenu();
    trigger(name);
    numberRef.current?.focus();
  };

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <>
          <TextField
            {...field}
            inputRef={numberRef}
            value={field.value ?? ''}
            onChange={(event) => field.onChange(onlyDigits(event.target.value).slice(0, max))}
            label={label}
            placeholder={placeholder ?? digitsLabel(dial)}
            disabled={disabled}
            autoFocus={autoFocus}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message || helperText}
            inputProps={{ inputMode: 'numeric', maxLength: max, autoComplete: 'tel-national' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.75 }}>
                  <ButtonBase
                    disabled={disabled}
                    onClick={(event) => setAnchorEl(event.currentTarget)}
                    aria-label="Select country code"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 0.75,
                      py: 0.25,
                      ml: -0.5,
                      borderRadius: 1,
                      typography: 'body2',
                      color: 'text.primary',
                    }}
                  >
                    <Box component="span" sx={{ fontSize: ICON.inline, lineHeight: 1 }}>
                      {country?.flag}
                    </Box>
                    <Box component="span">{dial}</Box>
                    <ArrowDropDown sx={{ fontSize: ICON.action, color: 'text.secondary' }} />
                  </ButtonBase>
                </InputAdornment>
              ),
            }}
            {...props}
          />

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={closeMenu}
            slotProps={{ paper: { sx: { width: 320, maxHeight: 360 } } }}
            // Keep typing in the search box instead of jumping between items.
            disableAutoFocusItem
          >
            <Box sx={{ px: 1.5, pt: 0.5, pb: 1 }}>
              <TextField
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                // The menu keeps Escape; every other key types into the box.
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') event.stopPropagation();
                }}
                placeholder="Search country or code"
              />
            </Box>
            <Divider />

            {results.length === 0 && (
              <MenuItem disabled>
                <Typography variant="body2">No country matches “{search}”</Typography>
              </MenuItem>
            )}

            {results.map((item) => (
              <MenuItem
                key={`${item.iso2}-${item.dial}`}
                selected={item.dial === dial}
                onClick={() => pickCountry(item)}
              >
                <Box component="span" sx={{ fontSize: ICON.action, mr: 1.25, lineHeight: 1 }}>
                  {item.flag}
                </Box>
                <ListItemText
                  primary={item.name}
                  primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ ml: 1.5 }}>
                  {item.dial}
                </Typography>
              </MenuItem>
            ))}
          </Menu>
        </>
      )}
    />
  );
};

export default RHFContactNumber;
