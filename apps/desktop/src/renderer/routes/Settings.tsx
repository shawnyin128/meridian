import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ChatSession, ExtensionStatus, LibraryBackup, LibraryLocation, PluginVersion,
} from '../../shared/contract.js'
import { appMenu, chat, extensions, library } from '../ipc.js'
import { useFormat } from '../lib/format.js'
import type { Catalog } from '../messages/catalog.js'
import { useMessages } from '../messages/useMessages.js'
import {
  useBanner, useJump, useSettingsOpen, useVaultRevision, type SettingsCategory,
} from '../shell/AppShell.js'
import { Icon } from '../components/icons.js'
import { EmptyState } from '../components/EmptyState.js'
import { DirectoryField } from '../components/FormControls.js'
import { AppearanceSettings } from '../components/settings/AppearanceSettings.js'
import { LanguageSettings } from '../components/settings/LanguageSettings.js'
import { DiscoverySettings } from '../components/settings/DiscoverySettings.js'
import { SemanticKeySettings } from '../components/settings/SemanticKeySettings.js'
import { DeliverySettings } from '../components/settings/DeliverySettings.js'
import { ModelSettings } from '../components/settings/ModelSettings.js'
import { ApiOverview } from '../components/settings/ApiOverview.js'
import { ExtensionSettings } from '../components/settings/ExtensionSettings.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { ModalDialog, ModalTitle } from '../components/ModalDialog.js'
import { StructuredList, StructuredRow } from '../components/StructuredList.js'
import { PageError, SectionHeading } from '../components/PageShell.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { WatchSettings } from './Watches.js'
import './shell.css'
import './Settings.css'

/**
 * Set the categories, one item per category in the left column. Paper push centrally manages attention and project discovery directions; archived items manage closed conversations.
 */
const CATEGORIES = [
  'appearance', 'storage', 'api', 'model', 'research', 'extensions', 'delivery', 'delivery-watch', 'delivery-discovery',
  'archived',
] as const
const SUB_CATEGORIES: ReadonlySet<CategoryKey> = new Set(['model', 'research', 'delivery-watch', 'delivery-discovery'])
/**
 * Maps each sub-item to the parent category that groups it in the left column. A sub-item is
 * rendered only while its group is expanded: the parent or one of its own siblings is current.
 */
const SUB_PARENT: Partial<Record<CategoryKey, CategoryKey>> = {
  model: 'api',
  research: 'api',
  'delivery-watch': 'delivery',
  'delivery-discovery': 'delivery',
}
const CATEGORY_LABEL: Record<CategoryKey, keyof Catalog['settings']['categories']> = {
  appearance: 'appearance',
  storage: 'storage',
  api: 'api',
  model: 'model',
  research: 'research',
  extensions: 'extensions',
  delivery: 'delivery',
  'delivery-watch': 'deliveryWatch',
  'delivery-discovery': 'deliveryDiscovery',
  archived: 'archived',
}

type CategoryKey = SettingsCategory

/**
 * Settings: Application-level configurations that do not belong to any content group, are opened by the application menu, and cover the current screen. The left column is classification,
 * The right column shows the content of the selected category. Storage exposes only whole Paper
 * Wiki roots and app-created backups; Core owns layout and every filesystem mutation. Choosing a
 * different root only registers it for next startup. Masks, focus and Escape are owned by Radix.
 */
