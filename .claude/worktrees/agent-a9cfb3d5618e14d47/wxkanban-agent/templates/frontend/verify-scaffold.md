# Verify your frontend scaffold

After running `wxkanban-agent scaffold:frontend` and `npm install`, drop this
file's snippet into a Vite project to confirm the scaffold compiles and
renders. If your project already uses Vitest, the kit will run a smoke test
automatically — use this only as a manual fallback.

## Step 1 — Wire the ThemeProvider into your app root

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./components/theme-provider";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="wxkanban-ui-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
```

## Step 2 — Use a few primitives in App.tsx

```tsx
// src/App.tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ModeToggle } from "@/components/mode-toggle";
import { ResourceCalendar } from "@/components/ui/resource-calendar";

export default function App() {
  const resources = [
    { id: "r1", title: "Alice" },
    { id: "r2", title: "Bob" },
  ];
  const events = [
    {
      id: "e1",
      resourceId: "r1",
      title: "Kickoff",
      start: new Date(),
      end: new Date(Date.now() + 60 * 60 * 1000),
    },
  ];

  return (
    <div className="min-h-screen p-8 space-y-4 bg-background text-foreground">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scaffold smoke test</h1>
        <ModeToggle />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>It works</CardTitle>
        </CardHeader>
        <CardContent>
          <Button>Click me</Button>
        </CardContent>
      </Card>
      <ResourceCalendar resources={resources} events={events} />
    </div>
  );
}
```

## Step 3 — Run it

```bash
npm run dev
```

You should see:

- A page that respects light/dark mode via the toggle in the top-right.
- A card with a working Button.
- A week-view resource calendar with rows for Alice and Bob and an event on
  Alice's row.

If any of those don't render, check:

- `tailwind.config.ts` `content` paths match your project layout.
- `src/styles/globals.css` is imported in `main.tsx`.
- `tsconfig.json` has the `@/*` path alias (`"paths": { "@/*": ["./src/*"] }`).
- Vite is configured with the same `@` alias (typically via `vite-tsconfig-paths`
  or an explicit `resolve.alias`).
