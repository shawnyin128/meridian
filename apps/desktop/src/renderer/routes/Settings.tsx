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
  useJump, useNotice, useSettingsOpen, useVaultRevision, type SettingsCategory,
} from '../shell/AppShell.js'
import { IconOpen, IconRestore } from '../components/icons.js'
import { IconButton } from '../components/IconButton.js'
import { EmptyState } from '../components/EmptyState.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
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
import { NavRow } from '../components/NavRow.js'
import { RowActions, StructuredList, StructuredRow } from '../components/StructuredList.js'
import { PageError, SectionHeading } from '../components/PageShell.js'
import { useScrollFade } from '../hooks/useScrollFade.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { WatchSettings } from './Watches.js'
import { PaperText } from '../components/paper/PaperText.js'
import { Tag } from '../components/Tag.js'
import { Card } from '../components/Card.js'
import { Tooltip } from '../components/Tooltip.js'
import './shell.css'
import './Settings.css'

/**
 * Settings categories, one row each in the left column. Inmail gathers Watches and the projects'
 * Discovery directions; Archived chats manages the chats that were archived.
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
 * Settings: app-level configuration that belongs to no content group, opened from the app menu
 * as a dialog over the current screen. The left column lists the categories, and the right column
 * shows the selected one. Storage exposes only whole Paper Wiki roots and app-created backups;
 * Core owns layout and every filesystem mutation. Choosing a different root only registers it for
 * next startup. The overlay, focus and Escape are owned by Radix.
 */
