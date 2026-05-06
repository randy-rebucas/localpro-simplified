import { z } from "zod";

/**
 * Shared validation schemas for API endpoints.
 * Use these to validate request bodies and query parameters.
 */

// Common fields
const ObjectIdString = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid ID format");
const Email = z.string().email().max(254);
const Phone = z.string().max(20);
const Url = z.string().url().max(2000);

// Workers
export const CreateWorkerSchema = z.object({
  full_name: z.string().min(1).max(256),
  phone: z.string().max(20).optional(),
  email: Email.optional(),
  location: z.string().min(1).max(256),
  skill: z.enum(["cleaner", "helper", "technician"]),
  status: z.enum(["available", "assigned", "inactive"]).optional().default("available"),
  rating: z.number().min(1).max(5).optional().default(3),
  notes: z.string().max(8000).optional().default(""),
});

export const UpdateWorkerSchema = z.object({
  full_name: z.string().min(1).max(256).optional(),
  phone: Phone.optional(),
  email: Email.optional(),
  location: z.string().min(1).max(256).optional(),
  skill: z.enum(["cleaner", "helper", "technician"]).optional(),
  status: z.enum(["available", "assigned", "inactive"]).optional(),
  rating: z.number().min(1).max(5).optional(),
  notes: z.string().max(8000).optional(),
});

// Clients
export const CreateClientSchema = z.object({
  business_name: z.string().min(1).max(256),
  contact_person: z.string().min(1).max(256),
  phone: Phone.optional(),
  email: Email.optional(),
  address: z.string().max(1000).optional().default(""),
  status: z.enum(["prospect", "active", "inactive"]).optional().default("prospect"),
  notes: z.string().max(8000).optional().default(""),
});

export const UpdateClientSchema = z.object({
  business_name: z.string().min(1).max(256).optional(),
  contact_person: z.string().min(1).max(256).optional(),
  phone: Phone.optional(),
  email: Email.optional(),
  address: z.string().max(1000).optional(),
  status: z.enum(["prospect", "active", "inactive"]).optional(),
  notes: z.string().max(8000).optional(),
  portal_enabled: z.boolean().optional(),
  portal_password: z.string().min(8).max(256).optional(),
});

// Jobs
export const CreateJobSchema = z.object({
  client_id: ObjectIdString,
  worker_id: ObjectIdString,
  job_type_id: ObjectIdString,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  time_start: z.string().regex(/^\d{2}:\d{2}$/), // HH:mm
  time_end: z.string().regex(/^\d{2}:\d{2}$/), // HH:mm
  client_price: z.number().min(0).optional(),
  worker_pay: z.number().min(0).optional(),
  notes: z.string().max(2000).optional().default(""),
});

export const UpdateJobSchema = z.object({
  client_id: ObjectIdString.optional(),
  worker_id: ObjectIdString.optional(),
  job_type_id: ObjectIdString.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  time_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  status: z.enum(["assigned", "in_progress", "complete", "cancelled"]).optional(),
  payment_status: z.enum(["unpaid", "paid"]).optional(),
  client_price: z.number().min(0).optional(),
  worker_pay: z.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

// Invoices
export const CreateInvoiceSchema = z.object({
  client_id: ObjectIdString,
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional().default(""),
  line_items: z.array(
    z.object({
      description: z.string().min(1).max(500),
      quantity: z.number().min(0.01),
      unit_price: z.number().min(0),
    }),
  ),
});

// Incidents
export const CreateIncidentSchema = z.object({
  title: z.string().min(1).max(256),
  description: z.string().max(5000),
  severity: z.enum(["low", "medium", "high", "critical"]),
  job_id: ObjectIdString.optional(),
  worker_id: ObjectIdString.optional(),
  client_id: ObjectIdString.optional(),
  incident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Job Types
export const CreateJobTypeSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens"),
  label: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  active: z.boolean().optional().default(true),
});

// Query parameters
export const ListQuerySchema = z.object({
  q: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  limit: z.coerce.number().min(1).max(1000).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

// Helper to validate and return typed data or throw structured error
export async function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): Promise<T> {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw new Error(`Validation failed: ${message}`);
    }
    throw error;
  }
}

export type CreateWorker = z.infer<typeof CreateWorkerSchema>;
export type UpdateWorker = z.infer<typeof UpdateWorkerSchema>;
export type CreateClient = z.infer<typeof CreateClientSchema>;
export type UpdateClient = z.infer<typeof UpdateClientSchema>;
export type CreateJob = z.infer<typeof CreateJobSchema>;
export type UpdateJob = z.infer<typeof UpdateJobSchema>;
export type CreateInvoice = z.infer<typeof CreateInvoiceSchema>;
export type CreateIncident = z.infer<typeof CreateIncidentSchema>;
export type CreateJobType = z.infer<typeof CreateJobTypeSchema>;
export type ListQuery = z.infer<typeof ListQuerySchema>;
