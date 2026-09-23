import { z } from 'zod';
export const permissionSchema=z.enum(['simulation.manage','devices.manage','parameters.manage','audit.read']);
export const permissionsSchema=z.array(permissionSchema).max(4).refine(value=>new Set(value).size===value.length,'Permissions must be unique.');
export const invitationSchema=z.object({email:z.email().max(254).transform(value=>value.trim().toLowerCase()),role:z.enum(['admin','owner']).default('admin'),permissions:permissionsSchema.default([]),canManageAdmins:z.boolean().default(false)}).strict();
export const accessChangeSchema=z.object({role:z.enum(['farmer','admin','owner']).optional(),permissions:permissionsSchema.optional(),canManageAdmins:z.boolean().optional(),disabled:z.boolean().optional()}).strict().refine(value=>Object.keys(value).length>0,'Choose an access change.');
