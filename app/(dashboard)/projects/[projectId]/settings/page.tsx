import { notFound } from 'next/navigation';
import { listMembers, type MemberSummary } from '@/actions/members';
import { listProjectsForUser, type ProjectSummary } from '@/actions/projects';
import { getCurrentUser } from '@/lib/auth/session';
import { NotAMemberError, PermissionError } from '@/lib/permissions/guard';
import { MemberList } from '@/components/project/member-list';
import { InviteMemberForm } from '@/components/project/invite-member-form';
import { RenameProjectForm } from '@/components/project/rename-project-form';
import type { Role } from '@/lib/permissions';

async function loadSettingsData(
  projectId: string,
): Promise<{ members: MemberSummary[]; myRole: Role | undefined; project: ProjectSummary | undefined }> {
  try {
    const [members, currentUser, projects] = await Promise.all([
      listMembers(projectId),
      getCurrentUser(),
      listProjectsForUser(),
    ]);
    const myRole = members.find((m) => m.userId === currentUser?.userId)?.role;
    const project = projects.find((p) => p.id === projectId);
    return { members, myRole, project };
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
  const { members, myRole, project } = await loadSettingsData(projectId);
  if (myRole !== 'owner' && myRole !== 'admin') notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Cài đặt project</h1>
      {myRole === 'owner' && project && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Thông tin project</h2>
          <RenameProjectForm
            projectId={projectId}
            initialName={project.name}
            initialDescription={project.description}
          />
        </section>
      )}
      <section>
        <h2 className="mb-3 text-lg font-medium">Thành viên</h2>
        <InviteMemberForm projectId={projectId} />
        <MemberList projectId={projectId} members={members} currentUserRole={myRole} />
      </section>
    </div>
  );
}
