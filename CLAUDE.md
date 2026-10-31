# Kewti AI Guidelines & Constraints

When implementing, modifying, or testing code in this workspace, follow these rules:

## 1. Discover Components, Fonts & Logos via kewti-cli
- Run `npx kewti-cli list` (or `npx kewti-cli list --json`) to view available components, fonts, and brand logos.
- Filter by type: `npx kewti-cli list --type <components|fonts|logos>`.

## 2. Access Documentation from Kewti Docs
- Access documentation for any component or resource: `npx kewti-cli docs <name>` (or `--json`).
- Inspect component dependencies and snippets: `npx kewti-cli info <name> --json`.
- Complete documentation & LLM indexes:
  - Portal: `https://kewti-docs.vercel.app/docs`
  - LLM Summary: `https://kewti-docs.vercel.app/llms.txt`
  - LLM Full Reference: `https://kewti-docs.vercel.app/llms-full.txt`

## 3. Installation Commands
- Components: `npx kewti-cli add <component-name>`
- Fonts: `npx kewti-cli font <font-name>`
- Logos: `npx kewti-cli logo <logo-name>`

## 4. Conventions
- Components are installed in `src/kewti/ui/<component>/` with barrel `src/kewti/ui/index.ts`.
- Import components via `import { ... } from "@/kewti/ui"`.
- Interactive client components must include `"use client"` at the top.
