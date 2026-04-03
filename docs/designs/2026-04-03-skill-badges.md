# Design: Skill Badges

Add editorial badges to skills in the Discover tab, following the same pattern as provider badges.

## Badge Types

`SkillBadgeType = "recommended" | "new" | "deprecated" | "official" | "popular"`

Variant mapping (reusing existing Badge component variants):

| Badge       | Variant   | Color        |
| ----------- | --------- | ------------ |
| recommended | success   | green        |
| official    | info      | blue         |
| popular     | secondary | muted gray   |
| new         | default   | pink/primary |
| deprecated  | warning   | amber        |

Max 2 badges displayed per skill card (same as providers: `.slice(0, 2)`).

## Data Flow

- **Source**: Registry JSON only (option 1 — registry-driven, no persistence to installed skills)
- Add optional `badges` array to the remote skill schema
- Add `badges?: SkillBadgeType[]` to `RecommendedSkill` in shared types
- Installed skills do NOT carry badges — badges are only visible in the Discover tab and recommended skill detail modal

## Sort Order

Badges do NOT affect card sort order (visual labels only).

However, badges within a card are rendered in a fixed priority order (lowest number first):

| Badge       | Render priority |
| ----------- | --------------- |
| official    | 1               |
| recommended | 2               |
| popular     | 3               |
| new         | 4               |
| deprecated  | 5               |

This ensures badges always read consistently (e.g., `[Official] [New]`, never `[New] [Official]`).

## Files Changed

| File                                         | Change                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/shared/features/skills/types.ts`        | Add `SkillBadgeType` type, add `badges?` field to `RecommendedSkill`                    |
| `src/main/features/skills/skills-service.ts` | Add `badges` to `remoteSkillSchema` (optional `z.array(z.enum([...]))`)                 |
| `src/renderer/.../skill-discover-tab.tsx`    | Render badges on discover cards in the bottom badge row                                 |
| `src/renderer/.../skill-detail-modal.tsx`    | Render badges in recommended skill detail modal header                                  |
| `src/renderer/src/locales/en-US.json`        | Add `settings.skills.badge.recommended`, `.official`, `.popular`, `.new`, `.deprecated` |
| `src/renderer/src/locales/zh-CN.json`        | Add corresponding Chinese translations                                                  |

## UI Placement

### Discover Tab Cards

Badges appear in the bottom badge row of discover skill cards, alongside the existing `source` and `version` badges:

```
[initials]                    [install btn]
Skill Name
Description text...

[source] [v1.2.3] [Recommended] [New]
```

### Recommended Skill Detail Modal

Badges appear in the header metadata row, alongside source and version:

```
Skill Name
Description

[source] [v1.2.3] [Official] [Popular]
```

### Deprecated Card Dimming

Skills with a `deprecated` badge get `opacity-60` on the card (matching the provider template picker pattern) so they visually recede.

### Installed Tab

No changes. Installed skills do not display editorial badges.

## Badge Variant Map (code reference)

```ts
const skillBadgeVariantMap: Record<
  SkillBadgeType,
  "success" | "info" | "secondary" | "default" | "warning"
> = {
  recommended: "success",
  official: "info",
  popular: "secondary",
  new: "default",
  deprecated: "warning",
};

const skillBadgeRenderPriority: Record<SkillBadgeType, number> = {
  official: 1,
  recommended: 2,
  popular: 3,
  new: 4,
  deprecated: 5,
};
```
