import fs from 'node:fs'

const path = 'client.js'
let source = fs.readFileSync(path, 'utf8')

const before = source
source = source.replace(/className: 'dshm-sheet-body'/g, "className: 'dshm-list'")
const changed = (before.match(/dshm-sheet-body/g) ?? []).length
fs.writeFileSync(path, source, 'utf8')
console.log('replaced', changed, 'occurrences')
