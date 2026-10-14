import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import { bio, links, pebbles, sites } from "./src/content.ts";

const origin = "https://mark1russell7.github.io";

// A user site (<user>.github.io) is served from the domain root, so the default base "/" is right.
// On GitHub Pages, the project sites are on the same origin as this site. In development, the proxy gives the same result,
// so the pool can read the documents in its frames.
const proxy: Record<string, ProxyOptions> = Object.fromEntries(sites.map((site) => [site.path, { target: origin, changeOrigin: true, secure: true }]));

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

/**
 * This plugin writes the content of the pool into the HTML for search engines and for readers without JavaScript.
 * It adds structured data, a plain list of the projects in the root element, and a sitemap.
 * The structured data is a profile page about a person, the website, and a list of projects.
 * React replaces the plain list when it starts.
 */
function seo(): Plugin {
  const today = new Date().toISOString().slice(0, 10);
  const person = {
    "@type": "Person",
    "@id": `${origin}/#person`,
    name: "Mark Russell",
    url: `${origin}/`,
    jobTitle: "Software Engineer",
    worksFor: { "@type": "Organization", name: "Tulip" },
    description: "Mark Russell is a software engineer who builds reliability tooling and infrastructure for AI agents.",
    sameAs: [links.linkedin, links.github, links.npm],
    knowsAbout: ["Site reliability engineering", "Observability", "OpenTelemetry", "MongoDB", "Linux TCP", "Model Context Protocol", "TypeScript"],
  };
  const profilePage = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${origin}/#profile`,
    url: `${origin}/`,
    name: "Mark Russell",
    dateModified: today,
    mainEntity: person,
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: "Mark Russell",
    url: `${origin}/`,
    inLanguage: "en",
    author: { "@type": "Person", "@id": `${origin}/#person`, name: "Mark Russell", url: `${origin}/` },
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
          author: { "@type": "Person", "@id": `${origin}/#person`, name: "Mark Russell", url: `${origin}/` },
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
    `</ul><p><a href="${links.linkedin}">LinkedIn</a>, <a href="${links.github}">GitHub</a> and <a href="${links.npm}">npm</a></p>`,
    `</main>`,
  ].join("");
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
        .replace("</head>", `    ${jsonLd(profilePage)}\n    ${jsonLd(website)}\n    ${jsonLd(projectList)}\n  </head>`);
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
