# Design code data schema (draft for review)

A schema for storing council design codes in the prototype, so that other councils can be added in the same shape as East Riding.

Drafted from the *East Riding Design Code* (Version 2a, September 2025): `app/data/sources/East Riding Full Design Code - April 2025.pdf`. Chapter 3 has been extracted into `app/data/design-codes/east-riding.json`, and `scripts/validate-data.js` checks it against this schema. Examples marked *illustrative* only show what a field holds.

## Conventions

These follow planning.data.gov.uk:

- **Field names** are kebab-case, for example `adopted-date`.
- **Every record** has a `reference`, which is unique within its record type and stable over time. Records link to each other by reference, using a field named after the record type, for example `design-code-section: 3.3`.
- **Several values** in one field are separated by semicolons, for example `place-types: town-centre;village`. (In JSON files these become arrays.)
- **Dates** use `YYYY-MM-DD`. Where the source only gives a month, use `YYYY-MM`.
- **Organisations and geographies** use planning.data.gov.uk CURIEs, for example `statistical-geography:E06000011`.
- **Every record** also has the standard `entry-date`, `start-date` and `end-date` fields. They are left out of the tables below to keep them short.
- **Long text fields** may use simple Markdown for bullet lists and line breaks, because codes and guidance often contain lists.
- **Wording is copied exactly as printed**, including the source's own spelling mistakes. Anything we infer or want to flag goes in `extraction-notes`, never in the content fields.
- **Page numbers** are printed page numbers. A record that runs over two pages has `page-number` for the first and `end-page-number` for the last.

planning.data.gov.uk already lists datasets called *design code*, *design code area*, *design code rule*, *design code rule category*, *design code section*, *design code status* and others. **Before this is finalised, the field names should be checked against their specification** and reused wherever they match.

## Record types

| Record type | What it holds | East Riding count |
|---|---|---|
| `design-code` | One design code document and its metadata | 1 |
| `design-code-version` | Each published version of a design code | 2 |
| `design-code-chapter` | Numbered chapters | 9 |
| `design-code-section` | Numbered sections within chapters | 54 |
| `design-value` | Vision values used as each chapter's "key values" | 5 |
| `place-type` | Place types, their visions and the national area types they match | 7 |
| `development-type` | Development scales and types from Table 1 | 10 |
| `design-code-rule` | Individual codes (C1–C75) and key guidance (G1–G37) | 112 |
| `design-code-table` | Numbered tables, stored as columns and rows | 20 (Appendix C) |
| `design-code-parameter` | Values from those tables, broken down by place type | to be counted |
| `design-code-figure` | Numbered figures: caption, callout labels and page | 73 (Appendix C) |
| `design-code-note` | "NOTE" boxes | to be counted |
| `design-code-definition` | "DEFINITION:" boxes, such as the NPPF definition in 3.1 | to be counted |
| `glossary-term` | Terms from the glossary (Appendix A) that the content links to | to be counted |
| `local-plan-policy` | Local plan policies and criteria that rules link to | to be counted |
| `supporting-document` | Documents from the reference list (Appendix B) | about 40 |

Place types, development types, design values and glossary terms are stored **per design code**, because each council defines its own. Their references are prefixed by the design code when stored, for example `east-riding-design-code:town-centre`, but are written without the prefix below for readability.

## Shared shapes

Some fields hold small objects rather than references, so the printed wording is kept next to the link.

**Document mention**, used in `supporting-documents` on sections and rules:

| Field | Required | Description | Example |
|---|---|---|---|
| `supporting-document` | Yes | Supporting document reference | `the-suds-manual` |
| `listed-as` | Yes | The wording on the page, which is often shorter than the Appendix B title | The SuDS Manual |

**Link**, used in `links` for hyperlinks in the text that go outside the document:

| Field | Required | Description | Example |
|---|---|---|---|
| `text` | Yes | The linked words, as printed | TDAG guidance on street trees |
| `url` | Yes | Where the link goes | `https://www.tdag.org.uk/trees-in-hard-landscapes.html` |
| `supporting-document` | No | The supporting document, if the link goes to one | `trees-in-hard-landscapes` |

**Cross-reference**, used in `cross-references` when the text points to another part of the document:

| Field | Required | Description | Example |
|---|---|---|---|
| `type` | Yes | `chapter`, `section`, `rule`, `table` or `figure` | `section` |
| `reference` | Yes | Reference of the thing pointed to | `3.4` |
| `listed-as` | Yes | The wording on the page | see section 3.4 Sustainable Drainage |

