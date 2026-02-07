#!/usr/bin/env node
/**
 * Package SeeReal extension for distribution
 * Output: dist/ directory ready for Chrome Web Store
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
  console.error('Run npm run build first');
  process.exit(1);
}
console.log('[SeeReal] Extension packaged at dist/');
console.log('Load unpacked extension from:', distDir);
