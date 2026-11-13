//
// Checks the extracted design code data in app/data/design-codes/east-riding.json
// against app/data/schema.md.
//
// Run with: node scripts/validate-data.js [path to JSON]
// Exits with code 1 if anything fails, so it can be used in CI.
//
// To check more chapters as they're extracted, add a line to EXPECTED below.
//

const fs = require('fs')
const path = require('path')

// What each chapter should contain, as inclusive ranges
const EXPECTED = [
  { chapter: '3', codes: 'C1-C6', keyGuidance: 'G1-G4', tables: '3-4', figures: '19-24' }
]

const DEFAULT_FILE = path.join(__dirname, '..', 'app', 'data', 'design-codes', 'east-riding.json')

const OUTLINE_MATTERS = ['appearance', 'means-of-access', 'landscaping', 'layout', 'scale']
const COLUMN_TYPES = ['text', 'list', 'dot']
const CROSS_REFERENCE_TYPES = ['chapter', 'section', 'rule', 'table', 'figure']
const DOCUMENT_CATEGORIES = ['general-guidance', 'supporting-document']
// National values (schema.md, "National values")
const FEATURES = ['climate', 'nature', 'movement', 'built-form', 'public-space', 'identity']
const AREA_TYPES = ['town-or-city-centre', 'local-centre', 'urban-neighbourhood', 'suburbs', 'industrial-area', 'rural-settlements']
const DESIGN_CODE_TYPES = ['authority-wide', 'area-specific', 'site-specific']

// 'C1-C6' -> ['C1', ..., 'C6'], '3-4' -> ['3', '4']
function expandRange (range) {
  const match = /^([A-Z]?)(\d+)-\1(\d+)$/.exec(range)
  if (!match) throw new Error(`Range "${range}" should look like "C1-C6" or "3-4"`)
  const [, prefix, start, end] = match
  const references = []
  for (let n = Number(start); n <= Number(end); n++) references.push(prefix + n)
  return references
}

const isText = value => typeof value === 'string' && value.trim() !== ''
const isPage = value => Number.isInteger(value) && value > 0

