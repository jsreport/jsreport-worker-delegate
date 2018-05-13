const pdfjs = require('pdfjs-dist')

async function getPageText (pageNum, doc) {
  const page = await doc.getPage(pageNum)
  const textContent = await page.getTextContent()
  return textContent.items.reduce((a, v) => a + v.str, '')
}

module.exports = async (contentBuffer) => {
  const doc = await pdfjs.getDocument(contentBuffer)

  const result = { pages: [] }
  for (let i = 1; i < doc.pdfInfo.numPages + 1; i++) {
    result.pages.push({
      text: await getPageText(i, doc)
    })
  }

  return result
}
