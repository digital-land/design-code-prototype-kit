//
// Turns the design code spreadsheets exported as CSV into JSON for the prototype.
//
// Reads every CSV in app/data/Sources/Design codes/:
//   - each list of rules ("Design code rules - Chatham.csv" and so on) becomes one JSON file per
//     design code in app/data/design-codes/, in the shape described in app/data/schema.md, so the
//     data loader (app/data/index.js) picks it up
//   - "Development types" becomes app/data/national/development-types.json, the national list
//     with what each type means. Design codes' development types take their descriptions from it.
//   - "Overview" becomes app/data/national/design-code-fields.json (the fields a rule has, with
//     the team's notes on each) and app/data/national/use-classes.json (its use class table)
//
// Run with: npm run data
//
// The rule CSVs have two header rows: groups ("Overview", "Where the rule applies"…), then the
// column names. Rows are matched to columns by name, so the column order can change. Each
// council's spreadsheet fills the columns a little differently (see DESIGN_CODES), so the
// script reads the forms each one uses.
//
// Only list columns are split, on semicolons or line breaks. Text columns are kept whole, because
// their semicolons are punctuation ("…mobility needs; streets suit slow cycling…").
//

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SOURCE_DIR = path.join(ROOT, 'app', 'data', 'Sources', 'Design codes')
const OUTPUT_DIR = path.join(ROOT, 'app', 'data', 'design-codes')
const NATIONAL_DIR = path.join(ROOT, 'app', 'data', 'national')

// Facts about each design code that the spreadsheet doesn't hold, keyed by its "Design code"
// column. The reference is what the prototype's routes look up: "medway-design-code" shows on
// the Medway pages.
//   sections: how rules are grouped into sections
//     'reference' - by the start of the rule reference: 3.3.8 is in section 3.3
//     'link'      - by the web page the "Design code link" points to (East Riding's
//                   "…?entry=3_3_trees_and_hedgerows" is section 3.3)
//   sectionNames: 'area' names a section after its rules' area; 'issue' after their national
//     design issue
//   chapters: 'volume' takes chapters from the volume in "Supporting information"; otherwise
//     a chapter is the first number of its sections
const DESIGN_CODES = {
  'Chatham Centre Design Code': {
    file: 'medway.json',
    reference: 'medway-design-code',
    organisation: 'local-authority:MDW',
    publisher: 'Medway Council',
    status: 'adopted',
    'design-code-type': 'area-specific',
    coverage: 'Chatham town centre',
    // The spreadsheet links each rule to the volume it is in. This is the volume with the
    // vision and area-wide guidance.
    'document-url': 'https://www.medway.gov.uk/download/downloads/id/8769/chatham_centre_design_code_spd_-_volume_2.pdf',
    sections: 'reference',
    sectionNames: 'area',
    chapters: 'volume'
  },
  'East Riding Design Code': {
    file: 'east-riding.json',
    reference: 'east-riding-design-code',
    organisation: 'local-authority:ERY',
    publisher: 'East Riding of Yorkshire Council',
    // The design code's details, place types and development types, which the spreadsheet
    // doesn't have, kept from the hand-extracted file
    base: require('./design-codes/east-riding.json'),
    sections: 'link',
    sectionNames: 'issue',
    // Rules are in no particular order in the spreadsheet
    sort: true,
    // The spreadsheet's development type names, as the design code's development types
    developmentTypeNames: {
      householder: 'householder',
      '1-2 units': '1-2-units',
      '3-9 units': '3-9-units',
      '10+ units': '10-plus-units',
      'mixed use': 'mixed-use',
      flats: 'flats',
      agricultural: 'agricultural',
      'industrial, storage & distribution': 'industrial-storage-and-distribution',
      commercial: 'commercial'
    }
  },
  'Becontree Design Code': {
    file: 'becontree.json',
    reference: 'becontree-design-code',
    organisation: 'local-authority:BDG',
    publisher: 'London Borough of Barking and Dagenham',
    status: 'adopted',
    'design-code-type': 'area-specific',
    coverage: 'The Becontree Estate',
    'local-plan': 'Barking and Dagenham Local Plan 2037',
    sections: 'reference',
    sectionNames: 'issue'
  },
  'A23 Great Street Design Code': {
    file: 'a23.json',
    reference: 'a23-design-code',
    organisation: 'local-authority:REI',
    publisher: 'Reigate and Banstead Borough Council',
    status: 'adopted',
    'design-code-type': 'area-specific',
    coverage: 'The A23 through Redhill, Earlswood, Salfords and Horley',
    'local-plan': 'Reigate and Banstead Development Management Plan 2019',
    sections: 'reference',
    sectionNames: 'issue'
  }
}

