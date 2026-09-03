import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Tên project không được để trống').max(120),
  description: z.string().max(2000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1, 'Tên project không được để trống').max(120),
  description: z.string().max(2000).optional(),
});
