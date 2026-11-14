# ProMedia SEO Gateway

Cloudflare Worker that serves the crawl-control files for `promedia.report`:

- `https://promedia.report/robots.txt`
- `https://promedia.report/sitemap.xml`

The Worker is intentionally limited to those two routes. The sitemap includes
Ukrainian and English alternate URLs and collects project URLs from the public
projects page, with a conservative fallback list if the source page is not
available.

Deploy with Wrangler after logging in to the ProMedia Cloudflare account.
