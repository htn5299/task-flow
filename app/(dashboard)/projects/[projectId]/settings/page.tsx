import { notFound } from 'next/navigation';
import { listMembers, type MemberSummary } from '@/actions/members';
import { getCurrentUser } from '@/lib/auth/session';
import { NotAMemberError, PermissionError } from '@/lib/permissions/guard';
import { MemberList } from '@/components/project/member-list';
import { InviteMemberForm } from '@/components/project/invite-member-form';
import type { Role } from '@/lib/permissions';

async function loadSettingsData(
  projectId: string,
): Promise<{ members: MemberSummary[]; myRole: Role | undefined }> {
  try {
    const [members, currentUser] = await Promise.all([listMembers(projectId), getCurrentUser()]);
    const myRole = members.find((m) => m.userId === currentUser?.userId)?.role;
    return { members, myRole };
  } catch (err) {
    if (err instanceof NotAMemberError || err instanceof PermissionError) notFound();
    throw err;
  }
}

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { members, myRole } = await loadSettingsData(projectId);
  if (myRole !== 'owner' && myRole !== 'admin') notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Cài đặt project</h1>
      <section>
        <h2 className="mb-3 text-lg font-medium">Thành viên</h2>
        <InviteMemberForm projectId={projectId} />
        <MemberList projectId={projectId} members={members} currentUserRole={myRole} />
      </section>
    </div>
  );
}
