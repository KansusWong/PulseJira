# RebuilD Frontend Redesign — Design Spec

## Overview

Full redesign of RebuilD's frontend, addressing design inconsistencies, poor visual quality, and interaction issues. Adopts Claude.ai's Artifacts layout pattern with Glassmorphism Dark styling and Amber accent color.

**Design Direction:** Glassmorphism Dark + Amber (#f59e0b) accent
**Reference:** Claude.ai web (Artifacts pattern)
**Scope:** All pages — Chat, Sidebar, Settings, Knowledge Graph
**Cleanup:** Remove Signals feature, clean dead code

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

**Agent colors** remain as defined in `agent-ui-meta.ts` — no changes.

### 1.2 Typography

**Font:** Inter (with `system-ui, sans-serif` fallback). Install via `@fontsource/inter` or Google Fonts.

| Level       | Size    | Weight | Usage                      |
|-------------|---------|--------|----------------------------|
| `--text-xl` | 20px    | 600    | Page titles                |
| `--text-md` | 15px    | 500    | Section headings, card titles |
| `--text-base`| 13.5px | 400    | Body text, messages        |
| `--text-sm` | 12px    | 400    | Captions, metadata         |
| `--text-label`| 10px  | 500    | Labels (uppercase, tracked) |

**Code font:** `JetBrains Mono, Fira Code, monospace` for code blocks and Artifacts panel.

### 1.3 Glassmorphism System

Three tiers of glass effect:

| Level | Blur   | Opacity | Border Opacity | Usage                    |
|-------|--------|---------|----------------|--------------------------|
| 1     | 8px    | 0.03    | 0.06           | Sidebar, background panels |
| 2     | 16px   | 0.06    | 0.10           | Cards, popups, dropdowns |
| 3     | 24px   | 0.10    | 0.15           | Modals, floating input, graph popup |

All glass panels use `backdrop-filter: blur(Xpx)` + `background: rgba(255,255,255, opacity)` + `border: 1px solid rgba(255,255,255, border-opacity)`.

### 1.4 Spacing Scale

| Token         | Value | Usage           |
|---------------|-------|-----------------|
| `--space-xs`  | 4px   | Tight gaps      |
| `--space-sm`  | 8px   | Inner padding   |
| `--space-md`  | 12px  | Component gaps  |
| `--space-lg`  | 16px  | Card padding    |
| `--space-xl`  | 24px  | Section gaps    |
| `--space-2xl` | 32px  | Page sections   |

### 1.5 Border Radius Scale

| Token           | Value  | Usage               |
|-----------------|--------|----------------------|
| `--radius-sm`   | 4px    | Badges, small tags   |
| `--radius-md`   | 8px    | Inputs, buttons      |
| `--radius-lg`   | 12px   | Cards, panels        |
| `--radius-xl`   | 16px   | Modals, large panels |
| `--radius-full` | 999px  | Pills, avatars       |

### 1.6 Shadows

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
- Sidebar: 220px expanded
- Chat: full remaining width, messages centered at `max-width: 680px`
- Input bar: centered, matches chat content width
- No right panel

**State 2 — Artifact open (click file reference in chat):**
- Sidebar: auto-collapses to 52px (icon-only)
- Chat: flex:1 (~50% of remaining space)
- Artifacts: flex:1 (~50%), separated by draggable handle
- Min-width per panel: 320px
- Drag handle: 6px wide, subtle 3px visible bar

**Transitions:**
- Artifact panel open: 300ms ease-out slide from right
- Sidebar collapse: 200ms ease-out
- Drag resize: real-time, no animation
- Close: X button or Esc key

### 2.3 Chat Messages

**User messages:**
- Right-aligned
- Glass bubble (level 1): `bg-glass` + `border-subtle`
- Border radius: `16px 16px 4px 16px` (bottom-right sharp)
- Max-width: 80% (State 1) / 85% (State 2)

**Assistant messages:**
- Left-aligned with RebuilD avatar (28px, amber square with rounded corners)
- No bubble wrapping — text flows naturally
- Inline code: amber-tinted `background: rgba(245,158,11,0.1); color: #fbbf24`
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

- Height: 48px (State 1) / 44px (State 2)
- Left: conversation title (`--text-secondary`)
- Right: search icon button (optional)
- Border: `border-bottom: 1px solid rgba(255,255,255,0.04)`

### 2.7 Artifacts Panel

- Background: `#080808` (slightly different from sidebar)
- Header: filename with icon + Copy / Download / Close buttons
- Tab bar: multiple open artifacts as tabs, active tab = amber bottom border
- Code rendering: `JetBrains Mono`, line numbers in `--text-muted`, amber-tinted syntax highlighting
- Footer: file type + line count + file path
- Supports: code files, JSON, PPT preview (iframe), images

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

5 tabs: **Agent** | **LLM Pool** | **Skills** | **Preferences** | **Advanced**

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

Each node type has unique color, icon, and size:

| Type     | Color    | Radius | Icon (Canvas drawn) |
|----------|----------|--------|---------------------|
| Mate     | #34d399  | 13     | Person silhouette   |
| Mission  | #60a5fa  | 16     | Target/crosshair    |
| Epic     | #818cf8  | 14     | Package             |
| Document | #fbbf24  | 11     | File/page           |
| Code     | #c084fc  | 11     | `</>` monospace     |
| Skill    | #22d3ee  | 8      | Lightning bolt      |
| Tool     | #fb923c  | 8      | Wrench              |
| PPTX     | #f472b6  | 10     | Chart/bars          |

**Node rendering (Canvas):**
1. Outer glow: `feGaussianBlur(4)` circle at 120% radius, node color at 8% opacity
2. Dark filled circle: `#0a0a0b` fill
3. Colored border: node color, 1.5px stroke
4. Icon drawn inside (canvas path or emoji fallback)
5. Label below: node name (Inter, text-primary)
6. Type label below name: uppercase, node color, 60% opacity, 7-8px

**States:**
- Default: border at 90% opacity
- Hover: outer glow ring pulses, label brightens to text-primary
- Selected: full opacity border + white 2.5px stroke + larger glow

### 5.3 Edge Design

- **Color:** Linear gradient from source node color → target node color
- **Glow:** Gaussian blur (stdDeviation=2) underneath the edge line, 50% opacity
- **Line:** 1.5px stroke, 80% opacity
- **Arrows:** Triangular arrowhead at target end, filled with target color
- **Selected state:** connected edges glow amber; unconnected edges fade to 20% opacity
- **Hover:** edge brightens + relationship label appears at midpoint (glass background pill)

### 5.4 Legend (Bottom-Left)

- Glass level 2 panel
- Each type: colored dot (6px) + icon + Chinese label
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

## 8. Animation & Transitions

### 8.1 Global Transitions

| Element              | Duration | Easing    | Property          |
|----------------------|----------|-----------|--------------------|
| Color changes        | 150ms    | ease      | `transition-colors` |
| Layout changes       | 200ms    | ease-out  | `transition-all`   |
| Panel open/close     | 300ms    | ease-out  | `transform, opacity` |
| Sidebar collapse     | 200ms    | ease-out  | `width`            |
| Hover states         | 150ms    | ease      | `background, color` |

### 8.2 Custom Animations

| Name           | Duration | Usage                      |
|----------------|----------|----------------------------|
| `pulse`        | 1.5s     | Streaming avatar, step dots |
| `blink`        | 1s       | Streaming text cursor       |
| `glow-pulse`   | 2s       | Graph node hover            |
| `slide-in-right` | 300ms  | Artifacts panel open       |

---

## 9. Responsive Behavior

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

## 10. Accessibility

- All interactive elements: visible focus ring (`--border-accent`, 2px)
- Icon-only buttons: `aria-label` required
- Sidebar collapse: `aria-expanded` attribute
- Graph: keyboard navigation for nodes (Tab to cycle, Enter to select)
- Color contrast: all text meets WCAG AA on dark backgrounds
- Tooltips on collapsed sidebar items
