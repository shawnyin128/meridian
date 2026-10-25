import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  BUILT_IN_COLOUR_THEMES, COLOUR_THEME_SCHEMA, DEFAULT_COLOUR_THEME, contrastShortfalls, deriveColourTokens,
  deriveDarkModules, type ColourMode, type ColourModule,
} from '../../../shared/colour-theme.js'
import type { ColourTheme, ColourThemeModules } from '../../../shared/contract.js'
import { colourThemes } from '../../ipc.js'
import { errorLabel } from '../../lib/failure-label.js'
import { colourThemeId } from '../../lib/slug.js'
import { useMessages } from '../../messages/useMessages.js'
import { readColourThemePreference, setColourThemePreference } from '../../shell/appearance.js'
import { useColourThemeFiles, useColourThemes } from '../../shell/useColourThemes.js'
import { useScrollFade } from '../../hooks/useScrollFade.js'
import { BackButton } from '../BackButton.js'
import { Card } from '../Card.js'
import { ChoicePicker } from '../FieldPickers.js'
import { ColourField, FormInput } from '../FormControls.js'
import { Icon } from '../icons.js'
import { ModalTitle } from '../ModalDialog.js'
import { NavRow } from '../NavRow.js'
import { SectionHeading } from '../PageShell.js'
import { SegmentedControl } from '../SegmentedControl.js'
import { Swatches } from '../Swatches.js'
import { Switch } from '../Switch.js'
import { Tag } from '../Tag.js'
import { useColourThemeName } from './AppearanceSettings.js'
import { ServiceActions, ServiceError, ServiceFoot } from './ServiceCard.js'
import { Button } from '../Button.js'
import { CommitActions } from '../CommitActions.js'
import './ThemeEditor.css'

/** The modules in the left column, in groups that sit apart: surfaces, text, accents, states. */
const GROUPS: readonly (readonly ColourModule[])[] = [
  ['ground', 'sidebar', 'card', 'field', 'separator'],
  ['ink', 'inkSecondary', 'inkTertiary'],
  ['accent', 'highlight'],
  ['error', 'warning', 'done'],
]
const MODULES = GROUPS.flat()

/** What the editor edits of a theme: all but its schema and its id. */
type Draft = Pick<ColourTheme, 'name' | 'basedOn' | 'light' | 'dark'>

const draftOf = ({ name, basedOn, light, dark }: ColourTheme): Draft =>
  ({ name, ...(basedOn === undefined ? {} : { basedOn }), light, dark })

const same = (a: Draft, b: Draft): boolean => a.name === b.name && a.basedOn === b.basedOn
  && MODULES.every((key) => a.light[key] === b.light[key] && a.dark[key] === b.dark[key])

/**
 * The editor's state. `id` is null until a new theme is first saved; `loaded` is the draft as last
 * read from or written to its file, and `outside` whether that file changed outside the App since.
 */
type Form = { id: string | null; draft: Draft; loaded: Draft; outside: boolean; saved: boolean }

const formOf = (id: string | null, draft: Draft): Form => ({ id, draft, loaded: draft, outside: false, saved: false })

/** A stroke glyph of the sidebar's, for a preview row. */
const Glyph = ({ d }: { d: string }) => <span className="ic"><Icon><path d={d} /></Icon></span>

/**
 * A screen of the App drawn with one mode of a theme: the colour tokens derived from `modules` are set
 * on its own box, so only the preview changes. It holds the App's own components and takes no input.
 */
