import { z } from "zod";

export const roles = ["SYSTEM_OWNER", "ADMIN", "MANAGER", "DRIVER"] as const;
export type Role = (typeof roles)[number];

export const quantitySchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,4})?$/, "Cantidad inválida");

export const signedQuantitySchema = z
  .string()
  .regex(/^-?\d+(?:\.\d{1,4})?$/, "Cantidad inválida");

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8)
});

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().max(50).optional().nullable(),
  categoryId: z.string().min(1),
  unitId: z.string().min(1),
  imageUrl: z.union([z.url(), z.string().startsWith("/")]).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0)
});

export type ApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  currentState?: unknown;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  locationId: string | null;
};
