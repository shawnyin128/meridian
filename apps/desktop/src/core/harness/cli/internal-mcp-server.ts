// The internal MCP server a subscription CLI starts for one run. It connects to the channel Core opened
// for that run, presents the run's token, then relays the CLI's MCP messages to Core and Core's answers
// back. It reads nothing itself and ends when either side closes.
import { connect } from 'node:net'

const address = process.env['MERIDIAN_VAULT_MCP']
const token = process.env['MERIDIAN_VAULT_MCP_TOKEN']
if (address === undefined || token === undefined) {
  process.stderr.write('MERIDIAN_VAULT_MCP and MERIDIAN_VAULT_MCP_TOKEN must name the run\'s channel\n')
  process.exit(2)
}
const channel = connect(address)
channel.once('connect', () => {
  channel.write(`${token}\n`)
  process.stdin.pipe(channel)
})
channel.pipe(process.stdout)
channel.on('error', (cause) => {
  process.stderr.write(`${cause.message}\n`)
  process.exitCode = 1
})
channel.on('close', () => process.stdin.destroy())
