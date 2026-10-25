# Resume builder

Build a resume once, then make a copy for every job with the same design. There is no limit on copies.

## Flow

1. **Start:** *Resume builder → New from profile* uses your profile plus your confirmed CV facts. *Import a CV* has an AI
   copy an uploaded CV word for word into the builder (`resume_draft_import` task). *Blank* starts empty.
2. **Edit:** Content (header, sections, entries, bullets) and Design (template, accent colour, text size, margins, page
   size, icons, footer) are edited side by side with a live A4 preview. Changes autosave. A save over newer changes from
   another tab gets a 409 instead of overwriting them.
3. **Copy for a job:** use *Copy for a job* in the editor, or *Tailor* on an application or job-lead page. The copy is linked
   to that job. Optionally the `resume_tailoring` task rewords and reorders the copy for the job description. The rules
   are enforced in code, not only in the prompt: a reworded bullet or summary that contains a number not already in your
   resume is rejected, skills can only be reordered, and the master resume is never changed.
4. **Publish:** renders the PDF and saves it as a new CV version in *Profile & CVs*, with its facts already confirmed. A
   copy linked to an application becomes that application's CV. A copy linked to a job lead becomes the lead's CV, and its
   apply kit is rebuilt, so Auto Apply uploads that exact file.

Files (uploads and published PDFs) go to MinIO when `S3_ENDPOINT` is set, otherwise to `UPLOAD_DIR`.

## How the PDF is made

The editor preview and the PDF use one React component, `apps/web/src/components/resume/resume-pages.tsx`. The API's
headless Chromium (`builder/pdf.ts`):

1. opens the web app's `/print/resume` page with the resume injected before load (the page fetches nothing and needs no
   session);
2. waits for `RENDER_DONE`;
3. calls `page.pdf()`.

The page may only reach the web app's own origin. Links and image URLs inside a resume can never make the server fetch
anything else.

## The "Classic Serif" theme = your CV design

The single-column renderer reproduces the reference CV exactly. These match it, rather than being approximations:

- **DOM and styles:** the same element structure and inline styles.
- **Spacing tables:** line height and the entry, heading and section-bottom spacing factors.
- **Formulas:** `lineHeightPx = round(lh × pt × 4/3)`; the name and headline line heights; page padding (margin − 2px top,
  margin − entry spacing bottom); section spacer; heading margin; header bottom padding; list spacing.
- **Entry header:** the auto split between title and date (natural-width measurement, 4-decimal rounding, 55% cap), the
  "try same line" rule for employer and school, and per-word inline-block spans.
- **Bullets:** a 4px dot in a 0.9em box, a per-font nudge, and a hidden 1px "•" for ATS parsers.
- **Pagination:** one block per bullet, empty continuation headers carrying the title-size delta (which produces the
  reference's ±1px rounding), a heading always kept with the next block, and no section spacer at the top of a page.
- **Footer:** 90% size at 60% opacity.

The settings that reproduce the reference CV, found by rendering and diffing against the
PDF:

- font Source Serif Pro; base 11.5pt; name 22.5pt; headline 15pt; headings 14pt; entry titles 11.75pt
- line height 1.2, spacing step 1, margins 14mm
- simple headings with outline icons; header aligned left with vertical-bar separators
- full-width entries with date and location on the right, auto split, indented body
- skills as spacious rows with a dash separator; certificates in one column; footer with name, email and page numbers

**Verification** (scripts in the session scratchpad, not committed). The reference PDF and ours are compared line by line
through their text layers and pixel by pixel after rasterizing:

- All 95 lines wrap identically, and the page break falls on the same bullet.
- Every text run has the same x position to 0.00px.
- Every icon and bullet lands on the same pixel.
- **Open:** on macOS every glyph baseline is drawn 1px lower than in the reference. The boxes are identical, so this comes
  from the font engine (CoreText vs FreeType), and the reference was rendered on Linux. Production PDFs come from the Linux `api`
  container. Still to do: print a PDF there and run the same comparison.

### Heading icons

The reference CV's heading icons are FontAwesome Pro artwork, so they are **not** in this repository. When you import a PDF CV, the
importer (`builder/icons.ts`) lifts the icon vectors out of *your* PDF and stores them in that resume's design, in your
database. Copies inherit them. Without imported icons, Lucide icons are used.
