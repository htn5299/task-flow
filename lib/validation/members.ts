import { z } from 'zod';

export const roleValues = ['owner', 'admin', 'member', 'viewer'] as const;

export const inviteMemberSchema = z.object({
  email: z.string().email('Email không hợp lệ'),
  role: z.enum(['admin', 'member', 'viewer']),
});

export const changeRoleSchema = z.object({
  role: z.enum(roleValues),
});
