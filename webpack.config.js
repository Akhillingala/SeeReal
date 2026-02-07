const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

// Load env for GEMINI_API_KEY (optional - user can also add key in popup)
// Absolute paths; .env.local overrides .env. npm run dev also preloads via node -r dotenv/config
const envLocal = path.resolve(__dirname, '.env.local');
const envDefault = path.resolve(__dirname, '.env');
require('dotenv').config({ path: envDefault });
require('dotenv').config({ path: envLocal, override: true });

// Trim key so trailing newline/carriage return from .env file doesn't break the API
const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';
  if (!isProd && geminiKey) {
    console.log('[SeeReal] GEMINI_API_KEY loaded from .env.local');
  } else if (!isProd && !geminiKey) {
    console.warn('[SeeReal] No GEMINI_API_KEY in .env.local — add key in extension popup or set in .env.local');
  }

  return {
    entry: {
      background: './src/background/service-worker.ts',
      content: './src/content/content-script.tsx',
      popup: './src/popup/popup.tsx',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader', 'postcss-loader'],
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    plugins: [
      new webpack.DefinePlugin({
        __GEMINI_API_KEY_FROM_ENV__: JSON.stringify(geminiKey),
      }),
      new CopyPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'public/icons', to: 'icons' },
          { from: 'public/logo.svg', to: 'logo.svg' },
        ],
      }),
      new HtmlWebpackPlugin({
        template: './src/popup/popup.html',
        filename: 'popup.html',
        chunks: ['popup'],
      }),
    ],
    devtool: isProd ? false : 'cheap-module-source-map',
    optimization: {
      splitChunks: false,
    },
  };
};
