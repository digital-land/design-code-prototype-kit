// v4: "Data" in the service navigation opens and closes its sub-menu, as on planning.data.gov.uk.
// Without JavaScript the sub-menu stays open, so its links can still be reached.
(function () {
  document.querySelectorAll('.app-subnav-toggle').forEach(function (toggle) {
    var subnav = document.getElementById(toggle.getAttribute('aria-controls'))
    if (!subnav) return
    subnav.hidden = true

    function setOpen (open) {
      toggle.setAttribute('aria-expanded', String(open))
      subnav.hidden = !open
    }

    toggle.addEventListener('click', function (event) {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true')
      // Only blur if clicked by mouse and not keyboard
      if (event.detail > 0) toggle.blur()
    })

    // Close it with Escape, or by selecting somewhere else
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape' || subnav.hidden) return
      setOpen(false)
      toggle.focus()
    })
    document.addEventListener('click', function (event) {
      if (!subnav.hidden && !toggle.parentNode.contains(event.target)) setOpen(false)
    })
  })
})()
