// [SCOPE 100 / T012] BEGIN — Shared class for rendered bio markdown
// The app's `prose` classes are inert here: @tailwindcss/typography is NOT installed
// and tailwind.config.js has plugins: [], so `prose*` styles nothing. Tailwind v4's
// Preflight then resets <p>/<h*> margins to 0, so marked's paragraphs render with no
// gaps between them — the "missing blank lines between paragraphs" on /bio.
//
// This self-contained set restores the spacing the founder's markdown needs
// (space-y-4 between blocks) plus light heading/list/link/emphasis styling, without
// pulling in the typography plugin. It is applied to BOTH the public page
// (BioPage.tsx) and the SysAdmin editor preview (Bio.tsx) from this one place, so
// preview and publish render identically (FR-005).
export const BIO_MARKDOWN_CLASS = [
  "space-y-4 leading-relaxed",
  "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:text-foreground",
  "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:text-foreground",
  "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:text-foreground",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1",
  "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1",
  "[&_a]:text-blue-600 [&_a:hover]:underline dark:[&_a]:text-blue-300",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic",
].join(" ");
// [SCOPE 100 / T012] END