**Glossary terms.** Words in the text that are underlined or linked to Appendix A are recorded in a `glossary-terms` field on the record they appear in, as a list of `glossary-term` references. Any record with text can have one: chapters, sections, rules, tables, figures, notes and definitions.

---

## design-code

One record per design code document.

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Unique slug | `east-riding-design-code` |
| `name` | Yes | Title of the document | East Riding Design Code |
| `organisation` | Yes | CURIE of the council that adopted it | `local-authority:ERY` (to confirm) |
| `description` | No | Purpose, in a sentence or two | The East Riding Design Code has been prepared to clarify design expectations… |
| `vision` | No | The overall design vision statement | Green, inclusive and distinctive places, which connect landscape, people, place and nature… |
| `status` | Yes | One of `draft`, `consultation`, `adopted`, `withdrawn` | `adopted` |
| `document-type` | No | Planning status of the document | `supplementary-planning-document` |
| `design-code-type` | Yes | How much of the area it covers, from the national list: `authority-wide`, `area-specific` or `site-specific` | `authority-wide` |
| `adopted-date` | No | When it was adopted | `2025-04` |
| `last-updated-date` | No | Date of the latest version | `2025-09` |
| `version` | No | Latest version label | `2a` |
| `coverage` | Yes | Area covered, in words | The whole of the East Riding of Yorkshire |
| `coverage-geography` | No | CURIE of the area covered, for the map | `statistical-geography:E06000011` |
| `prepared-by` | No | Organisations that prepared it | AECOM |
| `credits` | No | Other credits, such as illustrators | Illustrations by Harper Perry Ltd; Joseph Cox, FORM Studio |
| `local-plan` | No | Name of the local plan it supports | East Riding Local Plan 2025 |
| `document-url` | Yes | Direct link to the PDF (the source URL) | |
| `documentation-url` | No | Web page about the design code | |

## design-code-version

The PDF lists its version history on page 2, so versions get their own records rather than one `version` field.

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Version label | `2a` |
| `design-code` | Yes | Design code reference | `east-riding-design-code` |
| `date` | Yes | Publication date | `2025-09` |
| `description` | No | What changed | Minor updates |

## design-code-chapter

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Chapter number | `3` |
| `design-code` | Yes | Design code reference | `east-riding-design-code` |
| `name` | Yes | Chapter title | Codes and Guidance: Environment |
| `intro-text` | No | Text on the chapter's opening page | Land within a site must meet multiple requirements… |
| `key-values` | No | Design values highlighted for this chapter | `connected;landscape-led;sustainable;distinctive-and-contextual;inclusive-and-safe` |
| `compliance-documents` | No | "Where to demonstrate compliance" list | Design and Access Statement; Site Plan; Tree Survey… |
| `glossary-terms` | No | Glossary terms in the intro and compliance list | `biodiversity-net-gain;green-infrastructure` |
| `page-number` | No | Printed page number of the chapter's first page | `33` |

In the PDF the key values sit on chapters, not sections. Sections inherit their chapter's key values.

## design-code-section

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Section number | `3.3` |
| `design-code-chapter` | Yes | Chapter reference | `3` |
| `name` | Yes | Section title | Trees and Hedgerows |
| `intro-text` | No | Introduction under the section banner | Trees and Hedgerows are a significant part of the natural environment… |
| `place-types` | No | Place types highlighted in the section banner key | |
| `supporting-documents` | No | Document mentions from the section's footer box, in printed order | `{supporting-document: the-suds-manual, listed-as: The SuDS Manual}` |
| `local-plan-policies` | No | Main policies from the section's footer box, in printed order | `ENV1;ENV4;ENV5` |
| `glossary-terms` | No | Glossary terms in the intro | `landscape` |
| `page-number` | No | Printed page number | `39` |
| `end-page-number` | No | Last printed page, if the section runs over more than one spread | `44` |

Definitions, note boxes, figures and tables point to their section, rather than the section listing them.

Some sections have no specific supporting documents and say "See references for general guidance". Leave `supporting-documents` empty for those.

## design-value

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Slug | `landscape-led` |
| `design-code` | Yes | Design code reference | `east-riding-design-code` |
| `name` | Yes | Value name | Landscape led |
| `description` | No | What the value means | The East Riding landscape is varied, from the rolling hills of the Wolds… |

