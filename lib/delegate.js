
const axios = require('axios')
const uuid = require('uuid/v4')

module.exports = (reporter, definition) => {
  reporter.addRequestContextMetaConfig('uuid', { sandboxReadOnly: true })

  reporter.workerDelagate = {
    getWorker: async (req) => {
      return {
        url: definition.options.workerUrl,
        release: async () => {}
      }
    }
  }

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

  async function delegateRecipe (worker, recipe, req, res) {
    const url = worker.url

    reporter.logger.debug(`Delegating recipe ${recipe} to worker at ${url}`, req)
    req.context.uuid = uuid()

    // jsreport has in content buffer which is harder to serialize
    // but we can send already string to the worker
    res.content = res.content.toString()

    let resp

    try {
      resp = await axiosPost(url, {
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
    } catch (e) {
      await worker.release(e)
      throw e
    }

    Object.assign(req, resp.data.req)
    Object.assign(res, resp.data.res)

    res.content = Buffer.from(res.content, 'base64')

    await worker.release()
  }

  reporter.executeScript = async (inputs, options, req) => {
    reporter.logger.debug(`Delegating script to worker`, req)

    const worker = await reporter.workerDelagate.getWorker(req)

    if (worker.url == null) {
      throw new Error(`Worker obtained has no url assigned to execute script in it`)
    }

    let resp

    try {
      resp = await axiosPost(worker.url, {
        type: 'scriptManager',
        uuid: uuid(),
        data: {
          inputs,
          options
        }
      })
    } catch (e) {
      await worker.release(e)
      throw e
    }

    await worker.release()

    return resp.data
  }

  reporter.initializeListeners.add('delegate', this, () => {
    reporter.extensionsManager.recipes = reporter.extensionsManager.recipes.map((r) => ({
      name: r.name,
      execute: async (req, res) => {
        const worker = await reporter.workerDelagate.getWorker(req)

        if (worker.url == null) {
          throw new Error(`Worker obtained has no url assigned to execute recipe in it`)
        }

        return delegateRecipe(worker, r.name, req, res)
      }
    }))
  })
}
