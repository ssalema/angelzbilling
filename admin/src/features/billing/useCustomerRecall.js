import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { billApi } from '../../api/endpoints.js';
import useDebounce from '../../hooks/useDebounce.js';
import { DEFAULT_DIAL_CODE, digitsFor, onlyDigits } from '../../utils/countries.js';

/** Everything a past bill can tell us about the person standing at the counter. */
const RECALLED_FIELDS = ['name', 'email', 'address', 'gstin'];

/**
 * Customer recall for the billing form.
 *
 * A returning buyer is identified by their contact number alone: as soon as the
 * biller has typed a complete number we look the customer up from past bills and
 * fill in the rest of the form, so nobody re-types a name and address that the
 * shop already has. Anything the biller has already typed is left alone — the
 * banner offers an explicit "Use saved details" for that — and `forget()` wipes
 * the recall when the number belongs to somebody new.
 */
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
  }, [debouncedMobile, dial, fill]);

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
  };
};

export default useCustomerRecall;
