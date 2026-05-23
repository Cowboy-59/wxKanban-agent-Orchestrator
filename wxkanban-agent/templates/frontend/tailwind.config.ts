import type { Config } from "tailwindcss";

// [SCOPE 036 / T006] BEGIN — tailwind.config.ts — Tailwind v4 consumer default
const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
// [SCOPE 036 / T006] END
