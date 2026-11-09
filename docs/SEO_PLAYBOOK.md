# EduIgnite SEO playbook

This describes the technical and content SEO in the codebase and what the owner must do outside it. It does not and cannot promise rankings.

## Positioning

One message everywhere: EduIgnite is an all-in-one school management system for nursery, primary and secondary schools in Cameroon, in English and French. Higher education is described only as "coming soon". Source of truth for shared copy: `apps/website/src/lib/marketing-content.ts` (title, description, feature groups, FAQ) and `SITE` in `lib/public-site.ts`.

Device and offline claims are limited to what is implemented: any modern browser on phone, tablet and computer; installable web app; Android app; Windows desktop app; no iOS/Mac app. Offline: pages already opened stay available, and writes made offline (marks, attendance, other records) are queued and replayed on reconnect. Sign-in, OTP, mobile money (Fapshi), AI tools and file uploads are never queued and need a connection (`lib/api/client.ts`, `public/sw.js`). The offline-first Windows edition is described as "being prepared" because it is withheld on the download page.

## What the code does

- Metadata: `app/layout.tsx` (default title, description, keywords, OG/Twitter, `metadataBase`); every public page uses `pageMetadata()` in `lib/seo.ts` for its own title, description, canonical and OG card.
- Pages and targets:
  - `/` all-in-one school management system
  - `/features` school management software features, FAQ
  - `/primary-schools` nursery and primary school management software
  - `/secondary-schools` secondary school management system
  - `/school-websites` school website builder, online admissions
  - `/schools` school directory (filter links `?level=` and `?region=`, paginated `?page=`, search `?q=` is noindex)
  - `/school-management-system-cameroon` (EN) and `/logiciel-de-gestion-scolaire-cameroun` (FR), linked with hreflang
- Structured data: Organization, WebSite (SearchAction to `/schools?q=`), SoftwareApplication (no price, no rating), WebPage and BreadcrumbList, FAQPage (only for questions visible on the page), ItemList on the directory, School JSON-LD on each school site (address, logo, `sameAs` from the school's own links).
- School sites: title `<School> - <level> school in <city>, Cameroon | EduIgnite` unless the school wrote its own SEO title; description from the school's own text; canonical and hreflang when the school wrote both languages; unpublished and preview sites are `noindex`.
- `sitemap.ts` lists the marketing pages, directory, published school sites (with `lastModified` from the API), blog, courses, gallery. `robots.ts` blocks `/dashboard`, `/api`, `/verify` and private areas.
- Backend: `GET /api/v1/schools/public/?detail=1` (additive) returns name, place, region, logo and levels for published schools only, with `q`, `region`, `level`, `limit`, `offset` and `X-Total-Count`. The profile endpoint also returns `levels`.

Language URLs: the marketing site is English with one French landing page; each school site serves `?lang=en|fr`. A full French copy of every marketing page is not built yet.

## After deploy

1. Open `https://eduignite.online/sitemap.xml` and `/robots.txt` and check they load.
2. Google Search Console: add the domain property (DNS TXT verification; the HTML tag already on the site also works for the URL-prefix property), submit `https://eduignite.online/sitemap.xml`, then use URL Inspection on `/`, `/features`, `/schools` and request indexing.
3. Bing Webmaster Tools: import the site from Search Console, submit the same sitemap.
4. Validate structured data with Google's Rich Results Test on `/`, `/features`, `/schools` and one school page.
5. Check Core Web Vitals in Search Console after about four weeks of traffic.

## How rankings work (honestly)

Search engines decide ranking from relevance, content quality, backlinks, site speed and user behaviour. Good markup makes pages eligible and understandable; it does not buy position. Competitive phrases such as "school management system" take months of consistent content and external links, and results vary by country and language. Local phrases ("school management software Cameroon", "logiciel de gestion scolaire Cameroun") are more realistic first targets.

## Owner actions outside the code

- Verify the domain in Search Console and Bing; submit the sitemap.
- Create a Google Business Profile for EduIgnite (Bamenda) if there is a public office; encourage schools to claim theirs and link to their EduIgnite page.
- Get real backlinks: partner schools linking to their EduIgnite site, education directories and news coverage, partner programme referrers, LinkedIn, Facebook and YouTube profiles with the same name and link back to the site.
- Ask every school to publish its website, fill in description, city, region, logo and photos: complete pages rank and convert better.
- Add real customer stories to `/testimonials` only with permission.

## Content cadence

- Blog: two posts a month in English and French, each answering a real question (how to compute a sequence average, how to run admissions, how to collect fees) and linking to the relevant feature page.
- Review `/features` and the FAQ whenever a feature ships or changes; remove claims that stop being true.
- Add French versions of the feature pages when there is time to translate them properly.
