import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type {
  AuthorCandidate, ProjectSummary, Watch, WatchAuthorSuggestion, WatchFields,
  WatchSuggestionResult,
} from '../../shared/contract.js'
import { author, project, watch } from '../ipc.js'
import { useToast, useVaultRevision } from '../shell/AppShell.js'
import { useMessages } from '../messages/useMessages.js'
import { AddAction } from '../components/AddAction.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { EmptyState } from '../components/EmptyState.js'
import { InlineDraftInput } from '../components/InlineDraftInput.js'
import { StructuredList, StructuredRow } from '../components/StructuredList.js'
import { FormInput, FormSelect } from '../components/FormControls.js'
import { PageError, SectionHeading } from '../components/PageShell.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import './shell.css'
import './Watches.css'

/** Two groups of followers in push settings. */
const GROUPS: Watch['type'][] = ['topic', 'author']

type SuggestionSource = 'focus' | 'project'

/** A suggested author's key: its identity when the source knows one, otherwise its name. */
const suggestedAuthorKey = (item: WatchAuthorSuggestion): string => (
  'id' in item ? `${item.source}:${item.id}` : `name:${item.name}`
)

/**
 * A group of concerns: There is a plus sign on the right side of the title. Click it to create a new line at the end of this group of lists.
 * `adding` is the line being filled in: the placeholder is wearing `.wrow` clothes, and the input box inside is drawn and handed in by the caller.
 */
