//
// v3 design code page: a map that drills down council > town > place type > example site, kept in
// sync with the filters, results and URL. The map can't zoom out beyond the council.
//
// The page works without this script: every area is also a link in the list under the map, and
// the filters are a normal form. With it, choosing an area (on the map or with "Back up a level"),
// removing a filter or applying the filters loads the new page state in place, zooms the map,
// updates the result count (an aria-live region) and adds a history entry, so the back button works.
// Hovering or focusing a design code highlights where it applies on the map, with its reference.
//
// To change the interaction, start with show() (what each level draws), go() (loading a state)
// and highlight() (hovering a design code).
//
(function () {
  var mapElement = document.getElementById('dc-map')
  if (!mapElement || !window.L) return

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Fill colours for the areas at each level. The selected area also gets a hatched fill and a
  // thick outline, so colour is never the only sign.
  var COLOURS = {
    'town-centre': '#e59abe',
    'inner-neighbourhood': '#fabb9c',
    'outer-neighbourhood': '#ffee80',
    'neighbourhood-centre': '#8ac0c3',
    'business-and-industrial': '#8eb8dc',
    example: '#d4351c'
  }
  var DEFAULT_COLOUR = '#1d70b8'

  // The zoom buttons go bottom right, clear of the box saying where the map is
  var map = L.map(mapElement, { renderer: L.svg(), scrollWheelZoom: false, zoomSnap: 0.25, zoomControl: false })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map)
  map.setView([53.8, -0.5], 9)

  var drawn = L.layerGroup().addTo(map)
  var lastBounds = null

  // A hovered design code's reference goes above the area labels (Leaflet's tooltips are 650)
  map.createPane('dcCodeTag').style.zIndex = 660
  var councilBounds = null

  // The box in the top left saying where the map is
  var mapControl = document.getElementById('dc-map-nav')

  // Zoom to an area, keeping it clear of the box in the top left. If the map has no size yet,
  // wait until it has.
  function fit (bounds, animate) {
    lastBounds = bounds
    if (!bounds || !mapElement.offsetWidth) return
    var top = mapControl ? mapControl.offsetTop + mapControl.offsetHeight + 8 : 16
    var options = { paddingTopLeft: [16, top], paddingBottomRight: [16, 16] }
    if (animate && !reduceMotion) map.flyToBounds(bounds, Object.assign({ duration: 0.8 }, options))
    else map.fitBounds(bounds, Object.assign({ animate: false }, options))
  }

  // A diagonal hatch for the selected area, added to Leaflet's SVG once it exists
  function addHatch () {
    var svg = mapElement.querySelector('.leaflet-overlay-pane svg')
    if (!svg || svg.querySelector('#dc-hatch')) return
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
    defs.innerHTML = '<pattern id="dc-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">' +
      '<rect width="8" height="8" fill="#ffffff" fill-opacity="0.35"></rect>' +
      '<line x1="0" y1="0" x2="0" y2="8" stroke="#0b0c0c" stroke-width="2" stroke-opacity="0.45"></line></pattern>'
    svg.insertBefore(defs, svg.firstChild)
  }

  function geoLayer (geometry, style) {
    return L.geoJSON({ type: 'Feature', geometry: geometry, properties: {} }, { style: style })
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

  // What's drawn at this level, so a hovered design code can be highlighted
  var current = { parent: null, children: {}, state: null }

  // Draw a level: context outlines, dimmed siblings, the selected area, then the areas to choose
  function show (state, animate, focusFirstArea) {
    clearHighlight()
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

    var parent = state.parent
    if (parent) {
      var parentLayer
      if (parent.bounds) {
        if (parent.image) L.imageOverlay(parent.image, parent.bounds, { alt: 'Illustrative example site plan' }).addTo(drawn)
        parentLayer = L.rectangle(parent.bounds, { color: '#0b0c0c', weight: 3, fill: false, interactive: false }).addTo(drawn)
      } else {
        parentLayer = geoLayer(parent.geometry, { color: '#0b0c0c', weight: 3, fillColor: '#ffffff', fillOpacity: 0.2, interactive: false }).addTo(drawn)
        parentLayer.eachLayer(function (layer) { layer._dcSelected = true })
      }
      current.parent = parentLayer
      focusBounds = parentLayer.getBounds()
    }

    var areaElements = []
    ;(state.children || []).forEach(function (area) {
      var colour = COLOURS[area.id] || DEFAULT_COLOUR
      var style = { color: '#0b0c0c', weight: 1.5, fillColor: colour, fillOpacity: 0.55, className: 'app-v3-area' }
      var layer = area.bounds ? L.rectangle(area.bounds, style) : geoLayer(area.geometry, style)
      layer.addTo(drawn)
      current.children[area.id] = layer
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
        go(area.href, { push: true, focus: 'map' })
      }
      layer.on('click', choose)
      if (!parent) focusBounds = focusBounds ? focusBounds.extend(layer.getBounds()) : layer.getBounds()
      ;(layer.getLayers ? layer.getLayers() : [layer]).forEach(function (part) {
        var element = part.getElement()
        if (!element) return
        element.setAttribute('tabindex', '0')
        element.setAttribute('role', 'link')
        element.setAttribute('aria-label', area.name)
        element.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            choose()
          }
        })
        areaElements.push(element)
      })
    })

    hatchSelected()

    fit(focusBounds, animate)

    if (focusFirstArea) {
      if (areaElements[0]) areaElements[0].focus({ preventScroll: true })
      else mapElement.focus({ preventScroll: true })
    }
  }

  // The selected area gets the hatched fill as well as its thick outline
  function hatchSelected () {
    addHatch()
    drawn.eachLayer(function (group) {
      if (!group.eachLayer) return
      group.eachLayer(function (layer) {
        if (layer._dcSelected && layer.getElement()) {
          layer.getElement().setAttribute('fill', 'url(#dc-hatch)')
          layer.getElement().setAttribute('fill-opacity', '1')
        }
      })
    })
  }

  // Hovering a design code: highlight where it applies, with its reference pinned there. A code
  // for particular place types highlights those zones when they're on the map; otherwise it applies
  // across the area the map is showing.
  var highlighted = []
  var codeTag = null

  function clearHighlight () {
    highlighted.forEach(function (item) { item.layer.setStyle(item.style) })
    if (highlighted.length) hatchSelected()
    highlighted = []
    if (codeTag) codeTag.remove()
    codeTag = null
  }

  function highlight (reference, placeTypes) {
    clearHighlight()
    var targets = placeTypes
      .map(function (id) { return current.children[id] })
      .filter(Boolean)
    if (!targets.length) targets = current.parent ? [current.parent] : Object.keys(current.children).map(function (id) { return current.children[id] })
    if (!targets.length) return

    var bounds = null
    targets.forEach(function (layer) {
      highlighted.push({ layer: layer, style: Object.assign({}, (layer.getLayers ? layer.getLayers()[0] : layer).options) })
      layer.setStyle({ color: '#1d70b8', weight: 4, fillColor: '#1d70b8', fillOpacity: 0.25 })
      bounds = bounds ? bounds.extend(layer.getBounds()) : L.latLngBounds(layer.getBounds().getSouthWest(), layer.getBounds().getNorthEast())
    })
    codeTag = L.marker(bounds.getCenter(), {
      icon: L.divIcon({ className: 'app-v3-map__code-tag', html: '<span>' + reference + '</span>', iconSize: null }),
      pane: 'dcCodeTag',
      interactive: false,
      keyboard: false
    }).addTo(map)
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

  // Load a page state in place: swap the map panel and results, update the count and the URL
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
        show(readState(), true, options.focus === 'map')
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
