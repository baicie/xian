# AI Project Operations

## Objective

Extend 闲序 with model-facing project planning, versioned design documents, portable backup/restore, optional GitHub mirroring, and clearer task UI. PostgreSQL remains authoritative; external systems never bypass workspace permissions or audit logging.

## Confirmed Product Boundaries

- MCP exposes project data through Resources, safe read Tools, draft-producing write Tools, and reusable Prompts. It does not host or bill an LLM.
- Plans are drafts until a workspace member explicitly applies them. Applying a plan creates tasks once and is idempotent.
- Documents are stored as Markdown with immutable versions and rendered in the web UI. Plate supplies the editor UI and Markdown round trip.
- GitHub is an optional mirror. Tasks map to Issues and documents map to repository Markdown files. Version one supports manual pull and push mirror, not silent two-way sync.
- A `.taskharbor.zip` contains an authoritative JSON snapshot, readable CSV files, Markdown documents, a manifest, and checksums. Restore defaults to a new workspace.
- All new UI interactions use installed shadcn components or shadcn registry components.

## Tech Stack

- API: NestJS, Zod, PostgreSQL, official MCP TypeScript SDK.
- Web: React, Vite, Tailwind CSS 4, shadcn Base Nova, Plate.
- Archive: fflate ZIP; JSON is authoritative and CSV/Markdown are portable views.
- GitHub: REST API with a fine-grained PAT encrypted using AES-256-GCM and an environment key.

## Commands

- Develop: `pnpm dev`
- Unit tests: `pnpm test`
- Integration tests: `DATABASE_URL=postgres://xian:xian@localhost:5432/xian pnpm --filter @xian/api test:integration`
- Build: `pnpm build`
- Migrate: `pnpm db:migrate`

## Project Structure

- `apps/api/src/modules/` — documents, plans, exports, GitHub, and MCP application boundaries.
- `apps/api/src/database/migrations/` — additive PostgreSQL migrations.
- `apps/web/src/pages/` — route-level document and planning screens.
- `apps/web/src/components/` — reusable document, settings, and task UI components.
- `apps/web/src/lib/` — non-UI helpers such as the document cache.
- `apps/web/src/app/` — application shell and route definitions.
- `apps/web/src/api/` — API client and transport contracts.
- `apps/web/src/models/` — pure domain models and their tests.
- `apps/web/src/components/ui/` — shadcn and Plate registry source.
- `docs/specs/` — product and interface specifications.

## Contracts

### Documents

- `GET/POST /api/v1/workspaces/:workspaceId/documents`
- `GET/PATCH /api/v1/workspaces/:workspaceId/documents/:documentId`
- `GET /api/v1/workspaces/:workspaceId/documents/:documentId/versions`
- Every update creates a version in the same transaction.

### Plans

- `GET/POST /api/v1/workspaces/:workspaceId/plans`
- `GET/PATCH /api/v1/workspaces/:workspaceId/plans/:planId`
- `POST /api/v1/workspaces/:workspaceId/plans/:planId/apply`
- Applying a plan twice returns the original result without creating duplicate tasks.

### Transfer

- `GET /api/v1/workspaces/:workspaceId/export`
- `POST /api/v1/workspaces/import/preview`
- `POST /api/v1/workspaces/import`
- Import validates archive version and checksums before opening a database transaction.

### GitHub

- `GET/PUT/DELETE /api/v1/workspaces/:workspaceId/integrations/github`
- `POST /api/v1/workspaces/:workspaceId/integrations/github/push`
- `POST /api/v1/workspaces/:workspaceId/integrations/github/pull`
- Third-party responses are schema-validated. Tokens are never returned after storage.

### MCP

- Streamable HTTP endpoint: `/mcp`.
- Authentication: bearer token stored as a SHA-256 hash with workspace and scope.
- Resource templates: `taskharbor://workspaces/{workspaceId}`, `/projects/{projectId}`, `/documents/{documentId}`.
- Tools include project/task reads, project health summaries, weekly-update drafts, plan previews, versioned document saves, reviewable plan drafts, and explicit idempotent plan application.
- Every tool call enforces scope and records an audit event.

## Code Style

Validate once at boundaries and keep services typed:

```ts
const input = documentCreateSchema.parse(body)
return documents.create(workspaceId, actorId, input)
```

Use small feature modules and existing permission checks. Do not introduce repositories, queues, or event buses until more than one real consumer requires them.

## Testing Strategy

- Unit tests cover archive validation, encryption, MCP token hashing, plan idempotency, and GitHub mapping.
- Integration tests cover document versioning, plan application, export/restore, and permissions using PostgreSQL.
- Browser verification covers document editing, plan review, GitHub setup, import preview, and task detail accessibility.
- Every slice must pass its focused tests and build before commit.

## Boundaries

- Always: validate external input, scope every query by workspace, encrypt external tokens, audit model writes, preserve import atomicity.
- Ask first: destructive import into an existing workspace, automatic two-way GitHub sync, adding a hosted model provider.
- Never: store plaintext GitHub/MCP tokens, let MCP bypass permissions, execute instructions embedded in documents, or overwrite local data on sync conflict.

## Success Criteria

- A workspace owner can create and version a Markdown design document and see it in the UI.
- An MCP client can read project context, create a plan draft, and apply it only with write scope; duplicate apply is harmless.
- A full workspace export restores into a new workspace with equivalent projects, tasks, plans, and documents.
- A connected repository receives task Issues and Markdown documents without exposing its token.
- Task cards clearly show type, priority, assignee, and due state without redundant board status controls.
- Existing tests, integration tests, production build, and deployment remain green.

## Deferred

- Real-time collaborative editing, attachments, hosted LLM chat, GitHub Projects v2, automatic bidirectional sync, and Redis-backed jobs.