function validate (data) {
  const errors = []
  const warnings = []
  const fail = (label, message) => errors.push(`${label}: ${message}`)

  const list = key => Array.isArray(data[key]) ? data[key] : []
  const chapters = list('design-code-chapters')
  const sections = list('design-code-sections')
  const rules = list('design-code-rules')
  const tables = list('design-code-tables')
  const figures = list('design-code-figures')
  const notes = list('design-code-notes')
  const definitions = list('design-code-definitions')
  const glossary = list('glossary-terms')
  const documents = list('supporting-documents')
  const policies = list('local-plan-policies')
  const developmentTypes = list('development-types')
  const placeTypes = list('place-types')

  const referencesOf = records => new Set(records.map(record => record.reference))
  const known = {
    chapter: referencesOf(chapters),
    section: referencesOf(sections),
    rule: referencesOf(rules),
    table: referencesOf(tables),
    figure: referencesOf(figures),
    glossary: referencesOf(glossary),
    document: referencesOf(documents),
    policy: referencesOf(policies),
    developmentType: referencesOf(developmentTypes),
    placeType: referencesOf(placeTypes)
  }

  // References are unique within each record type
  for (const [key, records] of Object.entries({ chapters, sections, rules, tables, figures, notes, definitions, glossary, documents, policies, developmentTypes, placeTypes })) {
    const counts = new Map()
    for (const record of records) counts.set(record.reference, (counts.get(record.reference) || 0) + 1)
    for (const [reference, count] of counts) {
      if (!isText(reference)) fail(key, 'a record has no reference')
      else if (count > 1) fail(`${key} ${reference}`, `appears ${count} times`)
    }
  }

  // Shared checks
  const checkPages = (label, record, required = true) => {
    if (!isPage(record['page-number'])) {
      if (required || record['page-number'] !== undefined) fail(label, 'has no page number')
    } else if (record['end-page-number'] !== undefined && !(isPage(record['end-page-number']) && record['end-page-number'] > record['page-number'])) {
      fail(label, `end-page-number ${record['end-page-number']} should be after page-number ${record['page-number']}`)
    }
  }
  const checkSection = (label, record) => {
    if (!known.section.has(record['design-code-section'])) fail(label, `section "${record['design-code-section']}" is not defined`)
  }
  const checkGlossaryTerms = (label, record) => {
    const terms = record['glossary-terms']
    if (terms === undefined) return
    if (!Array.isArray(terms)) return fail(label, 'glossary-terms should be a list')
    for (const term of terms) if (!known.glossary.has(term)) fail(label, `glossary term "${term}" is not defined`)
    if (new Set(terms).size !== terms.length) fail(label, 'lists a glossary term twice')
  }
  const checkMentions = (label, record) => {
    const mentions = record['supporting-documents']
    if (mentions === undefined) return
    if (!Array.isArray(mentions)) return fail(label, 'supporting-documents should be a list')
    for (const mention of mentions) {
      if (typeof mention !== 'object' || mention === null) { fail(label, 'each supporting document should be an object with supporting-document and listed-as'); continue }
      if (!known.document.has(mention['supporting-document'])) fail(label, `supporting document "${mention['supporting-document']}" is not defined`)
      if (!isText(mention['listed-as'])) fail(label, `mention of "${mention['supporting-document']}" has no listed-as wording`)
    }
  }
  const checkLinks = (label, record) => {
    const links = record.links
    if (links === undefined) return
    if (!Array.isArray(links)) return fail(label, 'links should be a list')
    for (const link of links) {
      if (!isText(link.text)) fail(label, 'a link has no text')
      if (!/^https?:\/\//.test(link.url || '')) fail(label, `link "${link.text}" has no web address`)
      if (link['supporting-document'] !== undefined && !known.document.has(link['supporting-document'])) fail(label, `link "${link.text}" points to undefined supporting document "${link['supporting-document']}"`)
    }
  }
  const checkPolicies = (label, record) => {
    for (const policy of record['local-plan-policies'] || []) {
      if (!known.policy.has(policy)) fail(label, `local plan policy "${policy}" is not defined`)
    }
  }

  // Every expected code, key guidance item, table and figure is present
  for (const { chapter, codes, keyGuidance, tables: tableRange, figures: figureRange } of EXPECTED) {
    for (const reference of expandRange(codes)) {
      const rule = rules.find(item => item.reference === reference)
      if (!rule) fail(`Chapter ${chapter}`, `${reference} is missing`)
      else if (rule.type !== 'code') fail(`Chapter ${chapter}`, `${reference} has type "${rule.type}", expected "code"`)
    }
    for (const reference of expandRange(keyGuidance)) {
      const rule = rules.find(item => item.reference === reference)
      if (!rule) fail(`Chapter ${chapter}`, `${reference} is missing`)
      else if (rule.type !== 'key-guidance') fail(`Chapter ${chapter}`, `${reference} has type "${rule.type}", expected "key-guidance"`)
    }
    for (const number of expandRange(tableRange)) {
      if (!tables.some(table => String(table.number) === number)) fail(`Chapter ${chapter}`, `Table ${number} is missing`)
    }
    for (const number of expandRange(figureRange)) {
      if (!figures.some(figure => String(figure.number) === number)) fail(`Chapter ${chapter}`, `Figure ${number} is missing`)
    }
  }

  for (const chapter of chapters) {
    const label = `Chapter ${chapter.reference}`
    if (!isText(chapter.name)) fail(label, 'has no name')
    checkPages(label, chapter, false)
    checkGlossaryTerms(label, chapter)
  }

  const designCodeType = (data['design-code'] || {})['design-code-type']
  if (!DESIGN_CODE_TYPES.includes(designCodeType)) fail('Design code', `design-code-type "${designCodeType}" is not one of ${DESIGN_CODE_TYPES.join(', ')}`)

  for (const placeType of placeTypes) {
    const label = `Place type ${placeType.reference}`
    if (!isText(placeType['local-name'])) fail(label, 'has no local-name')
    if (!placeType['area-type']) warnings.push(`${label}: has no national area type, so it is local-only`)
    else if (!AREA_TYPES.includes(placeType['area-type'])) fail(label, `area-type "${placeType['area-type']}" is not one of ${AREA_TYPES.join(', ')}`)
  }

  for (const section of sections) {
    const label = `Section ${section.reference}`
    if (!known.chapter.has(section['design-code-chapter'])) fail(label, `chapter "${section['design-code-chapter']}" is not defined`)
    if (!isText(section.name)) fail(label, 'has no name')
    checkPages(label, section, false)
    checkMentions(label, section)
    checkPolicies(label, section)
    checkGlossaryTerms(label, section)
    for (const old of ['definitions', 'note-text']) {
      if (section[old] !== undefined) fail(label, `uses "${old}", which is now a separate record type`)
    }
  }

  for (const rule of rules) {
    const label = rule.reference || '(rule with no reference)'
    checkSection(label, rule)
    checkPages(label, rule)
    if (!['code', 'key-guidance'].includes(rule.type)) fail(label, `type "${rule.type}" should be "code" or "key-guidance"`)
    if (!isText(rule['requirement-text'])) fail(label, 'has no requirement text')

    const appliesTo = rule['development-types']
    if (!Array.isArray(appliesTo) || appliesTo.length === 0) {
      fail(label, 'has no development types')
    } else {
      for (const value of appliesTo) {
        if (!known.developmentType.has(value)) fail(label, `applies to "${value}", which is not a defined development type`)
      }
    }
    for (const value of rule['place-types'] || []) {
      if (!known.placeType.has(value)) fail(label, `applies to place type "${value}", which is not defined`)
    }
    const features = rule.features
    if (!Array.isArray(features) || features.length === 0) fail(label, 'has no features')
    for (const feature of features || []) {
      if (!FEATURES.includes(feature)) fail(label, `feature "${feature}" is not one of ${FEATURES.join(', ')}`)
    }
    if (rule['features-status'] && rule['features-status'] !== 'proposed') fail(label, 'features-status should be "proposed" or empty')
    if (rule['features-status'] === 'proposed') warnings.push(`${label}: features are proposed, not confirmed`)
    for (const matter of rule['outline-application-matters'] || []) {
      if (!OUTLINE_MATTERS.includes(matter)) fail(label, `outline application matter "${matter}" is not one of ${OUTLINE_MATTERS.join(', ')}`)
    }
    checkPolicies(label, rule)
    checkMentions(label, rule)
    checkLinks(label, rule)
    checkGlossaryTerms(label, rule)
    for (const table of rule['design-code-tables'] || []) {
      if (!known.table.has(table)) fail(label, `table "${table}" is not defined`)
    }
    for (const crossReference of rule['cross-references'] || []) {
      if (!CROSS_REFERENCE_TYPES.includes(crossReference.type)) fail(label, `cross-reference type "${crossReference.type}" is not one of ${CROSS_REFERENCE_TYPES.join(', ')}`)
      if (!isText(crossReference['listed-as'])) fail(label, `cross-reference to ${crossReference.reference} has no listed-as wording`)
      // Chapters that haven't been extracted yet can still be pointed to
      const targets = { section: known.section, rule: known.rule, table: known.table, figure: known.figure }[crossReference.type]
      if (targets && !targets.has(crossReference.reference)) warnings.push(`${label}: cross-reference to ${crossReference.type} ${crossReference.reference}, which isn't extracted yet`)
    }
    if (rule['related-rules'] !== undefined) fail(label, 'uses "related-rules", which is now "cross-references"')
  }

  for (const table of tables) {
    const label = `Table ${table.number}`
    checkSection(label, table)
    checkPages(label, table)
    checkGlossaryTerms(label, table)
    if (!Number.isInteger(table.number)) fail(label, 'has no number')
    if (!isText(table.name)) fail(label, 'has no caption')
    for (const rule of table['design-code-rules'] || []) {
      if (!known.rule.has(rule)) fail(label, `rule "${rule}" is not defined`)
    }

    const columns = Array.isArray(table.columns) ? table.columns : []
    if (columns.length === 0) { fail(label, 'has no columns'); continue }
    const columnKeys = columns.map(column => column.reference)
    if (new Set(columnKeys).size !== columnKeys.length) fail(label, 'has two columns with the same reference')
    for (const column of columns) {
      if (!isText(column.reference) || !isText(column.name)) fail(label, 'has a column without a reference or name')
      if (!COLUMN_TYPES.includes(column.type)) fail(label, `column "${column.reference}" has type "${column.type}", expected one of ${COLUMN_TYPES.join(', ')}`)
    }

    const rows = Array.isArray(table.rows) ? table.rows : []
    if (rows.length === 0) fail(label, 'has no rows')
    rows.forEach((row, index) => {
      const rowLabel = `${label} row ${index + 1}`
      if (Array.isArray(row) || typeof row !== 'object' || row === null) return fail(rowLabel, 'should be an object keyed by column reference, not a list')
      const keys = Object.keys(row)
      for (const key of keys) if (!columnKeys.includes(key)) fail(rowLabel, `has a value for "${key}", which is not a column`)
      for (const column of columns) {
        const value = row[column.reference]
        if (value === undefined) fail(rowLabel, `has no value for "${column.reference}"`)
        else if (column.type === 'dot' && typeof value !== 'boolean') fail(rowLabel, `"${column.reference}" should be true or false`)
        else if (column.type === 'text' && !isText(value)) fail(rowLabel, `"${column.reference}" should be text`)
        else if (column.type === 'list' && !(Array.isArray(value) && value.length && value.every(isText))) fail(rowLabel, `"${column.reference}" should be a list of text`)
      }
    })
  }

  for (const figure of figures) {
    const label = `Figure ${figure.number}`
    checkSection(label, figure)
    checkPages(label, figure)
    checkGlossaryTerms(label, figure)
    if (!Number.isInteger(figure.number)) fail(label, 'has no number')
    if (!isText(figure.caption)) fail(label, 'has no caption')
    if (/^Figure \d/.test(figure.caption || '')) fail(label, 'caption should not start with "Figure N"')
    // /public/... is served from app/assets/...
    if (figure.image && !fs.existsSync(path.join(__dirname, '..', 'app', 'assets', figure.image.replace(/^\/public\//, '')))) {
      fail(label, `image "${figure.image}" does not exist`)
    }
    const panels = figure['panel-headings'] || []
    if (!Array.isArray(figure.labels)) fail(label, 'labels should be a list')
    for (const item of figure.labels || []) {
      if (!isText(item.text)) fail(label, 'has a label with no text')
      if (panels.length && !panels.includes(item.panel)) fail(label, `label "${item.text}" should name one of its panels: ${panels.join(', ')}`)
    }
  }

  for (const note of notes) {
    const label = `Note ${note.reference}`
    checkSection(label, note)
    checkPages(label, note)
    checkGlossaryTerms(label, note)
    checkLinks(label, note)
    if (!isText(note.heading)) fail(label, 'has no heading')
    if (!isText(note.text)) fail(label, 'has no text')
  }

  for (const definition of definitions) {
    const label = `Definition ${definition.reference}`
    checkSection(label, definition)
    checkPages(label, definition)
    checkGlossaryTerms(label, definition)
    if (!isText(definition.term)) fail(label, 'has no term')
    if (!isText(definition.text)) fail(label, 'has no text')
  }

  for (const term of glossary) {
    const label = `Glossary term ${term.reference}`
    checkPages(label, term)
    if (!isText(term.term)) fail(label, 'has no term')
    if (!isText(term.definition)) fail(label, 'has no definition')
  }

  for (const document of documents) {
    const label = `Supporting document ${document.reference}`
    checkPages(label, document)
    if (!isText(document.title)) fail(label, 'has no title')
    if (!DOCUMENT_CATEGORIES.includes(document.category)) fail(label, `category "${document.category}" should be one of ${DOCUMENT_CATEGORIES.join(', ')}`)
    if (document['publication-date'] && !/^\d{4}(-\d{2}){0,2}$/.test(document['publication-date'])) fail(label, `publication date "${document['publication-date']}" should be YYYY, YYYY-MM or YYYY-MM-DD`)
    if (document['document-url'] && !/^https?:\/\//.test(document['document-url'])) fail(label, `document-url "${document['document-url']}" is not a web address`)
    for (const old of ['name', 'author']) {
      if (document[old] !== undefined) fail(label, `uses "${old}", which is now "${old === 'name' ? 'title' : 'publisher'}"`)
    }
    if (!isText(document.publisher)) warnings.push(`${label}: has no publisher`)
    if (!isText(document['publication-date'])) warnings.push(`${label}: has no publication date`)
  }

  // Shared records nothing points to
  const usedTerms = new Set([...chapters, ...sections, ...rules, ...tables, ...figures, ...notes, ...definitions].flatMap(record => record['glossary-terms'] || []))
  for (const term of glossary) if (!usedTerms.has(term.reference)) warnings.push(`Glossary term ${term.reference}: nothing refers to it`)
  const usedDocuments = new Set([...sections, ...rules].flatMap(record => (record['supporting-documents'] || []).map(mention => mention['supporting-document'])))
  for (const document of documents) if (!usedDocuments.has(document.reference)) warnings.push(`Supporting document ${document.reference}: nothing refers to it`)

  // Items no expected range covers, so new chapters aren't missed
  const expectedReferences = new Set(EXPECTED.flatMap(({ codes, keyGuidance }) => [...expandRange(codes), ...expandRange(keyGuidance)]))
  const unexpected = rules.map(rule => rule.reference).filter(reference => !expectedReferences.has(reference))

  const counts = {
    'codes and key guidance': rules.length,
    sections: sections.length,
    tables: tables.length,
    'table rows': tables.reduce((total, table) => total + (table.rows || []).length, 0),
    figures: figures.length,
    'figure labels': figures.reduce((total, figure) => total + (figure.labels || []).length, 0),
    notes: notes.length,
    definitions: definitions.length,
    'glossary terms': glossary.length,
    'supporting documents': documents.length,
    'local plan policies': policies.length
  }

  return { errors, warnings, unexpected, counts }
}

const file = process.argv[2] || DEFAULT_FILE
const data = JSON.parse(fs.readFileSync(file, 'utf8'))
const { errors, warnings, unexpected, counts } = validate(data)

console.log(`Checked ${path.relative(process.cwd(), file)}`)
console.log(Object.entries(counts).map(([name, count]) => `  ${count} ${name}`).join('\n'))
console.log(`Expected: ${EXPECTED.map(({ chapter, codes, keyGuidance, tables, figures }) => `chapter ${chapter} (${codes}, ${keyGuidance}, tables ${tables}, figures ${figures})`).join('; ')}`)

if (unexpected.length) {
  console.log(`\nWarning: ${unexpected.length} item(s) not in any expected range: ${unexpected.join(', ')}`)
  console.log('Add their chapter to EXPECTED in scripts/validate-data.js to check them.')
}

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`)
  for (const warning of warnings) console.log(`  - ${warning}`)
}

if (errors.length) {
  console.log(`\n${errors.length} problem(s) found:`)
  for (const error of errors) console.log(`  - ${error}`)
  process.exitCode = 1
} else {
  console.log('\nNo problems found.')
}
