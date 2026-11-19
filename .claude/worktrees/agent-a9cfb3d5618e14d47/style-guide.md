---
title: Complete Design System Style Guide
description: Comprehensive design foundation including colors, typography, spacing, components, and motion specifications for sophisticated dark/light mode application
feature: Design System Foundation
last-updated: 2025-01-27
version: 2.2.0
related-files: 
  - ./tokens/colors.md
  - ./tokens/typography.md
  - ./tokens/spacing.md
  - ./tokens/animations.md
  - ./components/
dependencies:
  - NextAge Designs brand guidelines
  - shadcn/ui component library
  - TailwindCSS framework
  - Advanced CSS effects (backdrop-filter, gradients)
status: approved
---

# Complete Design System Style Guide

## Overview

This comprehensive design system provides the complete foundation for the NextAge Designs Client Portal, featuring sophisticated dark/light mode aesthetics with advanced visual effects including gradients, glass morphism, and subtle micro-interactions. Optimized for modern metropolitan business environments with high-speed connections and contemporary devices. The system prioritizes bold simplicity, professional excellence, visual polish, and universal accessibility.

## Table of Contents

1. [Color System](#color-system)
2. [Dark Mode & Theme System](#dark-mode--theme-system)
3. [Advanced Visual Effects](#advanced-visual-effects)
4. [Typography System](#typography-system)
5. [Spacing & Layout System](#spacing--layout-system)
6. [Component Specifications](#component-specifications)
7. [Motion & Animation System](#motion--animation-system)
8. [Platform-Specific Adaptations](#platform-specific-adaptations)

---

## Color System

### Theme-Aware Color Architecture

**Adaptive Color System**
Our color system is built for seamless dark/light mode transitions with sophisticated visual depth. All colors are defined as CSS custom properties with automatic theme switching.

### Primary Brand Colors

**NextAge Core Colors (Production)**
- **Primary**: `--nextage-primary: #0066ff` – Main CTAs, brand elements, navigation highlights
- **Primary Dark**: `--nextage-primary-dark: #0052cc` – Hover states, emphasis, active selections  
- **Secondary**: `--nextage-secondary: #ff6b35` – Accent color, secondary CTAs, indicators
- **Text Dark**: `--nextage-text-dark: #1a1a2e` – Primary text in light mode (#f9fafb in dark)
- **Text Gray**: `--nextage-text-gray: #4b5563` – Supporting text (#d1d5db in dark)
- **Text Light**: `--nextage-text-light: #6b7280` – Metadata, placeholders (#9ca3af in dark)

### Background Architecture

**Light Mode Foundations (Production)**
- **Background White**: `--nextage-bg-white: #ffffff` – Main surfaces, cards, modals
- **Background Light**: `--nextage-bg-light: #f9fafb` – Secondary surfaces, muted elements
- **Background Gray**: `--nextage-bg-gray: #f3f4f6` – Tertiary surfaces, input backgrounds
- **Border Light**: `--nextage-border-light: #e5e7eb` – Borders, dividers, separators

**Dark Mode Foundations (Production)**
- **Background White**: `--nextage-bg-white: #111827` – Main surfaces in dark mode
- **Background Light**: `--nextage-bg-light: #1f2937` – Secondary surfaces in dark mode
- **Background Gray**: `--nextage-bg-gray: #374151` – Tertiary surfaces in dark mode
- **Border Light**: `--nextage-border-light: rgba(255, 255, 255, 0.15)` – Semi-transparent borders

### Production Gradient System

**🟢 CRITICAL: Page Layout Gradient Pattern**
The gradient is applied ONLY ONCE at the main container level:

```css
/* Applied in __root.tsx to main element */
.nextage-hero-gradient {
  background: linear-gradient(135deg, 
    rgba(248, 250, 252, 0.15) 0%, 
    rgba(219, 234, 254, 0.1) 100%);
}

.dark .nextage-hero-gradient {
  background: linear-gradient(135deg, 
    rgba(15, 23, 42, 0.15) 0%, 
    rgba(29, 78, 216, 0.05) 100%);
}
```

**Key Implementation Rule**: ALL nested components must be transparent to inherit this gradient. Never apply backgrounds to nested containers unless absolutely necessary for contrast.

**Production Gradient Collections**
- **Hero Gradient**: `.nextage-hero-gradient` – Applied to main container only
- **Card Gradient**: `.nextage-card-gradient` – Glass morphism cards with subtle gradients
- **CTA Gradient**: `.nextage-cta-gradient` – Button gradients using primary/secondary colors
- **Text Gradient**: `.nextage-text-gradient` – Decorative text effects

**Status Gradient Collections**
- **Success Gradient**: `linear-gradient(135deg, #059669 0%, #047857 100%)`
- **Warning Gradient**: `linear-gradient(135deg, #f59e0b 0%, #d97706 100%)`
- **Error Gradient**: `linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)`

### Semantic Colors (Theme Adaptive)

**Status Communication**
- **Success**: Light: `#059669` | Dark: `#10b981` – Confirmations, completed states
- **Warning**: Light: `#f59e0b` | Dark: `#fbbf24` – Attention, pending states
- **Error**: Light: `#dc2626` | Dark: `#f87171` – Errors, destructive actions
- **Info**: Light: `#0284c7` | Dark: `#38bdf8` – Information, neutral updates

### Text Color Hierarchy

**Light Mode Text**
- **Primary**: `#0f172a` – Headings, primary content
- **Secondary**: `#475569` – Supporting text, descriptions
- **Tertiary**: `#64748b` – Metadata, timestamps, captions
- **Muted**: `#94a3b8` – Disabled text, placeholders

**Dark Mode Text**
- **Primary**: `#f8fafc` – Headings, primary content
- **Secondary**: `#cbd5e1` – Supporting text, descriptions  
- **Tertiary**: `#94a3b8` – Metadata, timestamps, captions
- **Muted**: `#64748b` – Disabled text, placeholders

### Border & Separator System

**Adaptive Borders**
- **Light Mode**: `rgba(226, 232, 240, 0.8)` – Subtle, clean separation
- **Dark Mode**: `rgba(51, 65, 85, 0.8)` – Visible but not harsh separation
- **Emphasis**: Theme-adaptive with higher opacity for important divisions
- **Interactive**: Responds to hover and focus states with color transitions

**🟢 Production-Tested Border Patterns from Prospect Details**

**Detail Card Borders**
```css
.detail-card-border {
  border: 1px solid rgba(226, 232, 240, 0.4);
  border-radius: 10px;
}

.dark .detail-card-border {
  border-color: rgba(51, 65, 85, 0.3);
}
```

**Tab List Borders**
```css
.tab-list-border {
  border: 1px solid rgba(226, 232, 240, 0.4);
  border-radius: 8px;
}

.dark .tab-list-border {
  border-color: rgba(51, 65, 85, 0.3);
}
```

**Header Section Borders**
```css
.header-border {
  border: 1px solid rgba(226, 232, 240, 0.6);
  border-radius: 14px;
}

.dark .header-border {
  border-color: rgba(51, 65, 85, 0.4);
}
```

**Gradient Separators**
```css
.gradient-separator {
  height: 1px;
  margin: 8px 0;
  background: linear-gradient(to right, 
    transparent 0%,
    rgba(226, 232, 240, 1) 50%,
    transparent 100%);
}

.dark .gradient-separator {
  background: linear-gradient(to right, 
    transparent 0%,
    rgba(51, 65, 85, 1) 50%,
    transparent 100%);
}
```

### Accessibility & Performance

**Enhanced Contrast Standards**
- **Light Mode**: Minimum 4.5:1 for normal text, 7:1 for critical elements
- **Dark Mode**: Carefully calibrated to prevent eye strain while maintaining readability
- **Dynamic Adjustment**: Automatic contrast enhancement based on ambient light detection
- **Color Independence**: All interactive states work without color dependency

---

## 🆕 Production Layout Architecture

### CRITICAL: Header-Aware Flex Layout System

**The Problem Solved**: Avoiding scrollbars while achieving perfect content centering with a sticky header.

**Production Structure (DO NOT MODIFY):**
```tsx
// __root.tsx - Root level setup
<body className="flex flex-col min-h-screen">
  <Header />  // Takes natural space (sticky)
  <main className="nextage-hero-gradient flex-1 flex flex-col content-center">
    {children}  // Content perfectly centered in remaining space
  </main>
</body>

// index.tsx - Hero section
function HeroSection() {
  return (
    <div className="flex flex-1 items-center justify-center relative">
      // Hero content centered without scrollbars
    </div>
  );
}
```

**Key Magic Classes:**
- `content-center` on main: Centers content in remaining space
- `flex-1` on nested components: Inherits parent's available space
- **NEVER** use `min-h-screen`, `h-full`, `h-svh` in nested content

**Universal Rule**: "Height calculations break, flex inheritance works"

### CSS Display Hierarchy & Responsive Conflicts

**Critical Pattern**: Responsive display classes override base display classes.

**Common Broken Patterns to Avoid:**
```css
/* ❌ BROKEN - Display conflicts */
className="flex md:block"           // block overrides flex at md+
className="hidden md:block flex"    // block overrides flex at md+
className="flex flex-col md:grid"   // grid overrides flex at md+

/* ✅ CORRECT - Consistent flex */
className="flex md:flex"            // flex maintained across breakpoints
className="hidden md:flex flex-col" // flex container at md+
```

**Debug Rule**: "If flex-1 isn't working, check for display conflicts in the parent chain"

---

## Dark Mode & Theme System

### Adaptive Theme Architecture

**Intelligent Theme Switching**
Our sophisticated theme system automatically detects user preferences and system settings while providing manual override controls. The dark mode implementation goes beyond simple color inversion to create a cohesive, professional experience optimized for extended usage periods.

### Theme Detection & Management

**Automatic Detection**
- **System Preference**: Respects `prefers-color-scheme` media query
- **User Choice**: Manual theme selection persists across sessions
- **Ambient Light**: Adaptive brightness based on device capabilities (where supported)
- **Time-Based**: Optional automatic switching based on local time zones

**Theme Persistence**
- **Local Storage**: User preferences stored locally for instant application
- **Cross-Device Sync**: Theme choices synchronized via user accounts when authenticated
- **Graceful Fallback**: Defaults to light mode for accessibility and performance

### Dark Mode Color Philosophy

**Professional Depth & Contrast**
Our dark mode palette is carefully calibrated for professional environments, reducing eye strain during extended work sessions while maintaining excellent contrast ratios for accessibility compliance.

**Color Temperature Balance**
- **Warm Undertones**: Subtle warm grays prevent harsh blue-light exposure
- **Reduced Saturation**: Colors are slightly desaturated in dark mode for comfort
- **Enhanced Contrast**: Strategic contrast increases for critical UI elements
- **Semantic Consistency**: Status colors maintain meaning across both themes

### Theme-Aware Component Behavior

**Dynamic Color Resolution**
```css
/* CSS Custom Properties with Theme Awareness */
:root {
  --color-adaptive-background: light-dark(#ffffff, #0f172a);
  --color-adaptive-text: light-dark(#0f172a, #f8fafc);
  --color-adaptive-border: light-dark(rgba(226, 232, 240, 0.8), rgba(51, 65, 85, 0.8));
  --color-adaptive-shadow: light-dark(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.3));
}
```

**Component Adaptation Patterns**
- **Glass Morphism**: Enhanced in dark mode with subtle backdrop blur effects
- **Elevation Shadows**: Deeper, more pronounced shadows for dark backgrounds
- **Border Treatments**: Softer, more luminous borders in dark environments
- **Interactive Feedback**: Enhanced hover and focus states for low-light visibility

### Performance Optimizations

**Efficient Theme Switching**
- **CSS-Only Transitions**: Smooth theme transitions using CSS custom properties
- **Reduced Repaints**: Optimized rendering to minimize layout shifts
- **Preload Strategy**: Critical theme assets preloaded for instant switching
- **Memory Management**: Efficient cleanup of unused theme resources

---

## Advanced Visual Effects

### 🟢 Production Glass Morphism Implementation

**Critical Implementation Note**: Glass morphism effects are applied using inline styles with theme detection for dropdown menus to ensure consistent rendering across components.

**Production Dropdown Pattern (ProspectCard.tsx)**
```tsx
<DropdownMenuContent
  style={{
    background: document.documentElement.classList.contains('dark') 
      ? "linear-gradient(135deg, #202028 0%, rgba(0, 102, 255, 0.15) 50%, rgba(255, 107, 53, 0.12) 100%)"
      : "linear-gradient(135deg, #ffffff 0%, rgba(0, 102, 255, 0.08) 50%, rgba(255, 107, 53, 0.08) 100%)",
    backgroundColor: document.documentElement.classList.contains('dark') ? "#202028" : "#ffffff",
    border: document.documentElement.classList.contains('dark') 
      ? "1px solid rgba(255, 255, 255, 0.15)"
      : "1px solid rgba(0, 0, 0, 0.12)"
  }}
  className="w-52 animate-in rounded-[10px] p-2 shadow-[0_8px_24px_rgba(0,0,0,0.12),0_4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),0_4px_16px_rgba(0,0,0,0.2)] ..."
>
```

**Component-Specific Glass Morphism Variants**
```css
/* Standard Dropdown Menus - Most common floating UI */
.glass-dropdown {
  background: linear-gradient(to bottom right, 
    rgba(255, 255, 255, 0.96) 0%,
    rgba(248, 250, 252, 0.98) 50%,
    rgba(255, 255, 255, 0.95) 100%);
  backdrop-filter: blur(16px) saturate(170%) brightness(1.02);
  -webkit-backdrop-filter: blur(16px) saturate(170%) brightness(1.02);
  border: 1px solid rgba(226, 232, 240, 0.6);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* Select Components - Slightly less blur for form integration */
.glass-select {
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(14px) saturate(160%) brightness(1.01);
  border: 1px solid rgba(226, 232, 240, 0.5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

/* Context Menus - Enhanced blur for floating feel */
.glass-context {
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.97) 0%,
    rgba(248, 250, 252, 0.95) 100%);
  backdrop-filter: blur(18px) saturate(175%) brightness(1.03);
  border: 1px solid rgba(226, 232, 240, 0.7);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
}

/* Navigation Elements - High opacity for content separation */
.glass-navigation {
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
}

/* Modals & Overlays - Maximum blur for focus */
.glass-modal {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px) saturate(180%) brightness(1.05);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
}

/* 🟢 Production ProspectModal Implementation (ProspectModal.tsx) */
.prospect-modal-glass {
  /* Light Mode */
  background: linear-gradient(to bottom right,
    rgba(255, 255, 255, 0.95),
    rgba(248, 250, 252, 0.90));
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  border-radius: 14px;
  /* Animation & Performance */
  transform: gpu;
  will-change: transform;
  transition: all 300ms ease;
}

.prospect-modal-glass:hover {
  transform: scale(1.02);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
}

/* Dark Mode Adaptation */
.dark .prospect-modal-glass {
  background: linear-gradient(to bottom right,
    rgba(30, 41, 59, 0.90),
    rgba(15, 23, 42, 0.80));
  border: 1px solid rgba(71, 85, 105, 0.3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* Modal Close Button Glass Effect */
.modal-close-glass {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  transition: all 200ms ease;
}

.modal-close-glass:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: scale(1.05);
}

.dark .modal-close-glass {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(71, 85, 105, 0.3);
}

.dark .modal-close-glass:hover {
  background: rgba(51, 65, 85, 0.9);
}

/* Cards & Panels - Subtle glass for content containers */
.glass-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px) saturate(140%);
  border: 1px solid rgba(226, 232, 240, 0.4);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* Dark Mode Glass Adaptations */
@media (prefers-color-scheme: dark) {
  .glass-dropdown {
    background: linear-gradient(to bottom right,
      rgba(15, 23, 42, 0.96) 0%,
      rgba(30, 41, 59, 0.98) 50%,
      rgba(15, 23, 42, 0.95) 100%);
    border: 1px solid rgba(51, 65, 85, 0.4);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
  
  .glass-select {
    background: rgba(15, 23, 42, 0.94);
    border: 1px solid rgba(51, 65, 85, 0.35);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }
  
  .glass-context {
    background: linear-gradient(135deg,
      rgba(15, 23, 42, 0.97) 0%,
      rgba(30, 41, 59, 0.95) 100%);
    border: 1px solid rgba(51, 65, 85, 0.5);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  }
  
  .glass-navigation {
    background: rgba(15, 23, 42, 0.98);
    border: 1px solid rgba(51, 65, 85, 0.5);
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
  }
  
  .glass-modal {
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(51, 65, 85, 0.6);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  }
  
  .glass-card {
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(51, 65, 85, 0.3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  }
}

/* Glass Morphism CSS Variables for Easy Reference */
:root {
  /* Blur Values */
  --glass-blur-subtle: 6px;
  --glass-blur-card: 10px;
  --glass-blur-navigation: 12px;
  --glass-blur-select: 14px;
  --glass-blur-dropdown: 16px;
  --glass-blur-context: 18px;
  --glass-blur-modal: 20px;
  
  /* Saturation Values */
  --glass-saturate-subtle: 140%;
  --glass-saturate-navigation: 150%;
  --glass-saturate-select: 160%;
  --glass-saturate-dropdown: 170%;
  --glass-saturate-context: 175%;
  --glass-saturate-modal: 180%;
  
  /* Brightness Values */
  --glass-brightness-standard: 1.0;
  --glass-brightness-select: 1.01;
  --glass-brightness-dropdown: 1.02;
  --glass-brightness-context: 1.03;
  --glass-brightness-modal: 1.05;
}
```

### Gradient Systems

**Multi-Layer Gradient Architecture**
Strategic use of gradients creates visual depth and guides user attention through sophisticated color transitions that enhance the overall aesthetic hierarchy.

**Gradient Applications**
- **Hero Sections**: Dramatic gradients for impactful first impressions
- **Card Backgrounds**: Subtle gradients for elegant content separation
- **Button States**: Progressive gradients for interactive feedback
- **Loading States**: Animated gradients for engaging wait experiences
- **Navigation Elements**: Theme-aware gradients for sidebar and header components

**Navigation Gradient Patterns**
```css
/* NextAge Card Gradient - Primary navigation background */
.nextage-card-gradient {
  background: linear-gradient(135deg, 
    rgba(248, 250, 252, 0.95) 0%, 
    rgba(241, 245, 249, 0.98) 100%);
  backdrop-filter: blur(12px) saturate(180%);
  border: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
}

.dark .nextage-card-gradient {
  background: linear-gradient(135deg, 
    rgba(15, 23, 42, 0.95) 0%, 
    rgba(30, 41, 59, 0.98) 100%);
  backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid rgba(51, 65, 85, 0.5);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
}

/* NextAge Navigation Header - Site header gradient */
.nextage-nav {
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.5);
}

.dark .nextage-nav {
  background: rgba(15, 15, 25, 0.98);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(51, 65, 85, 0.3);
}
```

**Theme-Aware Implementation Guidelines**:
- **High Opacity Backgrounds**: Use 95-98% opacity for navigation gradients to prevent content bleed-through
- **Backdrop Filter Intensity**: Navigation elements use stronger blur (12-20px) for enhanced separation
- **Border Treatment**: Semi-transparent borders that complement the gradient themes
- **Shadow Integration**: Layered shadows that respect theme contrast requirements

### Micro-Interactions & Hover Effects

**Sophisticated Interactive Feedback**
```css
/* Enhanced Hover Transformations */
.interactive-element {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
}

.interactive-element:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 12px 24px rgba(59, 130, 246, 0.15);
  filter: brightness(110%);
}

/* Progressive Enhancement for Supporting Browsers */
@supports (backdrop-filter: blur()) {
  .enhanced-glass {
    backdrop-filter: blur(20px) saturate(180%) brightness(110%);
  }
}
```

### **🟢 Production Contact Interaction Micro-Animations**

**Universal Contact Component Pattern**
Consistent micro-animations for phone, email, and address interactions across all contexts:

```css
/* Contact interaction micro-animation pattern */
.contact-interaction {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center;
}

.contact-interaction:hover {
  transform: scale(1.02) translateX(4px);
  color: rgb(37, 99, 235); /* Blue-600 */
}

.dark .contact-interaction:hover {
  color: rgb(96, 165, 250); /* Blue-400 */
}

/* Icon color transitions for contact interactions */
.contact-icon {
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: rgb(100, 116, 139); /* Slate-500 */
}

.contact-interaction:hover .contact-icon {
  color: rgb(37, 99, 235); /* Blue-600 */
}

.dark .contact-icon {
  color: rgb(148, 163, 184); /* Slate-400 */
}

.dark .contact-interaction:hover .contact-icon {
  color: rgb(96, 165, 250); /* Blue-400 */
}

/* Context-adaptive implementation */
.contact-compact .contact-interaction {
  font-family: 'JetBrains Mono', monospace; /* For phone numbers in compact views */
  font-size: 0.875rem; /* text-sm */
  color: rgb(100, 116, 139); /* muted-foreground */
}

.contact-spacious .contact-interaction {
  font-weight: 500; /* font-medium */
  color: rgb(37, 99, 235); /* Blue-600 primary color */
  padding: 0 4px; /* px-1 */
  border-radius: 4px; /* rounded */
}

.contact-spacious .contact-interaction:focus-visible {
  outline: 2px solid rgb(37, 99, 235); /* focus:ring-2 focus:ring-blue-500/20 */
  outline-offset: 2px;
  background: rgba(37, 99, 235, 0.05);
}
```

**Contact Interaction Features:**
- **Universal Animation**: `scale(1.02) translateX(4px)` for all contact interactions
- **Smart Actions**: Phone (mobile dial/desktop copy), email (mailto), address (Google Maps)
- **Icon Transitions**: Coordinated color changes with `group-hover` pattern
- **Context Adaptation**: Compact styling for cards, spacious for detail views
- **Accessibility**: Proper focus states with visible indicators

### **🟢 Universal Contact Actions Implementation**

**Smart Device-Aware Contact Actions**
```javascript
// Universal phone action - mobile dial or desktop copy
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

// Universal email action - launch email client
const handleEmailClick = (email: string) => {
  window.location.href = `mailto:${email}`;
  toast.success("Opening email client");
};

// Universal address action - open Google Maps
const handleAddressClick = (address: string, city?: string, state?: string) => {
  const fullAddress = city && state 
    ? `${address}, ${city}, ${state}`
    : address;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
  window.open(googleMapsUrl, '_blank');
  toast.success("Opening location in Google Maps");
};

// Universal contact component implementation
const ContactField = ({ type, value, icon: Icon, label, city, state }) => {
  const getClickHandler = () => {
    switch (type) {
      case 'phone': return () => handlePhoneClick(value);
      case 'email': return () => handleEmailClick(value);
      case 'address': return () => handleAddressClick(value, city, state);
      default: return () => {};
    }
  };

  return (
    <div className="group flex items-center">
      <Icon className="h-4 w-4 mr-2 text-slate-500 dark:text-slate-400 group-hover:text-blue-500 transition-colors duration-200" />
      <button
        onClick={getClickHandler()}
        className="contact-interaction text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
        aria-label={`${label} ${value}`}
      >
        {value}
      </button>
    </div>
  );
};
```

**Universal Contact Action Features:**
- **Phone Intelligence**: Mobile devices trigger phone app, desktop copies to clipboard
- **Email Integration**: Universal mailto: support across all email clients
- **Maps Integration**: Google Maps with proper URL encoding for addresses
- **Toast Feedback**: User confirmation for all actions with appropriate messaging
- **Accessibility**: Screen reader support with descriptive ARIA labels
- **Error Handling**: Graceful fallbacks for unsupported devices/browsers

### Advanced Shadow Systems

**Layered Elevation Strategy**
Our shadow system uses multiple shadow layers to create realistic depth perception that enhances the overall visual hierarchy and user understanding of interface elements.

**Component-Specific Shadow Applications**

```css
/* Level 1: Subtle Separation - Inline elements, badges, small buttons */
.shadow-level-1 {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.dark .shadow-level-1 {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

/* Level 2: Card Elevation - Cards, panels, form groups */
.shadow-level-2 {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.dark .shadow-level-2 {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

/* Level 3: Dropdown & Modal Elevation - Floating UI elements */
.shadow-level-3-dropdown {
  box-shadow: 
    0 8px 24px rgba(0, 0, 0, 0.12),
    0 4px 12px rgba(0, 0, 0, 0.08);
}
.dark .shadow-level-3-dropdown {
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.4),
    0 4px 16px rgba(0, 0, 0, 0.2);
}

.shadow-level-3-modal {
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
}
.dark .shadow-level-3-modal {
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}

/* Level 4: Maximum Elevation - Full-screen overlays, dialogs */
.shadow-level-4 {
  box-shadow: 
    0 24px 64px rgba(0, 0, 0, 0.18),
    0 8px 32px rgba(0, 0, 0, 0.12);
}
.dark .shadow-level-4 {
  box-shadow: 
    0 24px 64px rgba(0, 0, 0, 0.6),
    0 8px 32px rgba(0, 0, 0, 0.4);
}

/* Specialized Shadows */

/* Navigation Sidebar Shadow */
.shadow-navigation {
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
}
.dark .shadow-navigation {
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.3);
}

/* Hover State Shadows */
.shadow-hover {
  transition: box-shadow 0.3s ease;
}
.shadow-hover:hover {
  box-shadow: 0 12px 24px rgba(59, 130, 246, 0.15);
}
.dark .shadow-hover:hover {
  box-shadow: 0 12px 24px rgba(59, 130, 246, 0.25);
}

/* Focus State Shadows */
.shadow-focus:focus-visible {
  box-shadow: 
    0 0 0 3px rgba(59, 130, 246, 0.1),
    0 4px 12px rgba(59, 130, 246, 0.15);
}
.dark .shadow-focus:focus-visible {
  box-shadow: 
    0 0 0 3px rgba(59, 130, 246, 0.2),
    0 4px 12px rgba(59, 130, 246, 0.3);
}

/* Error State Shadows */
.shadow-error {
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
}
.dark .shadow-error {
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

/* Success State Shadows */
.shadow-success {
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.15);
}
.dark .shadow-success {
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
}
```

**Component-to-Shadow Mapping Guide**

| Component Type | Shadow Level | Light Mode Values | Dark Mode Values |
|---------------|-------------|-------------------|------------------|
| Badges, Pills | Level 1 | `0 1px 3px rgba(0,0,0,0.1)` | `0 1px 3px rgba(0,0,0,0.2)` |
| Cards, Panels | Level 2 | `0 4px 12px rgba(0,0,0,0.12)` | `0 4px 12px rgba(0,0,0,0.25)` |
| Dropdowns | Level 3 | `0 8px 24px rgba(0,0,0,0.12)` + layer | `0 8px 32px rgba(0,0,0,0.4)` + layer |
| Modals | Level 3 | `0 16px 48px rgba(0,0,0,0.15)` | `0 16px 48px rgba(0,0,0,0.5)` |
| Overlays | Level 4 | `0 24px 64px rgba(0,0,0,0.18)` + layer | `0 24px 64px rgba(0,0,0,0.6)` + layer |
| Navigation | Special | `4px 0 24px rgba(0,0,0,0.08)` | `4px 0 24px rgba(0,0,0,0.3)` |

**Dark Mode Shadow Adaptation Principles**
- **Increased Opacity**: Dark mode shadows use 2-3x the opacity of light mode
- **Warm Undertones**: Add subtle warm colors to prevent harsh blue-black shadows
- **Multiple Layers**: Use compound shadows for better depth perception
- **Context Awareness**: Adjust shadow intensity based on background darkness

### Performance Considerations

**Hardware Acceleration**
All advanced effects utilize CSS transforms and opacity changes to leverage GPU acceleration, ensuring smooth performance across devices while maintaining visual sophistication.

**Progressive Enhancement**
Advanced effects gracefully degrade on older browsers or lower-performance devices, ensuring core functionality remains accessible while providing enhanced experiences where supported.

---

## Typography System

### Advanced Font Architecture

**Primary Typeface Foundation**
- **Family**: `Inter Variable, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Variable Font**: Utilizes Inter Variable for smooth weight transitions and optimal rendering
- **Fallback Strategy**: Progressive degradation through system fonts for maximum compatibility
- **Loading Optimization**: Font-display swap with preload hints for critical text rendering
- **OpenType Features**: Tabular figures, stylistic alternates, and contextual ligatures enabled

**Specialized Typefaces**
- **Monospace**: `JetBrains Mono Variable, JetBrains Mono, Consolas, "SF Mono", Monaco, monospace`
- **Display**: Enhanced Inter weights (300-800) for hero sections and emphasis
- **Data Display**: Tabular numerals and consistent character widths for dashboards

### Sophisticated Weight Spectrum

**Professional Weight Palette**
- **Thin**: 200 – Large display text, decorative elements (minimal usage)
- **Light**: 300 – Elegant headings, subtle hierarchy
- **Regular**: 400 – Primary body text, standard interface content
- **Medium**: 500 – Emphasis text, secondary headings, navigation
- **Semibold**: 600 – Strong emphasis, primary headings, key metrics
- **Bold**: 700 – Critical information, alerts, call-to-action text
- **Extrabold**: 800 – Maximum emphasis, hero text (selective usage)

### Enhanced Type Scale System

**Executive Heading Hierarchy**
- **Hero Display**: `clamp(2.5rem, 5vw, 4rem)/1.1, 700, -0.02em` – Landing page heroes, major announcements
- **H1 Primary**: `clamp(2rem, 4vw, 2.5rem)/1.2, 600, -0.01em` – Page titles, section headers
- **H2 Section**: `clamp(1.5rem, 3vw, 1.875rem)/1.3, 600, -0.005em` – Major section headers
- **H3 Subsection**: `clamp(1.25rem, 2.5vw, 1.5rem)/1.4, 500, 0em` – Card headers, component titles
- **H4 Component**: `clamp(1.125rem, 2vw, 1.25rem)/1.4, 500, 0em` – Minor headers, emphasis
- **H5 Label**: `clamp(1rem, 1.5vw, 1.125rem)/1.5, 500, 0.01em` – Form sections, metadata

**Professional Body Text System**
- **Lead Text**: `clamp(1.125rem, 2vw, 1.25rem)/1.6, 400` – Introduction paragraphs, key content
- **Body Large**: `clamp(1rem, 1.5vw, 1.125rem)/1.6, 400` – Primary reading content
- **Body Standard**: `1rem/1.5, 400` – Standard interface text, form content
- **Body Small**: `0.875rem/1.5, 400` – Secondary information, descriptions
- **Caption Text**: `0.75rem/1.4, 400` – Metadata, timestamps, legal text
- **Micro Text**: `0.6875rem/1.4, 500` – Badges, status indicators (minimal usage)

**Specialized Text Applications**
- **Data Display**: `0.875rem/1.2, 500, tabular-nums` – Metrics, tables, numerical data
- **Code Inline**: `0.875rem/1.4, 400, monospace` – Code snippets, technical references
- **Code Block**: `0.8125rem/1.6, 400, monospace` – Code blocks, terminal output
- **Button Text**: `0.875rem/1.2, 500, 0.01em` – Interactive elements, navigation
- **Form Labels**: `0.875rem/1.3, 500, 0.005em` – Input labels, field descriptions
- **Navigation**: `0.875rem/1.2, 500` – Menu items, breadcrumbs

### Advanced Typography Features

**OpenType Enhancements**
```css
.typography-enhanced {
  font-feature-settings: 
    "kern" 1,           /* Kerning */
    "liga" 1,           /* Ligatures */
    "calt" 1,           /* Contextual alternates */
    "tnum" 0,           /* Proportional figures (default) */
    "lnum" 0;           /* Lining figures */
}

.typography-data {
  font-feature-settings: 
    "kern" 1,
    "tnum" 1,           /* Tabular figures for data */
    "lnum" 1;           /* Lining figures for consistency */
  font-variant-numeric: tabular-nums lining-nums;
}
```

**Dynamic Scaling & Fluid Typography**
- **Viewport Units**: Clamp functions ensure optimal scaling across all screen sizes
- **Modular Scale**: 1.25 ratio for harmonious size relationships
- **Container Queries**: Typography adapts to component width, not just viewport
- **Reading Comfort**: Optimal line lengths maintained across responsive breakpoints

### Theme-Aware Typography

**Light Mode Typography**
- **Enhanced Contrast**: Darker text weights for improved readability
- **Crisp Rendering**: Optimized for bright backgrounds and high ambient light
- **Professional Presence**: Stronger weights for business environments

**Dark Mode Typography Adaptations**
- **Reduced Weight**: Lighter font weights prevent excessive brightness
- **Increased Line Height**: Enhanced readability for extended screen time
- **Warm Undertones**: Slightly warmer text colors to reduce eye strain
- **Adaptive Contrast**: Dynamic contrast adjustments based on background luminance

**Smart Typography Rendering**
```css
.text-adaptive {
  color: light-dark(rgb(15 23 42), rgb(248 250 252));
  font-weight: light-dark(500, 400); /* Lighter weight in dark mode */
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### Accessibility & Performance Standards

**WCAG Compliance Excellence**
- **Contrast Ratios**: Minimum 4.5:1 for normal text, 7:1 for enhanced accessibility
- **Font Size Minimums**: 16px base ensures readability across devices
- **Focus Indicators**: Enhanced typography for keyboard navigation states
- **Reduced Motion**: Typography animations respect user preferences

**Performance Optimization**
- **Variable Fonts**: Reduced font file sizes with full weight spectrum access
- **Font Loading**: Strategic preloading with font-display: swap
- **Critical Path**: Essential typography loads immediately with progressive enhancement
- **Subset Loading**: Language-specific character sets for optimal performance

---

## Spacing & Layout System

### Base Unit System

**Mathematical Scale**
- **Base Unit**: `8px` – Fundamental spacing increment
- **Micro Adjustments**: `4px` – Fine-tuning and small adjustments

### Spacing Scale

**Systematic Progression**
- `xs`: 4px – Micro spacing between tightly related elements
- `sm`: 8px – Small spacing, internal component padding
- `md`: 16px – Default spacing, standard margins between elements
- `lg`: 24px – Medium spacing between related sections
- `xl`: 32px – Large spacing, major section separation  
- `2xl`: 48px – Extra large spacing, page-level separation
- `3xl`: 64px – Huge spacing, hero sections and major divisions
- `4xl`: 96px – Maximum spacing, dramatic visual separation

### Border Radius System

**Mathematical Radius Progression**
Our border radius system provides consistent roundness across all interface elements, from micro badges to hero sections.

```css
/* Systematic Radius Scale */
--radius-xs: 2px;       /* Micro radius - badges, small indicators */
--radius-sm: 6px;       /* Small radius - buttons, inputs, form controls */
--radius-md: 10px;      /* Standard radius - cards, panels, modals */
--radius-lg: 14px;      /* Large radius - prominent containers, dialogs */
--radius-xl: 18px;      /* Extra large - hero sections, major layouts */
--radius-full: 9999px;  /* Full radius - pills, avatars, circular elements */
```

**Component Radius Applications**
- **Buttons**: `--radius-sm` (6px) for standard buttons, `--radius-md` (10px) for large buttons
- **Cards & Panels**: `--radius-md` (10px) for standard cards, `--radius-lg` (14px) for prominent cards
- **Form Elements**: `--radius-sm` (6px) for inputs and selects, `--radius-md` (10px) for textareas
- **Status Elements**: `--radius-xs` (2px) for badges, `--radius-full` for pill badges and avatars
- **Containers**: `--radius-lg` (14px) for modals, `--radius-xl` (18px) for hero sections

### Touch Target Accessibility

**Interactive Element Standards**
Following WCAG AA guidelines for optimal touch interaction across all devices.

```css
/* Touch Target Specifications */
--touch-target-min: 48px;       /* Minimum touch size (WCAG AA) */
--touch-target-large: 56px;     /* Large targets for primary actions */
--touch-target-spacing: 8px;    /* Minimum spacing between interactive elements */
```

**Implementation Guidelines**
- All interactive elements (buttons, links, form controls) must meet 48px minimum size
- Adjacent interactive elements require 8px minimum spacing
- Primary action buttons should use 56px for enhanced usability
- Focus indicators must respect element border radius for visual consistency

### Grid System

**Responsive Grid Structure**
- **Mobile (320px - 767px)**: 4 columns, 16px gutters, 20px margins
- **Tablet (768px - 1023px)**: 8 columns, 20px gutters, 32px margins  
- **Desktop (1024px - 1439px)**: 12 columns, 24px gutters, 48px margins
- **Wide (1440px+)**: 12 columns, 32px gutters, 64px margins

**Container Specifications**
- **Mobile**: 100% width, 24px side padding
- **Tablet**: 100% width, 32px side padding
- **Desktop**: 1200px max-width, 48px side padding, centered
- **Wide**: 1400px max-width, 64px side padding, centered

```css
/* Responsive Container System */
.container {
  width: 100%;
  margin: 0 auto;
  padding-left: var(--container-padding);
  padding-right: var(--container-padding);
}

/* Container padding by breakpoint */
--container-padding-mobile: var(--space-lg);    /* 24px */
--container-padding-tablet: var(--space-xl);    /* 32px */
--container-padding-desktop: var(--space-2xl);  /* 48px */
--container-padding-wide: var(--space-3xl);     /* 64px */

/* Container max-widths */
--container-max-tablet: 768px;
--container-max-desktop: 1200px;
--container-max-wide: 1400px;
```

### Design Token Implementation

**Complete CSS Custom Properties**
Comprehensive token system for consistent spacing, border radius, and layout implementation.

```css
:root {
  /* Base Units */
  --space-base: 8px;
  --space-micro: 4px;
  
  /* Spacing Scale */
  --space-xs: var(--space-micro);              /* 4px */
  --space-sm: var(--space-base);               /* 8px */
  --space-md: calc(var(--space-base) * 2);     /* 16px */
  --space-lg: calc(var(--space-base) * 3);     /* 24px */
  --space-xl: calc(var(--space-base) * 4);     /* 32px */
  --space-2xl: calc(var(--space-base) * 6);    /* 48px */
  --space-3xl: calc(var(--space-base) * 8);    /* 64px */
  --space-4xl: calc(var(--space-base) * 12);   /* 96px */
  
  /* Border Radius Scale */
  --radius-xs: 2px;       /* Micro elements */
  --radius-sm: 6px;       /* Buttons, inputs */
  --radius-md: 10px;      /* Cards, panels */
  --radius-lg: 14px;      /* Modals, containers */
  --radius-xl: 18px;      /* Hero sections */
  --radius-full: 9999px;  /* Pills, avatars */
  
  /* Touch Target Specifications */
  --touch-target-min: 48px;        /* WCAG minimum */
  --touch-target-large: 56px;      /* Primary actions */
  --touch-target-spacing: var(--space-sm); /* Between targets */
  
  /* Component-Specific Tokens */
  --btn-radius: var(--radius-sm);
  --card-radius: var(--radius-md);
  --input-radius: var(--radius-sm);
  --modal-radius: var(--radius-lg);
  --card-padding: var(--space-lg);
  --form-field-gap: var(--space-lg);
  
  /* Responsive Container Padding */
  --container-padding: var(--space-lg);      /* Default mobile */
}

/* Responsive Container Adjustments */
@media (min-width: 768px) {
  :root {
    --container-padding: var(--space-xl);    /* Tablet: 32px */
  }
}

@media (min-width: 1024px) {
  :root {
    --container-padding: var(--space-2xl);   /* Desktop: 48px */
  }
}

@media (min-width: 1440px) {
  :root {
    --container-padding: var(--space-3xl);   /* Wide: 64px */
  }
}
```

### Breakpoint System

**Device-Optimized Breakpoints**
- **Mobile**: 320px - 767px (iPhone SE to large phones)
- **Tablet**: 768px - 1023px (iPad, Android tablets)
- **Desktop**: 1024px - 1439px (Laptops, smaller desktops)
- **Wide**: 1440px+ (Large desktops, external monitors)

---

## Component Specifications

### Advanced Foundation Components

#### Modern Button System

**Sophisticated Button Variants**
- **Primary**: Gradient backgrounds with subtle shadows, high-emphasis CTAs
- **Secondary**: Glass morphism effects, medium-emphasis actions
- **Tertiary**: Minimal styling with hover transformations, low-emphasis interactions
- **Ghost**: Transparent backgrounds with subtle borders, navigation elements
- **Icon**: Circular or square icon containers with hover effects
- **Floating Action**: Elevated buttons with enhanced shadows and micro-interactions

**🟢 Production-Tested Button Patterns from Prospect Details**

**Primary Action Button with NextAge Effects**
```css
.btn-primary-nextage {
  height: 44px; /* 11 * 4px */
  padding: 0 24px; /* px-6 */
  background: linear-gradient(to right, 
    rgba(59, 130, 246, 0.9) 0%, 
    rgba(37, 99, 235, 0.9) 100%);
  color: white;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-primary-nextage:hover {
  background: linear-gradient(to right, 
    rgb(59, 130, 246) 0%, 
    rgb(37, 99, 235) 100%);
  box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
  transform: scale(1.02) translateY(-2px);
}
```

**Secondary Glass Button with Backdrop Effects**
```css
.btn-secondary-glass {
  height: 44px;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.9);
  color: rgb(51, 65, 85);
  backdrop-filter: blur(8px) saturate(150%);
  border: 1px solid rgba(226, 232, 240, 0.6);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.2s ease;
}

.btn-secondary-glass:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(203, 213, 225, 0.8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  transform: scale(1.01);
}

/* Dark mode variants */
.dark .btn-secondary-glass {
  background: rgba(30, 41, 59, 0.9);
  color: rgb(226, 232, 240);
  border-color: rgba(51, 65, 85, 0.6);
}

.dark .btn-secondary-glass:hover {
  background: rgba(30, 41, 59, 0.95);
  border-color: rgba(51, 65, 85, 0.9);
}
```

**🟢 Header Back Button Pattern**
```css
/* Universal header back button with glass morphism */
.header-back-button {
  height: 40px; /* h-10 */
  padding: 0 16px; /* px-4 */
  background: linear-gradient(to bottom right,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 252, 0.9) 100%);
  backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 8px; /* space-x-2 */
  font-weight: 500;
  color: rgb(51, 65, 85); /* slate-700 */
  text-decoration: none;
}

.header-back-button:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  background: linear-gradient(to bottom right,
    rgba(255, 255, 255, 0.98) 0%,
    rgba(248, 250, 252, 0.95) 100%);
}

/* Dark mode variant */
.dark .header-back-button {
  background: linear-gradient(to bottom right,
    rgba(30, 41, 59, 0.9) 0%,
    rgba(15, 23, 42, 0.8) 100%);
  border-color: rgba(51, 65, 85, 0.3);
  color: rgb(226, 232, 240); /* slate-200 */
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.dark .header-back-button:hover {
  background: linear-gradient(to bottom right,
    rgba(30, 41, 59, 0.95) 0%,
    rgba(15, 23, 42, 0.9) 100%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

/* Header layout structure with back button */
.header-with-back {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px; /* p-6 */
}

.header-left-section {
  display: flex;
  align-items: center;
  gap: 16px; /* space-x-4 */
}

.header-separator {
  height: 24px; /* h-6 */
  width: 1px;
  background: rgba(226, 232, 240, 0.8);
}

.dark .header-separator {
  background: rgba(51, 65, 85, 0.6);
}
```

**Header Back Button Features:**
- **Glass Morphism**: Consistent with other header elements using backdrop blur
- **Proper Placement**: Left side of header, before page title with separator
- **Accessibility**: Focus states and semantic markup with proper ARIA
- **Responsive**: Works across all device sizes with appropriate touch targets

**Enhanced Size System**
- **Micro**: `32px height, var(--space-xs) padding, var(--radius-xs)` – Compact spaces, tags, badges
- **Small**: `40px height, var(--space-sm) padding, var(--radius-sm)` – Dense interfaces, secondary actions
- **Medium**: `var(--touch-target-min) height, var(--space-md) padding, var(--radius-sm)` – Standard interactions, forms (48px WCAG compliant)
- **Large**: `52px height, var(--space-lg) padding, var(--radius-md)` – Primary actions, emphasis
- **XL Touch**: `var(--touch-target-large) height, var(--space-xl) padding, var(--radius-md)` – Mobile-optimized, maximum accessibility (56px)

**Advanced Interactive States**
```css
.button-enhanced {
  /* Default state with glass morphism */
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.9) 0%, rgba(29, 78, 216, 0.95) 100%);
  backdrop-filter: blur(8px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: var(--btn-radius);
  min-height: var(--touch-target-min);
  padding: var(--space-sm) var(--space-lg);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.button-enhanced:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 12px 24px rgba(59, 130, 246, 0.25);
  background: linear-gradient(135deg, rgba(59, 130, 246, 1) 0%, rgba(29, 78, 216, 1) 100%);
}

.button-enhanced:active {
  transform: translateY(0) scale(0.98);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}
```

#### Sophisticated Form Components

**Modern Input System**
- **Height**: `52px` minimum for optimal touch and visual balance
- **Padding**: `16px horizontal, 14px vertical` for comfortable interaction
- **Border Radius**: `8px` for contemporary appearance
- **Border Treatment**: `1px solid` with adaptive colors and glass effects
- **Focus Enhancement**: `2px outline` with glow effects and subtle scale

**Advanced Input Variants**
- **Standard**: Clean borders with subtle shadows
- **Floating Label**: Animated labels with smooth transitions
- **Glass**: Semi-transparent backgrounds with backdrop blur
- **Filled**: Solid backgrounds with elevated appearance
- **Outlined**: Prominent borders with enhanced contrast

**Form Layout Enhancements**
- **Label Spacing**: `12px` below label with micro-animations
- **Field Spacing**: `32px` between fields for visual breathing room
- **Error States**: `6px` below field with slide-in animations
- **Help Text**: Contextual positioning with fade transitions
- **Validation**: Real-time feedback with color transitions

### Advanced Navigation Systems

#### Executive Sidebar Navigation
```css
.sidebar-executive {
  width: clamp(240px, 20vw, 320px);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.98) 100%);
  backdrop-filter: blur(12px) saturate(180%);
  border-right: 1px solid rgba(226, 232, 240, 0.8);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.04);
}

.sidebar-item {
  height: 52px;
  padding: 0 20px;
  border-radius: 8px;
  margin: 4px 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar-item:hover {
  background: rgba(59, 130, 246, 0.08);
  transform: translateX(4px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.12);
}
```

#### Navigation Toggle Control
**Floating Toggle Button for Collapsible Sidebars**
```css
.nav-toggle-button {
  /* Positioning and structure */
  position: absolute;
  right: -16px; /* -right-4 */
  top: 24px; /* top-6 */
  z-index: 60;
  
  /* Size and shape */
  width: 32px;
  height: 32px;
  border-radius: 50%;
  padding: 0;
  
  /* Enhanced glass morphism matching site header */
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(20px);
  border: 1px solid var(--border);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  
  /* Smooth transitions */
  transition: all 0.2s ease-in-out;
}

/* Dark theme variant */
.dark .nav-toggle-button {
  background: rgba(15, 15, 25, 0.98);
  backdrop-filter: blur(20px);
}

/* Interactive states */
.nav-toggle-button:hover {
  background: rgba(226, 232, 240, 0.95);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  transform: scale(1.05);
}

.dark .nav-toggle-button:hover {
  background: rgba(30, 41, 59, 0.95);
}

/* Icon styling */
.nav-toggle-button .icon {
  width: 16px;
  height: 16px;
  color: var(--muted-foreground);
  transition: color 0.2s ease;
}

.dark .nav-toggle-button .icon {
  color: rgb(203, 213, 225); /* slate-300 */
}
```

**Toggle Button Implementation Guidelines**:
- **High Opacity Background**: Use 98% opacity to prevent gradient bleed-through
- **Theme Detection**: Monitor `document.documentElement` classList for dark mode
- **Real-time Updates**: Use `MutationObserver` for theme change detection
- **Accessibility**: Maintain proper contrast ratios in both themes
- **Visual Feedback**: Scale and shadow changes on hover states

#### Modern Mobile Navigation
- **Height**: `72px` with enhanced safe area handling
- **Background**: Glass morphism with subtle gradients
- **Item Design**: Icon-centric with animated indicators
- **Active States**: Smooth color transitions with scale effects
- **Gesture Support**: Swipe interactions and haptic feedback

#### **🟢 Tab System with Glass Morphism**
```css
/* Universal tab navigation with glass morphism effects */
.tab-list-glass {
  background: linear-gradient(to bottom right,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 252, 0.9) 100%);
  backdrop-filter: blur(16px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 6px;
  height: 48px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  gap: 0;
}

.tab-list-glass:hover {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

/* Dark mode variant */
.dark .tab-list-glass {
  background: linear-gradient(to bottom right,
    rgba(30, 41, 59, 0.9) 0%,
    rgba(15, 23, 42, 0.8) 100%);
  border-color: rgba(51, 65, 85, 0.3);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.dark .tab-list-glass:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

/* Tab trigger styling */
.tab-trigger {
  border-radius: 6px;
  padding: 12px 16px;
  font-weight: 500;
  font-size: 0.875rem;
  color: rgb(100, 116, 139); /* slate-500 */
  background: transparent;
  border: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-trigger:hover {
  background: rgba(248, 250, 252, 0.6);
  color: rgb(51, 65, 85); /* slate-700 */
}

.tab-trigger[data-state="active"] {
  background: rgba(255, 255, 255, 1);
  color: rgb(15, 23, 42); /* slate-900 */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* Dark mode tab triggers */
.dark .tab-trigger {
  color: rgb(148, 163, 184); /* slate-400 */
}

.dark .tab-trigger:hover {
  background: rgba(51, 65, 85, 0.5);
  color: rgb(226, 232, 240); /* slate-200 */
}

.dark .tab-trigger[data-state="active"] {
  background: rgba(51, 65, 85, 1);
  color: rgb(248, 250, 252); /* slate-100 */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* Tab content styling */
.tab-content {
  margin-top: 24px; /* mt-6 */
  padding: 0;
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Tab System Features:**
- **Glass Background**: Consistent backdrop blur with gradient effects
- **Hover Animation**: Subtle scale effect on tab list hover  
- **Active State**: High contrast active tab with shadow elevation
- **Smooth Transitions**: 200ms transitions for all state changes
- **Content Animation**: Fade-in effect for tab content switching

### Sophisticated Data Display

#### Executive Dashboard Cards
```css
.dashboard-card {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.95) 100%);
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 16px;
  padding: 32px;
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, 0.08),
    0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.dashboard-card:hover {
  transform: translateY(-4px) scale(1.02);
  box-shadow: 
    0 16px 48px rgba(0, 0, 0, 0.12),
    0 4px 16px rgba(0, 0, 0, 0.08);
}
```

**Card Content Structure**
- **Header**: Icon, title, and contextual actions
- **Primary Metric**: Large, prominent value display
- **Trend Indicator**: Visual change representation with animations
- **Secondary Info**: Supporting details and comparisons
- **Interactive Elements**: Drill-down capabilities with hover states

#### Advanced Data Tables
```css
.data-table-modern {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}

.table-header {
  background: linear-gradient(90deg, rgba(248, 250, 252, 0.98) 0%, rgba(241, 245, 249, 0.95) 100%);
  backdrop-filter: blur(8px);
  height: 64px;
  padding: 0 24px;
}

.table-row {
  height: 64px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.5);
  transition: all 0.2s ease;
}

.table-row:hover {
  background: rgba(59, 130, 246, 0.04);
  transform: scale(1.005);
}
```

### Enhanced Feedback Systems

#### Modern Alert Components
```css
.alert-modern {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.9) 100%);
  backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  animation: slideInDown 0.3s ease-out;
}

.alert-success {
  border-left: 4px solid #10b981;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.02) 100%);
}
```

#### Advanced Loading States
- **Skeleton Components**: Sophisticated shimmer effects matching content structure
- **Progress Indicators**: Circular and linear with gradient fills and animations
- **Loading Overlays**: Glass morphism with subtle blur effects
- **Micro-Spinners**: Contextual loading indicators with smooth animations

### Interactive Component Enhancements

#### Hover and Focus Treatments
```css
.interactive-enhanced {
  position: relative;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.interactive-enhanced::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.interactive-enhanced:hover::before {
  left: 100%;
}
```

#### Accessibility Enhancements
- **Focus Indicators**: High-contrast, animated focus rings
- **Keyboard Navigation**: Comprehensive tab order with visual indicators
- **Screen Reader Support**: Enhanced ARIA attributes and live regions
- **Reduced Motion**: Respect for user motion preferences
- **Color Independence**: Information conveyed through multiple visual channels

#### 🚨 CRITICAL: Icon-Only Button Accessibility Rule
**ALL ICON-ONLY BUTTONS MUST HAVE TOOLTIPS** - This is a mandatory accessibility requirement

```tsx
// ✅ CORRECT: Icon button with tooltip
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

---

## 🆕 Production Component Patterns

### Admin Sidebar Trigger Implementation

**Consistent Pattern Across All Admin Pages:**
```tsx
// Import required
import { SidebarTrigger } from "@/components/ui/sidebar";

// Header layout structure
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <SidebarTrigger className="-ml-1" />
    <div>
      <h1 className="font-semibold text-3xl">{pageTitle}</h1>
      <p className="mt-2 font-medium text-base">{pageDescription}</p>
    </div>
  </div>
  {/* Action buttons on the right */}
</div>
```

**Key Implementation Details:**
- **Positioning**: Left side of header, before page title
- **Spacing**: `gap-3` between trigger and title content
- **Styling**: `className="-ml-1"` for proper visual alignment
- **Applied to**: Admin Dashboard, Prospect Pipeline, all admin sub-pages

### Production CSS Classes

**NextAge Card Classes:**
```css
.nextage-card-gradient { /* Glass morphism card background */ }
.nextage-card-hover { /* Interactive hover effects */ }
.nextage-card-image { /* Logo/image display adjustments */ }
.nextage-card-text { /* Card text styling */ }
```

**NextAge Navigation:**
```css
.nextage-nav { /* Fixed header with backdrop blur */ }
.nextage-nav.scrolled { /* Header state when scrolled */ }
```

**NextAge Button Classes:**
```css
.nextage-btn-primary { /* Primary button styling */ }
.nextage-btn-secondary { /* Secondary button styling */ }
.nextage-overlay-button { /* Floating overlay buttons */ }
.nextage-overlay-button-top-right { /* Position variant */ }
```

**NextAge Visual Effects:**
```css
.nextage-hero-gradient { /* Main container gradient */ }
.nextage-bg-gradient-radial { /* Radial gradient decoration */ }
.nextage-bg-decoration { /* Background decoration opacity */ }
.nextage-hero-title { /* Hero section title styling */ }
.nextage-hero-subtitle { /* Hero section subtitle */ }
.nextage-hero-description { /* Hero section description */ }
```

## Motion & Animation System

### Advanced Timing Architecture

**Sophisticated Easing Functions**
```css
:root {
  /* Primary Motion Curves */
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);      /* Standard transitions */
  --ease-enter: cubic-bezier(0, 0, 0.2, 1);         /* Element entrances */
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);          /* Element exits */
  --ease-elastic: cubic-bezier(0.68, -0.55, 0.265, 1.55); /* Playful interactions */
  --ease-bounce: cubic-bezier(0.68, -0.6, 0.32, 1.6); /* Button presses */
  --ease-precise: cubic-bezier(0.25, 0.46, 0.45, 0.94); /* Data animations */
}
```

**Motion Purpose Categories**
- **Functional**: Smooth state changes that enhance usability
- **Emotional**: Delightful micro-interactions that create connection
- **Informational**: Guided attention through sophisticated choreography
- **Performative**: Showcase interactions that demonstrate quality and attention to detail

### Professional Duration System

**Executive Animation Timing**
- **Instant**: `50-75ms` – Critical feedback, button press acknowledgment
- **Micro**: `100-150ms` – Hover states, focus indicators, immediate UI feedback
- **Short**: `200-300ms` – Local transitions, dropdowns, tooltips, component state changes
- **Medium**: `350-500ms` – Modal entrances, drawer animations, page sections
- **Long**: `600-800ms` – Page transitions, complex choreography, storytelling
- **Epic**: `1000-1500ms` – Onboarding sequences, major state transformations

### Sophisticated Motion Patterns

#### Entrance Choreography
```css
/* Staggered List Animation */
@keyframes staggeredFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.stagger-item {
  animation: staggeredFadeIn 0.4s var(--ease-enter) both;
}

.stagger-item:nth-child(1) { animation-delay: 0ms; }
.stagger-item:nth-child(2) { animation-delay: 100ms; }
.stagger-item:nth-child(3) { animation-delay: 200ms; }
/* Continue pattern... */
```

#### Glass Morphism Transitions
```css
.glass-transition {
  transition: 
    backdrop-filter 0.3s var(--ease-smooth),
    background-color 0.3s var(--ease-smooth),
    border-color 0.3s var(--ease-smooth),
    box-shadow 0.3s var(--ease-smooth),
    transform 0.3s var(--ease-smooth);
}

.glass-transition:hover {
  backdrop-filter: blur(20px) saturate(180%) brightness(110%);
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px) scale(1.02);
}
```

#### Sophisticated Loading Animations
```css
/* Executive Shimmer Effect */
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.shimmer-container {
  position: relative;
  overflow: hidden;
  background: linear-gradient(90deg, #f0f0f0 25%, transparent 50%, #f0f0f0 75%);
}

.shimmer-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.6) 50%,
    transparent 100%
  );
  animation: shimmer 2s infinite;
}
```

### Advanced Interaction Patterns

#### Multi-Layer Hover Effects
```css
.advanced-interaction {
  position: relative;
  transform-style: preserve-3d;
  transition: all 0.3s var(--ease-smooth);
}

.advanced-interaction::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, transparent 100%);
  border-radius: inherit;
  opacity: 0;
  transition: opacity 0.3s var(--ease-smooth);
}

.advanced-interaction:hover::before {
  opacity: 1;
}

.advanced-interaction:hover {
  transform: 
    perspective(1000px) 
    rotateX(2deg) 
    rotateY(-2deg) 
    translateZ(10px) 
    scale(1.02);
  box-shadow: 
    0 20px 40px rgba(0, 0, 0, 0.15),
    0 4px 12px rgba(59, 130, 246, 0.2);
}
```

#### Progressive Enhancement Animations
```css
/* Base experience (no animations) */
.progressive-element {
  opacity: 1;
  transform: none;
}

/* Enhanced experience for supporting browsers */
@supports (transform: perspective(1px)) {
  .progressive-element {
    transition: all 0.3s var(--ease-smooth);
  }
  
  .progressive-element:hover {
    transform: translateY(-4px) scale(1.05);
  }
}

/* Premium experience for high-end devices */
@media (hover: hover) and (pointer: fine) {
  @supports (backdrop-filter: blur(1px)) {
    .progressive-element:hover {
      backdrop-filter: blur(8px) saturate(180%);
    }
  }
}
```

### Performance-Optimized Animations

#### Hardware Acceleration Standards
```css
.gpu-optimized {
  /* Force GPU acceleration */
  transform: translateZ(0);
  will-change: transform, opacity;
  
  /* Optimize for smooth rendering */
  backface-visibility: hidden;
  perspective: 1000px;
  
  /* Smooth subpixel rendering */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Clean up will-change after animation */
.gpu-optimized.animation-complete {
  will-change: auto;
}
```

#### Accessibility-Aware Motion
```css
/* Respect user preferences */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  
  /* Maintain essential functionality */
  .critical-animation {
    animation-duration: 0.2s !important;
    transition-duration: 0.2s !important;
  }
}

/* Enhanced motion for users who prefer it */
@media (prefers-reduced-motion: no-preference) {
  .motion-enhanced {
    animation-duration: 0.8s;
    transition-duration: 0.4s;
  }
}
```

### Contextual Animation Systems

#### Dashboard-Specific Choreography
- **Card Reveals**: Staggered entrances with depth-based timing
- **Data Updates**: Smooth number transitions with spring physics
- **State Changes**: Color morphing with sophisticated easing
- **Interactive Feedback**: Multi-layer hover effects with glass morphism

#### Form Interaction Patterns
- **Field Focus**: Gentle scale with glow effects
- **Validation States**: Smooth color transitions with micro-bounce
- **Error Handling**: Attention-drawing shake with recovery animation
- **Success Feedback**: Satisfying check animations with color progression

#### Navigation Micro-Interactions
- **Menu Reveals**: Sophisticated slide and fade combinations
- **Active States**: Smooth indicator movements with elastic easing
- **Breadcrumb Updates**: Contextual highlighting with smooth transitions
- **Page Transitions**: Elegant cross-fades with subtle parallax

### Animation Performance Metrics

**Quality Standards**
- **Frame Rate**: Consistent 60fps across all interactions
- **Jank-Free**: Zero dropped frames during critical animations
- **Battery Efficiency**: Optimized for mobile device performance
- **Memory Usage**: Minimal impact on device resources
- **Graceful Degradation**: Smooth fallbacks for lower-end devices

---

## 🆕 Shadcn/UI Integration

### Component Usage Policy

**CRITICAL**: Always use shadcn components when available for consistency.

**Implementation Workflow:**
1. Check if shadcn has the component you need
2. Use the MCP server to fetch component code
3. First call the demo tool to see usage patterns
4. Apply NextAge styling patterns on top of shadcn base

**Common shadcn Components in Production:**
- **Card**: Used for dashboard cards, prospect cards
- **Button**: All buttons use shadcn Button with NextAge variants
- **DropdownMenu**: All context menus and dropdowns
- **Sidebar**: Admin navigation sidebar
- **Input**: Form inputs with NextAge styling
- **Tabs**: Tab navigation systems

**Example Integration:**
```tsx
// Use shadcn Card with NextAge styling
<Card className="nextage-card-gradient nextage-card-hover">
  <CardHeader>
    <CardTitle>Content</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
</Card>
```

## Platform-Specific Adaptations

### Web Platform Standards

**Browser Optimization**
- **Progressive Enhancement**: Core functionality without JavaScript
- **Performance Budget**: First Contentful Paint under 1.5s
- **Responsive Design**: Fluid layouts from 320px to 4K displays
- **Cross-Browser**: Modern browsers with graceful degradation
- **Keyboard Navigation**: Complete tab order and shortcuts
- **SEO Optimization**: Semantic HTML and proper heading hierarchy

### Mobile Web Optimizations

**Touch Interaction Standards**
- **Touch Targets**: 48px minimum size with adequate spacing
- **Gesture Support**: Swipe, pinch-to-zoom where appropriate
- **Viewport**: Proper meta tags for consistent rendering
- **Performance**: Optimized for mobile CPUs and memory constraints
- **Network**: Graceful degradation for varying connection speeds

### Desktop Enhancement Features

**Professional User Optimization**
- **Keyboard Shortcuts**: Efficient workflows for power users
- **Multi-tasking**: Support for multiple browser tabs/windows
- **Precision Interactions**: Hover states and detailed tooltips
- **Information Density**: Higher information density when appropriate
- **Multi-device**: Seamless experience across devices

---

## Implementation Guidelines

### Design Token Integration

**CSS Custom Properties**
```css
:root {
  /* Color Tokens */
  --color-primary: #1e40af;
  --color-primary-dark: #1e3a8a;
  --color-primary-light: #3b82f6;
  
  /* Spacing Tokens */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  
  /* Typography Tokens */
  --font-size-h1: 32px;
  --line-height-h1: 40px;
  --font-weight-h1: 700;
}
```

### TailwindCSS Extensions

**Custom Utility Classes**
```css
/* Business-optimized spacing */
.space-business-xs { gap: 4px; }
.space-business-sm { gap: 8px; }
.space-business-md { gap: 16px; }
.space-business-lg { gap: 24px; }
.space-business-xl { gap: 32px; }

/* Touch-friendly sizing */
.touch-target { min-height: 48px; min-width: 48px; }
.touch-target-lg { min-height: 56px; min-width: 56px; }

/* Accessibility-aware animations */
@media (prefers-reduced-motion: reduce) {
  .motion-safe { animation: none; transition: none; }
}
```

### Quality Assurance Standards

**Automated Testing**
- Color contrast verification (WCAG AA+)
- Touch target size validation
- Typography scaling verification
- Motion preference respect
- Performance budget compliance

**Manual Validation**
- User testing with business professionals
- Accessibility testing with assistive technology
- Cross-device responsive verification
- Brand consistency validation
- Performance testing across connection speeds

---

## Maintenance & Evolution

### Version Control
- Design system versioned with semantic versioning
- Component changes documented with migration guides
- Breaking changes communicated with advance notice
- Backward compatibility maintained for major versions

### Continuous Improvement
- Monthly user feedback integration
- Quarterly accessibility compliance audits
- Semi-annual performance optimization reviews
- Annual comprehensive design system evaluation

---

**Last Updated**: 2025-01-28  
**Version**: 3.0.0  
**Next Review**: 2025-04-28  

**🔄 Version 3.0.0 Major Update**:

**Complete Production Alignment:**
- ✅ Incorporated all patterns from `screenpatterns.md`
- ✅ Updated color system to match production CSS variables
- ✅ Added critical layout architecture patterns
- ✅ Documented header-aware flex layout system
- ✅ Added gradient inheritance pattern
- ✅ Documented admin sidebar trigger implementation
- ✅ Added production CSS class references
- ✅ Integrated shadcn/UI component usage guidelines
- ❌ Removed contradictory gradient patterns
- ❌ Removed theoretical color values

**Production-Verified Patterns:**
- Main index/landing/hero page structure
- Admin dashboard layout and components
- Admin sidebar and trigger button
- Prospect Pipeline Board implementation
- Dropdown menu glass morphism effects

**This document now represents the authoritative design system based on actual production implementation.**