#!/usr/bin/env node
// Writes APP_CONFIG.NAME / SHORT_NAME from config.js into manifest.webmanifest.
'use strict'
const fs = require('fs'), path = require('path')
const APP = require('../config.js')
const file = path.join(__dirname, '..', 'manifest.webmanifest')
const m = JSON.parse(fs.readFileSync(file, 'utf8'))
m.name = APP.NAME; m.short_name = APP.SHORT_NAME || APP.NAME
fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n')
console.log('manifest.webmanifest name -> ' + m.name)
