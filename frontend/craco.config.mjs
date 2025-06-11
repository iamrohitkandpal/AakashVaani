import webpack from 'webpack';
import util from 'util';
import buffer from 'buffer';
import process from 'process/browser';
import path from 'path-browserify';

/** @type {import('@craco/craco').CracoConfig} */
export default {
  webpack: {
    configure: (config) => {
      // Add Node.js polyfills
      config.resolve.fallback = {
        ...config.resolve.fallback,
        util: util,
        buffer: buffer,
        stream: false,
        crypto: false,
        process: process,
        path: path,
        fs: false,
        http: false,
        https: false,
        zlib: false,
        net: false,
        tls: false,
        os: false,
      };

      // Global providers
      config.plugins.push(
        new webpack.ProvidePlugin({
          process: 'process/browser',
          Buffer: ['buffer', 'Buffer'],
        })
      );

      // Ignore TensorFlow source map warnings
      config.ignoreWarnings = [
        { module: /@tensorflow-models\/speech-commands/ },
        { module: /dist\/speech-commands\.esm\.js/ },
      ];

      return config;
    },
  },
};
