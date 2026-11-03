//
// For guidance on how to add JavaScript see:
// https://prototype-kit.service.gov.uk/docs/adding-css-javascript-and-images
//

window.GOVUKPrototypeKit.documentReady(() => {
  // Add JavaScript here

  // Narrow long filter lists as the user types
  document.querySelectorAll('[data-module="app-filter-checkboxes"]').forEach(filter => {
    const search = filter.querySelector('.app-filter-checkboxes__search')
    const input = filter.querySelector('.app-filter-checkboxes__input')
    const items = filter.querySelectorAll('.govuk-checkboxes__item')

    search.hidden = false

    input.addEventListener('input', () => {
      const term = input.value.trim().toLowerCase()
      items.forEach(item => {
        const label = item.querySelector('label').textContent.toLowerCase()
        item.classList.toggle('app-filter-checkboxes__item--hidden', !label.includes(term))
      })
    })

    // Stop Enter in the search box from submitting the filters form
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') event.preventDefault()
    })
  })
})
