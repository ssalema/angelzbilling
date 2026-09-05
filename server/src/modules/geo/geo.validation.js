import { z } from 'zod';

export const statesQuerySchema = z.object({
  country: z.string().trim().min(2, 'Choose a country').max(80),
});

export const citiesQuerySchema = z.object({
  country: z.string().trim().min(2, 'Choose a country').max(80),
  state: z.string().trim().max(80).optional().default(''),
});

export const postalQuerySchema = z.object({
  country: z.string().trim().min(2, 'Choose a country').max(80).optional().default('India'),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/, 'Enter a valid postal code'),
});
