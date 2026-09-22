/** Run both shards before reporting so one failure does not hide the other; exit nonzero if either fails. */
import { spawnSync } from 'node:child_process'

const SHARDS = ['1/2', '2/2']

let failed = false
for (const shard of SHARDS) {
  const run = spawnSync('npx', ['playwright', 'test', `--shard=${shard}`], { stdio: 'inherit', shell: true })
  if (run.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
