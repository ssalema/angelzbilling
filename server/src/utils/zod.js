import { z } from 'zod';

/**
 * `.partial()` for update bodies. Zod 4 still applies a field's `.default()`
 * when the key is missing from a partial, so a PATCH that leaves a field out
 * would overwrite the stored value with the create-time default. Stripping
 * each top-level default first keeps an absent key absent.
 */
export const partialWithoutDefaults = (schema) =>
  schema.extend(
    Object.fromEntries(
      Object.entries(schema.shape).map(([key, field]) => {
        let inner = field;
        while (inner instanceof z.ZodDefault || inner instanceof z.ZodPrefault) inner = inner.unwrap();
        return [key, inner.optional()];
      })
    )
  );
