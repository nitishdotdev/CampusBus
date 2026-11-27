import { z } from 'zod';

export const idParam = z.string().regex(/^[a-f0-9]{24}$/i);
export const text = (max: number) => z.string().trim().min(1).max(max);
export const nonempty = (patch: object) => Object.keys(patch).length > 0;
export const operationalStatus = z.enum(['ACTIVE', 'MAINTENANCE', 'OFFLINE']);
const busFields = { number: text(32), capacity: z.number().int().min(1).max(200), status: operationalStatus, model: text(80).nullable(), plateNumber: text(32).nullable() };
export const busCreate = z.strictObject({ ...busFields, model: busFields.model.optional(), plateNumber: busFields.plateNumber.optional(), routeId: idParam.optional(), status: operationalStatus.default('ACTIVE') });
export const busPatch = z.strictObject(busFields).partial().refine(nonempty, 'Provide at least one field');

const stop = z.strictObject({ name: text(120), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), order: z.number().int().min(0).max(999) });
const stops = z.array(stop).max(100).refine(items => new Set(items.map(item => item.order)).size === items.length, 'Stop order must be unique');
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const routeFields = { code: text(16), name: text(120), color, stops };
export const routeCreate = z.strictObject({ ...routeFields, color: color.default('#2563eb'), stops: stops.default([]) });
export const routePatch = z.strictObject(routeFields).partial().refine(nonempty, 'Provide at least one field');

const scheduleFields = {
  routeId: idParam, busId: idParam, direction: z.enum(['TO_CAMPUS', 'FROM_CAMPUS']),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(days => new Set(days).size === days.length, 'Select each day once'),
  departTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), active: z.boolean(),
};
export const scheduleCreate = z.strictObject({ ...scheduleFields, active: z.boolean().default(true) });
export const schedulePatch = z.strictObject(scheduleFields).partial().refine(nonempty, 'Provide at least one field');
export const driverAssignment = z.strictObject({ driverId: idParam.nullable() });
export const routeAssignment = z.strictObject({ routeId: idParam.nullable() });
export const assignment = driverAssignment.extend(routeAssignment.shape);
export const transport = z.strictObject({ busId: idParam.nullable(), routeId: idParam.nullable() });
export const accountStatus = z.strictObject({ status: z.enum(['ACTIVE', 'PENDING', 'REJECTED', 'DISABLED']) });
export const emptyBody = z.strictObject({}).default({});
