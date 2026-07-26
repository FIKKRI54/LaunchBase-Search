---
version: 1.0.0
name: Niteco Enterprise System
description: A sophisticated, high-contrast dark theme optimized for enterprise-level digital agencies and global brands.

colors:
  bg: "#141618"
  surface: "#17191c"
  primary: "#f9d022"
  text: "#ffffff"
  textMuted: "#848e9c"
  border: "rgba(230, 232, 236, 0.1)"
  accentGreen: "#1F6520"
  accentRed: "#d31245"
  accentPurple: "#52364c"
  accentBurgundy: "#7d1c21"

typography:
  fontFamily: "'Plus Jakarta Sans', sans-serif"
  h1:
    fontSize: "72px"
    fontWeight: "600"
    lineHeight: "1.05"
    letterSpacing: "-0.02em"
  h2:
    fontSize: "48px"
    fontWeight: "600"
    lineHeight: "1.1"
  h3:
    fontSize: "24px"
    fontWeight: "600"
  body:
    fontSize: "18px"
    fontWeight: "400"
    lineHeight: "1.6"
  meta:
    fontSize: "12px"
    fontWeight: "600"
    letterSpacing: "3px"
    textTransform: "uppercase"

spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
  xl: "80px"
  section: "128px"
  container: "1240px"

rounded:
  none: "0px"
  sm: "4px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "9999px"

components:
  nav:
    type: "sticky"
    blur: "24px"
    height: "80px"
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)"
  buttons:
    primary: "rounded-full, bg-primary, text-dark, font-semibold"
    outline: "rounded-full, border-white/20, uppercase, letter-spacing-2px"
  cards:
    service: "vertical-stack, border-t, icon-accent-primary, hover-transition"
    news: "rounded-2xl-image, metadata-row, title-hover-color-primary"
  caseStudies:
    layout: "zero-gap-masonry"
    interaction: "hover-scale-content, background-overlay-dim"
  stats:
    layout: "four-column-grid"
    value: "text-6xl, color-primary, font-normal"

motion:
  curve: "ease-in-out"
  duration: "300ms"
  hoverScale: "1.05"
  heroAnimation: "subtle-drift-15s-infinite"
---
## Overview
The Niteco visual system is built on a "Digital Excellence" philosophy. It uses a deep charcoal background to create a premium, cinematic feel that allows the bright yellow primary color to serve as a focused beacon for calls to action and critical information.

## Colors
The palette is dominated by dark neutrals with high-chroma accents.
- **Primary (#f9d022):** Used for primary buttons, active states, icons, and significant numbers.
- **Backgrounds:** A tiered system of #141618 (base) and #17191c (elevated surfaces).
- **Case Study Accents:** Specific deep greens, reds, and purples are used for full-block brand background storytelling.

## Typography
Plus Jakarta Sans is the primary typeface, serving as a geometric and modern engine. Headings use tight line-heights (1.05) and negative letter spacing for a high-impact, editorial look. Metadata uses wide letter spacing (3px) and uppercase styling to establish hierarchy.

## Spacing
A generous spacing scale is used to define boundaries without heavy lines. Hero sections and primary content blocks use vertical padding of 80px to 128px. The global container is locked at 1240px with responsive gutters.

## Layout
Layouts are structured on a 12-column grid.
- **Nav:** Sticky with a 80% opacity background and heavy backdrop blur (backdrop-blur-xl).
- **Hero:** Split grid (6:6) or centered massive text.
- **Masonry:** The case study section uses a zero-gap grid where items span multiple columns and rows to create a dense, mosaic brand wall.

## Elevation & Depth
Depth is created through color layering rather than drop shadows.
- **Level 0:** Base background (#141618).
- **Level 1:** Surface cards or secondary sections (#17191c).
- **Level 2:** Modals and menus with backdrop-blur and 1px white/10 borders.

## Shapes
- **Pills:** All buttons and specific tags utilize the `rounded-full` property.
- **Soft Containers:** Cards and news imagery use `rounded-2xl` (16px).
- **Grid Borders:** Office sections use a "collapsed border" technique where items share 1px solid white/10 lines.

## Components
- **Primary Navigation:** Features dropdowns with rotation icons and a consistent 80px height.
- **Case Study Tiles:** Interactive blocks with full-bleed background colors and centered logos.
- **Service List:** Minimalist vertical stacks with animated arrow indicators on hover.
- **Footer:** Multi-column layout with a specialized high-contrast subscription form.

## Motion
- **Micro-interactions:** 300ms transitions on all hover states.
- **Hover States:** Buttons scale 1.05x; masonry items use internal image scaling.
- **Hero Graphics:** Abstract SVG paths utilize a 15-second infinite `subtle-drift` animation to add life to the background without distracting from copy.

## Do's and Don'ts
- **Do:** Use the primary yellow for interactive elements and brand markers.
- **Do:** Use borders (1px white/10) to separate sections on the dark background.
- **Don't:** Use drop shadows on dark surfaces; rely on contrast and borders.
- **Don't:** Mix font families; stick to Plus Jakarta Sans for all weights.

## Accessibility
- Maintain a minimum of 3:1 contrast ratio for graphical elements and 4.5:1 for body text.
- All interactive grid blocks must include `focus-ring-4` with primary yellow for keyboard navigation.
- SVGs and images must include descriptive ARIA labels or alt text.