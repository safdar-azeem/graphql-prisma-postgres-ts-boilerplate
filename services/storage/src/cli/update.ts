import 'dotenv/config'
import { spawn } from 'child_process'
import path from 'path'

const runCommand = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): Promise<{ success: boolean; output: string; error?: string }> => {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      env,
      cwd: path.resolve(cwd),
      shell: true,
    })

    let output = ''
    let errorOutput = ''

    proc.stdout.on('data', (data) => {
      process.stdout.write(data)
      output += data.toString()
    })

    proc.stderr.on('data', (data) => {
      process.stderr.write(data)
      errorOutput += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output })
      } else {
        resolve({ success: false, output, error: errorOutput || `Exit code: ${code}` })
      }
    })

    proc.on('error', (err) => {
      resolve({ success: false, output, error: err.message })
    })
  })
}

const updateDatabase = async (): Promise<void> => {
  console.log('\n' + '='.repeat(60))
  console.log('🔄 STORAGE SERVICE DATABASE UPDATE')
  console.log('='.repeat(60) + '\n')

  // --- STEP 1: GENERATE TYPES ---
  console.log('🛠️  Step 1: Generating Prisma Client Types...')
  const genResult = await runCommand('npx', ['prisma', 'generate'])

  if (!genResult.success) {
    console.error('\n❌ Failed to generate client. Aborting update.')
    process.exit(1)
  }
  console.log('✅ Client types generated successfully.\n')

  // --- STEP 2: PUSH SCHEMA ---
  const dbUrl = process.env.DATABASE_URL
  const extraArgs = process.argv.slice(2)

  console.log('📦 Step 2: Pushing Schema to Database...')
  if (extraArgs.length > 0) {
    console.log(`🔧 Using flags: ${extraArgs.join(' ')}`)
  }
  console.log('')

  if (!dbUrl) {
    console.error('❌ No database configured. Set DATABASE_URL environment variable.')
    process.exit(1)
  }

  // We automatically accept data loss to prevent interactive prompts breaking the CLI
  // If `--force-reset` is passed in extraArgs, Prisma handles wiping the DB completely.
  const args = ['prisma', 'db', 'push', '--accept-data-loss', ...extraArgs]

  const { success, error } = await runCommand('npx', args)

  if (!success) {
    console.error(`\n❌ Database update failed.`)
    console.error(error)
    console.log('\n⚠️  Run with `yarn db:update --force-reset` to clear incompatible data if needed.')
    process.exit(1)
  }

  console.log('\n✨ Database update completed successfully!')
}

updateDatabase().catch((error) => {
  console.error('Update script failed:', error)
  process.exit(1)
})
