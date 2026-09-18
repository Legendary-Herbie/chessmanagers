---
version: "alpha"
name: "1chessclub"
description: "A focused chess club management interface with quiet operational surfaces, indigo actions, green success accents, and compact form-driven workflows."
colors:
  primary: "#6366F1"
  primary-hover: "#4F46E5"
  primary-pressed: "#4338CA"
  on-primary: "#FFFFFF"
  accent: "#10B981"
  accent-light: "#34D399"
  danger: "#F43F5E"
  danger-text: "#EF4444"
  warning: "#F59E0B"
  warning-dark: "#FBBF24"
  success-text: "#16A34A"
  success-text-dark: "#34D399"
  surface-page: "#F7F8FA"
  surface-page-dark: "#0A0F1E"
  surface: "#FFFFFF"
  surface-dark: "#111827"
  surface-muted: "#F3F4F6"
  surface-muted-dark: "#1F2937"
  surface-glass-base: "#FFFFFF"
  surface-glass-base-dark: "#111827"
  text-strong: "#111827"
  text-strong-dark: "#F9FAFB"
  text: "#374151"
  text-dark: "#E5E7EB"
  text-muted: "#6B7280"
  text-muted-dark: "#9CA3AF"
  text-placeholder: "#9CA3AF"
  outline: "#9CA3AF"
  outline-dark: "#374151"
  outline-emphasis: "#6B7280"
  outline-emphasis-dark: "#4B5563"
  outline-accent: "#C6D9F7"
  outline-accent-dark: "#3B5A8A"
  focus-ring: "#6366F1"
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: 800
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 800
    lineHeight: 40px
    letterSpacing: -0.03em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 800
    lineHeight: 32px
    letterSpacing: -0.03em
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: -0.02em
  title-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 600
    lineHeight: 27px
    letterSpacing: -0.02em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 27px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
  action-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 20px
rounded:
  xs: 2px
  sm: 4px
  DEFAULT: 6px
  md: 8px
  lg: 12px
  xl: 16px
  "2xl": 24px
  full: 9999px
spacing:
  "2xs": 4px
  xs: 8px
  sm: 12px
  md: 20px
  lg: 32px
  xl: 48px
  field-gap: 6px
  brand-gap: 10px
  container-padding: 20px
  content-max-width: 1000px
  auth-panel-padding: 32px
  auth-container-width: 420px
  input-padding-x: 12px
  button-padding-x: 16px
  button-padding-y: 8px
  min-tap-size: 44px
radii:
  xs: 2px
  sm: 4px
  base: 6px
  md: 8px
  lg: 12px
  xl: 16px
  "2xl": 24px
  full: 9999px
shadows:
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)"
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.10), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.10), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
  dark-sm: "0 1px 3px rgba(0, 0, 0, 0.30)"
  dark-md: "0 12px 20px rgba(0, 0, 0, 0.40)"
  dark-lg: "0 32px 64px rgba(0, 0, 0, 0.50)"
  dark-xl: "0 48px 80px rgba(0, 0, 0, 0.60)"
  focus-ring: "0 0 0 4px rgba(99, 102, 241, 0.15)"
elevation:
  flat:
    shadow: "none"
    borderWidth: 1px
  raised:
    shadow: "0 10px 15px -3px rgba(0, 0, 0, 0.10), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
    borderWidth: 1px
  overlay:
    shadow: "0 20px 25px -5px rgba(0, 0, 0, 0.10), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
    borderWidth: 1px
  dark-raised:
    shadow: "0 32px 64px rgba(0, 0, 0, 0.50)"
    borderWidth: 1px
motion:
  fast:
    duration: "120ms"
    easing: "cubic-bezier(0.4, 0, 0.2, 1)"
  normal:
    duration: "200ms"
    easing: "cubic-bezier(0.4, 0, 0.2, 1)"
  slow:
    duration: "300ms"
    easing: "cubic-bezier(0.4, 0, 0.2, 1)"
  spring:
    duration: "300ms"
    easing: "cubic-bezier(0.34, 1.56, 0.64, 1)"
  spinner:
    duration: "600ms"
    easing: "linear"
icons:
  sm: 16px
  md: 24px
  lg: 32px
  xl: 48px
components:
  app-canvas-light:
    backgroundColor: "{colors.surface-page}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
  app-canvas-dark:
    backgroundColor: "{colors.surface-page-dark}"
    textColor: "{colors.text-dark}"
    typography: "{typography.body-md}"
  auth-panel-light:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-strong}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.auth-panel-padding}"
  auth-panel-dark:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.text-strong-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "{spacing.auth-panel-padding}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.action-md}"
    rounded: "{rounded.md}"
    height: 42px
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
  input-field-light:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.text-strong}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 42px
    padding: "0 12px"
  input-field-dark:
    backgroundColor: "{colors.surface-muted-dark}"
    textColor: "{colors.text-strong-dark}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 42px
    padding: "0 12px"
  input-field-focus:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.md}"
  form-label:
    textColor: "{colors.text}"
    typography: "{typography.label-md}"
  form-helper:
    textColor: "{colors.text-muted}"
    typography: "{typography.label-sm}"
  error-banner:
    backgroundColor: "rgba(244, 63, 94, 0.10)"
    textColor: "{colors.danger}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
  brand-mark:
    textColor: "{colors.primary}"
    width: 36px
    height: 36px
  brand-name:
    textColor: "{colors.text-strong}"
    typography: "{typography.title-md}"
  footer-note:
    textColor: "{colors.text-muted}"
    typography: "{typography.label-sm}"
  loading-spinner:
    textColor: "{colors.on-primary}"
    width: 16px
    height: 16px
    rounded: "{rounded.full}"
