# wxKanban Landing Page — deploy guide

A single self-contained `index.html` — no build step, no framework, no dependencies.
On purpose: the page that preaches "own your stack" is itself fully portable HTML you own.

## Before you publish — replace 3 placeholders

Search `index.html` for these and swap in real URLs (they each appear in a few places):

| Placeholder | Replace with |
|-------------|--------------|
| `APPLY_URL` | your Tally beta-application form URL |
| `LIST_URL`  | your email-list signup URL |
| `HOWTO_URL` | your How-To video series (YouTube channel/playlist) |

Better than `APPLY_URL` linking out: **embed the Tally form** directly in the `#apply`
section (Tally → Share → Embed → paste the snippet where the OPTION 1 comment is).
Keeps applicants on-page = higher conversion.

Also worth adding before launch: a real Open Graph image (`og:image` meta) so the link
shows a nice preview card when you post it in the Facebook group.

## Hosting options (any of these — all let you own it)

**S3 + CloudFront (you're already on AWS):**
1. Create an S3 bucket (e.g. `wxkanban-landing`), upload `index.html`.
2. Put CloudFront in front of it (HTTPS + caching); set default root object to `index.html`.
3. Point a subdomain (e.g. `wxkanban.wxperts.com` or `get.wxperts.com`) at the CloudFront
   distribution via Route 53 / your DNS, with an ACM cert.

**Netlify / Vercel (fastest, free):**
1. Drag the `marketing/site/` folder into Netlify (or `vercel deploy`).
2. Add your custom subdomain in the dashboard; DNS is a single CNAME.

**GitHub Pages:** push `site/` to a repo, enable Pages, add the custom domain.

## Local preview

Just open `index.html` in a browser, or:

```
npx serve marketing/site
```

## Notes

- WINDEV is intentionally ALL-CAPS throughout (Andy's preference).
- Colors live in the `:root` CSS variables at the top of `index.html` — change `--accent`
  to retune the whole page's accent in one place.
- Mobile-responsive; single 760px content column.
