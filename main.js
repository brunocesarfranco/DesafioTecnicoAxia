const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true, // Permite o uso de Node.js no renderer (seu HTML/JS)
      contextIsolation: false, // Desativa o isolamento de contexto (para simplificar)
    },
  });

  // Carrega o arquivo index.html
  win.loadFile('index.html');
}

// Quando o Electron estiver pronto, cria a janela
app.whenReady().then(() => {
  createWindow();

  // No macOS, recria a janela se todas forem fechadas
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Fecha o app quando todas as janelas forem fechadas (exceto no macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});