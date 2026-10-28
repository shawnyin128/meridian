import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ChatSession, ColourTheme, ExtensionStatus, LibraryBackup, LibraryLocation, PluginVersion,
} from '../../shared/contract.js'
import { appMenu, chat, extensions, library } from '../ipc.js'
import { errorLabel, reasonLabel } from '../lib/failure-label.js'
import { useFormat } from '../lib/format.js'
import { useMessages } from '../messages/useMessages.js'
import {
  useChatSession, useJump, useSettingsOpen, useVaultRevision,
} from '../shell/AppShell.js'
import { SETTINGS_CATEGORIES, SETTINGS_CATEGORY_LABEL, type SettingsCategory } from '../shell/settings-categories.js'
import { IconOpen, IconRestore, IconTrash } from '../components/icons.js'
import { IconButton } from '../components/IconButton.js'
import { EmptyState } from '../components/EmptyState.js'
import { LoadingPlaceholder } from '../components/LoadingPlaceholder.js'
import { DirectoryField, FieldRow } from '../components/FormControls.js'
import { InlineMessage } from '../components/InlineMessage.js'
import { AppearanceSettings, ColourThemeSettings } from '../components/settings/AppearanceSettings.js'
import { ThemeEditor } from '../components/settings/ThemeEditor.js'
import { LanguageSettings } from '../components/settings/LanguageSettings.js'
import { DiscoverySettings } from '../components/settings/DiscoverySettings.js'
import { SemanticKeySettings } from '../components/settings/SemanticKeySettings.js'
import { DeliverySettings } from '../components/settings/DeliverySettings.js'
import { ModelSettings } from '../components/settings/ModelSettings.js'
import { ApiOverview } from '../components/settings/ApiOverview.js'
import { ExtensionSettings } from '../components/settings/ExtensionSettings.js'
import { ResourceSettings } from '../components/settings/ResourceSettings.js'
import { AddAction } from '../components/AddAction.js'
import { Button } from '../components/Button.js'
import { ConfirmDialog } from '../components/ConfirmDialog.js'
import { DateTimeDisplay } from '../components/DateTimeDisplay.js'
import { ModalDialog, ModalTitle } from '../components/ModalDialog.js'
import { NavRow } from '../components/NavRow.js'
import { Item } from '../components/Item.js'
import { List } from '../components/List.js'
import { PageError, SectionHeading } from '../components/PageShell.js'
import { SplitMain, SplitNav, SplitPage } from '../components/SplitPage.js'
import { useScreenLoad } from '../hooks/useScreenLoad.js'
import { useVaultWrite } from '../hooks/useVaultWrite.js'
import { WatchSettings } from './Watches.js'
import { PaperText } from '../components/paper/PaperText.js'
import { Tag } from '../components/Tag.js'
import { Card } from '../components/Card.js'
import { FadeText } from '../components/FadeText.js'
import './shell.css'
import './Settings.css'

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

type CategoryKey = SettingsCategory

/**
 * Settings: app-level configuration that belongs to no content group, opened from the app menu
 * as a dialog over the current screen. The left column lists the categories, and the right column
 * shows the selected one: its title stays above its content, which scrolls on its own. Storage
 * exposes only whole Paper Wiki roots and app-created backups; Core owns layout and every filesystem
 * mutation. Choosing a different root only registers it for next startup. The overlay, focus and
 * Escape are owned by Radix.
 */