// The CSV's "National design feature" values, as national feature values (schema.md,
// "National values"). Anything not listed is turned into a slug, such as "Uses" -> "uses".
const FEATURES = {
  'public spaces': 'public-space'
}

// An "Area" value for a rule that applies everywhere, such as "All area types"
const ALL_AREAS = /^all (other )?(area|place) types\b/i

// "Recommendation" is advice, like guidance
const RULE_TYPES = { rule: 'code', guidance: 'key-guidance', recommendation: 'key-guidance' }

const DOCUMENT_TYPES = { 'supplementary planning document': 'supplementary-planning-document' }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

// ---- Reading the CSV ----

// A small CSV parser: commas between fields, double quotes around fields that hold commas,
// quotes or line breaks, and "" for a quote inside a quoted field
function parseCsv (text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += char
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

const readCsv = file => parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))

// Each data row as an object keyed by column name, with spaces trimmed. Empty rows are skipped.
function readRows (file) {
  const [, names = [], ...rows] = readCsv(file)
  const columns = names.map(name => name.trim())
  return rows
    .filter(row => row.some(cell => cell.trim() !== ''))
    .map(row => Object.fromEntries(columns.map((name, index) => [name, (row[index] || '').trim()])))
}

// ---- Shaping the values ----

const slugify = value => String(value).toLowerCase().replace(/&/g, 'and').replace(/\+/g, '-plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// "a; b ;c" or one per line -> ['a', 'b', 'c']
const split = value => String(value || '').split(/;|\r?\n/).map(item => item.trim()).filter(Boolean)

// Each line, trimmed, without blank ones. For columns whose lines have semicolons in them
// ("Further reading: Manual for Streets; LTN 1/20").
const lines = value => String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)

// Text with each line trimmed, and blank lines dropped
const tidyText = value => String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).join('\n')

const feature = value => FEATURES[value.toLowerCase()] || slugify(value)

// "May 2026" -> "2026-05", "Apr 2025" -> "2025-04", "2024" -> "2024"
function partialDate (text) {
  const match = /\b([A-Z][a-z]{2,8})\s+(\d{4})\b/.exec(text || '')
  const month = match && MONTHS.indexOf(match[1].slice(0, 3).toLowerCase())
  if (match && month !== -1) return `${match[2]}-${String(month + 1).padStart(2, '0')}`
  return (/\b(\d{4})\b/.exec(text || '') || [])[1] || ''
}

// The rule reference without a letter after it: "5.1.3 (a)" -> "5.1.3"
const baseReference = reference => reference.replace(/\s*\([a-z]+\)$/i, '')

// "3.3.8" -> "3.3"; "5.1.3 (a)" -> "5.1"; "AW1" -> "AW", the area-wide guidance
function sectionOfReference (reference) {
  const base = baseReference(reference)
  return /^\d+\.\d+/.test(base) ? base.split('.').slice(0, 2).join('.') : base.replace(/\d+$/, '')
}

// East Riding's web pages: "…?entry=3_3_trees_and_hedgerows" -> "3.3"
function sectionOfLink (link) {
  const match = /entry=(\d+)_(\d+)_/.exec(link || '')
  return match ? `${match[1]}.${match[2]}` : ''
}

// What a national design issue says about the section a rule is in:
//   "Environment - Trees and hedgerows"            -> chapter "Environment", section "Trees and hedgerows"
//   "4.1 Enhancing connectivity – Code M1: …"     -> section "Enhancing connectivity"
//   "Primary elevation"                            -> section "Primary elevation"
function readIssue (issue) {
  const numbered = /^\d+(?:\.\d+)*\s+(.+?)\s+[–-]\s+/.exec(issue)
  if (numbered) return { section: numbered[1] }
  const pair = /^(.+?)\s+-\s+(.+)$/.exec(issue)
  if (pair) return { chapter: pair[1], section: pair[2] }
  return { section: issue }
}

