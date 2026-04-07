# Image Paste UI Polish

## 1. Background

The current image attachment preview in the chat input is functional but minimal — 56x56 thumbnails with a red X remove button and basic animation. It needs visual polish to match the "quiet confidence" design language and be on par with modern AI chat apps.

## 2. Requirements Summary

**Goal:** Polish the image paste attachment preview from bare-bones to a refined, modern UI.

**In scope:** Thumbnail styling, remove button redesign, attachment area background, overflow handling, animation refinement.

**Out of scope:** Data model changes, paste/drop handling logic, IPC layer changes, lightbox/click-to-preview (YAGNI — users paste screenshots they just took).

## 3. Acceptance Criteria

1. Thumbnails render at 80px with rounded-lg corners and a subtle ring border
2. Remove button uses a dark semi-transparent style instead of red, appears on hover
3. Attachment area has border-t separator plus subtle background tint
4. Many attachments (10+) don't push editor off-screen — container has max-h with overflow
5. `.attachment-thumb` CSS rules in globals.css are removed (replaced by Tailwind utilities)
6. All transitions use the motion library with purposeful timing
7. Works in both light and dark themes
8. `bun ready` passes with no regressions

## 4. Decision Log

**1. Thumbnail size?**

- Options: A) Keep 56px · B) 80px · C) 96-120px
- Decision: **B) 80px** — Good balance of visibility vs space in the max-w-3xl input area

**2. Show filename?**

- Options: A) Always show · B) Hover only · C) Don't show
- Decision: **C) Don't show** — Matches minimal design; filename is in alt text for a11y

**3. Click behavior?**

- Options: A) Lightbox overlay · B) Inline expand · C) Nothing
- Decision: **C) Nothing** — YAGNI. Users paste screenshots they just took; they know what's in them. Add lightbox later if real demand appears.

**4. Remove button style?**

- Options: A) Keep red circle · B) Dark semi-transparent circle · C) Glass-morphism
- Decision: **B) Dark semi-transparent** — Quieter than red, standard in Claude/ChatGPT. Uses `bg-black/60 text-white` which is intentionally non-themed since it overlays the image itself, not a theme surface.

**5. Attachment area?**

- Options: A) Keep border-top only · B) Subtle background tint only · C) Border-top + background tint
- Decision: **C) Border-top + background tint** — The border-t provides a clear separator; the tint grounds thumbnails. Either alone may be too subtle.

**6. Overflow for many attachments?**

- Options: A) Unbounded flex-wrap · B) max-h with overflow-y-auto · C) Cap count
- Decision: **B) max-h with overflow-y-auto** — Prevents container from growing unbounded. ~200px max-h fits two rows of 80px thumbnails comfortably.

## 5. Design

### AttachmentPreview changes

- Container: `border-t border-border/50 bg-muted/30 px-3 py-2 max-h-[200px] overflow-y-auto`
- Thumbnails: `h-20 w-20 rounded-lg object-cover ring-1 ring-border/50` (up from h-14 w-14 rounded-md)
- Remove button: `bg-black/60 text-white` circle, 20px, inset from corner (`-right-1.5 -top-1.5`). Appears on hover via group-hover opacity transition. Replaces `bg-destructive text-destructive-foreground`
- Remove `attachment-thumb` CSS class usage; replace with inline Tailwind utilities
- No cursor-pointer (no click target)

### globals.css cleanup

- Remove `.attachment-thumb` and `.attachment-thumb img` rules (lines 397-405) — replaced by Tailwind utilities on the component

### Animation timing

- Thumbnail enter: scale 0.8->1, opacity 0->1, 150ms (keep existing)
- Thumbnail exit: scale 1->0.8, opacity 1->0, 120ms (keep existing)
- Remove button hover: opacity transition via Tailwind `transition-opacity`

## 6. Files Changed

- `src/renderer/src/features/agent/components/attachment-preview.tsx` — Restyle thumbnails, remove button, container; remove attachment-thumb class
- `src/renderer/src/assets/globals.css` — Remove `.attachment-thumb` CSS rules

## 7. Verification

1. [AC1] Paste an image — thumbnail renders at 80px with rounded-lg and ring
2. [AC2] Hover thumbnail — dark semi-transparent X button appears smoothly
3. [AC3] Attachment area has border-t separator and subtle background tint
4. [AC4] Paste 10+ images — container scrolls, doesn't push editor off-screen
5. [AC5] No `.attachment-thumb` class references remain in CSS or components
6. [AC6] Add/remove images — animations are smooth and purposeful
7. [AC7] Toggle theme — all elements render correctly in both modes
8. [AC8] Run `bun ready` — passes
