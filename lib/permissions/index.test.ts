import { describe, expect, it } from 'vitest';
import { can, type Action, type Role } from './index';

const ALL_ROLES: Role[] = ['owner', 'admin', 'member', 'viewer'];

const ALLOWED: Record<Action, Role[]> = {
  'project:update': ['owner'],
  'project:delete': ['owner'],
  'member:invite': ['owner', 'admin'],
  'member:remove': ['owner', 'admin'],
  'member:changeRole': ['owner'],
  'task:create': ['owner', 'admin', 'member'],
  'task:update': ['owner', 'admin', 'member'],
  'task:delete': ['owner', 'admin'],
  'task:comment': ['owner', 'admin', 'member'],
};

describe('permission matrix (full table, allowed and denied)', () => {
  for (const action of Object.keys(ALLOWED) as Action[]) {
    for (const role of ALL_ROLES) {
      const expected = ALLOWED[action].includes(role);
      it(`${role} ${expected ? 'CAN' : 'cannot'} ${action}`, () => {
        expect(can(role, action)).toBe(expected);
      });
    }
  }
});

describe('permission matrix', () => {
  it('only owner can update or delete a project', () => {
    expect(can('owner', 'project:update')).toBe(true);
    expect(can('admin', 'project:update')).toBe(false);
    expect(can('owner', 'project:delete')).toBe(true);
    expect(can('admin', 'project:delete')).toBe(false);
  });

  it('owner and admin can invite/remove members, only owner can change roles', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(can(role, 'member:invite')).toBe(true);
      expect(can(role, 'member:remove')).toBe(true);
    }
    expect(can('member', 'member:invite')).toBe(false);
    expect(can('viewer', 'member:invite')).toBe(false);
    expect(can('owner', 'member:changeRole')).toBe(true);
    expect(can('admin', 'member:changeRole')).toBe(false);
  });

  it('owner, admin, member can create/update/comment on tasks; only owner/admin can delete', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(can(role, 'task:create')).toBe(true);
      expect(can(role, 'task:update')).toBe(true);
      expect(can(role, 'task:comment')).toBe(true);
    }
    expect(can('viewer', 'task:create')).toBe(false);
    expect(can('viewer', 'task:update')).toBe(false);
    expect(can('viewer', 'task:comment')).toBe(false);

    expect(can('owner', 'task:delete')).toBe(true);
    expect(can('admin', 'task:delete')).toBe(true);
    expect(can('member', 'task:delete')).toBe(false);
    expect(can('viewer', 'task:delete')).toBe(false);
  });
});
