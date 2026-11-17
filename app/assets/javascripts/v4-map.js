//
// v4: one area's design code rules beside a full width map (app/views/v4/design-code/map.html).
//
// The map stays on the area that was searched for: it can be panned and zoomed in, but not moved
// away from the area or zoomed out past it. The area's rules are listed over the right of the map
// straight away, a page at a time (Figma node 1260:39081). Selecting a place, or drawing an area,
// drops a pin and works out roughly what kind of place it is (a park, a street, shops…), so the
// list shows the rules for that kind of place (see "What kind of place"). Choosing a rule shows its
// summary in the same container (node 1270:39679), which links to the rule's own page.
//

(function () {
  var data = window.v4MapData
  var mapElement = document.getElementById('v4-map')
  if (!data || !mapElement || !window.L) return

  var designCode = data.designCode
  var PAGE_SIZE = 4 // As in the Figma design

  // ---- Filters apply as soon as they change ----

  var form = document.getElementById('v4-filters')
  form.querySelector('.app-v4-filters__submit').hidden = true
  form.addEventListener('change', function (event) {
    if (event.target.matches('input[type="checkbox"]')) form.submit()
  })

  // ---- The map ----

  var BLUE = '#1d70b8'
  var AREA_STYLE = { color: BLUE, weight: 2, opacity: 0.9, fillColor: BLUE, fillOpacity: 0.06, interactive: false }
  var BOUNDARY = { color: BLUE, weight: 2, fillColor: BLUE, fillOpacity: 0.15 }

  var map = L.map(mapElement, { zoomControl: false, scrollWheelZoom: true })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    crossOrigin: 'anonymous', // So the tiles' colours can be read (see "What kind of place")
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map)
  map.setView([53, -1.2], 6)

  var side = document.getElementById('v4-side')

  // ---- Hiding the filters ----
  //
  // "Hide filters" folds the filters away to see more of the map; "Show filters" brings them back.
  // It's remembered while the browser tab is open, so it stays the same coming back from a rule.

  var panel = document.getElementById('v4-panel')
  var panelToggle = document.getElementById('v4-panel-toggle')
  var panelBody = document.getElementById('v4-panel-body')
  var HIDDEN_KEY = 'v4-filters-hidden'

  function setFiltersHidden (hidden) {
    panelBody.hidden = hidden
    panel.classList.toggle('app-v4-panel--hidden', hidden)
    document.querySelector('.app-v4').classList.toggle('app-v4--filters-hidden', hidden)
    panelToggle.textContent = hidden ? 'Show filters' : 'Hide filters'
    panelToggle.setAttribute('aria-expanded', String(!hidden))
    try { window.sessionStorage.setItem(HIDDEN_KEY, hidden ? 'yes' : '') } catch (error) {}
  }

  panelToggle.hidden = false
  panelToggle.addEventListener('click', function () { setFiltersHidden(!panelBody.hidden) })
  var startHidden = false
  try { startHidden = window.sessionStorage.getItem(HIDDEN_KEY) === 'yes' } catch (error) {}
  if (startHidden) setFiltersHidden(true)

  // On large screens the filters cover the left of the map (unless they're hidden), and the
  // container the right
  function isDesktop () {
    return window.matchMedia('(min-width: 48.0625em)').matches
  }
  function padding () {
    if (!isDesktop()) return { paddingTopLeft: [20, 20], paddingBottomRight: [20, 20] }
    var left = panelBody.hidden ? 40 : 320
    var right = side.hidden ? 40 : side.offsetWidth + 40
    return { paddingTopLeft: [left, 40], paddingBottomRight: [right, 40] }
  }
  function fit (bounds) {
    map.fitBounds(bounds, Object.assign({ maxZoom: 14 }, padding()))
  }

  var areaGeometry = null
  var areaBounds = null

  // Keep the map on the area: it can't be dragged away from it, or zoomed out past it
  function lockToArea () {
    var limit = areaBounds.pad(0.35)
    map.setMaxBounds(limit)
    map.options.maxBoundsViscosity = 1
    map.setMinZoom(Math.max(map.getBoundsZoom(limit, false) - 1, 5))
  }

  fetch(data.boundaries)
    .then(function (response) { return response.json() })
    .then(function (geojson) {
      var layer = L.geoJSON(geojson, {
        filter: function (feature) { return feature.properties.id === designCode.area },
        style: function () { return AREA_STYLE }
      }).addTo(map)
      layer.eachLayer(function (item) { areaGeometry = item.feature.geometry })
      areaBounds = layer.getBounds()
      if (!areaBounds.isValid()) return
      if (data.pin) {
        // A postcode or town: centre on it, zoomed in a little
        map.setView([data.pin.lat, data.pin.lng], 13)
        setPin(L.latLng(data.pin.lat, data.pin.lng))
      } else {
        fit(areaBounds)
      }
      lockToArea()
    })

  // ---- Is a place in the area? ----

  function inRing (point, ring) {
    var x = point[0]
    var y = point[1]
    var inside = false
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i][0]
      var yi = ring[i][1]
      var xj = ring[j][0]
      var yj = ring[j][1]
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }

  // Polygons as lists of rings of [lng, lat]
  function polygonsOf (geometry) {
    if (!geometry) return []
    return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  }

  function inGeometry (point, geometry) {
    return polygonsOf(geometry).some(function (polygon) {
      return inRing(point, polygon[0]) && !polygon.slice(1).some(function (hole) { return inRing(point, hole) })
    })
  }

  function inArea (latlng) {
    return !areaGeometry || inGeometry([latlng.lng, latlng.lat], areaGeometry)
  }

  // A drawn area overlaps the area if a corner of either is inside the other
  function overlapsArea (points) {
    if (!areaGeometry) return true
    var ring = points.map(function (point) { return [point.lng, point.lat] })
    if (ring.some(function (point) { return inGeometry(point, areaGeometry) })) return true
    return polygonsOf(areaGeometry).some(function (polygon) {
      return polygon[0].some(function (point) { return inRing(point, ring) })
    })
  }

  // ---- The pin ----

  var pinIcon = L.icon({
    iconUrl: '/public/images/design-codes/map/location-pin.png',
    iconSize: [39, 39],
    iconAnchor: [19, 37]
  })
  var pin = null

  function setPin (latlng) {
    if (pin) pin.setLatLng(latlng)
    else pin = L.marker(latlng, { icon: pinIcon, keyboard: false, interactive: false }).addTo(map)
  }

  function escapeHtml (text) {
    var div = document.createElement('div')
    div.textContent = text == null ? '' : String(text)
    return div.innerHTML
  }

  // ---- The container over the right of the map ----
  //
  // The area's rules, a page at a time (Figma node 1260:39081), or one rule's summary (node
  // 1270:39679) with "Back" to the list.

  var listView = document.getElementById('v4-list')
  var ruleView = document.getElementById('v4-rule')
  var rulesBox = document.getElementById('v4-rules')
  var count = document.getElementById('v4-count')
  var listHeading = document.getElementById('v4-side-heading')
  // The rules that match the filters, leaving out the search, which is applied after (see listRules)
  var filtered = designCode.rules.filter(function (rule) { return rule.matchesFilters })
  var search = String(designCode.search || '').trim()
  var searchInput = document.getElementById('v4-search')
  var rules = filtered // What the list shows: those, or the ones for the kind of place selected
  var narrowed = false // Whether the list is just the rules for the kind of place selected
  var page = 1
  var outside = false // The selected place isn't in the area
  var placeNote = document.getElementById('v4-place')
  // The kind of place selected on the map: { checking } while it's worked out, then { kind } (null
  // if it couldn't be), and whether all rules are shown anyway
  var place = null
  var chosen = null // The rule whose summary was opened from the list
  L.DomEvent.disableClickPropagation(side)
  L.DomEvent.disableScrollPropagation(side)

  side.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', closeSide)
  })

  function closeSide () {
    side.hidden = true
  }

  function openSide () {
    side.hidden = false
  }

  // ---- What kind of place ----
  //
  // When someone selects a place, or draws an area, the map works out roughly what kind of place
  // it is from the colours of the OpenStreetMap tile there: parks are green, water is blue, shops
  // pink and so on. The list then shows the rules for that kind of place: those whose title, issue
  // or section mention it (such as "Trees and hedgerows" for a park), or that apply to a matching
  // place type.

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

  var TILE_ZOOM = 17 // Detailed enough to show parks, buildings and streets
  var tiles = {}
  function loadTile (x, y) {
    var key = x + '/' + y
    if (!tiles[key]) {
      tiles[key] = new Promise(function (resolve, reject) {
        var image = new Image()
        image.crossOrigin = 'anonymous'
        image.onload = function () { resolve(image) }
        image.onerror = reject
        image.src = 'https://tile.openstreetmap.org/' + TILE_ZOOM + '/' + x + '/' + y + '.png'
      })
    }
    return tiles[key]
  }

  // Votes for each kind of place in the 25 by 25 pixels (about 30m) around a point. Streets only
  // count if the point is on one: otherwise the streets around every block would outvote it.
  function kindVotes (latlng) {
    var point = map.project(latlng, TILE_ZOOM)
    var x = Math.floor(point.x / 256)
    var y = Math.floor(point.y / 256)
    return loadTile(x, y).then(function (image) {
      var canvas = document.createElement('canvas')
      canvas.width = canvas.height = 256
      var context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0)
      var px = Math.floor(point.x - x * 256)
      var py = Math.floor(point.y - y * 256)
      var votes = {}
      var middle = {}
      for (var dy = -12; dy <= 12; dy++) {
        for (var dx = -12; dx <= 12; dx++) {
          var sx = px + dx
          var sy = py + dy
          if (sx < 0 || sy < 0 || sx > 255 || sy > 255) continue
          var pixel = context.getImageData(sx, sy, 1, 1).data
          var kind = colourKind(pixel[0], pixel[1], pixel[2])
          if (!kind) continue
          if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) middle[kind] = (middle[kind] || 0) + 1
          if (kind !== 'street') votes[kind] = (votes[kind] || 0) + 1
        }
      }
      // On a street: most of the 5 by 5 pixels in the middle are road
      if ((middle.street || 0) >= 13) return { street: 100 }
      return votes
    })
  }

  // Buildings are drawn in one colour whatever they're used for, so for buildings, OpenStreetMap is
  // asked for the nearest shop, office, café or other place of interest. One within 40m means a
  // town centre or high street (or industry); otherwise it's taken to be homes.
  var USES = [
    ['industry', /^(industrial|warehouse|works|factory|storage|depot)$/],
    ['shops', /^(shop|office|craft|tourism)$/],
    // Street furniture and the like is everywhere, so it says nothing about the place
    ['', /^(post_box|parking|parking_space|bench|waste_basket|bicycle_parking|telephone|recycling|vending_machine|letter_box|grit_bin|motorcycle_parking|charging_station|drinking_water|clock|parcel_locker)$/],
    ['shops', /^amenity$/]
  ]
  function metresBetween (a, b) {
    var x = (b.lng - a.lng) * Math.PI / 180 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180)
    var y = (b.lat - a.lat) * Math.PI / 180
    return Math.sqrt(x * x + y * y) * 6371000
  }
  function buildingUse (latlng) {
    var controller = window.AbortController ? new AbortController() : null
    var timer = setTimeout(function () { if (controller) controller.abort() }, 5000)
    return fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&layer=poi&lat=' + latlng.lat + '&lon=' + latlng.lng,
      controller ? { signal: controller.signal } : {})
      .then(function (response) { return response.json() })
      .then(function (found) {
        clearTimeout(timer)
        if (!found.lat || metresBetween(latlng, L.latLng(Number(found.lat), Number(found.lon))) > 40) return null
        // The type is checked first ("parking"), then the category ("amenity")
        var use = USES.find(function (entry) { return entry[1].test(String(found.type)) }) ||
          USES.find(function (entry) { return entry[1].test(String(found.category)) })
        return use && use[0] ? use[0] : null
      })
      .catch(function () { clearTimeout(timer); return null })
  }

  // The kind of place at some points, or null if it's not clear
  function placeKind (points) {
    return Promise.all(points.map(kindVotes)).then(function (results) {
      var votes = {}
      var total = 0
      results.forEach(function (result) {
        Object.keys(result).forEach(function (kind) {
          votes[kind] = (votes[kind] || 0) + result[kind]
          total += result[kind]
        })
      })
      var kind = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a] })[0]
      kind = kind && votes[kind] > total * 0.3 ? kind : null
      // Buildings, or nothing clear: ask what's there, and keep the colours' answer if that fails
      if (kind === 'homes' || !kind) {
        return buildingUse(points[0]).then(function (use) { return use || kind })
      }
      return kind
    }).catch(function () { return null })
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

  function matchesSearch (rule) {
    return !search || rule.searchText.indexOf(search.toLowerCase()) !== -1
  }

  // The rules the list shows: those for the kind of place selected, unless all are asked for, then
  // the ones that match the search. So with a place selected, the search is within its rules.
  function listRules () {
    var scope = filtered
    narrowed = false
    if (place && place.kind && !place.showAll) {
      var forKind = filtered.filter(function (rule) { return fitsKind(rule, place.kind) })
      if (forKind.length) {
        scope = forKind
        narrowed = true
      }
    }
    return scope.filter(matchesSearch)
  }

  // What the list says about the place: what kind it looks like, with a way to see all the rules,
  // and "Remove" under it to clear the selection
  function showPlaceNote () {
    var html = ''
    if (outside) {
      html = 'This place is outside ' + escapeHtml(designCode.name) + '. Select a place in the area outlined on the map.'
    } else if (place) {
      var details = place.kind && KINDS[place.kind]
      if (place.checking) {
        html = 'Checking what kind of place this is…'
      } else if (!details) {
        html = 'We could not tell what kind of place this is, so all codes and key guidance are shown.'
      } else if (place.showAll) {
        html = 'This looks like ' + details.label + '. Showing all codes and key guidance. ' +
          '<button type="button" class="app-v4-side__inline-link" data-kind-only>Show only those for ' + details.plural + '</button>'
      } else if (!narrowed) {
        html = 'This looks like ' + details.label + ', but no codes or key guidance are just for ' + details.plural + ', so all are shown.'
      } else {
        html = 'This looks like ' + details.label + ', so these are the codes and key guidance for ' + details.plural + '. ' +
          '<button type="button" class="app-v4-side__inline-link" data-kind-all>Show all codes and key guidance</button>'
      }
    }
    placeNote.innerHTML = html && '<p class="app-v4-side__place-text">' + html + '</p>' +
      '<button type="button" class="app-v4-side__inline-link app-v4-side__remove" data-remove>' +
      'Remove<span class="govuk-visually-hidden"> selected place</span></button>'
    placeNote.hidden = !html
    var remove = placeNote.querySelector('[data-remove]')
    if (remove) remove.addEventListener('click', clearSelection)
    var all = placeNote.querySelector('[data-kind-all]')
    var only = placeNote.querySelector('[data-kind-only]')
    if (all) all.addEventListener('click', function () { place.showAll = true; page = 1; showList(); placeNote.querySelector('[data-kind-only]').focus() })
    if (only) only.addEventListener('click', function () { place.showAll = false; page = 1; showList(); placeNote.querySelector('[data-kind-all]').focus() })
  }

  // Work out the kind of place at some points, then show its rules
  var lookup = 0
  function checkPlace (points) {
    var current = ++lookup
    place = { checking: true }
    page = 1
    showList()
    placeKind(points).then(function (kind) {
      if (current !== lookup) return // Another place has been selected since
      place = { kind: kind, showAll: false }
      page = 1
      if (ruleView.hidden) showList()
    })
  }

  // "Showing all codes and key guidance", or how many match the filters
  function countText () {
    if (outside) return 'No design codes cover this place'
    if (rules.length === designCode.rules.length) return 'Showing all codes and key guidance'
    return 'Showing ' + rules.length + ' of ' + designCode.rules.length + ' codes and key guidance'
  }

  // The page numbers to show: the first, the last, and the ones either side of this one, with
  // gaps between (GOV.UK pagination)
  function pageNumbers (total) {
    var numbers = []
    for (var number = 1; number <= total; number++) {
      if (number === 1 || number === total || Math.abs(number - page) <= 1) numbers.push(number)
      else if (numbers[numbers.length - 1] !== '…') numbers.push('…')
    }
    return numbers
  }

  function paginationHtml (total) {
    if (total < 2) return ''
    var link = function (number, html, classes, label) {
      return '<a class="govuk-link govuk-pagination__link" href="#v4-side" data-page="' + number + '" rel="' + classes + '">' + html +
        (label ? '<span class="govuk-visually-hidden"> ' + label + '</span>' : '') + '</a>'
    }
    var html = '<nav class="govuk-pagination app-v4-pagination" aria-label="Pages of rules">'
    if (page > 1) {
      html += '<div class="govuk-pagination__prev">' + link(page - 1,
        '<svg class="govuk-pagination__icon govuk-pagination__icon--prev" xmlns="http://www.w3.org/2000/svg" height="13" width="15" aria-hidden="true" focusable="false" viewBox="0 0 15 13"><path d="m6.5938-0.0078125-6.7266 6.7266 6.7441 6.4062 1.377-1.449-4.1856-3.9768h12.896v-2h-12.984l4.2931-4.293-1.414-1.414z"></path></svg>' +
        '<span class="govuk-pagination__link-title">Previous<span class="govuk-visually-hidden"> page</span></span>', 'prev') + '</div>'
    }
    html += '<ul class="govuk-pagination__list">' + pageNumbers(total).map(function (number) {
      if (number === '…') return '<li class="govuk-pagination__item govuk-pagination__item--ellipses">&ctdot;</li>'
      var current = number === page
      return '<li class="govuk-pagination__item' + (current ? ' govuk-pagination__item--current' : '') + '">' +
        '<a class="govuk-link govuk-pagination__link" href="#v4-side" data-page="' + number + '" aria-label="Page ' + number + '"' +
        (current ? ' aria-current="page"' : '') + '>' + number + '</a></li>'
    }).join('') + '</ul>'
    if (page < total) {
      html += '<div class="govuk-pagination__next">' + link(page + 1,
        '<span class="govuk-pagination__link-title">Next<span class="govuk-visually-hidden"> page</span></span>' +
        '<svg class="govuk-pagination__icon govuk-pagination__icon--next" xmlns="http://www.w3.org/2000/svg" height="13" width="15" aria-hidden="true" focusable="false" viewBox="0 0 15 13"><path d="m8.107-0.0078125-1.4136 1.414 4.2926 4.293h-12.986v2h12.896l-4.1855 3.9766 1.377 1.4492 6.7441-6.4062-6.7246-6.7266z"></path></svg>', 'next') + '</div>'
    }
    return html + '</nav>'
  }

  // The list: each rule's title, as a button that opens its summary, and a sentence about it
  function showList (focus) {
    chosen = null
    ruleView.hidden = true
    ruleView.innerHTML = ''
    listView.hidden = false
    side.className = 'app-v4-card app-v4-card--list'
    openSide()
    rules = listRules()
    count.textContent = countText()
    showPlaceNote()

    if (outside) {
      rulesBox.innerHTML = '' // The note above the search says so
      return
    }
    if (!rules.length) {
      var kind = narrowed && KINDS[place.kind]
      rulesBox.innerHTML = '<p class="app-v4-side__text app-v4-side__empty">' + (search
        ? 'No codes or key guidance ' + (kind ? 'for ' + escapeHtml(kind.plural) + ' ' : '') + 'match ‘' + escapeHtml(search) + '’. Try a different search.'
        : 'No codes or key guidance match your filters. Try removing some filters.') + '</p>'
      return
    }
    var total = Math.ceil(rules.length / PAGE_SIZE)
    page = Math.min(Math.max(page, 1), total)
    var start = (page - 1) * PAGE_SIZE
    rulesBox.innerHTML = '<ul class="app-v4-side__rules">' + rules.slice(start, start + PAGE_SIZE).map(function (rule) {
      return '<li class="app-v4-side__rule">' +
        '<button type="button" class="app-v4-side__link" data-rule="' + escapeHtml(rule.reference) + '">' + escapeHtml(rule.title) + '</button>' +
        '<p class="app-v4-side__description">' + escapeHtml(rule.description) + '</p>' +
        '</li>'
    }).join('') + '</ul>' + paginationHtml(total)

    rulesBox.querySelectorAll('[data-rule]').forEach(function (button) {
      button.addEventListener('click', function () { showRule(findRule(button.getAttribute('data-rule')), true) })
    })
    rulesBox.querySelectorAll('[data-page]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault()
        page = Number(link.getAttribute('data-page'))
        side.scrollTop = 0
        showList()
        listHeading.focus({ preventScroll: true })
      })
    })
    if (focus) {
      var button = rulesBox.querySelector('[data-rule="' + String(focus).replace(/"/g, '') + '"]')
      if (button) button.focus({ preventScroll: true })
    }
  }

  function findRule (reference) {
    return designCode.rules.find(function (rule) { return rule.reference.toLowerCase() === String(reference).toLowerCase() })
  }

  // A rule's summary, with "Back" to the list
  function showRule (rule, fromList) {
    if (!rule) return
    chosen = rule
    var index = rules.indexOf(rule)
    if (index !== -1) page = Math.floor(index / PAGE_SIZE) + 1
    ruleView.innerHTML = '<div class="app-v4-card__bar">' +
        '<button type="button" class="govuk-back-link app-v4-card__back" data-back>Back<span class="govuk-visually-hidden"> to the list of codes and key guidance</span></button>' +
        '<button type="button" class="app-v4-card__close" data-close>' +
          '<img src="/public/images/design-codes/map/close.svg" width="24" height="24" alt="">' +
          '<span class="govuk-visually-hidden">Close</span>' +
        '</button></div>' +
      '<strong class="govuk-tag app-v4-card__tag">' + escapeHtml(rule.tag) + '</strong>' +
      '<p class="app-v4-card__code">' + escapeHtml(designCode.name) + '</p>' +
      '<h2 class="govuk-heading-m app-v4-card__title" tabindex="-1">' + escapeHtml(rule.title) + '</h2>' +
      '<p class="app-v4-card__text">' + escapeHtml(rule.text) + '</p>' +
      '<dl class="app-v4-card__list">' + rule.rows.map(function (row) {
        return '<div class="app-v4-card__row"><dt class="app-v4-card__key">' + escapeHtml(row.key) + '</dt>' +
          '<dd class="app-v4-card__value">' + escapeHtml(row.value) + '</dd></div>'
      }).join('') + '</dl>' +
      '<a class="govuk-button govuk-button--secondary app-v4-card__button" href="' + escapeHtml(rule.href) + '">Open full design code</a>'
    listView.hidden = true
    ruleView.hidden = false
    side.className = 'app-v4-card app-v4-card--rule'
    openSide()
    side.scrollTop = 0
    ruleView.querySelector('[data-back]').addEventListener('click', backToList)
    ruleView.querySelector('[data-close]').addEventListener('click', closeSide)
    if (fromList) ruleView.querySelector('h2').focus({ preventScroll: true })
  }

  // Back to the page of the list the rule is on, with focus on it
  function backToList () {
    var from = chosen
    showList(from && from.reference)
  }

  // Selecting a place: pin it, and if it's in the area, list the rules for that kind of place
  function selectPlace (latlng, isInArea, points) {
    setPin(latlng)
    outside = !isInArea
    if (outside) {
      place = null
      lookup++
      showList()
    } else {
      checkPlace(points || [latlng])
    }
  }

  map.on('click', function (event) {
    if (sketch) return
    selectPlace(event.latlng, inArea(event.latlng))
  })

  // "Remove": take away the pin, or the drawn area, and list all the area's rules again
  function clearSelection () {
    if (boundary) {
      map.removeLayer(boundary)
      boundary = null
      setEditing(false)
    }
    if (pin) { map.removeLayer(pin); pin = null }
    // A searched-for place is kept in the form, so it would come back when the filters change
    form.querySelectorAll('input[name="lat"], input[name="lng"], input[name="place"]').forEach(function (input) {
      input.parentNode.removeChild(input)
    })
    outside = false
    place = null
    lookup++
    page = 1
    showList()
    searchInput.focus()
  }

  // ---- Searching ----
  //
  // With a place selected, the search runs here, within the rules for that place, so the selection
  // stays. Without one, the form is sent and the page comes back with the search applied.

  form.addEventListener('submit', function (event) {
    if (!place && !outside) return
    event.preventDefault()
    search = searchInput.value.trim()
    // Keep the page's address, and the "Search:" tag in the filters, in step with the search
    try {
      var url = new URL(window.location.href)
      if (search) url.searchParams.set('q', search)
      else url.searchParams.delete('q')
      window.history.replaceState(null, '', url)
    } catch (error) {}
    var tag = document.querySelector('[data-search-tag]')
    if (tag) {
      tag.hidden = !search
      Array.prototype.forEach.call(tag.querySelector('a').childNodes, function (node) {
        if (node.nodeType === 3 && node.textContent.trim()) node.textContent = 'Search: ' + search
      })
    }
    page = 1
    showList()
  })

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || side.hidden) return
    if (!ruleView.hidden) backToList()
    else closeSide()
  })

  // Show the list straight away, or a rule's summary when coming back from its page
  var opened = data.openRule && findRule(data.openRule)
  if (opened) showRule(opened)
  else showList()

  // ---- Drawing an area (as in v3) ----

  var drawTools = document.getElementById('v4-draw')
  var drawToggle = document.getElementById('v4-draw-toggle')
  var drawMenu = document.getElementById('v4-draw-menu')
  var drawStatus = document.getElementById('v4-draw-status')
  var drawInstructions = document.getElementById('v4-draw-instructions')
  var drawError = document.getElementById('v4-draw-error')
  var sketch = null // While drawing: { mode, points, group, closed }
  var boundary = null // The drawn area's layer
  drawTools.hidden = false
  L.DomEvent.disableClickPropagation(drawTools)
  L.DomEvent.disableClickPropagation(drawStatus)

  function openMenu (open) {
    drawMenu.hidden = !open
    drawToggle.setAttribute('aria-expanded', String(open))
  }

  // With an area drawn, the menu edits it: it can be deleted, then a new one drawn
  function setEditing (editing) {
    document.getElementById('v4-draw-label').textContent = editing ? 'Edit location boundary' : 'Add location boundary'
    document.getElementById('v4-draw-delete').hidden = !editing
    drawMenu.querySelectorAll('[data-draw="polygon"], [data-draw="square"]').forEach(function (item) {
      if (editing) item.setAttribute('aria-disabled', 'true')
      else item.removeAttribute('aria-disabled')
    })
  }

  drawToggle.addEventListener('click', function () { openMenu(drawMenu.hidden) })
  drawMenu.addEventListener('click', function (event) {
    var item = event.target.closest('[data-draw]')
    if (!item || item.getAttribute('aria-disabled') === 'true') return
    var mode = item.getAttribute('data-draw')
    openMenu(false)
    if (mode === 'delete') deleteBoundary()
    else startDrawing(mode)
  })
  document.addEventListener('click', function (event) {
    if (!drawTools.contains(event.target)) openMenu(false)
  })

  function showDrawError (text) {
    drawError.hidden = !text
    drawError.innerHTML = text ? '<span class="govuk-visually-hidden">Error:</span> ' + escapeHtml(text) : ''
  }

  function handleIcon (kind) {
    var size = kind === 'vertex' ? 18 : 12
    return L.divIcon({ className: 'app-v3-handle app-v3-handle--' + kind, iconSize: [size, size] })
  }

  // While drawing, a red dot follows the pointer, a little behind it, to show drawing is on. The
  // delay is a CSS transition, so it's left out for people who prefer reduced motion.
  var drawDot = document.createElement('div')
  drawDot.className = 'app-v4-draw-dot'
  drawDot.setAttribute('aria-hidden', 'true')
  drawDot.hidden = true
  mapElement.appendChild(drawDot)

  mapElement.addEventListener('mousemove', function (event) {
    if (!sketch) return
    var box = mapElement.getBoundingClientRect()
    var x = event.clientX - box.left
    var y = event.clientY - box.top
    // Starts where the pointer is, rather than sliding in from where it was last seen
    if (drawDot.hidden) {
      drawDot.classList.add('app-v4-draw-dot--still')
      drawDot.style.transform = 'translate(' + x + 'px, ' + y + 'px)'
      drawDot.hidden = false
      drawDot.offsetWidth // eslint-disable-line no-unused-expressions
      drawDot.classList.remove('app-v4-draw-dot--still')
      return
    }
    drawDot.style.transform = 'translate(' + x + 'px, ' + y + 'px)'
  })
  mapElement.addEventListener('mouseleave', function () { drawDot.hidden = true })

  function startDrawing (mode) {
    stopDrawing()
    sketch = { mode: mode, points: [], group: L.layerGroup().addTo(map), closed: false }
    mapElement.classList.add('app-v4-map--drawing')
    map.doubleClickZoom.disable()
    showDrawError('')
    drawStatus.hidden = false
    drawInstructions.textContent = mode === 'polygon'
      ? 'Select points on the map to draw your area, then select Done.'
      : 'Select one corner of your area, then the opposite corner, then select Done.'
  }

  function stopDrawing () {
    if (!sketch) return
    map.removeLayer(sketch.group)
    sketch = null
    drawDot.hidden = true
    mapElement.classList.remove('app-v4-map--drawing')
    map.doubleClickZoom.enable()
    showDrawError('')
    drawStatus.hidden = true
    drawInstructions.textContent = ''
  }

  function squareCorners (a, b) {
    return [L.latLng(a.lat, a.lng), L.latLng(a.lat, b.lng), L.latLng(b.lat, b.lng), L.latLng(b.lat, a.lng)]
  }

  function drawSketch (pointer) {
    var group = sketch.group
    group.clearLayers()
    var points = sketch.points
    if (sketch.mode === 'square') {
      var corner = points[1] || pointer
      if (points.length && corner) L.polygon(squareCorners(points[0], corner), Object.assign({ interactive: false }, BOUNDARY)).addTo(group)
      return
    }
    if (sketch.closed) {
      L.polygon(points, Object.assign({ interactive: false }, BOUNDARY)).addTo(group)
    } else {
      var line = pointer ? points.concat([pointer]) : points
      if (line.length > 1) L.polyline(line, { color: BOUNDARY.color, weight: BOUNDARY.weight, interactive: false }).addTo(group)
    }
    points.forEach(function (point, index) {
      var vertex = L.marker(point, { icon: handleIcon('vertex'), keyboard: false, interactive: index === 0 }).addTo(group)
      if (index === 0) {
        // Selecting the first point again closes the shape, ready for "Done"
        vertex.on('click', function (event) {
          L.DomEvent.stopPropagation(event)
          if (sketch.points.length < 3 || sketch.closed) return
          sketch.closed = true
          showDrawError('')
          drawInstructions.textContent = 'Area closed. Select Done to see its design code rules.'
          drawSketch()
        })
      }
    })
  }

  map.on('click', function (event) {
    if (!sketch || sketch.closed) return
    showDrawError('')
    sketch.points.push(event.latlng)
    if (sketch.mode === 'square') {
      if (sketch.points.length === 2) {
        sketch.closed = true
        drawInstructions.textContent = 'Area drawn. Select Done to see its design code rules.'
      } else {
        drawInstructions.textContent = 'Now select the opposite corner.'
      }
    }
    drawSketch()
  })

  map.on('mousemove', function (event) {
    if (sketch && sketch.points.length && !sketch.closed) drawSketch(event.latlng)
  })

  document.getElementById('v4-draw-done').addEventListener('click', function () {
    var points = sketch.points
    if (sketch.mode === 'square') {
      if (points.length < 2) return showDrawError('Select two opposite corners on the map')
      points = squareCorners(points[0], points[1])
    } else if (points.length < 3) {
      return showDrawError('Select at least 3 points on the map')
    }
    stopDrawing()
    showBoundary(points)
  })
  document.getElementById('v4-draw-cancel').addEventListener('click', stopDrawing)

  // The drawn area, with a pin in the middle and the design codes it overlaps
  function showBoundary (points) {
    if (boundary) map.removeLayer(boundary)
    boundary = L.polygon(points, Object.assign({ interactive: false }, BOUNDARY)).addTo(map)
    setEditing(true)
    // The kind of place is worked out from its middle, and from halfway to each corner
    var centre = boundary.getBounds().getCenter()
    var samples = [centre].concat(points.map(function (point) {
      return L.latLng((point.lat + centre.lat) / 2, (point.lng + centre.lng) / 2)
    }))
    selectPlace(centre, overlapsArea(points), samples)
  }

  function deleteBoundary () {
    clearSelection()
  }

  window.addEventListener('resize', function () { map.invalidateSize() })
})()
