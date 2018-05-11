const axios = require('axios')
const uuid = require('uuid/v4')

module.exports = (reporter, definition) => {
  async function delegateRecipe (url, recipe, req, res) {
    reporter.logger.debug(`Delegating recipe ${recipe} to worker at ${url}`, req)
    req.context.uuid = uuid()
    let resp = await axios.post(url, {
      type: 'recipe',
      uuid: req.context.uuid,
      data: {
        req,
        res
      }
    })

    while (resp.data.action === 'render') {
      Object.assign(req, resp.data.data.parentReq)
      reporter.logger.debug(`Processing render callback from worker.`, req)
      const renderRes = await reporter.render(resp.data.data.req, req)
      resp = await axios.post(url, {
        uuid: req.context.uuid,
        data: {
          content: renderRes.content.toString(),
          req
        }
      })
    }

    Object.assign(req, resp.data.req)
    Object.assign(res, resp.data.res)
    res.content = Buffer.from(res.content, 'base64')
  }

  reporter.executeScript = async (inputs, options, req) => {
    reporter.logger.debug(`Delegating script to worker`, req)
    const resp = await axios.post(definition.options.url, {
      type: 'scriptManager',
      uuid: uuid(),
      data: {
        inputs,
        options
      }
    })

    return resp.data
  }

  reporter.initializeListeners.add('delegate', this, () => {
    reporter.extensionsManager.recipes = reporter.extensionsManager.recipes.map((r) => ({
      name: r.name,
      execute: (req, res) => delegateRecipe(definition.options.url, r.name, req, res)
    }))
  })
}
