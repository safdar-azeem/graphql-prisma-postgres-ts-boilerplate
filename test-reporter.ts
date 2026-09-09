import type { Reporter } from 'vitest/reporters'

type TestCase = Parameters<NonNullable<Reporter['onTestCaseResult']>>[0]
type TestRunEnd = NonNullable<Reporter['onTestRunEnd']>

const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const BOLD = '\x1b[1m'

const green = (value: string | number) => `${GREEN}${value}${RESET}`
const red = (value: string | number) => `${RED}${value}${RESET}`
const bold = (value: string | number) => `${BOLD}${value}${RESET}`

export default class CustomReporter implements Reporter {
  private passedTests = 0
  private failedTests = 0
  private skippedTests = 0

  onTestRunStart() {
    this.passedTests = 0
    this.failedTests = 0
    this.skippedTests = 0
  }

  onTestCaseResult(testCase: TestCase) {
    const state = testCase.result().state

    if (state === 'passed') this.passedTests += 1
    else if (state === 'failed') this.failedTests += 1
    else this.skippedTests += 1

    if (state === 'passed' || state === 'failed') {
      const status = state === 'passed' ? green('SUCCESS') : red('FAILED')
      process.stderr.write(`${testCase.fullName} : ${status}\n`)
    }
  }

  onTestRunEnd(...[testModules, unhandledErrors, reason]: Parameters<TestRunEnd>) {
    const passedFiles = testModules.filter((module) => module.state() === 'passed').length
    const failedFiles = testModules.filter((module) => module.state() === 'failed').length
    const skippedFiles = testModules.length - passedFiles - failedFiles
    const suiteFailures = testModules.reduce((total, module) => total + module.errors().length, 0)
    const totalTests = this.passedTests + this.failedTests + this.skippedTests
    const knownFailures = this.failedTests + suiteFailures + unhandledErrors.length
    const totalFailures = reason === 'failed' ? Math.max(knownFailures, 1) : knownFailures

    process.stderr.write('\n--- Test Summary ---\n')
    process.stderr.write(
      `Test Files: ${bold(testModules.length)} | Passed: ${green(passedFiles)} | Failed: ${failedFiles ? red(failedFiles) : 0} | Skipped: ${skippedFiles}\n`
    )
    process.stderr.write(
      `Tests: ${bold(totalTests)} | Passed: ${green(this.passedTests)} | Failed: ${this.failedTests ? red(this.failedTests) : 0} | Skipped: ${this.skippedTests}\n`
    )
    process.stderr.write(`Suite/import failures: ${suiteFailures ? red(suiteFailures) : 0}\n`)
    process.stderr.write(
      `Unhandled errors: ${unhandledErrors.length ? red(unhandledErrors.length) : 0}\n`
    )
    process.stderr.write(`Total failures: ${totalFailures ? red(totalFailures) : 0}\n`)
    process.stderr.write(`Run: ${reason === 'passed' ? green('PASSED') : red(reason.toUpperCase())}\n`)
  }
}
