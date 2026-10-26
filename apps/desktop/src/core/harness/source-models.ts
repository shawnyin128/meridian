import type {
  CallFailure, HarnessCli, HarnessModelEfforts, HarnessModelEntry, HarnessModelProvider, HarnessSourceModel, HarnessSourceModels,
  HarnessSubscriptionStatus,
} from '../../shared/contract.js'
import { HARNESS_API_EFFORTS, HarnessModelProviderSchema } from '../../shared/contract.js'
import { CallError, callFailure } from '../call-error.js'

const MAX_LISTED = 500
const NO_EFFORTS: HarnessModelEfforts = { levels: [] }

/** Why a CLI's status keeps it from listing its models. */
const UNLISTED: Record<Exclude<HarnessSubscriptionStatus['state'], 'found'>, CallFailure> = {
  missing: 'cli-missing', unsupported: 'cli-unsupported',
}

/** The provider of an API source's profile key, or undefined for one this version does not know. */
const providerOfProfile = (profile: string): HarnessModelProvider | undefined => {
  const parsed = HarnessModelProviderSchema.safeParse(profile.split(':')[0])
  return parsed.success ? parsed.data : undefined
}

/**
 * What one session keeps of the model sources: each subscription CLI's status, and the models each
 * configured source offers, each read once and kept for the session. `start` reads every configured
 * source in the background; after that a status or a list is read again only through `refresh`, when
 * its source's configuration is added or its connection changes. A read that fails is kept as failed,
 * not retried, its source offering its default model. `sources` gives the configured sources now,
 * `readCli` reads a CLI's status, `readApi` the model IDs an API source lists, and `onLog` hears why
 * a list could not be read.
 */
export function createSourceModels(options: {
  sources: () => HarnessModelEntry[]
  readCli: (cli: HarnessCli) => Promise<HarnessSubscriptionStatus>
  readApi: (source: string) => Promise<string[]>
  onLog: (line: string) => void
}) {
  const statuses = new Map<HarnessCli, Promise<HarnessSubscriptionStatus>>()
  const lists = new Map<string, Promise<Omit<HarnessSourceModels, 'source' | 'models'> & { listed: HarnessSourceModel[] }>>()

  const readStatus = (cli: HarnessCli) => {
    const read = options.readCli(cli)
    statuses.set(cli, read)
    return read
  }
  const status = (cli: HarnessCli) => statuses.get(cli) ?? readStatus(cli)

  /** The models `entry`'s source lists besides its default model, or why they cannot be read. */
  const readList = (entry: HarnessModelEntry) => {
    const read = (async () => {
      try {
        if (entry.source.kind === 'cli') {
          const found = await status(entry.source.cli)
          if (found.state !== 'found') return { listed: [], error: UNLISTED[found.state] }
          return {
            listed: ['', ...found.models].map((id) => ({ id, efforts: found.efforts[id] ?? found.efforts[''] ?? NO_EFFORTS })),
          }
        }
        const provider = providerOfProfile(entry.source.profile)
        const efforts: HarnessModelEfforts = { levels: provider === undefined ? [] : [...HARNESS_API_EFFORTS[provider]] }
        if (!entry.configured) return { listed: [] }
        const ids = await options.readApi(entry.id)
        return { listed: ids.map((id) => ({ id, efforts })) }
      } catch (cause) {
        options.onLog(`${entry.id}: its model list cannot be read: ${cause instanceof Error ? cause.message : String(cause)}`)
        return { listed: [], error: callFailure(cause) }
      }
    })()
    lists.set(entry.id, read)
    return read
  }

  /** The efforts of `entry`'s default model when its source lists none for it. */
  const defaultEfforts = (entry: HarnessModelEntry): HarnessModelEfforts => {
    if (entry.source.kind === 'cli') return NO_EFFORTS
    const provider = providerOfProfile(entry.source.profile)
    return { levels: provider === undefined ? [] : [...HARNESS_API_EFFORTS[provider]] }
  }

  const entryOf = (id: string) => options.sources().find((entry) => entry.id === id)

  return {
    /** Reads, in the background, the status of every configured CLI and the models of every configured source. */
    start() {
      for (const entry of options.sources()) void readList(entry)
    },
    /** Reads configured source `id`'s status, if it is a CLI, and its models again, now that its configuration changed. */
    refresh(id: string) {
      const entry = entryOf(id)
      if (entry === undefined) return
      if (entry.source.kind === 'cli') void readStatus(entry.source.cli)
      void readList(entry)
    },
    /** The status of subscription CLI `cli`, as kept for the session; read once when none is kept yet. */
    status,
    /**
     * The models configured source `id` offers, its default model first, then the others its source
     * lists, a CLI's own default only when it is the source's default, as kept for the session; read
     * once when none is kept yet. Throws `not-found` for a source the list does not hold.
     */
    async models(id: string): Promise<HarnessSourceModels> {
      const entry = entryOf(id)
      if (entry === undefined) throw new CallError('not-found', '这个模型不在列表里')
      const { listed, error } = await (lists.get(id) ?? readList(entry))
      const own = listed.find((model) => model.id === entry.model) ?? { id: entry.model, efforts: defaultEfforts(entry) }
      return {
        source: id,
        // A CLI's own default model ('') is offered only as the source's default, never beside a concrete one.
        models: [own, ...listed.filter((model) => model.id !== entry.model && model.id !== '')].slice(0, MAX_LISTED),
        ...(error === undefined ? {} : { error }),
      }
    },
  }
}

export type SourceModels = ReturnType<typeof createSourceModels>
