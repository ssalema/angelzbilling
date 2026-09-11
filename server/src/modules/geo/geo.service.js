import env from '../../config/env.js';
import logger from '../../config/logger.js';
import ApiError from '../../utils/ApiError.js';
import { findCountry, postalMetaFor } from '../../utils/countries.js';
import { INDIA_STATES } from './geo.data.js';

// Address directory: states, cities and postal-code lookup.

// Base URLs and the timeout come from config so a deployment can point at a
// mirror, an internal proxy or a stub without touching this module.
const {
  countriesNowUrl: COUNTRIES_NOW,
  indiaPostUrl: INDIA_POST,
  zippopotamUrl: ZIPPOPOTAM,
  timeoutMs: TIMEOUT_MS,
} = env.geo;
const DIRECTORY_TTL_MS = 24 * 60 * 60 * 1000; // states and cities barely move
const POSTAL_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 2000;

const cache = new Map();
const inflight = new Map();

const readCache = (key) => {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Refresh insertion order so the least recently used entry is evicted first.
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
};

const writeCache = (key, value, ttl) => {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
};

/** Cache + single flight: ten admins opening the form make one upstream call. */
const remember = async (key, ttl, loader) => {
  const cached = readCache(key);
  if (cached !== undefined) return cached;
  if (inflight.has(key)) return inflight.get(key);

  const promise = loader()
    .then((value) => {
      writeCache(key, value, ttl);
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
};

const request = async (url, options = {}) => {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
};

const postJson = (url, body) =>
  request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const unique = (values) =>
  [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'en')
  );

/** Resolves whatever the form sent (a name or an ISO code) to a known country. */
const resolveCountry = (value) => {
  const country = findCountry(value);
  if (!country) throw ApiError.badRequest('Choose a country from the list');
  return country;
};

/* ─────────────────────────────── States ─────────────────────────────── */

export const listStates = async (countryValue) => {
  const country = resolveCountry(countryValue);

  const states = await remember(`states:${country.iso2}`, DIRECTORY_TTL_MS, async () => {
    try {
      const payload = await postJson(`${COUNTRIES_NOW}/countries/states`, { country: country.name });
      return unique((payload?.data?.states || []).map((state) => state.name));
    } catch (error) {
      logger.warn(`[geo] state lookup failed for ${country.name}: ${error.message}`);
      return [];
    }
  });

  // A cached empty list must never leave India without its states.
  if (!states.length && country.iso2 === 'IN') return unique(INDIA_STATES);
  return states;
};

/* ─────────────────────────────── Cities ─────────────────────────────── */

export const listCities = async (countryValue, stateValue) => {
  const country = resolveCountry(countryValue);
  const state = String(stateValue || '').trim();
  if (!state) return [];

  return remember(`cities:${country.iso2}:${state.toLowerCase()}`, DIRECTORY_TTL_MS, async () => {
    try {
      const payload = await postJson(`${COUNTRIES_NOW}/countries/state/cities`, {
        country: country.name,
        state,
      });
      return unique(payload?.data || []);
    } catch (error) {
      logger.warn(`[geo] city lookup failed for ${state}, ${country.name}: ${error.message}`);
      return [];
    }
  });
};

/* ──────────────────────────── Postal lookup ──────────────────────────── */

const lookupIndiaPincode = async (code) => {
  const payload = await request(`${INDIA_POST}/${code}`);
  const offices = payload?.[0]?.PostOffice;
  if (!Array.isArray(offices) || !offices.length) return null;

  const [first] = offices;
  return {
    state: first.State || '',
    // "District" is what an Indian address calls the city.
    city: first.District || first.Block || '',
    areas: unique(offices.map((office) => office.Name)).slice(0, 25),
  };
};

const lookupZippopotam = async (iso2, code) => {
  const payload = await request(`${ZIPPOPOTAM}/${iso2.toLowerCase()}/${encodeURIComponent(code)}`);
  const places = payload?.places;
  if (!Array.isArray(places) || !places.length) return null;

  const [first] = places;
  return {
    state: first.state || '',
    city: first['place name'] || '',
    areas: unique(places.map((place) => place['place name'])).slice(0, 25),
  };
};

export const lookupPostalCode = async (countryValue, codeValue) => {
  const country = resolveCountry(countryValue);
  const code = String(codeValue || '').trim();
  const meta = postalMetaFor(country.iso2);

  if (!meta.supportsLookup) {
    throw ApiError.badRequest(`Automatic lookup is not available for ${country.name} yet`);
  }

  return remember(`postal:${country.iso2}:${code.toUpperCase()}`, POSTAL_TTL_MS, async () => {
    let found;
    try {
      found =
        country.iso2 === 'IN' ? await lookupIndiaPincode(code) : await lookupZippopotam(country.iso2, code);
    } catch (error) {
      logger.warn(`[geo] postal lookup failed for ${code} (${country.iso2}): ${error.message}`);
      // An outage must not be cached as "no such code", so fail loudly instead.
      throw ApiError.badRequest(
        'The postal directory is not responding right now — please fill the address in manually'
      );
    }
    if (!found) return null;
    return { country: country.name, countryCode: country.iso2, pincode: code, ...found };
  });
};
