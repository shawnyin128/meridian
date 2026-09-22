import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChatMessage, PaperRow, ProjectSummary, WikiAggregationCard,
} from '../../shared/contract.js'
import { chat, feed, idea as ideaApi, papers, project, wiki } from '../ipc.js'
import {
  useBanner, useChatSession, useCrumbTail, useJump, useToast, useVaultRevision,
  type CrumbSeg,
} from '../shell/AppShell.js'
import { dnum } from '../../shared/dates.js'
import { useFormat, type Format } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import type { Catalog } from '../messages/catalog.js'
import { ChatMessageView, plain } from '../components/chat/ChatMessage.js'
import { shortTitle } from '../lib/paper-title.js'
import { FOCUS_KEY } from '../../shared/project-signals.js'
import { PickerPopover } from '../components/PickerPopover.js'
import { FormInput } from '../components/FormControls.js'
import {
  PageBody, PageError, PageFooter, PageHeader, PageShell, PageTitle,
} from '../components/PageShell.js'
import { useCandidateKeys } from '../hooks/useCandidateKeys.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { CONFLICT_THREAD } from '../lib/chat.js'
import { IdeaEditorDialog } from '../components/ideas/IdeaEditorDialog.js'
import { GenerationControl } from '../components/GenerationControl.js'
import './shell.css'
import '../components/chat/Chat.css'

/** The mentionEntities:`@` of demo brings so many papers that have been recently added to the database. */
const MENTION_PAPERS = 5
/** The mentionUI of the demo: Each group can list up to this many items. */
const MENTION_PER_GROUP = 4
/** The renderQuickMentions of the demo: the shortcut `@` above the input box takes so many projects and papers. */
const QUICK_MENTIONS = 2

/** `@` is a candidate in the drop-down list, `entity` is the one in the library, and the answer template takes fields from it. */
type Mention =
  | { kind: 'project'; title: string; meta: string; entity: ProjectSummary }
  | { kind: 'paper'; title: string; meta: string; entity: PaperRow }
  | { kind: 'page'; title: string; meta: string; entity: WikiAggregationCard }

/**
 * `@` Entities that can be referenced are the same as demo's mentionEntities: the project is ranked first according to the latest advancement, followed by the library
 * The first few papers, and then every page of the wiki. The name of the paper is only the part before the colon of the title.
 */
function mentionsOf(
  projects: ProjectSummary[], rows: PaperRow[], pages: WikiAggregationCard[], fmt: Format, m: Catalog,
): Mention[] {
  const advanced = (p: ProjectSummary) => {
    const last = p.recentEvents.at(-1)
    return last === undefined ? 0 : dnum(last.date)
  }
  return [
    ...[...projects].sort((a, b) => advanced(b) - advanced(a)).map((p): Mention => ({
      kind: 'project', title: p.name,
      meta: `${p.status} · ${m.project.identity.focusLabel[FOCUS_KEY[p.status]]}:${p.focus}`, entity: p,
    })),
    ...rows.map((p): Mention => ({
      kind: 'paper',
      title: shortTitle(p.title),
      meta: p.year === undefined ? p.readState : `${p.year} · ${p.readState}`,
      entity: p,
    })),
    ...pages.map((p): Mention => ({
      kind: 'page', title: p.title, meta: `${p.kindLabel} · ${m.common.updatedOn(fmt.date(p.updated))}`, entity: p,
    })),
  ]
}

/**
 * `@` pulls down the candidates in this column at this moment, the same as the mentionUI of the demo: the words typed after `@` will appear in the name or the line of gray words
 * Even if it hits, a maximum of MENTION_PER_GROUP will be left in each group.
 */
function hitsOf(typed: string, all: Mention[]): Mention[] {
  const needle = typed.slice(1).toLowerCase()
  const perGroup: Record<string, number> = {}
  return all
    .filter((m) => !needle || m.title.toLowerCase().includes(needle) || m.meta.toLowerCase().includes(needle))
    .filter((m) => {
      perGroup[m.kind] = (perGroup[m.kind] ?? 0) + 1
      return perGroup[m.kind]! <= MENTION_PER_GROUP
    })
}

