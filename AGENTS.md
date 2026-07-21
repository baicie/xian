# Repository Agent Rules

## UI Components

- For frontend UI work, search the shadcn registry before creating a component or styled interactive element.
- Prefer an installed component from `apps/web/src/components/ui` first. If shadcn supports the required component but it is not installed, inspect it with `pnpm dlx shadcn@latest docs <component>` and add it from `apps/web` with `pnpm dlx shadcn@latest add <component>`.
- Do not hand-roll menus, dialogs, confirmation dialogs, selects, popovers, tooltips, tabs, toggles, form controls, feedback states, or layout primitives when an appropriate shadcn component exists.
- Compose business-specific wrappers around shadcn components only when the wrapper removes repeated domain behavior or provides a stable typed API. Do not copy primitive behavior, positioning, focus management, keyboard navigation, or overlay handling into business components.
- Keep generated shadcn components in `apps/web/src/components/ui`. Before updating an installed component, use `--dry-run` and `--diff`; do not overwrite local changes without reviewing the diff.
- Use the project's configured shadcn base (`base-nova`), Base UI primitives, Lucide icons, aliases, semantic color tokens, and existing variants.
- Use `Separator` instead of decorative `<hr>`, `Empty` for empty states, `Skeleton` for loading placeholders, `Badge` for status labels, `AlertDialog` for destructive confirmation, and Sonner for transient notifications.
- The current registry and installed component inventory is documented in `docs/shadcn-components.md`. Refresh it using the commands in that document when `components.json` or the registry changes.

## Frontend Structure

- Organize frontend code by technical responsibility: application shell and route definitions in `apps/web/src/app`, API clients and transport types in `apps/web/src/api`, pure domain models in `apps/web/src/models`, route-level screens in `apps/web/src/pages`, reusable React composition in `apps/web/src/components`, non-UI helpers and caches in `apps/web/src/lib`, and hooks in `apps/web/src/hooks`.
- Group related reusable components below `src/components/<area>` when useful, but do not mix pages, API code, state helpers, and UI components in one domain directory.
- Do not introduce a generic `src/features` directory or top-level domain folders that combine multiple technical responsibilities.
- Keep shadcn primitives in `src/components/ui`.
- Keep the `apps/web/src` root limited to `main.tsx`, `styles.css`, and `vite-env.d.ts`. New source files must be placed in the appropriate responsibility directory above.
