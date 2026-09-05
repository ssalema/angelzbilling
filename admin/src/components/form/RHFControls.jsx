import { Controller, useFormContext } from 'react-hook-form';
import {
  TextField,
  MenuItem,
  FormControlLabel,
  Switch,
  Autocomplete,
  Chip,
  FormHelperText,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
} from '@mui/material';

/**
 * Thin react-hook-form bindings for MUI inputs.
 *
 * Each one reads from the surrounding FormProvider, so a form only writes
 * `<RHFTextField name="sku" label="SKU" />` and validation wiring is automatic.
 */

export const RHFTextField = ({ name, helperText, ...props }) => {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message || helperText}
          {...props}
        />
      )}
    />
  );
};

export const RHFNumberField = ({ name, helperText, prefix, suffix, ...props }) => {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          onChange={(event) => {
            const raw = event.target.value;
            // Keep the field empty-able while typing; commit a number otherwise.
            field.onChange(raw === '' ? '' : Number(raw));
          }}
          type="number"
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message || helperText}
          InputProps={{
            startAdornment: prefix ? <InputAdornment position="start">{prefix}</InputAdornment> : undefined,
            endAdornment: suffix ? <InputAdornment position="end">{suffix}</InputAdornment> : undefined,
            ...props.InputProps,
          }}
          {...props}
        />
      )}
    />
  );
};

export const RHFSelect = ({ name, label, options = [], helperText, placeholder, ...props }) => {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <FormControl fullWidth size="small" error={Boolean(fieldState.error)}>
          <InputLabel>{label}</InputLabel>
          <Select {...field} value={field.value ?? ''} label={label} {...props}>
            {placeholder && (
              <MenuItem value="">
                <em>{placeholder}</em>
              </MenuItem>
            )}
            {options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          {(fieldState.error?.message || helperText) && (
            <FormHelperText>{fieldState.error?.message || helperText}</FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
};

export const RHFSwitch = ({ name, label, helperText, ...props }) => {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <FormControl error={Boolean(fieldState.error)}>
          <FormControlLabel
            control={<Switch {...field} checked={Boolean(field.value)} {...props} />}
            label={label}
          />
          {(fieldState.error?.message || helperText) && (
            <FormHelperText>{fieldState.error?.message || helperText}</FormHelperText>
          )}
        </FormControl>
      )}
    />
  );
};

/** Free-text tag entry — used for tags, features and variant values. */
export const RHFChipInput = ({ name, label, placeholder, helperText, options = [] }) => {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Autocomplete
          multiple
          freeSolo
          options={options}
          value={field.value || []}
          onChange={(_event, value) => field.onChange(value.map((v) => String(v).trim()).filter(Boolean))}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip size="small" label={option} {...getTagProps({ index })} key={`${option}-${index}`} />
            ))
          }
          renderInput={(params) => (
            <TextField
              {...params}
              label={label}
              placeholder={placeholder}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message || helperText}
            />
          )}
        />
      )}
    />
  );
};

export const RHFAutocomplete = ({ name, label, options = [], helperText, freeSolo = true, ...props }) => {
  const { control } = useFormContext();
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Autocomplete
          freeSolo={freeSolo}
          options={options}
          value={field.value ?? ''}
          onChange={(_event, value) => field.onChange(value ?? '')}
          onInputChange={freeSolo ? (_event, value) => field.onChange(value ?? '') : undefined}
          renderInput={(params) => (
            <TextField
              {...params}
              label={label}
              error={Boolean(fieldState.error)}
              helperText={fieldState.error?.message || helperText}
            />
          )}
          {...props}
        />
      )}
    />
  );
};
