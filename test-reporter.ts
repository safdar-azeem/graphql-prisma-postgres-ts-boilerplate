export default class CustomReporter {
  constructor() {
    this.ctx = null
    this.printed = new Set()
  }

  onInit(ctx) {
    this.ctx = ctx
  }

  onTaskUpdate(packs) {
    if (!this.ctx || !packs) return

    for (const pack of packs) {
      const [id, result] = pack

      // Check if task is finished
      if (result && (result.state === 'pass' || result.state === 'fail')) {
        if (this.printed.has(id)) continue
        this.printed.add(id)

        // Try to find task object
        let task = null
        if (this.ctx.state.idMap) {
          task = this.ctx.state.idMap.get(id)
        }

        if (task && task.type === 'test') {
          const status = result.state === 'pass' ? 'SUCCESS' : 'FAILED'
          let name = task.name.replace(/ : (SUCCESS|FAILED)$/, '')
          console.error(`${name} : ${status}`)
        }
      }
    }
  }
}
