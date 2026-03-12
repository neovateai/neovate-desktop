# Drag-to-Sort Projects

## Goal

Allow users to reorder projects via drag-and-drop in the multi-project accordion view. The new order persists across app restarts and is reflected everywhere projects are listed (accordion view, project selector dropdown).

## Library

`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` + `@dnd-kit/modifiers`

## Data Layer

No schema changes. The existing `projects: Project[]` array order determines display order. Reordering rewrites the array in place.

### ProjectStore (`project-store.ts`)

Add method:

```ts
reorder(projectIds: string[]): void {
  const projects = this.getAll();
  const map = new Map(projects.map((p) => [p.id, p]));
  const reordered = projectIds.map((id) => map.get(id)).filter(Boolean);
  this.store.set("projects", reordered);
}
```

### Contract (`project/contract.ts`)

Add `reorderProjects` endpoint:

```ts
reorderProjects: base.input(z.object({ projectIds: z.array(z.string()) })).handler(...)
```

### Router (`project/router.ts`)

Add handler that calls `projectStore.reorder(input.projectIds)`.

### Renderer Store (`project/store.ts`)

Add `reorderProjects(projectIds: string[])` action that:

1. Optimistically reorders the local `projects` array
2. Calls the IPC handler to persist

## UI Layer

### ProjectAccordionList (`project-accordion-list.tsx`)

- Wrap the `Accordion` with `DndContext` + `SortableContext` (vertical list strategy)
- Each `AccordionItem` becomes a sortable item via `useSortable`
- The entire accordion header (title bar) acts as the drag handle — no extra grip icon
- Drag handle element is separate from `AccordionPrimitive.Trigger` to avoid toggling open/close on drag. Use `e.stopPropagation()` on pointer down to prevent conflicts
- Use `PointerSensor` with `activationConstraint: { distance: 5 }` to avoid accidental drags on click
- Use `restrictToVerticalAxis` modifier from `@dnd-kit/modifiers` for clean vertical-only dragging
- On `onDragEnd`: compute new ID order, call `reorderProjects`
- Use `DragOverlay` for visual feedback during drag

### ProjectSelector (`project-selector.tsx`)

No changes. It reads from the same `projects` array, so it automatically reflects the persisted order.

## Files to Change

| File                                                                    | Change                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `package.json`                                                          | Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@dnd-kit/modifiers` |
| `src/main/features/project/project-store.ts`                            | Add `reorder()` method                                                               |
| `src/shared/features/project/contract.ts`                               | Add `reorderProjects` contract                                                       |
| `src/main/features/project/router.ts`                                   | Add `reorderProjects` handler                                                        |
| `src/renderer/src/features/project/store.ts`                            | Add `reorderProjects` action                                                         |
| `src/renderer/src/features/agent/components/project-accordion-list.tsx` | Add DnD wrapping + drag handle                                                       |
