# Task Flow — MVP Design

Date: 2026-09-03
Status: Approved for planning

## Purpose

Fullstack task/project management app (tương tự Trello ở phạm vi nhỏ):
users tạo project, mời thành viên với các role khác nhau, quản lý task
trên Kanban board. JWT auth tự viết. Tích hợp AI assistant (Claude API
để tạo task từ ngôn ngữ tự nhiên + tóm tắt tiến độ project) là mục
tiêu tương lai, **ngoài phạm vi spec này** — kiến trúc data model dưới
đây không cố tình chặn việc thêm AI sau, nhưng không thiết kế sẵn cho
nó.

## Non-goals (MVP)

- Không có lớp Workspace/Organization phía trên Project.
- Không có AI assistant (tạo task từ NL, tóm tắt tiến độ) — để sau.
- Không mời user chưa có tài khoản qua email link — chỉ mời user đã
  đăng ký sẵn.
- Không có granular permission (permission-based, tuỳ biến role) —
  chỉ 4 role cố định.
- Không có E2E test ở MVP.
- Chưa xác định OAuth/social login — chỉ email/password.

## Tech stack

- **Framework**: Next.js 15 (App Router) + TypeScript. Server Actions
  + Route Handlers làm backend — không có service backend riêng.
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM (drizzle-kit cho migration)
- **Auth**: JWT tự viết — access token (15 phút) + refresh token
  (7–30 ngày), cả hai lưu trong httpOnly cookie (`Secure`,
  `SameSite=Lax`). Password hash bằng argon2/bcrypt.
- **UI**: Tailwind CSS + shadcn/ui. Kéo-thả Kanban bằng `@dnd-kit`.
- **Validation**: Zod, dùng ở cả form (client) và server action (input
  thật sự được tin).
- **Testing**: Vitest cho unit/integration.
- **Deploy target**: Vercel + managed Postgres (Neon/Supabase). Local
  dev dùng Docker Compose chỉ cho Postgres.

## Project structure

```
src/
  app/
    (auth)/
      login/
      register/
    (dashboard)/
      projects/
        page.tsx                  # danh sách project của user
        [projectId]/
          page.tsx                # Kanban board
          settings/page.tsx       # đổi tên/mô tả, quản lý members
    api/
      auth/refresh/route.ts       # refresh token rotation
  lib/
    auth/                         # JWT sign/verify, session helpers, cookie helpers
    db/
      schema.ts                   # drizzle schema
      client.ts                   # drizzle client
    permissions/
      index.ts                    # role → permission matrix + can()
    validation/                   # zod schemas dùng chung
  actions/
    projects.ts                   # create/update/delete/listForUser
    members.ts                    # invite/remove/changeRole
    tasks.ts                      # create/update/delete/listByProject
    comments.ts                   # create/listByTask
  components/
    board/                        # Kanban board, column, card
    task/                         # task detail modal/sheet
    project/                      # project settings, member list
    ui/                           # shadcn primitives
  middleware.ts                   # auth check + auto refresh trên route (dashboard)
```

## Data model (Drizzle schema)

**users**
| column | type | note |
|---|---|---|
| id | uuid, pk | |
| email | text, unique | |
| password_hash | text | |
| name | text | |
| created_at | timestamp | |

**projects**
| column | type | note |
|---|---|---|
| id | uuid, pk | |
| name | text | |
| description | text, nullable | |
| owner_id | uuid, fk → users | người tạo, dùng để truy vấn nhanh |
| created_at | timestamp | |

**project_members**
| column | type | note |
|---|---|---|
| id | uuid, pk | |
| project_id | uuid, fk → projects, cascade delete | |
| user_id | uuid, fk → users | |
| role | enum: owner \| admin \| member \| viewer | |
| joined_at | timestamp | |

Unique constraint trên `(project_id, user_id)`.

**tasks**
| column | type | note |
|---|---|---|
| id | uuid, pk | |
| project_id | uuid, fk → projects, cascade delete | |
| title | text | |
| description | text, nullable | |
| status | enum: todo \| in_progress \| done | |
| priority | enum: low \| medium \| high \| urgent | |
| assignee_id | uuid, fk → users, nullable | |
| due_date | timestamp, nullable | |
| created_by | uuid, fk → users | |
| created_at | timestamp | |
| updated_at | timestamp | |

**task_comments**
| column | type | note |
|---|---|---|
| id | uuid, pk | |
| task_id | uuid, fk → tasks, cascade delete | |
| author_id | uuid, fk → users | |
| content | text | |
| created_at | timestamp | |

**refresh_tokens**
| column | type | note |
|---|---|---|
| id | uuid, pk | |
| user_id | uuid, fk → users | |
| token_hash | text | không lưu token gốc |
| expires_at | timestamp | |
| created_at | timestamp | |
| revoked_at | timestamp, nullable | |

Khi tạo project: tự động thêm creator vào `project_members` với role
`owner`. `projects.owner_id` là bản ghi tiện truy vấn, **nguồn sự
thật về quyền luôn là `project_members.role`** — mọi permission check
đọc từ bảng này, không đọc `owner_id`.

