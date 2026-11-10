//
// Filter options on a council's design code page, in the order and wording of Figma node
// 535:20291, and how each council's own values match them. Used by v2 and v3.
//
// Every group is a set of checkboxes. Ticking several options in a group shows codes that match
// any of them; ticking options in different groups shows codes that match every group.
//

const DESIGN_FEATURES = [
  { value: 'climate', text: 'Climate' },
  { value: 'nature', text: 'Nature' },
  { value: 'movement', text: 'Movement' },
  { value: 'built-form', text: 'Built form' },
  { value: 'public-space', text: 'Public space' },
  { value: 'identity', text: 'Identity' },
  { value: 'liveability', text: 'Liveability' }
]

const DESIGN_CODE_TYPES = [
  { value: 'authority-wide', text: 'Authority wide' },
  { value: 'area-specific', text: 'Area specific' },
  { value: 'site-specific', text: 'Site specific' }
]

// The values are the national area types (app/data/national.js) and two the Figma adds
const AREA_TYPES = [
  { value: 'town-or-city-centre', text: 'Town or city centre' },
  { value: 'local-centre', text: 'Local centre' },
  { value: 'urban-neighbourhood', text: 'Urban neighbourhood' },
  { value: 'suburbs', text: 'Suburbs' },
  { value: 'industrial-area', text: 'Industrial area' },
  { value: 'rural-settlements', text: 'Rural settlement' },
  { value: 'business-science-retail-park', text: 'Business science retail park' },
  { value: 'village', text: 'Village' }
]

const DEVELOPMENT_TYPES = [
  { value: 'householder', text: 'Householder' },
  { value: 'minor-residential', text: 'Minor residential' },
  { value: 'major-residential', text: 'Major residential' },
  { value: 'minor-commercial-or-retail', text: 'Minor commercial or retail' },
  { value: 'major-commercial-or-retail', text: 'Major commercial or retail' },
  { value: 'other', text: 'Other' }
]

const DESIGN_CODE_STATUSES = [
  { value: 'draft', text: 'Draft' },
  { value: 'adopted', text: 'Adopted' },
  { value: 'withdrawn', text: 'Withdrawn' },
  { value: 'endorsed', text: 'Endorsed' }
]

const PLANNING_DOCUMENT_TYPES = [
  { value: 'local-plan', text: 'Local plan' },
  { value: 'local-planning-guidance', text: 'Local planning guidance' },
  { value: 'supplementary-plan', text: 'Supplementary plan' },
  { value: 'supplementary-planning-document', text: 'Supplementary planning document' }
]

// "code" and "key-guidance" are the rule types in the extracted data
const RULE_TYPES = [
  { value: 'code', text: 'Rule' },
  { value: 'key-guidance', text: 'Guidance' }
]

// The councils' own development types (short references) that each option matches. Major
// development is 10 or more homes. East Riding doesn't split commercial or mixed use development
// by size, so they match both commercial options.
const DEVELOPMENT_TYPE_MATCHES = {
  householder: ['householder'],
  'minor-residential': ['1-2-units', '3-9-units'],
  'major-residential': ['10-plus-units', 'flats'],
  'minor-commercial-or-retail': ['commercial', 'mixed-use'],
  'major-commercial-or-retail': ['commercial', 'mixed-use'],
  other: ['agricultural', 'industrial-storage-and-distribution', 'advertisement-consent']
}

// The development type options that one of the council's own development types matches
function developmentTypesFor (localId) {
  return DEVELOPMENT_TYPES.map(option => option.value).filter(value => DEVELOPMENT_TYPE_MATCHES[value].includes(localId))
}

// The council's place types that the ticked area types match: by their national area type, and
// "Village" also by the council's own place type of that name
function placeTypesFor (extracted, areaTypes) {
  return extracted.placeTypes
    .filter(placeType => areaTypes.includes(placeType.areaType) || (areaTypes.includes('village') && placeType.id === 'village'))
    .map(placeType => placeType.id)
}

