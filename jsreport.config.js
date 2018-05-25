
module.exports = {
  'name': 'worker-delegate',
  'main': 'lib/delegate.js',
  'optionsSchema': {
    extensions: {
      'worker-delegate': {
        type: 'object',
        properties: {
          workerUrl: { type: 'string' }
        }
      }
    }
  }
}
