//
// Routes for version 3 of the prototype, served under /v3
//
// To make a new version, copy this file and app/views/v1/,
// then change BASE_URL and VIEWS below.
//

const govukPrototypeKit = require('govuk-prototype-kit')

const BASE_URL = '/v3'
const VIEWS = 'v3'

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

// Design code finder and each council's design code page.
// Content comes from the extracted data (app/data/index.js) where it exists. The v2 JSON
// holds the map areas, placeholder cards for councils not yet extracted, and things
// not in the extracted data yet, such as illustrations.
const designCodeData = require('../data/v2/design-codes.json')
const extractedDesignCodes = require('../data')
const { FEATURES, AREA_TYPES, DESIGN_CODE_TYPES } = require('../data/national')

function extractedFor (slug) {
  return extractedDesignCodes.get(`${slug}-design-code`)
}

// A card's title, council and status, from the extracted data if there is any
function cardDesignCode (slug) {
  const placeholder = designCodeData.designCodes[slug]
  const extracted = extractedFor(slug)
  if (!extracted) return placeholder
  return { ...placeholder, name: extracted.title, council: extracted.council, status: extracted.status.text }
}

// Landing page for design codes, linking to the guidance and the finder (as in v2)
router.get('/design-code', (req, res) => {
  res.render(`${VIEWS}/design-code`)
})

// Guidance on preparing a design code
router.get('/design-code/learn', (req, res) => {
  res.render(`${VIEWS}/design-code/learn`)
})

// Find a design code by ticking councils or choosing areas on a map (as in v2).
// Without JavaScript, the search narrows the list when sent.
router.get('/design-code/find', (req, res) => {
  const selectedIds = toArray(req.query.area).filter(id => designCodeData.areas.some(area => area.id === id))
  const search = (req.query.q || '').trim()
  const isSelected = area => selectedIds.includes(area.id)
  // The chosen areas' design codes come first in the list
  const cards = designCodeData.areas
    .map(area => ({
      area,
      slug: area.designCode,
      designCode: cardDesignCode(area.designCode)
    }))
    .sort((a, b) => isSelected(b.area) - isSelected(a.area))

  res.render(`${VIEWS}/design-code/find`, {
    areas: designCodeData.areas.map(area => ({
      ...area,
      hidden: Boolean(search) && !area.council.toLowerCase().includes(search.toLowerCase())
    })),
    cards,
    selectedIds,
    search
  })
})

// Filter options on a council's design code page. Values match the short references
// in the extracted data (see app/data/index.js), so they work for any council.
const DEVELOPMENT_TYPE_OPTIONS = [
  { value: 'householder', text: 'Householder extension or minor works' },
  { value: '1-2-units', text: '1 to 2 new homes' },
  { value: '3-9-units', text: '3 to 9 new homes' },
  { value: '10-plus-units', text: '10 or more new homes' },
  { value: 'mixed-use', text: 'Mixed use' },
  { value: 'flats', text: 'Flats' },
  { value: 'agricultural', text: 'Agricultural' },
  { value: 'industrial-storage-and-distribution', text: 'Industrial, storage and distribution' },
  { value: 'commercial', text: 'Commercial' },
  { value: 'advertisement-consent', text: 'Advertisement consent' }
]

const PLACE_TYPE_OPTIONS = [
  { value: 'town-centre', text: 'Town centre' },
  { value: 'inner-neighbourhood', text: 'Inner neighbourhood' },
  { value: 'outer-neighbourhood', text: 'Outer neighbourhood' },
  { value: 'neighbourhood-centre', text: 'Neighbourhood centre' },
  { value: 'village', text: 'Village' },
  { value: 'countryside', text: 'Countryside' },
  { value: 'business-and-industrial', text: 'Business and industrial' }
]

const REQUIREMENT_TYPE_OPTIONS = [
  { value: 'code', text: 'Codes (must be met)' },
  { value: 'key-guidance', text: 'Guidance (should be followed)' }
]