// The area type option for one of the council's place types, or '' if there's none
function areaTypeFor (extracted, placeTypeId) {
  const placeType = extracted.placeTypes.find(item => item.id === placeTypeId)
  return (placeType && placeType.areaType) || ''
}

function optionText (options, value) {
  return (options.find(option => option.value === value) || {}).text || value
}

// ---- Reading and applying the filters ----

// Each group: its title, its query parameter, the filters' property for it, and its options
// (Design code's options are the council's own codes, so they're added per page)
const GROUPS = [
  { key: 'features', param: 'feature', title: 'Design feature', options: DESIGN_FEATURES },
  { key: 'designCodes', param: 'design-code', title: 'Design code' },
  { key: 'designCodeTypes', param: 'design-code-type', title: 'Design code type', options: DESIGN_CODE_TYPES },
  { key: 'areaTypes', param: 'area-type', title: 'Area type', options: AREA_TYPES },
  { key: 'developmentTypes', param: 'development-type', title: 'Development type', options: DEVELOPMENT_TYPES },
  { key: 'statuses', param: 'status', title: 'Design code status', options: DESIGN_CODE_STATUSES },
  {
    key: 'documentTypes',
    param: 'document-type',
    title: 'Planning document type',
    hint: 'The document that the design code was adopted through.',
    options: PLANNING_DOCUMENT_TYPES
  },
  { key: 'ruleTypes', param: 'rule-type', title: 'Design code rule type', options: RULE_TYPES }
]

// The form always sends design-code=none, so a page with no design-code at all is a first visit,
// where the council's own design code is ticked
const NO_DESIGN_CODE = 'none'

// options.defaultDesignCode: the design code ticked when the URL doesn't choose any
function readFilters (query, options = {}) {
  // The prototype kit adds "_unchecked" for checkbox groups with nothing ticked
  const list = value => [].concat(value || []).filter(item => item && item !== '_unchecked' && item !== NO_DESIGN_CODE)
  const filters = { search: String(query.q || '').trim() }
  GROUPS.forEach(group => { filters[group.key] = list(query[group.param]) })
  if (query['design-code'] === undefined && options.defaultDesignCode) filters.designCodes = [options.defaultDesignCode]
  return filters
}

function anyFilters (filters) {
  return Boolean(filters.search || GROUPS.some(group => filters[group.key].length))
}

// Towns with a place on the v3 map but no design code of their own yet. Ticking one on its own
// shows no results.
const TOWN_DESIGN_CODES = {
  'east-riding-design-code': [{ value: 'beverley', text: 'Beverley' }]
}

// The council's own design codes, for the Design code group
function designCodeOptions (extracted) {
  return [{ value: extracted.id, text: extracted.title }, ...(TOWN_DESIGN_CODES[extracted.id] || [])]
}

function groupOptions (group, extracted) {
  return group.key === 'designCodes' ? designCodeOptions(extracted) : group.options
}

// Does a rule match every filter except Design feature, which is checked separately (see
// hasFeature)? Within a group, any ticked option will do.
function ruleMatches (rule, filters, extracted) {
  const ticked = (key, value) => !filters[key].length || filters[key].includes(value)
  if (!ticked('designCodes', extracted.id)) return false
  if (!ticked('designCodeTypes', extracted.designCodeType)) return false
  if (!ticked('statuses', extracted.statusValue)) return false
  if (!ticked('documentTypes', extracted.documentType)) return false
  if (!ticked('ruleTypes', rule.type)) return false
  if (filters.developmentTypes.length) {
    const localIds = filters.developmentTypes.flatMap(value => DEVELOPMENT_TYPE_MATCHES[value] || [])
    if (!rule.developmentTypeIds.some(id => localIds.includes(id))) return false
  }
  // A rule with no place types applies in every place type
  if (filters.areaTypes.length && rule.placeTypeIds.length) {
    const placeTypeIds = placeTypesFor(extracted, filters.areaTypes)
    if (!rule.placeTypeIds.some(id => placeTypeIds.includes(id))) return false
  }
  if (filters.search) {
    const text = [rule.reference, rule.requirementText, rule.guidanceText].join(' ').toLowerCase()
    if (!text.includes(filters.search.toLowerCase())) return false
  }
  return true
}