Xoá project cascade xoá `project_members`, `tasks`, `task_comments`
liên quan (qua FK `on delete cascade`).

## Auth flow

- `POST /register` (server action): validate (Zod) → hash password →
  tạo user → issue token pair → set cookie → coi như đã đăng nhập.
- `POST /login` (server action): verify password → issue access token
  (JWT ký bằng secret, chứa `userId`, exp 15p) + refresh token (random
  string, hash lưu vào `refresh_tokens`, exp 7–30 ngày) → set cả hai
  vào httpOnly cookie.
- `POST /logout`: set `revoked_at` cho refresh token hiện tại, clear
  cookie.
- `POST /api/auth/refresh` (route handler, gọi khi access token hết
  hạn): verify refresh token hash còn tồn tại và chưa revoke/hết hạn
  → rotate: revoke token cũ, issue token mới → set cookie mới. Nếu
  refresh token không hợp lệ → 401, client redirect `/login`.
- `middleware.ts`: chạy trên mọi route trong nhóm `(dashboard)`, kiểm
  tra access token; nếu hết hạn, gọi refresh; nếu refresh fail,
  redirect `/login`.

## Permission model

Role cố định theo project: `owner` | `admin` | `member` | `viewer`.
Permission suy ra từ role qua một permission matrix duy nhất trong
`lib/permissions/index.ts`:

```ts
type Role = 'owner' | 'admin' | 'member' | 'viewer';

const CAN = {
  'project:update':    ['owner'],
  'project:delete':    ['owner'],
  'member:invite':     ['owner', 'admin'],
  'member:remove':     ['owner', 'admin'],
  'member:changeRole': ['owner'],
  'task:create':       ['owner', 'admin', 'member'],
  'task:update':       ['owner', 'admin', 'member'],
  'task:delete':       ['owner', 'admin'],
  'task:comment':      ['owner', 'admin', 'member'],
} as const satisfies Record<string, Role[]>;

function can(role: Role, action: keyof typeof CAN): boolean {
  return CAN[action].includes(role);
}
```

Mọi server action liên quan đến project bắt đầu bằng: lấy user hiện
tại từ session → query `project_members` để lấy role thật (không tin
role gửi từ client) → `can(role, action)` → throw lỗi permission nếu
false. `viewer` không nằm trong bất kỳ list nào ở trên ngoài việc đọc
dữ liệu (đọc luôn được phép nếu là member của project, kiểm tra riêng
bằng việc user có record trong `project_members` hay không).

## Tính năng & màn hình

**Pages**
- `/login`, `/register`
- `/projects` — danh sách project user tham gia, kèm role, nút "Tạo
  project"
- `/projects/[projectId]` — Kanban board 3 cột (Todo / In Progress /
  Done), kéo-thả đổi status
- `/projects/[projectId]/settings` — đổi tên/mô tả, danh sách members
  (mời/xoá/đổi role) — chỉ hiển thị cho owner/admin
- Task chi tiết mở dạng modal/sheet trên board (không route riêng):
  title, description, assignee, priority, due date, danh sách comment

**Server actions**
- `actions/projects.ts`: `create`, `update`, `delete`, `listForUser`
- `actions/members.ts`: `invite` (theo email, chỉ user đã có tài
  khoản — báo lỗi rõ nếu email chưa đăng ký), `remove`, `changeRole`
- `actions/tasks.ts`: `create`, `update`, `delete`, `listByProject`
- `actions/comments.ts`: `create`, `listByTask`

## Error handling

- Server actions trả `{ error: string }` (hoặc field-level errors từ
  Zod) cho lỗi validation/nghiệp vụ thay vì throw — để UI hiển thị
  inline.
- Lỗi permission (403) và lỗi auth (401) throw thẳng, xử lý ở
  error boundary / middleware → redirect `/login` (401) hoặc trang
  "Không có quyền" (403).
- Mọi input từ client được Zod validate lại ở server action, kể cả
  khi đã validate ở form phía client.

## Testing

- Unit test (Vitest): `lib/permissions` (đủ ma trận role × action),
  `lib/auth` (sign/verify JWT, refresh token rotation).
- Integration test: một số server action quan trọng (tạo task, đổi
  role, xoá member, invite) chạy trên Postgres test DB (Docker).
- Không có E2E ở MVP (có thể thêm Playwright sau).

## Future work (out of scope)

- AI assistant qua Claude API: tạo task từ ngôn ngữ tự nhiên, tóm tắt
  tiến độ project. Khi triển khai, cân nhắc thêm bảng lưu lịch sử
  tương tác AI và một server action riêng gọi Claude API, tái dùng
  permission matrix hiện có (vd tạo task qua AI vẫn phải qua
  `can(role, 'task:create')`).
- Workspace/Organization layer nếu cần multi-tenant thật sự.
- Mời user chưa có tài khoản qua email invite link.
- Granular/tuỳ biến permission theo action.
- E2E test (Playwright).
