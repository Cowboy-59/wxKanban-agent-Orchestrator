# Database and hosting recommendation

Present all three deployment models side by side and mark one **★ Recommended**. The table appears in
full in management plan § 7, and is copied into customer document § 7 with the reasons tied to the
customer's own answers.

## Start from what is already decided

1. **`stack.md`.** If the project's declared stack names a database engine, recommend within that
   engine for all three columns. If the evidence argues against it, raise an ADR instead of quietly
   overriding it.
2. **Conversion output.** `rebuild/db/schema.<dialect>.sql` shows which dialect the conversion
   targeted. Recommend that dialect unless an ADR changes it, because changing it means
   re-converting the schema.
3. **Otherwise, PostgreSQL.** It carries no license cost, runs on a Windows or Linux office server and
   as a managed service on every major cloud, and is the default conversion target. That makes it
   the one engine that fits all three columns, which keeps a later move between them cheap.

Name a currently supported major version, not a fixed number. Check the vendor's support policy
when writing the document.

## The comparison table

Adapt the rows to the evidence. Keep the rows, and change the contents.

| | Internal office | Cloud | Distributed |
|---|---|---|---|
| **Fits when** | One main site; data must stay on the premises; reliable local network; in-house IT | Users work from anywhere; no server room; you want backups and failover handled for you | Several sites or regions; sites must keep working offline or over poor links; or users on several continents |
| **Recommended database** | PostgreSQL on a dedicated server or VM | Managed PostgreSQL: Amazon RDS or Aurora PostgreSQL, Azure Database for PostgreSQL Flexible Server, or Google Cloud SQL for PostgreSQL | A central managed PostgreSQL as the system of record, plus one of: regional read replicas (sites always online); a local database per site with a sync layer (sites must work offline); or a distributed PostgreSQL-compatible database such as CockroachDB or YugabyteDB (writes in several regions with strong consistency) |
| **Alternative** | SQL Server Standard, if already licensed and the IT team knows it | The same engine self-run on cloud VMs: more control, more work | Choose between the three patterns in an ADR, and run a proof of concept first |
| **Backup and recovery** | Nightly full backup plus continuous log archiving to off-site storage; restores tested on a schedule | Automated backups with point-in-time recovery, built in; restores still tested | Per-site backups plus central point-in-time recovery; a reconciliation procedure for failed syncs |
| **High availability** | Optional standby server with streaming replication | Multi-zone failover option | Part of the design; more moving parts to test |
| **Who runs it** | Your IT staff | The provider runs the engine; we or your team run the schema and access | Specialist skills needed; highest operational load |
| **Rough cost** | $: hardware and admin time, no license | $$: monthly, grows with size and failover | $$$: several databases plus sync |
| **Watch out for** | One server is a single point of failure without a standby; backups nobody restores; securing remote access | Data-residency rules; data-transfer charges; lock-in through provider-only features | Write conflicts and the rules that resolve them; schema changes rolled out to every site; much harder testing |

Use cost tiers, not prices. Prices change, and a figure in a customer document gets treated as a quote.
Researched prices appear in one place only: the projected SaaS cost document (§ Projected SaaS cost,
below), where each one carries its date and source.

## Picking the recommended column

Apply these in order and stop at the first that fits. Quote the deciding answer in the customer document.

1. Sites must work offline (D3 = yes) → **Distributed**, with the per-site sync pattern.
2. Data must stay on the premises (D5), or there is no dependable internet → **Internal office**.
3. Writes from several regions where latency matters (D2 plus evidence) → **Distributed**, with the
   distributed-database pattern.
4. No in-house IT to run a server (D7) → **Cloud**.
5. Otherwise → **Cloud**. Managed backups and failover are the lowest-risk default for a small team.
   Say that this is the default rule, not a customer requirement.

Then size it from D2, D4, and D6: the instance tier, storage growth, backup retention, and whether
failover is needed to meet the stated recovery targets.

When a projected SaaS cost exists, the Cloud column names the provider of its ★ option, and the
`ADR-` behind the recommendation says so.

## Conversion projects

Add a line on how the legacy data moves: the legacy engine (HFSQL for WinDev, Access/Jet or SQL Server
for VB6, TopSpeed or SQL for Clarion), its path through the migration flow (`flow-diagrams.md` § 6),
and, if the legacy system keeps running during a parallel run, how the two stay in step (management
plan § 4.9).

