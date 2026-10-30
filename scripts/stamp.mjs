// Writes dist/version.json after `vite build`, so the live site can show which commit it runs
// (open /version.json, or see Settings). Uses the Workers Builds env vars when present.
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const env = process.env
const git = (args) => {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}
const sha = env.WORKERS_CI_COMMIT_SHA || git('rev-parse HEAD') || 'unknown'
const info = {
  sha: sha.slice(0, 7),
  branch: env.WORKERS_CI_BRANCH || git('rev-parse --abbrev-ref HEAD') || null,
  builtAt: new Date().toISOString(),
  source: env.WORKERS_CI ? 'workers-builds' : 'local',
}
mkdirSync('dist', { recursive: true })
writeFileSync('dist/version.json', JSON.stringify(info))
console.log('version.json', JSON.stringify(info))