function WatchGroup({ type, watches, add, editor, onOpen, onEdit, onSetActive, onRemove }: {
  type: Watch['type']
  watches: Watch[]
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
      <SectionHeading variant="group" className="flexh">{m.shell.watchKind[type]}
        <AddAction variant="section" ref={add} title={m.watches.add(m.shell.watchKind[type])} onClick={onOpen}>{m.shell.watchKind[type]}</AddAction>
      </SectionHeading>
      {watches.length === 0 && editor === undefined
        ? <EmptyState variant="section">{m.watches.empty(m.shell.watchKind[type])}</EmptyState>
        : (
          <StructuredList className="wlist">
            {watches.map((w) => (editor?.id === w.id
              ? (
                <StructuredRow className="wrow editrow" data-w={w.id} key={w.id} rowRef={editor.row}>
                  {editor.input}
                </StructuredRow>
              )
              : (
                <StructuredRow className="wrow" data-w={w.id} key={w.id}>
                  <span className="nm">{w.name}</span>
                  {w.type === 'author'
                    ? (
                      <span
                        className={`author-id-state${w.identity === undefined ? ' unconfirmed' : ''}`}
                        title={w.identity?.affiliations.join(' · ') || m.watches.identityUnknown}
                      >{w.identity?.affiliations[0] || m.watches.identityUnconfirmed}</span>
                    )
                    : null}
                  {w.active ? null : <span className="src">{m.watches.paused}</span>}
                  <button className="btn" onClick={() => onEdit(w)}>{m.common.edit}</button>
                  <button className="btn" onClick={() => onSetActive(w)}>{w.active ? m.watches.pause : m.watches.resume}</button>
                  <ConfirmDialog
                    trigger={<button className="btn">{m.common.remove}</button>}
                    title={m.watches.confirmRemove(w.name)}
                    confirmLabel={m.watches.confirmRemoveLabel} onConfirm={() => onRemove(w.id)}
                  />
                </StructuredRow>
              ))) }
            {editor === undefined || editor.id !== undefined
              ? null
              : <StructuredRow className="wrow newrow" rowRef={editor.row}>{editor.input}</StructuredRow>}
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
  const [watches, setWatches] = useState<Watch[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [suggestionSource, setSuggestionSource] = useState<SuggestionSource>('focus')
  const [focus, setFocus] = useState('')
  const [projectId, setProjectId] = useState('')
  const [suggestions, setSuggestions] = useState<WatchSuggestionResult | null>(null)
  const [hadSuggestions, setHadSuggestions] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [addingSuggestion, setAddingSuggestion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The space occupied is held by the whole screen, and "only one is open at the same time" can control two groups; if each group holds it by itself, no one can remove the opponent's one.
  const [editor, setEditor] = useState<{ type: Watch['type']; id?: string } | null>(null)
  const [name, setName] = useState('')
  const [authorMatches, setAuthorMatches] = useState<AuthorCandidate[]>([])
  const [authorSearching, setAuthorSearching] = useState(false)
  const [authorSearchError, setAuthorSearchError] = useState<string | null>(null)
  const [authorSearchNonce, setAuthorSearchNonce] = useState(0)
  const authorSearchRevision = useRef(0)
  const row = useRef<HTMLDivElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const addTopic = useRef<HTMLButtonElement>(null)
  const addAuthor = useRef<HTMLButtonElement>(null)
  const suggestionRequest = useRef(0)
  // Both + are considered "within the placeholder": if you remove the placeholder first when clicking on the + in another group, the layout will jump and the mouseup will not return.
  // That button is now white-spotted - the previous placeholder is gone, but the new group has not been opened.
  const triggers = useMemo(() => [addTopic, addAuthor], [])

  const toast = useToast()
  const { revision } = useVaultRevision()
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const write = useVaultWrite()

  const stop = useCallback(() => {
    authorSearchRevision.current += 1
    setEditor(null)
    setName('')
    setAuthorMatches([])
    setAuthorSearching(false)
    setAuthorSearchError(null)
  }, [])
  useEffect(() => {
    void watch.list().then(setWatches).catch(reportError)
    void project.list().then((items) => {
      setProjects(items)
      setProjectId((current) => current || items[0]?.id || '')
    }).catch(reportError)
  }, [revision, reportError])

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
        setAuthorMatches(matches)
        setAuthorSearching(false)
      }).catch((caught: Error) => {
        if (request !== authorSearchRevision.current) return
        setAuthorMatches([])
        setAuthorSearching(false)
        setAuthorSearchError(caught.message)
      })
    }, 700)
    return () => { window.clearTimeout(timer) }
  }, [authorSearchNonce, editor, name, watches])

  /** Create a new follow. If it is written well, it will return true; if it is written incorrectly, it will report an error and return false. */
  const create = (fields: WatchFields): Promise<boolean> => write(watch.create(fields),
    { note: m.watches.notices.added, notify: toast })

  /** Save the current placeholder: Keep the original attention and existing push when editing, and add one when creating a new one. */
  const persist = (fields: WatchFields): Promise<boolean> => editor?.id === undefined
    ? create(fields)
    : write(watch.update(editor.id, fields), {
      note: m.watches.notices.updated, notify: toast,
    })

  /**
   * Click the plus sign of a certain group: the placeholder is opened to this group, and the one opened in the other group is closed together with the words in it;
   * Only the input box that has been opened in this group returns the focus.
   */
  const open = (type: Watch['type']) => {
    if (editor?.type === type && editor.id === undefined) {
      nameInput.current?.focus()
      return
    }
    setEditor({ type })
    setName('')
    setAuthorSearchNonce(0)
  }

  const edit = (item: Watch) => {
    setEditor({ type: item.type, id: item.id })
    setName(item.name)
    setAuthorMatches([])
    setAuthorSearchError(null)
    setAuthorSearchNonce(0)
  }

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
      notify: toast,
    })
  }

  const remove = (id: string) => {
    void write(watch.delete(id), { note: m.watches.notices.removed, notify: toast })
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
        setSuggestionError(caught instanceof Error ? caught.message : String(caught))
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
        ref={nameInput} className="inedit" scopeRef={row} triggers={triggers}
        placeholder={m.shell.watchKind.topic} onCancel={stop}
        onSubmit={(next) => persist({ type: 'topic', name: next })}
        value={name} onChange={(e) => setName(e.target.value)}
      />
    )
    : (
      <div className="author-resolver">
        <InlineDraftInput
          ref={nameInput} className="inedit" scopeRef={row} triggers={triggers}
          placeholder={m.watches.authorNamePlaceholder} onCancel={stop}
          onSubmit={() => false}
          value={name} onChange={(e) => { setName(e.target.value); setAuthorSearchNonce(0) }}
        />
        {editingWatch?.type === 'author' && editingWatch.identity !== undefined
          && name.trim() === editingWatch.name && authorSearchNonce === 0
          ? (
            <div className="author-search-note author-current">
              <span>
                {m.watches.currentIdentity(editingWatch.identity.affiliations.join(' · ') || m.watches.noAffiliation)}
              </span>
              <button className="btn plain" onClick={() => setAuthorSearchNonce((value) => value + 1)}>
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
                  <div className="author-search-note error">
                    <span>{authorSearchError}</span>
                    <button className="btn plain" onClick={() => setAuthorSearchNonce((value) => value + 1)}>
                      {m.common.retry}
                    </button>
                  </div>
                )
                : authorMatches.length === 0
                  ? <div className="author-search-note">{m.watches.noMatches}</div>
                  : (
                    <div className="author-matches">
                      {authorMatches.map((candidate) => (
                        <div className="author-match" key={candidate.id}>
                          <div className="author-match-copy">
                            <strong>{candidate.name}</strong>
                            <span>{candidate.affiliations.join(' · ') || m.watches.noAffiliation}</span>
                            <small>
                              {m.watches.candidateInfo(candidate.paperCount, candidate.citationCount, candidate.hIndex)}
                            </small>
                          </div>
                          <button className="btn" onClick={() => chooseAuthor(candidate)}>
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
      <PageError error={error} />
      {GROUPS.map((type) => (
        <WatchGroup
          key={type} type={type} watches={watches.filter((w) => w.type === type)}
          add={type === 'topic' ? addTopic : addAuthor} onOpen={() => open(type)} onEdit={edit}
          editor={editor?.type !== type || editorInput === null
            ? undefined : { ...(editor.id === undefined ? {} : { id: editor.id }), row, input: editorInput }}
          onSetActive={setActive} onRemove={remove}
        />
      ))}

      <section className="watch-suggestions">
        <div className="af-h">{m.watches.suggestHeading}</div>
        <div className="watch-suggestion-source" role="group" aria-label={m.watches.sourceLabel}>
          <button
            className={`btn${suggestionSource === 'focus' ? ' on' : ''}`}
            aria-pressed={suggestionSource === 'focus'}
            onClick={() => changeSuggestionSource('focus')}
          >{m.watches.sourceFocus}</button>
          <button
            className={`btn${suggestionSource === 'project' ? ' on' : ''}`}
            aria-pressed={suggestionSource === 'project'}
            onClick={() => changeSuggestionSource('project')}
          >{m.watches.sourceProject}</button>
        </div>
        <div className="af-in">
          {suggestionSource === 'focus'
            ? (
              <FormInput
                appearance="field" placeholder={m.watches.focusPlaceholder} autoComplete="off"
                value={focus} maxLength={500} onChange={(event) => {
                  setFocus(event.target.value)
                  clearSuggestionResults()
                }}
                onKeyDown={(event) => { if (event.key === 'Enter') void suggest() }}
              />
            )
            : (
              <FormSelect
                appearance="field" aria-label={m.watches.projectLabel}
                value={projectId} onChange={(event) => {
                  setProjectId(event.target.value)
                  clearSuggestionResults()
                }}
              >
                {projects.length === 0 ? <option value="">{m.watches.noProjects}</option> : null}
                {projects.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </FormSelect>
            )}
          <button
            className="btn pri" disabled={suggesting || addingSuggestion !== null
              || (suggestionSource === 'focus' ? focus.trim().length < 3 : projectId === '')}
            onClick={() => { void suggest() }}
          >{suggesting ? m.watches.suggesting : m.watches.suggestAction}</button>
        </div>
        {suggestionError === null
          ? null : <div className="watch-suggestion-error" role="alert">{suggestionError}</div>}
        {suggestions === null || suggesting ? null : (
          <div className="watch-suggestion-results">
            {suggestions.topics.length + suggestions.authors.length === 0
              ? <div className="ph2">{hadSuggestions ? m.watches.allAdded : m.watches.noneSuggested}</div>
              : (
                <>
                  <div className="ph2">
                    {m.watches.suggestionBasis(suggestions.paperCount)}
                    {suggestions.stale === true ? ` · ${m.watches.suggestionStale}` : ''}
                  </div>
                  {suggestions.topics.length === 0 ? null : (
                    <section className="watch-suggestion-group">
                      <div className="watch-suggestion-group-heading">
                        <strong>{m.watches.topicSuggestions}</strong>
                        {suggestions.topics.length > 1
                          ? (
                            <button
                              className="btn plain" disabled={addingSuggestion !== null}
                              onClick={() => { void addAllSuggestedTopics() }}
                            >{m.watches.addAllTopics}</button>
                          )
                          : null}
                      </div>
                      <StructuredList variant="embedded" className="watch-suggestion-list">
                        {suggestions.topics.map((item) => (
                          <StructuredRow className="watch-suggestion-row" key={item.name}>
                            <div className="watch-suggestion-copy">
                              <span className="nm">{item.name}</span>
                              <span>{m.watches.relatedPapers(item.relatedPapers)}</span>
                            </div>
                            <button
                              className="btn" disabled={addingSuggestion !== null}
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
                              <span className="nm">{item.name}</span>
                              <span>{'id' in item
                                ? m.watches.suggestedAuthorInfo(item.relatedPapers, item.hIndex, item.citationCount)
                                : m.watches.relatedPapers(item.relatedPapers)}</span>
                            </div>
                            <button
                              className="btn" disabled={addingSuggestion !== null}
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
