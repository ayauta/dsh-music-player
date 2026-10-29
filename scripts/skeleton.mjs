import fs from 'node:fs'

const source = fs.readFileSync('client.js', 'utf8')
const marker = 'showQueue'
let index = source.indexOf(marker)
while (index !== -1) {
  console.log('--- occurrence at', index, '---')
  console.log(source.slice(Math.max(0, index - 1200), index + 200))
  index = source.indexOf(marker, index + 1)
}
