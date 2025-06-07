module.exports = function override(config, env) {
  // Add polyfills for Node.js core modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    "util": require.resolve("util/"),
    "buffer": require.resolve("buffer/"),
    "stream": false,
    "crypto": false,
    "process": require.resolve("process/browser"),
    "path": require.resolve("path-browserify"),
    "fs": false,
    "http": false,
    "https": false,
    "zlib": false,
    "net": false,
    "tls": false,
    "os": false
  };

  // Add providers for global variables
  const webpack = require("webpack");
  config.plugins.push(
    new webpack.ProvidePlugin({
      process: "process/browser",
      Buffer: ["buffer", "Buffer"],
    })
  );

  return config;
};