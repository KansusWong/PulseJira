// Pre-require hook: mock 'server-only' module before anything imports it
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === 'server-only') {
    // Return a path that resolves to an empty module
    return require.resolve('./noop-module.cjs');
  }
  return origResolve.call(this, request, ...args);
};
