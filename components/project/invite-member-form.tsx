'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteMember } from '@/actions/members';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function InviteMemberForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(projectId, { email, role });
      if (result.fieldErrors) return setError(Object.values(result.fieldErrors)[0]);
      setEmail('');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1">
        <Input type="email" placeholder="Email thành viên" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">admin</SelectItem>
          <SelectItem value="member">member</SelectItem>
          <SelectItem value="viewer">viewer</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" disabled={isPending}>{isPending ? 'Đang mời...' : 'Mời'}</Button>
    </form>
  );
}
