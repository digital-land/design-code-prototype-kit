//
// Routes for version 5 of the prototype, served under /v5
//
// To make a new version, copy this file and app/views/v5/,
// then change BASE_URL and VIEWS below.
//

const govukPrototypeKit = require('govuk-prototype-kit')

const BASE_URL = '/v5'
const VIEWS = 'v5'

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
const filterOptions = require('../data/filters')

function extractedFor (slug) {
  return extractedDesignCodes.get(`${slug}-design-code`)
}

// Landing page for design codes, linking to the guidance and the finder (as in v2)
router.get('/design-code', (req, res) => {
  res.render(`${VIEWS}/design-code`)
})

// Guidance on preparing a design code
router.get('/design-code/learn', (req, res) => {
  res.render(`${VIEWS}/design-code/learn`)
})

// ---- v5: find the design requirements for an area ----
//
// Search for an area (Figma node 1268:39405), then see its design code's rules on a full width map
// that stays on that area (node 1260:39081). Choosing a rule shows its summary over the map (node
// 1270:39679), which links to the rule's page (nodes 1270:39842, 1270:40253, 1270:39985 and
// 1270:40123). The filters and the search over the list narrow the rules.

const samplePostcodes = require('../assets/data/sample-postcodes.json').postcodes

// "homes-and-buildings" -> "Homes and buildings"
function featureName (value) {
  const text = filterOptions.optionText(filterOptions.DESIGN_FEATURES, value)
  return text !== value ? text : value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, ' ')
}

// The start of a rule's text: whole sentences up to about `limit` characters. The full text is on
// the rule's own page.
function shortText (text, limit = 250) {
  const firstParagraph = String(text || '').split(/\n|\s-\s/)[0].trim()
  // A full stop only ends a sentence before a space or the end, so "Figure 4.1" and "1.5m" stay whole
  const sentences = firstParagraph.match(/(?:[^.!?]|[.!?](?!\s|$))+[.!?]*(?:\s+|$)/g) || [firstParagraph]
  let summary = ''
  for (const sentence of sentences) {
    if (summary && (summary + sentence).length > limit) break
    summary += sentence
  }
  summary = summary.trim()
  return summary.length < String(text || '').trim().length ? summary.replace(/[:;,]$/, '') + ' …' : summary
}

// A rule, with what the list and its summary card show (Figma nodes 1260:39081 and 1270:39679).
// Rows without a value are left out.
function ruleSummary (slug, extracted, rule) {
  const placeNames = rule.placeTypeIds
    .map(id => (extracted.placeTypes.find(placeType => placeType.id === id) || {}).localName)
    .filter(Boolean)
  return {
    reference: rule.reference,
    tag: rule.type === 'code' ? 'Rule' : rule.typeName === 'Recommendation' ? 'Recommendation' : 'Guidance',
    title: rule.title || `${rule.typeName} ${rule.reference}`,
    // A sentence or so for the list, and a little more for the summary
    description: shortText(rule.requirementText, 160),
    text: shortText(rule.requirementText),
    href: `${BASE_URL}/design-code/${slug}/${encodeURIComponent(rule.reference.toLowerCase())}`,
    // What the rule is about, for matching it to the kind of place selected on the map
    // (Not its section: Chatham's sections are named after areas, such as "Residential Streets")
    about: [rule.title, rule.nationalDesignIssue].filter(Boolean).join(' ').toLowerCase(),
    features: rule.features,
    placeTypeIds: rule.placeTypeIds,
    rows: [
      { key: 'Design code', value: placeNames.length ? placeNames.join(', ') : 'All area types' },
      { key: 'Feature', value: rule.features.map(featureName).join(', ') },
      { key: 'Issue', value: rule.nationalDesignIssue || '' },
      { key: 'Development type', value: rule.developmentTypes.join(', ') }
    ].filter(row => row.value)
  }
}

// ---- Searching for an area ----

// "Medway Council" -> "medwaycouncil", for comparing what people type with names and postcodes
const squash = text => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '')

// What a search matches, grouped by area: each area that matches, with a place to pin if the
// search was a postcode or a town
function searchAreas (query) {
  const typed = squash(query)
  if (!typed) return []
  const results = new Map()
  const add = (area, pin) => {
    if (!results.has(area.id)) results.set(area.id, { area, pins: [] })
    if (pin) results.get(area.id).pins.push(pin)
  }

  for (const area of designCodeData.areas) {
    const extracted = extractedFor(area.designCode)
    const names = [area.name, area.council, extracted && extracted.title].filter(Boolean).map(squash)
    if (typed.length >= 3 && names.some(name => name.includes(typed) || typed.includes(name))) add(area)
  }
  for (const postcode of samplePostcodes) {
    const area = designCodeData.areas.find(item => item.id === postcode.area)
    if (!area) continue
    const isPostcode = typed.length >= 2 && squash(postcode.postcode).startsWith(typed)
    const isPlace = typed.length >= 3 && squash(postcode.place).includes(typed)
    if (isPostcode || isPlace) {
      add(area, { lat: postcode.lat, lng: postcode.lng, label: isPostcode ? postcode.postcode : postcode.place })
    }
  }
  return [...results.values()]
}

