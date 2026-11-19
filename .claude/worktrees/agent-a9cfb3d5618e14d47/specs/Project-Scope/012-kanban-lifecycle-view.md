# Spec 012: Kanban View - Lifecycle Tab Enhancement

## Overview
Changed the "Overview" tab to "Lifecycle" tab in the project workspace to display the mermaid project lifecycle diagram.

## Changes Made

### 1. ProjectWorkspacePage.tsx
- Changed tab label from "Overview" to "Lifecycle"
- Changed icon from `BookOpen` to `RefreshCw`
- Updated document type from `overview` to `lifecycle`
- Updated all variable names: `overviewDoc` → `lifecycleDoc`, `overviewLoading` → `lifecycleLoading`, etc.
- Updated function names: `fetchOverview` → `fetchLifecycle`, `handleUpdateOverview` → `handleUpdateLifecycle`

### 2. ProjectOverviewTab.tsx
- Added mermaid library import
- Created `MermaidRenderer` component to render mermaid diagrams
- Created `parseContent` function to extract mermaid blocks from markdown
- Updated `OverviewContent` to support mermaid diagram rendering
- Updated all text references from "overview" to "lifecycle"

### 3. Dependencies
- Installed `mermaid` package for diagram rendering

## Mermaid Diagram Support
The lifecycle tab now supports rendering the following mermaid diagram types:
- flowchart
- sequenceDiagram
- classDiagram
- stateDiagram
- erDiagram
- journey
- gantt
- pie
- xychart
- mindmap
- timeline
- gitGraph
- quadrantChart
- requirementDiagram
- c4Context/c4Container/c4Component/c4Deployment
- sankey
- block-beta/packet-beta/architecture-beta
- kanban

## Testing
- [x] Tab label shows "Lifecycle" instead of "Overview"
- [x] Tab icon shows refresh icon instead of book icon
- [x] Lifecycle document loads from database (doctype: 'lifecycle')
- [x] Mermaid diagrams render correctly
- [x] Edit functionality works for ADMIN users
- [x] Dark mode support for diagrams

## Related Files
- `src/client/pages/ProjectWorkspacePage.tsx`
- `src/client/components/Projects/ProjectOverviewTab.tsx`
- `package.json` (mermaid dependency)

## Status
- **Phase**: Implementation
- **Progress**: 100%
- **Last Updated**: 2026-03-06