// "Volume III (part B): area type guidance, pages 96 to 111" ->
// { chapter: '3', part: 'B', name: 'Area type guidance', pages: [96, 111] }
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }
function readVolume (value) {
  const match = /^Volume ([IVX]+)(?: \(part ([A-Z])\))?:\s*(.*?)(?:,\s*pages (\d+) to (\d+))?$/i.exec(value)
  if (!match) return null
  const [, roman, part, name, start, end] = match
  return {
    chapter: String(ROMAN[roman.toUpperCase()]),
    roman: roman.toUpperCase(),
    volume: roman.toUpperCase() + (part || ''),
    part,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    pages: start ? [Number(start), Number(end)] : null
  }
}

// "Supporting information", line by line:
//   "Volume III (part A): coding plan…, pages 80 to 95"     the volume the rule is in (Chatham)
//   "Source: A23 … SPD, June 2024, page 36: https://…"      the design code, with the rule's pages
//   "Glossary of Design Code terms: https://…"               a supporting document
//   "Suggested materials palette: Brick, Render…"            supporting information
//   "NOTE: Rule wording summarised from the source…"         a note for whoever checks the data
function readSupportingInformation (value) {
  const result = { volume: null, source: null, documents: [], details: [], notes: [] }
  for (const line of lines(value)) {
    const note = /^NOTE:\s*(.*)$/i.exec(line)
    const volume = readVolume(line)
    const source = /^Source:\s*(.+?):\s*(https?:\/\/\S+)$/i.exec(line)
    const link = /^(.+?):\s*(https?:\/\/\S+)$/.exec(line)
    const detail = /^([^:]{2,60}):\s*(.+)$/.exec(line)
    if (note) result.notes.push(note[1])
    else if (volume) result.volume = volume
    else if (source) {
      const pages = /\bpages? (\d+)(?: to (\d+))?/.exec(source[1])
      result.source = {
        title: source[1].replace(/,\s*pages? .*$/, '').replace(/,\s*[A-Z][a-z]+ \d{4}$/, '').trim(),
        date: partialDate(source[1]),
        pages: pages ? [Number(pages[1]), Number(pages[2] || pages[1])] : null,
        url: source[2]
      }
    } else if (link) result.documents.push({ title: link[1], url: link[2] })
    else if (detail) result.details.push({ label: detail[1], text: detail[2] })
    // A sentence is a note on the rule ("Appendix D lists ENV5."); anything else names a document
    // with no link ("Highways Design Guide pp.26 & 28 (no link on page)")
    else if (/\.$/.test(line)) result.details.push({ label: '', text: line })
    else result.documents.push({ title: line, url: '' })
  }
  return result
}

// "Local plan policy links", line by line:
//   "Policy S4 – Landscape and urban design guidance (Medway Local Plan 2003, page 17): https://…"
//   "Policy ENV1 – Integrating high quality design: https://…"
//   "Local Plan 2037: https://…"   a whole plan, rather than one policy
function readPolicyLinks (value) {
  const policies = []
  const plans = []
  for (const line of lines(value)) {
    const link = /^(.+?):\s*(https?:\/\/\S+)$/.exec(line)
    if (!link) continue
    const policy = /^Policy\s+(\S+)\s+[–-]\s+(.*?)(?:\s*\(([^,()]+?)(?:,\s*page\s+(\d+))?\))?$/i.exec(link[1])
    if (policy) policies.push({ reference: policy[1], name: policy[2], plan: policy[3] || '', page: policy[4] || '', url: link[2] })
    else plans.push({ name: link[1], url: link[2] })
  }
  return { policies, plans }
}

// The places a rule's "Area" names, and any details after them:
//   "Central urban area; Edge of centre urban area. Sites: R2 …; R3 …" ->
//     { names: ['Central urban area', 'Edge of centre urban area'], details: [{ label: 'Sites', … }] }
function readArea (value) {
  const [first, ...rest] = String(value || '').split(/\.\s+(?=[A-Z][^.:]{0,40}:)/)
  return {
    names: split(first.replace(/\.$/, '')).filter(name => !ALL_AREAS.test(name)),
    details: rest.map(part => /^([^:]+):\s*(.*)$/.exec(part.replace(/\.$/, ''))).filter(Boolean)
      .map(([, label, text]) => ({ label, text }))
  }
}

// The value most rows give, for things that should be the same across a group of rows
function mostCommon (values) {
  const counts = new Map()
  for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1)
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return sorted.length ? sorted[0][0] : ''
}

// "3.10" sorts after "3.9"
function compareReferences (a, b) {
  const partsA = String(a).split('.').map(Number)
  const partsB = String(b).split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const difference = (partsA[i] || 0) - (partsB[i] || 0)
    if (difference) return isNaN(difference) ? String(a).localeCompare(String(b)) : difference
  }
  return 0
}

