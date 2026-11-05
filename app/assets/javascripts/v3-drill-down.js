//
// v3 design code page: a map that drills down council > town > place type > example site, kept in
// sync with the filters, results and URL. The map can't zoom out beyond the council.
//
// The page works without this script: every area is also a link in the list under the map, and
// the filters are a normal form. With it, choosing an area (on the map or with "Back up a level"),
// removing a filter or applying the filters loads the new page state in place, zooms the map,
// updates the result count (an aria-live region) and adds a history entry, so the back button works.
//
// How the map shows things follows Figma node 487:13814:
// - areas you can choose have a thin blue outline; hovering or focusing one selects it (thick navy
//   outline with a white edge) and shows its name and how many design codes match
// - place type zones are coloured and patterned by their national area type
// - with filters in use, each area has a pin with the matching design codes' references
// - "Add location boundary" draws a polygon or a square; the results then show the codes for it
// Hovering or focusing a design code in the list highlights where it applies, with its reference.
//
// To change the interaction, start with show() (what each level draws), go() (loading a state),
// highlight() (hovering a design code) and startDrawing() (drawing an area).
//
(function () {
  var mapElement = document.getElementById('dc-map')
  if (!mapElement || !window.L) return

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Areas you can choose, and the selected or hovered one (Figma "Normal selection")
  var SELECTABLE = { color: '#1d70b8', weight: 2, fillColor: '#1d70b8', fillOpacity: 0.08 }
  var SELECTED = { color: '#003078', weight: 4, fillColor: '#1d70b8', fillOpacity: 0.25 }
  var HALO = { color: '#ffffff', weight: 8, fill: false, interactive: false }

  // Place type zones, by national area type (Figma "Areas" swatches): a 2px outline and a pattern
  var AREA_TYPES = {
    'town-or-city-centre': { colour: '#993404', outline: '#993404', pattern: 'cross' },
    'local-centre': { colour: '#d95f0e', outline: '#d95f0e', pattern: 'dots' },
    'urban-neighbourhood': { colour: '#fe9929', outline: '#d95f0e', pattern: 'forward' },
    suburbs: { colour: '#fed98e', outline: '#d95f0e', pattern: 'back' },
    'rural-settlements': { colour: '#ffffd4', outline: '#d95f0e', pattern: 'vertical' },
    'industrial-area': { colour: '#756bb1', outline: '#756bb1', pattern: 'horizontal' }
  }

  // A drawn area (Figma "Draw your own area")
  var BOUNDARY = { color: '#b4441f', weight: 3, fillColor: '#f47738', fillOpacity: 0.08 }

  // The zoom buttons go bottom right, clear of the boxes in the top left
  var map = L.map(mapElement, { renderer: L.svg(), scrollWheelZoom: false, zoomSnap: 0.25, zoomControl: false })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map)
  map.setView([53.8, -0.5], 9)

  // A drawn area and the white edge of a selected area go under the areas, so the areas can still
  // be hovered and chosen; pins, handles and the hover box go above the area labels (Leaflet's
  // tooltips are 650)
  map.createPane('dcBoundary').style.zIndex = 398
  map.createPane('dcHalo').style.zIndex = 399
  map.createPane('dcCodeTag').style.zIndex = 660
  map.createPane('dcHover').style.zIndex = 670

  var drawn = L.layerGroup().addTo(map)
  var pins = L.layerGroup().addTo(map)
  var boundaryLayer = L.layerGroup().addTo(map)
  var lastBounds = null
  var councilBounds = null

  // The boxes in the top left: "Add location boundary" and where the map is
  var mapTools = document.getElementById('dc-map-tools')

  // Zoom to an area, keeping it clear of the boxes in the top left: beside them where the map is
  // wide enough, otherwise below them. If the map has no size yet, wait until it has.
  function fit (bounds, animate) {
    lastBounds = bounds
    if (!bounds || !mapElement.offsetWidth) return
    var right = mapTools ? mapTools.offsetLeft + mapTools.offsetWidth + 16 : 16
    var below = mapTools ? mapTools.offsetTop + mapTools.offsetHeight + 8 : 16
    var beside = mapElement.offsetWidth - right > 360
    var options = { paddingTopLeft: beside ? [right, 16] : [16, below], paddingBottomRight: [16, 16] }
    if (animate && !reduceMotion) map.flyToBounds(bounds, Object.assign({ duration: 0.8 }, options))
    else map.fitBounds(bounds, Object.assign({ animate: false }, options))
  }

  // The area type patterns, added to Leaflet's SVG once it exists
  function addPatterns () {
    var svg = mapElement.querySelector('.leaflet-overlay-pane svg')
    if (!svg || svg.querySelector('#dc-pattern-cross')) return
    var shapes = {
      cross: '<path d="M0 0L10 10M10 0L0 10" stroke-width="1"/>',
      dots: '<circle cx="5" cy="5" r="1.4" stroke="none"/>',
      forward: '<path d="M-1 1L1 -1M0 10L10 0M9 11L11 9" stroke-width="1"/>',
      back: '<path d="M-1 9L1 11M0 0L10 10M9 -1L11 1" stroke-width="1"/>',
      vertical: '<path d="M5 0V10" stroke-width="1"/>',
      horizontal: '<path d="M0 5H10" stroke-width="1"/>'
    }
    var html = ''
    Object.keys(AREA_TYPES).forEach(function (id) {
      var type = AREA_TYPES[id]
      html += '<pattern id="dc-pattern-' + type.pattern + '" patternUnits="userSpaceOnUse" width="10" height="10">' +
        '<rect width="10" height="10" fill="' + type.colour + '" fill-opacity="0.12"></rect>' +
        '<g stroke="' + type.colour + '" fill="' + type.colour + '">' + shapes[type.pattern] + '</g></pattern>'
    })
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    defs.innerHTML = html
    svg.insertBefore(defs, svg.firstChild)
  }

  function geoLayer (geometry, style, pane) {
    var options = { style: style }
    if (pane) options.pane = pane
    return L.geoJSON({ type: 'Feature', geometry: geometry, properties: {} }, options)
  }

  // An area's shape, again, for its white edge
  function shapeLayer (area, style, pane) {
    return area.bounds ? L.rectangle(area.bounds, Object.assign({ pane: pane }, style)) : geoLayer(area.geometry, style, pane)
  }

  function parts (layer) {
    return layer.getLayers ? layer.getLayers() : [layer]
  }

  // Style an area. Leaflet resets the fill when styling, so zones get their pattern back after.
  function paint (layer, style) {
    layer.setStyle(style)
    if (!layer._dcPattern) return
    addPatterns()
    parts(layer).forEach(function (part) {
      var element = part.getElement()
      if (!element) return
      element.setAttribute('fill', 'url(#dc-pattern-' + layer._dcPattern + ')')
      element.setAttribute('fill-opacity', '1')
    })
  }

  function readState () {
    return JSON.parse(document.getElementById('dc-map-state').textContent)
  }

  // The council is the furthest out the map goes
  function limitToCouncil (state) {
    if (councilBounds || !state.council || !mapElement.offsetWidth) return
    councilBounds = geoLayer(state.council, {}).getBounds()
    map.setMinZoom(Math.floor(map.getBoundsZoom(councilBounds) * 4) / 4)
    map.setMaxBounds(councilBounds.pad(0.15))
  }

  // ---- Hovering an area: select it and say how many design codes match ----

  var hoverBox = L.tooltip({ pane: 'dcHover', direction: 'top', offset: [0, -10], className: 'app-v3-map__hover', interactive: false })
  var hovered = null

  function codeCount (codes) {
    return codes.length + (codes.length === 1 ? ' design code' : ' design codes')
  }

  function escapeHtml (text) {
    var element = document.createElement('span')
    element.textContent = text
    return element.innerHTML
  }

  function showHoverBox (name, codes, latlng) {
    hoverBox.setContent('<strong class="app-v3-map__hover-name">' + escapeHtml(name) + '</strong><span class="app-v3-map__hover-count">' + codeCount(codes) + '</span>')
    hoverBox.setLatLng(latlng)
    if (!map.hasLayer(hoverBox)) hoverBox.addTo(map)
  }

  function hideHoverBox () {
    if (map.hasLayer(hoverBox)) map.removeLayer(hoverBox)
  }

  // A selected area's white edge goes under it
  function select (layer) {
    if (layer._dcHalo) return
    layer._dcHalo = shapeLayer(layer._dcArea, HALO, 'dcHalo').addTo(drawn)
    paint(layer, layer._dcSelected)
  }

  function deselect (layer) {
    if (!layer._dcHalo || layer._dcAlwaysSelected) return
    drawn.removeLayer(layer._dcHalo)
    layer._dcHalo = null
    paint(layer, layer._dcBase)
  }

  function hoverable (layer, area) {
    layer.on('mouseover', function (event) {
      if (sketch) return
      hovered = layer
      select(layer)
      showHoverBox(area.name, area.codes || [], event.latlng)
    })
    layer.on('mousemove', function (event) {
      if (hovered === layer && !sketch) hoverBox.setLatLng(event.latlng)
    })
    layer.on('mouseout', function () {
      if (hovered !== layer) return
      hovered = null
      deselect(layer)
      hideHoverBox()
    })
  }

  // ---- Drawing a level ----

  // What's drawn at this level, so a hovered design code can be highlighted
  var current = { parent: null, children: {}, state: null }

  // Draw a level: context outlines, dimmed siblings, the selected area, the areas to choose, then
  // the pins and any drawn area
  function show (state, animate, focusFirstArea) {
    clearHighlight()
    hideHoverBox()
    hovered = null
    drawn.clearLayers()
    limitToCouncil(state)
    current = { parent: null, children: {}, state: state }
    var focusBounds = null

    ;(state.context || []).forEach(function (geometry) {
      if (geometry) geoLayer(geometry, { color: '#505a5f', weight: 1.5, dashArray: '4 4', fill: false, interactive: false }).addTo(drawn)
    })

    ;(state.siblings || []).forEach(function (area) {
      if (area.geometry) geoLayer(area.geometry, { color: '#b1b4b6', weight: 1, fillColor: '#b1b4b6', fillOpacity: 0.15, interactive: false }).addTo(drawn)
    })

    // The selected area: always shown selected, and hovering it says how many codes match
    var parent = state.parent
    if (parent) {
      var parentLayer
      var type = AREA_TYPES[parent.areaType]
      if (parent.bounds) {
        if (parent.image) L.imageOverlay(parent.image, parent.bounds, { alt: 'Illustrative example site plan' }).addTo(drawn)
        parentLayer = L.rectangle(parent.bounds, Object.assign({}, SELECTED, { fill: true, fillOpacity: 0 })).addTo(drawn)
      } else {
        // A big area keeps a light fill, so the areas in it stay clear
        var style = type
          ? { color: SELECTED.color, weight: SELECTED.weight, fillOpacity: 1 }
          : Object.assign({}, SELECTED, { fillOpacity: state.children && state.children.length ? 0.08 : 0.25 })
        parentLayer = geoLayer(parent.geometry, style).addTo(drawn)
      }
      parentLayer._dcArea = parent
      parentLayer._dcPattern = type && type.pattern
      parentLayer._dcBase = parentLayer._dcSelected = parentLayer.options.style || parentLayer.options
      parentLayer._dcAlwaysSelected = true
      parentLayer._dcHalo = shapeLayer(parent, HALO, 'dcHalo').addTo(drawn)
      paint(parentLayer, parentLayer._dcBase)
      hoverable(parentLayer, parent)
      current.parent = parentLayer
      focusBounds = parentLayer.getBounds()
    }

    var areaElements = []
    ;(state.children || []).forEach(function (area) {
      var type = AREA_TYPES[area.areaType]
      var base = type
        ? { color: type.outline, weight: 2, fillOpacity: 1, className: 'app-v3-area' }
        : Object.assign({ className: 'app-v3-area' }, SELECTABLE)
      var layer = area.bounds ? L.rectangle(area.bounds, base) : geoLayer(area.geometry, base)
      layer.addTo(drawn)
      layer._dcArea = area
      layer._dcPattern = type && type.pattern
      layer._dcBase = base
      layer._dcSelected = type ? { color: SELECTED.color, weight: SELECTED.weight, fillOpacity: 1 } : SELECTED
      paint(layer, base)
      current.children[area.id] = layer
      hoverable(layer, area)

      // Towns are small at council scale, so their labels sit above them rather than on top
      var labelAbove = state.level === 'council' || area.bounds
      var label = {
        permanent: true,
        direction: labelAbove ? 'top' : 'center',
        offset: labelAbove ? [0, -4] : [0, 0],
        className: 'app-v3-map__label'
      }
      // Nested place type zones each have their own label point
      if (area.labelAt) L.tooltip(label).setLatLng(area.labelAt).setContent(area.name).addTo(drawn)
      else layer.bindTooltip(area.name, label)
      function choose () {
        if (sketch) return
        go(area.href, { push: true, focus: 'map' })
      }
      layer.on('click', choose)
      if (!parent) focusBounds = focusBounds ? focusBounds.extend(layer.getBounds()) : layer.getBounds()
      parts(layer).forEach(function (part) {
        var element = part.getElement()
        if (!element) return
        element.setAttribute('tabindex', '0')
        element.setAttribute('role', 'link')
        element.setAttribute('aria-label', area.name + ', ' + codeCount(area.codes || []))
        element.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            choose()
          }
        })
        // While drawing, a click on an area adds a point instead, so it shouldn't focus the area
        element.addEventListener('mousedown', function (event) {
          if (sketch) event.preventDefault()
        })
        // Focus shows the same as hovering
        element.addEventListener('focus', function () {
          if (sketch) return
          select(layer)
          showHoverBox(area.name, area.codes || [], layer.getBounds().getCenter())
        })
        element.addEventListener('blur', function () {
          deselect(layer)
          hideHoverBox()
        })
        areaElements.push(element)
      })
    })

    showPins(state)
    showBoundary(state.boundary)

    fit(focusBounds, animate)

    if (focusFirstArea) {
      if (areaElements[0]) areaElements[0].focus({ preventScroll: true })
      else mapElement.focus({ preventScroll: true })
    }
  }

  // ---- Pins with the matching design codes ----

  function pinLabel (codes) {
    return codes[0] + (codes.length > 1 ? ' +' + (codes.length - 1) : '')
  }

  function addPin (group, latlng, text) {
    return L.marker(latlng, {
      icon: L.divIcon({ className: 'app-v3-pin', html: '<span class="app-v3-pin__box"><span class="app-v3-pin__tag">' + escapeHtml(text) + '</span></span>', iconSize: null }),
      pane: 'dcCodeTag',
      interactive: false,
      keyboard: false
    }).addTo(group)
  }

  // With filters in use, a pin on each area to choose (or on the selected area at the most
  // detailed level) with the references of the codes that match there. The list of results is the
  // accessible version of this, so the pins are hidden from screen readers.
  function showPins (state) {
    pins.clearLayers()
    if (!state.showPins) return
    var areas = (state.children || []).length ? state.children : (state.parent ? [state.parent] : [])
    areas.forEach(function (area) {
      if (!area.codes || !area.codes.length) return
      var layer = current.children[area.id] || current.parent
      addPin(pins, area.pinAt || layer.getBounds().getCenter(), pinLabel(area.codes))
    })
    declutterPins()
  }

  // Where pins would cover each other, such as on a phone, only the first shows. Zooming in brings
  // the others back.
  function declutterPins () {
    var placed = []
    pins.eachLayer(function (marker) {
      var box = marker.getElement() && marker.getElement().firstChild
      if (!box) return
      box.style.visibility = ''
      var rect = box.getBoundingClientRect()
      var covers = placed.some(function (other) {
        return rect.left < other.right - 8 && rect.right > other.left + 8 && rect.top < other.bottom - 8 && rect.bottom > other.top + 8
      })
      if (covers) box.style.visibility = 'hidden'
      else placed.push(rect)
    })
  }
  map.on('zoomend', declutterPins)

  // ---- Hovering a design code: highlight where it applies, with its reference pinned there ----
  // A code for particular place types highlights those zones when they're on the map; otherwise it
  // applies across the area the map is showing.
  var highlighted = []
  var codePins = L.layerGroup()

  function clearHighlight () {
    highlighted.forEach(function (layer) { deselect(layer) })
    highlighted = []
    codePins.clearLayers()
    if (map.hasLayer(codePins)) map.removeLayer(codePins)
    if (!map.hasLayer(pins)) pins.addTo(map)
  }

  function highlight (reference, placeTypes) {
    clearHighlight()
    var targets = placeTypes
      .map(function (id) { return current.children[id] })
      .filter(Boolean)
    if (!targets.length) targets = current.parent ? [current.parent] : Object.keys(current.children).map(function (id) { return current.children[id] })
    if (!targets.length) return

    // The hovered code's pins replace the filter pins for now
    map.removeLayer(pins)
    codePins.addTo(map)
    targets.forEach(function (layer) {
      select(layer)
      highlighted.push(layer)
      addPin(codePins, layer._dcArea.pinAt || layer.getBounds().getCenter(), reference)
    })
  }

  var results = document.getElementById('dc-results')
  if (results) {
    var codeFor = function (event) { return event.target.closest && event.target.closest('.app-v3-code') }
    var onEnter = function (event) {
      var code = codeFor(event)
      if (!code || code === results._dcHovered) return
      results._dcHovered = code
      var placeTypes = (code.getAttribute('data-place-types') || '').split(' ').filter(Boolean)
      highlight(code.getAttribute('data-reference'), placeTypes)
    }
    var onLeave = function (event) {
      var code = codeFor(event)
      if (!code || (event.relatedTarget && code.contains(event.relatedTarget))) return
      results._dcHovered = null
      clearHighlight()
    }
    results.addEventListener('mouseover', onEnter)
    results.addEventListener('focusin', onEnter)
    results.addEventListener('mouseout', onLeave)
    results.addEventListener('focusout', onLeave)
  }

  // ---- Drawing an area: "Add location boundary" ----

  var drawTools = document.getElementById('dc-draw')
  var drawToggle = document.getElementById('dc-draw-toggle')
  var drawMenu = document.getElementById('dc-draw-menu')
  var drawStatus = document.getElementById('dc-draw-status')
  var drawInstructions = document.getElementById('dc-draw-instructions')
  var sketch = null // While drawing: { mode, points, group }

  function openMenu (open) {
    drawMenu.hidden = !open
    drawToggle.setAttribute('aria-expanded', String(open))
  }

  function handleIcon (kind) {
    var size = kind === 'vertex' ? 18 : 12
    return L.divIcon({ className: 'app-v3-handle app-v3-handle--' + kind, iconSize: [size, size] })
  }

  function startDrawing (mode) {
    openMenu(false)
    stopDrawing()
    clearHighlight()
    hideHoverBox()
    if (hovered) deselect(hovered)
    hovered = null
    sketch = { mode: mode, points: [], group: L.layerGroup().addTo(map) }
    mapElement.classList.add('app-v3-map--drawing')
    map.doubleClickZoom.disable()
    drawStatus.hidden = false
    drawInstructions.textContent = mode === 'polygon'
      ? 'Select points on the map to draw your area. Select the first point again to finish.'
      : 'Select one corner of your area, then the opposite corner.'
  }

  function stopDrawing () {
    if (!sketch) return
    map.removeLayer(sketch.group)
    sketch = null
    mapElement.classList.remove('app-v3-map--drawing')
    map.doubleClickZoom.enable()
    drawStatus.hidden = true
    drawInstructions.textContent = ''
  }

  function squareCorners (a, b) {
    return [L.latLng(a.lat, a.lng), L.latLng(a.lat, b.lng), L.latLng(b.lat, b.lng), L.latLng(b.lat, a.lng)]
  }

  // Redraw the shape being drawn, with a line to the pointer
  function drawSketch (pointer) {
    var group = sketch.group
    group.clearLayers()
    var points = sketch.points
    if (sketch.mode === 'square') {
      if (points.length && pointer) L.polygon(squareCorners(points[0], pointer), Object.assign({ interactive: false, pane: 'dcBoundary' }, BOUNDARY)).addTo(group)
      return
    }
    var line = pointer ? points.concat([pointer]) : points
    if (line.length > 1) L.polyline(line, { color: BOUNDARY.color, weight: BOUNDARY.weight, interactive: false, pane: 'dcBoundary' }).addTo(group)
    points.forEach(function (point, index) {
      var vertex = L.marker(point, { icon: handleIcon('vertex'), pane: 'dcCodeTag', keyboard: false, interactive: index === 0 }).addTo(group)
      if (index === 0) {
        vertex.on('click', function (event) {
          L.DomEvent.stopPropagation(event)
          if (sketch.points.length >= 3) finishDrawing(sketch.points)
        })
      }
    })
  }

  function finishDrawing (points) {
    stopDrawing()
    go(boundaryUrl(points), { push: true, focus: 'count' })
  }

  map.on('click', function (event) {
    if (!sketch) return
    if (sketch.mode === 'square') {
      if (sketch.points.length) return finishDrawing(squareCorners(sketch.points[0], event.latlng))
      sketch.points.push(event.latlng)
      drawInstructions.textContent = 'Now select the opposite corner.'
    } else {
      sketch.points.push(event.latlng)
    }
    drawSketch()
  })

  map.on('mousemove', function (event) {
    if (sketch && sketch.points.length) drawSketch(event.latlng)
  })

  // The page's URL with the drawn area, as "lat,lng;lat,lng;…". The results change, so the page
  // number goes.
  function boundaryUrl (points) {
    var params = new URLSearchParams(window.location.search)
    params.delete('page')
    params.set('boundary', points.map(function (point) {
      var latlng = L.latLng(point)
      return latlng.lat.toFixed(5) + ',' + latlng.lng.toFixed(5)
    }).join(';'))
    return window.location.pathname + '?' + params.toString()
  }

  function isSquare (points) {
    if (points.length !== 4) return false
    var p = points
    return (p[0][0] === p[1][0] && p[1][1] === p[2][1] && p[2][0] === p[3][0] && p[3][1] === p[0][1]) ||
      (p[0][1] === p[1][1] && p[1][0] === p[2][0] && p[2][1] === p[3][1] && p[3][0] === p[0][0])
  }

  // The drawn area, with handles to change it: corners, and for a polygon a midpoint on each side
  // that adds a corner when dragged. Each change updates the results.
  function showBoundary (boundary) {
    boundaryLayer.clearLayers()
    if (!boundary) return
    var square = isSquare(boundary.points)
    var points = boundary.points.map(function (point) { return L.latLng(point) })
    var shape = L.polygon(points, Object.assign({ pane: 'dcBoundary' }, BOUNDARY)).addTo(boundaryLayer)
    var name = 'Your area'
    shape.on('mouseover mousemove', function (event) {
      if (!sketch) showHoverBox(name, boundary.codes, event.latlng)
    })
    shape.on('mouseout', hideHoverBox)

    var vertices = []
    var midpoints = []
    var midpoint = function (a, b) { return L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2) }
    var commit = function () { go(boundaryUrl(points), { replace: true }) }
    var redraw = function () {
      shape.setLatLngs(points)
      vertices.forEach(function (vertex, index) { if (points[index]) vertex.setLatLng(points[index]) })
      midpoints.forEach(function (marker, index) { marker.setLatLng(midpoint(points[index], points[(index + 1) % points.length])) })
    }

    points.forEach(function (point, index) {
      var vertex = L.marker(point, { icon: handleIcon('vertex'), draggable: true, keyboard: false, pane: 'dcCodeTag' }).addTo(boundaryLayer)
      vertex.on('drag', function () {
        if (square) {
          // A square stays a rectangle: the opposite corner stays put
          var corners = squareCorners(points[(index + 2) % 4], vertex.getLatLng())
          // Keep this corner at this index, so the drag carries on smoothly
          var shift = (index + 2) % 4
          for (var i = 0; i < 4; i++) points[(shift + i) % 4] = corners[i]
        } else {
          points[index] = vertex.getLatLng()
        }
        redraw()
      })
      vertex.on('dragend', commit)
      vertices.push(vertex)
    })

    if (square) return
    points.forEach(function (point, index) {
      var marker = L.marker(midpoint(point, points[(index + 1) % points.length]), { icon: handleIcon('midpoint'), draggable: true, keyboard: false, pane: 'dcCodeTag' }).addTo(boundaryLayer)
      var added = null
      marker.on('dragstart', function () {
        added = index + 1
        points.splice(added, 0, marker.getLatLng())
      })
      marker.on('drag', function () {
        points[added] = marker.getLatLng()
        shape.setLatLngs(points)
      })
      marker.on('dragend', commit)
      midpoints.push(marker)
    })
  }

  if (drawTools) {
    drawTools.hidden = false
    // Clicks and scrolling on the boxes shouldn't move the map
    L.DomEvent.disableClickPropagation(mapTools)
    L.DomEvent.disableScrollPropagation(mapTools)

    drawToggle.addEventListener('click', function () {
      openMenu(drawMenu.hidden)
      if (!drawMenu.hidden) drawMenu.querySelector('button').focus()
    })
    drawMenu.addEventListener('click', function (event) {
      var item = event.target.closest('[data-draw]')
      if (item) startDrawing(item.getAttribute('data-draw'))
    })
    document.getElementById('dc-draw-cancel').addEventListener('click', function () {
      stopDrawing()
      drawToggle.focus()
    })
    document.addEventListener('click', function (event) {
      if (!drawMenu.hidden && !drawTools.contains(event.target)) openMenu(false)
    })
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return
      if (!drawMenu.hidden) {
        openMenu(false)
        drawToggle.focus()
      } else if (sketch) {
        stopDrawing()
        drawToggle.focus()
      }
    })
  }

  // ---- Loading a page state ----

  // Bring the filters form in line with the new page without replacing it, so focus stays put
  function syncForm (current, next) {
    current.querySelectorAll('input[type=hidden]').forEach(function (input) { input.remove() })
    next.querySelectorAll('input[type=hidden]').forEach(function (input) {
      current.insertBefore(input.cloneNode(true), current.firstElementChild.nextSibling)
    })
    next.querySelectorAll('input[type=radio], input[type=checkbox]').forEach(function (input) {
      var match = current.querySelector('#' + CSS.escape(input.id))
      if (match) match.checked = input.checked
    })
    // Section titles carry a count of their selected options, such as "Feature (2)"
    var titles = current.querySelectorAll('.app-dc-filter__title')
    next.querySelectorAll('.app-dc-filter__title').forEach(function (title, index) {
      if (titles[index] && titles[index].innerHTML !== title.innerHTML) titles[index].innerHTML = title.innerHTML
    })
    next.querySelectorAll('label[for]').forEach(function (label) {
      var match = current.querySelector('label[for="' + CSS.escape(label.getAttribute('for')) + '"]')
      if (match && match.textContent !== label.textContent) match.textContent = label.textContent
    })
    next.querySelectorAll('details[open]').forEach(function (details, index) {
      var all = current.querySelectorAll('details')
      var nextAll = next.querySelectorAll('details')
      var position = Array.prototype.indexOf.call(nextAll, details)
      if (all[position]) all[position].open = true
    })
    var buttons = current.querySelector('.govuk-button-group')
    var nextButtons = next.querySelector('.govuk-button-group')
    if (buttons && nextButtons) buttons.innerHTML = nextButtons.innerHTML
  }

  var loading = null

  // Load a page state in place: swap the map panel and results, update the count and the URL.
  // options.push adds a history entry; options.replace updates the current one (for changes to a
  // drawn area, so back doesn't step through every drag).
  function go (href, options) {
    options = options || {}
    if (loading) loading.abort()
    loading = new AbortController()
    return fetch(href, { signal: loading.signal, headers: { Accept: 'text/html' } })
      .then(function (response) { return response.text() })
      .then(function (html) {
        var next = new DOMParser().parseFromString(html, 'text/html')
        ;['dc-map-nav', 'dc-map-areas', 'dc-applied', 'dc-tags', 'dc-results'].forEach(function (id) {
          var target = document.getElementById(id)
          var source = next.getElementById(id)
          if (target && source) target.innerHTML = source.innerHTML
        })
        document.getElementById('dc-map-state').textContent = next.getElementById('dc-map-state').textContent
        document.getElementById('dc-map-badge').hidden = next.getElementById('dc-map-badge').hidden

        // Only a changed count is rewritten, so the live region announces only real changes. After
        // "Apply filter" focus moves to the count instead, so the live region is quiet then, to
        // avoid reading it twice.
        var count = document.getElementById('dc-result-count')
        var nextCount = next.getElementById('dc-result-count').textContent.trim()
        if (options.focus === 'count') count.setAttribute('aria-live', 'off')
        if (count.textContent.trim() !== nextCount) count.textContent = nextCount

        syncForm(document.getElementById('dc-filters'), next.getElementById('dc-filters'))

        if (results) results._dcHovered = null
        if (options.push) history.pushState({ dc: true }, '', href)
        if (options.replace) history.replaceState({ dc: true }, '', href)
        show(readState(), !options.replace, options.focus === 'map')
        if (options.focus === 'areas') {
          var heading = document.getElementById('dc-map-heading')
          if (heading) heading.focus({ preventScroll: true })
        }
        if (options.focus === 'count') {
          count.focus()
          setTimeout(function () { count.setAttribute('aria-live', 'polite') }, 1000)
        }
      })
      .catch(function (error) {
        if (error.name === 'AbortError') return
        // Fall back to loading the page normally
        if (window.console) console.error(error)
        window.location.href = href
      })
  }

  // "Back up a level", the area list, the applied filter tags and "Clear filters". The tags and
  // "Clear filters" move focus to the result count, as "Apply filter" does.
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[data-drill]')
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    stopDrawing()
    go(link.href, { push: true, focus: link.hasAttribute('data-focus') ? 'count' : 'areas' })
  })

  // Filters apply only when the form is sent, with "Apply filter" or the search button
  function formUrl (form) {
    var params = new URLSearchParams()
    new FormData(form).forEach(function (value, key) {
      if (value && value !== '_unchecked') params.append(key, value)
    })
    var search = params.toString()
    return form.action + (search ? '?' + search : '')
  }

  document.addEventListener('submit', function (event) {
    var form = event.target
    if (form.id !== 'dc-filters') return
    event.preventDefault()
    // A new area type is a new map level, so leave the example site
    var chosen = form.querySelector('input[name="place-type"]:checked')
    var current = new URLSearchParams(window.location.search).get('place-type') || ''
    if ((chosen ? chosen.value : '') !== current) {
      var site = form.querySelector('[data-site]')
      if (site) site.remove()
    }
    go(formUrl(form), { push: true, focus: 'count' })
  })

  // Back and forward buttons
  history.replaceState({ dc: true }, '', window.location.href)
  window.addEventListener('popstate', function () {
    stopDrawing()
    go(window.location.href, { push: false })
  })

  function refreshSize () {
    setTimeout(function () {
      map.invalidateSize()
      fit(lastBounds, false)
    }, 0)
  }
  window.addEventListener('resize', refreshSize)

  show(readState(), false, false)
})()