// The "Add a location boundary" page for an area, with the place that was searched for
function boundaryUrl (areaId, pin) {
  const params = new URLSearchParams({ area: areaId })
  if (pin) {
    params.set('lat', pin.lat)
    params.set('lng', pin.lng)
    params.set('place', pin.label)
  }
  return `${BASE_URL}/design-code/find/boundary?${params}`
}

// Figma node 1268:39405: search for a local authority, postcode or area. One match goes straight to
// "Add a location boundary"; several are listed to choose from.
router.get('/design-code/find', (req, res) => {
  const search = String(req.query.q || '').trim()
  if (!('q' in req.query)) return res.render(`${VIEWS}/design-code/find`, { search })

  const render = (error, choices) => res.render(`${VIEWS}/design-code/find`, { search, error, choices })
  if (!search) return render('Enter a local authority, postcode or area')

  const matches = searchAreas(search)
  const withRules = matches.filter(match => extractedFor(match.area.designCode))
  if (!matches.length) {
    return render(`No areas match ‘${search}’. Enter a local authority, postcode or area, such as ‘Medway Council’, ‘ME4 4TR’ or ‘Chatham’.`)
  }
  if (!withRules.length) {
    return render(`There are no design code rules for ${matches.map(match => match.area.council).join(' or ')} in this prototype yet. Try ‘Medway Council’ or ‘East Riding’.`)
  }
  if (withRules.length === 1) {
    const { area, pins } = withRules[0]
    return res.redirect(boundaryUrl(area.id, pins.length === 1 ? pins[0] : null))
  }
  render(null, withRules.map(match => ({
    text: match.area.council,
    hint: match.pins.map(pin => pin.label).join(', '),
    href: boundaryUrl(match.area.id, match.pins.length === 1 ? match.pins[0] : null)
  })))
})

// ---- Add a location boundary ----

const placeKinds = require('../assets/javascripts/place-kinds.js')

// Every rule in an area's design code
const allRulesOf = extracted => extracted.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.rules))

// A drawn boundary from the address: "lat,lng;lat,lng;…", or null
function readBoundary (value) {
  const points = String(value || '').split(';').map(pair => pair.split(',').map(Number))
    .filter(pair => pair.length === 2 && pair.every(Number.isFinite))
  return points.length >= 3 ? points : null
}

// Figma node 1367:41746: the area on a map, where a polygon or square can be drawn round a specific
// part of it. The map works out roughly what kind of place the boundary is (as v4's does), and the
// counts on the left say how many design requirements are for it. Continue goes to the list.
// Drawing is optional: without a boundary, the list has every requirement in the area.
router.get('/design-code/find/boundary', (req, res) => {
  const area = designCodeData.areas.find(item => item.id === req.query.area)
  const extracted = area && extractedFor(area.designCode)
  if (!extracted) return res.redirect(`${BASE_URL}/design-code/find`)

  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  const pin = Number.isFinite(lat) && Number.isFinite(lng) && req.query.lat && req.query.lng
    ? { lat, lng, label: String(req.query.place || '') }
    : null
  const kind = placeKinds.KINDS[req.query.kind] ? String(req.query.kind) : ''

  res.render(`${VIEWS}/design-code/boundary`, {
    area,
    designCode: {
      area: area.id,
      name: extracted.title,
      // What the map needs to count the requirements for a kind of place
      rules: allRulesOf(extracted).map(rule => {
        const summary = ruleSummary(area.designCode, extracted, rule)
        return { about: summary.about, text: summary.text, features: summary.features, placeTypeIds: summary.placeTypeIds }
      })
    },
    pin,
    // Coming back from the list: the boundary drawn before, and the kind of place it was
    boundary: readBoundary(req.query.boundary),
    kind,
    counts: { localAuthorities: 1, designCodes: 1, requirements: allRulesOf(extracted).length }
  })
})

// ---- The design requirements ----

const RESULTS_LIST_PAGE_SIZE = 10

