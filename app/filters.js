//
// For guidance on how to create filters see:
// https://prototype-kit.service.gov.uk/docs/filters
//

const govukPrototypeKit = require('govuk-prototype-kit')
const addFilter = govukPrototypeKit.views.addFilter

// Add your filters here

// 25312149 -> "25,312,149"
addFilter('formatNumber', number => Number(number).toLocaleString('en-GB'))

// Extracted design code text -> GOV.UK paragraphs and bullet lists.
// Blank lines separate blocks; lines starting "- " are bullets. Everything else is escaped.
addFilter('designCodeText', text => {
  if (!text) return ''
  const escape = value => value.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)
  const html = text.split(/\n\s*\n/).map(block => {
    const lines = block.split('\n')
    if (lines.every(line => line.startsWith('- '))) {
      return '<ul class="govuk-list govuk-list--bullet">' +
        lines.map(line => `<li>${escape(line.slice(2))}</li>`).join('') + '</ul>'
    }
    return `<p class="govuk-body">${escape(lines.join(' '))}</p>`
  }).join('')
  return html
}, { renderAsHtml: true })

// ['A', 'B'] -> a GOV.UK bullet list, for values that may themselves contain commas
addFilter('bulletList', items => {
  if (!items || !items.length) return ''
  const escape = value => String(value).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`)
  return '<ul class="govuk-list govuk-list--bullet govuk-!-margin-bottom-0">' +
    items.map(item => `<li>${escape(item)}</li>`).join('') + '</ul>'
}, { renderAsHtml: true })

// "2024-07-11" -> "11 July 2024", in GOV.UK style
addFilter('formatDate', isoDate => {
  if (!isoDate) return ''
  const date = new Date(isoDate + 'T00:00:00Z')
  if (isNaN(date)) return isoDate
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
})