// ---- The national development types ----

// "Development types" has a column each for major, minor and other development. Each cell is a
// type's name, then what it means.
function readDevelopmentTypes (file) {
  const [header, ...rows] = readCsv(file)
  const types = []
  header.forEach((heading, column) => {
    if (!heading.trim() || column === 0) return
    const group = /^major/i.test(heading) ? 'major' : /^minor/i.test(heading) ? 'minor' : 'other'
    for (const row of rows) {
      const [name, ...description] = String(row[column] || '').split(/\r?\n/)
      if (!name.trim()) continue
      types.push({
        reference: slugify(`${group === 'other' ? '' : group + ' '}${name.trim()}`),
        group,
        name: name.trim(),
        description: description.join('\n').trim()
      })
    }
  })
  return types
}

// A design code's development type in the national list: "Major – Homes" is major "Homes"
function nationalType (nationalTypes, name) {
  const sized = /^(Major|Minor)\s+[–-]\s+(.+)$/i.exec(name)
  const group = sized ? sized[1].toLowerCase() : 'other'
  const typeName = (sized ? sized[2] : name).toLowerCase()
  return nationalTypes.find(type => type.group === group && type.name.toLowerCase() === typeName)
}

// ---- The overview sheet ----

// "Overview" has the fields of a rule in groups (one group per tab of a rule's page), each with
// the team's notes, then a table of use classes
function readOverview (file) {
  const rows = readCsv(file)
  const header = rows[0]
  const tableStart = rows.findIndex(row => row[1] === 'Use class')

  // The fields: each non-empty cell above the use class table, under its group's heading
  const groups = []
  header.forEach((heading, column) => {
    if (!heading.trim()) return
    const fields = []
    for (const row of rows.slice(1, tableStart === -1 ? rows.length : tableStart)) {
      for (const cell of [row[column], row[column + 1]]) {
        const [name, ...notes] = String(cell || '').split(/\r?\n/)
        if (name && name.trim()) fields.push({ name: name.trim(), notes: notes.join('\n').trim() })
      }
    }
    groups.push({ name: heading.trim(), fields })
  })

  // The use classes: a class's name in the second column, then each of its uses
  const useClasses = []
  for (const row of tableStart === -1 ? [] : rows.slice(tableStart + 1)) {
    const [, name, value, description] = row.map(cell => String(cell || '').trim())
    if (name) useClasses.push({ name, uses: [] })
    const current = useClasses[useClasses.length - 1]
    if (current && (value || description)) current.uses.push({ value, description })
  }
  return { groups, useClasses }
}

// ---- Building a design code ----