function readDesignCodeFilters (query) {
  // The prototype kit adds "_unchecked" for checkbox groups with nothing ticked
  const list = value => toArray(value).filter(item => item !== '_unchecked')
  const one = value => list(value)[0] || ''
  return {
    developmentType: one(query['development-type']),
    // Area type: the value is the council's own place type, such as "inner-neighbourhood"
    placeType: one(query['place-type']),
    features: list(query.feature),
    designCodeTypes: list(query['design-code-type']),
    requirementTypes: list(query['requirement-type']),
    search: (query.q || '').trim()
  }
}

// Does a rule match every filter? Feature is checked separately so its counts can ignore it.
function ruleMatches (rule, filters, designCodeType) {
  if (filters.designCodeTypes.length && !filters.designCodeTypes.includes(designCodeType)) return false
  if (filters.developmentType && !rule.developmentTypeIds.includes(filters.developmentType)) return false
  // A rule with no place types applies in every place type
  if (filters.placeType && rule.placeTypeIds.length && !rule.placeTypeIds.includes(filters.placeType)) return false
  if (filters.requirementTypes.length && !filters.requirementTypes.includes(rule.type)) return false
  if (filters.search) {
    const text = [rule.reference, rule.requirementText, rule.guidanceText].join(' ').toLowerCase()
    if (!text.includes(filters.search.toLowerCase())) return false
  }
  return true
}

// With no features chosen, every rule is shown
function hasFeature (rule, features) {
  return !features.length || rule.features.some(feature => features.includes(feature))
}

