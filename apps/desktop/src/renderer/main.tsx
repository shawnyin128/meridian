import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Changelog } from './routes/Changelog.js'
import { Chat } from './routes/Chat.js'
import { Feed } from './routes/Feed.js'
import { Inbox } from './routes/Inbox.js'
import { Ideas } from './routes/Ideas.js'
import { Later } from './routes/Later.js'
import { PaperTable } from './routes/PaperTable.js'
import { Projects } from './routes/Projects.js'
import { Reader } from './routes/Reader.js'
import { ResearchOverview } from './routes/ResearchOverview.js'
import { Settings } from './routes/Settings.js'
import { Trash } from './routes/Trash.js'
import { Wiki } from './routes/Wiki.js'
import { MessagesProvider } from './messages/useMessages.js'
import { AppShell } from './shell/AppShell.js'
import { initializeAppearance } from './shell/appearance.js'
import { initializeLanguage } from './shell/language.js'
import './shell/tokens.css'

initializeAppearance()
initializeLanguage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MessagesProvider>
      <AppShell
        screens={{
          feed: <Feed />, inbox: <Inbox />, later: <Later />,
          papers: <PaperTable />, wiki: <Wiki />, changelog: <Changelog />,
          ideas: <Ideas />, overview: <ResearchOverview />, project: <Projects />,
          trash: <Trash />, chat: <Chat />, reader: <Reader />,
        }}
        settings={<Settings />}
      />
    </MessagesProvider>
  </StrictMode>,
)