## place-type

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Slug | `town-centre` |
| `design-code` | Yes | Design code reference | `east-riding-design-code` |
| `code` | Yes | Abbreviation used in the PDF's keys | `TC` |
| `local-name` | Yes | The council's own name for the place type | Town centre |
| `area-type` | No | The national area type it matches (see [National values](#national-values)). Empty if there is no match, which makes it a local-only area type | `town-or-city-centre` |
| `description` | No | Description paragraph | Town centres are places with a rich culture, history and significance… |
| `vision` | No | "Vision for…" bullet points (Markdown list) | - A strong building line and sense of enclosure… |
| `notes` | No | Any note box | Policy allows for limited development within the countryside… |
| `page-number` | No | Printed page number | `26` |

East Riding's place types match the national area types like this:

| East Riding place type | National area type |
|---|---|
| Town centre | Town or city centre |
| Neighbourhood centre | Local centre |
| Inner neighbourhood | Urban neighbourhood |
| Outer neighbourhood | Suburbs |
| Business and industrial | Industrial area |
| Village | Rural settlements |
| Countryside | None: local-only |

The banner keys use `TC IN ON NC V C SD`. `SD` is the business and industrial place type, which Appendix D calls "Ind, S&D and Comm".

## development-type

From Table 1, plus advertisement consent, which Appendix D and Table 2 use but Table 1 does not.

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Slug | `agricultural` |
| `design-code` | Yes | Design code reference | `east-riding-design-code` |
| `code` | Yes | Single-character key shown on each code | `A` |
| `name` | Yes | Name | Agricultural |
| `description` | No | Explanatory text | New-build development on agricultural land (not including changes of use…) |
| `category` | No | `residential-scale` or `non-residential` | `non-residential` |

The keys in Table 1 are not all letters: `H`, `1`, `2`, `3`, `4`, `F`, `A`, `B` and `C`. Advertisement consent has no key in the PDF; give it the reference `advertisement-consent` and leave `code` empty.

## design-code-rule

Codes and key guidance share one record type, told apart by `type`. Both have the same links (development types, place types, outline matters and policies) in Appendix D.

| Field | Required | Description | East Riding example (C28) |
|---|---|---|---|
| `reference` | Yes | Code or key guidance number | `C28` |
| `design-code` | Yes | Design code reference | `east-riding-design-code` |
| `type` | Yes | `code` or `key-guidance` | `code` |
| `title` | No | Short title. The PDF gives none, so these are written for the prototype from the rule's own text and noted in `extraction-notes` | Tree Retention Requirements |
| `design-code-section` | Yes | Section reference | `7.5` |
| `requirement-text` | Yes | Main text of the box. For codes, the requirement; for key guidance, the recommendation | Where there is a varied building line any variation from the predominant building line must be as set out in Table 9. |
| `guidance-text` | No | The italic "GUIDANCE:" text under a code | Variations in building line can contribute to the character of an area… |
| `development-types` | Yes | Development types it applies to | `1;2;3;4;F` (illustrative) |
| `place-types` | No | Place types it applies to; empty means all | `town-centre;inner-neighbourhood;outer-neighbourhood;neighbourhood-centre;village` |
| `features` | Yes | National features it covers, one or more (see [National values](#national-values)) | `nature;public-space` |
| `features-status` | No | `proposed` while the features are suggested from the rule's wording and not yet confirmed; empty once confirmed | `proposed` |
| `outline-application-matters` | No | Reserved matters it applies to: `appearance`, `means-of-access`, `landscaping`, `layout`, `scale` | `layout` (illustrative) |
| `local-plan-policies` | No | Policy and criterion references from Appendix D | `ENV1-B1;ENV1-B21` (illustrative) |
| `supporting-documents` | No | Document mentions in the rule's own text. The section's list applies as well, so it isn't repeated | `{supporting-document: climate-change-strategy-2022-2030, listed-as: Climate Change Strategy 2022-2030}` |
| `links` | No | Hyperlinks in the rule's text that go outside the document | |
| `design-code-tables` | No | Tables the rule refers to | `table-9` |
| `cross-references` | No | Other chapters, sections, rules, tables or figures the text points to | `{type: section, reference: 3.2, listed-as: see section 3.2 Biodiversity}` |
| `glossary-terms` | No | Glossary terms in the requirement and guidance text | `public-realm;green-infrastructure` |
| `page-number` | No | Printed page number | `87` |

In C28, `development-types`, `outline-application-matters` and `local-plan-policies` are illustrative only, because they need reading from the visual keys (see below).

**Where applicability comes from.** Every code and key guidance box prints the full key (`A B / H 1 2 3 4 F C`), and every section banner prints the full place type key. The ones that apply are shown by highlighting, which is lost when the text is copied out. Appendix D (Table 20) records the same information, plus outline application matters, as dots in columns. That information has to be read from the page images, not the text. Appendix D should be the main source, checked against the boxes.

## design-code-table

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Slug | `table-9` |
| `design-code-section` | Yes | Section reference | `7.5` |
| `number` | Yes | Table number | `9` |
| `name` | Yes | Table caption | Supported building line variations (C28) and new building line maximum setbacks (C29) |
| `design-code-rules` | No | Rules that use the table | `C28;C29` |
| `columns` | Yes | The columns, in printed order (see below) | |
| `rows` | Yes | One object per row, keyed by column reference (see below) | |
| `footnotes` | No | Footnotes under the table | \*with the exception of terraced blocks which have a maximum variation of +/- 0.5 metres. |
| `glossary-terms` | No | Glossary terms in the table's cells | `tree-pit` |
| `page-number` | Yes | Printed page number | `87` |
| `end-page-number` | No | Last printed page, if the table runs over two pages | |

Each **column** has:

| Field | Required | Description | Example |
|---|---|---|---|
| `reference` | Yes | Key used in each row, unique in the table | `public-open-space` |
| `name` | Yes | Column heading, as printed | Public Open Space |
| `group` | No | Heading printed above a group of columns | LOCATION |
| `type` | Yes | `text` (a string), `list` (an array of strings, for bulleted cells) or `dot` (`true` where the table shows a dot, `false` where the cell is empty) | `dot` |

Each **row** is an object with one value per column, for example Table 3:

```json
{ "suds-method": "Water Butts", "commercial": false, "residential": true, "plot": true, "street": false, "public-open-space": false }
```

## design-code-parameter

One record per value in a table, so that requirements can be filtered and compared by place type.

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Slug | `c29-inner-neighbourhood` |
| `design-code-rule` | Yes | Rule reference | `C29` |
| `design-code-table` | No | Table reference | `table-9` |
| `place-type` | No | Place type reference, if the value varies by place type | `inner-neighbourhood` |
| `name` | Yes | What is measured | Maximum new building line setback |
| `value` | Yes | The number or range | `1.5` |
| `unit` | No | Unit | `metres` |
| `qualifier` | No | `minimum`, `maximum`, `plus-or-minus` | `maximum` |
| `notes` | No | Exceptions | |

## design-code-figure

Images are added one at a time, as they are cropped from the PDF.

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Slug | `figure-20` |
| `design-code-section` | Yes | Section reference | `3.2` |
| `number` | Yes | Figure number | `20` |
| `caption` | Yes | Caption, as printed, without "Figure 20" | Before and after development highlighting biodiversity enhancements |
| `panel-headings` | No | Headings printed over parts of the figure | BEFORE;AFTER |
| `labels` | No | Callout labels, top to bottom within each panel (see below) | |
| `glossary-terms` | No | Glossary terms in the labels | |
| `image` | No | Path to the image under `/public/`, once it has been cropped from the PDF. Empty until then | `/public/images/design-codes/east-riding-figure-22.png` |
| `page-number` | Yes | Printed page number (Appendix C lists them) | `38` |

Each **label** has `text` (as printed, including capitals) and, for figures with panel headings, `panel` (the heading it sits under).

## design-code-note

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Section reference and a number | `3.5-note-1` |
| `design-code-section` | Yes | Section reference | `3.5` |
| `heading` | Yes | Heading of the box, as printed | NOTE |
| `text` | Yes | Text of the box | Some types of insultation retrofit and renewable energy production will not be suitable… |
| `links` | No | Hyperlinks in the text | |
| `glossary-terms` | No | Glossary terms in the text | `renewable-energy;conservation-area` |
| `page-number` | Yes | Printed page number | `46` |

## design-code-definition

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Section reference and a number | `3.1-definition-1` |
| `design-code-section` | Yes | Section reference | `3.1` |
| `term` | Yes | The term being defined, as printed | Green infrastructure (GI) |
| `text` | Yes | The definition, without the term or the source | A network of multi-functional green and blue spaces… |
| `source` | No | Where the definition comes from, as printed | NPPF 2024 |
| `glossary-terms` | No | Glossary terms in the box | `green-infrastructure` |
| `page-number` | Yes | Printed page number | `35` |

## glossary-term

Stored once per design code and referenced from any record whose text uses the term. Only terms the extracted content uses are stored, so the list grows as chapters are added.

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Slug | `public-realm` |
| `design-code` | Yes | Design code reference | `east-riding-design-code` |
| `term` | Yes | Heading in Appendix A, as printed | Public realm |
| `definition` | Yes | Definition in Appendix A | This is the space that is visible and accessible to members of the public… |
| `page-number` | Yes | Printed page number in Appendix A | `141` |

The wording on the page often differs from the heading (for example "public open spaces", "landscapes", "Tree pits"). Records reference the term, not the wording.

## local-plan-policy

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Policy and criterion, or just the policy | `ENV1-B15` |
| `local-plan` | Yes | Local plan name or reference | East Riding Local Plan 2025 |
| `policy` | Yes | Main policy number (bold in Appendix D) | `ENV1` |
| `criterion` | No | Sub-policy (italic in Appendix D). Empty for a whole-policy record, such as the `ENV4` that section footer boxes list | `B15` |
| `name` | No | Policy title | |
| `documentation-url` | No | Link to the policy | |

## supporting-document

| Field | Required | Description | East Riding example |
|---|---|---|---|
One record per entry in Appendix B. Sections and rules point to these with document mentions, which keep the shorter wording printed on the page.

| Field | Required | Description | East Riding example |
|---|---|---|---|
| `reference` | Yes | Slug | `building-with-nature-standards-framework` |
| `title` | Yes | Full title, as printed in Appendix B | Building with Nature Standards Framework (BwN 2.0) |
| `publisher` | No | Author or publisher, as printed in Appendix B. Empty if none is given | Building with Nature |
| `publication-date` | No | Date in Appendix B, as `YYYY` or `YYYY-MM` | `2022` |
| `category` | Yes | `general-guidance` or `supporting-document`, as grouped in Appendix B | `supporting-document` |
| `document-url` | No | Where the title links to in Appendix B. Empty if it has no link | |
| `page-number` | Yes | Printed page number in Appendix B | `145` |

---

## National values

From the national design code structure, so every council's design code uses the same values. Each council's own place types keep their names and point to these.

**Features** (`features` on rules):

| Value | Name |
|---|---|
| `climate` | Climate |
| `nature` | Nature |
| `movement` | Movement |
| `built-form` | Built form |
| `public-space` | Public space |
| `identity` | Identity |

**Area types** (`area-type` on place types):

| Value | Name |
|---|---|
| `town-or-city-centre` | Town or city centre |
| `local-centre` | Local centre |
| `urban-neighbourhood` | Urban neighbourhood |
| `suburbs` | Suburbs |
| `industrial-area` | Industrial area |
| `rural-settlements` | Rural settlements |

These are the area types East Riding's place types map to. The national list may have more.

**Design code types** (`design-code-type` on design codes): `authority-wide`, `area-specific`, `site-specific`.

---

## Questions for review

1. **Applicability source.** Appendix D and the highlighted keys on each page should agree. Is Appendix D the source of truth?
2. **Titles.** Codes and key guidance have no titles in the PDF. The prototype now uses short titles written from each rule's text (for example C1 "Tree Retention Requirements"). Should the council confirm or supply these?
3. **Page numbers.** The PDF has two printed pages on each PDF page (86 PDF pages, about 170 printed pages). This schema uses the printed page number, so references match the document. Do we also want the PDF page number for linking straight to the file?
4. **Status values.** Is `draft`, `consultation`, `adopted`, `withdrawn` enough, or should the list match planning.data.gov.uk's *design code status* dataset?
5. **Compliance checklists.** Table 2 maps development types to compliance checklist forms (Form 1–17, including Outline and Reserved Matters forms). Should those be stored as well? They aren't covered here.
6. **Glossary.** Glossary terms are now stored (`glossary-term`), but only those the extracted chapters use. Should the v2 prototype's "Code Glossary" tab show these as well as development types?
7. **Topics in the prototype.** The v2 prototype's "Topic" filter (Biodiversity, Green, Layout) would map to sections. Note that C1 is in 3.3 Trees and Hedgerows, not 3.2 Biodiversity, where the Figma design shows it.
8. **Figure images.** Figures 20 and 22 have images, cropped from the PDF; the rest don't yet. Should the rest be cropped the same way, or requested from the council as separate files?
9. **Appendix D links.** The "Policy" links in each section's footer box, and the code numbers on each box, link to a separate file, *Appendix D Policy Matrix April 2025 2a.pdf*, which isn't in this repository. Do we have a public URL for it?