// The first sentence of a code's text, for the short version on the overview page.
// The full text, with any lists, is on the code's own page.
function firstSentence (text) {
  const paragraph = String(text || '').split(/\n\s*\n/)[0].trim()
  const match = /^.*?[.!?](?=\s+[A-Z(]|$)/s.exec(paragraph)
  return match ? match[0] : paragraph
}

// A council's design code page: its codes and key guidance, filtered
function extractedPage (placeholder, extracted, filters) {
  const mapArea = designCodeData.areas.find(area => area.id === placeholder.area)
  const areaName = mapArea ? mapArea.name : extracted.council
  const rules = extracted.chapters.flatMap(chapter => chapter.sections).flatMap(section => section.rules)
  const matching = rules.filter(rule => ruleMatches(rule, filters, extracted.designCodeType))

  // The Feature filter lists every national feature, with how many results it would show with
  // the other filters applied
  const featureOptions = FEATURES.map(feature => ({
    ...feature,
    count: matching.filter(rule => rule.features.includes(feature.value)).length
  }))

  // Area type lists the national area types the council's place types match, in national order,
  // with the council's own name as a hint, then any place types with no national match
  const areaTypeOptions = [
    ...AREA_TYPES.flatMap(areaType => extracted.placeTypes
      .filter(placeType => placeType.areaType === areaType.value)
      .map(placeType => ({ value: placeType.id, text: areaType.text, hint: `${areaName} calls this ${placeType.localName}` }))),
    ...extracted.placeTypes
      .filter(placeType => !placeType.areaType)
      .map(placeType => ({ value: placeType.id, text: placeType.localName, hint: `Only in ${areaName}: there is no national area type for this` }))
  ]

  const optionText = (options, value) => (options.find(option => option.value === value) || {}).text || value

  // On each result, a row for each filter in use, showing what in the code matched it
  const filterRows = rule => [
    filters.features.length && {
      key: 'Feature',
      value: rule.features.filter(feature => filters.features.includes(feature)).map(feature => optionText(FEATURES, feature)).join(', ')
    },
    filters.developmentType && { key: 'Development type', value: optionText(DEVELOPMENT_TYPE_OPTIONS, filters.developmentType) },
    filters.placeType && { key: 'Area type', value: optionText(areaTypeOptions, filters.placeType) },
    filters.designCodeTypes.length && { key: 'Design code type', value: optionText(DESIGN_CODE_TYPES, extracted.designCodeType) },
    filters.requirementTypes.length && { key: 'Code or guidance', value: rule.type === 'code' ? 'Code' : 'Guidance' }
  ].filter(Boolean)

  // Every matching code and key guidance item, in one list, in the order of the design code
  const results = matching.filter(rule => hasFeature(rule, filters.features))
    .map(rule => ({
      reference: rule.reference,
      // Where it applies, highlighted on the map when the result is hovered. None means everywhere.
      placeTypeIds: rule.placeTypeIds,
      filterRows: filterRows(rule),
      type: rule.type,
      title: rule.title,
      // The development types it applies to, as keys (H, 1, 2…) with their names
      developmentTypes: rule.developmentTypeCodes.map((key, index) => ({ key, name: rule.developmentTypes[index] })),
      section: `${rule.section.reference} ${rule.section.name}`,
      summary: firstSentence(rule.requirementText),
      // The data has no status for each code, so each one shows the design code's status
      status: extracted.status.text
    }))

  // A tag for each filter in use (Figma node 444:27884), with the query parameter and value that
  // the route removes to clear just that one
  const appliedFilters = [
    ...(filters.search ? [{ label: `Search: ${filters.search}`, param: 'q' }] : []),
    ...filters.features.map(value => ({ label: optionText(FEATURES, value), param: 'feature', value })),
    ...(filters.developmentType ? [{ label: optionText(DEVELOPMENT_TYPE_OPTIONS, filters.developmentType), param: 'development-type' }] : []),
    ...(filters.placeType ? [{ label: optionText(areaTypeOptions, filters.placeType), param: 'place-type' }] : []),
    ...filters.designCodeTypes.map(value => ({ label: optionText(DESIGN_CODE_TYPES, value), param: 'design-code-type', value })),
    ...filters.requirementTypes.map(value => ({ label: optionText(REQUIREMENT_TYPE_OPTIONS, value), param: 'requirement-type', value }))
  ]

  return {
    designCode: {
      ...placeholder,
      name: extracted.title,
      // The area's short name, such as "East Riding", as in the Figma design
      pageTitle: mapArea ? mapArea.name : extracted.council,
      overview: extracted.summary
    },
    // The council's area, for the map beside the overview
    mapArea,
    featureOptions,
    areaTypeOptions,
    results,
    appliedFilters,
    resultCount: results.length
  }
}

// ---- Map drill-down (v3) ----
// England > council > town > place type > example site. The level and filters live in the URL,
// so the back button works and links can be shared. Town boundaries are real (built-up areas);
// place type zones are indicative and the site is illustrative (see app/data/v3/map-levels.json).
const fs = require('fs')
const path = require('path')
const mapLevels = require('../data/v3/map-levels.json')
const designCodeAreaBoundaries = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'data', 'design-code-areas.geojson'), 'utf8'))
const MAP_PARAMS = ['map', 'settlement', 'place-type', 'site']
const RESULTS_PAGE_SIZE = 5

// The illustrative example site: a 16:10 rectangle inside the chosen place type zone. Ring-shaped
// zones (inner and outer neighbourhood) put it part way out from the centre, so it sits in the ring.
const SITE_OFFSET = { 'inner-neighbourhood': 0.45, 'outer-neighbourhood': 0.8 }
function exampleSiteBounds (placeType) {
  const ring = placeType.geometry.coordinates[0]
  const xs = ring.map(point => point[0])
  const ys = ring.map(point => point[1])
  const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const east = ring.reduce((best, point) => (point[0] > best[0] ? point : best))
  const t = SITE_OFFSET[placeType.id] || 0
  const x = centre[0] + (east[0] - centre[0]) * t
  const y = centre[1] + (east[1] - centre[1]) * t
  const width = Math.min((Math.max(...xs) - Math.min(...xs)) * 0.3, 0.012)
  const height = width * 10 / 16 * Math.cos(y * Math.PI / 180)
  return [[y - height / 2, x - width / 2], [y + height / 2, x + width / 2]]
}

