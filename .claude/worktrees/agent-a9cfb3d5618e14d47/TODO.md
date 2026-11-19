# Theme Fix Progress

## Plan Status
- [ ] **Step 1**: Update `src/client/App.tsx` - Move ThemeProvider to absolute root (outside QueryClientProvider/Router)
- [ ] **Step 2**: Update `src/client/components/ThemeProvider.tsx` - Remove useLocation dependency, add initializeTheme() call
- [ ] **Step 3**: Update `src/client/pages/LandingPage.tsx` - Replace inline theme conditionals with Tailwind dark: classes
- [ ] **Step 4**: Run `npm run dev` and test theme toggle on `/` and `/dashboard/team`
- [ ] **Step 5**: Verify fix complete

**Root Cause**: ThemeProvider inside Router + StrictMode double-render = race condition removes 'dark' class
