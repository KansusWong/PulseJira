# RebuilD Frontend Redesign — Design Spec

## Overview

Full redesign of RebuilD's frontend, addressing design inconsistencies, poor visual quality, and interaction issues. Adopts Claude.ai's Artifacts layout pattern with Glassmorphism Dark styling and Amber accent color.

**Design Direction:** Glassmorphism Dark + Amber (#f59e0b) accent
**Reference:** Claude.ai web (Artifacts pattern)
**Scope:** All pages — Chat, Sidebar, Settings, Knowledge Graph
**Cleanup:** Remove Signals feature, clean dead code
**Theme:** Dark mode only (no light mode planned)

---

## 1. Design Tokens

### 1.1 Color Palette

**Backgrounds (5 layers):**

| Token              | Value                      | Usage                   |
|--------------------|----------------------------|-------------------------|
| `--bg-base`        | `#050505`                  | App background          |
| `--bg-surface`     | `#0a0a0b`                  | Panels, sidebar         |
| `--bg-elevated`    | `#141415`                  | Cards, inputs           |
| `--bg-glass`       | `rgba(255,255,255,0.04)`   | Glass panels (+ blur)   |
| `--bg-hover`       | `rgba(255,255,255,0.06)`   | Hover state             |

**Accent (Amber, 4 levels):**

| Token              | Value                          | Usage              |
|--------------------|--------------------------------|---------------------|
| `--accent`         | `#f59e0b`                      | Primary accent      |
| `--accent-hover`   | `#d97706`                      | Accent hover        |
| `--accent-subtle`  | `rgba(245,158,11,0.12)`       | Tags, badges        |
| `--accent-ghost`   | `rgba(245,158,11,0.06)`       | Hover tint          |

**Text (3 levels):**

| Token              | Value      | Usage                    |
|--------------------|------------|--------------------------|
| `--text-primary`   | `#f4f4f5`  | Headings, primary        |
| `--text-secondary` | `#a1a1aa`  | Body text                |
| `--text-muted`     | `#52525b`  | Captions, timestamps     |

**Borders (3 levels):**

| Token              | Value                          | Usage              |
|--------------------|--------------------------------|---------------------|
| `--border-subtle`  | `rgba(255,255,255,0.06)`      | Default borders     |
| `--border-default` | `rgba(255,255,255,0.10)`      | Emphasized          |
| `--border-accent`  | `rgba(245,158,11,0.25)`       | Active/focus        |

**Agent colors** remain as defined in `agent-ui-meta.ts` — they use Tailwind classes (e.g., `bg-emerald-600`) and are exempt from the CSS variable migration since they are only consumed by agent-specific components.

### 1.2 Token Implementation

All tokens are declared as CSS custom properties in `:root` within `app/globals.css`, replacing the existing color variables. Tailwind config (`tailwind.config.ts`) extends its theme to reference these variables (following the existing pattern used for `--background`, `--foreground`, etc.). New utility classes (e.g., `bg-glass`, `border-subtle`, `glass-1`, `glass-2`, `glass-3`) are added via Tailwind plugin or `@layer utilities` in globals.css.

### 1.3 Typography

**Font:** Inter, installed via `@fontsource/inter` (self-hosted for performance). Import in `app/layout.tsx`.

| Level       | Size    | Weight | Usage                      |
|-------------|---------|--------|----------------------------|
| `--text-xl` | 20px    | 600    | Page titles                |
| `--text-md` | 15px    | 500    | Section headings, card titles |
| `--text-base`| 13.5px | 400    | Body text, messages        |
| `--text-sm` | 12px    | 400    | Captions, metadata         |
| `--text-label`| 10px  | 500    | Labels (uppercase, tracked) |

**Code font:** `JetBrains Mono, Fira Code, monospace` for code blocks and Artifacts panel.

### 1.4 Glassmorphism System

Three tiers of glass effect:

| Level | Blur   | Opacity | Border Opacity | Usage                    |
|-------|--------|---------|----------------|--------------------------|
| 1     | 8px    | 0.03    | 0.06           | Sidebar, background panels |
| 2     | 16px   | 0.06    | 0.10           | Cards, popups, dropdowns |
| 3     | 24px   | 0.10    | 0.15           | Modals, floating input, graph popup |

All glass panels use `backdrop-filter: blur(Xpx)` + `background: rgba(255,255,255, opacity)` + `border: 1px solid rgba(255,255,255, border-opacity)`.

### 1.5 Spacing Scale

| Token         | Value | Usage           |
|---------------|-------|-----------------|
| `--space-xs`  | 4px   | Tight gaps      |
| `--space-sm`  | 8px   | Inner padding   |
| `--space-md`  | 12px  | Component gaps  |
| `--space-lg`  | 16px  | Card padding    |
| `--space-xl`  | 24px  | Section gaps    |
| `--space-2xl` | 32px  | Page sections   |

### 1.6 Border Radius Scale

| Token           | Value  | Usage               |
|-----------------|--------|----------------------|
| `--radius-sm`   | 4px    | Badges, small tags   |
| `--radius-md`   | 8px    | Inputs, buttons      |
| `--radius-lg`   | 12px   | Cards, panels        |
| `--radius-xl`   | 16px   | Modals, large panels |
| `--radius-full` | 999px  | Pills, avatars       |

### 1.7 Shadows

| Token             | Value                               | Usage         |
|-------------------|--------------------------------------|---------------|
| `--shadow-sm`     | `0 1px 2px rgba(0,0,0,0.3)`        | Buttons       |
| `--shadow-md`     | `0 4px 12px rgba(0,0,0,0.4)`       | Cards         |
| `--shadow-lg`     | `0 8px 32px rgba(0,0,0,0.5)`       | Modals, popup |
| `--shadow-glow`   | `0 0 20px rgba(245,158,11,0.15)`    | Accent glow   |

---

## 2. Layout & Chat Page

### 2.1 Overall Layout — Three Column

```
┌──────────┬─────────────────────┬─────────────────────┐
│ Sidebar  │     Chat Area       │   Artifacts Panel   │
│ 220px /  │     (flex: 1)       │     (flex: 1)       │
│  52px    │                     │   (when open)       │
│          │                     │                     │
│          │                     │                     │
└──────────┴─────────────────────┴─────────────────────┘
```

### 2.2 Two States

**State 1 — No Artifact open:**
- Sidebar: 220px expanded (or 52px if user manually collapsed)
- Chat: full remaining width, messages centered at `max-width: 680px`
- Input bar: centered, matches chat content width
- No right panel

**State 2 — Artifact open (click file reference in chat):**
- Sidebar: auto-collapses to 52px (icon-only), unless user already collapsed it
- Chat: flex:1 (~50% of remaining space)
- Artifacts: flex:1 (~50%), separated by draggable handle
- Min-width per panel: 320px
- Drag handle: 6px wide, subtle 3px visible bar

**Sidebar collapse state machine:**
The sidebar has two independent flags: `userCollapsed` (manual toggle) and `autoCollapsed` (triggered by artifact panel). When artifact panel closes, sidebar restores to `userCollapsed` state — if the user had it expanded before, it re-expands; if they had it collapsed, it stays collapsed.

**Transitions:**
- Artifact panel open: 300ms ease-out slide from right
- Sidebar collapse: 200ms ease-out
- Drag resize: real-time, no animation
- Close: X button or Esc key

### 2.2.1 Artifacts Store Shape (Zustand)

```typescript
interface ArtifactSlice {
  artifactPanelOpen: boolean;
  openArtifacts: ArtifactRef[];      // ordered list of open tabs
  activeArtifactId: string | null;   // currently visible tab
  openArtifact: (ref: ArtifactRef) => void;
  closeArtifact: (id: string) => void;
  setActiveArtifact: (id: string) => void;
  closeAllArtifacts: () => void;
}

interface ArtifactRef {
  id: string;           // unique ID (messageId + index, or file path hash)
  type: 'code' | 'json' | 'pptx' | 'image' | 'markdown' | 'pdf';
  filename: string;     // display name
  filePath?: string;    // vault path if applicable
  content?: string;     // inline content (for code/json from chat)
  url?: string;         // URL for files served from API
}
```

**How artifacts connect to chat messages:** When the assistant produces a file (code, schema, PPT), the SSE stream includes artifact metadata in the message. The `MessageBubble` component renders inline artifact reference cards from this metadata. Clicking a card calls `openArtifact()` which adds it to the tabs and shows the panel. The existing `studioPanel` and SSE-triggered right panels (Plan, DM, etc.) use a separate `rightPanel` slot — they take priority over artifacts when active.

**Priority:** SSE-triggered panels (PlanPanel, DMDecisionPanel, etc.) > Artifacts panel. When an SSE panel activates, artifacts panel hides but preserves its tab state. When SSE panel dismisses, artifacts panel restores if it had open tabs.

### 2.3 Chat Messages

**User messages:**
- Right-aligned
- Glass bubble (level 1): `bg-glass` + `border-subtle`
- Border radius: `16px 16px 4px 16px` (bottom-right sharp)
- Max-width: 80% (State 1) / 85% (State 2)

**Assistant messages:**
- Left-aligned with RebuilD avatar (28px, amber square with rounded corners)
- No bubble wrapping — text flows in a transparent container with left padding (matching avatar width + gap)
- Container: no background, no border, `padding: 0`, natural line spacing (line-height: 1.7)
- Text color: `--text-secondary` (#a1a1aa), bold spans use `--text-primary`
- Inline code: amber-tinted `background: rgba(245,158,11,0.1); color: #fbbf24; border-radius: 4px; padding: 1px 6px`
- Artifact reference cards inline after message text

**Artifact reference cards (inline in messages):**
- Glass card: `bg-glass` + `border-subtle`, `border-radius: 10px`
- Left: colored icon square (color matches file type)
- Right: filename + type label ("JSON · Click to preview")
- Click → opens in Artifacts panel
- Active/viewing state: brighter border + "viewing" label

### 2.4 Input Bar

- Position: bottom of chat area, centered with chat content
- Style: Glass level 2 (`blur(16px)`, `border-default`)
- Border radius: 14px
- Layout: `[+] [input text...] [model selector] [send]`
- Attachment (+): left, 32px icon button
- Model selector: ghost button (`bg-hover`, `border-subtle`)
- Send button: 32px, amber background, black arrow icon
- Auto-expand for multi-line, max 6 lines before scroll

### 2.5 Streaming State

- RebuilD avatar: amber square pulses (1.5s ease-in-out infinite)
- Step indicator: amber dot pulse + text label ("Analyzing vault structure...")
- Streaming text: normal rendering + 2px amber blinking cursor at end
- Cursor blink: 1s step-end infinite

### 2.6 Top Bar

- Height: 48px (both states — consistent, no layout jump)
- Left: conversation title (`--text-secondary`)
- Right: search icon button (optional)
- Border: `border-bottom: 1px solid rgba(255,255,255,0.04)`

### 2.7 Artifacts Panel

- Background: `#080808` (slightly different from sidebar)
- Header: filename with icon + Copy / Download / Close buttons
- Tab bar: multiple open artifacts as tabs, active tab = amber bottom border
- Code rendering: `JetBrains Mono`, line numbers in `--text-muted`, amber-tinted syntax highlighting
- Footer: file type + line count + file path
- Supported types: code files (.ts/.tsx/.js/.py/etc.), JSON, Markdown (rendered), PPT preview (iframe), images (.png/.jpg/.svg), PDF (iframe). Unsupported types show a download prompt.

---

## 3. Sidebar

### 3.1 Expanded State (220px)

**Structure top to bottom:**
1. **Logo bar:** RebuilD icon (28px amber square) + "RebuilD" text + collapse toggle (`«`)
2. **New Chat button:** amber outline, `[+] New Chat`, full-width
3. **Search bar:** glass input, magnifier icon, "Search chats..."
4. **Conversation list** (scrollable):
   - Grouped by: Today / Yesterday / Earlier (auto-grouped)
   - Group headers: `--text-label` style (9px, uppercase, tracked)
   - Active: `border-left: 2px solid --accent` + `bg: --accent-ghost` + `--text-primary` text
   - Inactive: no left border + `--text-secondary` (recent) or `--text-muted` (older)
   - Each item: title (12px, truncated) + time (9.5px, muted)
   - Hover: `bg-hover` + right context menu dots (rename, delete)
5. **Bottom navigation** (2 items):
   - Knowledge Graph (icon + label)
   - Settings (icon + label, amber highlight when active)

### 3.2 Collapsed State (52px)

- Logo: 32px amber square only
- New Chat: 34px square "+" button, amber outline
- Conversations: first-letter avatars (34px), active = amber left border
- Hover on avatar: tooltip with full title
- Bottom nav: icon-only (Graph, Settings)
- Auto-collapses when Artifact panel opens; auto-expands when closed

### 3.3 Removed from Sidebar

- Skills list → moved to Settings > Skills tab
- PPT list → accessible via Chat attachments or Settings
- Files list → accessible via Chat attachments
- Settings accordion sections → Settings is now a full page
- Signals → removed entirely from the product

---

## 4. Settings Page

### 4.1 Layout

- Full page (no Artifacts panel)
- Sidebar: collapsed (52px) or expanded, user's choice
- Header: page title (20px/600) + subtitle (12.5px/muted)
- Tab bar: underline style, amber active indicator
- Content: max-width 720px, vertical scroll

### 4.2 Tabs

5 tabs (consolidated from existing 9):

| New Tab        | Absorbs from current tabs                              |
|----------------|--------------------------------------------------------|
| **Agent**      | `agents` + `mates` (merged into one agent config view) |
| **LLM Pool**   | `llm-pool` + `advanced-platforms` (API keys here too)  |
| **Skills**     | New — Skills list moved from sidebar + `SkillStudioPanel` |
| **Preferences**| `setup` + user preferences + `advanced-topics`         |
| **Advanced**   | `advanced` + `webhooks` + `usage` + SQL/env export     |

- Active tab: `color: --accent` + `border-bottom: 2px solid --accent`
- Inactive: `color: --text-muted`, no border
- Hover: `color: --text-secondary`

### 4.3 Card Pattern (universal)

Every settings section uses the same card structure:

```
┌─────────────────────────────────────────────┐
│ [Title]               [Description]   [Icon]│  ← Header (border-bottom)
├─────────────────────────────────────────────┤
│                                             │
│  Form fields, toggles, selection cards      │  ← Body
│                                             │
└─────────────────────────────────────────────┘
```

- Card: Glass level 1, `border-radius: --radius-lg`
- Header: `padding: 16px 18px`, title (14px/500) + description (11px/muted) left, icon (36px square, tinted background) right
- Body: `padding: 16px 18px`
- Cards stack with `gap: 16px`

### 4.4 Form Elements

- **Input:** `bg: --bg-glass`, `border: --border-subtle`, focus → `border: --border-accent`
- **Label:** 11px, `color: --text-muted`, `font-weight: 500`, 6px margin-bottom
- **Textarea:** same as Input, min-height 60px, auto-expand
- **Toggle:** 36x20px, ON = amber background + white dot right, OFF = zinc-700 + dot left
- **Selection cards:** row of options, active = `border: --border-accent` + `bg: --accent-ghost`
- **Ghost buttons:** `border: --border-subtle` + `color: --text-muted`, hover → `bg-hover`
- **Primary button:** `bg: --accent` + `color: #000`
- **Status dots:** green (#22c55e) connected, red (#ef4444) error, amber (#f59e0b) pending
- **Add button:** dashed border, centered "+" text

### 4.5 Auto-save

- No explicit save button — changes save on blur/change
- Feedback: subtle toast at bottom-right corner, 2s fade

---

## 5. Knowledge Graph Redesign

### 5.1 Canvas Background

- Base: `#050505` (not pure black)
- Ambient glow: 2-3 radial gradient spots (amber tint, 6% opacity) scattered in background
- Creates warm, atmospheric depth instead of flat black

### 5.2 Node Design

Each node type has unique color, icon, and size. Type keys match existing code (`VaultGraph.tsx` uses lowercase keys):

| Key (code) | Display Name | Color    | Radius | Icon (Canvas drawn) |
|------------|-------------|----------|--------|---------------------|
| `mate`     | Mate        | #34d399  | 13     | Person silhouette   |
| `mission`  | Mission     | #60a5fa  | 16     | Target/crosshair    |
| `epic`     | Epic        | #818cf8  | 14     | Package             |
| `doc`      | Document    | #fbbf24  | 11     | File/page           |
| `code`     | Code        | #c084fc  | 11     | `</>` monospace     |
| `skill`    | Skill       | #22d3ee  | 8      | Lightning bolt      |
| `tool`     | Tool        | #fb923c  | 8      | Wrench              |
| `pptx`     | PPTX        | #f472b6  | 10     | Chart/bars          |
| `task`     | Task        | #2dd4bf  | 10     | Checkbox            |

**Node rendering (Canvas 2D API):**
1. Outer glow: draw a circle at 120% radius using `ctx.shadowBlur = 12` + `ctx.shadowColor = nodeColor` at 15% opacity, then clear shadow for subsequent draws
2. Dark filled circle: `ctx.arc()` + `ctx.fill()` with `#0a0a0b`
3. Colored border: `ctx.stroke()` with node color, `lineWidth: 1.5`
4. Icon drawn inside: `ctx.fillText()` for emoji/text icons, or `ctx.beginPath()` + path commands for simple geometric icons
5. Label below: node name (Inter, text-primary)
6. Type label below name: uppercase, node color, 60% opacity, 7-8px

**Performance note:** For graphs with 100+ edges, gradient creation per edge per frame can be expensive. Optimization: cache `CanvasGradient` objects per edge and only recreate when node positions change significantly (> 5px delta).

**States:**
- Default: border at 90% opacity
- Hover: outer glow ring pulses, label brightens to text-primary
- Selected: full opacity border + white 2.5px stroke + larger glow

### 5.3 Edge Design

- **Color:** Linear gradient from source node color → target node color, using `ctx.createLinearGradient(src.x, src.y, tgt.x, tgt.y)` with color stops at 0% (source color, 40% opacity) and 100% (target color, 40% opacity)
- **Glow:** Draw the edge twice — first pass with `lineWidth: 4`, lower opacity (30%), acting as a soft glow; second pass with `lineWidth: 1.5` at full opacity for the sharp line
- **Line:** 1.5px stroke, 80% opacity
- **Arrows:** Triangular arrowhead at target end, filled with target color
- **Selected state:** connected edges glow amber; unconnected edges fade to 20% opacity
- **Hover:** edge brightens + relationship label appears at midpoint (glass background pill)

### 5.4 Legend (Bottom-Left)

- Glass level 2 panel
- Each type: colored dot (6px) + icon + i18n label (uses `useTranslation()` — `TYPE_LABELS` for en, `TYPE_LABELS_ZH` for zh)
- Clickable: filters graph to show only that type
- Active filter: amber ring around the dot
- Layout: horizontal flex-wrap

### 5.5 Stats Badge (Top-Left)

- Glass level 1, small pill
- Content: `{N} nodes · {M} edges`
- Font: `--text-sm`, `--text-muted`

### 5.6 Node Detail Popup

- Glass level 3 (strongest blur + shadow)
- Border radius: 16px
- Header: gradient tint (node color at 6%) + icon + name + type label
- Body sections (varies by node type):
  - **Mate:** description, domains tags, status, can_lead
  - **Mission:** status badge, lead mate, team members, token budget progress bar
  - **Artifacts (doc/code/skill/tool/pptx):** description, tags, reuse count, creator
  - **Connections:** list of related nodes with colored dots, relationship labels, click to navigate
- Popup follows node position via rAF (existing logic, keep)
- Close: X button or click outside

### 5.7 Interactions

- Hover node: outer glow pulse animation
- Click node: popup appears, connected edges highlight
- Click connection in popup: smooth camera pan (400ms) to target node
- Zoom: scroll, 0.2x – 10x range
- Drag: nodes are draggable
- Fit to screen: auto zoom-to-fill on data load (existing logic, keep)

---

## 6. Component Library Updates

### 6.1 Button

Current: 4 variants. Updated to 5:

| Variant   | Background        | Border          | Text Color       |
|-----------|-------------------|-----------------|------------------|
| primary   | `--accent`        | none            | `#000`           |
| secondary | `--bg-glass`      | `--border-default` | `--text-secondary` |
| ghost     | transparent       | `--border-subtle` | `--text-muted`   |
| danger    | `rgba(239,68,68,0.1)` | `rgba(239,68,68,0.2)` | `#ef4444` |
| icon      | transparent       | none            | `--text-muted`   |

Sizes: `sm` (7px 10px), `md` (9px 14px), `lg` (11px 18px). Border radius: `--radius-md`.

### 6.2 Input

- Background: `--bg-glass`
- Border: `--border-subtle`, focus → `--border-accent`
- Text: `--text-primary`
- Placeholder: `--text-muted`
- Border radius: `--radius-md`
- Consistent across all inputs (no more bg-black / bg-zinc-900 mix)

### 6.3 Badge

| Variant  | Background                      | Text Color  |
|----------|---------------------------------|-------------|
| default  | `rgba(255,255,255,0.06)`       | `--text-secondary` |
| accent   | `--accent-subtle`              | `--accent`  |
| success  | `rgba(34,197,94,0.12)`         | `#22c55e`   |
| error    | `rgba(239,68,68,0.12)`         | `#ef4444`   |
| info     | `rgba(96,165,250,0.12)`        | `#60a5fa`   |

Border radius: `--radius-full`. Font: `--text-label`.

### 6.4 Toggle

- Track: 36x20px, rounded-full
- ON: `bg: --accent`, knob slides right
- OFF: `bg: #3f3f46`, knob slides left
- Knob: 16px white circle with subtle shadow
- Transition: 200ms ease

### 6.5 Panel (Side Panel Wrapper)

- Keep existing structure
- Update styling: Glass level 1 background
- Header: sticky, `--border-subtle` bottom border
- Consistent with new token system

---

## 7. Cleanup & Removals

### 7.1 Signals Feature — Remove Entirely

**Delete:**
- `app/(dashboard)/signals/page.tsx`
- `components/signals/SignalCard.tsx`
- `components/signals/SignalDetailDrawer.tsx`
- Remove Signals nav item from Sidebar
- Remove Signals-related store slices
- Remove Signals API routes if they exist

### 7.2 Dead Right Panel Code — Evaluate

The following panels are technically still wired via SSE but the user indicated they may not be active:
- `PlanPanel.tsx`
- `DMDecisionPanel.tsx`
- `ClarificationForm.tsx`
- `ArchitectResumePanel.tsx`
- `SolutionPreviewPanel.tsx`
- `AgentTeamPanel.tsx`
- `ToolApprovalPanel.tsx`

**Action:** Keep these components but restyle them to match the new design system. They activate via SSE events and may still be triggered. If confirmed unused during implementation, remove at that time.

### 7.3 Sidebar Cleanup

Remove from sidebar component:
- Skills browser section
- PPT list section
- Files list section
- Settings accordion (3 sections)
- Signals navigation item

---

## 8. UI States

### 8.1 Empty State (No Conversation)

When no conversation is active (fresh start or all deleted):
- Chat area shows centered RebuilD logo (64px amber square) + "Start a new conversation" text (`--text-muted`)
- Input bar visible at bottom (ready to type)
- No top bar title

### 8.2 Loading / Skeleton States

- **Conversation list:** 4-5 shimmer bars (animated gradient sweep on `--bg-elevated` background)
- **Chat messages:** pulsing placeholder blocks (2 rectangles, one right-aligned short, one left-aligned longer)
- **Settings cards:** card outline with shimmer content area
- **Graph:** centered `Spinner` component (existing) on `--bg-base` background
- **Artifacts panel:** skeleton code block (line-height placeholder bars)
- Shimmer animation: `linear-gradient` sweep from left to right, 1.5s duration, infinite

### 8.3 Error States

- **Chat send failure:** message bubble gets red left border + retry button (ghost, danger variant)
- **Graph API failure:** centered error message with icon + "Retry" button (primary variant)
- **Artifact load failure:** panel body shows "Failed to load" + file info + "Retry" / "Close" buttons
- **Settings save failure:** toast with red accent, "Failed to save — Retry" with clickable retry
- Error text: `#ef4444`, error backgrounds: `rgba(239,68,68,0.08)`

### 8.4 Toast Component

- Position: bottom-right, 16px from edges
- Style: Glass level 2, `border-radius: --radius-md`
- Size: max-width 320px, padding 12px 16px
- Content: icon (left) + message text (13px) + optional action link
- Variants: success (green icon), error (red icon), info (amber icon)
- Auto-dismiss: 3s, with fade-out (300ms)
- Stack: multiple toasts stack vertically with 8px gap

---

## 9. Migration Notes

### 9.1 DashboardShell Refactor

Current `DashboardShell.tsx` uses 260px expanded / 0px hidden sidebar. Must be refactored to:
- 220px expanded / 52px collapsed (icon-only mode is net-new)
- `sidebarOpen: boolean` in Zustand → change to `sidebarState: 'expanded' | 'collapsed'` + `sidebarAutoCollapsed: boolean`
- New `artifactSlice` added to Zustand store (see Section 2.2.1)
- Right panel slot: SSE panels take priority, Artifacts panel fills the slot when no SSE panel is active

### 9.2 SkillStudioPanel

The current `DashboardShell` has a `studioPanel` slot for `SkillStudioPanel` (a resizable skill editor). Under the new design:
- `SkillStudioPanel` moves into the Settings > Skills tab as an inline editor, or opens in the Artifacts panel as a special "skill" artifact type
- Remove the dedicated `studioPanel` slot from `DashboardShell`

### 9.3 ContextWindowIndicator

The existing `ContextWindowIndicator` component in `ChatInput.tsx` shows token usage. Under the new input bar design:
- Relocate to the top bar (right side), displayed as a subtle progress arc or text ("12k / 200k tokens")
- Only visible when token usage exceeds 50% to avoid clutter
- Uses `--text-muted` color, amber when > 80%

---

## 10. Animation & Transitions

### 10.1 Global Transitions

| Element              | Duration | Easing    | Property          |
|----------------------|----------|-----------|--------------------|
| Color changes        | 150ms    | ease      | `transition-colors` |
| Layout changes       | 200ms    | ease-out  | `transition-all`   |
| Panel open/close     | 300ms    | ease-out  | `transform, opacity` |
| Sidebar collapse     | 200ms    | ease-out  | `width`            |
| Hover states         | 150ms    | ease      | `background, color` |

### 10.2 Custom Animations

| Name           | Duration | Usage                      |
|----------------|----------|----------------------------|
| `pulse`        | 1.5s     | Streaming avatar, step dots |
| `blink`        | 1s       | Streaming text cursor       |
| `glow-pulse`   | 2s       | Graph node hover            |
| `slide-in-right` | 300ms  | Artifacts panel open       |

---

## 11. Responsive Behavior

| Breakpoint | Sidebar        | Artifacts     | Chat           |
|------------|----------------|---------------|----------------|
| < 768px    | Hidden (overlay) | Hidden       | Full width     |
| 768-1024px | 52px (collapsed) | Overlay mode | Flex: 1       |
| > 1024px   | 220px / 52px   | 50/50 split  | Flex: 1        |

On mobile (< 768px):
- Sidebar accessible via hamburger menu (overlay)
- No Artifacts panel — file references open in full-screen modal
- Input bar: full-width, simplified

---

## 12. Accessibility

- All interactive elements: visible focus ring (`--border-accent`, 2px)
- Icon-only buttons: `aria-label` required
- Sidebar collapse: `aria-expanded` attribute
- Graph: keyboard navigation for nodes (Tab to cycle, Enter to select)
- Color contrast: all text meets WCAG AA on dark backgrounds
- Tooltips on collapsed sidebar items
