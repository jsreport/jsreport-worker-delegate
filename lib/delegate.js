const axios = require('axios')
const uuid = require('uuid/v4')

module.exports = (reporter, definition) => {
  const axiosPost = async (url, opts) => {
    try {
      return await axios.post(url, opts)
    } catch (e) {
      if (e.response && e.response.status === 400 && e.response.data && e.response.data.message) {
        const error = reporter.createError(e.response.data.message, {
          weak: true
        })

        error.stack = e.response.data.stack
        throw error
      }

      throw e
    }
  }

  async function delegateRecipe (url, recipe, req, res) {
    reporter.logger.debug(`Delegating recipe ${recipe} to worker at ${url}`, req)
    req.context.uuid = uuid()

    // jsreport has in content buffer which is harder to serialize
    // but we can send already string to the worker
    res.content = res.content.toString()

    let resp = await axiosPost(url, {
      type: 'recipe',
      uuid: req.context.uuid,
      data: {
        req,
        res
      }
    })

    while (resp.data.action === 'render') {
      const respBody = resp.data

      Object.assign(req, respBody.data.parentReq)
      reporter.logger.debug(`Processing render callback from worker.`, req)

      const renderRes = await reporter.render(respBody.data.req, req)

      resp = await axiosPost(url, {
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

    const resp = await axiosPost(req.context.workerUrl || definition.options.url, {
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
      execute: (req, res) => delegateRecipe(req.context.workerUrl || definition.options.url, r.name, req, res)
    }))
  })
}
