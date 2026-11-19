---
title: Production UI Patterns
description: ONLY production-tested UI patterns from actual NextAge implementations
feature: Implementation Bible - Production Code Only
last-updated: 2025-11-28
version: 3.5.0
related-files:
  - ./style-guide.md
  - ../screenpatterns.md
  - ../../../apps/web/src/routes/__root.tsx
  - ../../../apps/web/src/routes/index.tsx
  - ../../../apps/web/src/routes/admin/prospects/index.tsx
  - ../../../apps/web/src/components/prospects/ProspectCard.tsx
  - ../../../apps/web/src/components/prospects/ProspectModal.tsx
  - ../../../apps/web/src/components/dashboards/AdminDashboard.tsx
  - ../../../apps/web/src/components/ui/slider.tsx
  - ../../../apps/web/src/index.css
status: production
---

# Production UI Patterns

## 📚 DOCUMENT PURPOSE & USAGE INSTRUCTIONS

**This document is the authoritative guide for creating UI components that seamlessly blend with NextAge Design System.**

### How to Use This Document:
1. **For New Components**: Find similar patterns in this document and adapt them to your needs
2. **For Consistency**: Always reference these patterns to ensure visual harmony across the application
3. **Generic Patterns**: All patterns are written generically so they can be applied to ANY component type
4. **Copy & Adapt**: Copy the pattern code and replace generic variables with your specific implementation

### Document Rules:
- ✅ **ONLY Production-Tested**: Every pattern here has been implemented and tested in production
- ✅ **Generic & Reusable**: Patterns use generic names (not specific to prospects, etc.)
- ✅ **Complete Examples**: Full className strings and implementation details included
- ❌ **NO Theoretical Code**: If it hasn't been built and tested, it's not in this document
- ❌ **NO Partial Solutions**: Every pattern includes all necessary styling

### When Adding New Patterns:
1. Implement and test in production first
2. Extract the pattern with generic naming
3. Include all NextAge styling classes
4. Document any special implementation notes
5. Update the version number and last-updated date


## Table of Contents

