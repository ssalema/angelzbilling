import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { Grid, TextField, Autocomplete, InputAdornment, CircularProgress } from '@mui/material';
import { CheckCircleOutlined, ErrorOutlineRounded, PublicRounded } from '@mui/icons-material';

import { COUNTRIES, DEFAULT_COUNTRY, postalMetaFor } from '../../utils/countries.js';
import { geoApi } from '../../api/endpoints.js';
import useDebounce from '../../hooks/useDebounce.js';
import { ICON } from '../../theme/index.js';

/**
 * One address block, wired to react-hook-form.
 *
 * Country drives everything: it decides which states are offered, a state
 * decides which cities are offered, and a postal code typed into the last field
 * fills the state and city back in from the postal directory. Every field stays
 * free text underneath — the lists are suggestions, so an address the directory
 * has never heard of can still be saved.
 *
 * Expects the form to hold { line1, city, state, pincode, country } under
 * `prefix`, which is how every address in the app is shaped. Renders bare grid
 * items, so it belongs inside a <Grid container>.
 */
const AddressFields = ({ prefix = 'address', disabled = false }) => {
  const { control, setValue } = useFormContext();

  const field = (name) => `${prefix}.${name}`;
  const country = useWatch({ control, name: field('country') }) || '';
  const state = useWatch({ control, name: field('state') }) || '';
  const pincode = useWatch({ control, name: field('pincode') }) || '';

  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [lookup, setLookup] = useState({ status: 'idle', message: '', areas: [] });

  const postal = useMemo(() => postalMetaFor(country), [country]);
  const countryNames = useMemo(() => COUNTRIES.map((item) => item.name), []);

  /* ── Country → states ── */
  useEffect(() => {
    if (!postal.iso2) {
      setStates([]);
      return undefined;
    }
    let live = true;
    setLoadingStates(true);
    geoApi
      .states(country)
      .then((list) => live && setStates(Array.isArray(list) ? list : []))
      .catch(() => live && setStates([])) // the field is free text; typing still works
      .finally(() => live && setLoadingStates(false));
    return () => {
      live = false;
    };
  }, [country, postal.iso2]);

  /* ── State → cities ── */
  useEffect(() => {
    if (!postal.iso2 || !state) {
      setCities([]);
      return undefined;
    }
    let live = true;
    setLoadingCities(true);
    geoApi
      .cities(country, state)
      .then((list) => live && setCities(Array.isArray(list) ? list : []))
      .catch(() => live && setCities([]))
      .finally(() => live && setLoadingCities(false));
    return () => {
      live = false;
    };
  }, [country, state, postal.iso2]);

  /* ── Postal code → the rest of the address ── */
  const debouncedPincode = useDebounce(pincode.trim(), 600);
  // Remembers what was last looked up so re-renders don't re-fetch the same code.
  const lastLookup = useRef('');

  useEffect(() => {
    const code = debouncedPincode;
    const key = `${postal.iso2}:${code.toUpperCase()}`;

    if (!code || !postal.supportsLookup) {
      lastLookup.current = '';
      setLookup({ status: 'idle', message: '', areas: [] });
      return undefined;
    }
    // Wait for a complete code where the country has a fixed length.
    if (postal.digits && !new RegExp(`^[0-9]{${postal.digits}}$`).test(code)) {
      lastLookup.current = '';
      setLookup({ status: 'idle', message: '', areas: [] });
      return undefined;
    }
    if (lastLookup.current === key) return undefined;
    lastLookup.current = key;

    let live = true;
    setLookup({ status: 'loading', message: '', areas: [] });
    geoApi
      .postalCode(country, code)
      .then((found) => {
        if (!live || !found) return;
        const options = { shouldDirty: true, shouldValidate: true };
        if (found.state) setValue(field('state'), found.state, options);
        if (found.city) setValue(field('city'), found.city, options);
        setLookup({
          status: 'done',
          message: [found.city, found.state].filter(Boolean).join(', '),
          areas: found.areas || [],
        });
      })
      .catch((error) => {
        if (!live) return;
        // Let the admin retype the same code once the directory recovers.
        lastLookup.current = '';
        setLookup({
          status: 'error',
          message: error?.isNotFound
            ? `No address found for ${code}`
            : error?.message || 'Lookup failed — fill the address in below',
          areas: [],
        });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPincode, country, postal.iso2, postal.supportsLookup, postal.digits]);

  const pincodeHelper = () => {
    if (lookup.status === 'loading') return 'Looking up…';
    if (lookup.status === 'done') return `Matched ${lookup.message}`;
    if (lookup.status === 'error') return lookup.message;
    if (!postal.supportsLookup && country) return `Automatic lookup is not available for ${country}`;
    return postal.example ? `e.g. ${postal.example} — fills state and city automatically` : ' ';
  };

  const pincodeIcon = () => {
    if (lookup.status === 'loading') return <CircularProgress size={15} />;
    if (lookup.status === 'done') return <CheckCircleOutlined color="success" sx={{ fontSize: ICON.action }} />;
    if (lookup.status === 'error') return <ErrorOutlineRounded color="warning" sx={{ fontSize: ICON.action }} />;
    return null;
  };

  /** Free-text picker shared by the street address, country, state and city. */
  const renderPicker = ({ name, label, options, loading, placeholder, onPicked, startIcon, extraHelper }) => (
    <Controller
      name={field(name)}
      control={control}
      render={({ field: control_, fieldState }) => (
        <Autocomplete
          freeSolo
          autoHighlight
          fullWidth
          disabled={disabled}
          options={options}
          loading={loading}
          value={control_.value ?? ''}
          onChange={(_event, value) => {
            control_.onChange(value ?? '');
            onPicked?.(value ?? '');
          }}
          onInputChange={(_event, value, reason) => {
            if (reason === 'reset') return; // fired by our own setValue, not the admin
            control_.onChange(value ?? '');
            if (reason === 'clear') onPicked?.('');
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={label}
              placeholder={placeholder}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message || extraHelper}
              InputProps={{
                ...params.InputProps,
                startAdornment: startIcon ? (
                  <InputAdornment position="start">{startIcon}</InputAdornment>
                ) : (
                  params.InputProps.startAdornment
                ),
                endAdornment: (
                  <>
                    {loading ? <CircularProgress size={15} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
      )}
    />
  );

  return (
    <>
      <Grid item xs={12}>
        {/* The localities a postal code covers are exactly what goes here, so a
            successful lookup quietly offers them as suggestions. */}
        {renderPicker({
          name: 'line1',
          label: 'Street address',
          options: lookup.areas,
          loading: false,
          placeholder: 'Shop or building, street, locality',
        })}
      </Grid>

      <Grid item xs={12} sm={6}>
        {renderPicker({
          name: 'country',
          label: 'Country',
          options: countryNames,
          loading: false,
          placeholder: DEFAULT_COUNTRY,
          startIcon: <PublicRounded sx={{ fontSize: ICON.action, opacity: 0.6 }} />,
          // A new country invalidates whatever state and city were chosen.
          onPicked: () => {
            setValue(field('state'), '', { shouldDirty: true });
            setValue(field('city'), '', { shouldDirty: true });
            lastLookup.current = '';
            setLookup({ status: 'idle', message: '', areas: [] });
          },
        })}
      </Grid>

      <Grid item xs={12} sm={6}>
        <Controller
          name={field('pincode')}
          control={control}
          render={({ field: control_, fieldState }) => (
            <TextField
              {...control_}
              value={control_.value ?? ''}
              label={postal.label}
              disabled={disabled}
              fullWidth
              inputProps={{ maxLength: 12 }}
              InputProps={{ endAdornment: <InputAdornment position="end">{pincodeIcon()}</InputAdornment> }}
              error={Boolean(fieldState.error) || lookup.status === 'error'}
              helperText={fieldState.error?.message || pincodeHelper()}
            />
          )}
        />
      </Grid>

      <Grid item xs={12} sm={6}>
        {renderPicker({
          name: 'state',
          label: 'State',
          options: states,
          loading: loadingStates,
          extraHelper: !country ? 'Pick a country first' : undefined,
          onPicked: () => setValue(field('city'), '', { shouldDirty: true }),
        })}
      </Grid>

      <Grid item xs={12} sm={6}>
        {renderPicker({
          name: 'city',
          label: 'City',
          options: cities,
          loading: loadingCities,
          extraHelper: country && !state ? 'Pick a state first' : undefined,
        })}
      </Grid>
    </>
  );
};

export default AddressFields;
