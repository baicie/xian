# shadcn/ui Component Inventory

This project uses the `base-nova` shadcn preset with Base UI primitives, Tailwind CSS v4, and Lucide icons. The source of truth is `apps/web/components.json` plus the official `@shadcn` registry.

## Installed

The following components are currently installed in `apps/web/src/components/ui`:

- alert-dialog
- avatar
- badge
- breadcrumb
- button
- card
- checkbox
- context-menu
- dialog
- dropdown-menu
- empty
- field
- input
- input-group
- kbd
- label
- resizable
- scroll-area
- select
- separator
- sheet
- sidebar
- skeleton
- sonner
- tabs
- textarea
- toggle
- toggle-group
- tooltip

## Official Components

The current official `@shadcn` registry supports these UI components:

- accordion
- alert
- alert-dialog
- aspect-ratio
- attachment
- avatar
- badge
- breadcrumb
- bubble
- button
- button-group
- calendar
- card
- carousel
- chart
- checkbox
- collapsible
- combobox
- command
- context-menu
- dialog
- direction
- drawer
- dropdown-menu
- empty
- field
- form
- hover-card
- input
- input-group
- input-otp
- item
- kbd
- label
- marker
- menubar
- message
- message-scroller
- native-select
- navigation-menu
- pagination
- popover
- progress
- radio-group
- resizable
- scroll-area
- select
- separator
- sheet
- sidebar
- skeleton
- slider
- sonner
- spinner
- switch
- table
- tabs
- textarea
- toggle
- toggle-group
- tooltip

Registry blocks and examples are not listed here because they are compositions rather than reusable UI primitives.

## Refresh Commands

Run from `apps/web`:

```bash
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest search @shadcn --limit 500
pnpm dlx shadcn@latest docs <component>
```

Before adding or updating a component:

```bash
pnpm dlx shadcn@latest add <component> --dry-run
pnpm dlx shadcn@latest add <component> --diff <component>.tsx
pnpm dlx shadcn@latest add <component>
```
