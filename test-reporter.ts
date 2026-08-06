const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

const green = (str: string) => `${GREEN}${str}${RESET}`
const red = (str: string) => `${RED}${str}${RESET}`
const bold = (str: string) => `${BOLD}${str}${RESET}`
const dim = (str: string) => `${DIM}${str}${RESET}`

function formatError(error: any): string {
  if (!error) return 'Unknown error'

  const lines: string[] = []
  const message = error.message || String(error)
  lines.push(`  ${red('Error:')} ${message}`)

  if (error.expected !== undefined) {
    lines.push(`  ${dim('Expected:')} ${JSON.stringify(error.expected, null, 2)}`)
  }
  if (error.actual !== undefined) {
    lines.push(`  ${dim('Received:')} ${JSON.stringify(error.actual, null, 2)}`)
  }
  // Vitest / chai style
  if (error.showDiff && error.expected === undefined && error.actual === undefined) {
    if ('expected' in error) lines.push(`  ${dim('Expected:')} ${String(error.expected)}`)
    if ('actual' in error) lines.push(`  ${dim('Received:')} ${String(error.actual)}`)
  }

  const stack = error.stack || error.stacks?.[0]?.stack
  if (stack) {
    const stackLines = String(stack)
      .split('\n')
      .slice(0, 12)
      .map((l: string) => `  ${dim(l)}`)
    lines.push(...stackLines)
  }

  return lines.join('\n')
}

export default class CustomReporter {
  ctx: any = null
  printed = new Set<string>()
  stats = { passed: 0, failed: 0 }
  summaryPrinted = false
  failures: Array<{ file: string; name: string; error: any }> = []

  constructor() {
    this.printSummary = this.printSummary.bind(this)
  }

  onInit(ctx: any) {
    this.ctx = ctx
    process.on('exit', this.printSummary)
  }

  onTaskUpdate(packs: any[]) {
    if (!this.ctx || !packs) return

    for (const pack of packs) {
      const [id, result] = pack

      if (result && (result.state === 'pass' || result.state === 'fail')) {
        if (this.printed.has(id)) continue
        this.printed.add(id)

        let task: any = null
        if (this.ctx.state?.idMap) {
          task = this.ctx.state.idMap.get(id)
        }

        if (task && task.type === 'test') {
          if (result.state === 'pass') this.stats.passed++
          if (result.state === 'fail') this.stats.failed++

          const status = result.state === 'pass' ? green('SUCCESS') : red('FAILED')
          const name = String(task.name).replace(/ : (SUCCESS|FAILED)$/, '')
          const file = task.file?.filepath || task.file?.name || task.suite?.file?.filepath || ''
          const fileLabel = file ? dim(` (${file.split('/').slice(-2).join('/')})`) : ''

          process.stderr.write(`${name}${fileLabel} : ${status}\n`)

          if (result.state === 'fail') {
            const err = result.errors?.[0] || result.error
            this.failures.push({ file, name, error: err })
            process.stderr.write(`${formatError(err)}\n\n`)
          }
        }
      }
    }
  }

  printSummary() {
    if (this.summaryPrinted) return
    this.summaryPrinted = true

    const total = this.stats.passed + this.stats.failed
    const passedLabel = this.stats.passed > 0 ? green(String(this.stats.passed)) : String(this.stats.passed)
    const failedLabel = this.stats.failed > 0 ? red(String(this.stats.failed)) : String(this.stats.failed)

    if (this.failures.length > 0) {
      process.stderr.write(`\n${bold(red('--- Failed Tests ---'))}\n`)
      for (const f of this.failures) {
        process.stderr.write(`${red('×')} ${f.name}\n`)
        if (f.file) process.stderr.write(`  ${dim(f.file)}\n`)
        process.stderr.write(`${formatError(f.error)}\n\n`)
      }
    }

    process.stderr.write('\n--- Test Summary ---\n')
    process.stderr.write(`Total: ${bold(String(total))}\n`)
    process.stderr.write(`Passed: ${passedLabel}\n`)
    process.stderr.write(`Failed: ${failedLabel}\n`)
  }
}