function ThemePreview({ modules, mode }: { modules: ColourThemeModules; mode: ColourMode }) {
  const m = useMessages()
  const sample = m.settings.appearance.editor.preview
  const legend = m.project.graph.legend
  const style = useMemo(() => ({ ...deriveColourTokens(modules, mode), colorScheme: mode }) as CSSProperties, [modules, mode])
  const ignore = () => undefined
  return (
    <div className="theme-preview" style={style} inert aria-hidden="true">
      <div className="theme-preview-side">
        <NavRow className="srow on" onActivate={ignore}><Glyph d="M22 12h-4l-3 8L9 4l-3 8H2" />{m.shell.nav.feed}</NavRow>
        <div className="sb-h">{m.shell.nav.myLibrary}</div>
        <NavRow className="srow" onActivate={ignore}><Glyph d="M12 2L2 7l10 5 10-5-10-5z" />{m.shell.nav.wiki}</NavRow>
        <NavRow className="srow" onActivate={ignore}>
          <Glyph d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />{m.shell.nav.papers}
        </NavRow>
        <NavRow className="srow" onActivate={ignore}><Glyph d="M4 6h8M9 12h11M6 18h9" />{m.shell.nav.overview}</NavRow>
      </div>
      <div className="theme-preview-canvas">
        <Card>
          <div className="theme-preview-title">{sample.title}</div>
          <div className="theme-preview-tags">
            <Tag shape="chip">{sample.topic}</Tag>
            <Tag state="error">{legend.failed}</Tag>
            <Tag state="warning">{legend.needsRepair}</Tag>
            <Tag state="done">{legend.verified}</Tag>
          </div>
          <p className="theme-preview-body">{sample.body} <span className="theme-preview-mark">{sample.highlight}</span></p>
          <p className="theme-preview-meta">{sample.meta}</p>
        </Card>
        <div className="theme-preview-controls">
          <FormInput className="theme-preview-field" placeholder={m.shell.search.placeholder} readOnly />
          <Switch checked onChange={ignore} label={m.settings.categories.delivery} />
          <Button size="regular" className="theme-preview-focus">{m.inbox.actions.readLater}</Button>
          <Button size="regular" variant="primary">{m.inbox.actions.download}</Button>
        </div>
      </div>
    </div>
  )
}

/**
 * The theme editor of the Appearance pane, in place of the Settings columns: the modules on the left,
 * the name, the theme it is based on, a live preview of the mode being edited and the picked
 * module's colour on the right. Save writes `<config home>/themes/<id>.json` and makes it the App's
 * theme. When that file changes outside the App, the editor reads it again while it holds no
 * unsaved edits, and otherwise keeps them and marks the file changed. `theme` is the custom theme
 * to edit, or null for a new one, which starts from the theme in use; the back button calls
 * `onBack`, and `onDirtyChange` hears whether the editor holds unsaved edits, false once it unmounts.
 */
