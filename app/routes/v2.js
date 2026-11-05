//
// Routes for version 2 of the prototype, served under /v2
//
// To make a new version, copy this file and app/views/v1/,
// then change BASE_URL and VIEWS below.
//

const govukPrototypeKit = require('govuk-prototype-kit')

const BASE_URL = '/v2'
const VIEWS = 'v2'

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

// A card's title, council and status, from the extracted data if there is any
function cardDesignCode (slug) {
  const placeholder = designCodeData.designCodes[slug]
  const extracted = extractedFor(slug)
  if (!extracted) return placeholder
  return { ...placeholder, name: extracted.title, council: extracted.council, status: extracted.status.text }
}

// Landing page for design codes, linking to the guidance and the finder
router.get('/design-code', (req, res) => {
  res.render(`${VIEWS}/design-code`)
})

// Guidance on preparing a design code
router.get('/design-code/learn', (req, res) => {
  res.render(`${VIEWS}/design-code/learn`)
})

// Find a design code by choosing an area on a map or in a list
// Several areas can be chosen. Without JavaScript, the search narrows the list when sent.
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

// The filter groups and options follow Figma node 535:20291 (see app/data/filters.js)
const readDesignCodeFilters = filterOptions.readFilters

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
  const rules = extracted.chapters.flatMap(chapter => chapter.sections).flatMap(section => section.rules)

  // Every matching code and key guidance item, in one list, in the order of the design code
  const results = rules
    .filter(rule => filterOptions.ruleMatches(rule, filters, extracted) && filterOptions.hasFeature(rule, filters.features))
    .map(rule => ({
      reference: rule.reference,
      type: rule.type,
      title: rule.title,
      // The development types it applies to, as keys (H, 1, 2…) with their names
      developmentTypes: rule.developmentTypeCodes.map((key, index) => ({ key, name: rule.developmentTypes[index] })),
      section: `${rule.section.reference} ${rule.section.name}`,
      // Not shown on the cards for now
      summary: firstSentence(rule.requirementText),
      // On each card, a row for each filter in use, showing what in the code matched it
      filterRows: filterOptions.filterRows(rule, filters, extracted),
      // The data has no status for each code, so each one shows the design code's status
      status: extracted.status.text
    }))

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
    // A tag for each filter in use (Figma node 407:15665)
    appliedFilters: filterOptions.appliedFilters(filters, extracted),
    resultCount: results.length
  }
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
  const filters = readDesignCodeFilters(req.query)
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
  const fromQuestions = Boolean(result && !result.speakToCouncil &&
    same(filters.areaTypes, expected.areaTypes) && same(filters.developmentTypes, expected.developmentTypes) &&
    !filterOptions.anyFilters({ ...filters, areaTypes: [], developmentTypes: [] }))

  // Removing a filter's tag removes just that value
  const withoutFilter = filter => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(req.query)) {
      for (const item of toArray(value)) {
        if (item !== '_unchecked' && !(key === filter.param && (!filter.value || item === filter.value))) params.append(key, item)
      }
    }
    const search = params.toString()
    return search ? '?' + search : ''
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
    appliedFilters: page.appliedFilters.map(filter => ({ ...filter, removeQuery: withoutFilter(filter) })),
    hasData: Boolean(extracted),
    filters,
    hasFilters: filterOptions.anyFilters(filters),
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