---

## Overview

1chessclub has a quiet, work-focused SaaS feel: compact, centered workflows; pale operational surfaces; and a single confident indigo for the action path. The product should feel precise and administrative rather than decorative. The chess theme appears through restrained language and a simple bar-like mark, not through ornamental boards or heavy game imagery.

The strongest expression of the system is the authentication flow: a centered panel, soft ambient background color, compact inputs, clear labels, and one full-width call to action. Dark mode is an important first-class identity, using deep navy surfaces with the same indigo CTA and subdued slate borders.

## Colors

The palette is anchored by **indigo** for primary actions and focus, **emerald** for positive/supportive signals, and **rose** for errors. Neutral gray and slate tones do most of the interface work.

- **Primary Indigo (#6366F1):** Use for main actions, brand mark, focus state, and links. Hover and pressed states deepen toward #4F46E5 and #4338CA.
- **Emerald Accent (#10B981):** Reserve for success, progress, or positive rating movement. It should support the interface, not compete with the primary action color.
- **Rose Danger (#F43F5E):** Use for blocking errors and destructive feedback.
- **Light Surfaces:** #F7F8FA page backgrounds, #FFFFFF panels, and #F3F4F6 inputs create a clean product canvas.
- **Dark Surfaces:** #0A0F1E page backgrounds, #111827 panels, and #1F2937 inputs create a deep operational mode without losing the indigo identity.

## Typography

The canonical typeface is **Inter**, chosen for a neutral product voice and strong legibility in form-heavy workflows. The hierarchy is compact: titles are weighty and slightly tight, while labels are small, direct, and medium weight.

Use 24px to 32px headlines for page and form titles, 16px for body and control text, 14px for labels, and 12px for helper text or footnotes. Letter spacing should only tighten headings and brand text; body copy and controls should remain at normal tracking.

## Layout

The layout follows an 8px-derived spacing rhythm with a few practical product steps: 12px for form gaps, 20px for standard page padding, 32px for panel padding, and 48px for large separation. The default content ceiling is 1000px for app pages, while narrow task flows such as login and registration use a 420px centered container.

Keep screens efficient and scannable. Avoid marketing-style hero compositions for core workflows. Forms should present one clear path, with labels close to inputs, predictable vertical rhythm, and primary actions spanning the available form width when the task is singular.

## Elevation & Depth

Depth is functional rather than dramatic. Panels sit above the canvas with a 1px border and a soft shadow. Inputs mostly rely on tonal contrast and border color; they should not look like floating cards. Focus states use a calm 4px indigo ring at low opacity.

Dark mode increases shadow density to preserve separation on navy surfaces. Use deeper shadows for overlays and dialogs, but keep the core app feeling grounded and quiet.

## Shapes

The shape language is modestly rounded. Inputs and standard buttons use 8px corners, panels use 16px, and small structural details can use 2px to 6px. Avoid overly pill-shaped controls except for spinners, avatars, or truly circular icon buttons.

This restraint is part of the product identity: corners are softened enough to feel modern, but not so rounded that dense club-management screens become playful or inflated.

## Components

### Buttons

Primary buttons are indigo with white text, 42px tall in forms, and medium-bold. Hover states deepen the indigo rather than adding shadows. Loading buttons keep their width stable and use a small inline spinner.

### Inputs

Inputs are compact, 42px tall, and filled with a muted surface color. On hover, strengthen the border. On focus, switch the fill toward the main surface and add the indigo focus ring. Placeholder text should be visibly quieter than entered text.

### Panels

Panels are white in light mode and deep slate in dark mode. Authentication and modal panels use a 16px radius, 32px padding on desktop, and a soft raised shadow. Mobile panels can reduce padding to 20px and radius to 12px.

### Brand Mark

The brand mark is a simple indigo vertical-bar motif. It should stay compact and geometric, pairing with a semibold wordmark. Do not add ornate chess-piece illustration where the existing abstract mark would be clearer.

### Feedback

Error banners use a pale rose fill, rose border, and rose text. Success and rating-positive states should use emerald text or small accent surfaces. Warnings use amber, softened in dark mode.

## Do's and Don'ts

- Do use indigo as the single dominant action and focus color on a screen.
- Do keep management screens compact, predictable, and easy to scan.
- Do preserve dark mode parity for surfaces, borders, text, and elevation.
- Do use Inter consistently across headings, labels, buttons, and form controls.
- Don't introduce decorative chessboard backgrounds or heavy themed illustration into operational workflows.
- Don't make every container a card; reserve framed panels for task groups, forms, dialogs, and repeated list items.
- Don't use large rounded pills for ordinary form controls.
- Don't mix extra brand colors into primary workflows unless they communicate a semantic state.
