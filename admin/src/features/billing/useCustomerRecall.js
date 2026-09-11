import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { billApi } from '../../api/endpoints.js';
import useDebounce from '../../hooks/useDebounce.js';
import { DEFAULT_DIAL_CODE, digitsFor, onlyDigits } from '../../utils/countries.js';

/** Everything a past bill can tell us about the person standing at the counter. */
const RECALLED_FIELDS = ['name', 'email', 'address', 'gstin'];

// Customer recall for the billing form.
export const useCustomerRecall = () => {
  const { control, getValues, setValue } = useFormContext();

  const mobile = onlyDigits(useWatch({ control, name: 'customer.mobile' }));
  const dial = useWatch({ control, name: 'customer.mobileCountryCode' }) || DEFAULT_DIAL_CODE;
  const debouncedMobile = useDebounce(mobile, 350);

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  /** True once a complete number has been looked up, so "new customer" can be said. */
  const [searched, setSearched] = useState(false);

  // One lookup per number: re-filling on every keystroke would fight the biller.
  const lastLookup = useRef('');
  /** Bumped to force that one lookup to run again — see `refresh` below. */
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

    // A half-typed number matches half the town; wait for a complete one.
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
      // A failed lookup must never block billing — the biller just types it out.
      .catch(() => active && setCustomer(null))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [debouncedMobile, dial, fill, reloadKey]);

  // Re-reads the customer from the server.
  const refresh = useCallback(() => {
    lastLookup.current = '';
    setReloadKey((key) => key + 1);
  }, []);

  /** "That's not them" — drop the recalled details, keep the number typed so far. */
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
    /** Overwrites even hand-typed fields with what the last bill had. */
    applySaved: useCallback(() => customer && fill(customer, { overwrite: true }), [customer, fill]),
    forget,
    refresh,
  };
};

export default useCustomerRecall;