function buildDesignCode (name, rows, sourceFiles, nationalTypes) {
  const config = DESIGN_CODES[name]
  const base = config.base || {}
  const baseMeta = base['design-code'] || {}
  const designCode = config.reference
  const prefixed = slug => `${designCode}:${slug}`

  // ---- Supporting documents, from "Supporting information" and the design code links ----

  const documents = new Map()
  const addDocument = (key, document) => {
    if (!documents.has(key)) documents.set(key, { reference: slugify(document.title).slice(0, 80), ...document })
    return documents.get(key)
  }
  const info = rows.map(row => readSupportingInformation(row['Supporting information']))

  // Chatham: one per volume PDF that rules link to, named after what the volume covers, such as
  // "Coding plan and area type guidance"
  rows.forEach((row, index) => {
    const volume = info[index].volume
    const url = row['Design code link']
    if (!volume || !url || documents.has(url)) return
    const names = rows.filter(other => other['Design code link'] === url)
      .map(other => readVolume(lines(other['Supporting information'])[0] || ''))
      .filter(Boolean).map(other => other.name)
    addDocument(url, {
      reference: `${slugify(name)}-volume-${volume.volume.toLowerCase()}`,
      title: names.length ? mostCommon(names) : `${name} – Volume ${volume.volume}`,
      // Not in the schema yet: which volume it is, such as "Volume 3, Part A"
      volume: `Volume ${volume.chapter}${volume.part ? `, Part ${volume.part}` : ''}`,
      publisher: config.publisher,
      'publication-date': partialDate(row['Local development document']),
      category: 'supporting-document',
      // Not in the schema yet: it's (part of) the design code itself
      'design-code-document': true,
      'document-url': url
    })
  })

  // ---- Place types: one per area the rules name, or the design code's own ----

  const basePlaceTypes = base['place-types'] || []
  const placeTypes = basePlaceTypes.length
    ? basePlaceTypes
    : [...new Set(rows.flatMap(row => readArea(row.Area).names))].map(area => ({
        reference: prefixed(slugify(area)),
        'design-code': designCode,
        code: '',
        'local-name': area,
        'area-type': '',
        'extraction-notes': 'No national area type is given in the spreadsheet yet, so this place type is local-only.'
      }))
  // The place types a rule's area names. With the design code's own place types (East Riding's),
  // they're found in the text: "Mandatory: Town Centre, Neighbourhood Centre…"
  const placeTypesFor = area => {
    if (!basePlaceTypes.length) return readArea(area).names.map(item => prefixed(slugify(item)))
    if (/\ball (other )?place types\b/i.test(area)) return []
    const text = String(area).toLowerCase()
    return basePlaceTypes.filter(placeType => text.includes(placeType['local-name'].toLowerCase())).map(placeType => placeType.reference)
  }

  // ---- Development types: the design code's own, or one per type the rules name ----

  const baseTypes = base['development-types'] || []
  const typeNames = config.developmentTypeNames
  // East Riding's are written as one list with commas, and one name has a comma in it
  // ("Industrial, storage & distribution"), so they're found by name
  const typesFor = value => {
    if (!typeNames) return split(value).map(item => prefixed(slugify(item)))
    let text = String(value).toLowerCase()
    const found = []
    for (const typeName of Object.keys(typeNames).sort((a, b) => b.length - a.length)) {
      if (text.includes(typeName)) {
        found.push(typeNames[typeName])
        text = text.replace(typeName, '')
      }
    }
    const left = text.replace(/[,;\s]+/g, ' ').trim()
    if (left) console.warn(`  ${name}: development type "${left}" is not in developmentTypeNames`)
    return baseTypes.map(type => type.reference).filter(reference => found.includes(reference.split(':').pop()))
  }
  const developmentTypes = baseTypes.length
    ? baseTypes
    : [...new Set(rows.flatMap(row => split(row['Development type'])))].map(typeName => {
        const national = nationalType(nationalTypes, typeName)
        return {
          reference: prefixed(slugify(typeName)),
          'design-code': designCode,
          code: '',
          name: typeName,
          description: national ? national.description : '',
          ...(national ? { 'national-development-type': national.reference } : {}),
          notes: national
            ? 'From the spreadsheet\'s "Development type" column. Its description is from the national list of development types.'
            : 'From the spreadsheet\'s "Development type" column. It is not in the national list of development types, so it has no description.'
        }
      })

  // ---- Rule references: made unique where the spreadsheet repeats them ----

  const counts = new Map()
  for (const row of rows) counts.set(row['Design code requirement reference'], (counts.get(row['Design code requirement reference']) || 0) + 1)
  const seen = new Map()
  const references = rows.map(row => {
    const printed = row['Design code requirement reference']
    if (counts.get(printed) === 1) return printed
    seen.set(printed, (seen.get(printed) || 0) + 1)
    return `${printed}-${seen.get(printed)}`
  })

  // ---- Sections and chapters ----

  const sectionOfRow = (row, index) => (config.sections === 'link' && sectionOfLink(row['Design code link'])) ||
    sectionOfReference(references[index])
  const sectionRows = new Map()
  rows.forEach((row, index) => {
    const section = sectionOfRow(row, index)
    if (!sectionRows.has(section)) sectionRows.set(section, [])
    sectionRows.get(section).push({ row, index })
  })
  let sectionEntries = [...sectionRows.entries()]
  if (config.sort) sectionEntries = sectionEntries.sort((a, b) => compareReferences(a[0], b[0]))

  const chapterOf = (reference, group) => {
    if (config.chapters === 'volume') {
      const volume = mostCommon(group.map(({ index }) => info[index].volume && info[index].volume.chapter))
      return volume || ''
    }
    return /^\d+/.test(reference) ? reference.split('.')[0] : reference
  }

  const sections = sectionEntries.map(([reference, group]) => {
    const groupRows = group.map(({ row }) => row)
    const area = mostCommon(groupRows.map(row => row.Area))
    // Named after its rules' issue. With East Riding, where a section's rules have different
    // issues ("Dormer windows", "Roof form"…), it's named after its web page instead
    // ("…entry=9_2_elevational_features_and_proportions" -> "Elevational features and proportions").
    const issueNames = groupRows.map(row => readIssue(row['National design issue']).section).filter(Boolean)
    const pageName = (/entry=\d+_\d+_([a-z0-9_]+)/.exec(mostCommon(groupRows.map(row => row['Design code link']))) || [])[1]
    const pageTitle = pageName ? pageName.charAt(0).toUpperCase() + pageName.slice(1).replace(/_/g, ' ') : ''
    const sectionName = config.sectionNames === 'area'
      ? area
      : (new Set(issueNames).size > 1 && pageTitle) || mostCommon(issueNames) || reference
    // Pages: from the volume (Chatham) or from where its rules are
    const volumes = group.map(({ index }) => info[index].volume).filter(Boolean)
    const pages = volumes.length
      ? JSON.parse(mostCommon(volumes.map(volume => JSON.stringify(volume.pages))) || 'null')
      : (() => {
          const all = group.flatMap(({ index }) => (info[index].source && info[index].source.pages) || [])
          return all.length ? [Math.min(...all), Math.max(...all)] : null
        })()
    const volumeDocument = documents.get(mostCommon(groupRows.map(row => info[rows.indexOf(row)].volume ? row['Design code link'] : '')))
    return {
      reference,
      'design-code-chapter': chapterOf(reference, group),
      name: sectionName,
      'place-types': config.sectionNames === 'area' ? placeTypesFor(area) : [],
      'supporting-documents': volumeDocument ? [{ 'supporting-document': volumeDocument.reference, 'listed-as': volumeDocument.title }] : [],
      ...(pages ? { 'page-number': pages[0], ...(pages[1] !== pages[0] ? { 'end-page-number': pages[1] } : {}) } : {})
    }
  })

  // Chapters: from the volumes (Chatham), or the first number of their sections, named after
  // the national design issue's group (East Riding's "Environment") or their rules' most common
  // national design feature
  const chapterRows = new Map()
  sections.forEach((section, sectionIndex) => {
    const chapter = section['design-code-chapter']
    if (!chapterRows.has(chapter)) chapterRows.set(chapter, [])
    chapterRows.get(chapter).push(...sectionEntries[sectionIndex][1])
  })
  const chapters = [...chapterRows.entries()]
    .sort((a, b) => compareReferences(a[0], b[0]))
    .map(([reference, group]) => {
      const volumeName = mostCommon(group.map(({ index }) => info[index].volume && info[index].volume.name))
      const issueName = mostCommon(group.map(({ row }) => readIssue(row['National design issue']).chapter))
      const featureName = mostCommon(group.map(({ row }) => split(row['National design feature'])[0]))
      return { reference, 'design-code': designCode, name: volumeName || issueName || featureName || `Chapter ${reference}` }
    })

  // ---- Local plan policies any rule names ----

  const policyDetails = new Map()
  const links = rows.map(row => readPolicyLinks(row['Local plan policy links']))
  for (const { policies } of links) {
    for (const policy of policies) if (!policyDetails.has(policy.reference)) policyDetails.set(policy.reference, policy)
  }
  const policyReferences = [...new Set(rows.flatMap(row => split(row['Local plan policy'])))]
  const policies = policyReferences.map(reference => {
    const [policy, ...criterion] = reference.split(/[-\s]+/)
    // A criterion ("ENV1 B15") takes its policy's details ("ENV1")
    const details = policyDetails.get(reference) || policyDetails.get(policy) || {}
    return {
      reference,
      'local-plan': details.plan || config['local-plan'] || baseMeta['local-plan'] || '',
      policy,
      criterion: criterion.join(' '),
      name: details.name || '',
      ...(details.page ? { 'page-number': Number(details.page) } : {}),
      'documentation-url': details.url || ''
    }
  })

  // ---- The rules ----

  let rules = rows.map((row, index) => {
    const reference = references[index]
    const printed = row['Design code requirement reference']
    const type = RULE_TYPES[row.Type.toLowerCase()] || row.Type
    const guidance = tidyText(row.Guidance)
    const supporting = info[index]

    // The rule's own supporting documents: where its source is, and what it links to
    const mentions = []
    if (supporting.source) {
      const document = addDocument(supporting.source.url + '#source', {
        title: supporting.source.title,
        publisher: config.publisher,
        'publication-date': supporting.source.date,
        category: 'supporting-document',
        'design-code-document': true,
        'document-url': supporting.source.url
      })
      mentions.push({ 'supporting-document': document.reference, 'listed-as': document.title })
    }
    for (const item of supporting.documents) {
      const document = addDocument(item.url || item.title, { title: item.title, category: 'supporting-document', 'document-url': item.url })
      mentions.push({ 'supporting-document': document.reference, 'listed-as': item.title })
    }
    const pages = supporting.source && supporting.source.pages
    const issue = row['National design issue']

    return {
      reference,
      ...(printed !== reference ? { 'printed-reference': printed } : {}),
      'design-code': designCode,
      type,
      ...(row.Type.toLowerCase() === 'recommendation' ? { 'type-name': 'Recommendation' } : {}),
      title: row['Design code requirement name'],
      'design-code-section': sectionOfRow(row, index),
      'requirement-text': tidyText(row['Design code requirement']),
      ...(guidance ? { 'guidance-text': guidance } : {}),
      'development-types': typesFor(row['Development type']),
      'place-types': placeTypesFor(row.Area),
      // Not in the schema yet: the "Area" text as the spreadsheet gives it, such as
      // "Becontree Estate (non-designated heritage asset). House types: Type A…"
      'area-text': row.Area,
      features: split(row['National design feature']).map(feature),
      // Not in the schema yet: the national design issue, such as "Movement – Footways"
      ...(issue ? { 'national-design-issue': issue } : {}),
      'local-plan-policies': split(row['Local plan policy']),
      // Not in the schema yet: whole plans the rule points to, rather than single policies
      ...(links[index].plans.length ? { 'local-plan-documents': links[index].plans } : {}),
      ...(mentions.length ? { 'supporting-documents': mentions } : {}),
      // Not in the schema yet: other supporting information, such as a materials palette
      ...(supporting.details.length ? { 'supporting-notes': supporting.details } : {}),
      // Not in the schema yet: the web page or document the rule is on
      ...(row['Design code link'] ? { 'document-url': row['Design code link'] } : {}),
      ...(pages ? { 'page-number': pages[0], ...(pages[1] !== pages[0] ? { 'end-page-number': pages[1] } : {}) } : {}),
      ...(supporting.notes.length ? { 'extraction-notes': supporting.notes.join(' ') } : {})
    }
  })
  if (config.sort) {
    const order = new Map(sections.map((section, index) => [section.reference, index]))
    rules = rules.map((rule, index) => ({ rule, index }))
      .sort((a, b) => order.get(a.rule['design-code-section']) - order.get(b.rule['design-code-section']) || a.index - b.index)
      .map(({ rule }) => rule)
  }

  // ---- The design code ----

  const localDevelopmentDocument = mostCommon(rows.map(row => row['Local development document']))
  const documentType = (/^([^(–]+)/.exec(localDevelopmentDocument) || [])[1] || ''
  const designCodeUrl = config['document-url'] || mostCommon(info.map(item => item.source && item.source.url)) ||
    baseMeta['document-url'] || ''

  return {
    extraction: {
      source: sourceFiles.map(file => path.relative(ROOT, file)).join('; '),
      'extracted-date': new Date().toISOString().slice(0, 10),
      method: 'Converted from the spreadsheet export by scripts/csv-to-json.js. ' +
        (config.chapters === 'volume'
          ? 'Sections come from the rule references (3.3.8 is in section 3.3; AW rules are the area-wide guidance), named after their area. Chapters come from the volume in "Supporting information". '
          : config.sections === 'link'
            ? 'Sections come from the web page each rule links to (…entry=3_3_… is section 3.3), named after their national design issue; chapters are named after the issue\'s group. '
            : 'Sections come from the rule references (4.2.1 is in section 4.2), named after their national design issue. Chapters are the first number of the reference, named after their rules\' most common national design feature, as the spreadsheet does not name them. ') +
        (references.some((reference, index) => reference !== rows[index]['Design code requirement reference'])
          ? 'The spreadsheet gives some rules the same reference, so those have -1, -2… added; printed-reference keeps the spreadsheet\'s. '
          : '') +
        (base['place-types'] ? 'Place types and development types are kept from the hand-extracted file (scripts/design-codes/east-riding.json) and matched to the spreadsheet\'s text. ' : '') +
        (rows.some(row => /^recommendation$/i.test(row.Type)) ? '"Recommendation" rules are key guidance, with type-name "Recommendation". ' : '')
    },
    'design-code': {
      ...baseMeta,
      reference: designCode,
      name,
      organisation: config.organisation,
      status: config.status || baseMeta.status,
      'document-type': DOCUMENT_TYPES[documentType.trim().toLowerCase()] || slugify(documentType),
      'design-code-type': config['design-code-type'] || baseMeta['design-code-type'],
      'adopted-date': baseMeta['adopted-date'] || partialDate(localDevelopmentDocument),
      coverage: config.coverage || baseMeta.coverage,
      'document-url': designCodeUrl,
      // Not in the schema yet: how the design code is adopted, as the spreadsheet words it
      'local-development-document': localDevelopmentDocument
    },
    'design-code-chapters': chapters,
    'design-code-sections': sections,
    'design-code-rules': rules,
    'place-types': placeTypes,
    'development-types': developmentTypes,
    'local-plan-policies': policies,
    'supporting-documents': [...documents.values()]
  }
}

// ---- Running it ----

const files = fs.readdirSync(SOURCE_DIR).filter(file => file.toLowerCase().endsWith('.csv'))
if (!files.length) {
  console.error(`No CSV files found in ${path.relative(ROOT, SOURCE_DIR)}`)
  process.exit(1)
}

const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

// The national sheets first, as the design codes use them
let nationalTypes = []
const typesFile = files.find(file => /development types/i.test(file))
if (typesFile) {
  nationalTypes = readDevelopmentTypes(path.join(SOURCE_DIR, typesFile))
  const output = path.join(NATIONAL_DIR, 'development-types.json')
  writeJson(output, {
    source: path.relative(ROOT, path.join(SOURCE_DIR, typesFile)),
    'development-types': nationalTypes
  })
  console.log(`Development types: ${nationalTypes.length} types -> ${path.relative(ROOT, output)}`)
}

const overviewFile = files.find(file => /overview/i.test(file))
if (overviewFile) {
  const overview = readOverview(path.join(SOURCE_DIR, overviewFile))
  const source = path.relative(ROOT, path.join(SOURCE_DIR, overviewFile))
  const fieldsOutput = path.join(NATIONAL_DIR, 'design-code-fields.json')
  writeJson(fieldsOutput, {
    source,
    _comment: 'The fields a design code rule has, grouped as the tabs of a rule\'s page, with the team\'s notes and open questions on each',
    groups: overview.groups
  })
  const useClassesOutput = path.join(NATIONAL_DIR, 'use-classes.json')
  writeJson(useClassesOutput, { source, 'use-classes': overview.useClasses })
  console.log(`Overview: ${overview.groups.length} field groups -> ${path.relative(ROOT, fieldsOutput)}; ` +
    `${overview.useClasses.length} use classes -> ${path.relative(ROOT, useClassesOutput)}`)
}

// Group every rule CSV's rows by design code, so one design code can span several files. Design
// codes that aren't in DESIGN_CODES yet are skipped.
const byDesignCode = new Map()
const skipped = new Map()
for (const file of files) {
  if (file === typesFile || file === overviewFile) continue
  const source = path.join(SOURCE_DIR, file)
  const rows = readRows(source)
  if (!rows.length || !('Design code requirement reference' in rows[0])) {
    console.warn(`Skipped ${file}: it has no "Design code requirement reference" column, so it isn't a list of rules`)
    continue
  }
  for (const row of rows) {
    const name = row['Design code']
    if (!DESIGN_CODES[name]) {
      skipped.set(name, file)
      continue
    }
    if (!byDesignCode.has(name)) byDesignCode.set(name, { sources: new Set(), rows: [] })
    byDesignCode.get(name).sources.add(source)
    byDesignCode.get(name).rows.push(row)
  }
}
for (const [name, file] of skipped) {
  console.warn(`Skipped "${name}" in ${file}: add its reference and council to DESIGN_CODES in scripts/csv-to-json.js to convert it`)
}

for (const [name, { sources, rows }] of byDesignCode) {
  const data = buildDesignCode(name, rows, [...sources], nationalTypes)
  const output = path.join(OUTPUT_DIR, DESIGN_CODES[name].file)
  writeJson(output, data)
  console.log(`${name}: ${rows.length} rules, ${data['design-code-sections'].length} sections, ` +
    `${data['design-code-chapters'].length} chapters, ${data['place-types'].length} place types, ` +
    `${data['development-types'].length} development types -> ${path.relative(ROOT, output)}`)
}
