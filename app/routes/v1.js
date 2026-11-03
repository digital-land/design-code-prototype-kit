//
// Routes for version 1 of the prototype, served under /v1
//
// To make a new version, copy this file and app/views/v1/,
// then change BASE_URL and VIEWS below.
//

const govukPrototypeKit = require('govuk-prototype-kit')

const BASE_URL = '/v1'
const VIEWS = 'v1'

const router = govukPrototypeKit.requests.setupRouter(BASE_URL)

const PLANNING_DATA_URL = 'https://www.planning.data.gov.uk'

// Templates build every internal link from baseUrl, so nothing points outside this version.
// The current path lets the header navigation highlight the active section.
router.use((req, res, next) => {
  res.locals.baseUrl = BASE_URL
  res.locals.currentPath = req.baseUrl + req.path
  next()
})

async function fetchJson (path) {
  const response = await fetch(PLANNING_DATA_URL + path)
  if (!response.ok) {
    const error = new Error(`Request to ${path} failed with status ${response.status}`)
    error.status = response.status
    throw error
  }
  return response.json()
}

// Search uses a snapshot of real entities from planning.data.gov.uk
// so it works offline and responds instantly
const searchData = require('../data/search.json')

const SEARCH_PAGE_SIZE = 10

// Take entities from each dataset in turn so the default
// view shows the range of data rather than one bulk upload
const searchEntities = (() => {
  const byDataset = new Map()
  searchData.entities.forEach(entity => {
    if (!byDataset.has(entity.dataset)) byDataset.set(entity.dataset, [])
    byDataset.get(entity.dataset).push(entity)
  })
  const queues = [...byDataset.values()]
  const ordered = []
  while (ordered.length < searchData.entities.length) {
    queues.forEach(queue => queue.length && ordered.push(queue.shift()))
  }
  return ordered
})()

function toArray (value) {
  if (value === undefined || value === '') return []
  return [].concat(value).filter(Boolean)
}

function parseEntryDate (query) {
  const day = parseInt(query.entry_date_day, 10)
  const month = parseInt(query.entry_date_month, 10)
  const year = parseInt(query.entry_date_year, 10)
  if (!year) return null

  // Missing day or month widens the date to the start of the month or year
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1))
  if (isNaN(date)) return null
  return date.toISOString().slice(0, 10)
}

function searchUrl (query, changes) {
  const params = new URLSearchParams()
  Object.entries({ ...query, ...changes }).forEach(([key, value]) => {
    toArray(value).forEach(item => params.append(key, item))
  })
  const queryString = params.toString()
  return BASE_URL + '/search' + (queryString ? '?' + queryString : '')
}

// Numbered pages around the current one, with ellipses for gaps
function paginationItems (query, currentPage, totalPages) {
  const items = []
  let previous = 0
  for (let page = 1; page <= totalPages; page++) {
    const nearCurrent = Math.abs(page - currentPage) <= 1
    if (page !== 1 && page !== totalPages && !nearCurrent) continue
    if (page - previous > 1) items.push({ ellipsis: true })
    items.push({
      number: page,
      href: searchUrl(query, { offset: (page - 1) * SEARCH_PAGE_SIZE || undefined }),
      current: page === currentPage
    })
    previous = page
  }
  return items
}

router.get('/search', (req, res) => {
  const query = req.query
  const selected = {
    datasets: toArray(query.dataset),
    organisations: toArray(query.organisation_entity),
    geographies: toArray(query.geometry_curie)
  }
  const entryDate = parseEntryDate(query)
  const entryDateMatch = query.entry_date_match === 'before' ? 'before' : 'since'

  const results = searchEntities.filter(entity => {
    if (selected.datasets.length && !selected.datasets.includes(entity.dataset)) return false
    if (selected.organisations.length && !selected.organisations.includes(String(entity.organisationEntity))) return false
    if (selected.geographies.length && !selected.geographies.includes(entity.geography)) return false
    if (entryDate) {
      if (entryDateMatch === 'since' && entity.entryDate < entryDate) return false
      if (entryDateMatch === 'before' && entity.entryDate >= entryDate) return false
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(results.length / SEARCH_PAGE_SIZE))
  const offset = Math.max(0, parseInt(query.offset, 10) || 0)
  const currentPage = Math.min(totalPages, Math.floor(offset / SEARCH_PAGE_SIZE) + 1)
  const start = (currentPage - 1) * SEARCH_PAGE_SIZE

  const pagination = { items: paginationItems(query, currentPage, totalPages) }
  if (currentPage > 1) {
    pagination.previous = { href: searchUrl(query, { offset: (currentPage - 2) * SEARCH_PAGE_SIZE || undefined }) }
  }
  if (currentPage < totalPages) {
    pagination.next = { href: searchUrl(query, { offset: currentPage * SEARCH_PAGE_SIZE }) }
  }

  // Show selected options first so they stay visible in long lists
  const options = (list, values) => list
    .map(option => ({ ...option, checked: values.includes(option.value) }))
    .sort((a, b) => b.checked - a.checked)

  res.render(`${VIEWS}/search`, {
    results: results.slice(start, start + SEARCH_PAGE_SIZE),
    resultCount: results.length,
    firstResult: results.length ? start + 1 : 0,
    lastResult: Math.min(start + SEARCH_PAGE_SIZE, results.length),
    pagination: totalPages > 1 ? pagination : null,
    query,
    selected,
    entryDateMatch,
    hasEntryDate: Boolean(entryDate),
    datasetOptions: options(searchData.filters.datasets, selected.datasets),
    organisationOptions: options(searchData.filters.organisations, selected.organisations),
    geographyOptions: options(searchData.filters.geographies, selected.geographies)
  })
})

// Extracted design codes, shared by every version (app/data/index.js)
const extractedDesignCodes = require('../data')

// Things the East Riding page shows that aren't in the extracted data yet,
// such as illustrations, keyed by page (for example east-riding)
const designCodePageExtras = require('../data/design-codes.json')

// A council's design code page, filled from the extracted data.
// The Section select lists chapters and the Area select lists each chapter's sections.
router.get('/design-code/:code', (req, res, next) => {
  const extracted = extractedDesignCodes.get(`${req.params.code}-design-code`)
  if (!extracted) return next()
  const extras = designCodePageExtras[req.params.code] || {}

  const designCode = {
    name: extracted.title,
    description: extracted.summary,
    sections: extracted.chapters.map(chapter => ({
      id: `chapter-${chapter.reference}`,
      name: chapter.name.replace(/^Codes and Guidance:\s*/i, ''),
      areas: chapter.sections.map(section => ({
        id: section.slug,
        name: section.name,
        image: (extras.figures || {})[section.reference],
        overview: section.introText,
        keyGuidance: section.rules.filter(rule => rule.type === 'key-guidance'),
        codes: section.rules.filter(rule => rule.type === 'code')
      }))
    }))
  }

  // Open on the chosen section and area, or the page's default area
  const section = designCode.sections.find(item => item.id === req.query.section) || designCode.sections[0]
  const area = section.areas.find(item => item.id === req.query.area) ||
    section.areas.find(item => item.id === extras.defaultArea) ||
    section.areas[0]

  // Send "Back" to the entity page the user came from, if that's how they got here.
  // Only the path is used, so the link always stays on this site.
  const referrerPath = new URL(req.get('referer') || '/', 'http://localhost').pathname
  const cameFromEntity = referrerPath.startsWith(BASE_URL + '/entity/') && /^\d+$/.test(referrerPath.slice((BASE_URL + '/entity/').length))

  res.render(`${VIEWS}/design-code/code`, {
    backHref: cameFromEntity ? referrerPath : BASE_URL + '/design-code/search',
    code: req.params.code,
    designCode,
    section,
    area
  })
})

// Data layers, as on planning.data.gov.uk/map
const mapLayers = require('../data/map-layers.json').layers

// Boundaries of the areas the prototype's design codes cover, keyed by page (for example east-riding)
const designCodeAreaBoundaries = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'assets', 'data', 'design-code-areas.geojson'), 'utf8'))