// Figma node 1367:41275: the design requirements, with filters on the left (applied with the
// "Apply filter" button, as in the Figma design), a search, how many there are, sorted by name,
// and 10 to a page. With an area, it's that area's; with a boundary, those for the kind of place
// it is ("Location boundary: Streets", which can be removed). Without an area ("View all design
// requirements"), every design code's.
router.get('/design-code/find/results', (req, res) => {
  const area = req.query.area ? designCodeData.areas.find(item => item.id === req.query.area) : null
  const codes = (area ? [area] : designCodeData.areas)
    .map(item => ({ area: item, slug: item.designCode, extracted: extractedFor(item.designCode) }))
    .filter(item => item.extracted)
  if (!codes.length) return res.redirect(`${BASE_URL}/design-code/find`)

  const filters = filterOptions.readFilters(req.query)
  const kind = area && placeKinds.KINDS[req.query.kind] ? String(req.query.kind) : ''

  // The filter groups, with the Design code options of every design code listed, and any design
  // features their rules have beyond the national ones
  const groups = filterOptions.filterGroups(filters, codes[0].extracted).map(group => {
    let items = group.items
    if (group.name === 'design-code') {
      items = codes.flatMap(item => filterOptions.filterGroups(filters, item.extracted).find(other => other.name === 'design-code').items)
    } else if (group.name === 'feature') {
      const extra = [...new Set(codes.flatMap(item => allRulesOf(item.extracted).flatMap(rule => rule.features)))]
        .filter(value => !items.some(option => option.value === value))
      items = items.concat(extra.map(value => ({ value, text: featureName(value), checked: filters.features.includes(value) })))
    }
    return { ...group, items, count: items.filter(option => option.checked).length }
  })

  // This page's address with some values left out, for the filter tags and pages
  const resultsUrl = (leaveOut, extra = {}) => {
    const params = new URLSearchParams()
    for (const [key, values] of Object.entries(req.query)) {
      if (key === 'page') continue
      for (const item of toArray(values)) {
        if (item && item !== '_unchecked' && !leaveOut(key, item)) params.append(key, item)
      }
    }
    for (const [key, value] of Object.entries(extra)) params.set(key, value)
    const search = params.toString()
    return `${BASE_URL}/design-code/find/results${search ? '?' + search : ''}`
  }
  const appliedFilters = [
    ...(kind ? [{ label: `Location boundary: ${placeKinds.KINDS[kind].plural.charAt(0).toUpperCase()}${placeKinds.KINDS[kind].plural.slice(1)}`, href: resultsUrl(key => key === 'kind' || key === 'boundary') }] : []),
    ...(filters.search ? [{ label: `Search: ${filters.search}`, href: resultsUrl(key => key === 'q') }] : []),
    ...groups.flatMap(group => group.items.filter(option => option.checked)
      .map(option => ({ label: option.text, href: resultsUrl((key, item) => key === group.name && item === option.value) })))
  ]

  // Every matching rule, sorted by name
  const results = codes.flatMap(item => allRulesOf(item.extracted)
    .filter(rule => filterOptions.ruleMatches(rule, filters, item.extracted) && filterOptions.hasFeature(rule, filters.features))
    .map(rule => ({ rule, summary: ruleSummary(item.slug, item.extracted, rule), item })))
    .filter(({ summary }) => !kind || placeKinds.fitsKind(summary, kind))
    .map(({ rule, summary, item }) => ({
      title: summary.title,
      href: summary.href,
      description: summary.description,
      // Figma's first result: design code, feature, issue and development type
      rows: [
        { key: 'Design code', value: item.extracted.title },
        { key: 'Feature', value: rule.features.map(featureName).join(', ') },
        { key: 'Issue', value: rule.nationalDesignIssue || '' },
        { key: 'Development type', value: rule.developmentTypes.join(', ') }
      ].filter(row => row.value)
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }))

  const totalPages = Math.max(1, Math.ceil(results.length / RESULTS_LIST_PAGE_SIZE))
  const currentPage = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), totalPages)
  const pageHref = number => number === 1 ? resultsUrl(() => false) : resultsUrl(() => false, { page: number })
  const pagination = totalPages > 1 && {
    previous: currentPage > 1 ? { href: pageHref(currentPage - 1) } : null,
    next: currentPage < totalPages ? { href: pageHref(currentPage + 1) } : null,
    items: Array.from({ length: totalPages }, (_, index) => index + 1)
      .filter(number => number === 1 || number === totalPages || Math.abs(number - currentPage) <= 1)
      .flatMap((number, index, numbers) => [
        ...(index && number - numbers[index - 1] > 1 ? [{ ellipsis: true }] : []),
        { number, href: pageHref(number), current: number === currentPage }
      ])
  }

  // Back to the boundary page as it was: its area, pin, boundary and kind of place
  const boundaryParams = new URLSearchParams()
  for (const key of ['area', 'lat', 'lng', 'place', 'boundary', 'kind']) {
    if (req.query[key]) boundaryParams.set(key, String(req.query[key]))
  }

  res.render(`${VIEWS}/design-code/results`, {
    area,
    kind,
    filters,
    filterGroups: groups,
    appliedFilters,
    hasFilters: filterOptions.anyFilters(filters) || Boolean(kind),
    results: results.slice((currentPage - 1) * RESULTS_LIST_PAGE_SIZE, currentPage * RESULTS_LIST_PAGE_SIZE),
    resultCount: results.length,
    pagination,
    // The form keeps the area and boundary when filters are applied
    hiddenFields: ['area', 'lat', 'lng', 'place', 'boundary', 'kind']
      .filter(key => req.query[key] && (key !== 'kind' || kind))
      .map(key => ({ name: key, value: String(req.query[key]) })),
    clearHref: resultsUrl(key => !['area', 'lat', 'lng', 'place'].includes(key)),
    backHref: area ? `${BASE_URL}/design-code/find/boundary?${boundaryParams}` : `${BASE_URL}/design-code/find`,
    questionsHref: area && area.id === 'east-riding' ? `${BASE_URL}/design-code/east-riding/questions` : ''
  })
})

