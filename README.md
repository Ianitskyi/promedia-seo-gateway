# ProMedia SEO Gateway

Cloudflare Worker that serves the crawl-control files for `promedia.report`:

- `https://promedia.report/robots.txt`
- `https://promedia.report/sitemap.xml`

It also redirects `www.promedia.report/*` to `https://promedia.report/*` with a
301, keeping the path and query string. This needs a proxied (orange-cloud) DNS
record for `www` in the `promedia.report` zone, for example
`CNAME www -> promedia.report`.

The Worker is intentionally limited to those routes. The sitemap includes
Ukrainian and English alternate URLs and collects project URLs from the public
projects page, with a conservative fallback list if the source page is not
available.

Deploy with Wrangler after logging in to the ProMedia Cloudflare account.
