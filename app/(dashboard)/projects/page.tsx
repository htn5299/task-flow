import Link from 'next/link';
import { listProjectsForUser } from '@/actions/projects';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';
import { Badge } from '@/components/ui/badge';

export default async function ProjectsPage() {
  const projects = await listProjectsForUser();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects của bạn</h1>
        <CreateProjectDialog />
      </div>
      {projects.length === 0 ? (
        <p className="text-muted-foreground">Chưa có project nào. Tạo project đầu tiên của bạn.</p>
      ) : (
        <ul className="space-y-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent"
              >
                <div>
                  <p className="font-medium">{project.name}</p>
                  {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
                </div>
                <Badge variant="secondary">{project.role}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
