#!/usr/bin/env node
// Static checks: every file the service worker pre-caches exists, the SW cache
// key derives from config.js VERSION, and the manifest name matches config.js.
'use strict'
const fs = require('fs'), path = require('path')
const root = path.join(__dirname, '..')
const APP = require('../config.js')
let fail = 0
function bad (msg) { console.error('FAIL ' + msg); fail++ }
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8')
const m = sw.match(/const ASSETS = \[([\s\S]*?)\]/)
if (!m) bad('sw.js: ASSETS array not found')
else {
  const assets = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
  for (const a of assets) {
    if (a === './') continue
    const f = a.split('?')[0]
    if (!fs.existsSync(path.join(root, f))) bad('sw.js ASSETS references missing file: ' + a)
  }
  if (!assets.includes('config.js')) bad('sw.js ASSETS must include config.js')
  console.log('sw.js: ' + assets.length + ' cached entries checked')
}
if (!/importScripts\('config\.js'\)/.test(sw) || !/APP_CONFIG\.VERSION/.test(sw)) bad('sw.js cache VERSION must derive from APP_CONFIG.VERSION')
if (/const VERSION = '[^']*'\s*$/m.test(sw)) bad('sw.js has a hard-coded VERSION string')
const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'))
if (man.name !== APP.NAME) bad('manifest name "' + man.name + '" != config NAME "' + APP.NAME + '" (run npm run sync)')
for (const i of man.icons) if (!fs.existsSync(path.join(root, i.src))) bad('manifest icon missing: ' + i.src)
if (fail) { console.error(fail + ' check(s) failed'); process.exit(1) }
console.log('check: OK (config ' + APP.NAME + ' v' + APP.VERSION + ')')
