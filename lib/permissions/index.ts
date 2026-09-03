export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export type Action =
  | 'project:update'
  | 'project:delete'
  | 'member:invite'
  | 'member:remove'
  | 'member:changeRole'
  | 'task:create'
  | 'task:update'
  | 'task:delete'
  | 'task:comment';

const CAN = {
  'project:update': ['owner'],
  'project:delete': ['owner'],
  'member:invite': ['owner', 'admin'],
  'member:remove': ['owner', 'admin'],
  'member:changeRole': ['owner'],
  'task:create': ['owner', 'admin', 'member'],
  'task:update': ['owner', 'admin', 'member'],
  'task:delete': ['owner', 'admin'],
  'task:comment': ['owner', 'admin', 'member'],
} as const satisfies Record<Action, readonly Role[]>;

export function can(role: Role, action: Action): boolean {
  return (CAN[action] as readonly Role[]).includes(role);
}