// Map of planning data. Layers load live from planning.data.gov.uk. Design codes extracted in
// this prototype aren't on the platform yet, so their areas are added to the "Design code area"
// layer from the prototype's own data, and each new design code appears there once extracted.
router.get('/map', (req, res) => {
  const prototypeDesignCodeAreas = {
    type: 'FeatureCollection',
    features: extractedDesignCodes.list().flatMap(designCode => {
      const code = designCode.id.replace(/-design-code$/, '')
      const boundary = designCodeAreaBoundaries.features.find(feature => feature.properties.id === code)
      if (!boundary) return []
      return [{
        type: 'Feature',
        geometry: boundary.geometry,
        properties: {
          name: designCode.title,
          area: boundary.properties.name,
          href: `${BASE_URL}/design-code/${code}`
        }
      }]
    })
  }

  res.render(`${VIEWS}/map`, { mapLayers, prototypeDesignCodeAreas })
})

// Show a single entity using live data from planning.data.gov.uk
router.get('/entity/:id', async (req, res) => {
  const id = req.params.id

  if (!/^\d+$/.test(id)) {
    return res.status(404).render(`${VIEWS}/entity`, { error: { status: 404 }, id })
  }

  let entity
  try {
    entity = await fetchJson(`/entity/${id}.json`)
  } catch (error) {
    return res.status(error.status === 404 ? 404 : 502).render(`${VIEWS}/entity`, { error, id })
  }

  // The dataset and organisation names are nice to have,
  // so fall back gracefully if either lookup fails
  const [dataset, organisation, geojson] = await Promise.all([
    fetchJson(`/dataset/${entity.dataset}.json`).catch(() => null),
    entity['organisation-entity']
      ? fetchJson(`/entity/${entity['organisation-entity']}.json`).catch(() => null)
      : null,
    fetchJson(`/entity/${id}.geojson`).catch(() => null)
  ])

  res.render(`${VIEWS}/entity`, {
    entity,
    dataset,
    datasetName: dataset ? dataset.name : entity.dataset,
    organisationName: organisation ? organisation.name : entity['organisation-entity'],
    qualityText: QUALITY_TEXT[entity.quality] || entity.quality,
    licenceHtml: dataset ? markdownLinks(dataset['licence-text']) : '',
    // We have our own copy of this one planning consideration page
    considerationUrl: dataset && dataset.consideration === 'air-quality-management-areas'
      ? BASE_URL + '/design-data/consideration/air-quality-management-areas'
      : dataset && dataset.consideration && `https://design.planning.data.gov.uk/planning-consideration/${dataset.consideration}`,
    entityJson: JSON.stringify(entity, null, 2),
    geojsonText: geojson ? JSON.stringify(geojson, null, 2) : '',
    hasGeometry: Boolean(entity.geometry || entity.point),
    planningDataUrl: PLANNING_DATA_URL,
    geojsonUrl: `${PLANNING_DATA_URL}/entity/${id}.geojson`
  })
})

// How planning.data.gov.uk describes each quality level
const QUALITY_TEXT = {
  authoritative: 'Authoritative: We have some data from the authoritative source'
}

// Turn "[text](url)" in dataset licence text into escaped HTML links
function markdownLinks (text) {
  if (!text) return ''
  const escape = value => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)
  return escape(text).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a class="govuk-link" href="$2">$1</a>')
}