// Where to label each indicative zone, so the labels of the nested rings don't sit on top of
// each other: out along a different direction from the centre for each zone
const LABEL_TOWARD = {
  'outer-neighbourhood': ['north', 0.85],
  'inner-neighbourhood': ['west', 0.6],
  'town-centre': ['south', 0],
  'neighbourhood-centre': ['north', 0],
  'business-and-industrial': ['south', 0]
}
function zoneLabelPoint (zone) {
  const ring = zone.geometry.coordinates[0]
  const xs = ring.map(point => point[0])
  const ys = ring.map(point => point[1])
  const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const [direction, t] = LABEL_TOWARD[zone.id] || ['north', 0]
  const pick = { north: p => p[1], south: p => -p[1], west: p => -p[0] }[direction]
  const edge = ring.reduce((best, point) => (pick(point) > pick(best) ? point : best))
  return [centre[1] + (edge[1] - centre[1]) * t, centre[0] + (edge[0] - centre[0]) * t]
}

// The national area type name for one of the council's place types, or its own name if there's
// no national match
function areaTypeName (code, placeTypeId) {
  const extracted = extractedFor(code)
  const placeType = extracted && extracted.placeTypes.find(item => item.id === placeTypeId)
  if (!placeType) return (PLACE_TYPE_OPTIONS.find(option => option.value === placeTypeId) || { text: placeTypeId }).text
  const areaType = AREA_TYPES.find(item => item.value === placeType.areaType)
  return areaType ? areaType.text : placeType.localName
}

// The page's URL with the filters kept and the map state replaced
function drillUrl (code, query, state) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (MAP_PARAMS.includes(key) || key === 'page') continue
    for (const item of [].concat(value)) if (item && item !== '_unchecked') params.append(key, item)
  }
  if (state.map) params.set('map', state.map)
  if (state.settlement) params.set('settlement', state.settlement)
  if (state.placeType) params.set('place-type', state.placeType)
  if (state.site) params.set('site', state.site)
  const search = params.toString()
  return `${BASE_URL}/design-code/${code}${search ? '?' + search : ''}`
}

function mapStateFor (code, query, filters) {
  const area = designCodeData.areas.find(item => item.designCode === code)
  const boundaryOf = id => (designCodeAreaBoundaries.features.find(feature => feature.properties.id === id) || {}).geometry
  const levels = mapLevels.council === code ? mapLevels : { settlements: [] }
  const settlement = levels.settlements.find(item => item.id === query.settlement)
  const placeType = settlement && settlement.placeTypes.find(item => item.id === filters.placeType)
  // The council is the highest level: the page is about one council's design code
  const level = !settlement ? 'council'
      : !placeType ? 'settlement'
        : query.site === 'example' ? 'site' : 'place-type'
  const url = state => drillUrl(code, query, state)

  const crumbs = [{ text: area.name, href: url({}) }]
  if (settlement) crumbs.push({ text: settlement.name, href: url({ settlement: settlement.id }) })
  if (placeType && level !== 'settlement') crumbs.push({ text: placeType.name, href: url({ settlement: settlement.id, placeType: placeType.id }) })
  if (level === 'site') crumbs.push({ text: 'Example site', href: url({ settlement: settlement.id, placeType: placeType.id, site: 'example' }) })

  const councilFeature = item => ({ id: item.id, name: item.name, geometry: boundaryOf(item.id) })
  const state = {
    level,
    settlement: settlement ? settlement.id : '',
    crumbs,
    upHref: crumbs.length > 1 ? crumbs[crumbs.length - 2].href : null,
    indicative: false,
    // The map can't zoom out beyond the council
    council: boundaryOf(area.id)
  }

  if (level === 'council') {
    Object.assign(state, {
      heading: levels.settlements.length ? `Towns in ${area.name}` : '',
      parent: councilFeature(area),
      children: levels.settlements.map(item => ({
        id: item.id, name: item.name, geometry: item.geometry, href: url({ settlement: item.id, placeType: filters.placeType })
      })),
      note: filters.placeType && levels.settlements.length
        ? `Choose a town to see its ${areaTypeName(code, filters.placeType).toLowerCase()}.`
        : ''
    })
  } else if (level === 'settlement') {
    Object.assign(state, {
      heading: `Place types in ${settlement.name}`,
      indicative: true,
      context: [boundaryOf(area.id)],
      parent: { id: settlement.id, name: settlement.name, geometry: settlement.geometry },
      siblings: levels.settlements.filter(item => item !== settlement).map(item => ({ id: item.id, name: item.name, geometry: item.geometry })),
      children: settlement.placeTypes.map(item => ({
        id: item.id, name: item.name, geometry: item.geometry, labelAt: zoneLabelPoint(item), href: url({ settlement: settlement.id, placeType: item.id })
      }))
    })
  } else {
    const site = { id: 'example', name: 'Example site (illustrative)', bounds: exampleSiteBounds(placeType) }
    Object.assign(state, {
      heading: level === 'place-type' ? `Sites in ${placeType.name.toLowerCase()}` : '',
      indicative: true,
      context: [settlement.geometry],
      parent: level === 'site'
        ? { ...site, image: '/public/images/design-codes/example-site-illustrative.png' }
        : { id: placeType.id, name: placeType.name, geometry: placeType.geometry },
      siblings: level === 'site' ? [] : settlement.placeTypes.filter(item => item !== placeType).map(item => ({ id: item.id, name: item.name, geometry: item.geometry })),
      children: level === 'site' ? [] : [{ ...site, href: url({ settlement: settlement.id, placeType: placeType.id, site: 'example' }) }]
    })
  }
  return state
}

