# Beta Application — Tally Build Sheet

Build at tally.so (free tier is fine). Each question below maps to a Tally block type.
Turn ON: **email notifications to you** (Settings → Notifications) and a
**respondent confirmation email** (Settings → Emails) using the auto-reply copy at the
bottom. Set the form to redirect to a simple "thanks" message after submit.

**Form title:** Apply to convert your WINDEV app — 5 beta spots
**Intro text (Tally "Text" block at top):**
> wxKanban releases at the end of June. I'm taking just 5 beta testers and working
> hands-on with each of you to convert your own WINDEV application to AI-built,
> full-stack software you own. I read every application personally. ~5 minutes.

---

## Questions (block type → settings)

| # | Question | Tally block | Required | Options / notes |
|---|----------|-------------|----------|-----------------|
| 1 | Full name | Short answer | Yes | |
| 2 | Email | Email | Yes | drives the confirmation auto-reply |
| 3 | Country / time zone | Short answer | Yes | |
| 4 | Primary language | Dropdown | Yes | English, French, Italian, Spanish, Portuguese, German, Other |
| 5 | Comfort working in English for live sessions | Multiple choice | Yes | Fluent · Workable (screen-share is fine) · I'd need some help |
| 6 | What does your WINDEV app do, and who uses it? | Long answer | Yes | |
| 7a | App size — screens / windows | Multiple choice | Yes | 1–10 · 10–50 · 50+ |
| 7b | App size — global procedures | Multiple choice | Yes | A few · Dozens · Many |
| 7c | Which WINDEV version is it built in? | Short answer | Yes | e.g. WINDEV 28, 2024,2025 or an older version — affects the conversion path |
| 8 | Which database does it use? | Multiple choice | Yes | HFSQL Classic · HFSQL Client/Server · Other |
| 8b | (If Other) which database? | Short answer | No | use Tally **logic jump**: show only if Q8 = Other |
| 9 | Is it live in production today? | Multiple choice | Yes | Yes — real users · Internal only · Prototype / not yet live |
| 10 | Full access to source code **and** data? | Multiple choice | Yes | Yes, both · Partial · No |
| 11 | Years developing in WINDEV / proprietary platforms | Short answer | Yes | |
| 12 | Why now? What's pushing you toward AI development? | Long answer | Yes | **the most important answer** |
| 13 | Target database you want to land on | Multiple choice | Yes | PostgreSQL · MS SQL · MySQL · Not sure yet |
| 13b | Any stack / framework preference? | Short answer | No | |
| 14 | Can you commit real time each week through June? | Multiple choice | Yes | Yes · Maybe · Not sure yet |
| 15 | Open to your conversion as a case study / testimonial? | Multiple choice | Yes | Yes · Anonymized only · No |
| 16 | Anything else I should know? | Long answer | No | |

**Tally tips:**
- Use **logic jump** only for 8b (show if Q8 = "Other"). Everything else is linear.
- Drag questions into **page breaks** matching the 4 sections (Who you are / Your application / You and the move / Commitment) so it feels short.
- The **dropdown** for language keeps the list clean and gives you the free language-segmented list later.

---

## Confirmation auto-reply (Tally → Settings → Emails → respondent email)

**Subject:** Got your wxKanban beta application

> Thanks for applying to the wxKanban beta.
>
> I personally read every application. There are only 5 spots, and I'm choosing the
> developers I can do the most for — so if you're a fit, I'll be in touch within a few days
> to set up a first conversation.
>
> In the meantime, the How-To series is rolling out all the way to launch at the end of
> June — watch how a WINDEV app crosses over to AI-built full-stack, step by step:
> [link]
>
> Talk soon,
> Andy "Cowboy" Stapleton
> founder, wxperts
