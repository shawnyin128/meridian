import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type {
  AuthorCandidate, AuthorSearchFailed, ProjectSummary, Watch, WatchAuthorSuggestion, WatchFields,
  WatchSuggestionResult,
} from '../../shared/contract.js'
import { author, project, watch } from '../ipc.js'
import { failureLabel, failureOf } from '../lib/failure-label.js'
import { useVaultRevision } from '../shell/AppShell.js'
import { useMessages } from '../messages/useMessages.js'
import { AddAction } from '../components/AddAction.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { EmptyState } from '../components/EmptyState.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { afterLeaving, InlineDraftInput } from '../components/InlineDraftInput.js'
import { RowActions, StructuredList, StructuredRow } from '../components/StructuredList.js'
import { IconButton } from '../components/IconButton.js'
import { IconPencil, IconTrash } from '../components/icons.js'
import { FormInput } from '../components/FormControls.js'
import { InlineMessage } from '../components/InlineMessage.js'
import { ChoicePicker } from '../components/FieldPickers.js'
import { PageError, SectionHeading } from '../components/PageShell.js'
import { SegmentedControl } from '../components/SegmentedControl.js'
import { Switch } from '../components/Switch.js'
import { Tag } from '../components/Tag.js'
import { useDraft } from '../hooks/useDrafts.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { composing } from '../lib/keyboard.js'
import { FadeText } from '../components/FadeText.js'
import './shell.css'
import './Watches.css'

/** The two groups of watches in the Inmail settings. */
const GROUPS: Watch['type'][] = ['topic', 'author']

type SuggestionSource = 'focus' | 'project'

/** A suggested author's key: its identity when the source knows one, otherwise its name. */
const suggestedAuthorKey = (item: WatchAuthorSuggestion): string => (
  'id' in item ? `${item.source}:${item.id}` : `name:${item.name}`
)

/**
 * One group of watches, with a plus button at the right of its heading that opens a new row at the
 * top of the group's list. `watches` is null until it is read, shown as loading unless the screen's
 * read `failed`. `editor` is the row being filled in: the draft row wears the `.wrow` styles, and
 * the caller renders and submits the input inside it.
 */
function WatchGroup({ type, watches, failed, add, editor, onOpen, onEdit, onSetActive, onRemove }: {
  type: Watch['type']
  watches: Watch[] | null
  failed: boolean
  add: RefObject<HTMLButtonElement | null>
  editor?: { id?: string; row: RefObject<HTMLDivElement | null>; input: ReactNode } | undefined
  onOpen: () => void
  onEdit: (watch: Watch) => void
  onSetActive: (watch: Watch) => void
  onRemove: (id: string) => void
}) {
  const m = useMessages()
  return (
    <>
      <SectionHeading
        variant="group"
        actions={<AddAction variant="section" ref={add} label={m.watches.add(m.shell.watchKind[type])} onClick={onOpen}>{m.shell.watchKind[type]}</AddAction>}
      >{m.shell.watchKind[type]}
      </SectionHeading>
      {watches === null
        ? (failed ? null : <LoadingPlaceholder shape="rows" count={2} />)
        : watches.length === 0 && editor === undefined
        ? <EmptyState variant="section">{m.watches.empty(m.shell.watchKind[type])}</EmptyState>
        : (
          <StructuredList className="wlist">
            {editor === undefined || editor.id !== undefined
              ? null
              : <StructuredRow className="wrow newrow" rowRef={editor.row}>{editor.input}</StructuredRow>}
            {watches.map((w) => (editor?.id === w.id
              ? (
                <StructuredRow className="wrow editrow" data-w={w.id} key={w.id} rowRef={editor.row}>
                  {editor.input}
                </StructuredRow>
              )
              : (
                <StructuredRow className="wrow" data-w={w.id} key={w.id}>
                  <span className="nm">{w.name}</span>
                  {w.type !== 'author' ? null : w.identity === undefined
                    ? <Tag tone="warn">{m.watches.identityUnconfirmed}</Tag>
                    : (
                      <FadeText className="author-id-state" label={w.identity.affiliations[0] || m.watches.identityUnconfirmed}>
                        {w.identity.affiliations[0] || m.watches.identityUnconfirmed}
                      </FadeText>
                    )}
                  {w.active ? null : <Tag className="watch-paused">{m.watches.paused}</Tag>}
                  <Switch label={w.name} checked={w.active} onChange={() => onSetActive(w)} />
                  <RowActions>
                    <IconButton label={m.common.edit} size="nested" onClick={() => onEdit(w)}><IconPencil /></IconButton>
                    <ConfirmDialog
                      trigger={<IconButton label={m.common.remove} size="nested" tone="danger"><IconTrash /></IconButton>}
                      title={m.watches.confirmRemove(w.name)} description={m.watches.confirmRemoveDescription}
                      confirmLabel={m.watches.confirmRemoveLabel} onConfirm={() => onRemove(w.id)}
                    />
                  </RowActions>
                </StructuredRow>
              ))) }
          </StructuredList>
        )}
    </>
  )
}

