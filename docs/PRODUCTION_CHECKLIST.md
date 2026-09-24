# Production domain and search setup

The code uses `https://barakaagro.app` as the canonical origin. English, Uzbek, and Russian public pages live at `/en`, `/uz`, and `/ru`. Unprefixed product routes redirect to the preferred language; canonical and hreflang tags point to the prefixed URLs. The server redirects the `www` host and HTTP variants to HTTPS on the apex host, retaining path and query. Dashboard settings and DNS still need to match this code.

## Vercel

1. In the linked `agro` project, open **Settings → Domains**. Add `barakaagro.app` and `www.barakaagro.app`. Make `barakaagro.app` the primary production domain. Confirm both domains show valid certificates and no conflicting platform redirect rules.
2. In **Settings → Environment Variables**, set `NEXT_PUBLIC_SITE_URL=https://barakaagro.app` for Production (and Preview if previews should generate canonical invitation links). Keep the hosted Supabase URL, publishable key, and server-only service key on the intended project. Redeploy after changing `NEXT_PUBLIC_*` variables because they are embedded at build time. Do not expose the service key to the client.
3. Deploy the candidate using the procedure in `docs/DEPLOYMENT.md`. Run `npm run deploy:verify -- --url <candidate-HTTPS-origin>` against it. Verify owner login, authorization, language switching, and Realtime in a browser before promotion. After attaching the custom domain, test all four HTTP/HTTPS + apex/`www` entry points with a path and query string; each should end at the same HTTPS apex URL without a loop.

## Supabase

1. In **Authentication → URL Configuration**, set **Site URL** to `https://barakaagro.app`. Add `https://barakaagro.app/auth/accept` to the allowed redirect URLs. Keep only intentionally used candidate/preview callback URLs; remove the former production callback when no longer needed. The reviewed repository config in `supabase/hosted/supabase/config.toml` reflects the canonical URL but does not change the hosted dashboard by itself.
2. Keep public signup disabled and verify the intended email provider delivers invitations. Test one invitation and account setup through the canonical host. Use the existing trusted owner bootstrap/recovery procedure if needed; the protected initial owner is already bound to its Auth UUID in the selected hosted project. Never grant owner by changing a frontend email list or direct profile writes.
3. If the Vercel site URL changes, repeat owner sign-in and API authorization checks on the final origin.

## Domain and DNS

1. At the DNS provider, add the apex and `www` records **shown by Vercel for this project**. Remove conflicting A/AAAA/CNAME records. Wait for both names to resolve and for Vercel certificate issuance.
2. Check that `http://barakaagro.app`, `http://www.barakaagro.app`, and `https://www.barakaagro.app` preserve a sample path and query while ending at `https://barakaagro.app`.

## Google Search Console

1. Add a **Domain property** for `barakaagro.app` and publish the DNS TXT verification record shown there. This covers the apex, `www`, HTTP, and HTTPS variants.
2. Submit `https://barakaagro.app/sitemap.xml`. Inspect `/en`, `/uz`, and `/ru` with URL Inspection and request indexing after the canonical domain is live. Confirm Google sees the HTTPS apex canonical and the language alternates.
3. Monitor indexing and crawl errors. Search Console submission makes the site discoverable; it does not guarantee ranking or immediate inclusion.