## Projected SaaS cost (web-based systems)

In both modes, G.O.D. writes `docs/GOD-SaaS-Cost.md` when the system being planned is web-based, or
both web-based and installed. The answer comes from the opening questions
(`review-and-brainstorm.md` § Opening questions), or from interview PD2 (plan mode) or NP5
(new-project mode). An installed-only system gets none. It is a separate, **internal** document,
never customer-facing: the comparison table above and the customer document keep cost tiers, and
the price and margin in it never leave it. The template is `document-templates.md` § 5.

1. **Size it at two points.** **Launch** (for an existing system, go-live of the planned system):
   named and peak users (D2), data today (D4), stored files, and email sent per month if the design
   sends email. **After 12 months**: D4's growth applied. For a commercial system, use the customer
   forecast (PD3 or NP8) times the users per customer. Give each number its source or its `ASSUMP-`
   ID.
2. **List what the design needs.** One line per item the design actually uses, from `stack.md` and
   the design:
   - app hosting for the API and the web front end
   - the database, sized for the D6 recovery target (backups, point-in-time recovery, and a standby
     if D6 needs one)
   - file storage
   - outbound data transfer
   - transactional email
   - domain and TLS certificate
   - logs and monitoring
   - a staging environment

   Leave out what the design does not use. Never add or drop an item to make an option look cheaper.
3. **Rule out what cannot qualify.** Drop a provider or region that fails a hard constraint: data
   residency or compliance (D5, for example no HIPAA business associate agreement or no SOC 2 report
   when one is required), the recovery target (D6), the service level (D8: a provider whose own
   uptime commitment is below it), or a stack component it cannot run. Say why
   each one was dropped.
4. **Research current prices.** Use the web search and fetch tools on each provider's own pricing
   page or calculator.
   - Price at on-demand list prices, in US dollars per month, in the region nearest the users.
   - Leave out free tiers, credits, and promotions. Note a free tier separately when it covers the
     launch point.
   - Record the page and the date checked for every price.
   - Never price from memory. Prices change, and a remembered figure is a guess.

   Start from a broad pool of low-cost hosts and databases, for example Hetzner, OVHcloud,
   DigitalOcean, Vultr, Akamai (Linode), Render, Railway, Fly.io, Neon, Supabase, and Cloudflare. Add
   any others the research turns up. The pool is a starting point, not a fixed list.
5. **Price single providers and mixes.** An option is either one provider for everything or a mix,
   for example the app on one provider and the managed database on another. Keep a mix in one
   region, and add the data transfer between its providers. Run the same sizing through every option.
6. **Keep five, plus AWS.** Keep the five lowest-cost options that qualify, ranked by the total per
   month after 12 months. Always add AWS as the reference option, priced with the AWS services
   closest to the design (for example App Runner or ECS on Fargate, RDS for PostgreSQL, S3, SES, and
   CloudWatch), whether or not it is among the cheapest.
7. **Recommend one.** Mark **★ Recommended**: the lowest-cost option that meets every hard
   constraint and fits who will run it (D7). A self-run server is cheaper on paper, but it moves
   patching, backups, and restores onto the customer's staff. So do not recommend one when D7 says
   nobody will run it. State what the recommendation costs compared with the cheapest option and with
   AWS.
8. **An existing system that is already hosted.** If the user knows today's monthly hosting bill,
   show it as a **Today** column beside the options, so the move can be compared. Ask for it in
   plain chat, or take it from the evidence with its citation. Never guess it.
9. **Price and margin (commercial only).** Take the planned price per customer per month (PD4 or
   NP9), per plan if there are several. For the ★ option and for AWS, at launch and after 12 months,
   show: the cost per paying customer, the price, the margin per customer (price minus cost), and
   the margin as a percentage of the price. Then the break-even point: how many paying customers
   cover the monthly total, rounded up, and labeled approximate, because the total grows with the
   customers. With no planned price, show the break-even price (the cost per paying customer) and
   say no price was given. Never invent or suggest a price as if the user had chosen it.
10. **No web access, no prices.** The run may have no web search or fetch tool, or a pricing page may
   not load. Then still write the sizing and the item list, mark each missing price "not researched"
   with the reason, record an `ASSUMP-`, and tell the user. Never fill a gap from memory.

On a re-run, check every price again and update the date. Re-research when the sizing, the stack,
the commercial or delivery answer, or D5 to D7 changes.