router.get('/design-code/:code', (req, res, next) => {
  const placeholder = designCodeData.designCodes[req.params.code]
  if (!placeholder) return next()
  const extracted = extractedFor(req.params.code)
  const filters = readDesignCodeFilters(req.query)
  const page = extracted
    ? extractedPage(placeholder, extracted, filters)
    : { designCode: placeholder, featureOptions: [], areaTypeOptions: [], results: [], appliedFilters: [], resultCount: 0 }

  // Send "Back" to the entity page the user came from, if that's how they got here.
  // Only the path is used, so the link always stays on this site.
  const referrerPath = new URL(req.get('referer') || '/', 'http://localhost').pathname
  const cameFromEntity = referrerPath.startsWith(BASE_URL + '/entity/') && /^\d+$/.test(referrerPath.slice((BASE_URL + '/entity/').length))

  // Explain the results if they came from "Not sure what I am looking for?"
  const journey = req.session.designCodeQuestions
  const result = journey && journey.code === req.params.code && journey.result
  const fromQuestions = Boolean(result && !result.speakToCouncil &&
    filters.placeType === result.placeType && filters.developmentType === (result.developmentType || '') &&
    !filters.features.length && !filters.designCodeTypes.length && !filters.requirementTypes.length && !filters.search)

  // The page's URL with one parameter changed. Filters and the map level are kept; the page number
  // isn't, as the results change.
  const pageUrl = (change) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(req.query)) {
      if (key === 'page') continue
      for (const item of toArray(value)) if (item !== '_unchecked' && !change(key, item)) params.append(key, item)
    }
    const search = params.toString()
    return `${BASE_URL}/design-code/${req.params.code}${search ? '?' + search : ''}`
  }

  // Removing a filter's tag removes just that value. A new area type leaves the example site.
  const appliedFilters = page.appliedFilters.map(filter => ({
    ...filter,
    removeHref: pageUrl((key, item) => (key === filter.param && (!filter.value || item === filter.value)) ||
      (filter.param === 'place-type' && key === 'site'))
  }))

  // 5 results to a page (Figma node 445:28314)
  const totalPages = Math.max(1, Math.ceil(page.results.length / RESULTS_PAGE_SIZE))
  const currentPage = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), totalPages)
  const pageHref = number => {
    const href = pageUrl(() => false)
    return number === 1 ? href : href + (href.includes('?') ? '&' : '?') + 'page=' + number
  }
  const pagination = totalPages > 1 && {
    previous: currentPage > 1 ? { href: pageHref(currentPage - 1) } : null,
    next: currentPage < totalPages ? { href: pageHref(currentPage + 1) } : null,
    items: Array.from({ length: totalPages }, (_, index) => ({ number: index + 1, href: pageHref(index + 1), current: index + 1 === currentPage }))
  }

  res.render(`${VIEWS}/design-code/council`, {
    questionsResult: fromQuestions && {
      ...result,
      placeTypeText: PLACE_TYPE_OPTIONS.find(option => option.value === result.placeType).text,
      developmentTypeText: result.developmentType && DEVELOPMENT_TYPE_OPTIONS.find(option => option.value === result.developmentType).text,
      changeHref: questionsUrl(req.params.code, journey.path[journey.path.length - 1])
    },
    backHref: cameFromEntity ? referrerPath : BASE_URL + '/design-code/find?area=' + page.designCode.area,
    code: req.params.code,
    ...page,
    appliedFilters,
    pageResults: page.results.slice((currentPage - 1) * RESULTS_PAGE_SIZE, currentPage * RESULTS_PAGE_SIZE),
    pagination,
    hasData: Boolean(extracted),
    mapState: mapStateFor(req.params.code, req.query, filters),
    filters,
    hasFilters: Boolean(filters.search || filters.features.length || filters.developmentType || filters.placeType ||
      filters.designCodeTypes.length || filters.requirementTypes.length),
    developmentTypeOptions: DEVELOPMENT_TYPE_OPTIONS,
    designCodeTypeOptions: DESIGN_CODE_TYPES,
    requirementTypeOptions: REQUIREMENT_TYPE_OPTIONS
  })
})

