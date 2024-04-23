// import path from 'path'
import { app, ipcMain } from 'electron'
import serve from 'electron-serve'
import { BrowserWindow } from 'electron'
// import { createWindow } from './helpers'

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
    },
  })

  if (isProd) {
    win.loadURL('app://./home.html')
  } else {
    const port = process.argv[2]
    win.loadURL(`http://localhost:${port}/home.html`)
    win.webContents.openDevTools()
  }
}


app.on('ready', createWindow)
app.on('window-all-closed', () => {
  app.quit()
})
ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})
