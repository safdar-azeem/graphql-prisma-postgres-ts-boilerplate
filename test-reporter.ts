import { reporter } from 'vitest'

export default class CustomReporter {
  constructor() {
    this.ctx = null
    this.printed = new Set()
    this.stats = {
      passed: 0,
      failed: 0,
    }

    this.printSummary = this.printSummary.bind(this)
  }

  onInit(ctx) {
    this.ctx = ctx
    process.on('exit', this.printSummary)
  }

  onTaskUpdate(packs) {
    if (!this.ctx || !packs) return

    for (const pack of packs) {
      const [id, result] = pack

      // Check if task is finished
      if (result && (result.state === 'pass' || result.state === 'fail')) {
        if (this.printed.has(id)) continue
        this.printed.add(id)

        let task = null
        if (this.ctx.state.idMap) {
          task = this.ctx.state.idMap.get(id)
        }

        if (task && task.type === 'test') {
          // Only count and print ACTUAL tests
          if (result.state === 'pass') this.stats.passed++
          if (result.state === 'fail') this.stats.failed++

          const status = result.state === 'pass' ? 'SUCCESS' : 'FAILED'
          let name = task.name.replace(/ : (SUCCESS|FAILED)$/, '')
          process.stderr.write(`${name} : ${status}\n`)
        }
      }
    }
  }

  printSummary() {
    if (this.summaryPrinted) return
    this.summaryPrinted = true

    const total = this.stats.passed + this.stats.failed
    process.stderr.write('\n--- Test Summary ---\n')
    process.stderr.write(`Total: ${total}\n`)
    process.stderr.write(`Passed: ${this.stats.passed}\n`)
    process.stderr.write(`Failed: ${this.stats.failed}\n`)
  }
}
