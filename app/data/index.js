//
// Shared loader for extracted design code data.
//
// Reads every JSON file in app/data/design-codes/ (one file per design code, in the
// shape described in app/data/schema.md) and turns each into a view model that any
// version's routes can render. Files are read on each request, so newly extracted
// chapters show up without restarting the prototype.
//
//   const designCodes = require('../data')
//   designCodes.list()   // every design code, sorted by name
//   designCodes.get(id)  // one design code by its reference, or undefined
//

const fs = require('fs')
const path = require('path')

const DESIGN_CODES_DIR = path.join(__dirname, 'design-codes')

// Organisation names, keyed by planning.data.gov.uk CURIE.
// The data stores only the CURIE; add councils here as their design codes are added.
const ORGANISATIONS = {
  'local-authority:ERY': 'East Riding of Yorkshire Council'
}

// GOV.UK tag colour for each status
const STATUS_TAGS = {
  draft: { text: 'Draft', classes: 'govuk-tag--grey' },
  consultation: { text: 'Consultation', classes: 'govuk-tag--yellow' },
  adopted: { text: 'Adopted', classes: 'govuk-tag--green' },
  withdrawn: { text: 'Withdrawn', classes: 'govuk-tag--red' }
}

const OUTLINE_MATTERS = {
  appearance: 'Appearance',
  'means-of-access': 'Means of access',
  landscaping: 'Landscaping',
  layout: 'Layout',
  scale: 'Scale'
}

