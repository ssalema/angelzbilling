import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { billApi } from '../../api/endpoints.js';
import useDebounce from '../../hooks/useDebounce.js';
import { DEFAULT_DIAL_CODE, digitsFor, onlyDigits } from '../../utils/countries.js';

const RECALLED_FIELDS = ['name', 'email', 'address', 'gstin'];

// Looks up a returning customer by mobile number and fills in their details.
export const useCustomerRecall = () => {
  const { control, getValues, setValue } = useFormContext();

  const mobile = onlyDigits(useWatch({ control, name: 'customer.mobile' }));
  const dial = useWatch({ control, name: 'customer.mobileCountryCode' }) || DEFAULT_DIAL_CODE;
  const debouncedMobile = useDebounce(mobile, 350);

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  // True once a full number was looked up, so we can show "new customer".
  const [searched, setSearched] = useState(false);

  // Look up each number only once, so we don't overwrite what the user types.
  const lastLookup = useRef('');
  const [reloadKey, setReloadKey] = useState(0);

  const fill = useCallback(
    (found, { overwrite = false } = {}) => {
      RECALLED_FIELDS.forEach((key) => {
        const value = found[key] || '';
        if (!value) return;
        if (!overwrite && getValues(`customer.${key}`)) return; // typed by hand — leave it
        setValue(`customer.${key}`, value, { shouldDirty: true, shouldValidate: true });
      });
    },
    [getValues, setValue]
  );

  useEffect(() => {
    const { min } = digitsFor(dial);
    const key = `${dial}-${debouncedMobile}`;

    // Wait for a complete number.
    if (debouncedMobile.length < min) {
      lastLookup.current = '';
      setCustomer(null);
      setSearched(false);
      return undefined;
    }
    if (lastLookup.current === key) return undefined;
    lastLookup.current = key;

    let active = true;
    setLoading(true);

    billApi
      .lookupCustomers({ mobile: debouncedMobile, mobileCountryCode: dial })
      .then((rows) => {
        if (!active) return;
        const found = rows?.[0] || null;
        setCustomer(found);
        setSearched(true);
        if (found) fill(found);
      })
      // A failed lookup must never block billing.
      .catch(() => active && setCustomer(null))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [debouncedMobile, dial, fill, reloadKey]);

  const refresh = useCallback(() => {
    lastLookup.current = '';
    setReloadKey((key) => key + 1);
  }, []);

  // Clears the recalled details but keeps the typed number.
  const forget = useCallback(() => {
    RECALLED_FIELDS.forEach((key) =>
      setValue(`customer.${key}`, '', { shouldDirty: true, shouldValidate: false })
    );
    setCustomer(null);
    setSearched(false);
  }, [setValue]);

  return {
    customer,
    loading,
    searched,
    // Overwrites even hand-typed fields.
    applySaved: useCallback(() => customer && fill(customer, { overwrite: true }), [customer, fill]),
    forget,
    refresh,
  };
};

export default useCustomerRecall;
