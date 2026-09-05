import { Router } from 'express';
import authenticate from '../../middlewares/authenticate.js';
import validate from '../../middlewares/validate.js';
import { statesQuerySchema, citiesQuerySchema, postalQuerySchema } from './geo.validation.js';
import { getStates, getCities, getPostalCode } from './geo.controller.js';

const router = Router();

// Reference data only — any signed-in user filling an address form needs it.
router.use(authenticate);

router.get('/states', validate({ query: statesQuerySchema }), getStates);
router.get('/cities', validate({ query: citiesQuerySchema }), getCities);
router.get('/postal-code', validate({ query: postalQuerySchema }), getPostalCode);

export default router;