// "2025-09" -> "September 2025", "2025-09-14" -> "14 September 2025"
function formatPartialDate (value) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  if (!month) return String(year)
  const date = new Date(Date.UTC(year, month - 1, day || 1))
  return date.toLocaleDateString('en-GB', {
    ...(day ? { day: 'numeric' } : {}),
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

// "east-riding-design-code:village" -> "village"
function shortReference (reference) {
  return String(reference).split(':').pop()
}

// "Trees and Hedgerows" -> "trees-and-hedgerows"
function slugify (value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function readFiles () {
  if (!fs.existsSync(DESIGN_CODES_DIR)) return []
  return fs.readdirSync(DESIGN_CODES_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => JSON.parse(fs.readFileSync(path.join(DESIGN_CODES_DIR, file), 'utf8')))
}

function toViewModel (data) {
  const meta = data['design-code']
  const developmentTypes = data['development-types'] || []
  const typeName = new Map(developmentTypes.map(type => [type.reference, type.name]))
  const typeCode = new Map(developmentTypes.map(type => [type.reference, type.code]))
  const rules = data['design-code-rules'] || []
  const sections = data['design-code-sections'] || []
  const chapters = data['design-code-chapters'] || []
  const tables = data['design-code-tables'] || []
  const figures = data['design-code-figures'] || []
  const documents = new Map((data['supporting-documents'] || []).map(document => [document.reference, document]))

  // A supporting document from Appendix B, for listing under a section or rule
  const documentViewModel = reference => {
    const document = documents.get(reference)
    if (!document) return undefined
    return {
      reference,
      title: document.title,
      publisher: document.publisher,
      date: formatPartialDate(document['publication-date']),
      url: document['document-url']
    }
  }

  // Tables a rule uses, plus any table in its section that no rule points to
  // (such as a glossary table that explains another table)
  const tableViewModel = table => ({
    reference: table.reference,
    number: table.number,
    name: table.name,
    columns: table.columns,
    // Headings printed over groups of columns, with how many columns each covers
    columnGroups: table.columns.some(column => column.group)
      ? table.columns.reduce((groups, column) => {
        const last = groups[groups.length - 1]
        if (last && last.name === (column.group || '')) last.span++
        else groups.push({ name: column.group || '', span: 1 })
        return groups
      }, [])
      : [],
    rows: table.rows,
    pageNumber: table['page-number']
  })
  const tablesFor = rule => tables
    .filter(table => (rule['design-code-tables'] || []).includes(table.reference) ||
      (table['design-code-section'] === rule['design-code-section'] && !(table['design-code-rules'] || []).length))
    .map(tableViewModel)

  // The first figure in a section that has an image
  const figureFor = sectionReference => {
    const figure = figures.find(item => item['design-code-section'] === sectionReference && item.image)
    if (!figure) return undefined
    // Describe the figure from its callout labels, grouped by panel where it has them
    const labels = figure.labels || []
    // ['pond', 'swale', 'tree'] -> 'pond, swale and tree'
    const list = items => items.map(label => label.text.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1')
    const panels = figure['panel-headings'] || []
    const description = panels.length
      ? panels.map(panel => `${panel.charAt(0)}${panel.slice(1).toLowerCase()}: ${list(labels.filter(label => label.panel === panel))}.`).join(' ')
      : labels.length ? `Shows ${list(labels)}.` : ''
    return { number: figure.number, caption: figure.caption, src: figure.image, description }
  }

  // Supporting documents from the section's footer box, then any the rule's own text names
  const documentsFor = (section, rule) => {
    const references = [...(section['supporting-documents'] || []), ...(rule['supporting-documents'] || [])]
      .map(mention => mention['supporting-document'])
    return [...new Set(references)].map(documentViewModel).filter(Boolean)
  }

  // Development types any extracted rule applies to, in the order the design code lists them
  const usedTypes = new Set(rules.flatMap(rule => rule['development-types'] || []))
  const appliesTo = developmentTypes.filter(type => usedTypes.has(type.reference)).map(type => type.name)

  const ruleViewModel = rule => ({
    reference: rule.reference,
    type: rule.type,
    typeName: rule.type === 'code' ? 'Code' : 'Key guidance',
    title: rule.title,
    requirementText: rule['requirement-text'],
    guidanceText: rule['guidance-text'],
    developmentTypes: (rule['development-types'] || []).map(reference => typeName.get(reference) || reference),
    developmentTypeCodes: (rule['development-types'] || []).map(reference => typeCode.get(reference)).filter(Boolean),
    // Short references, without the design code prefix, for filtering:
    // "east-riding-design-code:householder" -> "householder"
    developmentTypeIds: (rule['development-types'] || []).map(shortReference),
    // Each development type the rule applies to, with its key and Table 1 description
    developmentTypeDetails: (rule['development-types'] || [])
      .map(reference => developmentTypes.find(type => type.reference === reference))
      .filter(Boolean)
      .map(type => ({ code: type.code, name: type.name, description: type.description })),
    // Empty means the rule applies in every place type
    placeTypeIds: (rule['place-types'] || []).map(shortReference),
    // National features, such as "nature"
    features: rule.features || [],
    outlineMatters: (rule['outline-application-matters'] || []).map(matter => OUTLINE_MATTERS[matter] || matter),
    localPlanPolicies: (rule['local-plan-policies'] || []).map(policy => policy.replace('-', ' ')),
    pageNumber: rule['page-number']
  })

  // Chapters, each with its sections, each with its rules. Only extracted content is included.
  const chapterViewModels = chapters.map(chapter => ({
    reference: chapter.reference,
    name: chapter.name,
    // "Codes and Guidance: Environment" -> "environment", the chapter's topic
    topic: slugify(chapter.name.replace(/^Codes and Guidance:\s*/i, '')),
    introText: chapter['intro-text'],
    sections: sections
      .filter(section => section['design-code-chapter'] === chapter.reference)
      .map(section => ({
        reference: section.reference,
        slug: slugify(section.name),
        name: section.name,
        introText: section['intro-text'],
        pageNumber: section['page-number'],
        rules: rules
          .filter(rule => rule['design-code-section'] === section.reference)
          .map(rule => ({
            ...ruleViewModel(rule),
            section: { reference: section.reference, name: section.name, introText: section['intro-text'] },
            tables: tablesFor(rule),
            figure: figureFor(section.reference),
            supportingDocuments: documentsFor(section, rule)
          }))
      }))
  }))

  return {
    id: meta.reference,
    title: meta.name,
    council: ORGANISATIONS[meta.organisation] || meta.organisation,
    status: STATUS_TAGS[meta.status] || { text: meta.status, classes: 'govuk-tag--grey' },
    coverage: meta.coverage,
    designCodeType: meta['design-code-type'],
    // The council's place types, each with the national area type it matches (empty if none)
    placeTypes: (data['place-types'] || []).map(placeType => ({
      id: shortReference(placeType.reference),
      localName: placeType['local-name'],
      areaType: placeType['area-type']
    })),
    appliesTo,
    // Development types used by the extracted rules, with their keys, for glossaries
    developmentTypes: developmentTypes
      .filter(type => usedTypes.has(type.reference))
      .map(type => ({ reference: type.reference, code: type.code, name: type.name, description: type.description })),
    lastUpdated: formatPartialDate(meta['last-updated-date']),
    adopted: formatPartialDate(meta['adopted-date']),
    summary: meta.description,
    version: meta.version,
    documentType: meta['document-type'],
    preparedBy: [].concat(meta['prepared-by'] || []),
    localPlan: meta['local-plan'],
    documentUrl: meta['document-url'],
    chapters: chapterViewModels,
    extractedChapters: chapters.map(chapter => `Chapter ${chapter.reference}: ${chapter.name}`),
    codeCount: rules.filter(rule => rule.type === 'code').length,
    keyGuidanceCount: rules.filter(rule => rule.type === 'key-guidance').length
  }
}

function list () {
  return readFiles().map(toViewModel).sort((a, b) => a.title.localeCompare(b.title))
}

function get (id) {
  return list().find(designCode => designCode.id === id)
}

module.exports = { list, get }
