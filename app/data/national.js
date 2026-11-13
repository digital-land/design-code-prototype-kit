//
// Values from the national design code structure (see "National values" in schema.md), shared by
// every council's design code. Each council's own place types point to an area type here.
//
const FEATURES = [
  { value: 'climate', text: 'Climate' },
  { value: 'nature', text: 'Nature' },
  { value: 'movement', text: 'Movement' },
  { value: 'built-form', text: 'Built form' },
  { value: 'public-space', text: 'Public space' },
  { value: 'identity', text: 'Identity' }
]

const AREA_TYPES = [
  { value: 'town-or-city-centre', text: 'Town or city centre' },
  { value: 'local-centre', text: 'Local centre' },
  { value: 'urban-neighbourhood', text: 'Urban neighbourhood' },
  { value: 'suburbs', text: 'Suburbs' },
  { value: 'industrial-area', text: 'Industrial area' },
  { value: 'rural-settlements', text: 'Rural settlements' }
]

const DESIGN_CODE_TYPES = [
  { value: 'authority-wide', text: 'Authority-wide' },
  { value: 'area-specific', text: 'Area-specific' },
  { value: 'site-specific', text: 'Site-specific' }
]

module.exports = { FEATURES, AREA_TYPES, DESIGN_CODE_TYPES }
