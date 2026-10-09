import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import { bio, links, pebbles, sites } from "./src/content.ts";

// A user site (<user>.github.io) is served from the domain root, so the default base "/" is right.
// On GitHub Pages, the project sites are on the same origin as this site. In development, the proxy gives the same result,
// so the pool can read the documents in its frames.
const projects = ["vex", "AsyncBrowserContext", "lag", "render", "client", "systems", "page-lifecycle-tracker"];
const proxy: Record<string, ProxyOptions> = Object.fromEntries(
  projects.map((name) => [`/${name}/`, { target: "https://mark1russell7.github.io", changeOrigin: true, secure: true }]),
);

const origin = "https://mark1russell7.github.io";

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

/**
 * This plugin writes the content of the pool into the HTML for search engines and for readers without JavaScript.
 * It adds structured data (a person and a list of projects), a plain list of the projects in the root element, and a sitemap.
 * React replaces the plain list when it starts.
 */
function seo(): Plugin {
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Mark Russell",
    url: `${origin}/`,
    jobTitle: "Software engineer",
    description: bio.lede,
    sameAs: [links.github, links.npm],
    knowsAbout: ["TypeScript", "Programming languages", "Reactive programming", "Web performance", "OpenTelemetry", "Model Context Protocol"],
  };
  const projectList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Projects of Mark Russell",
    itemListElement: [...sites.map((site) => ({ ...site, url: `${origin}${site.path}` })), ...pebbles.map((pebble) => ({ ...pebble, url: pebble.href, repo: pebble.href }))].map(
      (project, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "SoftwareSourceCode",
          name: project.name,
          description: project.blurb,
          url: project.url,
          codeRepository: project.repo,
          programmingLanguage: "TypeScript",
          author: { "@type": "Person", name: "Mark Russell", url: `${origin}/` },
        },
      }),
    ),
  };
  const fallback = [
    `<main class="static">`,
    `<h1>Mark Russell</h1>`,
    `<p><strong>${escape(bio.lede)}</strong></p>`,
    ...bio.body.map((paragraph) => `<p>${escape(paragraph)}</p>`),
    `<h2>Projects</h2><ul>`,
    ...sites.map((site) => `<li><a href="${site.path}">${escape(site.name)}</a>: ${escape(site.blurb)}</li>`),
    `</ul><h2>Smaller repositories</h2><ul>`,
    ...pebbles.map((pebble) => `<li><a href="${pebble.href}">${escape(pebble.name)}</a>: ${escape(pebble.blurb)}</li>`),
    `</ul><p><a href="${links.github}">GitHub</a> and <a href="${links.npm}">npm</a></p>`,
    `</main>`,
  ].join("");
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    `  <url><loc>${origin}/</loc><lastmod>${today}</lastmod></url>`,
    ...sites.map((site) => `  <url><loc>${origin}${site.path}</loc></url>`),
    `</urlset>`,
    ``,
  ].join("\n");
  return {
    name: "portfolio-seo",
    transformIndexHtml(html) {
      return html
        .replace(`<div id="root"></div>`, `<div id="root">${fallback}</div>`)
        .replace("</head>", `    ${jsonLd(person)}\n    ${jsonLd(projectList)}\n  </head>`);
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
    },
  };
}

export default defineConfig({
  plugins: [react(), seo()],
  server: { proxy },
  preview: { proxy },
});
