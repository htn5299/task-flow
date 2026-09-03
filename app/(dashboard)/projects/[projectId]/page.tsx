import { notFound } from 'next/navigation';
import { listTasksByProject } from '@/actions/tasks';
import { listMembers, type MemberSummary } from '@/actions/members';
import { getCurrentUser } from '@/lib/auth/session';
import { NotAMemberError, PermissionError } from '@/lib/permissions/guard';
import { KanbanBoard } from '@/components/board/kanban-board';
import type { Task } from '@/lib/db/schema';
import type { Role } from '@/lib/permissions';

async function loadBoardData(
  projectId: string,
): Promise<{ tasks: Task[]; members: MemberSummary[]; myRole: Role }> {
  try {
    const [tasks, members, currentUser] = await Promise.all([
      listTasksByProject(projectId),
      listMembers(projectId),
      getCurrentUser(),
    ]);
    const myRole = members.find((m) => m.userId === currentUser?.userId)?.role ?? 'viewer';
    return { tasks, members, myRole };
  } catch (err) {
    if (err instanceof NotAMemberError || err instanceof PermissionError) notFound();
    throw err;
  }
}

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { tasks, members, myRole } = await loadBoardData(projectId);

  return (
    <div className="p-6">
      <KanbanBoard projectId={projectId} initialTasks={tasks} members={members} myRole={myRole} />
    </div>
  );
}
