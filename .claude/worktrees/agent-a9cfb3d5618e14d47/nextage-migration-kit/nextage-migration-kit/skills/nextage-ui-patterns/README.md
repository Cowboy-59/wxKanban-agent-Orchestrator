# NextAge UI Patterns

Quick reference for NextAge Design System. All patterns use composite CSS utility classes that auto-switch between light and dark mode. No inline `dark:` overrides needed.

## Pattern Reference

Everything is in `SKILL.md`:
- Glass hierarchy (`glass-section` → `glass-inset` → `glass-card` → `glass-dropdown`)
- Button system (`glass-action glass-action-{color}`)
- Table action icon buttons (`variant="ghost"` + status hover)
- Standard modal pattern (header/body/footer with `nextage-card-gradient`)
- Status tokens (`text-status-{color}`, `bg-status-{color}-bg`, `border-status-{color}-border`)
- Form inputs (`variant="nextage"`, `NEXTAGE_INPUT_CLASS`)

## Key Files in Your Project

| File | What |
|------|------|
| Your main CSS file (index.css / globals.css) | All glass/status CSS classes defined here |
| `components/ui/button.tsx` | Button variants |
| `components/ui/input.tsx` | Input with `nextage` variant |
| `components/ui/ConfirmationDialog.tsx` | Standard destructive action dialog (if present) |
