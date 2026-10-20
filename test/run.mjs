// Runs every test file in this directory in one process, stopping at the first
// failure so a broken build never looks green.
const suites = ['test-parsers.mjs', 'test-graph.mjs', 'test-render.mjs', 'live-render.mjs', 'test-host.mjs']

for (const suite of suites) {
  process.stdout.write(`\n${suite}\n`)
  await import(new URL(suite, import.meta.url).href)
}
console.log('\nall suites passed')