// "Not sure what I am looking for?" asks a series of questions, one per page, then shows
// the matching codes on the council's design code page. The place type questions follow
// the flow charts in Figure 6 of the East Riding Design Code (pages 11 to 14).
const YES_NO = [{ value: 'yes', text: 'Yes' }, { value: 'no', text: 'No' }]

const SETTLEMENT_OPTIONS = [
  { value: 'major-haltemprice-settlement', text: 'Major Haltemprice Settlement', next: 'towns-residential' },
  { value: 'principal-town', text: 'Principal Town', next: 'towns-residential' },
  { value: 'town', text: 'Town', next: 'towns-residential' },
  { value: 'rural-service-centre', text: 'Rural Service Centre', next: 'rural-centre' },
  { value: 'primary-village', text: 'Primary Village', next: 'rural-centre' },
  { value: 'village', text: 'Village', next: 'villages-residential' }
]

const SETTLEMENT_HINT = 'Find how your settlement is classified in the settlement network in Appendix E of the design code.'

// The same question can lead to different places depending on which chart it is in
const residential = (yes, no) => ({ question: 'Are uses in surrounding streets mainly residential?', options: YES_NO, next: { yes, no } })
const properties = () => ({
  question: 'Are nearby properties mostly:',
  options: [
    { value: 'terraced-and-semi-detached', text: 'Terraced and semi-detached' },
    { value: 'semi-detached-and-detached', text: 'Semi-detached and detached' }
  ],
  next: { 'terraced-and-semi-detached': { placeType: 'inner-neighbourhood' }, 'semi-detached-and-detached': { placeType: 'outer-neighbourhood' } }
})
const localNeeds = next => ({ question: 'Do the neighbouring sites serve local needs with shops and services?', options: YES_NO, next: { yes: { placeType: 'neighbourhood-centre' }, no: next } })
const employment = () => ({ question: 'Will the site provide employment?', options: YES_NO, next: { yes: { placeType: 'business-and-industrial' }, no: { speakToCouncil: true } } })
const housingAreas = (yes, no) => ({ question: 'Are there clearly defined areas of different styles or types of housing?', options: YES_NO, next: { yes, no } })