/** Persistent conversation UI. Core owns context and writes; each explicit send runs one Harness turn. */
export function Chat() {
  const fmt = useFormat()
  const m = useMessages()
  const { id, title, archived, select } = useChatSession()
  const { jump } = useJump()
  const { revision, bump } = useVaultRevision()
  const banner = useBanner()
  const toast = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [mentioning, setMentioning] = useState(false)
  const [savingIdea, setSavingIdea] = useState(false)
  const [sending, setSending] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [rows, setRows] = useState<PaperRow[]>([])
  const [pages, setPages] = useState<WikiAggregationCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const stream = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLInputElement>(null)
  const consumed = useRef(0)
  const sendAttempt = useRef(0)
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const write = useVaultWrite()

  useEffect(() => {
    void project.list().then(setProjects).catch(reportError)
    void papers.list({ page: 1, size: MENTION_PAPERS }).then((r) => setRows(r.rows)).catch(reportError)
    void wiki.cards().then(setPages).catch(reportError)
  }, [revision, reportError])

  useEffect(() => {
    if (id === null) return
    void chat.messages(id).then(setMessages).catch(reportError)
  }, [id, revision, reportError])

  // The demo's add(): pulls the message flow to the end every time one is written.
  useEffect(() => { stream.current?.scrollTo?.({ top: stream.current.scrollHeight }) }, [messages])

  const mentions = useMemo(() => mentionsOf(projects, rows, pages, fmt, m), [projects, rows, pages, fmt, m])
  // Candidates are calculated based on the input and database at the current moment. Before the number is retrieved, it is empty at first. After returning, the drop-down will open by itself.
  const suggest = useMemo(() => (mentioning ? hitsOf(draft.trim(), mentions) : []), [mentioning, draft, mentions])

  const send = useCallback(async (session: string, text: string) => {
    const attempt = ++sendAttempt.current
    setSending(true)
    await write(chat.send(session, text))
    if (sendAttempt.current === attempt) setSending(false)
  }, [write])

  const stopSending = useCallback(() => {
    sendAttempt.current += 1
    setSending(false)
    if (id !== null) void chat.cancel(id)
  }, [id])

  // The conflict in the dynamic presentation: start a new session and lay out the default line from the demo as it is.
  // The remaining drop points are an existing conversation - the one in the global search point, just cut over it.
  useEffect(() => {
    if (jump === null || jump.seq === consumed.current) return
    consumed.current = jump.seq
    if (jump.target !== CONFLICT_THREAD) {
      select(jump.target)
      return
    }
    void chat.create(m.project.signals.kind.conflict, true).then(async (session) => {
      select(session.id)
      await send(session.id, m.chat.conflictQuestion)
    }).catch((e: Error) => toast(e.message))
  }, [jump, select, send, toast, m])

  const type = (value: string) => {
    setDraft(value)
    setMentioning(value.trim().startsWith('@'))
  }

  // cRes line of demo: replace the entire input with this reference
  const pick = (name: string) => {
    setDraft(`@${name} `)
    setMentioning(false)
    composer.current?.focus()
  }
  const keys = useCandidateKeys(suggest.length, (i) => pick(suggest[i]!.title))

  // Demo shortcut @: Replace the quote at the beginning and keep the ones that have been typed later.
  const quick = (name: string) => {
    setDraft(`@${name} ${draft.replace(/^@\S+\s*/, '')}`)
    composer.current?.focus()
  }

  const submit = () => {
    const v = draft.trim()
    if (v === '' || id === null || sending) return
    const mention = [...mentions].sort((a, b) => b.title.length - a.title.length)
      .find((m) => v.toLowerCase().startsWith(`@${m.title}`.toLowerCase()))
    if (v.startsWith('@') && mention === undefined) { setMentioning(true); return }
    setDraft('')
    setMentioning(false)
    void send(id, v)
  }

  const act = (message: ChatMessage) => {
    if (id === null) return
    void chat.recordAction(id, message.id).then(async (p) => {
      banner(m.chat.recordedNote(p.name))
      await feed.append({ source: 'steward', body: { kind: 'runs', runs: [
        plain(m.chat.recordedTo(p.name)),
      ] } })
      bump()
    }).catch((e: Error) => toast(e.message))
  }
  const hasDiscussion = messages.some((message) => message.role === 'you')

  // The archived conversation is not in the sidebar column. After entering it, there is no difference between it and other conversations on the screen. The breadcrumbs are marked with a sentence.
  const tail = useMemo<CrumbSeg[]>(
    () => (title === null ? [] : [{ text: archived ? m.chat.archivedSuffix(title) : title }]),
    [title, archived, m])
  useCrumbTail(tail)

  return (
    <PageShell className="chatcol">
      <PageHeader><PageTitle>{title ?? m.chat.newChat}</PageTitle></PageHeader>

      <PageBody>
        <div className="stream">
          <PageError error={error} />

          <div className="msgs" ref={stream}>
            {messages.map((msg) => (
              <ChatMessageView key={msg.id} message={msg} onAct={() => act(msg)} />
            ))}
          </div>
        </div>
      </PageBody>

      <PageFooter bare>
        <div className="composer">
          <div className="mwrap">
            <div className="qacts">
              <button
                className="qa" id="qaIdea" disabled={id === null || !hasDiscussion}
                title={hasDiscussion ? m.chat.saveIdea : m.chat.saveIdeaDisabled}
                onClick={() => setSavingIdea(true)}
              >{m.chat.saveIdeaLabel}</button>
              <span className="qsep" />
              <span id="qmChips">
                {[
                  ...mentions.filter((mention) => mention.kind === 'project').slice(0, QUICK_MENTIONS),
                  ...mentions.filter((mention) => mention.kind === 'paper').slice(0, QUICK_MENTIONS),
                ].map((mention) => (
                  <button
                    className="qa" key={mention.title}
                    title={m.chat.quickMentionTitle(m.chat.mentionGroup[mention.kind], mention.meta)}
                    onClick={() => quick(mention.title)}
                  >@{mention.title}</button>
                ))}
              </span>
            </div>

            <PickerPopover
              open={suggest.length > 0} onOpenChange={(open) => { if (!open) setMentioning(false) }}
              contentClassName="pickhits cres" contentId="cRes" side="top" align="center" sideOffset={6}
              anchor={(
                <div className="cbox" id="cbox">
                  <FormInput
                    id="composer" ref={composer} value={draft} autoComplete="off"
                    placeholder={m.chat.composerPlaceholder} disabled={sending}
                    onChange={(e) => type(e.target.value)}
                    onKeyDown={(e) => {
                      keys.onKeyDown(e)
                      if (e.key === 'Enter' && suggest.length === 0) submit()
                    }}
                  />
                  <GenerationControl
                    className="send" id="sendBtn" running={sending} onStart={submit} onStop={stopSending}
                  />
                </div>
              )}
              content={(
                <>
                  <div className="rh">{m.chat.mentionPickerHeading}</div>
                  {suggest.map((hit, at) => (
                    <Fragment key={`${hit.kind}${hit.title}`}>
                      {suggest[at - 1]?.kind === hit.kind
                        ? null
                        : <div className="rg">{m.chat.mentionGroup[hit.kind]}</div>}
                      <div className={at === keys.active ? 'rrow on' : 'rrow'} onClick={() => pick(hit.title)}>
                        <div className="rt">@{hit.title}</div>
                        <div className="rm">{hit.meta}</div>
                      </div>
                    </Fragment>
                  ))}
                </>
              )}
            />
          </div>
        </div>
      </PageFooter>

      {id === null ? null : (
        <IdeaEditorDialog
          open={savingIdea} sourceLabel={title ?? m.chat.currentChat} onOpenChange={setSavingIdea}
          onSubmit={(ideaTitle, body) => write(
            ideaApi.create(id, ideaTitle, body), { note: m.chat.ideaSavedNote },
          )}
        />
      )}
    </PageShell>
  )
}
