// v5: "Add a location boundary" (Figma node 1367:41746). The area that was searched for on a
// map that stays on it (as in v4), where a polygon or square can be drawn round a specific part of
// it. The map works out roughly what kind of place the boundary is, from the map's colours (as in
// v4), and the counts beside it say how many design requirements are for that kind of place.
// Continue takes the boundary and its kind of place to the list of design requirements.
//
// The drawing tools, the pin and working out the kind of place are v4's (v4-map.js). Which rules
// are for a kind of place is shared with the list's route (place-kinds.js).

(function () {
  var data = window.v5BoundaryData
  var mapElement = document.getElementById('v5-map')
  if (!data || !mapElement || !window.L || !window.PlaceKinds) return

  var designCode = data.designCode
  var KINDS = window.PlaceKinds.KINDS
  var colourKind = window.PlaceKinds.colourKind
  var fitsKind = window.PlaceKinds.fitsKind

  // ---- The map ----

  var BLUE = '#1d70b8'
  var AREA_STYLE = { color: BLUE, weight: 2, opacity: 0.9, fillColor: BLUE, fillOpacity: 0.06, interactive: false }
  var BOUNDARY = { color: BLUE, weight: 2, fillColor: BLUE, fillOpacity: 0.15 }

  // Zooms in quarter steps, so the area can fill the map
  var map = L.map(mapElement, { zoomControl: false, scrollWheelZoom: true, zoomSnap: 0.25 })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    crossOrigin: 'anonymous', // So the tiles' colours can be read (see "What kind of place")
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map)
  map.setView([53, -1.2], 6)

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
      // Room at the top for "Add location boundary"
      var padding = { paddingTopLeft: [20, 70], paddingBottomRight: [20, 20], maxZoom: 14 }
      if (data.boundary) {
        // Coming back from the list: the boundary drawn before
        var points = data.boundary.map(function (point) { return L.latLng(point[0], point[1]) })
        map.fitBounds(L.latLngBounds(points), padding)
        restoreBoundary(points)
      } else if (data.pin) {
        // A postcode or town: centre on it, zoomed in a little
        map.setView([data.pin.lat, data.pin.lng], 13)
        setPin(L.latLng(data.pin.lat, data.pin.lng))
      } else {
        map.fitBounds(areaBounds, padding)
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


  // ---- The counts, and what Continue sends ----

  var form = document.getElementById('v5-continue')
  var kindInput = form.querySelector('[name="kind"]')
  var boundaryInput = form.querySelector('[name="boundary"]')
  var requirementsCount = document.getElementById('v5-count-requirements')
  var placeNote = document.getElementById('v5-place')
  var total = designCode.rules.length
  var lookup = 0 // Which boundary the kind of place is being worked out for

  function setNote (html) {
    placeNote.innerHTML = html
    placeNote.hidden = !html
  }

  // The kind of place the boundary is, and the requirements for it. A kind with no requirements
  // just for it isn't sent, so the list shows them all.
  function showKind (kind) {
    var details = kind && KINDS[kind]
    var count = details ? designCode.rules.filter(function (rule) { return fitsKind(rule, kind) }).length : 0
    if (details && count) {
      kindInput.value = kind
      requirementsCount.textContent = count
      setNote('This looks like ' + details.label + ', so ' + count + ' of the ' + total +
        ' design requirements are for it.')
    } else {
      kindInput.value = ''
      requirementsCount.textContent = total
      setNote(details
        ? 'This looks like ' + details.label + ', but no design requirements are just for ' + details.plural + ', so all ' + total + ' are shown.'
        : 'We could not tell what kind of place this is, so all ' + total + ' design requirements are shown.')
    }
  }

  // A boundary has been drawn: pin its middle, keep its corners for Continue, and work out the kind
  // of place from its middle and halfway to each corner (as in v4)
  function selectPlace (centre, isInArea, samples) {
    setPin(centre)
    var current = ++lookup
    boundaryInput.value = boundary
      ? boundary.getLatLngs()[0].map(function (point) { return point.lat.toFixed(5) + ',' + point.lng.toFixed(5) }).join(';')
      : ''
    if (!isInArea) {
      kindInput.value = ''
      requirementsCount.textContent = total
      setNote('This boundary is outside ' + escapeHtml(designCode.name) + '. Draw one inside the area outlined on the map.')
      return
    }
    kindInput.value = ''
    setNote('Checking what kind of place this is…')
    placeKind(samples || [centre]).then(function (kind) {
      if (current === lookup) showKind(kind)
    })
  }

  // The boundary is deleted: back to the whole area
  function clearSelection () {
    if (boundary) {
      map.removeLayer(boundary)
      boundary = null
      setEditing(false)
    }
    if (pin && !data.pin) { map.removeLayer(pin); pin = null }
    if (data.pin) setPin(L.latLng(data.pin.lat, data.pin.lng))
    lookup++
    kindInput.value = ''
    boundaryInput.value = ''
    requirementsCount.textContent = total
    setNote('')
  }

  // Coming back from the list, the boundary is drawn again, with the kind of place it was
  function restoreBoundary (points) {
    boundary = L.polygon(points, Object.assign({ interactive: false }, BOUNDARY)).addTo(map)
    setEditing(true)
    setPin(boundary.getBounds().getCenter())
    boundaryInput.value = data.boundary.map(function (point) { return point.join(',') }).join(';')
    showKind(data.kind)
  }

  // ---- What kind of place (as in v4) ----

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

  // ---- Drawing an area (as in v3) ----

  var drawTools = document.getElementById('v5-draw')
  var drawToggle = document.getElementById('v5-draw-toggle')
  var drawMenu = document.getElementById('v5-draw-menu')
  var drawStatus = document.getElementById('v5-draw-status')
  var drawInstructions = document.getElementById('v5-draw-instructions')
  var drawError = document.getElementById('v5-draw-error')
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
    document.getElementById('v5-draw-label').textContent = editing ? 'Edit location boundary' : 'Add location boundary'
    document.getElementById('v5-draw-delete').hidden = !editing
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

  document.getElementById('v5-draw-done').addEventListener('click', function () {
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
  document.getElementById('v5-draw-cancel').addEventListener('click', stopDrawing)

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