export function Settings() {
  const m = useMessages()
  const { open, requestedCategory, setOpen } = useSettingsOpen()
  const [current, setCurrent] = useState<CategoryKey>(SETTINGS_CATEGORIES[0])
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
  /** The theme the theme editor shows in place of the columns: a custom theme, or null for a new one. */
  // How many times the shown category was chosen again; its pane goes back to its top level on each.
  const [reselected, setReselected] = useState(0)
  const [editingTheme, setEditingTheme] = useState<{ theme: ColourTheme | null } | null>(null)
  const [themeDirty, setThemeDirty] = useState(false)
  /** Where leaving the theme editor with unsaved edits goes once confirmed: back to Appearance, or out of Settings. */
  const [leaving, setLeaving] = useState<'back' | 'close' | null>(null)
  // Each read and action reports into the pane it belongs to, so an error shows only on its own pane.
  const [actionErrors, setActionErrors] = useState<Partial<Record<CategoryKey, string>>>({})
  const { error: archivedError, load: loadArchived } = useScreenLoad()
  const { error: storageError, failure: storageFailure, load: loadStorage } = useScreenLoad(['location'])
  const { error: extensionsError, load: loadExtensions } = useScreenLoad()
  const readErrors: Partial<Record<CategoryKey, string | null>> = {
    archived: archivedError, storage: storageError, extensions: extensionsError,
  }

  const { open: jumpTo } = useJump()
  const { remove: deleteChat } = useChatSession()
  const { revision } = useVaultRevision()
  const format = useFormat()
  const setActionError = useCallback((pane: CategoryKey, message: string | null) => setActionErrors((held) => {
    const next = { ...held }
    if (message === null) delete next[pane]
    else next[pane] = message
    return next
  }), [])
  const reportTo = useCallback((pane: CategoryKey) => (e: unknown) => {
    setActionError(pane, errorLabel(m, e))
  }, [setActionError, m])
  const write = useVaultWrite()

  // Fetch nothing while closed: this dialog stays mounted, so without this check every vault write
  // would fetch the chat list again.
  useEffect(() => {
    if (!open) return
    setActionErrors({})
    setBackups(null)
    const drops = [
      loadArchived('chats', chat.list(), setChats),
      loadStorage('location', library.location(), setLocation),
      loadStorage('backups', library.backups(), setBackups),
      loadExtensions('status', extensions.status(), setExtensionStatus),
      loadExtensions('plugin', extensions.pluginVersion(), setPluginVersion),
    ]
    return () => { for (const drop of drops) drop() }
  }, [open, revision, loadArchived, loadStorage, loadExtensions])

  useEffect(() => {
    if (open && requestedCategory !== null) setCurrent(requestedCategory)
  }, [open, requestedCategory])

  useEffect(() => {
    if (!open) setEditingTheme(null)
  }, [open])

  const archived = (chats ?? []).filter((s) => s.archived)

  const leave = (to: 'back' | 'close') => {
    if (to === 'back') setEditingTheme(null)
    else setOpen(false)
  }
  // Back, the close button, Escape and the scrim all leave the editor the same way.
  const requestLeave = (to: 'back' | 'close') => {
    if (editingTheme !== null && themeDirty) setLeaving(to)
    else leave(to)
  }

  const unarchive = (session: ChatSession) => {
    void write(chat.setArchived(session.id, false))
  }

  const openChat = (session: ChatSession) => {
    jumpTo('chat', session.id)
    setOpen(false)
  }

  const chooseLibrary = async () => {
    setChoosing(true)
    setActionError('storage', null)
    try {
      const root = await appMenu.chooseLibraryRoot()
      if (root === null) return
      const next = await library.configure(root)
      setLocation(next)
    } catch (caught) {
      reportTo('storage')(caught)
    } finally {
      setChoosing(false)
    }
  }

  const resetLibrary = async () => {
    setResetting(true)
    setActionError('storage', null)
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
    setActionError('storage', null)
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
    setActionError('storage', null)
    try {
      await library.deleteBackup(backup.id)
      setBackups((currentBackups) => currentBackups?.filter((item) => item.id !== backup.id) ?? [])
    } catch (caught) {
      reportTo('storage')(caught)
    } finally {
      setDeletingBackup(null)
    }
  }

  const copyText = (pane: CategoryKey) => (text: string) => navigator.clipboard.writeText(text).then(() => true, (caught: unknown) => {
    reportTo(pane)(caught)
    return false
  })

  const titles: Record<CategoryKey, string> = {
    appearance: m.settings.appearance.heading,
    storage: m.settings.storage.heading,
    api: m.settings.api.heading,
    research: m.settings.research.heading,
    model: m.settings.model.heading,
    extensions: m.settings.extensions.heading,
    resources: m.pool.heading,
    delivery: m.settings.delivery.heading,
    'delivery-watch': m.settings.categories.deliveryWatch,
    'delivery-discovery': m.settings.discovery.heading,
    archived: m.settings.archived.heading,
  }

  const panes: Record<CategoryKey, ReactNode> = {
    appearance: (
      <>
        <AppearanceSettings />
        <SectionHeading
          actions={(
            <AddAction size="compact" label={m.settings.appearance.editor.create} onClick={() => setEditingTheme({ theme: null })}>
              {m.settings.appearance.editor.createShort}
            </AddAction>
          )}
        >{m.settings.appearance.themeHeading}
        </SectionHeading>
        <ColourThemeSettings onEdit={(theme) => setEditingTheme({ theme })} onError={reportTo('appearance')} />
        <SectionHeading>{m.settings.language.heading}</SectionHeading>
        <LanguageSettings />
      </>
    ),
    storage: (
      <>
        <Card className="storage-card">
          <SectionHeading
            level="group" actions={location === null ? undefined : <Tag>{m.settings.storage.source[location.source]}</Tag>}
          >{m.settings.storage.libraryTitle}
          </SectionHeading>
          {location === null
            ? (storageFailure('location') === null
              ? <LoadingPlaceholder shape="lines" count={2} />
              : <PageError variant="section" error={storageFailure('location')} />)
            : (
              <>
                <PageError
                  variant="section" error={location.openError === null ? null : reasonLabel(m, location.openError)}
                />
                <div className="storage-root">
                  <FieldRow label={m.settings.storage.rootLabel}>
                    <DirectoryField
                      value={location.root}
                      readOnly
                      chooseDisabled={location.locked}
                      chooseLabel={choosing
                        ? m.settings.storage.checkingDirectory : m.settings.storage.chooseAction}
                      choosing={choosing}
                      onChoose={() => { void chooseLibrary() }}
                    />
                  </FieldRow>
                </div>
              </>
            )}
          {location?.locked !== true && location?.restartRequired
              ? (
                <InlineMessage
                  tone="warning" variant="box" className="storage-pending"
                  action={<Button size="regular" variant="primary" onClick={() => appMenu.restartApp()}>{m.settings.storage.restartNow}</Button>}
                >
                  {m.settings.storage.pendingNote}
                </InlineMessage>
              )
              : null}
          <div className="storage-reset">
            <span>{m.settings.storage.resetLabel}</span>
            <ConfirmDialog
              trigger={(
                <Button
                  size="regular" tone="danger" disabled={location === null || location.source === 'fixture'
                    || location.restartRequired}
                  busy={resetting} busyLabel={m.settings.storage.resetting}
                >{m.settings.storage.resetAction}</Button>
              )}
              title={m.settings.storage.resetTitle}
              confirmLabel={m.settings.storage.resetConfirm}
              onConfirm={() => { void resetLibrary() }}
            />
          </div>
        </Card>
        {backups === null || backups.length === 0
          ? null
          : (
            <>
              <SectionHeading count={backups.length}>{m.settings.storage.backupsHeading}</SectionHeading>
              <List className="storage-backup-list">
                {backups.map((backup) => {
                  const label = `${format.day(backup.createdAt)} ${format.clock(backup.createdAt)}`
                  const busy = switchingBackup !== null || deletingBackup !== null
                  return (
                    <Item
                      className="storage-backup-row" key={backup.id} lines={2}
                      title={<DateTimeDisplay at={backup.createdAt} />}
                      meta={<FadeText className="storage-backup-path" label={backup.path}>{backup.path}</FadeText>}
                      trailing={(
                        <>
                          <Button
                            size="compact" variant="ghost" disabled={busy || location?.restartRequired === true}
                            busy={switchingBackup === backup.id} busyLabel={m.settings.storage.backupSwitching}
                            onClick={() => { void switchBackup(backup) }}
                          >{m.settings.storage.backupSwitch}</Button>
                          <ConfirmDialog
                            trigger={(
                              <Button
                                size="compact" tone="danger"
                                disabled={busy || location?.restartRequired === true}
                                busy={deletingBackup === backup.id} busyLabel={m.settings.storage.backupDeleting}
                              >{m.settings.storage.backupDelete}</Button>
                            )}
                            title={m.settings.storage.backupDeleteTitle(label)}
                            description={m.settings.storage.backupDeleteLoss}
                            confirmLabel={m.settings.storage.backupDelete}
                            onConfirm={() => { void deleteBackup(backup) }}
                          />
                        </>
                      )}
                    />
                  )
                })}
              </List>
            </>
          )}
      </>
    ),
    api: (
      <>
        <ApiOverview onOpen={setCurrent} />
      </>
    ),
    research: (
      <>
        <SemanticKeySettings />
      </>
    ),
    model: (
      <>
        <ModelSettings onCopy={copyText('model')} reselected={reselected} />
      </>
    ),
    extensions: (
      <>
        <ExtensionSettings
          statuses={extensionStatus} failed={extensionsError !== null}
          onCopy={copyText('extensions')}
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
        <DeliverySettings />
      </>
    ),
    'delivery-watch': (
      <>
        <WatchSettings />
      </>
    ),
    resources: <ResourceSettings />,
    'delivery-discovery': (
      <>
        <DiscoverySettings />
      </>
    ),
    archived: (
      <>
        {chats === null
          ? (archivedError === null ? <LoadingPlaceholder shape="rows" count={2} /> : null)
          : archived.length === 0
          ? <EmptyState variant="section" />
          : (
            <List className="wlist">
              {archived.map((s) => (
                <Item
                  className="wrow" data-chat={s.id} key={s.id}
                  title={<span className="nm"><PaperText text={s.title} /></span>}
                  actions={(
                    <>
                      <IconButton label={m.settings.archived.open} size="nested" onClick={() => openChat(s)}>
                        <IconOpen />
                      </IconButton>
                      <IconButton label={m.settings.archived.unarchive} size="nested" onClick={() => unarchive(s)}>
                        <IconRestore />
                      </IconButton>
                      <IconButton label={m.common.delete} size="nested" tone="danger" onClick={() => deleteChat(s.id)}>
                        <IconTrash />
                      </IconButton>
                    </>
                  )}
                />
              ))}
            </List>
          )}
      </>
    ),
  }

  const expandedParent = SUB_PARENT[current] ?? current
  const visibleCategories = SETTINGS_CATEGORIES.filter((c) => !SUB_CATEGORIES.has(c) || SUB_PARENT[c] === expandedParent)

  return (
    <ModalDialog
      open={open} onOpenChange={(next) => { if (next) setOpen(true); else requestLeave('close') }}
      size="wide" closable className="setdlg"
    >
      {editingTheme !== null
        ? (
          <>
            <ThemeEditor theme={editingTheme.theme} onBack={() => requestLeave('back')} onDirtyChange={setThemeDirty} />
            <ConfirmDialog
              open={leaving !== null} onOpenChange={(next) => { if (!next) setLeaving(null) }}
              title={m.settings.appearance.editor.leaveTitle}
              confirmLabel={m.settings.appearance.editor.leave} onConfirm={() => { if (leaving !== null) leave(leaving) }}
            />
          </>
        )
        : (
          <SplitPage columns="dialog">
            <SplitNav head={<ModalTitle>{m.settings.title}</ModalTitle>}>
              {visibleCategories.map((c) => (
                <NavRow
                  key={c} indent={SUB_CATEGORIES.has(c) ? 1 : 0} sub={SUB_CATEGORIES.has(c)} selected={c === current}
                  data-setcat={c} onActivate={() => setCurrent(c)} onReselect={() => setReselected((n) => n + 1)}
                >{m.settings.categories[SETTINGS_CATEGORY_LABEL[c]]}</NavRow>
              ))}
            </SplitNav>

            <SplitMain
              fill={current === 'model'}
              head={(
                <>
                  <PageError error={actionErrors[current] ?? readErrors[current]} />
                  <SectionHeading count={current === 'archived' ? archived.length : undefined}>{titles[current]}</SectionHeading>
                </>
              )}
            >{panes[current]}
            </SplitMain>
          </SplitPage>
        )}
    </ModalDialog>
  )
}