// The council's own development types, for the "Not sure what I am looking for?" questions.
// Values match the short references in the extracted data (see app/data/index.js).
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

// The filter groups and options follow Figma node 535:20291 (see app/data/filters.js)
function readDesignCodeFilters (query, options) {
  return {
    ...filterOptions.readFilters(query, options),
    // An area drawn on the map, as its corners. The route works out what it overlaps.
    boundary: parseBoundary([].concat(query.boundary || [])[0])
  }
}

// A drawn area in the URL is its corners as "lat,lng;lat,lng;…". Returns [lng, lat] points, as
// in GeoJSON, or null if it isn't a usable shape.
function parseBoundary (value) {
  const points = String(value || '').split(';').map(pair => pair.split(',').map(Number))
  const valid = points.length >= 3 && points.length <= 100 &&
    points.every(point => point.length === 2 && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180)
  return valid ? points.map(([lat, lng]) => [lng, lat]) : null
}

// Does a rule match every filter, and apply somewhere in any drawn area? Design feature is
// checked separately.
function ruleMatches (rule, filters, extracted) {
  if (!filterOptions.ruleMatches(rule, filters, extracted)) return false
  const drawn = filters.boundaryOverlap
  if (drawn && !drawn.council) return false
  if (drawn && rule.placeTypeIds.length && !rule.placeTypeIds.some(id => drawn.placeTypeIds.includes(id))) return false
  return true
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

  // On each result, a row for each filter in use, showing what in the code matched it
  const filterRows = rule => [
    ...filterOptions.filterRows(rule, filters, extracted),
    ...(filters.boundaryOverlap
      ? [{
          key: 'Your area',
          value: rule.placeTypeIds.length
            ? 'Applies in its ' + rule.placeTypeIds.filter(id => filters.boundaryOverlap.placeTypeIds.includes(id))
              .map(id => extracted.placeTypes.find(placeType => placeType.id === id).localName.toLowerCase()).join(', ')
            : `Applies across ${areaName}`
        }]
      : [])
  ]

  // Every matching code and key guidance item, in one list, in the order of the design code
  const results = rules
    .filter(rule => ruleMatches(rule, filters, extracted) && filterOptions.hasFeature(rule, filters.features))
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
    ...(filters.boundary ? [{ label: 'Your area', param: 'boundary' }] : []),
    ...filterOptions.appliedFilters(filters, extracted)
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
    filterGroups: filterOptions.filterGroups(filters, extracted),
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
const MAP_PARAMS = ['map', 'settlement', 'site']
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
// Where the pins with the matching design codes go: each zone in a different direction, so the
// nested zones' pins don't sit on top of each other or the labels
const PIN_TOWARD = {
  'outer-neighbourhood': ['east', 0.9],
  'inner-neighbourhood': ['south', 0.7],
  'town-centre': ['north', 0.6],
  'neighbourhood-centre': ['east', 0.3],
  'business-and-industrial': ['north', 0.3]
}
function zonePoint (zone, toward) {
  const ring = zone.geometry.coordinates[0]
  const xs = ring.map(point => point[0])
  const ys = ring.map(point => point[1])
  const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
  const [direction, t] = toward[zone.id] || ['north', 0]
  const pick = { north: p => p[1], south: p => -p[1], west: p => -p[0], east: p => p[0] }[direction]
  const edge = ring.reduce((best, point) => (pick(point) > pick(best) ? point : best))
  return [centre[1] + (edge[1] - centre[1]) * t, centre[0] + (edge[0] - centre[0]) * t]
}

// ---- Drawn areas ----
// Does a drawn area overlap a Polygon or MultiPolygon? Either an edge crosses, or one has a corner
// inside the other. Holes count, so an area inside a ring-shaped zone's hole doesn't overlap it.
function polygonsOf (geometry) {
  if (!geometry) return []
  return geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates]
}