/**
 * Manages topic and author watches. Suggestions remain transient until the user adds one; Core
 * derives them from scholarly metadata or an existing project without calling the model Harness.
 */
export function WatchSettings() {
  const m = useMessages()
  const [listed, setListed] = useState<Watch[] | null>(null)
  const watches = useMemo(() => listed ?? [], [listed])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [suggestionSource, setSuggestionSource] = useState<SuggestionSource>('focus')
  const [keptFocus, setKeptFocus] = useDraft<string>(['watches'], 'focus')
  const focus = keptFocus ?? ''
  const setFocus = (next: string) => setKeptFocus(next === '' ? null : next)
  const [projectId, setProjectId] = useState('')
  const [suggestions, setSuggestions] = useState<WatchSuggestionResult | null>(null)
  const [hadSuggestions, setHadSuggestions] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null)
  // The screen, not each group, holds the draft row, so "only one open at a time" spans both groups:
  // if each group held its own, neither could close the other's.
  // The open draft row and its name are kept as a draft, and the row reopens with them.
  const [kept, setKept] = useDraft<{ type: Watch['type']; id?: string; name: string }>(['watches'], 'editor')
  const keptType = kept?.type
  const keptId = kept?.id
  const editor = useMemo(() => (keptType === undefined ? null
    : { type: keptType, ...(keptId === undefined ? {} : { id: keptId }) }), [keptType, keptId])
  const name = kept?.name ?? ''
  const setName = (next: string) => { if (kept !== null) setKept({ ...kept, name: next }) }
  const [authorMatches, setAuthorMatches] = useState<AuthorCandidate[]>([])
  const [authorSearching, setAuthorSearching] = useState(false)
  const [authorSearchError, setAuthorSearchError] = useState<string | AuthorSearchFailed | null>(null)
  const [authorSearchNonce, setAuthorSearchNonce] = useState(0)
  const authorSearchRevision = useRef(0)
  const row = useRef<HTMLDivElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const addTopic = useRef<HTMLButtonElement>(null)
  const addAuthor = useRef<HTMLButtonElement>(null)
  const suggestionRequest = useRef(0)
  // Both + buttons count as inside the draft row: if clicking the other group's + closed the draft
  // first, the layout would shift and the mouseup would miss the button, so the click would do
  // nothing: the old draft gone and the new group's not opened.
  const triggers = useMemo(() => [addTopic, addAuthor], [])

  const { revision } = useVaultRevision()
  const { error, load } = useScreenLoad()
  const write = useVaultWrite()

  const stop = useCallback(() => {
    authorSearchRevision.current += 1
    setKept(null)
    setAuthorMatches([])
    setAuthorSearching(false)
    setAuthorSearchError(null)
  }, [setKept])
  // A kept edit of a watch the list no longer holds is dropped.
  useEffect(() => {
    if (keptId !== undefined && listed !== null && !listed.some((item) => item.id === keptId)) setKept(null)
  }, [keptId, listed, setKept])
  useEffect(() => load('watches', watch.list(), setListed), [revision, load])
  useEffect(() => load('projects', project.list(), (items) => {
    setProjects(items)
    setProjectId((current) => current || items[0]?.id || '')
  }), [revision, load])

  useEffect(() => {
    const query = name.trim()
    const current = editor?.id === undefined ? undefined : watches.find((watch) => watch.id === editor.id)
    const unchangedConfirmed = current?.type === 'author' && current.identity !== undefined
      && query === current.name && authorSearchNonce === 0
    if (editor?.type !== 'author' || query.length < 2 || unchangedConfirmed) {
      setAuthorMatches([])
      setAuthorSearching(false)
      setAuthorSearchError(null)
      return
    }
    const request = ++authorSearchRevision.current
    setAuthorSearching(true)
    setAuthorSearchError(null)
    const timer = window.setTimeout(() => {
      void author.search(query).then((matches) => {
        if (request !== authorSearchRevision.current) return
        if (Array.isArray(matches)) setAuthorMatches(matches)
        else {
          setAuthorMatches([])
          setAuthorSearchError(matches)
        }
        setAuthorSearching(false)
      }).catch((caught: unknown) => {
        if (request !== authorSearchRevision.current) return
        setAuthorMatches([])
        setAuthorSearching(false)
        setAuthorSearchError(failureLabel(m, m.watches.authorSearchFailed, failureOf(caught)))
      })
    }, 700)
    return () => { window.clearTimeout(timer) }
  }, [authorSearchNonce, editor, name, watches])

  /** Creates a watch. Returns true when the write succeeds; on failure it reports the error and returns false. */
  const create = (fields: WatchFields): Promise<boolean> => write(watch.create(fields),
    { note: m.watches.notices.added })

  /** Saves the draft row: an edit updates the watch in place, keeping its delivered papers; a new row adds one. */
  const persist = (fields: WatchFields): Promise<boolean> => editor?.id === undefined
    ? create(fields)
    : write(watch.update(editor.id, fields), {
      note: m.watches.notices.updated,
    })

  const leaveDraft = useRef<(() => Promise<boolean>) | null>(null)

  /**
   * Clicks a group's plus button: the draft row opens in this group once the row open elsewhere has
   * saved the text typed in it, and a refused save keeps that row instead; if this group's draft is
   * already open, only its input gets focus back.
   */
  const open = (type: Watch['type']) => {
    if (editor?.type === type && editor.id === undefined) {
      nameInput.current?.focus()
      return
    }
    afterLeaving(leaveDraft, () => {
      setKept({ type, name: '' })
      setAuthorSearchNonce(0)
    })
  }

  const edit = (item: Watch) => afterLeaving(leaveDraft, () => {
    setKept({ type: item.type, id: item.id, name: item.name })
    setAuthorMatches([])
    setAuthorSearchError(null)
    setAuthorSearchNonce(0)
  })

  const chooseAuthor = (candidate: AuthorCandidate) => {
    void persist({
      type: 'author',
      name: candidate.name,
      identity: {
        source: candidate.source, id: candidate.id, affiliations: candidate.affiliations,
      },
    }).then((created) => { if (created) stop() })
  }

  const setActive = (w: Watch) => {
    const active = !w.active
    void write(watch.setActive(w.id, active), {
      note: active
        ? m.watches.notices.resumed
        : m.watches.notices.pausedNote,
    })
  }

  const remove = (id: string) => {
    void write(watch.delete(id), { note: m.watches.notices.removed })
  }

  const clearSuggestionResults = () => {
    suggestionRequest.current += 1
    setSuggestions(null)
    setHadSuggestions(false)
    setSuggestionError(null)
    setSuggesting(false)
  }

  const changeSuggestionSource = (source: SuggestionSource) => {
    setSuggestionSource(source)
    clearSuggestionResults()
  }

  const suggest = async () => {
    const input = suggestionSource === 'focus'
      ? { source: 'focus' as const, focus: focus.trim() }
      : { source: 'project' as const, projectId }
    if (input.source === 'focus' ? input.focus.length < 3 : input.projectId === '') return
    const request = ++suggestionRequest.current
    setSuggesting(true)
    setSuggestionError(null)
    setSuggestions(null)
    setHadSuggestions(false)
    try {
      const found = await watch.suggest(input)
      if (request !== suggestionRequest.current) return
      if ('kind' in found) {
        setSuggestionError(failureLabel(m, m.watches.suggestionFailed, found.reason))
        return
      }
      const watchedTopics = new Set(watches.filter((item) => item.type === 'topic')
        .map((item) => item.name.trim().toLocaleLowerCase()))
      const watchedAuthorIds = new Set(watches.flatMap((item) => (
        item.type === 'author' && item.identity !== undefined ? [item.identity.id] : []
      )))
      const watchedAuthorNames = new Set(watches.filter((item) => item.type === 'author')
        .map((item) => item.name.trim().toLocaleLowerCase()))
      const next = {
        ...found,
        topics: found.topics.filter((item) => !watchedTopics.has(item.name.toLocaleLowerCase())),
        authors: found.authors.filter((item) => (
          !('id' in item && watchedAuthorIds.has(item.id)) && !watchedAuthorNames.has(item.name.toLocaleLowerCase())
        )),
      }
      setSuggestions(next)
      setHadSuggestions(next.topics.length + next.authors.length > 0)
    } catch (caught) {
      if (request === suggestionRequest.current) {
        setSuggestionError(failureLabel(m, m.watches.suggestionFailed, failureOf(caught)))
      }
    } finally {
      if (request === suggestionRequest.current) setSuggesting(false)
    }
  }

  const addSuggestedTopic = async (name: string) => {
    const key = `topic:${name}`
    setAddingSuggestion(key)
    try {
      if (await create({ type: 'topic', name })) {
        setSuggestions((current) => current === null ? null : {
          ...current, topics: current.topics.filter((item) => item.name !== name),
        })
      }
    } finally {
      setAddingSuggestion(null)
    }
  }

  const addSuggestedAuthor = async (candidate: WatchAuthorSuggestion) => {
    const key = `author:${suggestedAuthorKey(candidate)}`
    setAddingSuggestion(key)
    try {
      if (await create({
        type: 'author', name: candidate.name,
        ...('id' in candidate ? {
          identity: { source: candidate.source, id: candidate.id, affiliations: candidate.affiliations },
        } : {}),
      })) {
        setSuggestions((current) => current === null ? null : {
          ...current,
          authors: current.authors.filter((item) => suggestedAuthorKey(item) !== suggestedAuthorKey(candidate)),
        })
      }
    } finally {
      setAddingSuggestion(null)
    }
  }

  const addAllSuggestedTopics = async () => {
    const topics = suggestions?.topics ?? []
    if (topics.length === 0) return
    setAddingSuggestion('topics')
    const added = new Set<string>()
    try {
      for (const topic of topics) {
        if (await create({ type: 'topic', name: topic.name })) added.add(topic.name)
      }
      setSuggestions((current) => current === null ? null : {
        ...current, topics: current.topics.filter((item) => !added.has(item.name)),
      })
    } finally {
      setAddingSuggestion(null)
    }
  }

  const editingWatch = editor?.id === undefined
    ? undefined : watches.find((item) => item.id === editor.id)
  const editorInput = editor === null ? null : editor.type === 'topic'
    ? (
      <InlineDraftInput
        ref={nameInput} className="inedit" scopeRef={row} triggers={triggers} leaveRef={leaveDraft}
        placeholder={m.shell.watchKind.topic} onCancel={stop}
        onSubmit={(next) => next === editingWatch?.name || persist({ type: 'topic', name: next })}
        value={name} onChange={(e) => setName(e.target.value)}
      />
    )
    : (
      <div className="author-resolver">
        <InlineDraftInput
          ref={nameInput} className="inedit" scopeRef={row} triggers={triggers} leaveRef={leaveDraft}
          placeholder={m.watches.authorNamePlaceholder} onCancel={stop}
          onSubmit={(next, leaving) => next === editingWatch?.name
            || (leaving && persist({ type: 'author', name: next }))}
          value={name} onChange={(e) => { setName(e.target.value); setAuthorSearchNonce(0) }}
        />
        {editingWatch?.type === 'author' && editingWatch.identity !== undefined
          && name.trim() === editingWatch.name && authorSearchNonce === 0
          ? (
            <div className="author-search-note author-current">
              <span>
                {m.watches.currentIdentity(editingWatch.identity.affiliations.join(' · ') || m.watches.noAffiliation)}
              </span>
              <button className="btn ghost sm" onClick={() => setAuthorSearchNonce((value) => value + 1)}>
                {m.watches.reconfirm}
              </button>
            </div>
          )
          : name.trim().length < 2
            ? null
            : authorSearching
              ? <div className="author-search-note">{m.watches.searching}</div>
              : authorSearchError !== null
                ? (
                  <div className="author-search-note">
                    <InlineMessage
                      tone="error" variant="line" className="author-search-error"
                      action={(
                        <button className="btn ghost sm" onClick={() => setAuthorSearchNonce((value) => value + 1)}>
                          {m.common.retry}
                        </button>
                      )}
                    >
                      {typeof authorSearchError === 'string'
                        ? authorSearchError
                        : failureLabel(m, m.watches.authorSearchFailed, authorSearchError.reason)}
                    </InlineMessage>
                  </div>
                )
                : authorMatches.length === 0
                  ? <EmptyState variant="section">{m.watches.noMatches}</EmptyState>
                  : (
                    <div className="author-matches">
                      {authorMatches.map((candidate) => (
                        <div className="author-match" key={candidate.id}>
                          <div className="author-match-copy">
                            <FadeText className="author-match-name" label={candidate.name}>{candidate.name}</FadeText>
                            <FadeText className="author-match-affiliations">
                              {candidate.affiliations.join(' · ') || m.watches.noAffiliation}
                            </FadeText>
                            <FadeText className="author-match-info">
                              {m.watches.candidateInfo(candidate.paperCount, candidate.citationCount, candidate.hIndex)}
                            </FadeText>
                          </div>
                          <button className="btn ghost sm" onClick={() => chooseAuthor(candidate)}>
                            {editor.id === undefined ? m.watches.follow : m.watches.choose}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
        {name.trim() !== '' && (editor.id === undefined || name.trim() !== editingWatch?.name
          || editingWatch?.type === 'author' && editingWatch.identity === undefined)
          ? (
            <div className="author-resolver-actions">
              <button
                className="btn" onClick={() => {
                  void persist({ type: 'author', name: name.trim() }).then((saved) => { if (saved) stop() })
                }}
              >{editor.id === undefined ? m.watches.saveByName : m.watches.saveUnconfirmed}</button>
            </div>
          )
          : null}
      </div>
    )

  return (
    <div className="watch-settings">
      <PageError error={error} variant="section" />
      {GROUPS.map((type) => (
        <WatchGroup
          key={type} type={type} watches={listed === null ? null : watches.filter((w) => w.type === type)}
          failed={error !== null}
          add={type === 'topic' ? addTopic : addAuthor} onOpen={() => open(type)} onEdit={edit}
          editor={editor?.type !== type || editorInput === null
            ? undefined : { ...(editor.id === undefined ? {} : { id: editor.id }), row, input: editorInput }}
          onSetActive={setActive} onRemove={remove}
        />
      ))}

      <section className="watch-suggestions">
        <div className="af-h">{m.watches.suggestHeading}</div>
        <SegmentedControl
          className="watch-suggestion-source" label={m.watches.sourceLabel} value={suggestionSource}
          options={[
            { value: 'focus', label: m.watches.sourceFocus },
            { value: 'project', label: m.watches.sourceProject },
          ]}
          onChange={changeSuggestionSource}
        />
        <div className="af-in">
          {suggestionSource === 'focus'
            ? (
              <FormInput
                appearance="field" placeholder={m.watches.focusPlaceholder} autoComplete="off"
                value={focus} maxLength={500} onChange={(event) => {
                  setFocus(event.target.value)
                  clearSuggestionResults()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !composing(event.nativeEvent)) void suggest()
                }}
              />
            )
            : (
              <ChoicePicker
                appearance="field" aria-label={m.watches.projectLabel} placeholder={m.watches.noProjects}
                value={projectId} options={projects.map((item) => item.id)} disabled={projects.length === 0}
                label={(id) => projects.find((item) => item.id === id)?.name ?? id}
                onPick={(id) => {
                  setProjectId(id)
                  clearSuggestionResults()
                }}
              />
            )}
          <button
            className="btn pri" disabled={suggesting || addingSuggestion !== null
              || (suggestionSource === 'focus' ? focus.trim().length < 3 : projectId === '')}
            onClick={() => { void suggest() }}
          >{suggesting ? m.watches.suggesting : m.watches.suggestAction}</button>
        </div>
        {suggestionError === null
          ? null : <InlineMessage tone="error" variant="line" className="watch-suggestion-error">{suggestionError}</InlineMessage>}
        {suggestions === null || suggesting ? null : (
          <div className="watch-suggestion-results">
            {suggestions.topics.length + suggestions.authors.length === 0
              ? <EmptyState variant="section">{hadSuggestions ? m.watches.allAdded : m.watches.noneSuggested}</EmptyState>
              : (
                <>
                  <div className="ph2">
                    {m.watches.suggestionBasis(suggestions.paperCount)}
                    {suggestions.stale === true ? <Tag tone="warn">{m.watches.suggestionStale}</Tag> : null}
                  </div>
                  {suggestions.topics.length === 0 ? null : (
                    <section className="watch-suggestion-group">
                      <div className="watch-suggestion-group-heading">
                        <strong>{m.watches.topicSuggestions}</strong>
                        {suggestions.topics.length > 1
                          ? (
                            <button
                              className="btn ghost sm" disabled={addingSuggestion !== null}
                              onClick={() => { void addAllSuggestedTopics() }}
                            >{m.watches.addAllTopics}</button>
                          )
                          : null}
                      </div>
                      <StructuredList variant="embedded" className="watch-suggestion-list">
                        {suggestions.topics.map((item) => (
                          <StructuredRow className="watch-suggestion-row" key={item.name}>
                            <div className="watch-suggestion-copy">
                              <FadeText className="nm" label={item.name}>{item.name}</FadeText>
                              <FadeText>{m.watches.relatedPapers(item.relatedPapers)}</FadeText>
                            </div>
                            <button
                              className="btn ghost sm" disabled={addingSuggestion !== null}
                              onClick={() => { void addSuggestedTopic(item.name) }}
                            >{m.watches.addAction}</button>
                          </StructuredRow>
                        ))}
                      </StructuredList>
                    </section>
                  )}
                  {suggestions.authors.length === 0 ? null : (
                    <section className="watch-suggestion-group">
                      <div className="watch-suggestion-group-heading">
                        <strong>{m.watches.authorSuggestions}</strong>
                      </div>
                      <StructuredList variant="embedded" className="watch-suggestion-list">
                        {suggestions.authors.map((item) => (
                          <StructuredRow className="watch-suggestion-row" key={suggestedAuthorKey(item)}>
                            <div className="watch-suggestion-copy">
                              <FadeText className="nm" label={item.name}>{item.name}</FadeText>
                              <FadeText>{'id' in item
                                ? m.watches.suggestedAuthorInfo(item.relatedPapers, item.hIndex, item.citationCount)
                                : m.watches.relatedPapers(item.relatedPapers)}</FadeText>
                            </div>
                            <button
                              className="btn ghost sm" disabled={addingSuggestion !== null}
                              onClick={() => { void addSuggestedAuthor(item) }}
                            >{m.watches.addAction}</button>
                          </StructuredRow>
                        ))}
                      </StructuredList>
                    </section>
                  )}
                </>
              )}
          </div>
        )}
      </section>
    </div>
  )
}
