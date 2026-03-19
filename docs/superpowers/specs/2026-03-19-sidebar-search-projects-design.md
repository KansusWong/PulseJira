# Sidebar Search UI + Projects Module Design

**Date:** 2026-03-19
**Status:** Approved

## Overview

Two changes: (1) Restyle the sidebar search button from input-box style to a clean icon+text row matching the "New Chat" style. (2) Add a Projects nav entry in the sidebar and a new `/projects` list page.

## 1. Search Button Restyle

**Current:** Rounded border button that looks like an input field.
**New:** Plain icon + text row — `Search` icon + "搜索聊天" / "Search chats...". No border, no background. Hover adds `bg-[var(--bg-hover)]`. Same visual style as the "New Chat" button row.

Click behavior unchanged — opens SearchModal.

**File:** `components/layout/Sidebar.tsx` — modify the search button markup and classes.

## 2. Sidebar Projects Entry

Add a nav row in the expanded sidebar between the search button and Highlights section:
- Icon: `FolderOpen` from lucide-react
- Label: "Projects" (i18n key: `sidebar.projects` — already exists)
- Click: `router.push("/projects")`
- Active state: highlight when `pathname === "/projects"` or `pathname.startsWith("/projects/")`

In collapsed sidebar, add a `FolderOpen` icon button between New Chat and the spacer, matching the style of Graph/Settings icon buttons. Active state when on `/projects`.

**File:** `components/layout/Sidebar.tsx`

## 3. Projects List Page

New page at `app/(dashboard)/projects/page.tsx`.

**Layout:**
- Header row: "Projects" title (left) + "+ New project" button (right)
- Search input: placeholder "Search projects..."
- Sort control: "Sort by" + "Activity" dropdown (sorts by `updated_at DESC`, only option for now)
- Project cards: grid layout, reuse existing `ProjectCard` component
- Empty state: icon + "No projects yet" text
- Click a card: navigate to `/projects/[projectId]`

**Data source:** `GET /api/projects` — already exists and returns all projects.

**Files:**
- Create: `app/(dashboard)/projects/page.tsx`

## 4. i18n

Add keys:

| Key | EN | ZH |
|---|---|---|
| `projects.title` | Projects | 项目 |
| `projects.newProject` | New project | 新建项目 |
| `projects.searchPlaceholder` | Search projects... | 搜索项目... |
| `projects.sortByActivity` | Activity | 最近活跃 |
| `projects.sortBy` | Sort by | 排序 |
| `projects.empty` | No projects yet | 暂无项目 |

## 5. Files to Modify

| File | Change |
|---|---|
| `components/layout/Sidebar.tsx` | Restyle search button; add Projects nav row (expanded + collapsed) |
| `app/(dashboard)/projects/page.tsx` | Create: projects list page |
| `lib/i18n/locales/en.ts` | Add projects page keys |
| `lib/i18n/locales/zh.ts` | Add projects page keys |
