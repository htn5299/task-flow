import { listTasksByProject } from '@/actions/tasks';
import { listMembers } from '@/actions/members';
import { getCurrentUser } from '@/lib/auth/session';
import { KanbanBoard } from '@/components/board/kanban-board';

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [tasks, members, currentUser] = await Promise.all([
    listTasksByProject(projectId),
    listMembers(projectId),
    getCurrentUser(),
  ]);
  const myRole = members.find((m) => m.userId === currentUser?.userId)?.role ?? 'viewer';

  return (
    <div className="p-6">
      <KanbanBoard projectId={projectId} initialTasks={tasks} members={members} myRole={myRole} />
    </div>
  );
}
