'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { removeMember, changeMemberRole, type MemberSummary } from '@/actions/members';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Role } from '@/lib/permissions';

export function MemberList({
  projectId,
  members,
  currentUserRole,
}: {
  projectId: string;
  members: MemberSummary[];
  currentUserRole?: Role;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRemove(userId: string) {
    startTransition(async () => {
      await removeMember(projectId, userId);
      router.refresh();
    });
  }

  function handleRoleChange(userId: string, role: Role) {
    startTransition(async () => {
      await changeMemberRole(projectId, userId, { role });
      router.refresh();
    });
  }

  return (
    <ul className="mt-4 space-y-2">
      {members.map((member) => (
        <li key={member.userId} className="flex items-center justify-between rounded border p-3">
          <div>
            <p className="font-medium">{member.name}</p>
            <p className="text-sm text-muted-foreground">{member.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {currentUserRole === 'owner' && member.role !== 'owner' ? (
              <Select defaultValue={member.role} onValueChange={(v) => handleRoleChange(member.userId, v as Role)} disabled={isPending}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="viewer">viewer</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span className="text-sm">{member.role}</span>
            )}
            {member.role !== 'owner' && (
              <Button variant="destructive" size="sm" disabled={isPending} onClick={() => handleRemove(member.userId)}>
                Xoá
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