// Each answer leads to another question or to a result: a place type, or speak to the council
const QUESTIONS = {
  'development-type': {
    question: 'What are you building?',
    hint: 'This is called the development type. Not every code applies to every type of development.',
    options: 'development-types',
    next: () => 'settlement'
  },
  settlement: {
    question: 'Where is the site located?',
    hint: SETTLEMENT_HINT,
    options: [...SETTLEMENT_OPTIONS, { value: 'countryside', text: 'Countryside', next: 'countryside-extension' }]
  },
  'countryside-extension': {
    question: 'Is the site an extension of an existing settlement?',
    options: YES_NO,
    next: { yes: 'extended-settlement', no: { placeType: 'countryside' } }
  },
  'extended-settlement': {
    question: 'How is the settlement classified in the Local Plan?',
    hint: SETTLEMENT_HINT,
    options: SETTLEMENT_OPTIONS
  },

  // Major Haltemprice Settlements, Principal Towns and Towns (page 12)
  'towns-residential': residential('towns-near-centre', 'towns-central'),
  'towns-near-centre': {
    question: 'Is the site within 800 metres walking distance of a train or bus station, or a town centre, district centre or local centre boundary?',
    hint: 'Centre boundaries are set out in Policy S7 of the Local Plan.',
    options: YES_NO,
    next: { yes: { placeType: 'inner-neighbourhood', conservationAreaNote: true }, no: 'towns-properties' }
  },
  'towns-properties': properties(),
  'towns-central': { question: 'Is the site centrally located?', options: YES_NO, next: { yes: { placeType: 'town-centre' }, no: 'towns-local-needs' } },
  'towns-local-needs': localNeeds('towns-employment'),
  'towns-employment': employment(),

  // Rural Service Centres and Primary Villages (page 13)
  'rural-centre': {
    question: 'Is there a clearly defined centre with shops and services?',
    hint: 'Centres are set out in Policy S7 of the Local Plan.',
    options: YES_NO,
    next: { yes: 'rural-residential', no: 'rural-housing-areas' }
  },
  'rural-housing-areas': housingAreas('rural-residential', { placeType: 'village' }),
  'rural-residential': residential('rural-properties', 'rural-local-needs'),
  'rural-properties': properties(),
  'rural-local-needs': localNeeds('rural-employment'),
  'rural-employment': employment(),

  // Villages (page 14)
  'villages-residential': residential('villages-housing-areas', 'villages-local-needs'),
  'villages-housing-areas': housingAreas('villages-properties', { placeType: 'village' }),
  'villages-properties': properties(),
  'villages-local-needs': localNeeds('villages-employment'),
  'villages-employment': employment()
}

function questionOptions (node) {
  if (node.options === 'development-types') {
    return DEVELOPMENT_TYPE_OPTIONS
  }
  return node.options
}

// Where an answer leads: the id of the next question, or a result
function nextStep (node, answer) {
  if (typeof node.next === 'function') return node.next(answer)
  if (node.next) return node.next[answer]
  return questionOptions(node).find(option => option.value === answer).next
}

function questionsUrl (code, id) {
  return `${BASE_URL}/design-code/${code}/questions/${id}`
}

function councilUrl (code, result) {
  const params = new URLSearchParams()
  if (result.developmentType) params.set('development-type', result.developmentType)
  if (result.placeType) params.set('place-type', result.placeType)
  const query = params.toString()
  return `${BASE_URL}/design-code/${code}${query ? '?' + query : ''}`
}

// Start the questions. "Not sure? Find your place type" starts at the place type questions
// and keeps the development type already chosen in the filters.
router.get('/design-code/:code/questions', (req, res, next) => {
  if (!extractedFor(req.params.code)) return next()
  const placeTypeOnly = req.query.start === 'place-type'
  const first = placeTypeOnly ? 'settlement' : 'development-type'
  req.session.designCodeQuestions = {
    code: req.params.code,
    developmentType: placeTypeOnly ? readDesignCodeFilters(req.query).developmentType : '',
    answers: {},
    // The questions answered so far, in order, for the back links
    path: [first]
  }
  res.redirect(questionsUrl(req.params.code, first))
})