// With no features ticked, every rule is shown
function hasFeature (rule, features) {
  return !features.length || rule.features.some(feature => features.includes(feature))
}

// The groups for the page, with each option ticked or not
function filterGroups (filters, extracted) {
  return GROUPS.map(group => ({
    title: group.title,
    name: group.param,
    hint: group.hint,
    count: filters[group.key].length,
    items: groupOptions(group, extracted).map(option => ({
      value: option.value,
      text: option.text,
      checked: filters[group.key].includes(option.value)
    }))
  }))
}

// On each result, a row for each group in use, showing what in the code matched it
function filterRows (rule, filters, extracted) {
  const texts = (options, values) => values.map(value => optionText(options, value)).join(', ')
  const placeTypeNames = rule.placeTypeIds
    .filter(id => placeTypesFor(extracted, filters.areaTypes).includes(id))
    .map(id => extracted.placeTypes.find(placeType => placeType.id === id).localName)
  return [
    filters.features.length && {
      key: 'Design feature',
      value: texts(DESIGN_FEATURES, rule.features.filter(feature => filters.features.includes(feature)))
    },
    // Every result is from the council's own design code, so that alone (ticked when the page opens) needs no row
    filters.designCodes.some(value => value !== extracted.id) && { key: 'Design code', value: extracted.title },
    filters.designCodeTypes.length && { key: 'Design code type', value: optionText(DESIGN_CODE_TYPES, extracted.designCodeType) },
    filters.areaTypes.length && {
      key: 'Area type',
      value: placeTypeNames.length ? placeTypeNames.join(', ') : texts(AREA_TYPES, filters.areaTypes)
    },
    filters.developmentTypes.length && {
      key: 'Development type',
      value: texts(DEVELOPMENT_TYPES, filters.developmentTypes
        .filter(value => rule.developmentTypeIds.some(id => DEVELOPMENT_TYPE_MATCHES[value].includes(id))))
    },
    filters.statuses.length && { key: 'Design code status', value: optionText(DESIGN_CODE_STATUSES, extracted.statusValue) },
    filters.documentTypes.length && { key: 'Planning document type', value: optionText(PLANNING_DOCUMENT_TYPES, extracted.documentType) },
    filters.ruleTypes.length && { key: 'Design code rule type', value: optionText(RULE_TYPES, rule.type) }
  ].filter(Boolean)
}

// A tag for each ticked option, in the order of the groups, with the query parameter and value
// that remove just that one
function appliedFilters (filters, extracted) {
  return [
    ...(filters.search ? [{ label: `Search: ${filters.search}`, param: 'q' }] : []),
    ...GROUPS.flatMap(group => filters[group.key].map(value => ({
      label: optionText(groupOptions(group, extracted), value),
      param: group.param,
      value
    })))
  ]
}

module.exports = {
  NO_DESIGN_CODE,
  readFilters,
  anyFilters,
  ruleMatches,
  hasFeature,
  filterGroups,
  filterRows,
  appliedFilters,
  DESIGN_FEATURES,
  DESIGN_CODE_TYPES,
  AREA_TYPES,
  DEVELOPMENT_TYPES,
  DESIGN_CODE_STATUSES,
  PLANNING_DOCUMENT_TYPES,
  RULE_TYPES,
  DEVELOPMENT_TYPE_MATCHES,
  developmentTypesFor,
  placeTypesFor,
  areaTypeFor,
  optionText
}
