const ORIGIN = "https://promedia.report";

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pairedUrl(ukPath) {
  const path = ukPath === "/" ? "" : ukPath;
  const uk = `${ORIGIN}${path}`;
  const en = `${ORIGIN}/en${path}`;
  return `<url>
  <loc>${xmlEscape(uk)}</loc>
  <xhtml:link rel="alternate" hreflang="uk" href="${xmlEscape(uk)}" />
  <xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}" />
  <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(uk)}" />
</url>
<url>
  <loc>${xmlEscape(en)}</loc>
  <xhtml:link rel="alternate" hreflang="uk" href="${xmlEscape(uk)}" />
  <xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(en)}" />
  <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(uk)}" />
</url>`;
}

async function projectPaths() {
  const fallback = [
    "/projects/category/community",
    "/projects/category/consulting",
    "/projects/category/guide",
    "/projects/category/instrument",
    "/projects/category/moderation",
    "/projects/category/research",
    "/projects/category/training",
    "/projects/community-development-guide",
    "/projects/community-development-webinars",
    "/projects/DWAkademie",
    "/projects/expanding-frontline-media-audiences",
    "/projects/fact-checking-for-investigators",
    "/projects/finzvitmedia",
    "/projects/gongadzeprize",
    "/projects/innovative-content",
    "/projects/journalism-program-ranking",
    "/projects/map-of-ukrainian-media-communities",
    "/projects/media-atlas",
    "/projects/summer-basic-video-lab"
  ];

  try {
    const response = await fetch(`${ORIGIN}/projects`, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!response.ok) return fallback;
    const html = await response.text();
    const found = [...html.matchAll(/href=["'](?:https:\/\/promedia\.report)?(\/projects\/(?:category\/)?[^"'?#]+)["']/gi)]
      .map((match) => match[1])
      .filter((path) => /^\/projects\/(?:category\/)?[A-Za-z0-9-]+$/.test(path));
    return [...new Set([...fallback, ...found])].sort();
  } catch {
    return fallback;
  }
}

async function sitemap() {
  const staticPaths = ["/", "/projects", "/contacts", "/privacy-policy"];
  const paths = [...staticPaths, ...await projectPaths()];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${paths.map(pairedUrl).join("\n")}
</urlset>
`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/robots.txt") {
      return new Response(`User-agent: *
Allow: /
Disallow: /admins/

Sitemap: ${ORIGIN}/sitemap.xml
`, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    if (url.pathname === "/sitemap.xml") {
      return new Response(await sitemap(), {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=3600"
        }
      });
    }

    return fetch(request);
  }
};
