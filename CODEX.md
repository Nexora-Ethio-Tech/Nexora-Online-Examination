# Kewti – OpenAI Codex Guidelines

When generating code for Kewti, use `kewti-cli` and official documentation from Kewti Docs:

## 1. CLI Discovery
```bash
# List all available components, fonts, and logos
npx kewti-cli list --json
```

## 2. Access Documentation from Kewti Docs
```bash
# Read documentation for a component
npx kewti-cli docs <name>
npx kewti-cli docs <name> --json

# Inspect component details and code snippet
npx kewti-cli info <name> --json

# Official docs: https://kewti-docs.vercel.app/docs (/llms.txt)
```

## 3. Installation
```bash
npx kewti-cli add <component>
npx kewti-cli font <font>
npx kewti-cli logo <logo>
```

## 4. Import Conventions
```tsx
import { KewtiCalendar, KewtiDatePicker, KewtiTime, KewtiInput, KewtiNumerals, KewtiLocationSelector, KewtiLogo, KewtiGursha } from "@/kewti/ui";
```
Always ensure interactive React components include `"use client"`.
