const jsreport = require('jsreport-core')
const Worker = require('jsreport-worker')
require('should')

describe('delegate', () => {
  let reporter
  let sandboxServer

  beforeEach(() => {
    reporter = jsreport({ templatingEngines: { strategy: 'in-process' } })
      .use(require('jsreport-chrome-pdf')())
      .use(require('jsreport-handlebars')())
      .use(require('../')({
        url: 'http://localhost:6000/'
      }))

    sandboxServer = Worker({ httpPort: 6000, scriptManager: { strategy: 'in-process' } })
    return reporter.init()
  })

  afterEach(() => {
    sandboxServer.close()
    return reporter.close()
  })

  it('should render chrome-pdf in worker', async () => {
    const res = await reporter.render({
      template: {
        content: 'foo',
        recipe: 'chrome-pdf',
        engine: 'none'
      }
    })

    res.content.toString().should.containEql('PDF')
    res.meta.logs.map(l => l.message).should.containEql('Delegating recipe')
  })

  it('should also render headers in pdf', async () => {
    const res = await reporter.render({
      template: {
        content: 'foo',
        recipe: 'chrome-pdf',
        engine: 'none',
        chrome: { headerTemplate: 'header' }
      }
    })

    res.content.toString().should.containEql('PDF')
    res.meta.logs.map(l => l.message).should.containEql('Processing render callback from worker.')
  })

  it('should render both header and footer in worker', async () => {
    const res = await reporter.render({
      template: {
        content: 'foo',
        recipe: 'chrome-pdf',
        engine: 'none',
        chrome: { headerTemplate: 'header', footerTemplate: 'footer' }
      }
    })

    res.content.toString().should.containEql('PDF')
    res.meta.logs
      .filter(l => l.message.includes('Processing render callback from worker.'))
      .should.have.length(2)
  })

  it('should evaluate handlebars in worker', async () => {
    const res = await reporter.render({
      template: {
        content: '{{foo}}',
        recipe: 'html',
        engine: 'handlebars'
      },
      data: { foo: 'hello' }
    })

    res.content.toString().should.be.eql('hello')
    res.meta.logs.map(l => l.message).should.containEql('Delegating script to worker')
  })
})
