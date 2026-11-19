// The kinds of place the map can recognise (parks, streets, homes…), and which design code rules
// are for each. Shared by v5's boundary map in the browser (window.PlaceKinds) and v5's routes in
// Node (require), so the count on the map and the list after it agree. v4 has its own copy in
// v4-map.js.
//
// A rule here is a summary from ruleSummary() in app/routes/v5.js: its about (title and issue),
// text, features and placeTypeIds.

(function (root) {
  var KINDS = {
    green: {
      label: 'a park or green space',
      plural: 'parks and green spaces',
      features: ['nature', 'public-space'],
      words: /\b(green|park(?!ing)|open space|play|tree|landscap|planting|biodivers|nature|habitat|wildlife|hedgerow|verge|grass|woodland|recreation)/,
      placeTypes: ['green-edge']
    },
    water: {
      label: 'water or a riverside',
      plural: 'water and riversides',
      features: ['nature'],
      words: /\b(water|river|waterfront|riverside|blue infrastructure|drainage|suds|flood|wharf|quay|canal)/,
      placeTypes: ['waterfront']
    },
    street: {
      label: 'a street',
      plural: 'streets',
      features: ['movement'],
      words: /\b(street|footway|footpath|crossing|cycl|carriageway|junction|bus\b|parking|speed|kerb|pavement|public realm|walking|traffic|charging)/,
      placeTypes: []
    },
    homes: {
      label: 'a residential area',
      plural: 'homes and residential areas',
      features: ['homes-and-buildings'],
      words: /\b(home|house|dwelling|residential|extension|porch|roof|plot|boundar|bin|privacy|outbuilding|infill|garden|dormer|window|elevation|amenity space)/,
      placeTypes: ['residential-streets', 'inner-neighbourhood', 'outer-neighbourhood', 'village', 'suburban-area',
        'becontree-estate-non-designated-heritage-asset']
    },
    shops: {
      label: 'shops or a town centre',
      plural: 'shops and town centres',
      features: ['uses'],
      words: /\b(shop|frontage|retail|town centre|high street|signage|active|commercial|mixed use|centre|market|fascia|bars|eateries)/,
      placeTypes: ['town-centre', 'neighbourhood-centre', 'chatham-cross', 'central-urban-area']
    },
    industry: {
      label: 'an industrial or business area',
      plural: 'industrial and business areas',
      features: [],
      words: /\b(industrial|employment|business|isdc|servicing|storage|distribution|warehouse|interface)/,
      placeTypes: ['business-and-industrial', 'industrial-or-institutional-interface']
    },
    farmland: {
      label: 'farmland or countryside',
      plural: 'farmland and the countryside',
      features: [],
      words: /\b(agricultur|countryside|rural|farm|hedgerow|landscape|settlement edge|green edge)/,
      placeTypes: ['countryside', 'green-edge']
    }
  }

  // OpenStreetMap's map colours for each kind of place (its "Carto" style)
  var PALETTE = [
    ['green', [200, 250, 204]], ['green', [205, 235, 176]], ['green', [223, 252, 226]], ['green', [173, 209, 158]],
    ['green', [170, 224, 203]], ['green', [170, 203, 175]], ['green', [201, 225, 191]], ['green', [222, 246, 192]],
    ['green', [200, 215, 171]], ['green', [214, 217, 159]], ['green', [157, 202, 138]],
    ['water', [170, 211, 223]],
    ['homes', [224, 223, 223]], ['homes', [217, 208, 201]], ['homes', [196, 182, 171]],
    ['shops', [255, 214, 209]], ['shops', [242, 218, 217]],
    ['industry', [235, 219, 232]],
    ['farmland', [238, 240, 213]], ['farmland', [245, 220, 186]],
    ['street', [255, 255, 255]], ['street', [252, 214, 164]], ['street', [247, 250, 191]], ['street', [249, 178, 156]],
    ['street', [232, 146, 162]], ['street', [221, 221, 232]], ['street', [250, 128, 114]], ['street', [238, 238, 238]]
  ]

  function colourKind (r, g, b) {
    var best = null
    var bestDistance = 18 // Colours further than this from all of them (labels, outlines) don't count
    PALETTE.forEach(function (entry) {
      var c = entry[1]
      var distance = Math.abs(r - c[0]) + Math.abs(g - c[1]) + Math.abs(b - c[2])
      if (distance < bestDistance) { bestDistance = distance; best = entry[0] }
    })
    return best
  }
  // Whether a rule is for a kind of place
  function fitsKind (rule, kind) {
    var details = KINDS[kind]
    var shortId = function (id) { return String(id).split(':').pop() }
    var score = (details.words.test(rule.about) ? 3 : 0) +
      (details.words.test(String(rule.text).toLowerCase()) ? 1 : 0) +
      ((rule.features || []).some(function (item) { return details.features.indexOf(item) !== -1 }) ? 1 : 0) +
      ((rule.placeTypeIds || []).some(function (id) { return details.placeTypes.indexOf(shortId(id)) !== -1 }) ? 3 : 0)
    return score >= 3
  }
  var PlaceKinds = { KINDS: KINDS, PALETTE: PALETTE, colourKind: colourKind, fitsKind: fitsKind }
  if (typeof module !== 'undefined' && module.exports) module.exports = PlaceKinds
  else root.PlaceKinds = PlaceKinds
})(this)
