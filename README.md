# ABDELRAHMAN Portfolio

## Phase 02 correction pass

Use the local review setup below. The left Hero star loops whenever it is visible and motion is enabled. The showreel and the Home and Work reels now play in their original frames. The compact Timeline supports scrubbing and horizontal scrolling on narrow screens. The marquee scrolls continuously while visible, shows its motion control on keyboard focus, and displays static terms with Reduced Motion enabled.

Public destinations are set in `src/domain/contact.ts`. The Contact form opens a prefilled WhatsApp draft after validation. The visitor reviews and sends it in WhatsApp. The corrected browser captures are in `../phase-02-correction-preview/`. The original Phase 02 verification record below describes the earlier review build.

## Phase 02 · Local review

From `app/`, use Node.js 22.18+ and run the following in PowerShell.

```powershell
npm.cmd ci
$env:ABDEL_LOCAL_REVIEW = '1'
npm.cmd run dev
```

Open [Home](http://127.0.0.1:3000), [Work · Reels](http://127.0.0.1:3000/work?format=reels), or [Work · Long-form](http://127.0.0.1:3000/work?format=long-form). To preview the production build, clear `ABDEL_LOCAL_REVIEW`, then run `npm.cmd run build` and `npm.cmd start`. Stop the local server with Ctrl+C.

The review server binds to loopback. Under `next dev` with `ABDEL_LOCAL_REVIEW=1`, it can serve the four allowlisted review reels and their posters from `../handoff/assets/`. Production always returns 404 for the review route. Review fixtures and placeholder feedback stay local. Keep `handoff/` beside `app/` for review and archive verification.

### Phase 04A · Production assets

The 13 decorative handoff assets in `public/visuals/` have unverified publication rights. Keep this build local and block release until the rights are verified. Their original bytes are copied for Hero, Timeline, About, and Contact. The foundation test lists the exact source mapping and verifies each local copy against its checksum. The Showreel and its poster remain in `public/videos/`. Production uses Supabase and Cloudinary for published editorial media.

Run `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd test`, `npm.cmd run test:smoke`, `npm.cmd run test:auth`, `npm.cmd run test:browser`, and `npm.cmd run test:engines` from `app/`. The review browser suite starts a development server. The smoke, auth and engine suites run the production build.

### Search indexing

Public pages stay out of search results by default. Once the decorative asset rights are verified and the production origin is confirmed, set `NEXT_PUBLIC_SITE_URL` to the actual HTTPS origin and `PORTFOLIO_INDEXING_ENABLED=1` in the production environment. Verify `/robots.txt`, `/sitemap.xml`, and the canonical tags on Home, Work and a published case study. Keep indexing disabled for local and preview environments.

| Changed files | Scope |
|---|---|
| `src/app/layout.tsx`, `page.tsx`, `work/page.tsx`, `work/error.tsx` | Home and Work, URL-driven catalog controls and shared Player context |
| `src/components/` | Canvas refraction for a single nav lens, brand smear, Hero, reel rail, Player, Timeline, Marquee, editorial sections and proof interactions |
| `src/styles/base.css`, `site.css`, `editorial.css`, `responsive.css` | Responsive layouts using the existing design tokens and font files |
| `src/domain/display.ts`, `editorial.ts`, `reels.ts`, `src/server/review.ts`, `src/app/api/review/[asset]/route.ts` | Typed presentation data and loopback-only review media |
| `next.config.ts`, `package.json`, `package-lock.json`, `tests/` | Local Next.js configuration, Playwright Core and verification commands |

| Command | Result |
|---|---|
| `npm run typecheck` and `npm run build` | Passed on Windows with Node.js 22.18.0, Next.js 16.4.6, and TypeScript 6.0.3. |
| `npm run dev -- --port 0` | Loopback review returned 200 for both pages and 206 for a showreel byte range. |
| `npm test` and `npm run test:smoke` | 5 asset/domain tests and 1 HTTP smoke test passed. The full handoff ledger still verifies. |
| `npm run test:browser` | 14 checks passed in Edge Chromium 157. Home and Work at 1440, 1024, 768, 720, 390 and 320 CSS px, with 720×450 as the reflow equivalent of 1440×900 at 200%. Covered pointer/keyboard/touch navigation, native menu with JS off, URL filters, real media and range requests, reduced motion and Save-Data, the Timeline, FAQ, proof fixture, and local Contact validation. |
| `npm run test:engines` | 3 checks passed. Chromium 157, Firefox 159 and Playwright WebKit 27.2 each decoded five Contact star frames. No dark seam was detected by the edge pixel comparison. The lowest measured contrast for the intro copy was 4.71:1. All three showed a static mobile poster. |
| `npm run capture` | 7 Edge screenshots in `../phase-02-preview/`. Captured 1440/390/320 Home, 1440/390 Work, the Long-form empty state and the 320×480 portrait Player. Screenshots use the actual supplied posters to keep the comparison stable. |

To repeat the browser checks, build first. Edge is required for `test:browser` and `capture`. Run `npm exec -- playwright-core install firefox webkit` before `test:engines`. The 390 px local Home loaded about 147 KiB of encoded JavaScript in one unthrottled Edge run with reduced motion. Staging performance measurements are pending.

Compared Home against the full approved boards, Work against A02/Delivery A, and the Player against the approved control geometry. Corrected the Hero heading width and matte seams, the rail and Timeline spacing, the mobile Footer alignment, and the downward smear. The Home screenshots match the full board heights of 6536 and 7029 px. The approved final patches account for the added stars and nav treatment. The illustrative Timeline keeps consistent 24-second timing on both sizes.

Long-form shows an honest empty state because the handoff supplies no approved Long-form project. The four reels, proof examples, and six provisional FAQ answers are available in local review. The proof viewer uses a placeholder and the audio control plays a synthetic tone. Client permissions, redacted screenshots, actual voice notes and transcripts, social URLs, privacy copy, and the WhatsApp destination are pending. The Contact form checks inputs locally and reports validation without storing the details or launching WhatsApp. Release rights for the showreel, reel footage, music and décor remain pending. Caption tracks, external playback and optional case studies have no approved input to exercise. Cursor pagination is wired for additional catalog entries. The four supplied entries fit on one page.

## Phase 01 · Foundation record

## Local setup

Run from `app/` with Node.js 22.18+ and npm. On Windows PowerShell, use `npm.cmd` if the script execution policy blocks `npm`.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. The foundation serves Home and Work on the loopback interface. Work accepts both approved format URLs as route smoke targets. The application runs with zero configuration. The names-only `.env.example` reserves the common configuration keys for later integration. `NEXT_PUBLIC_*` is limited to public identifiers. Provider credentials, signing keys, contact destinations and server settings belong to the server environment.

## Structure and design

- `src/app/` contains the Next.js App Router layout and two minimal route shells. The checked build prerenders both. The same app can add SSR and server route handlers as the published data and owner flows come online.
- `src/styles/tokens.css` mirrors the approved color, font, sizing, ratio and motion values. Review widths are 1440, 390 and 320 px, with the compact layout target at 767 px and below. The reduced-motion contract remains snap selection, static optics and décor, and explicit playback.
- `src/styles/base.css` loads the supplied local font files. Archivo Black 1.006 uses weight 400. Geist 1.800 and Geist Mono 1.701 use their variable 100–900 ranges.
- `src/domain/` declares the published repository/read models, media IDs, CMS and inquiry contracts. Published projections carry opaque media IDs. Provider credentials, storage keys, private evidence and lead data stay outside those projections.
- `tests/` holds the local-only fixtures and built-server smoke test. No fixture is wired into the app routes. The archive audit expects the original `../handoff/` beside the app.

English/LTR is the document default, based on the approved English navigation and copy. Editable Arabic text carries its own locale and uses `lang="ar"` and `dir="rtl"` at the content boundary. The three original fonts lack Arabic glyphs, so Arabic text falls back to the system stack. Keep English fragments isolated with `bdi` and the timecode and Player ruler LTR. Arabic rendering across browsers belongs to the later UI checks.

The Home boards at 1440 and 390 px and the final four patches control Phase 02 geometry. The review covered the 49 PDF board pages for Work, Player, Admin and related states, the approved UI stills and the annotated patch stills. The one traveling right-hand lens, white brand with downward smear, two asymmetric Hero edge stars and left Contact star remain the approved overrides. The six-track Timeline remains independent of the native-ratio Player, and About retains the disk motion requirement. See the final handoff placement and motion map for slots, stacking, fallbacks and limits.

## Asset audit

Verified all 59 manifest entries by relative path, byte count and SHA-256. Verified all 76 archive ledger entries, with 77 files including the ledger. Checked the three font files' embedded OFL notices against their bundled license texts. The only runtime assets copied to `public/fonts/` are the three fonts and two copyright/license notices, byte-identical to the manifest.

| Manifest classification | Count | Phase 01 disposition |
|---|---:|---|
| SIL OFL 1.1 with notices | 5 | Imported unchanged |
| Project artwork | 2 | Footer smear references retained in the handoff |
| Owner confirmation required | 12 | Showreel, review reels and corresponding stills retained in the handoff |
| Rights unverified, private reference | 13 | Decorative media, stills and icons retained in the handoff |
| Reference only | 27 | Boards, optical study, compiled references and submitted patch retained in the handoff |

## Free-first architecture

Reviewed provider documentation on 2026-11-12. The working baseline is one local Node.js/Next.js application. Supabase Auth, Postgres with RLS and private Storage are the integration candidate for Phase 03, with a local stack first. Keep upload admission, verification and delivery behind server-side adapters so the host and storage can be chosen independently. Use separate projects for staging and live if cloud use is later approved.

- **Supabase Free.** 500 MB database per project, 1 GB object storage, 50,000 monthly active users, 5 GB cached and 5 GB uncached egress in separate quotas, and a 50 MB per-object upload limit. Two active free projects are available. Low activity over seven days can pause projects. Automatic backups, point-in-time recovery and a Supabase custom domain are outside Free. TOTP MFA is documented and exact project regions can be selected, including Frankfurt. Confirm actual region and backup/restore for the intended environment. The terms describe internal business use by authorized users. Confirm the exact intended public signed-media delivery and visitor access under the applicable order and terms before relying on the hosted plan. [Pricing](https://supabase.com/pricing) · [Billing](https://supabase.com/docs/guides/platform/billing-on-supabase) · [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress) · [MFA](https://supabase.com/docs/guides/auth/auth-mfa) · [Regions](https://supabase.com/docs/guides/platform/regions) · [Terms](https://supabase.com/terms)
- **Upload and delivery fit.** Supabase documents direct TUS uploads with an exact-path signed token and a two-hour token lifetime. For Free, lower the handoff's suggested 250 MiB video admission ceiling to the provider's 50 MB maximum or the lower configured bucket limit. Verify the exact byte boundary. Confirm session expiry and quota reservation behavior separately from the token lifetime. Signed download is documented. Seek via HTTP 206, proof access, expiration and revocation still need live integration tests. Supabase Edge Functions Free has a 150 s wall limit and 2 s CPU per request, so video processing needs a separate bounded job runtime if required. [File limits](https://supabase.com/docs/guides/storage/uploads/file-limits) · [TUS](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) · [Signed upload](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) · [Downloads](https://supabase.com/docs/guides/storage/serving/downloads) · [Function limits](https://supabase.com/docs/guides/functions/limits)
- **Hosting candidate.** Cloudflare Workers Free is a candidate for the app shell. The self-serve terms cover entities and Free Services with no Vercel-style noncommercial restriction identified for this shell. The application-services terms restrict serving video via the free CDN, so the candidate assumes media delivery directly from authorized storage. Free provides 100,000 requests/day, 10 ms CPU/request and 128 MB memory. A custom domain requires an existing Cloudflare zone. Cloudflare documents App Router/SSR support via OpenNext and now recommends evaluating vinext for new Workers projects. Select a host after confirming the adapter with this Next.js version, actual SSR/auth CPU usage, terms for the final topology and domain ownership. Vercel Hobby terms limit use to personal or noncommercial purposes. The project has no host-specific dependencies. [Cloudflare agreement](https://www.cloudflare.com/terms/) · [CDN terms](https://www.cloudflare.com/service-specific-terms-application-services/) · [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Domains](https://developers.cloudflare.com/workers/configuration/routing/) · [Adapter](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/) · [Vercel terms](https://vercel.com/legal/terms)

The supplied showreel and four review encodes total 31,266,977 bytes before originals, posters, additional variants or retained releases. As a sizing example, an 8 MB average delivery uses 5 GB in about 625 fully uncached plays before traffic for anything else. A live budget depends on actual approved encodes and measured cache mix. The accepted ceiling for this phase is zero paid spend.

## Verification

Windows, Node.js 22.18.0, npm 10.9.3, Next.js 16.4.6, React 19.3.1, TypeScript 6.0.3.

| Command | Observed result |
|---|---|
| `npm ci --no-fund` | Exit 0. Clean install from the lockfile, 29 packages added. |
| `npm ls --depth=0` | Exit 0. All declared top-level dependencies resolved. npm also listed two optional sharp WASM-related packages as extraneous. |
| `npm audit --audit-level=low` | Exit 0. Zero known vulnerabilities reported by npm at check time. |
| `npm run typecheck` | Exit 0. App Router type generation and TypeScript passed. |
| `npm run build` | Exit 0. Production-mode compilation, typecheck and prerender passed. |
| `npm test` | 4 passed. Archive, font allowlist, locale and local fixtures. |
| `npm run test:smoke` | 1 passed against the built application. HTTP 200 for Home, Work and both query URLs, byte-identical fonts/notices, HTTP 404 for reserved routes and sampled reference/uncleared-media paths. |

A targeted search of the built client and server route output found none of the sampled fixture slug and reference filenames.

Phase 01 local verification passed. Release inputs still open include media, soundtrack and client permissions, approved contact and legal data, the host and environment, storage and egress sizing, and real signed delivery, MFA, restore and browser acceptance evidence. Public UI, CMS, backend provisioning and release work remain gated on the later phases.