export function Settings() {
  const m = useMessages()
  const { open, requestedCategory, setOpen } = useSettingsOpen()
  const [current, setCurrent] = useState<CategoryKey>(CATEGORIES[0])
  const [chats, setChats] = useState<ChatSession[]>([])
  const [location, setLocation] = useState<LibraryLocation | null>(null)
  const [backups, setBackups] = useState<LibraryBackup[] | null>(null)
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus[] | null>(null)
  const [pluginVersion, setPluginVersion] = useState<PluginVersion | null>(null)
  const [checkingPlugin, setCheckingPlugin] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [switchingBackup, setSwitchingBackup] = useState<string | null>(null)
  const [deletingBackup, setDeletingBackup] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { open: jumpTo } = useJump()
  const { revision } = useVaultRevision()
  const banner = useBanner()
  const format = useFormat()
  const reportError = useCallback((e: Error) => setError(e.message), [])
  const write = useVaultWrite()

  // Not retrieved when it is closed: This modal is always hanging. If you do not add this item, every time the library writes, it will ask for the session list one more time.
  useEffect(() => {
    if (!open) return
    setError(null)
    setBackups(null)
    void chat.list().then(setChats).catch(reportError)
    void library.location().then(setLocation).catch(reportError)
    void library.backups().then(setBackups).catch(reportError)
    void extensions.status().then(setExtensionStatus).catch(reportError)
    void extensions.pluginVersion().then(setPluginVersion).catch(reportError)
  }, [open, revision, reportError])

  useEffect(() => {
    if (open && requestedCategory !== null) setCurrent(requestedCategory)
  }, [open, requestedCategory])

  const archived = chats.filter((s) => s.archived)

  const unarchive = (session: ChatSession) => {
    void write(chat.setArchived(session.id, false),
      { note: m.settings.archived.unarchived(session.title) })
  }

  const openChat = (session: ChatSession) => {
    jumpTo('chat', session.id)
    setOpen(false)
  }

  const chooseLibrary = async () => {
    setChoosing(true)
    setError(null)
    try {
      const root = await appMenu.chooseLibraryRoot()
      if (root === null) return
      const next = await library.configure(root)
      setLocation(next)
      banner(next.restartRequired ? m.settings.storage.savedRestartRequired : m.settings.storage.saved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setChoosing(false)
    }
  }

  const resetLibrary = async () => {
    setResetting(true)
    setError(null)
    try {
      await library.reset()
      appMenu.restartApp()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setResetting(false)
    }
  }

  const switchBackup = async (backup: LibraryBackup) => {
    setSwitchingBackup(backup.id)
    setError(null)
    try {
      await library.switchBackup(backup.id)
      appMenu.restartApp()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setSwitchingBackup(null)
    }
  }

  const deleteBackup = async (backup: LibraryBackup) => {
    setDeletingBackup(backup.id)
    setError(null)
    try {
      await library.deleteBackup(backup.id)
      setBackups((currentBackups) => currentBackups?.filter((item) => item.id !== backup.id) ?? [])
      banner(m.settings.storage.backupDeleted)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setDeletingBackup(null)
    }
  }

  const copyExtensionCommand = (name: string, command: string) => {
    void navigator.clipboard.writeText(command).then(
      () => banner(m.settings.extensions.copied(name)),
      (caught: unknown) => reportError(caught instanceof Error ? caught : new Error(String(caught))),
    )
  }

  const copyAgentPrompt = (prompt: string) => {
    void navigator.clipboard.writeText(prompt).then(
      () => banner(m.settings.extensions.tutorial.promptCopied),
      (caught: unknown) => reportError(caught instanceof Error ? caught : new Error(String(caught))),
    )
  }

  const sourceLabel = location === null
    ? m.common.reading
    : m.settings.storage.source[location.source]

  const panes: Record<CategoryKey, ReactNode> = {
    appearance: (
      <>
        <SectionHeading>{m.settings.appearance.heading}</SectionHeading>
        <AppearanceSettings />
        <SectionHeading>{m.settings.language.heading}</SectionHeading>
        <LanguageSettings />
      </>
    ),
    storage: (
      <>
        <SectionHeading>{m.settings.storage.heading}</SectionHeading>
        <div className="storage-card">
          <div className="storage-head">
            <div>
              <h3>{m.settings.storage.libraryTitle}</h3>
              <p>{m.settings.storage.libraryNote}</p>
            </div>
            <span className="storage-source">{sourceLabel}</span>
          </div>
          {location === null
            ? <div className="storage-loading">{m.settings.storage.readingLocation}</div>
            : (
              <label className="storage-root">
                <span>{m.settings.storage.rootLabel}</span>
                <DirectoryField
                  value={location.root}
                  readOnly
                  chooseDisabled={location.locked}
                  chooseLabel={choosing
                    ? m.settings.storage.checkingDirectory : m.settings.storage.chooseAction}
                  choosing={choosing}
                  onChoose={() => { void chooseLibrary() }}
                />
              </label>
            )}
          {location?.locked
            ? <p className="storage-note">{m.settings.storage.lockedNote}</p>
            : location?.restartRequired
              ? (
                <div className="storage-note pending" role="status">
                  <span>{m.settings.storage.pendingNote}</span>
                  <button className="btn pri" onClick={() => appMenu.restartApp()}>
                    {m.settings.storage.restartNow}
                  </button>
                </div>
              )
              : <p className="storage-note">{m.settings.storage.chooseNote}</p>}
          <div className="storage-reset">
            <span>{m.settings.storage.resetLabel}</span>
            <ConfirmDialog
              trigger={(
                <button
                  className="btn tdel" disabled={location === null || location.source === 'fixture'
                    || location.restartRequired || resetting}
                >{m.settings.storage.resetAction}</button>
              )}
              title={m.settings.storage.resetTitle}
              confirmLabel={resetting ? m.settings.storage.resetting : m.settings.storage.resetConfirm}
              confirmDisabled={resetting}
              onConfirm={() => { void resetLibrary() }}
            />
          </div>
        </div>
        <SectionHeading variant="content">
          {m.settings.storage.backupsHeading(backups?.length ?? 0)}
        </SectionHeading>
        <p className="settings-intro">{m.settings.storage.backupsIntro}</p>
        {backups === null
          ? <div className="storage-backups-loading">{m.settings.storage.backupsLoading}</div>
          : backups.length === 0
            ? <EmptyState variant="section">{m.settings.storage.backupsEmpty}</EmptyState>
            : (
              <StructuredList className="storage-backup-list">
                {backups.map((backup) => {
                  const label = format.dateTime(backup.createdAt)
                  const busy = switchingBackup !== null || deletingBackup !== null
                  return (
                    <StructuredRow composite className="storage-backup-row" key={backup.id}>
                      <div className="storage-backup-copy">
                        <strong>{label}</strong>
                        <span title={backup.path}>{backup.path}</span>
                      </div>
                      <div className="storage-backup-actions">
                        <button
                          className="btn" disabled={busy || location?.restartRequired === true}
                          onClick={() => { void switchBackup(backup) }}
                        >
                          {switchingBackup === backup.id
                            ? m.settings.storage.backupSwitching
                            : m.settings.storage.backupSwitch}
                        </button>
                        <ConfirmDialog
                          trigger={(
                            <button
                              className="btn tdel"
                              disabled={busy || location?.restartRequired === true}
                            >{m.settings.storage.backupDelete}</button>
                          )}
                          title={m.settings.storage.backupDeleteTitle(label)}
                          description={m.settings.storage.backupDeleteDescription}
                          confirmLabel={deletingBackup === backup.id
                            ? m.settings.storage.backupDeleting
                            : m.settings.storage.backupDelete}
                          confirmDisabled={deletingBackup === backup.id}
                          onConfirm={() => { void deleteBackup(backup) }}
                        />
                      </div>
                    </StructuredRow>
                  )
                })}
              </StructuredList>
            )}
      </>
    ),
    api: (
      <>
        <SectionHeading>{m.settings.api.heading}</SectionHeading>
        <p className="settings-intro">{m.settings.api.intro}</p>
        <ApiOverview onOpen={setCurrent} />
      </>
    ),
    research: (
      <>
        <SectionHeading>{m.settings.research.heading}</SectionHeading>
        <p className="settings-intro">{m.settings.research.intro}</p>
        <SemanticKeySettings />
      </>
    ),
    model: (
      <>
        <SectionHeading>{m.settings.model.heading}</SectionHeading>
        <p className="settings-intro">{m.settings.model.intro}</p>
        <ModelSettings />
      </>
    ),
    extensions: (
      <>
        <SectionHeading>{m.settings.extensions.heading}</SectionHeading>
        <ExtensionSettings
          statuses={extensionStatus} onCopy={copyExtensionCommand} onCopyPrompt={copyAgentPrompt}
          plugin={pluginVersion === null ? undefined : {
            plugin: pluginVersion,
            checking: checkingPlugin,
            onCheck: () => {
              setCheckingPlugin(true)
              void extensions.checkLatest()
                .then((statuses) => {
                  setExtensionStatus(statuses)
                  return extensions.pluginVersion()
                })
                .then(setPluginVersion)
                .catch(reportError)
                .finally(() => setCheckingPlugin(false))
            },
          }}
        />
      </>
    ),
    delivery: (
      <>
        <SectionHeading>{m.settings.delivery.heading}</SectionHeading>
        <p className="settings-intro">{m.settings.delivery.intro}</p>
        <DeliverySettings />
      </>
    ),
    'delivery-watch': (
      <>
        <SectionHeading>{m.settings.categories.deliveryWatch}</SectionHeading>
        <p className="settings-intro">{m.settings.delivery.watchIntro}</p>
        <WatchSettings />
      </>
    ),
    'delivery-discovery': (
      <>
        <SectionHeading>{m.settings.discovery.heading}</SectionHeading>
        <p className="settings-intro">{m.settings.discovery.intro}</p>
        <DiscoverySettings />
      </>
    ),
    archived: (
      <>
        <SectionHeading>{m.settings.archived.heading(archived.length)}</SectionHeading>
        {archived.length === 0
          ? (
            <EmptyState
              variant="page"
              icon={(
                <Icon sw={1.4}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </Icon>
              )}
            >
              {m.settings.archived.empty}
            </EmptyState>
          )
          : (
            <StructuredList className="wlist">
              {archived.map((s) => (
                <StructuredRow className="wrow" data-chat={s.id} key={s.id}>
                  <span className="nm">{s.title}</span>
                  <button className="btn" onClick={() => openChat(s)}>{m.settings.archived.open}</button>
                  <button className="btn" onClick={() => unarchive(s)}>{m.settings.archived.unarchive}</button>
                </StructuredRow>
              ))}
            </StructuredList>
          )}
      </>
    ),
  }

  const expandedParent = SUB_PARENT[current] ?? current
  const visibleCategories = CATEGORIES.filter((c) => !SUB_CATEGORIES.has(c) || SUB_PARENT[c] === expandedParent)

  return (
    <ModalDialog open={open} onOpenChange={setOpen} contentClassName="setdlg">
      <div className="set-side">
        <ModalTitle className="set-t">{m.settings.title}</ModalTitle>
        {visibleCategories.map((c) => (
          <div
            key={c}
            className={`${c === current ? 'srow on' : 'srow'}${SUB_CATEGORIES.has(c) ? ' set-sub' : ''}`}
            data-setcat={c} onClick={() => setCurrent(c)}
          >{m.settings.categories[CATEGORY_LABEL[c]]}</div>
        ))}
      </div>

      <div className="set-main">
        <PageError error={error} />
        {panes[current]}
      </div>
    </ModalDialog>
  )
}