export function ThemeEditor({ theme, onBack, onDirtyChange }: {
  theme: ColourTheme | null
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const m = useMessages()
  const t = m.settings.appearance.editor
  const themes = useColourThemes()
  const { files, refresh } = useColourThemeFiles()
  const name = useColourThemeName()
  const [form, setForm] = useState<Form>(() => {
    if (theme !== null) return formOf(theme.id, draftOf(theme))
    const start = themes.find((candidate) => candidate.id === readColourThemePreference()) ?? DEFAULT_COLOUR_THEME
    return formOf(null, { name: '', basedOn: start.id, light: start.light, dark: start.dark })
  })
  const [mode, setMode] = useState<ColourMode>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))
  const [module, setModule] = useState<ColourModule>('ground')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sideFade = useScrollFade('y')
  const bodyFade = useScrollFade('y')
  const { draft } = form
  const colours = draft[mode]
  const dirty = !same(draft, form.loaded)
  const weak = useMemo(() => new Set(contrastShortfalls(colours, mode).map((shortfall) => shortfall.module)), [colours, mode])
  const bases = themes.filter((candidate) => candidate.id !== form.id)
  const base = themes.find((candidate) => candidate.id === draft.basedOn) ?? DEFAULT_COLOUR_THEME

  // The file as last listed: undefined while there is none to follow, null while it is missing or unreadable.
  const disk = useMemo(() => {
    if (form.id === null || files === null) return undefined
    const file = files.find((entry) => entry.file === `${form.id}.json`)
    return file?.state === 'readable' ? file.theme : null
  }, [files, form.id])
  const listed = useRef(disk)
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])
  useEffect(() => {
    const previous = listed.current
    listed.current = disk
    if (previous === undefined || disk === undefined || disk === previous) return
    setForm((held) => {
      if (disk !== null && same(draftOf(disk), held.loaded)) return held
      if (disk !== null && same(held.draft, held.loaded)) return formOf(held.id, draftOf(disk))
      return { ...held, outside: true }
    })
  }, [disk])

  const change = (next: Partial<Draft>) => setForm((held) => ({ ...held, draft: { ...held.draft, ...next }, saved: false }))
  const paint = (value: string) => change({ [mode]: { ...colours, [module]: value } })
  const swatches = [...BUILT_IN_COLOUR_THEMES.reduce((found, builtIn) => {
    const value = builtIn[mode][module]
    return found.has(value) ? found : found.set(value, builtIn)
  }, new Map<string, ColourTheme>())]

  const save = async () => {
    const sent = draft
    const id = form.id ?? colourThemeId(sent.name, [
      ...BUILT_IN_COLOUR_THEMES.map((builtIn) => builtIn.id), ...(files ?? []).map((file) => file.file.replace(/\.json$/, '')),
    ])
    const written: Draft = { ...sent, name: sent.name.trim() }
    const next: ColourTheme = { schema: COLOUR_THEME_SCHEMA, id, ...written }
    setSaving(true)
    setError(null)
    try {
      await colourThemes.save(next)
      setColourThemePreference(next)
      await refresh()
      setForm((held) => (held.draft === sent
        ? { ...formOf(id, written), saved: true }
        : { ...held, id, loaded: written, outside: false }))
    } catch (caught) {
      setError(errorLabel(m, caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="set-side theme-modules" ref={sideFade} data-fade-paint="">
        <div className="theme-editor-title">
          <BackButton onClick={onBack} />
          <ModalTitle className="set-t">{m.settings.appearance.themeHeading}</ModalTitle>
        </div>
        {GROUPS.map((keys) => (
          <div className="theme-module-group" key={keys[0]}>
            {keys.map((key) => (
              <NavRow
                key={key} className="srow theme-module" selected={key === module} data-module={key}
                onActivate={() => setModule(key)}
              >
                <span className="ic"><span className="theme-module-swatch" style={{ backgroundColor: colours[key] }} /></span>
                <span className="theme-module-name">{t.modules[key]}</span>
                {weak.has(key) ? <Tag state="warning" className="n">{t.lowContrast}</Tag> : null}
              </NavRow>
            ))}
          </div>
        ))}
      </div>

      <div className="set-main theme-editor">
        <div className="set-head theme-editor-head">
          <FormInput
            className="theme-editor-name" value={draft.name} placeholder={t.name} aria-label={t.name} maxLength={80}
            onChange={(event) => change({ name: event.target.value })}
          />
          <span className="theme-editor-base">
            {t.basedOn}
            <ChoicePicker
              appearance="field" className="theme-editor-base-picker" aria-label={t.basedOn}
              value={draft.basedOn ?? ''} options={bases.map((candidate) => candidate.id)}
              label={(id) => name(bases.find((candidate) => candidate.id === id)!)}
              onPick={(id) => {
                const picked = bases.find((candidate) => candidate.id === id)!
                change({ basedOn: id, light: picked.light, dark: picked.dark })
              }}
            />
          </span>
        </div>
        <div className="set-body" ref={bodyFade}>
          <div className="theme-editor-modes">
            <SegmentedControl
              label={t.mode} value={mode} onChange={setMode}
              options={[{ value: 'light', label: m.settings.appearance.light }, { value: 'dark', label: m.settings.appearance.dark }]}
            />
            <Button
              size="compact" variant="ghost"
              onClick={() => { change({ dark: deriveDarkModules(draft.light, base) }); setMode('dark') }}
            >{t.deriveDark}</Button>
          </div>
          <ThemePreview modules={colours} mode={mode} />
          <Card className="theme-module-card">
            <SectionHeading variant="group">{t.modules[module]}</SectionHeading>
            <div className="theme-module-colour">
              <Swatches
                label={t.swatches} value={colours[module].toLowerCase()} onPick={paint}
                swatches={swatches.map(([value, builtIn]) => ({ value, colour: value, label: name(builtIn) }))}
              />
              <ColourField value={colours[module]} onChange={paint} pickLabel={t.pick} valueLabel={t.hex} />
            </div>
            {error === null ? null : <ServiceError>{error}</ServiceError>}
            <ServiceFoot>
              {form.outside ? <Tag state="warning">{t.changedOutside}</Tag> : null}
              <ServiceActions>
                <CommitActions
                  place="foot" saving={saving} canSave={draft.name.trim() !== '' && (dirty || form.outside)} done={form.saved}
                  onSave={() => { void save() }}
                />
              </ServiceActions>
            </ServiceFoot>
          </Card>
        </div>
      </div>
    </>
  )
}