export function Settings() {
  const m = useMessages()
  const { open, requestedCategory, setOpen } = useSettingsOpen()
  const paneFade = useScrollFade('y')
  const [current, setCurrent] = useState<CategoryKey>(CATEGORIES[0])
  const [chats, setChats] = useState<ChatSession[] | null>(null)
  const [location, setLocation] = useState<LibraryLocation | null>(null)
  const [backups, setBackups] = useState<LibraryBackup[] | null>(null)
  const [extensionStatus, setExtensionStatus] = useState<ExtensionStatus[] | null>(null)
  const [pluginVersion, setPluginVersion] = useState<PluginVersion | null>(null)
  const [checkingPlugin, setCheckingPlugin] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [switchingBackup, setSwitchingBackup] = useState<string | null>(null)
  const [deletingBackup, setDeletingBackup] = useState<string | null>(null)
  // Each fetch and action reports into the pane it belongs to, so an error shows only on its own pane.
  const [errors, setErrors] = useState<Partial<Record<CategoryKey, string>>>({})

  const { open: jumpTo } = useJump()
  const { revision } = useVaultRevision()
  const notice = useNotice()
  const format = useFormat()
  const setError = useCallback((pane: CategoryKey, message: string | null) => setErrors((held) => {
    const next = { ...held }
    if (message === null) delete next[pane]
    else next[pane] = message
    return next
  }), [])
  const reportTo = useCallback((pane: CategoryKey) => (e: unknown) => {
    setError(pane, e instanceof Error ? e.message : String(e))
  }, [setError])
  const write = useVaultWrite()

  // Fetch nothing while closed: this dialog stays mounted, so without this check every vault write
  // would fetch the chat list again.
  useEffect(() => {
    if (!open) return
    setErrors({})
    setBackups(null)
    void chat.list().then(setChats).catch(reportTo('archived'))
    void library.location().then(setLocation).catch(reportTo('storage'))
    void library.backups().then(setBackups).catch(reportTo('storage'))
    void extensions.status().then(setExtensionStatus).catch(reportTo('extensions'))
    void extensions.pluginVersion().then(setPluginVersion).catch(reportTo('extensions'))
  }, [open, revision, reportTo])

  useEffect(() => {
    if (open && requestedCategory !== null) setCurrent(requestedCategory)
  }, [open, requestedCategory])

  const archived = (chats ?? []).filter((s) => s.archived)

  const unarchive = (session: ChatSession) => {
    void write(chat.setArchived(session.id, false), { note: m.settings.archived.unarchived })
  }

  const openChat = (session: ChatSession) => {
    jumpTo('chat', session.id)
    setOpen(false)
  }

  const chooseLibrary = async () => {
    setChoosing(true)
    setError('storage', null)
    try {
      const root = await appMenu.chooseLibraryRoot()
      if (root === null) return
      const next = await library.configure(root)
      setLocation(next)
      notice.success(next.restartRequired ? m.settings.storage.savedRestartRequired : m.settings.storage.saved)
    } catch (caught) {
      reportTo('storage')(caught)
    } finally {
      setChoosing(false)
    }
  }

  const resetLibrary = async () => {
    setResetting(true)
    setError('storage', null)
    try {
      await library.reset()
      appMenu.restartApp()
    } catch (caught) {
      reportTo('storage')(caught)
      setResetting(false)
    }
  }

  const switchBackup = async (backup: LibraryBackup) => {
    setSwitchingBackup(backup.id)
    setError('storage', null)
    try {
      await library.switchBackup(backup.id)
      appMenu.restartApp()
    } catch (caught) {
      reportTo('storage')(caught)
      setSwitchingBackup(null)
    }
  }

  const deleteBackup = async (backup: LibraryBackup) => {
    setDeletingBackup(backup.id)
    setError('storage', null)
    try {
      await library.deleteBackup(backup.id)
      setBackups((currentBackups) => currentBackups?.filter((item) => item.id !== backup.id) ?? [])
      notice.success(m.settings.storage.backupDeleted)
    } catch (caught) {
      reportTo('storage')(caught)
    } finally {
      setDeletingBackup(null)
    }
  }

  const copyExtensionCommand = (name: string, command: string) => {
    void navigator.clipboard.writeText(command).then(
      () => notice.success(m.settings.extensions.copied(name)),
      reportTo('extensions'),
    )
  }

  const copyAgentPrompt = (prompt: string) => {
    void navigator.clipboard.writeText(prompt).then(
      () => notice.success(m.settings.extensions.tutorial.promptCopied),
      reportTo('extensions'),
    )
  }

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
        <Card className="storage-card">
          <div className="storage-head">
            <div>
              <SectionHeading variant="group">{m.settings.storage.libraryTitle}</SectionHeading>
            </div>
            {location === null ? null : <Tag>{m.settings.storage.source[location.source]}</Tag>}
          </div>
          {location === null
            ? <LoadingPlaceholder shape="lines" count={2} />
            : (
              <>
                <PageError variant="section" error={location.openError} />
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
              </>
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
              : null}
          <div className="storage-reset">
            <span>{m.settings.storage.resetLabel}</span>
            <ConfirmDialog
              trigger={(
                <button
                  className="btn danger" disabled={location === null || location.source === 'fixture'
                    || location.restartRequired || resetting}
                >{m.settings.storage.resetAction}</button>
              )}
              title={m.settings.storage.resetTitle} description={m.settings.storage.resetDescription}
              confirmLabel={resetting ? m.settings.storage.resetting : m.settings.storage.resetConfirm}
              confirmDisabled={resetting}
              onConfirm={() => { void resetLibrary() }}
            />
          </div>
        </Card>
        {backups === null || backups.length === 0
          ? null
          : (
            <>
              <SectionHeading>{m.settings.storage.backupsHeading(backups.length)}</SectionHeading>
              <StructuredList className="storage-backup-list">
                {backups.map((backup) => {
                  const label = format.dateTime(backup.createdAt)
                  const busy = switchingBackup !== null || deletingBackup !== null
                  return (
                    <StructuredRow composite className="storage-backup-row" key={backup.id}>
                      <div className="storage-backup-copy">
                        <strong>{label}</strong>
                        <Tooltip label={backup.path} whenClipped><span>{backup.path}</span></Tooltip>
                      </div>
                      <div className="storage-backup-actions">
                        <button
                          className="btn ghost sm" disabled={busy || location?.restartRequired === true}
                          onClick={() => { void switchBackup(backup) }}
                        >
                          {switchingBackup === backup.id
                            ? m.settings.storage.backupSwitching
                            : m.settings.storage.backupSwitch}
                        </button>
                        <ConfirmDialog
                          trigger={(
                            <button
                              className="btn danger sm"
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
            </>
          )}
      </>
    ),
    api: (
      <>
        <SectionHeading>{m.settings.api.heading}</SectionHeading>
        <ApiOverview onOpen={setCurrent} />
      </>
    ),
    research: (
      <>
        <SectionHeading>{m.settings.research.heading}</SectionHeading>
        <SemanticKeySettings />
      </>
    ),
    model: (
      <>
        <SectionHeading>{m.settings.model.heading}</SectionHeading>
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
                .catch(reportTo('extensions'))
                .finally(() => setCheckingPlugin(false))
            },
          }}
        />
      </>
    ),
    delivery: (
      <>
        <SectionHeading>{m.settings.delivery.heading}</SectionHeading>
        <DeliverySettings />
      </>
    ),
    'delivery-watch': (
      <>
        <SectionHeading>{m.settings.categories.deliveryWatch}</SectionHeading>
        <WatchSettings />
      </>
    ),
    'delivery-discovery': (
      <>
        <SectionHeading>{m.settings.discovery.heading}</SectionHeading>
        <DiscoverySettings />
      </>
    ),
    archived: (
      <>
        <SectionHeading>{m.settings.archived.heading(archived.length)}</SectionHeading>
        {chats === null
          ? <LoadingPlaceholder shape="rows" count={2} />
          : archived.length === 0
          ? <EmptyState variant="section">{m.settings.archived.empty}</EmptyState>
          : (
            <StructuredList className="wlist">
              {archived.map((s) => (
                <StructuredRow className="wrow" data-chat={s.id} key={s.id}>
                  <span className="nm"><PaperText text={s.title} /></span>
                  <RowActions>
                    <IconButton label={m.settings.archived.open} size="nested" onClick={() => openChat(s)}>
                      <IconOpen />
                    </IconButton>
                    <IconButton label={m.settings.archived.unarchive} size="nested" onClick={() => unarchive(s)}>
                      <IconRestore />
                    </IconButton>
                  </RowActions>
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
    <ModalDialog open={open} onOpenChange={setOpen} size="wide" closable className="setdlg">
      <div className="set-side">
        <ModalTitle className="set-t">{m.settings.title}</ModalTitle>
        {visibleCategories.map((c) => (
          <NavRow
            key={c} className={SUB_CATEGORIES.has(c) ? 'srow set-sub' : 'srow'} selected={c === current}
            data-setcat={c} onActivate={() => setCurrent(c)}
          >{m.settings.categories[CATEGORY_LABEL[c]]}</NavRow>
        ))}
      </div>

      <div className="set-main" ref={paneFade}>
        <PageError error={errors[current]} />
        {panes[current]}
      </div>
    </ModalDialog>
  )
}