function inRing (point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inPolygon (point, polygon) {
  return inRing(point, polygon[0]) && !polygon.slice(1).some(hole => inRing(point, hole))
}

function edgesCross (a, b) {
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  for (let i = 0; i < a.length; i++) {
    const [p1, p2] = [a[i], a[(i + 1) % a.length]]
    for (let j = 0; j < b.length; j++) {
      const [q1, q2] = [b[j], b[(j + 1) % b.length]]
      if (side(p1, p2, q1) !== side(p1, p2, q2) && side(q1, q2, p1) !== side(q1, q2, p2)) return true
    }
  }
  return false
}

function overlaps (points, geometry) {
  return polygonsOf(geometry).some(polygon =>
    polygon.some(ring => edgesCross(points, ring)) ||
    points.some(point => inPolygon(point, polygon)) ||
    inRing(polygon[0][0], points))
}

// What a drawn area covers: whether it's in the council at all, and the place types of any
// (indicative) zones it overlaps
function boundaryOverlap (code, points) {
  if (!points) return null
  const area = designCodeData.areas.find(item => item.designCode === code)
  const council = (designCodeAreaBoundaries.features.find(feature => feature.properties.id === area.id) || {}).geometry
  const settlements = mapLevels.council === code ? mapLevels.settlements : []
  const placeTypeIds = [...new Set(settlements.flatMap(settlement => settlement.placeTypes)
    .filter(zone => overlaps(points, zone.geometry))
    .map(zone => zone.id))]
  return { council: overlaps(points, council), placeTypeIds }
}

// The page's URL with the filters kept and the map state replaced. The area types are kept unless
// the state gives them.
function drillUrl (code, query, state) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (MAP_PARAMS.includes(key) || key === 'page' || (key === 'area-type' && state.areaTypes)) continue
    for (const item of [].concat(value)) if (item && item !== '_unchecked') params.append(key, item)
  }
  if (state.map) params.set('map', state.map)
  if (state.settlement) params.set('settlement', state.settlement)
  for (const areaType of state.areaTypes || []) params.append('area-type', areaType)
  if (state.site) params.set('site', state.site)
  const search = params.toString()
  return `${BASE_URL}/design-code/${code}${search ? '?' + search : ''}`
}

function mapStateFor (code, query, filters, results) {
  const area = designCodeData.areas.find(item => item.designCode === code)
  const extracted = extractedFor(code)
  const boundaryOf = id => (designCodeAreaBoundaries.features.find(feature => feature.properties.id === id) || {}).geometry
  const levels = mapLevels.council === code ? mapLevels : { settlements: [] }
  const settlement = levels.settlements.find(item => item.id === query.settlement)
  // The zones of the ticked area types. With one, the map goes to that zone; with several, it
  // stays on the town and shows them selected.
  const tickedIds = filters.areaTypes.length ? filterOptions.placeTypesFor(extracted, filters.areaTypes) : []
  const tickedZones = settlement ? settlement.placeTypes.filter(item => tickedIds.includes(item.id)) : []
  const placeType = filters.areaTypes.length === 1 && tickedZones.length === 1 ? tickedZones[0] : null
  // The council is the highest level: the page is about one council's design code
  const level = !settlement ? 'council'
      : !placeType ? 'settlement'
        : query.site === 'example' ? 'site' : 'place-type'
  const url = state => drillUrl(code, query, state)

  // Going up a level to the council or a town leaves the area type
  const crumbs = [{ text: area.name, href: url({ areaTypes: [] }) }]
  if (settlement) crumbs.push({ text: settlement.name, href: url({ settlement: settlement.id, areaTypes: [] }) })
  if (placeType && level !== 'settlement') crumbs.push({ text: placeType.name, href: url({ settlement: settlement.id }) })
  if (level === 'site') crumbs.push({ text: 'Example site', href: url({ settlement: settlement.id, site: 'example' }) })

  const councilFeature = item => ({ id: item.id, name: item.name, geometry: boundaryOf(item.id) })

  // The matching design codes in an area with these place types, for its pin and hover box. A code
  // with no place types applies everywhere; null means the whole council.
  const codesIn = placeTypeIds => results
    .filter(result => !placeTypeIds || !result.placeTypeIds.length || result.placeTypeIds.some(id => placeTypeIds.includes(id)))
    .map(result => result.reference)
  const areaTypeOf = id => (extracted && filterOptions.areaTypeFor(extracted, id)) || ''
  const zoneIds = item => item.placeTypes.map(zone => zone.id)
  const areaTypeNames = filters.areaTypes.map(value => filterOptions.optionText(filterOptions.AREA_TYPES, value).toLowerCase())
  const state = {
    level,
    settlement: settlement ? settlement.id : '',
    crumbs,
    upHref: crumbs.length > 1 ? crumbs[crumbs.length - 2].href : null,
    indicative: false,
    // The map can't zoom out beyond the council
    council: boundaryOf(area.id),
    // Pins with the matching codes go on the map only when filters are in use
    showPins: Boolean(filters.narrows),
    // An area drawn on the map, as [lat, lng] points for Leaflet
    boundary: filters.boundary && {
      points: filters.boundary.map(([lng, lat]) => [lat, lng]),
      codes: results.map(result => result.reference)
    }
  }

  if (level === 'council') {
    Object.assign(state, {
      heading: levels.settlements.length ? `Towns in ${area.name}` : '',
      parent: { ...councilFeature(area), codes: codesIn(null) },
      children: levels.settlements.map(item => ({
        id: item.id, name: item.name, geometry: item.geometry, href: url({ settlement: item.id }), codes: codesIn(zoneIds(item))
      })),
      note: areaTypeNames.length && levels.settlements.length
        ? `Choose a town to see its ${areaTypeNames.join(' and ')}.`
        : ''
    })
  } else if (level === 'settlement') {
    Object.assign(state, {
      heading: `Place types in ${settlement.name}`,
      indicative: true,
      context: [boundaryOf(area.id)],
      parent: { id: settlement.id, name: settlement.name, geometry: settlement.geometry, codes: codesIn(zoneIds(settlement)) },
      siblings: levels.settlements.filter(item => item !== settlement).map(item => ({ id: item.id, name: item.name, geometry: item.geometry })),
      // Each zone is coloured by its national area type (Figma node 487:13814). Choosing one ticks
      // just its area type.
      children: settlement.placeTypes.map(item => ({
        id: item.id,
        name: item.name,
        geometry: item.geometry,
        areaType: areaTypeOf(item.id),
        ticked: tickedIds.includes(item.id),
        labelAt: zonePoint(item, LABEL_TOWARD),
        pinAt: zonePoint(item, PIN_TOWARD),
        href: url({ settlement: settlement.id, areaTypes: [areaTypeOf(item.id)].filter(Boolean) }),
        codes: codesIn([item.id])
      }))
    })
  } else {
    const site = { id: 'example', name: 'Example site (illustrative)', bounds: exampleSiteBounds(placeType), codes: codesIn([placeType.id]) }
    Object.assign(state, {
      heading: level === 'place-type' ? `Sites in ${placeType.name.toLowerCase()}` : '',
      indicative: true,
      context: [settlement.geometry],
      parent: level === 'site'
        ? { ...site, image: '/public/images/design-codes/example-site-illustrative.png' }
        : { id: placeType.id, name: placeType.name, geometry: placeType.geometry, areaType: areaTypeOf(placeType.id), codes: codesIn([placeType.id]) },
      siblings: level === 'site' ? [] : settlement.placeTypes.filter(item => item !== placeType).map(item => ({ id: item.id, name: item.name, geometry: item.geometry })),
      children: level === 'site' ? [] : [{ ...site, href: url({ settlement: settlement.id, site: 'example' }) }]
    })
  }
  return state
}