function renderQuestion (req, res, next, error) {
  const { code, id } = req.params
  const node = QUESTIONS[id]
  const journey = req.session.designCodeQuestions
  // Without answers so far, start again from the beginning
  if (!node || !journey || journey.code !== code || !journey.path.includes(id)) {
    return node ? res.redirect(`${BASE_URL}/design-code/${code}/questions`) : next()
  }
  const extracted = extractedFor(code)
  const position = journey.path.indexOf(id)
  const answer = journey.answers[id]

  res.render(`${VIEWS}/design-code/question`, {
    code,
    id,
    designCode: { name: extracted.title },
    node,
    items: questionOptions(node).map(option => ({ value: option.value, text: option.text, checked: option.value === answer })),
    inline: node.options === YES_NO,
    backHref: position > 0 ? questionsUrl(code, journey.path[position - 1]) : `${BASE_URL}/design-code/${code}`,
    error
  })
}

router.get('/design-code/:code/questions/:id', (req, res, next) => renderQuestion(req, res, next))

router.post('/design-code/:code/questions/:id', (req, res, next) => {
  const { code, id } = req.params
  const node = QUESTIONS[id]
  const journey = req.session.designCodeQuestions
  if (!node || !journey || !journey.path.includes(id)) return renderQuestion(req, res, next)

  const answer = req.body.answer
  if (!questionOptions(node).some(option => option.value === answer)) {
    return renderQuestion(req, res, next, id === 'development-type' ? 'Select what you are building' : 'Select an answer')
  }

  journey.answers[id] = answer
  if (id === 'development-type') journey.developmentType = answer
  // Answering again forgets the questions that came after this one
  journey.path = journey.path.slice(0, journey.path.indexOf(id) + 1)

  const step = nextStep(node, answer)
  if (typeof step === 'string') {
    journey.path.push(step)
    return res.redirect(questionsUrl(code, step))
  }

  journey.result = { developmentType: journey.developmentType, ...step }
  if (step.speakToCouncil) return res.redirect(`${BASE_URL}/design-code/${code}/questions/result/speak-to-the-council`)
  res.redirect(councilUrl(code, journey.result))
})

// The flow charts cannot give a place type for every site
router.get('/design-code/:code/questions/result/speak-to-the-council', (req, res, next) => {
  const journey = req.session.designCodeQuestions
  const extracted = extractedFor(req.params.code)
  if (!extracted) return next()
  if (!journey || !journey.result) return res.redirect(`${BASE_URL}/design-code/${req.params.code}/questions`)

  res.render(`${VIEWS}/design-code/speak-to-the-council`, {
    code: req.params.code,
    designCode: { name: extracted.title, council: extracted.council },
    backHref: questionsUrl(req.params.code, journey.path[journey.path.length - 1]),
    resultsHref: councilUrl(req.params.code, { developmentType: journey.developmentType }),
    placeTypeOptions: PLACE_TYPE_OPTIONS
  })
})

// One code or piece of key guidance in full, linked from "Open full design code"
router.get('/design-code/:code/:reference', (req, res, next) => {
  const placeholder = designCodeData.designCodes[req.params.code]
  const extracted = placeholder && extractedFor(req.params.code)
  if (!extracted) return next()

  const rule = extracted.chapters
    .flatMap(chapter => chapter.sections)
    .flatMap(section => section.rules)
    .find(item => item.reference.toLowerCase() === req.params.reference.toLowerCase())
  if (!rule) return next()

  const area = designCodeData.areas.find(item => item.id === placeholder.area)

  res.render(`${VIEWS}/design-code/rule`, {
    code: req.params.code,
    // The area's short name, such as "East Riding", for the caption
    areaName: area ? area.name : extracted.council,
    designCode: { name: extracted.title, pageTitle: extracted.council, status: extracted.status },
    rule
  })
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