### 🟢 Universal Design System Patterns
1. [Root Layout Structure](#root-layout-structure) - ✅ **Critical Foundation Pattern**
2. [Hero Section Layout](#hero-section-layout) - ✅ **Landing Page Pattern**
3. [Page Header with Sidebar Trigger](#page-header-with-sidebar-trigger) - ✅ **Universal Header Pattern**
4. [Button System Components](#button-system-components) - ✅ **Complete Button Implementation Guide**
5. [Glass Morphism Dropdown Menus](#glass-morphism-dropdown-menus) - ✅ **Context Menu Pattern**
6. [Interactive Dashboard Cards](#interactive-dashboard-cards) - ✅ **Metric Card Pattern**
7. [Animated Analytics Cards](#animated-analytics-cards) - ✅ **Statistics Card Pattern**
8. [Universal Contact Components](#universal-contact-components) - ✅ **Contact Interaction Pattern**
9. [Badge System](#badge-system) - ✅ **Badge Display Pattern**
10. [Tab System with Glass Morphism](#tab-system-with-glass-morphism) - ✅ **Tabbed Content Pattern**
11. [Information Card Layouts](#information-card-layouts) - ✅ **Content Card Pattern**
12. [Notes Display Pattern](#notes-display-pattern) - ✅ **Static Notes Display Component**
13. [Modal Patterns](#modal-patterns) - ✅ **Complex & Simple Modal Patterns**
14. [Delete Confirmation Dialog Pattern](#delete-confirmation-dialog-pattern) - ✅ **Confirmation Dialog Pattern**
15. [Links Management UI Pattern](#links-management-ui-pattern) - ✅ **Interactive Links Component**
16. [Special Input Processing Patterns](#special-input-processing-patterns) - ✅ **Address & Phone Processing**
17. [Dropdown Select Patterns](#dropdown-select-patterns) - ✅ **Select Components with Glass Morphism**
18. [Shared NextAge Style Constants](#shared-nextage-style-constants) - ✅ **Centralized Style Management**
19. [Section Separator Pattern](#section-separator-pattern) - ✅ **Subtle Rule Line for Complex Forms**
20. [Enhanced Slider Pattern](#enhanced-slider-pattern) - ✅ **Glass Morphism Range Slider**
21. [Glass Morphism Switch Pattern](#glass-morphism-switch-pattern) - ✅ **Toggle Switch with Glass Effects**
22. [Inline Edit Mode Pattern](#inline-edit-mode-pattern) - ✅ **PRIMARY Data Editing Pattern (View/Edit/Add Modes)**
23. [NextAge CSS Utilities](#nextage-css-utilities) - ✅ **Design System Classes**

---

## Root Layout Structure
**Pattern Type**: Foundation Layout Pattern ✅
**Source**: `__root.tsx`

### The ONLY Way to Structure Your App

```tsx
// __root.tsx - THIS STRUCTURE IS SACRED, DO NOT MODIFY
<html lang="en" suppressHydrationWarning>
  <head>
    <HeadContent />
  </head>
  <body className="flex flex-col min-h-screen">
    <ClerkProvider>
      <AuthSetup>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Header /> {/* Sticky header takes natural space */}
            <main className="nextage-hero-gradient flex-1 flex flex-col content-center">
              {isFetching ? <Loader /> : <AuthContextOutlet />}
            </main>
            <Toaster />
            <Scripts />
          </ThemeProvider>
        </QueryClientProvider>
      </AuthSetup>
    </ClerkProvider>
  </body>
</html>
```

**Key Patterns:**
- Body: `flex flex-col min-h-screen` - Creates flex container for entire page
- Main: `nextage-hero-gradient flex-1 flex flex-col content-center` - Fills remaining space
- Header: Takes natural height, no explicit height classes
- Result: No scrollbars, perfect centering, gradient inheritance

## Hero Section Layout
**Pattern Type**: Landing Page Pattern ✅
**Source**: `routes/index.tsx`

### Production Hero Implementation

```tsx
// index.tsx - Hero section that inherits flex layout
function HeroSection() {
  return (
    <div className="flex flex-1 items-center justify-center relative">
      {/* Large Background Logo */}
      <div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-[42%] z-0 transform">
        <img
          src="/images/logo.png"
          alt=""
          className="nextage-bg-decoration h-auto w-[504px] select-none sm:w-[720px] lg:w-[756px]"
        />
      </div>

      {/* Background gradient effect */}
      <div className="-translate-x-1/2 nextage-bg-gradient-radial pointer-events-none absolute top-[-20%] left-1/2 z-1 h-[800px] w-[800px] transform" />

      {/* Content Grid */}
      <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-24 lg:grid-cols-[1.4fr_1fr] lg:gap-32 px-6 w-full">
        {/* Content here */}
      </div>
    </div>
  );
}
```

**Key Patterns:**
- Uses `flex flex-1` to inherit parent's space
- Centers with `items-center justify-center`
- NO height classes like `min-h-screen` or `h-full`
- Background decorations use absolute positioning

## Page Header with Sidebar Trigger
**Pattern Type**: Universal Header Pattern ✅
**Source**: `components/dashboards/AdminDashboard.tsx`, `routes/admin/prospects/index.tsx`, `routes/admin/prospects/$prospectId/index.tsx`

### Universal Page Header Pattern

```tsx
import { SidebarTrigger } from "@/components/ui/sidebar";

// Used in AdminDashboard.tsx and Prospect Pipeline
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <SidebarTrigger className="-ml-1" />
    <div>
      <h1 className="font-semibold text-3xl">
        {pageTitle}
      </h1>
      <p className="mt-2 font-medium text-base">
        {pageDescription}
      </p>
    </div>
  </div>
  
  {/* Action buttons on the right */}
  <div className="flex items-center space-x-3">
    {/* Action buttons */}
  </div>
</div>
```

**Implementation Rules:**
- ALWAYS include `SidebarTrigger` on admin pages
- Use `className="-ml-1"` for proper alignment
- Place before page title with `gap-3` spacing
- Applied to: Admin Dashboard, Prospect Pipeline, all admin routes

---

## Universal Contact Components
**Pattern Type**: Contact Interaction Pattern ✅
**Source**: `routes/admin/prospects/$prospectId/index.tsx`, `components/prospects/ProspectCard.tsx`

### Universal Contact Component Pattern

This pattern provides consistent contact interactions across all contexts with smart device-aware actions:

```tsx
// Generic Contact Component Pattern - Applicable to any contact display
const handlePhoneClick = (phoneNumber: string) => {
  if (typeof window !== "undefined" && /Mobi|Android/i.test(navigator.userAgent)) {
    // Mobile: trigger phone app
    window.location.href = `tel:${phoneNumber}`;
    toast.success("Opening phone app to call");
  } else {
    // Desktop: copy to clipboard
    navigator.clipboard.writeText(phoneNumber);
    toast.success("Phone number copied to clipboard");
  }
};

const handleEmailClick = (email: string) => {
  window.location.href = `mailto:${email}`;
};

const handleAddressClick = (address: string, city?: string, state?: string) => {
  const fullAddress = city && state 
    ? `${address}, ${city}, ${state}`
    : address;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
  window.open(googleMapsUrl, '_blank');
  toast.success("Opening location in Google Maps");
};

// Compact Context (Pipeline Cards)
<div className="group flex items-center text-sm">
  <Phone className="mr-2 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground group-hover:text-blue-500 transition-colors duration-200" />
  <button
    onClick={() => handlePhoneClick(phoneNumber)}
    className="truncate text-left font-mono text-muted-foreground transition-all duration-200 hover:text-primary hover:scale-[1.02] hover:translate-x-1"
  >
    {phoneNumber}
  </button>
</div>

// Spacious Context (View Details)
<div className="group flex items-center">
  <Phone className="h-4 w-4 mr-2 text-slate-500 dark:text-slate-400 group-hover:text-blue-500 transition-colors duration-200" />
  <button
    onClick={() => handlePhoneClick(phoneNumber)}
    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-all duration-200 hover:scale-[1.02] hover:translate-x-1 focus:ring-2 focus:ring-blue-500/20 focus:outline-none rounded px-1 font-mono font-medium"
  >
    {phoneNumber}
  </button>
</div>
```

**Universal Contact Features:**
- **Smart Actions**: Phone (mobile dial/desktop copy), email (mailto), address (Google Maps)
- **Consistent Micro-animations**: `hover:scale-[1.02] hover:translate-x-1` across all contexts
- **Icon Color Transitions**: `group-hover:text-blue-500 transition-colors duration-200`
- **Context-Adaptive Styling**: Compact (pipeline) vs spacious (details) with appropriate typography
- **Accessibility**: Proper focus states and ARIA labels

## Badge System
**Pattern Type**: Badge Display Pattern ✅
**Source**: `routes/admin/prospects/$prospectId/index.tsx`, `components/prospects/ProspectModal.tsx`

### Universal Badge System Patterns

This pattern provides two types of badges: Status badges for semantic state indicators and contextual badges for categorical information.

#### Status Badges

Status badges provide colored indicators for system states and workflow statuses:

```tsx
// Generic Status Badge Pattern - Applicable to any status system
const getStatusVariant = (variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary') => {
  const variants = {
    success: "bg-emerald-100 text-emerald-700 border-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/50",
    warning: "bg-amber-100 text-amber-700 border-amber-200/60 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50",
    error: "bg-red-100 text-red-700 border-red-200/60 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700/50",
    info: "bg-blue-100 text-blue-700 border-blue-200/60 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50",
    neutral: "bg-slate-100 text-slate-700 border-slate-200/60 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700/50",
    primary: "bg-blue-100 text-blue-700 border-blue-200/60 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50"
  };
  return variants[variant] || variants.neutral;
};

<Badge className={`${getStatusVariant('success')} px-3 py-2 rounded-full font-semibold text-sm shadow-sm border`}>
  {statusLabel}
</Badge>

// Usage with custom status mapping
const mapStatusToVariant = (status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' => {
  const statusMap: Record<string, typeof variant> = {
    // Success states
    completed: 'success', approved: 'success', active: 'success', published: 'success',
    // Warning states  
    pending: 'warning', review: 'warning', draft: 'warning', scheduled: 'warning',
    // Error states
    failed: 'error', rejected: 'error', expired: 'error', cancelled: 'error',
    // Info states
    processing: 'info', updated: 'info', new: 'info', modified: 'info',
    // Neutral states
    disabled: 'neutral', archived: 'neutral', unknown: 'neutral'
  };
  return statusMap[status.toLowerCase()] || 'neutral';
};
```

#### Territory/Category Badges

Contextual badges for categorical information like territories, departments, or other classificatory data:

```tsx
// Generic Territory/Category Badge Pattern - Applicable to any categorical system
const getCategoryBadgeClass = (category: string, categoryMap: Record<string, string>) => {
  const baseClass = "px-3 py-2 text-sm font-semibold rounded-full border";
  
  // Default category colors - can be customized per use case
  const defaultCategoryClasses: Record<string, string> = {
    "primary": "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50",
    "secondary": "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/50",
    "tertiary": "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700/50",
    "accent": "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700/50"
  };
  
  const categoryClass = categoryMap[category] || defaultCategoryClasses.primary;
  return `${baseClass} ${categoryClass}`;
};

// Territory-specific implementation
const getTerritoryBadgeClass = (territory: string) => {
  const territoryClasses: Record<string, string> = {
    "Missouri": "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50",
    "Illinois": "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700/50",
    "Ohio": "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700/50",
    "Florida": "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700/50"
  };
  
  return getCategoryBadgeClass(territory, territoryClasses);
};

<span className={getTerritoryBadgeClass(territory)}>
  {territory}
</span>
```

**Badge System Features:**
- **Status Badges**: Semantic colors (success, warning, error, info) for system states - 30px height with `py-2`
- **Category Badges**: Custom colored badges for territories, departments, classifications - matches status badge sizing
- **Consistent Dimensions**: `px-3 py-2 text-sm` for uniform 30px height across all badge types
- **Theme Support**: Full light/dark mode compatibility with proper contrast
- **Flexible Mapping**: Easy to map any category or status to appropriate colors
- **Rounded Design**: `rounded-full` for modern pill-shaped appearance
- **Solid Colors**: Clean, readable solid backgrounds for optimal legibility

## Tab System with Glass Morphism
**Pattern Type**: Tabbed Content Pattern ✅
**Source**: `routes/admin/prospects/$prospectId/index.tsx`

### Universal Tab System Pattern

This pattern provides glass morphism tabs suitable for any tabbed content interface:

```tsx
// Generic Tab System Pattern - Applicable to any tabbed content
<Tabs defaultValue="overview" className="w-full">
  <TabsList className="bg-gradient-to-br from-white/95 to-slate-50/90 shadow-lg backdrop-blur-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl dark:from-slate-800/90 dark:to-slate-900/80 border border-white/20 dark:border-slate-700/30 rounded-[8px] p-1.5 h-12 grid w-full">
    {tabs.map((tab) => (
      <TabsTrigger
        key={tab.value}
        value={tab.value}
        className="data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 dark:data-[state=active]:bg-slate-700 dark:data-[state=active]:text-slate-100 rounded-[6px] transition-all duration-200"
      >
        {tab.label}
      </TabsTrigger>
    ))}
  </TabsList>
  
  {tabs.map((tab) => (
    <TabsContent key={tab.value} value={tab.value} className="space-y-6 mt-6">
      {tab.content}
    </TabsContent>
  ))}
</Tabs>
```

**Tab System Features:**
- **Glass Background**: `from-white/95 to-slate-50/90` with `backdrop-blur-lg`
- **Hover Animation**: `hover:scale-[1.02] hover:shadow-xl`
- **Active State**: White background with subtle shadow
- **Border Treatment**: Semi-transparent with theme support

## Back Button Pattern
**Pattern Type**: Navigation Button Pattern ✅
**Source**: `routes/admin/prospects/$prospectId/index.tsx`

### Universal Back Button Pattern

This pattern provides consistent back navigation placement in page headers:

```tsx
// Generic Back Button Pattern - Applicable to any page header
<div className="flex items-center justify-between">
  <div className="flex items-center space-x-4">
    <Button 
      variant="ghost" 
      size="sm" 
      asChild
      className="h-10 px-4 bg-gradient-to-br from-white/95 to-slate-50/90 shadow-lg backdrop-blur-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl dark:from-slate-800/90 dark:to-slate-900/80 border border-white/20 dark:border-slate-700/30 rounded-[8px]"
    >
      <Link to="/parent-route">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to {parentPageName}
      </Link>
    </Button>
    
    <Separator orientation="vertical" className="h-6" />
    
    <div>
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
        {pageTitle}
      </h1>
    </div>
  </div>
  
  <div className="flex items-center space-x-2">
    {/* Action buttons positioned on the right */}
  </div>
</div>
```

**Back Button Features:**
- **Header Placement**: Left side of header, before page title
- **Glass Morphism**: Consistent with other glass elements
- **Proper Spacing**: Separator between back button and title content
- **Action Alignment**: Follows established pattern with actions on the right

---

## Button System Components
**Pattern Type**: Complete Button Implementation Guide ✅  
**Source**: Production Components with Custom NextAge Styling

### Button System Overview

This section provides complete NextAge button implementation patterns extracted from production code. Each pattern includes the exact className styling used in production NextAge components.

**Critical Implementation Rule**: Always use these complete className patterns rather than basic shadcn variants. These classes provide the full NextAge design system styling including glass morphism, proper spacing, animations, and theme support.

---

### NextAge Button Classes

These are the six core NextAge button classes extracted from production components:

#### 1. nextage-primary (Primary Action Buttons)
**Use Case**: Main CTAs, form submissions, primary actions  
**Source**: Create Prospect button in Add New Prospect Modal

```tsx
// nextage-primary - Primary gradient button with glass morphism
<Button 
  onClick={onPrimaryAction}
  className="min-w-[100px] h-10 px-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 backdrop-blur-sm border-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
>
  <IconComponent className="h-4 w-4 mr-2" />
  {primaryActionLabel}
</Button>
```

#### 2. nextage-outline (Secondary Action Buttons)
**Use Case**: Cancel buttons, back navigation, alternative actions  
**Source**: Cancel button in Add New Prospect Modal

```tsx
// nextage-outline - Glass morphism outline button
<Button
  variant="outline"
  onClick={onSecondaryAction}
  className="min-w-[100px] h-10 px-4 bg-white/80 backdrop-blur-sm border-slate-200/60 hover:bg-white/90 hover:border-slate-300/80 hover:shadow-sm transition-all duration-200 dark:bg-slate-800/80 dark:border-slate-700/60 dark:hover:bg-slate-800/90"
>
  <IconComponent className="h-4 w-4 mr-2" />
  {secondaryActionLabel}
</Button>
```

#### 3. nextage-tertiary (Utility Action Buttons)
**Use Case**: Import from Google, helper actions, optional tools  
**Source**: Import from Google button in Add New Prospect Modal

```tsx
// nextage-tertiary - Uses tertiary variant with full width
<Button 
  variant="tertiary" 
  className="w-full h-10"
  onClick={onTertiaryAction}
>
  <IconComponent className="h-4 w-4 mr-2" />
  {tertiaryActionLabel}
</Button>
```

#### 4. nextage-ghost (Minimal Interaction Buttons)
**Use Case**: Modal close buttons, icon-only actions, subtle interactions  
**Source**: X close button in business hours dialog

```tsx
// nextage-ghost - Complete glass morphism ghost button
<Button
  variant="ghost"
  size="sm"
  onClick={onClose}
  className="absolute right-4 top-4 z-50 h-8 w-8 rounded-[6px] border border-white/20 bg-white/80 p-0 text-slate-600 backdrop-blur-sm transition-all duration-200 hover:bg-white/90 hover:text-slate-900 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/30 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-700/90 dark:hover:text-slate-200"
>
  <X className="h-4 w-4" />
  <span className="sr-only">Close dialog</span>
</Button>
```

#### 5. nextage-destructive (Delete/Warning Action Buttons)
**Use Case**: Delete operations, dangerous actions, confirmations  
**Source**: Delete button in delete confirmation dialog

```tsx
// nextage-destructive - Uses destructive variant
<Button 
  variant="destructive" 
  onClick={onConfirm}
  disabled={isLoading}
>
  {isLoading ? "Deleting..." : destructiveActionLabel}
</Button>
```

#### 6. nextage-heading-link (Navigation Link Buttons)
**Use Case**: Back to Pipeline links, navigation elements, heading-level navigation  
**Source**: Back to Pipeline button in prospect details screen

```tsx
// nextage-heading-link - Navigation button with glass morphism
<Button 
  variant="ghost" 
  size="sm" 
  asChild
  className="h-10 px-4 bg-white/80 backdrop-blur-sm border-slate-200/60 hover:bg-white/90 hover:border-slate-300/80 hover:shadow-sm hover:scale-[1.02] transition-all duration-200 dark:bg-slate-800/80 dark:border-slate-700/60 dark:hover:bg-slate-800/90 rounded-[6px]"
>
  <Link to="/parent-route">
    <ArrowLeft className="h-4 w-4 mr-2" />
    Back to {parentPageName}
  </Link>
</Button>
```

#### 7. Semantic Glass Action Buttons (Colored Glass Morphism)
**Use Case**: Quick action buttons with semantic meaning - conversion actions, communication actions  
**Source**: Prospect details Quick Actions sidebar (Convert to Client, Call Prospect)  
**Pattern**: Glass morphism buttons that use semantic colors instead of neutral tones

```tsx
// Green Glass - Success/Conversion Actions (Convert to Client, Activate, Complete)
<Button
  onClick={onConversionAction}
  className="h-11 w-full justify-start rounded-[6px] border border-green-200/60 bg-green-50/90 px-4 text-green-700 shadow-[0_2px_8px_rgba(34,197,94,0.15)] saturate-[150%] backdrop-blur-[8px] backdrop-filter transition-all duration-200 hover:scale-[1.01] hover:bg-green-50/95 hover:shadow-[0_4px_12px_rgba(34,197,94,0.2)] dark:border-green-700/40 dark:bg-green-900/30 dark:text-green-300 dark:hover:bg-green-900/40"
>
  <UserPlus className="mr-2 h-4 w-4" />
  Convert to Client
</Button>

// Blue Glass - Communication Actions (Call, Email, Message)
<Button
  onClick={onCommunicationAction}
  className="h-11 w-full justify-start rounded-[6px] border border-blue-200/60 bg-blue-50/90 px-4 text-blue-700 shadow-[0_2px_8px_rgba(59,130,246,0.15)] saturate-[150%] backdrop-blur-[8px] backdrop-filter transition-all duration-200 hover:scale-[1.01] hover:bg-blue-50/95 hover:shadow-[0_4px_12px_rgba(59,130,246,0.2)] dark:border-blue-700/40 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
>
  <Phone className="mr-2 h-4 w-4" />
  Call Prospect
</Button>

// Amber Glass - Warning/Pending Actions (Review Required, Pending, Awaiting)
<Button
  onClick={onWarningAction}
  className="h-11 w-full justify-start rounded-[6px] border border-amber-200/60 bg-amber-50/90 px-4 text-amber-700 shadow-[0_2px_8px_rgba(245,158,11,0.15)] saturate-[150%] backdrop-blur-[8px] backdrop-filter transition-all duration-200 hover:scale-[1.01] hover:bg-amber-50/95 hover:shadow-[0_4px_12px_rgba(245,158,11,0.2)] dark:border-amber-700/40 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/40"
>
  <AlertCircle className="mr-2 h-4 w-4" />
  Review Required
</Button>

// Red Glass - Destructive/Remove Actions (Delete, Remove, Cancel Subscription)
<Button
  onClick={onDestructiveAction}
  className="h-11 w-full justify-start rounded-[6px] border border-red-200/60 bg-red-50/90 px-4 text-red-700 shadow-[0_2px_8px_rgba(239,68,68,0.15)] saturate-[150%] backdrop-blur-[8px] backdrop-filter transition-all duration-200 hover:scale-[1.01] hover:bg-red-50/95 hover:shadow-[0_4px_12px_rgba(239,68,68,0.2)] dark:border-red-700/40 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/40"
>
  <Trash2 className="mr-2 h-4 w-4" />
  Delete Account
</Button>
```

**When to Use Semantic Glass Buttons:**
- Quick action sidebars with multiple contextual actions
- Action lists where visual hierarchy by semantic meaning is important
- When you need colored actions but want to maintain the glass aesthetic
- Prefer over solid gradient buttons for better NextAge design consistency

**Color Selection Guide:**
| Color | Use For | Example Actions |
|-------|---------|-----------------|
| **Green** | Success, Conversion, Completion | Convert to Client, Activate, Mark Complete |
| **Blue** | Communication, Information | Call, Email, Send Message, View Details |
| **Amber** | Warning, Pending, Review | Review Required, Pending Approval, Awaiting Response |
| **Red** | Destructive, Removal | Delete, Remove, Cancel, Terminate |
| **Purple** | Premium, Special | Upgrade, Premium Feature |
| **Slate** | Neutral, General | Default actions (use nextage-outline instead) |

---

### Implementation Guidelines

#### How to Use NextAge Button Classes

1. **Copy the Complete className**: Always use the full className string provided above
2. **Don't Mix with Basic Variants**: These replace basic shadcn styling completely
3. **Maintain Accessibility**: All patterns include proper ARIA support and focus states
4. **Icon Integration**: Follow the icon placement patterns shown in examples

#### Button Selection Guide

| Button Type | When to Use | NextAge Class |
|-------------|-------------|---------------|
| **Primary CTA** | Save, Create, Submit, Sign In | nextage-primary |
| **Cancel/Back** | Cancel, Back navigation, Alternative paths | nextage-outline |
| **Helper Actions** | Import from Google, Optional tools | nextage-tertiary |
| **Close/Icon** | Modal close (X), Icon-only actions | nextage-ghost |
| **Delete/Warning** | Delete, Remove, Dangerous actions | nextage-destructive |
| **Navigation** | Back to Pipeline, Header navigation | nextage-heading-link |
| **Semantic Actions** | Quick actions with color meaning, Action sidebars | semantic-glass (colored) |

#### Common Implementation Patterns

```tsx
// Modal Action Footer (Standard Pattern)
<div className="flex justify-end gap-3">
  <Button
    variant="outline"
    onClick={() => onOpenChange(false)}
    className="min-w-[100px] h-10 px-4 bg-white/80 backdrop-blur-sm border-slate-200/60 hover:bg-white/90 hover:border-slate-300/80 hover:shadow-sm transition-all duration-200 dark:bg-slate-800/80 dark:border-slate-700/60 dark:hover:bg-slate-800/90"
  >
    Cancel
  </Button>
  <Button 
    onClick={onSave}
    className="min-w-[100px] h-10 px-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 backdrop-blur-sm border-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
  >
    Save Changes
  </Button>
</div>

// Page Header Navigation (Standard Pattern)
<Button 
  variant="ghost" 
  size="sm" 
  asChild
  className="h-10 px-4 bg-white/80 backdrop-blur-sm border-slate-200/60 hover:bg-white/90 hover:border-slate-300/80 hover:shadow-sm hover:scale-[1.02] transition-all duration-200 dark:bg-slate-800/80 dark:border-slate-700/60 dark:hover:bg-slate-800/90 rounded-[6px]"
>
  <Link to="/admin/prospects">
    <ArrowLeft className="h-4 w-4 mr-2" />
    Back to Pipeline
  </Link>
</Button>
```

---

### Design System Features

**All NextAge button classes include:**
- **Glass Morphism Effects**: Backdrop blur, transparency, and depth
- **Smooth Animations**: Scale transforms, shadow progression, color transitions
- **Theme Support**: Full light/dark mode compatibility with proper contrast
- **WCAG Compliance**: 48px minimum touch targets, proper focus indicators
- **Accessibility**: Screen reader support, keyboard navigation, focus management
- **Performance**: `will-change-transform` and GPU acceleration where appropriate

### 🚨 CRITICAL: Icon-Only Button Accessibility Rule

**ALL ICON-ONLY BUTTONS MUST HAVE TOOLTIPS** - This is a mandatory accessibility requirement for the NextAge Design System.

```tsx
// ✅ CORRECT: Icon button with tooltip
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="sm">
      <Edit className="h-4 w-4" />
      <span className="sr-only">Edit prospect</span>
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>Edit prospect</p>
  </TooltipContent>
</Tooltip>

// ❌ INCORRECT: Icon button without tooltip
<Button variant="ghost" size="sm">
  <Edit className="h-4 w-4" />
</Button>
```

**Tooltip Requirements:**
- Every icon-only button must be wrapped with Tooltip component
- Include descriptive tooltip text explaining the action
- Maintain `sr-only` span for screen readers
- Use consistent tooltip styling across the application
- Applies to ALL icon buttons: edit, delete, view, close, navigation, etc.

**Consistent Sizing:**
- **Height**: 40px (h-10) for standard buttons, 32px (h-8) for icon buttons
- **Touch Targets**: Minimum 48px for accessibility compliance
- **Padding**: Consistent horizontal padding for visual balance
- **Icon Spacing**: Standardized 8px (mr-2) between icons and text

### Back Button Pattern
**Pattern Type**: Navigation Button Component ✅

#### Universal Back Button Pattern

This pattern provides consistent back navigation placement in page headers:

```tsx
// Generic Back Button Pattern - Applicable to any page header
<div className="flex items-center justify-between">
  <div className="flex items-center space-x-4">
    <Button 
      variant="ghost" 
      size="sm" 
      asChild
      className="h-10 px-4 bg-gradient-to-br from-white/95 to-slate-50/90 shadow-lg backdrop-blur-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl dark:from-slate-800/90 dark:to-slate-900/80 border border-white/20 dark:border-slate-700/30 rounded-[8px]"
    >
      <Link to="/parent-route">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to {parentPageName}
      </Link>
    </Button>
    
    <Separator orientation="vertical" className="h-6" />
    
    <div>
      <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
        {pageTitle}
      </h1>
    </div>
  </div>
  
  <div className="flex items-center space-x-2">
    {/* Action buttons positioned on the right */}
  </div>
</div>
```

**Back Button Features:**
- **Header Placement**: Left side of header, before page title
- **Glass Morphism**: Consistent with other glass elements
- **Proper Spacing**: Separator between back button and title content
- **Action Alignment**: Follows established pattern with actions on the right

---

## Production Component Examples

## Glass Morphism Dropdown Menus
**Pattern Type**: Context Menu Component ✅

### Reusable Dropdown Implementation

This pattern provides a glass morphism dropdown menu that can be applied to any context menu or action dropdown:

```tsx
// Generic Context Menu Pattern - Applicable to any dropdown component
<DropdownMenuContent 
  align="end" 
  className="
    w-52 p-2
    /* NextAge Glass Morphism Background */
    bg-gradient-to-br from-white/96 via-slate-50/98 to-white/95
    dark:bg-gradient-to-br dark:from-slate-900/96 dark:via-slate-800/98 dark:to-slate-900/95
    /* Enhanced Backdrop Effects */
    backdrop-filter backdrop-blur-[16px] saturate-[170%] brightness-[1.02]
    /* NextAge Border Treatment */
    border border-slate-200/60 dark:border-slate-700/40
    /* NextAge Shadow System - Level 3 */
    shadow-[0_8px_24px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)]
    dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_4px_16px_rgba(0,0,0,0.2)]
    /* Design System Border Radius */
    rounded-[10px]
    /* Animation System */
    animate-in fade-in-0 zoom-in-95 duration-200
    data-[state=closed]:animate-out data-[state=closed]:fade-out-0 
    data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150
    /* Performance Optimizations */
    will-change-transform transform-gpu
  "
>
  <DropdownMenuItem 
    onClick={handleViewDetails}
    className="
      flex items-center gap-3 px-3 py-2.5 
      text-sm font-medium text-slate-700 dark:text-slate-200
      hover:bg-slate-100/80 dark:hover:bg-slate-700/60
      hover:text-slate-900 dark:hover:text-slate-100
      rounded-[6px]
      transition-all duration-200 ease-out
      focus:ring-2 focus:ring-blue-500/20 focus:outline-none
      min-h-[40px]
    "
  >
    <User className="h-4 w-4 text-slate-500 dark:text-slate-400" />
    View Details
  </DropdownMenuItem>
  
  <DropdownMenuItem 
    onClick={handleEditProspect}
    className="
      flex items-center gap-3 px-3 py-2.5 
      text-sm font-medium text-slate-700 dark:text-slate-200
      hover:bg-slate-100/80 dark:hover:bg-slate-700/60
      hover:text-slate-900 dark:hover:text-slate-100
      rounded-[6px]
      transition-all duration-200 ease-out
      focus:ring-2 focus:ring-blue-500/20 focus:outline-none
      min-h-[40px]
    "
  >
    <Edit className="h-4 w-4 text-slate-500 dark:text-slate-400" />
    Edit Prospect
  </DropdownMenuItem>
  
  <DropdownMenuSeparator className="
    my-2 h-px 
    bg-gradient-to-r from-transparent via-slate-200 to-transparent 
    dark:via-slate-700
  " />
  
  <DropdownMenuItem 
    onClick={handleDeleteProspect} 
    className="
      flex items-center gap-3 px-3 py-2.5 
      text-sm font-medium text-red-600 dark:text-red-400
      hover:bg-red-50 dark:hover:bg-red-950/30
      hover:text-red-700 dark:hover:text-red-300
      rounded-[6px]
      transition-all duration-200 ease-out
      focus:ring-2 focus:ring-red-500/20 focus:outline-none
      min-h-[40px]
    "
    disabled={deleteProspectMutation.isPending}
  >
    <Trash2 className="h-4 w-4" />
    {deleteProspectMutation.isPending ? 'Deleting...' : 'Delete Prospect'}
  </DropdownMenuItem>
</DropdownMenuContent>
```

## Interactive Dashboard Cards
**Pattern Type**: Metric Card Component ✅

### Reusable Dashboard Card Pattern

This pattern provides an interactive card suitable for displaying metrics, statistics, or key information:

```tsx
// Generic Metric Card Pattern - Applicable to any dashboard or statistics display
<Card className="nextage-card-gradient nextage-card-hover">
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-[var(--space-sm)]">
    <CardTitle className="font-medium text-sm">Total Clients</CardTitle>
    <Users className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="font-bold text-2xl">124</div>
    <p className="text-muted-foreground text-xs">
      +12% from last month
    </p>
  </CardContent>
</Card>
```

**Key NextAge Classes Used:**
- `nextage-card-gradient` - Production-proven gradient background
- `nextage-card-hover` - Interactive hover effects
- `var(--space-sm)` - Design system spacing tokens

## Page Header with Glass Background (Production)
**Pattern Type**: Header Layout Component ✅

### Reusable Page Header Pattern

This pattern provides a glass morphism header suitable for any main page or section header:

```tsx
// Generic Page Header Pattern - Applicable to any main page or section header
<div className="relative overflow-hidden">
  {/* Background with NextAge Gradient */}
  <div className="absolute inset-0 bg-gradient-to-br from-slate-50/95 via-blue-50/90 to-slate-100/95 dark:from-slate-900/95 dark:via-slate-800/90 dark:to-slate-900/95" />
  <div className="absolute inset-0 backdrop-blur-sm" />
  
  {/* Header Content */}
  <div className="relative flex flex-col space-y-6 p-8 border-b border-slate-200/80 dark:border-slate-700/50">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
          {pageTitle}
        </h1>
        <p className="text-base text-slate-600 dark:text-slate-400 mt-2 font-medium">
          {pageDescription}
        </p>
      </div>
      
      {/* Action buttons section... */}
    </div>
  </div>
</div>
```



## Animated Analytics Cards
**Pattern Type**: Statistics Card Component ✅

### Reusable Analytics Card Pattern

This pattern provides an animated card suitable for displaying statistics, metrics, or key performance indicators:

```tsx
// Generic Analytics Card Pattern - Applicable to any statistic or metric display
<div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white/95 to-slate-50/90 backdrop-blur-lg border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] dark:from-slate-800/90 dark:to-slate-900/80 dark:border-slate-700/30">
  <div className="absolute inset-0 bg-gradient-to-br from-transparent to-slate-100/20 dark:to-slate-800/20" />
  <div className="relative p-6">
    <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">
      {statisticValue}
    </div>
    <div className="text-sm font-medium text-slate-600 dark:text-slate-400">{statisticLabel}</div>
    {showIndicator && (
      <div className="absolute top-4 right-4 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
    )}
  </div>
</div>
```

## Fixed Navigation Header (Production)
**Pattern Type**: App Header Component ✅

### Reusable Navigation Header Pattern

This pattern provides a fixed navigation header with glass morphism effects suitable for any application header:

```tsx
// Generic App Header Pattern - Applicable to any application navigation header
<div className="nextage-nav scrolled">
  <div className="flex flex-row items-center justify-between px-8 py-1">
    {/* Logo and Brand */}
    <div className="flex items-center">
      <Link
        to="/"
        className="flex items-center gap-3 transition-transform hover:scale-105"
      >
        <img
          src="/images/logo.png"
          alt="NextAge Designs"
          className="nextage-card-image h-16 w-auto"
        />
        <span
          className="font-extrabold text-2xl"
          style={{ color: "var(--nextage-text-dark)" }}
        >
          {appName}
        </span>
      </Link>
    </div>
    {/* Navigation content... */}
  </div>
</div>
```

## Theme Toggle Component (Production)
**Pattern Type**: Theme Switcher Component ✅

### Reusable Theme Toggle Pattern

This pattern provides a theme toggle component that can be used in any application that supports light/dark mode:

```tsx
// Generic Theme Toggle Pattern - Applicable to any theme-aware application
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" className="h-9 w-9">
        <Sun className="h-4 w-4" />
        <span className="sr-only">Loading theme toggle</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="h-9 w-9 border-2 border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

**Usage in Header** (from `components/header.tsx`):
```tsx
// Theme-aware UserButton styling
<UserButton
  appearance={{
    baseTheme: theme === "dark" ? dark : undefined,
    elements: {
      userButtonPopoverCard: "nextage-card-gradient border-2",
      userButtonPopoverActionButton: "hover:bg-neutral-100 dark:hover:bg-neutral-800",
    },
  }}
/>
```

## NextAge CSS Utilities
**Pattern Type**: Design System Classes ✅

### Reusable NextAge Utility Classes

These CSS utility classes provide consistent styling patterns that can be applied across any NextAge application:

```css
/* Generic Design System Classes - Applicable across any NextAge application */
.nextage-card-gradient {
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 1) 0%,
    rgba(0, 102, 255, 0.08) 50%,
    rgba(255, 107, 53, 0.08) 100%
  );
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: var(--card-radius);
}

/* Dark Mode Adaptation */
.dark .nextage-card-gradient {
  background: linear-gradient(
    135deg,
    rgba(32, 32, 40, 0.95) 0%,
    rgba(0, 102, 255, 0.15) 50%,
    rgba(255, 107, 53, 0.12) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.15);
}

/* Interactive Hover Effects */
.nextage-card-hover {
  transition: all 0.3s ease;
  will-change: transform, box-shadow;
}

.nextage-card-hover:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}

/* Navigation Header */
.nextage-nav {
  position: fixed;
  top: 0;
  width: 100%;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  z-index: 1000;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-bottom: 1px solid transparent;
}

.nextage-nav.scrolled {
  border-bottom: 1px solid var(--nextage-border-light);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

/* Dark Mode Navigation */
.dark .nextage-nav {
  background: rgba(15, 15, 25, 0.98);
  backdrop-filter: blur(20px);
}

/* Design System Tokens */
:root {
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --touch-target-min: 48px;
  --touch-target-large: 56px;
}
```

## Detail Page Header Layout (Production)
**Pattern Type**: Page Header Component ✅

### Reusable Detail Page Header Pattern

This pattern provides a comprehensive header layout suitable for any detail page or entity view:

```tsx
// Generic Detail Page Header Pattern - Applicable to any detail/view page
<div className="p-6">
  <div className="max-w-6xl mx-auto space-y-6">
    {/* 🟢 NextAge Header with Glass Morphism Background */}
    <div className="relative overflow-hidden rounded-[14px]">
      {/* NextAge Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50/95 via-blue-50/90 to-slate-100/95 dark:from-slate-900/95 dark:via-slate-800/90 dark:to-slate-900/95" />
      <div className="absolute inset-0 backdrop-blur-sm" />
      
      {/* Header Content with NextAge Glass Effects */}
      <div className="relative flex items-center justify-between p-6 border border-slate-200/60 dark:border-slate-700/40 rounded-[14px] backdrop-blur-[12px] saturate-[150%]">
        <div className="flex items-center space-x-4">
          <Button 
            variant="ghost" 
            size="sm" 
            asChild
            className="h-10 px-4 hover:bg-slate-100/80 dark:hover:bg-slate-700/60 hover:scale-[1.02] transition-all duration-200 rounded-[6px]"
          >
            <Link to="/admin/prospects">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Pipeline
            </Link>
          </Button>
          
          <Separator orientation="vertical" className="h-6" />
          
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
              {entityTitle}
            </h1>
            <div className="flex items-center space-x-2 mt-2">
              <Badge className={`${entityStatus.color} px-3 py-1 rounded-[6px] font-medium text-sm shadow-sm`}>
                {entityStatus.label}
              </Badge>
              <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                Updated {lastUpdatedText}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            className="h-10 px-4 bg-white/80 backdrop-blur-sm border-slate-200/60 hover:bg-white/90 hover:border-slate-300/80 hover:shadow-sm hover:scale-[1.02] transition-all duration-200 dark:bg-slate-800/80 dark:border-slate-700/60 dark:hover:bg-slate-800/90 rounded-[6px]"
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>
    </div>
  </div>
</div>
```

**Key Reusable Patterns:**
- **Header Container**: `rounded-[14px]` with layered background gradients
- **Glass Blur Effects**: `backdrop-blur-[12px] saturate-[150%]`  
- **Interactive Elements**: Hover scale `hover:scale-[1.02]` with backdrop effects
- **Border Treatment**: Semi-transparent borders with theme-aware colors
- **Flexible Content**: Supports any entity title, status, and action buttons

## Glass Morphism Tab System (Production)
**Pattern Type**: Tabbed Content Component ✅

### Reusable Tab Navigation Pattern

This pattern provides a glass morphism tab system suitable for any tabbed content interface:

```tsx
// Generic Tab System Pattern - Applicable to any tabbed content interface
<Tabs defaultValue="overview" className="w-full">
  <TabsList className="grid w-full grid-cols-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-[8px] border border-slate-200/40 dark:border-slate-700/30 rounded-[8px] p-1 shadow-sm">
    {tabs.map((tab) => (
      <TabsTrigger 
        key={tab.value}
        value={tab.value} 
        className="rounded-[6px] data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/10 data-[state=active]:to-blue-600/10 data-[state=active]:text-blue-600 data-[state=active]:dark:text-blue-400 data-[state=active]:border data-[state=active]:border-blue-500/20 data-[state=active]:shadow-sm hover:bg-slate-100/60 dark:hover:bg-slate-700/50 transition-all duration-200"
      >
        {tab.label}
      </TabsTrigger>
    ))}
  </TabsList>
  
  {tabs.map((tab) => (
    <TabsContent key={tab.value} value={tab.value} className="space-y-6">
      {tab.content}
    </TabsContent>
  ))}
</Tabs>
```

**Production-Tested Tab Patterns:**
- **Tab List**: Glass background with `backdrop-blur-[8px]`
- **Active State**: Gradient background `from-blue-500/10 to-blue-600/10`
- **Hover Effects**: Subtle background `hover:bg-slate-100/60`
- **Border Styling**: Semi-transparent `border-blue-500/20`

## Information Card Layouts
**Pattern Type**: Content Card Component ✅

### Reusable Information Card Pattern

This pattern provides a flexible information card layout suitable for displaying any structured content:

```tsx
// Generic Information Card Pattern - Applicable to any structured content display
<Card className="bg-gradient-to-br from-white/90 to-slate-50/80 dark:from-slate-800/90 dark:to-slate-900/80 backdrop-filter backdrop-blur-[10px] saturate-[140%] border border-slate-200/40 dark:border-slate-700/30 shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.25)] rounded-[10px] hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:scale-[1.02] hover:-translate-y-1 transition-all duration-300">
  <CardHeader>
    <CardTitle className="flex items-center text-slate-900 dark:text-slate-100 font-semibold">
      <Building2 className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
      Business Information
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Business Name</label>
        <p className="text-slate-900 dark:text-slate-100 font-semibold">{prospect.businessname}</p>
      </div>
      
      {prospect.ownername && (
        <div>
          <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">Owner Name</label>
          <p className="text-slate-900 dark:text-slate-100 font-medium">{prospect.ownername}</p>
        </div>
      )}
    </div>
    
    {prospect.notes && (
      <div className="mt-6">
        <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3 block">
          Notes
        </label>
        <div className="rounded-[8px] border border-slate-200/40 dark:border-slate-700/40 p-4 bg-slate-50/50 dark:bg-slate-800/50">
          <p className="whitespace-pre-wrap text-slate-900 dark:text-slate-100 leading-relaxed">
            {prospect.notes}
          </p>
        </div>
      </div>
    )}
  </CardContent>
</Card>
```

**Production Card Features:**
- **Glass Background**: `from-white/90 to-slate-50/80` with `backdrop-blur-[10px]`
- **Hover Animation**: `hover:scale-[1.02] hover:-translate-y-1` 
- **Shadow Evolution**: Base shadow to enhanced hover shadow
- **Nested Content**: Consistent container styling for additional information sections

## Notes Display Pattern
**Pattern Type**: Static Notes Display Component ✅
**Source**: `routes/admin/prospects/$prospectId/index.tsx`

### Universal Notes Display Pattern

This pattern provides consistent styling for displaying notes and text content using the same container styling as Business Hours and other information sections:

```tsx
// Universal Notes Display Pattern - For displaying static text content
{notes && (
  <div className="mt-6">
    <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-3 block">
      Notes
    </label>
    <div className="rounded-[8px] border border-slate-200/40 dark:border-slate-700/40 p-4 bg-slate-50/50 dark:bg-slate-800/50">
      <p className="whitespace-pre-wrap text-slate-900 dark:text-slate-100 leading-relaxed">
        {notes}
      </p>
    </div>
  </div>
)}
```

**Notes Display Features:**
- **Container Styling**: Uses same background and border treatment as Business Hours containers
- **Label Positioning**: `mb-3` spacing between label and content container 
- **Text Treatment**: `whitespace-pre-wrap` preserves line breaks, `leading-relaxed` for readability
- **Theme Support**: Full light/dark mode compatibility with consistent contrast
- **Rounded Borders**: `rounded-[8px]` matching other information containers
- **Subtle Background**: `bg-slate-50/50 dark:bg-slate-800/50` for clear content separation

**Universal Text Display Applications:**
- Notes sections in detail views
- Description fields in entity displays  
- Comment content in card layouts
- Any multi-line text content requiring readable display
- Feedback or message displays

**Implementation Consistency:**
```tsx
// Same container pattern used across different content types
const containerClass = "rounded-[8px] border border-slate-200/40 dark:border-slate-700/40 p-4 bg-slate-50/50 dark:bg-slate-800/50";
const labelClass = "text-sm font-medium text-slate-600 dark:text-slate-400 mb-3 block";
const textClass = "whitespace-pre-wrap text-slate-900 dark:text-slate-100 leading-relaxed";

// Business Hours Display
<div className="mt-6">
  <label className={labelClass}>Business Hours</label>
  <div className={containerClass}>
    <div className={textClass}>{formattedHours}</div>
  </div>
</div>

// Notes Display  
<div className="mt-6">
  <label className={labelClass}>Notes</label>
  <div className={containerClass}>
    <p className={textClass}>{notes}</p>
  </div>
</div>

// Custom Content Display
<div className="mt-6">
  <label className={labelClass}>Description</label>
  <div className={containerClass}>
    <div className={textClass}>{description}</div>
  </div>
</div>
```

## Interactive Link Components (Production) 
**Pattern Type**: Action Link Component ✅

### Reusable Interactive Link Pattern

This pattern provides interactive links suitable for any clickable contact information or action triggers:

```tsx
// Generic Interactive Link Pattern - Applicable to any clickable contact or action link
{interactiveLinks.map((link) => (
  <div key={link.key}>
    <label className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1 block">{link.label}</label>
    <button 
      onClick={() => link.onClick(link.value)}
      className={`text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-all duration-200 hover:scale-[1.02] hover:underline focus:ring-2 focus:ring-blue-500/20 focus:outline-none rounded px-1 font-medium ${link.fontClass || ''}`}
    >
      {link.value}
    </button>
  </div>
))}
```

**Interactive Link Features:**
- **Micro Scale**: `hover:scale-[1.02]` for subtle feedback
- **Focus Ring**: `focus:ring-2 focus:ring-blue-500/20` for accessibility
- **Font Treatment**: `font-mono` for phone numbers, `font-medium` for emails
- **Color Progression**: Blue shades with hover state transitions

## Enhanced Button Components
**Pattern Type**: Enhanced Button Component ✅

### Reusable Enhanced Button Pattern

This pattern provides gradient and glass morphism buttons suitable for primary and secondary actions:

```tsx
// Generic Enhanced Button Pattern - Applicable to any primary/secondary action buttons
{/* Primary Gradient Button Pattern */}
<Button 
  className="w-full justify-start h-11 px-4 bg-gradient-to-r from-blue-500/90 to-blue-600/90 hover:from-blue-500 hover:to-blue-600 text-white font-medium shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:shadow-[0_8px_24px_rgba(59,130,246,0.4)] hover:scale-[1.02] hover:-translate-y-0.5 transition-all duration-200 border-0 rounded-[6px] backdrop-filter backdrop-blur-[8px]" 
  onClick={primaryAction.onClick}
>
  <primaryAction.Icon className="h-4 w-4 mr-2" />
  {primaryAction.label}
</Button>

{/* Secondary Glass Button Pattern */}
<Button 
  className="w-full justify-start h-11 px-4 bg-white/90 dark:bg-slate-800/90 hover:bg-white/95 dark:hover:bg-slate-800/95 text-slate-700 dark:text-slate-200 backdrop-filter backdrop-blur-[8px] saturate-[150%] border border-slate-200/60 dark:border-slate-700/40 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)] hover:scale-[1.01] transition-all duration-200 rounded-[6px]"
  onClick={secondaryAction.onClick}
>
  <secondaryAction.Icon className="h-4 w-4 mr-2 text-slate-500 dark:text-slate-400" />
  {secondaryAction.label}
</Button>
```

**Advanced Button Features:**
- **Gradient Primary**: `from-blue-500/90 to-blue-600/90` with hover intensification
- **Glass Secondary**: `backdrop-blur-[8px] saturate-[150%]` with semi-transparent backgrounds
- **Shadow Animation**: Progressive shadow enhancement on hover
- **Icon Alignment**: Proper spacing and color coordination

---

## 🔴 NO THEORETICAL EXAMPLES

This document contains ONLY production-tested patterns. If you need a pattern that's not here:

1. Check if it exists in the production codebase
2. If it exists, add it here with proper attribution
3. If it doesn't exist, implement it first, test it, then add it here

**Remember**: This is the implementation BIBLE - only verified, working code belongs here.

---

## Shadcn/UI Component Usage

### Critical Implementation Rule

**ALWAYS use shadcn components when available**. Here's the workflow:

1. **Check shadcn availability** using MCP server: `mcp__shadcn-ui__list_components`
2. **Get component code**: `mcp__shadcn-ui__get_component`
3. **Get usage demo**: `mcp__shadcn-ui__get_component_demo`
4. **Apply NextAge styling** on top of shadcn base

### Production shadcn Usage Examples

```tsx
// Example: Card with NextAge styling
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

<Card className="nextage-card-gradient nextage-card-hover">
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-[var(--space-sm)]">
    <CardTitle className="font-medium text-sm">Title</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>

// Example: Button with NextAge variants
import { Button } from "@/components/ui/button";

<Button 
  className="h-10 px-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
>
  Primary Action
</Button>

// Example: Dropdown with glass morphism
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

<DropdownMenuContent 
  style={{
    background: document.documentElement.classList.contains('dark') 
      ? "linear-gradient(135deg, #202028 0%, rgba(0, 102, 255, 0.15) 50%, rgba(255, 107, 53, 0.12) 100%)"
      : "linear-gradient(135deg, #ffffff 0%, rgba(0, 102, 255, 0.08) 50%, rgba(255, 107, 53, 0.08) 100%)"
  }}
>
  <DropdownMenuItem>Item</DropdownMenuItem>
</DropdownMenuContent>
```

---

## Common Implementation Patterns

### Pattern 1: Consistent Glass Effects

Always use the same glass morphism values for similar components:
- Dropdowns: Inline styles with theme detection (see dropdown example)
- Cards: `.nextage-card-gradient` class
- Navigation: `.nextage-nav` class with backdrop blur

### Pattern 2: Layout Hierarchy

Follow the established flex layout pattern:
- Root: `body` with `flex flex-col min-h-screen`
- Main: `nextage-hero-gradient flex-1 flex flex-col content-center`
- Content: `flex flex-1` to inherit parent's available space
- NEVER use height classes in nested content

### Pattern 3: Admin Page Structure

All admin pages must follow this pattern:
1. Include `SidebarTrigger` with `className="-ml-1"`
2. Place trigger before page title with `gap-3` spacing
3. Use consistent header layout with action buttons on right

---

**Last Updated**: 2025-02-01  
**Version**: 3.3.0  
**Status**: Production

**This document is the authoritative universal design system guide based solely on production code.**

## Modal Patterns
**Pattern Type**: Modal Component ✅
**Source**: `components/prospects/ProspectModal.tsx`

### Complex Form Modal with NextAge Header/Footer

This pattern provides a sophisticated modal for elaborate form entry with unified NextAge branding, validation feedback, and structured layout:

```tsx
// Complex Form Modal Pattern - For elaborate data entry with validation
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { X } from "lucide-react";

<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-h-[min(85vh,calc(100vh-120px))] !flex !flex-col !gap-0 transform-gpu overflow-hidden rounded-[14px] border border-black/12 bg-gradient-to-br from-white/95 to-slate-50/90 shadow-lg backdrop-blur-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:duration-150 data-[state=open]:duration-200 sm:max-w-[600px] will-change-transform dark:border-white/15 dark:from-slate-800/90 dark:to-slate-900/80 dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] p-0">
    {/* Custom Close Button */}
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onOpenChange(false)}
      className="absolute right-4 top-4 z-50 h-8 w-8 rounded-[6px] border border-white/20 bg-white/80 p-0 text-slate-600 backdrop-blur-sm transition-all duration-200 hover:bg-white/90 hover:text-slate-900 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/30 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-700/90 dark:hover:text-slate-200"
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Close dialog</span>
    </Button>
    
    {/* Modal Header with NextAge Gradient */}
    <DialogHeader className="flex-shrink-0 nextage-card-gradient p-6 pb-0 rounded-t-[14px]" style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
      <DialogTitle className="flex items-center font-semibold text-slate-900 text-xl dark:text-slate-100">
        <div className="mr-3 rounded-[6px] bg-blue-500/10 p-2 dark:bg-blue-400/10">
          <Edit className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        Form Title
      </DialogTitle>
      <DialogDescription className="text-slate-600 dark:text-slate-400">
        Form description and instructions. Required fields are marked with *.
      </DialogDescription>
    </DialogHeader>

    {/* Modal Body - Scrollable Content */}
    <div className="flex-1 overflow-y-auto p-6 min-h-0">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Form fields go here */}
        </form>
      </Form>
    </div>

    {/* Modal Footer with NextAge Gradient and Validation */}
    <div className="flex-shrink-0 nextage-card-gradient p-6 rounded-b-[14px]" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
      {/* Validation Error Summary */}
      {showErrorSummary && Object.keys(validationErrors).length > 0 && (
        <div className="mb-4 rounded-[8px] border border-red-200 bg-red-50/80 p-4 backdrop-blur-sm dark:border-red-800/30 dark:bg-red-900/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                Please fix the following errors:
              </h4>
              <ul className="space-y-1 text-sm text-red-700 dark:text-red-300">
                {Object.entries(validationErrors).map(([field, error]) => (
                  <li key={field} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigateToError(field)}
                      className="hover:underline text-left"
                    >
                      {getFieldLabel(field)}: {error.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
          className="min-w-[100px]"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isSubmitting}
          className="min-w-[100px] bg-blue-600 hover:bg-blue-700"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

**Complex Modal Features:**
- **Viewport-Aware Sizing**: `max-h-[min(85vh,calc(100vh-120px))]` for content-responsive height
- **Header/Body/Footer Architecture**: True structural separation with `flex flex-col`
- **NextAge Branded Sections**: Header and footer use `nextage-card-gradient` with unified borders
- **Validation Integration**: Footer displays error summary with navigation to problem fields
- **Scrollable Body**: Content scrolls independently while header/footer remain fixed
- **Border Continuity**: Unified `border-black/12 dark:border-white/15` throughout

### Simple Detail Modal for Field Input

This pattern provides a lightweight modal for simple field details, additional input, or focused editing tasks:

```tsx
// Simple Detail Modal Pattern - For focused field editing or additional input
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-h-[90vh] transform-gpu overflow-y-auto rounded-[14px] border border-white/20 bg-gradient-to-br from-white/95 to-slate-50/90 shadow-lg backdrop-blur-lg transition-all duration-300 sm:max-w-[500px] dark:border-slate-700/30 dark:from-slate-800/90 dark:to-slate-900/80">
    {/* Custom Close Button */}
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onOpenChange(false)}
      className="absolute right-4 top-4 z-50 h-8 w-8 rounded-[6px] border border-white/20 bg-white/80 p-0 text-slate-600 backdrop-blur-sm transition-all duration-200 hover:bg-white/90 hover:text-slate-900 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700/30 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-700/90 dark:hover:text-slate-200"
    >
      <X className="h-4 w-4" />
      <span className="sr-only">Close dialog</span>
    </Button>
    
    <DialogHeader className="pb-6">
      <DialogTitle className="flex items-center font-semibold text-slate-900 text-xl dark:text-slate-100">
        <Clock className="h-5 w-5 mr-3 text-blue-600 dark:text-blue-400" />
        Detail Editor Title
      </DialogTitle>
      <DialogDescription className="text-slate-600 dark:text-slate-400">
        Brief description of the input or editing task.
      </DialogDescription>
    </DialogHeader>
    
    {/* Simple Content Area */}
    <div className="space-y-4">
      {/* Input fields or content */}
    </div>
    
    {/* Simple Action Buttons */}
    <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-200/60 dark:border-slate-700/40">
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Cancel
      </Button>
      <Button onClick={handleSave}>
        Save
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

**Simple Modal Features:**
- **Standard Glass Morphism**: Classic glass background without header/footer branding
- **Compact Layout**: Single content area with minimal structural complexity  
- **Standard Border Treatment**: Simple border separator for actions
- **Focused Purpose**: Ideal for single-field editing, selections, or brief input tasks

## Delete Confirmation Dialog Pattern

### ✅ **Confirmation Dialog Pattern**

Use the universal ConfirmationDialog component for all confirmation prompts (delete, reject, archive, etc.).

```tsx
import { ConfirmationDialog } from "@/components/ui/ConfirmationDialog";
import { createDeleteConfirmation } from "@/lib/constants/confirmationConst";

// Store full object, not just ID
const [deleteItem, setDeleteItem] = useState<Item | null>(null);
const deleteMutation = useDeleteItem();

const handleDelete = async () => {
  if (!deleteItem) return;
  await deleteMutation.mutateAsync({ data: { id: deleteItem.id } });
  setDeleteItem(null);
};

// On delete button click - store full object
<Button onClick={() => setDeleteItem(item)}>Delete</Button>

// Confirmation dialog
{deleteItem && (
  <ConfirmationDialog
    {...createDeleteConfirmation(
      deleteItem.name,
      "This will permanently remove the item."
    )}
    isOpen={!!deleteItem}
    onConfirm={handleDelete}
    onCancel={() => setDeleteItem(null)}
    isLoading={deleteMutation.isPending}
  />
)}
```

**Available helpers** (`@/lib/constants/confirmationConst`):
- `createDeleteConfirmation(itemName, description?)` - Delete actions (red)
- `createRejectConfirmation(itemName, description?)` - Reject actions (orange)
- `getConfirmationConfig(type, overrides?)` - Custom confirmations

**Variants**: `danger` (red), `warning` (orange), `info` (blue)

## Links Management UI Pattern
**Pattern Type**: Interactive Links Component ✅
**Source**: `components/prospects/ProspectModal.tsx`

This pattern provides a comprehensive links management interface for displaying, adding, and deleting social media and website links with auto-detected network icons:

```tsx
// Links Management Pattern - For managing social media and website links
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Facebook, Globe } from "lucide-react";

// Link display with auto-detected icons and hover delete
<div className="space-y-3">
  <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
    Links
  </Label>
  
  {links.map((link) => (
    <div key={link.id} className="group relative flex items-center gap-3 rounded-[6px] border border-slate-200/60 bg-slate-50/50 p-3 transition-all duration-200 hover:bg-slate-100/80 dark:border-slate-700/40 dark:bg-slate-800/50 dark:hover:bg-slate-700/60">
      {/* Auto-detected network icon */}
      <div className="flex-shrink-0">
        {getNetworkIcon(link.url)}
      </div>
      
      {/* Link details */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">
          {getNetworkName(link.url)}
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
          {link.url}
        </div>
      </div>
      
      {/* Hover delete button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => handleDeleteLink(link.id)}
        className="h-8 w-8 p-0 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">Delete link</span>
      </Button>
    </div>
  ))}
  
  {/* Add new link button */}
  <Button
    type="button"
    variant="outline"
    onClick={handleAddLink}
    className="w-full justify-center gap-2 h-10 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50/80 dark:border-slate-600 dark:hover:border-slate-500 dark:hover:bg-slate-800/50"
  >
    <Plus className="h-4 w-4" />
    Add Link
  </Button>
</div>
```

**Links Management Features:**
- **Auto-Detection**: Automatically detects social media platforms and displays appropriate icons
- **Hover Interactions**: Delete buttons appear on hover for clean interface
- **Network Recognition**: Facebook, Twitter, Instagram, LinkedIn, website auto-detection
- **Responsive Layout**: Truncates long URLs while maintaining readability

## Special Input Processing Patterns

### Address Parsing with Auto-Field Population

Lightweight pattern for parsing complete addresses into separate city/state/zip fields:

```tsx
// Auto-parsing address input - minimal style impact, functional enhancement
<FormField
  control={form.control}
  name="address"
  render={({ field }) => (
    <FormItem className="space-y-2">
      <FormLabel>Business Address *</FormLabel>
      <FormControl>
        <Input
          {...field}
          placeholder="Enter full address"
          onChange={(e) => {
            field.onChange(e);
            // Auto-parse and populate city/state/zip fields
            parseAndPopulateAddress(e.target.value, form.setValue);
          }}
          className={nextageInputClass}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

### Phone Number with Extension Support

Enhanced phone formatting supporting extensions:

```tsx
// Phone input with extension support - formats as (555) 123-4567 ext. 123
<FormField
  control={form.control}
  name="phonenumber"
  render={({ field }) => (
    <FormItem className="space-y-2">
      <FormLabel>Phone Number *</FormLabel>
      <FormControl>
        <Input
          {...field}
          placeholder="(555) 123-4567 ext. 123"
          onChange={(e) => {
            const formatted = formatPhoneWithExtension(e.target.value);
            field.onChange(formatted);
          }}
          className={nextageInputClass}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

## Dropdown Select Patterns
**Pattern Type**: Select Components with Glass Morphism ✅
**Source**: `components/prospects/ProspectModal.tsx`, `routes/admin/prospects/index.tsx`, `components/ui/select.tsx`
**Last Updated**: 2025-02-01

### NextAge Dropdown Style Definition

The NextAge dropdown system features sophisticated glass morphism effects with solid background foundation and gradient overlays to prevent opacity bleed-through issues. This is our production-tested dropdown pattern used across all NextAge applications.

#### SelectContent Styling (Dropdown Container) - SOLID BACKGROUND PATTERN

**Critical Implementation Note**: Always use the solid background with gradient overlay pattern to prevent opacity issues where background content shows through the dropdown.

```tsx
// ✅ PRODUCTION NextAge SelectContent Glass Morphism with Solid Background
<SelectContent className="
  bg-white dark:bg-slate-800
  before:absolute before:inset-0 before:bg-gradient-to-br 
  before:from-white/40 before:via-slate-50/50 before:to-white/30
  dark:before:from-slate-800/40 dark:before:via-slate-800/35 dark:before:to-slate-900/40
  before:rounded-[10px]
  backdrop-filter backdrop-blur-[12px] saturate-[120%]
  border border-slate-200/60 dark:border-slate-700/30
  shadow-[0_8px_24px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)]
  dark:shadow-[0_12px_32px_rgba(0,0,0,0.6),0_4px_16px_rgba(0,0,0,0.4)]
  rounded-[10px]
  animate-in fade-in-0 zoom-in-95 duration-200
  data-[state=closed]:animate-out data-[state=closed]:fade-out-0 
  data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150
  will-change-transform transform-gpu
  relative overflow-hidden
">
```

**Why This Pattern:**
- **Solid Base**: `bg-white dark:bg-slate-800` provides full opacity foundation
- **Gradient Overlay**: `before:` pseudo-element adds glass morphism effect without transparency issues
- **Proper Containment**: `relative overflow-hidden` ensures pseudo-element stays within bounds
- **No Bleed-Through**: Background content cannot show through the dropdown

#### SelectItem Hover States (Individual Options)

```tsx
// ✅ PRODUCTION NextAge SelectItem with Glass Morphism Hover
// Applied in components/ui/select.tsx
<SelectPrimitive.Item
  className={cn(
    "relative flex w-full cursor-default select-none items-center rounded-[6px] py-[var(--space-sm)] pr-[var(--space-sm)] pl-[var(--space-xl)] text-sm outline-none transition-all duration-200",
    // Base state - transparent with subtle text
    "text-slate-700 dark:text-slate-300",
    // Hover state - glass morphism with gradient
    "hover:bg-gradient-to-r hover:from-blue-500/10 hover:via-blue-400/8 hover:to-transparent",
    "hover:backdrop-blur-[4px] hover:saturate-[130%]",
    "hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
    "hover:text-slate-900 dark:hover:text-slate-100",
    // Focus state - stronger glass morphism effect
    "focus:bg-gradient-to-r focus:from-blue-500/15 focus:via-blue-400/12 focus:to-transparent",
    "focus:backdrop-blur-[6px] focus:saturate-[150%]",
    "focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]",
    "focus:text-slate-900 dark:focus:text-white",
    // Selected/highlighted state indicator
    "data-[highlighted]:bg-gradient-to-r data-[highlighted]:from-blue-500/12 data-[highlighted]:via-blue-400/10 data-[highlighted]:to-transparent",
    "data-[highlighted]:backdrop-blur-[5px] data-[highlighted]:saturate-[140%]",
    // Disabled state
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    className,
  )}
>
```

### Basic Territory Select
Simple dropdown with NextAge glass morphism styling:

```tsx
// Basic select with NextAge glass morphism styling
<FormField
  control={form.control}
  name="territory"
  render={({ field }) => (
    <FormItem className="space-y-2">
      <FormLabel className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Territory
      </FormLabel>
      <Select onValueChange={field.onChange} value={field.value}>
        <FormControl>
          <SelectTrigger className={`${nextageInputClass} ${form.formState.errors.territory ? 'border-red-300 focus:border-red-500' : ''}`}>
            <SelectValue placeholder="Select territory" />
          </SelectTrigger>
        </FormControl>
        <SelectContent className="
          bg-white dark:bg-slate-800
          before:absolute before:inset-0 before:bg-gradient-to-br 
          before:from-white/40 before:via-slate-50/50 before:to-white/30
          dark:before:from-slate-800/40 dark:before:via-slate-800/35 dark:before:to-slate-900/40
          before:rounded-[10px]
          backdrop-filter backdrop-blur-[12px] saturate-[120%]
          border border-slate-200/60 dark:border-slate-700/30
          shadow-[0_8px_24px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)]
          dark:shadow-[0_12px_32px_rgba(0,0,0,0.6),0_4px_16px_rgba(0,0,0,0.4)]
          rounded-[10px]
          animate-in fade-in-0 zoom-in-95 duration-200
          data-[state=closed]:animate-out data-[state=closed]:fade-out-0 
          data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150
          will-change-transform transform-gpu
          relative overflow-hidden
        ">
          <SelectItem value="Missouri">Missouri</SelectItem>
          <SelectItem value="Illinois">Illinois</SelectItem>
          <SelectItem value="Ohio">Ohio</SelectItem>
          <SelectItem value="Florida">Florida</SelectItem>
        </SelectContent>
      </Select>
      <FormMessage className="text-red-600 dark:text-red-400" />
    </FormItem>
  )}
/>
```

### Dynamic User Assignment Select
Advanced dropdown with async data loading:

```tsx
// User assignment dropdown with dynamic data loading
const usersQuery = useQuery({
  queryKey: ['users', 'admin'],
  queryFn: () => listUsers({ data: { role: 'admin', limit: 100 } }),
  staleTime: 5 * 60 * 1000, // 5 minutes cache
});

<FormField
  control={form.control}
  name="managerclerkuserid"
  render={({ field }) => (
    <FormItem className="space-y-2">
      <FormLabel className="text-sm font-medium text-slate-700 dark:text-slate-300">
        Manager
      </FormLabel>
      <FormControl>
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger className={cn(nextageInputClass, "w-full")}>
            <SelectValue placeholder="Select manager" />
          </SelectTrigger>
          <SelectContent className="
            bg-white dark:bg-slate-800
            before:absolute before:inset-0 before:bg-gradient-to-br 
            before:from-white/40 before:via-slate-50/50 before:to-white/30
            dark:before:from-slate-800/40 dark:before:via-slate-800/35 dark:before:to-slate-900/40
            before:rounded-[10px]
            backdrop-filter backdrop-blur-[12px] saturate-[120%]
            border border-slate-200/60 dark:border-slate-700/30
            shadow-[0_8px_24px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)]
            dark:shadow-[0_12px_32px_rgba(0,0,0,0.6),0_4px_16px_rgba(0,0,0,0.4)]
            rounded-[10px]
            animate-in fade-in-0 zoom-in-95 duration-200
            data-[state=closed]:animate-out data-[state=closed]:fade-out-0 
            data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150
            will-change-transform transform-gpu
            relative overflow-hidden
          ">
            {usersQuery.data?.map((user) => (
              <SelectItem key={user.clerkuserid} value={user.clerkuserid}>
                {user.firstname && user.lastname 
                  ? `${user.firstname} ${user.lastname}` 
                  : user.email || user.clerkuserid}
              </SelectItem>
            ))}
            {usersQuery.isLoading && (
              <SelectItem value="loading" disabled>
                Loading users...
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </FormControl>
      <FormMessage className="text-red-600 dark:text-red-400" />
    </FormItem>
  )}
/>
```

**NextAge Dropdown Key Features:**
- **Solid Base Background**: `bg-white dark:bg-slate-800` prevents opacity bleed-through
- **Glass Morphism Overlay**: `before:` pseudo-element provides gradient effects without transparency issues
- **Backdrop Effects**: 12px blur with 120% saturation for depth
- **Enhanced Shadows**: Multi-layer shadows for dimensional effect
- **Hover States**: Gradient-based hover with glass morphism on items
- **Dark Mode Optimization**: Theme-aware backgrounds and overlays
- **Smooth Animations**: 200ms transitions with GPU acceleration
- **Focus Management**: Progressive enhancement from hover to focus states
- **Performance**: `will-change-transform` and `transform-gpu` for smooth rendering
- **Opacity Prevention**: Layered approach ensures no background content shows through

## Shared NextAge Style Constants

**Pattern Type**: Centralized Style Management ✅  
**Source**: `lib/constants/styleConst.ts`  
**Last Updated**: 2025-10-22

### Overview

All NextAge glass morphism styling is now centralized in shared constants to eliminate code duplication and ensure consistency across the application. **Always use these constants instead of inline style strings.**

### Available Constants

#### 1. NEXTAGE_INPUT_CLASS

**Use For**: Input fields, SelectTrigger components, and any form element that accepts text input.

```tsx
import { NEXTAGE_INPUT_CLASS } from "@/lib/constants/styleConst";

// ✅ For Input components
<Input
  placeholder="Enter business name"
  className={NEXTAGE_INPUT_CLASS}
/>

// ✅ For SelectTrigger components
<SelectTrigger className={NEXTAGE_INPUT_CLASS}>
  <SelectValue placeholder="Select option" />
</SelectTrigger>

// ✅ Combined with additional classes using cn()
<Input
  placeholder="Search..."
  className={cn(NEXTAGE_INPUT_CLASS, "pl-10")}
/>
```

**Includes**:
- Glass morphism with backdrop blur and saturation
- Hover states (background and border changes)
- Focus states (blue ring glow effect)
- Disabled states (opacity and cursor)
- Text colors for light/dark mode
- Minimum height (48px) and padding

#### 2. NEXTAGE_TEXTAREA_CLASS

**Use For**: Textarea components for multi-line text input.

```tsx
import { NEXTAGE_TEXTAREA_CLASS } from "@/lib/constants/styleConst";

// ✅ For Textarea components
<Textarea
  placeholder="Enter notes..."
  className={NEXTAGE_TEXTAREA_CLASS}
/>

// ✅ Combined with error state
<Textarea
  placeholder="Additional notes..."
  className={`${NEXTAGE_TEXTAREA_CLASS} ${errors.notes ? "border-red-300 focus:border-red-500" : ""}`}
/>
```

**Includes**:
- All NEXTAGE_INPUT_CLASS features
- Minimum height (80px) optimized for textarea
- `resize-none` to prevent resizing

#### 3. NEXTAGE_TABLE_CLASS

**Use For**: Table wrapper containers to provide glass morphism background.

```tsx
import { NEXTAGE_TABLE_CLASS } from "@/lib/constants/styleConst";

// ✅ For table containers
<div className={NEXTAGE_TABLE_CLASS}>
  <Table>
    <TableHeader>
      {/* ... */}
    </TableHeader>
    <TableBody>
      {/* ... */}
    </TableBody>
  </Table>
</div>
```

**Includes**:
- Glass morphism background
- Rounded corners (12px) with overflow hidden
- Border and shadow
- Backdrop blur and saturation

### Implementation Rules

**✅ DO:**
- Always import from `@/lib/constants/styleConst`
- Use these constants for all NextAge-styled form elements
- Combine with `cn()` when adding additional classes
- Use the appropriate constant for each element type

**❌ DON'T:**
- Create inline style strings that duplicate these constants
- Use local const declarations for NextAge styling
- Mix different styling patterns (use constants consistently)

### Migration from Inline Styles

If you find inline NextAge style constants in old code:

```tsx
// ❌ OLD - Don't do this
const nextageInputClass = `
  min-h-[48px] px-4 py-3 text-base font-medium
  bg-white/90 dark:bg-slate-800/90
  backdrop-filter backdrop-blur-[8px] saturate-[150%]
  ...
`;

// ✅ NEW - Use shared constant
import { NEXTAGE_INPUT_CLASS } from "@/lib/constants/styleConst";
```

### Why Use Shared Constants?

1. **Single Source of Truth**: Update styling in one place, applies everywhere
2. **Bundle Size**: Eliminates ~7kb of duplicated code
3. **Consistency**: Guaranteed identical styling across all components
4. **Maintainability**: Easier to update and evolve design system
5. **Best Practice**: Follows Tailwind/utility-first patterns for project-specific styling

## Section Separator Pattern
**Pattern Type**: Subtle Rule Line for Complex Forms ✅
**Source**: `components/prospects/ProspectModal.tsx`

### Form Section Divider
Clean separator for organizing complex forms without heavy headers:

```tsx
// Subtle rule line to separate form sections in modals
<div className="space-y-6">
  {/* Primary form fields */}
  <div className="space-y-4">
    <FormField name="businessname" />
    <FormField name="phonenumber" />
    <FormField name="emailbusiness" />
    <FormField name="address" />
  </div>

  {/* Subtle divider for additional fields */}
  <hr className="border-t border-slate-200/40 dark:border-slate-700/30 my-6" />

  {/* Secondary/Additional fields */}
  <div className="space-y-4">
    <FormField name="businesshours" />
    <FormField name="links" />
    <FormField name="ownername" />
    <FormField name="notes" />
  </div>
</div>
```

**Section Separator Best Practices:**
- **Subtle Styling**: Use low opacity borders (`/40` or `/30`) to avoid visual heaviness
- **Consistent Spacing**: Apply `my-6` for balanced vertical spacing
- **No Headers Needed**: Rule line provides visual separation without text labels
- **Dark Mode Support**: Include dark variant with appropriate opacity
- **Group Related Fields**: Organize fields logically above and below separator

### Alternative Section Patterns

```tsx
// Double spacing without line (most subtle)
<div className="space-y-8">
  <div className="space-y-4">{/* Section 1 */}</div>
  <div className="space-y-4">{/* Section 2 */}</div>
</div>

// With section label (when context needed)
<div className="space-y-6">
  <div className="space-y-4">{/* Main fields */}</div>
  
  <div className="relative">
    <hr className="border-t border-slate-200/40 dark:border-slate-700/30" />
    <span className="absolute left-4 -top-2.5 bg-white dark:bg-slate-900 px-2 text-xs text-slate-500">
      Additional Information
    </span>
  </div>
  
  <div className="space-y-4">{/* Additional fields */}</div>
</div>
```

**When to Use Section Separators:**
- Complex forms with 6+ fields
- Logical grouping of primary vs secondary information
- Multi-step forms within single modal
- Separating required from optional fields
- Creating visual hierarchy without heavy UI elements

## Enhanced Slider Pattern
**Pattern Type**: Range Input Component ✅
**Source**: `GooglePlacesMultiImportModal.tsx` + `slider.tsx`

### Glass Morphism Range Slider with NextAge Styling

The enhanced slider combines Radix UI's accessibility with NextAge's glass morphism design language, featuring orange accent glows and professional visual depth.

#### Core Slider Component

```tsx
import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center py-3",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track 
      className="relative h-2 w-full grow overflow-hidden rounded-[6px] 
        bg-gradient-to-r from-white/95 to-slate-50/90 
        backdrop-blur-[8px] saturate-[140%] 
        border border-slate-200/40 
        shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]
        dark:from-slate-800/90 dark:to-slate-900/80 
        dark:border-slate-700/30 
        dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]
        transition-all duration-200"
    >
      <SliderPrimitive.Range 
        className="absolute h-full 
          bg-gradient-to-r from-blue-600/90 to-blue-700/90 
          shadow-[0_1px_3px_rgba(59,130,246,0.2)]
          dark:from-blue-500/80 dark:to-blue-600/80
          dark:shadow-[0_1px_3px_rgba(59,130,246,0.3)]
          transition-all duration-200" 
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb 
      className="block h-5 w-5 rounded-full 
        bg-gradient-to-br from-white to-blue-50/90 
        backdrop-blur-[10px] saturate-[180%] brightness-[1.05]
        border border-blue-200/40 
        shadow-[0_0_12px_rgba(255,107,53,0.15),0_4px_8px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.08)]
        ring-offset-background 
        transition-all duration-200 ease-out
        hover:scale-110 hover:shadow-[0_0_16px_rgba(255,107,53,0.25),0_6px_12px_rgba(59,130,246,0.2),0_3px_6px_rgba(0,0,0,0.1)]
        hover:border-blue-300/50
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:ring-offset-2
        active:scale-95
        disabled:pointer-events-none disabled:opacity-50
        dark:from-slate-700 dark:to-slate-800
        dark:border-blue-500/30 
        dark:shadow-[0_0_12px_rgba(255,107,53,0.2),0_4px_8px_rgba(0,0,0,0.3),0_2px_4px_rgba(0,0,0,0.2)]
        dark:hover:shadow-[0_0_20px_rgba(255,107,53,0.3),0_6px_12px_rgba(59,130,246,0.3),0_3px_6px_rgba(0,0,0,0.25)]
        dark:hover:border-blue-400/40
        transform-gpu will-change-transform
        cursor-grab active:cursor-grabbing
        before:content-[''] before:absolute before:inset-[-12px] before:rounded-full" 
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
```

#### Usage with Value Display

```tsx
// Slider with glass morphism value display
<div className="space-y-4">
  <div className="flex items-center justify-between">
    <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
      Search Radius
    </label>
    <span className="px-3 py-1 text-sm font-medium text-slate-900 dark:text-slate-100 
      bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm 
      border border-slate-200/60 dark:border-slate-700/60 
      rounded-[6px] shadow-sm">
      {value} miles
    </span>
  </div>
  <Slider
    value={[value]}
    onValueChange={(val) => setValue(val[0])}
    max={50}
    min={1}
    step={1}
    className="w-full"
  />
</div>
```

### Key Design Elements

#### 1. Glass Morphism Track
- **Background**: Gradient with `backdrop-blur-[8px]` for depth
- **Saturation**: `saturate-[140%]` for enhanced color vibrancy
- **Border**: Semi-transparent with `border-slate-200/40`
- **Shadow**: Inset shadow for recessed appearance

#### 2. Active Range Styling  
- **Primary Color**: Blue gradient matching NextAge primary buttons
- **Depth**: Subtle shadow with blue tint for active indication
- **Transition**: Smooth 200ms transitions for all state changes

#### 3. Enhanced Thumb Design
- **Orange Accent Glow**: Key NextAge brand element with `rgba(255,107,53,...)` shadows
- **Glass Effect**: `backdrop-blur-[10px]` with brightness enhancement
- **Interactive States**: Scale transforms (110% hover, 95% active)
- **Accessibility**: 48px touch target via `before:inset-[-12px]` pseudo-element
- **Performance**: GPU acceleration with `transform-gpu` and `will-change-transform`

#### 4. Value Display Integration
- **Consistent Styling**: Matches input field appearance with glass morphism
- **Responsive Text**: Clear, readable value display
- **Theme Awareness**: Full dark mode support

### Implementation Notes

- **Radix Dependency**: Requires `@radix-ui/react-slider` for accessibility
- **Touch Targets**: 48px minimum for mobile accessibility compliance  
- **Performance**: GPU-accelerated animations prevent layout thrashing
- **Brand Consistency**: Orange accent maintains NextAge visual identity
- **Accessibility**: Full keyboard navigation and screen reader support

### When to Use

- **Range Selection**: Any numeric value selection within defined bounds
- **Filter Controls**: Search radius, price ranges, quantity selectors
- **Settings Panels**: Configuration values with visual feedback
- **Dashboard Controls**: Interactive parameter adjustment

## Glass Morphism Switch Pattern
**Pattern Type**: Toggle Switch Component ✅
**Source**: `GooglePlacesMultiImportModal.tsx` + `switch.tsx`

### NextAge Toggle Switch with Glass Morphism Styling

The enhanced switch combines Radix UI's accessibility with NextAge's glass morphism design language, featuring blue gradient states, subtle glows, and frosted glass effects.

#### Core Switch Component

```tsx
import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // NextAge Glass Morphism - Base Track Styling
        "peer inline-flex h-[1.35rem] w-[2.35rem] shrink-0 items-center rounded-full",
        "border transition-all outline-none",
        
        // Unchecked State - Glass Morphism Background
        "data-[state=unchecked]:bg-gradient-to-r data-[state=unchecked]:from-white/95 data-[state=unchecked]:to-slate-50/90",
        "data-[state=unchecked]:backdrop-blur-[8px] data-[state=unchecked]:saturate-[140%]",
        "data-[state=unchecked]:border-slate-200/40",
        "data-[state=unchecked]:shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]",
        
        // Checked State - Blue Gradient with Glow
        "data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-blue-600/90 data-[state=checked]:to-blue-700/90",
        "data-[state=checked]:border-blue-500/40",
        "data-[state=checked]:shadow-[0_0_12px_rgba(59,130,246,0.2),0_2px_4px_rgba(0,0,0,0.08)]",
        
        // Dark Mode - Unchecked
        "dark:data-[state=unchecked]:from-slate-800/90 dark:data-[state=unchecked]:to-slate-900/80",
        "dark:data-[state=unchecked]:border-slate-700/30",
        "dark:data-[state=unchecked]:shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]",
        
        // Dark Mode - Checked
        "dark:data-[state=checked]:from-blue-500/80 dark:data-[state=checked]:to-blue-600/80",
        "dark:data-[state=checked]:border-blue-400/30",
        "dark:data-[state=checked]:shadow-[0_0_12px_rgba(59,130,246,0.3),0_2px_4px_rgba(0,0,0,0.15)]",
        
        // Focus State
        "focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:ring-offset-2",
        
        // Disabled State
        "disabled:cursor-not-allowed disabled:opacity-50",
        
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // Thumb Base
          "pointer-events-none block h-5 w-5 rounded-full ring-0",
          "transition-all duration-200 ease-out",
          
          // Glass Morphism Thumb - Unchecked
          "data-[state=unchecked]:bg-gradient-to-br data-[state=unchecked]:from-slate-100 data-[state=unchecked]:to-slate-200/90",
          "data-[state=unchecked]:backdrop-blur-[10px] data-[state=unchecked]:saturate-[140%]",
          "data-[state=unchecked]:border data-[state=unchecked]:border-slate-300/40",
          "data-[state=unchecked]:shadow-[0_2px_4px_rgba(0,0,0,0.1)]",
          
          // Glass Morphism Thumb - Checked (White with blue tint)
          "data-[state=checked]:bg-gradient-to-br data-[state=checked]:from-white data-[state=checked]:to-blue-50/90",
          "data-[state=checked]:backdrop-blur-[10px] data-[state=checked]:saturate-[180%] data-[state=checked]:brightness-[1.05]",
          "data-[state=checked]:border data-[state=checked]:border-blue-200/40",
          "data-[state=checked]:shadow-[0_0_8px_rgba(59,130,246,0.15),0_2px_4px_rgba(0,0,0,0.12)]",
          
          // Dark Mode - Unchecked Thumb
          "dark:data-[state=unchecked]:from-slate-600 dark:data-[state=unchecked]:to-slate-700",
          "dark:data-[state=unchecked]:border-slate-500/30",
          
          // Dark Mode - Checked Thumb
          "dark:data-[state=checked]:from-slate-700 dark:data-[state=checked]:to-slate-800",
          "dark:data-[state=checked]:border-blue-400/30",
          "dark:data-[state=checked]:shadow-[0_0_8px_rgba(59,130,246,0.2),0_2px_4px_rgba(0,0,0,0.2)]",
          
          // Position Animation
          "data-[state=checked]:translate-x-[1.05rem] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
```

#### Usage Example - Horizontal Filter Controls

```tsx
// Horizontal layout with multiple switches (Google Places Multi-Import pattern)
<div className="flex items-center gap-4">
  <Label className="font-medium text-slate-700 text-sm dark:text-slate-300">
    Show Duplicates
  </Label>
  <div className="flex items-center gap-4">
    <div className="flex items-center gap-2">
      <Switch
        checked={showDuplicates.high}
        onCheckedChange={(checked) =>
          setShowDuplicates((prev) => ({ ...prev, high: checked }))
        }
        id="show-high-duplicates"
      />
      <Label
        htmlFor="show-high-duplicates"
        className="cursor-pointer text-slate-600 text-sm dark:text-slate-400"
      >
        Likely
      </Label>
    </div>

    <div className="flex items-center gap-2">
      <Switch
        checked={showDuplicates.medium}
        onCheckedChange={(checked) =>
          setShowDuplicates((prev) => ({ ...prev, medium: checked }))
        }
        id="show-medium-duplicates"
      />
      <Label
        htmlFor="show-medium-duplicates"
        className="cursor-pointer text-slate-600 text-sm dark:text-slate-400"
      >
        Possible
      </Label>
    </div>

    <div className="flex items-center gap-2">
      <Switch
        checked={showDuplicates.low}
        onCheckedChange={(checked) =>
          setShowDuplicates((prev) => ({ ...prev, low: checked }))
        }
        id="show-low-duplicates"
      />
      <Label
        htmlFor="show-low-duplicates"
        className="cursor-pointer text-slate-600 text-sm dark:text-slate-400"
      >
        Potential
      </Label>
    </div>
  </div>
</div>
```

### Key Design Elements

#### 1. Glass Morphism Track (Unchecked State)
- Frosted glass background: `from-white/95 to-slate-50/90`
- Backdrop blur effect: `backdrop-blur-[8px]`
- Enhanced color saturation: `saturate-[140%]`
- Subtle border with transparency: `border-slate-200/40`
- Inset shadow for depth: `shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]`

#### 2. Blue Gradient Track (Checked State)
- Blue gradient: `from-blue-600/90 to-blue-700/90`
- Subtle glow effect: `shadow-[0_0_12px_rgba(59,130,246,0.2),0_2px_4px_rgba(0,0,0,0.08)]`
- Semi-transparent border: `border-blue-500/40`

#### 3. Enhanced Thumb Design
- **Unchecked**: Slate gradient (`from-slate-100 to-slate-200/90`) with subtle shadow
- **Checked**: White with blue tint (`from-white to-blue-50/90`) + blue glow
- Glass morphism effects: `backdrop-blur-[10px]`, `saturate-[180%]`, `brightness-[1.05]`
- Smooth animation: `transition-all duration-200 ease-out`
- Precise positioning: `translate-x-[1.05rem]` for checked state

#### 4. Dark Mode Adaptations
- Darker glass effects: `from-slate-800/90 to-slate-900/80` (unchecked)
- Enhanced blue glow in checked state
- Thumb adapts to darker tones while maintaining visual clarity

### Implementation Notes

**Sizing**: Track is `h-[1.35rem] w-[2.35rem]`, thumb is `h-5 w-5` (20px) - slightly larger than standard for better touch targets

**Animation**: Smooth 200ms transition with ease-out timing for professional feel

**Accessibility**: 
- Proper focus states with ring: `focus-visible:ring-2 ring-blue-500/20`
- Label association via `id` and `htmlFor` attributes
- Disabled state with reduced opacity

**Layout Patterns**:
- **Horizontal**: Space-efficient inline layout with `flex items-center gap-4`
- **Vertical**: Stack with `flex-col gap-3` for settings panels
- **Always include labels**: Use `Label` component with matching `htmlFor` attribute

### When to Use

- **Filter Controls**: Show/hide content based on categories or confidence levels
- **Settings Panels**: Enable/disable features or preferences
- **Feature Toggles**: Turn functionality on/off in forms or dashboards
- **Visibility Controls**: Toggle visibility of data, charts, or UI elements
- **Multi-Select Filters**: Horizontal layout for multiple related toggles (like duplicate confidence filters)

## Inline Edit Mode Pattern
**Pattern Type**: Data Management Pattern ✅
**Source**: `routes/admin/prospects/$prospectId/prospect-details.tsx`
**Last Updated**: 2025-11-28

### URL-Based View/Edit/Add Mode System

**This is the PRIMARY pattern for data editing. Use modals ONLY for very simple/quick edits.**

This pattern provides inline editing functionality that switches between view, edit, and add modes using URL search parameters. Action buttons are right-justified in the CardHeader across from the title.

#### Core Concepts

**Three Modes:**
- **View Mode** (`?mode=view` or no param): Read-only display with "Edit" button
- **Edit Mode** (`?mode=edit`): Editable form with "Cancel" and "Save" buttons  
- **Add Mode** (`?mode=add` or `id=new`): Form for creating new records with "Cancel" and "Create" buttons

**URL-Based Mode Control:**
```tsx
// Get mode from search params
const searchParams = useSearch({ from: "/your/route" });
const isEditMode = searchParams?.mode === "edit";
const isAddMode = searchParams?.mode === "add" || id === "new";
```

**Action Button Placement:**
All edit, save, cancel, and action buttons are **right-justified at the top** in the CardHeader, across from the title.

#### Implementation Pattern

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Edit, X } from "lucide-react";

// 1. Define validation schema
const editSchema = z.object({
  field1: z.string().min(1, "Field is required"),
  field2: z.string().optional(),
  // ... other fields
});

type EditFormData = z.infer<typeof editSchema>;

// 2. Component implementation
function DetailPage() {
  const { id } = Route.useParams();
  const searchParams = useSearch({ from: "/your/route" });
  const isEditMode = searchParams?.mode === "edit";
  const isAddMode = searchParams?.mode === "add" || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 3. Fetch existing data (skip for add mode)
  const { data } = useQuery({
    ...queryOptions.detail(id),
    enabled: id !== "new",
  });

  // 4. Setup form with default values
  const form = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: isAddMode
      ? {
          field1: "",
          field2: "",
        }
      : {
          field1: data?.field1 || "",
          field2: data?.field2 || "",
        },
  });

  // 5. Create mutation (for add mode)
  const createMutation = useMutation({
    mutationFn: (formData: EditFormData) => createRecord({ data: formData }),
    onSuccess: (newRecord) => {
      queryClient.invalidateQueries({ queryKey: ["records"] });
      toast.success("Record created successfully");
      // Navigate to view mode of new record
      navigate({
        to: "/your/route/$id",
        params: { id: newRecord.id },
        search: { mode: "view" },
      });
    },
  });

  // 6. Update mutation (for edit mode)
  const updateMutation = useMutation({
    mutationFn: (formData: EditFormData) =>
      updateRecord({ data: { id, ...formData } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["records"] });
      toast.success("Record updated successfully");
      // Switch back to view mode
      navigate({
        to: "/your/route/$id",
        params: { id },
        search: { mode: "view" },
      });
    },
  });

  // 7. Form submission handler
  const onSubmit = (data: EditFormData) => {
    if (isAddMode) {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate(data);
    }
  };

  // 8. Toggle edit mode
  const toggleEditMode = () => {
    navigate({
      to: "/your/route/$id",
      params: { id },
      search: { mode: isEditMode ? "view" : "edit" },
    });
  };

  // 9. Cancel handler
  const handleCancel = () => {
    form.reset();
    if (isAddMode) {
      navigate({ to: "/your/list-route" });
    } else {
      navigate({
        to: "/your/route/$id",
        params: { id },
        search: { mode: "view" },
      });
    }
  };

  return (
    <Card className="rounded-[10px] border border-slate-200/40 bg-gradient-to-br from-white/90 to-slate-50/80 shadow-[0_4px_12px_rgba(0,0,0,0.08)] backdrop-blur-[10px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center font-semibold text-slate-900 dark:text-slate-100">
            Section Title
          </CardTitle>
          
          {/* RIGHT-JUSTIFIED ACTION BUTTONS */}
          <div className="flex items-center gap-2">
            {isEditMode || isAddMode ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCancel}
                  disabled={updateMutation.isPending || createMutation.isPending}
                  className="h-10 rounded-[6px] border border-slate-200/60 bg-slate-50/90 px-4 font-medium text-slate-700 shadow-[0_2px_8px_rgba(148,163,184,0.15)] backdrop-blur-[8px] transition-all duration-200 hover:scale-[1.02] hover:bg-slate-50/95 dark:border-slate-700/40 dark:bg-slate-800/30 dark:text-slate-300"
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={updateMutation.isPending || createMutation.isPending}
                  className="h-10 rounded-[6px] border border-blue-200/60 bg-blue-50/90 px-4 font-medium text-blue-700 shadow-[0_2px_8px_rgba(59,130,246,0.15)] backdrop-blur-[8px] transition-all duration-200 hover:scale-[1.02] hover:bg-blue-50/95 dark:border-blue-700/40 dark:bg-blue-900/30 dark:text-blue-300"
                >
                  {updateMutation.isPending || createMutation.isPending ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
                      {isAddMode ? "Creating..." : "Saving..."}
                    </>
                  ) : (
                    <>
                      <Edit className="mr-2 h-4 w-4" />
                      {isAddMode ? "Create" : "Save"}
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={toggleEditMode}
                className="h-10 rounded-[6px] border border-blue-200/60 bg-blue-50/90 px-4 font-medium text-blue-700 shadow-[0_2px_8px_rgba(59,130,246,0.15)] backdrop-blur-[8px] transition-all duration-200 hover:scale-[1.02] hover:bg-blue-50/95 dark:border-blue-700/40 dark:bg-blue-900/30 dark:text-blue-300"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* VIEW MODE - Read-only display */}
              {!isEditMode && !isAddMode ? (
                <>
                  <div>
                    <label className="mb-1 block font-medium text-slate-600 text-sm dark:text-slate-400">
                      Field Label
                    </label>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {data?.field1}
                    </p>
                  </div>
                  {/* More read-only fields... */}
                </>
              ) : (
                /* EDIT/ADD MODE - Form inputs */
                <>
                  <FormField
                    control={form.control}
                    name="field1"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Field Label *</FormLabel>
                        <FormControl>
                          <Input {...field} className="nextage-input-class" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {/* More form fields... */}
                </>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

#### Key Design Elements

**1. Mode Detection:**
```tsx
const searchParams = useSearch({ from: "/your/route" });
const isEditMode = searchParams?.mode === "edit";
const isAddMode = searchParams?.mode === "add" || id === "new";
```

**2. Conditional Rendering:**
```tsx
{isEditMode || isAddMode ? (
  <FormField ... />  // Show form inputs
) : (
  <div>...</div>     // Show read-only display
)}
```

**3. Navigation Control:**
```tsx
// Switch to edit mode
navigate({ to: "/route/$id", params: { id }, search: { mode: "edit" } });

// Return to view mode
navigate({ to: "/route/$id", params: { id }, search: { mode: "view" } });

// Navigate to add mode
navigate({ to: "/route/new", search: { mode: "add" } });
```

**4. Action Button Styling:**
- **Edit Button**: Blue glass morphism (`border-blue-200/60 bg-blue-50/90 text-blue-700`)
- **Save Button**: Blue glass morphism (same as Edit)
- **Cancel Button**: Slate glass morphism (`border-slate-200/60 bg-slate-50/90 text-slate-700`)
- All buttons: `h-10 rounded-[6px] px-4 font-medium shadow-[0_2px_8px_...] backdrop-blur-[8px]`

#### Implementation Guidelines

**When to Use This Pattern:**
- ✅ Complex forms with multiple fields
- ✅ Data that requires validation
- ✅ Records that need full CRUD operations
- ✅ Any primary data editing workflow

**When to Use Modals Instead:**
- ✅ Very simple single-field edits (e.g., changing a status)
- ✅ Quick confirmations or selections
- ✅ Temporary data entry that doesn't persist immediately
- ✅ Secondary workflows that don't justify full-page navigation

**Form Reset Behavior:**
```tsx
// Reset form when data changes (skip for add mode)
useEffect(() => {
  if (isAddMode) return;
  
  if (data) {
    form.reset({
      field1: data.field1 || "",
      field2: data.field2 || "",
    });
  }
}, [data, form, isAddMode]);
```

**Button Position Rule:**
Always place action buttons (Edit, Save, Cancel) in the CardHeader on the right side, across from the title. This creates a consistent, predictable UI pattern across all detail pages.

## PATTERNS REQUIRING DOCUMENTATION

**Note**: All currently implemented production patterns have been documented. New patterns will be added as they are developed and production-tested.

### 🔄 Patterns In Development

**Google Places Import System** - Complex modal system for importing business data
- Business search and selection modal with glass morphism
- Data import preview with before/after comparison  
- Closed business status warning system
- Error handling for Google Places API integration
- *Requires full implementation and testing before documentation*