// The filters a "Not sure what I am looking for?" result sets: the development type options that
// the council's development type matches, and the area type of the place type
function questionsFilters (code, result) {
  const extracted = extractedFor(code)
  return {
    developmentTypes: result.developmentTypes || filterOptions.developmentTypesFor(result.developmentType),
    areaTypes: result.placeType ? [filterOptions.areaTypeFor(extracted, result.placeType)].filter(Boolean) : []
  }
}

router.get('/design-code/:code', (req, res, next) => {
  const placeholder = designCodeData.designCodes[req.params.code]
  if (!placeholder) return next()
  const extracted = extractedFor(req.params.code)
  // The council's own design code is ticked when the page first opens
  const filters = readDesignCodeFilters(req.query, { defaultDesignCode: extracted && extracted.id })
  filters.boundaryOverlap = boundaryOverlap(req.params.code, filters.boundary)
  filters.hasFilters = filterOptions.anyFilters(filters) || Boolean(filters.boundary)
  // The council's own design code, ticked when the page opens, narrows nothing, so it alone doesn't put pins on the map
  filters.narrows = Boolean(filters.boundary) ||
    filterOptions.anyFilters({ ...filters, designCodes: filters.designCodes.filter(value => !extracted || value !== extracted.id) })
  const page = extracted
    ? extractedPage(placeholder, extracted, filters)
    : { designCode: placeholder, filterGroups: [], results: [], appliedFilters: [], resultCount: 0 }

  // Send "Back" to the entity page the user came from, if that's how they got here.
  // Only the path is used, so the link always stays on this site.
  const referrerPath = new URL(req.get('referer') || '/', 'http://localhost').pathname
  const cameFromEntity = referrerPath.startsWith(BASE_URL + '/entity/') && /^\d+$/.test(referrerPath.slice((BASE_URL + '/entity/').length))

  // Explain the results if they came from "Not sure what I am looking for?"
  const journey = req.session.designCodeQuestions
  const result = journey && journey.code === req.params.code && journey.result
  const expected = result && questionsFilters(req.params.code, result)
  const same = (a, b) => a.length === b.length && a.every(item => b.includes(item))
  const fromQuestions = Boolean(result && !result.speakToCouncil && !filters.boundary &&
    same(filters.areaTypes, expected.areaTypes) && same(filters.developmentTypes, expected.developmentTypes) &&
    !filterOptions.anyFilters({ ...filters, areaTypes: [], developmentTypes: [], designCodes: [] }))

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

  // Adds design-code=none to a URL, so the council's own design code isn't ticked again
  const withNoDesignCode = (needed, href) => !needed || /[?&]design-code=none(&|$)/.test(href)
    ? href
    : href + (href.includes('?') ? '&' : '?') + 'design-code=' + filterOptions.NO_DESIGN_CODE

  // Removing a filter's tag removes just that value. A new area type leaves the example site.
  const appliedFilters = page.appliedFilters.map(filter => ({
    ...filter,
    removeHref: withNoDesignCode(filter.param === 'design-code', pageUrl((key, item) => (key === filter.param && (!filter.value || item === filter.value)) ||
      (filter.param === 'area-type' && key === 'site')))
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
      developmentTypeText: result.developmentType
        ? DEVELOPMENT_TYPE_OPTIONS.find(option => option.value === result.developmentType).text
        : expected.developmentTypes.map(value => filterOptions.optionText(filterOptions.DEVELOPMENT_TYPES, value)).join(' or '),
      changeHref: questionsUrl(req.params.code, journey.path[journey.path.length - 1])
    },
    backHref: cameFromEntity ? referrerPath : BASE_URL + '/design-code/find?area=' + page.designCode.area,
    code: req.params.code,
    ...page,
    appliedFilters,
    pageResults: page.results.slice((currentPage - 1) * RESULTS_PAGE_SIZE, currentPage * RESULTS_PAGE_SIZE),
    pagination,
    hasData: Boolean(extracted),
    mapState: mapStateFor(req.params.code, req.query, filters, page.results),
    filters,
    hasFilters: filters.hasFilters,
    // "Not sure? Find your place type" keeps the development types already ticked
    placeTypeQuestionsHref: `${BASE_URL}/design-code/${req.params.code}/questions?` +
      new URLSearchParams([['start', 'place-type'], ...filters.developmentTypes.map(value => ['development-type', value])]).toString()
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

// The council's page with the filters a result sets
function councilUrl (code, result) {
  const { developmentTypes, areaTypes } = questionsFilters(code, result)
  const params = new URLSearchParams()
  developmentTypes.forEach(value => params.append('development-type', value))
  areaTypes.forEach(value => params.append('area-type', value))
  const query = params.toString()
  return `${BASE_URL}/design-code/${code}${query ? '?' + query : ''}`
}

// Start the questions. "Not sure? Find your place type" starts at the place type questions
// and keeps the development types already ticked in the filters.
router.get('/design-code/:code/questions', (req, res, next) => {
  if (!extractedFor(req.params.code)) return next()
  const placeTypeOnly = req.query.start === 'place-type'
  const first = placeTypeOnly ? 'settlement' : 'development-type'
  req.session.designCodeQuestions = {
    code: req.params.code,
    // The council's own development type, from the first question
    developmentType: '',
    // Or the development type options already ticked
    developmentTypes: placeTypeOnly ? readDesignCodeFilters(req.query).developmentTypes : null,
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
  if (id === 'development-type') {
    journey.developmentType = answer
    journey.developmentTypes = null
  }
  // Answering again forgets the questions that came after this one
  journey.path = journey.path.slice(0, journey.path.indexOf(id) + 1)

  const step = nextStep(node, answer)
  if (typeof step === 'string') {
    journey.path.push(step)
    return res.redirect(questionsUrl(code, step))
  }

  journey.result = { developmentType: journey.developmentType, developmentTypes: journey.developmentTypes, ...step }
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
    resultsHref: councilUrl(req.params.code, { developmentType: journey.developmentType, developmentTypes: journey.developmentTypes }),
    placeTypeOptions: PLACE_TYPE_OPTIONS
  })
})

// Guidance written as a heading and its text on each line, as in the spreadsheets:
// "Area type vision – 3.3.4: Prioritise pedestrians…" -> { heading: 'Area type vision', text: 'Prioritise pedestrians…' }
// The section reference after the dash is left out, as in the Figma design (node 1270:40253). Guidance
// written as prose (such as East Riding's) gives an empty list, so it's shown as it is.
function guidanceSections (text) {
  const lines = String(text || '').split('\n').map(line => line.trim()).filter(Boolean)
  const sections = lines.map(line => /^([^:]{3,90}):\s+(.+)$/.exec(line))
  if (!lines.length || sections.some(match => !match)) return []
  return sections.map(([, heading, body]) => ({ heading: heading.replace(/\s+[–-]\s+[\d.]+$/, ''), text: body }))
}

// The development types a rule applies to, grouped as in the Figma design (node 1270:39842):
// "Major – Homes" goes under "Major development". Types with a description (such as East Riding's)
// are listed with it.
function developmentTypeGroups (rule) {
  const groups = []
  const group = key => {
    let found = groups.find(item => item.key === key)
    if (!found) groups.push(found = { key, values: [] })
    return found
  }
  for (const type of rule.developmentTypeDetails) {
    const sized = /^(Major|Minor)\s+[–-]\s+(.+)$/.exec(type.name)
    if (sized) group(`${sized[1]} development`).values.push(sized[2])
    else if (type.description) groups.push({ key: type.name, values: [type.description] })
    else group('Other development').values.push(type.name)
  }
  return groups
}

// Where a rule applies, as rows of the "Where the rule applies" tab: the places its "Area" names,
// then any details after them.
//   "Becontree Estate (…). House types: Type A, Type B. Location: Mid terrace."
//     -> Becontree Estate (…); House types: Type A, Type B; Location: Mid terrace
//   "Central urban area; Edge of centre urban area. Sites: R2 …; R3 …"
//     -> Central urban area; Edge of centre urban area; Sites: [R2 …, R3 …]
// Without the spreadsheet's text, it's the rule's place types, or "All area types".
function areaRows (rule, placeNames) {
  if (!rule.areaText) return (placeNames.length ? placeNames : ['All area types']).map(name => ({ key: name, values: [] }))
  const [first, ...rest] = rule.areaText.split(/\.\s+(?=[A-Z][^.:]{0,40}:)/)
  const names = first.replace(/\.$/, '').split(';').map(name => name.trim()).filter(Boolean)
  const details = rest.map(part => /^([^:]+):\s*(.*)$/.exec(part.replace(/\.$/, ''))).filter(Boolean)
  return [
    ...names.map(name => ({ key: name, values: [] })),
    ...details.map(([, label, text]) => ({
      key: label,
      // A list of sites is one per line
      values: /^sites$/i.test(label) ? text.split(';').map(item => item.trim()).filter(Boolean) : [text]
    }))
  ]
}

// One code or piece of key guidance in full, linked from "Open full design code" (Figma nodes
// 1270:39842, 1270:40253, 1270:39985 and 1270:40123)
router.get('/design-code/:code/:reference', (req, res, next) => {
  const placeholder = designCodeData.designCodes[req.params.code]
  const extracted = placeholder && extractedFor(req.params.code)
  if (!extracted) return next()

  const rule = extracted.chapters
    .flatMap(chapter => chapter.sections)
    .flatMap(section => section.rules)
    .find(item => item.reference.toLowerCase() === req.params.reference.toLowerCase())
  if (!rule) return next()

  const placeNames = rule.placeTypeIds
    .map(id => (extracted.placeTypes.find(placeType => placeType.id === id) || {}).localName)
    .filter(Boolean)
  const guidanceText = rule.guidanceText || ''
  // The pages the rule is on, for the design code's own document: "Pages 27 to 31"
  const rulePages = rule.pageNumber
    ? (rule.endPageNumber ? `Pages ${rule.pageNumber} to ${rule.endPageNumber}` : `Page ${rule.pageNumber}`)
    : ''
  const section = rule.section

  // Back to the design requirements: the same page of them, with the same filters, when coming
  // from there
  let backHref = `${BASE_URL}/design-code/find/results?area=${encodeURIComponent(placeholder.area)}`
  try {
    const referrer = new URL(req.get('Referer') || '')
    if (referrer.pathname === `${BASE_URL}/design-code/find/results`) backHref = `${referrer.pathname}${referrer.search}`
  } catch (error) {}

  res.render(`${VIEWS}/design-code/rule`, {
    designCode: {
      name: extracted.title,
      status: extracted.status,
      // The page or document the rule is on, if the data has one
      url: rule.documentUrl || extracted.documentUrl,
      localDevelopmentDocument: extracted.localDevelopmentDocument
    },
    rule,
    typeText: rule.type === 'code' ? 'Rule' : rule.typeName === 'Recommendation' ? 'Recommendation' : 'Guidance',
    features: rule.features.map(featureName).join(', '),
    areas: areaRows(rule, placeNames),
    developmentTypes: developmentTypeGroups(rule),
    guidanceText,
    guidanceSections: guidanceSections(guidanceText),
    // Where in the design code the rule is: "Chatham Cross, Movement – Public Transport"
    location: [section.name, rule.nationalDesignIssue].filter(Boolean).join(', '),
    // "Volume 3, Part A (pages 80 to 95). Medway Council, 2024"
    documents: rule.supportingDocuments.map(document => {
      const pages = document.volume && section.pageNumber
        ? ` (pages ${section.pageNumber}${section.endPageNumber ? ` to ${section.endPageNumber}` : ''})`
        : ''
      const published = [document.publisher, document.date].filter(Boolean).join(', ')
      const where = document.volume ? document.volume + pages : document.isDesignCode ? rulePages : ''
      return {
        ...document,
        details: [where, published].filter(Boolean).join('. ')
      }
    }),
    backHref
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
