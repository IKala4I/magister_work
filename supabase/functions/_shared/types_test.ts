/**
 * Compile-time contract check: the EF's hand-written service types are assignable to/from the
 * generated OpenAPI types (`packages/shared/src/api.ts`, CI-diffed against the FastAPI spec).
 * A schema change on the service that api.ts picks up fails `deno test` here.
 */
import { assertEquals } from '@std/assert';
import type { components } from '../../../packages/shared/src/api.ts';
import type { ServicePlanRequest, ServicePlanResponse } from './types.ts';

type ApiPlanRequest = components['schemas']['PlanRequest'];
type ApiPlanResponse = components['schemas']['PlanResponse'];

// Request: what the EF sends must be a valid service request.
const _req: (r: ServicePlanRequest) => ApiPlanRequest = (r) => r;
// Response: what the service returns must be readable as our response type.
const _res: (r: ApiPlanResponse) => ServicePlanResponse = (r) => r;

Deno.test('service wire types are assignable to the generated OpenAPI types', () => {
  assertEquals(typeof _req, 'function');
  assertEquals(typeof _res, 'function');
});
