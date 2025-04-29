// Elementos do DOM
const loginForm = document.getElementById('loginForm');
const loginDiv = document.getElementById('loginDiv');
const sidebar = document.getElementById('sidebar');
const feedDiv = document.getElementById('feedDiv');
const mensagensDiv = document.getElementById('mensagens');
const newsPlaceholder = document.getElementById('newsPlaceholder');
const volumeControl = document.getElementById('volumeControl');
const volumeValue = document.getElementById('volumeValue');
const pauseButton = document.getElementById('pauseButton');
const resumeButton = document.getElementById('resumeButton');
const stopButton = document.getElementById('stopButton');
const pnlList = document.getElementById('pnlList');
const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('loginButton');
const loginError = document.getElementById('loginError');
const loadingIndicator = document.getElementById('loadingIndicator');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const pingValue = document.getElementById('pingValue');
const pnlChartCanvas = document.getElementById('pnlChart');
const themeToggle = document.getElementById('themeToggle');

// Estado do Aplicativo
let chartInstance = null;
let chartData = null;
let utterance = null;
let currentVolume = 1;
let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let pingInterval;
let lastPingTime = 0;
let currentCharIndex = 0;
let currentText = '';
let isSpeaking = false;
let speechQueue = [];

// Alternância de Tema
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeToggleText(savedTheme);
}

function updateThemeToggleText(theme) {
  themeToggle.textContent = theme === 'light' ? 'Modo Escuro' : 'Modo Claro';
}

themeToggle.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeToggleText(newTheme);
  if (chartData) {
    atualizarGrafico(chartData);
  }
});

loadTheme();

// Alternância de visibilidade da senha
togglePassword.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePassword.textContent = isPassword ? '🙈' : '👁️';
});

// Manipulador de Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!username || !password) {
    showError('Por favor, insira usuário e senha.');
    return;
  }

  try {
    loadingIndicator.style.display = 'block';
    loginButton.disabled = true;
    loginError.style.display = 'none';

    const response = await fetch('https://beta.axiafutures.com/api/mock-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      loginDiv.style.display = 'none';
      sidebar.style.display = 'block';
      feedDiv.style.display = 'block';
      iniciarWebSocket();
    } else {
      const errorData = await response.json();
      showError(errorData.message || 'Credenciais inválidas.');
      passwordInput.value = '';
    }
  } catch (error) {
    console.error('Erro de login:', error);
    showError('Erro de conexão. Tente novamente.');
  } finally {
    loadingIndicator.style.display = 'none';
    loginButton.disabled = false;
  }
});

function showError(message) {
  loginError.textContent = message;
  loginError.style.display = 'block';
}

// Conexão WebSocket com monitoramento de ping
function iniciarWebSocket() {
  updateConnectionStatus(false);
  
  socket = new WebSocket('wss://edge-api.axiafutures.com/ws/?token=U2FsdGVkX1+YcfF5A506hKmuKwlK2a4WErOATfH/Ek9GtuMmtY0FbGqnH892r4B8');
  
  socket.addEventListener('open', () => {
    console.log('WebSocket conectado');
    updateConnectionStatus(true);
    reconnectAttempts = 0;
    startPingMonitor();
    socket.send('ping');
  });
  
  socket.addEventListener('message', (event) => {
    const data = event.data;

    if (data === 'ping') {
      socket.send('pong');
      return;
    }

    try {
      const message = JSON.parse(data);

      if (message.type === 'productGraphData' && message.content) {
        const graphData = JSON.parse(message.content);
        atualizarGrafico(graphData);
        return;
      }

      if (message.type === 'message' && Array.isArray(message.content)) {
        message.content.forEach(newsItem => {
          if (newsItem.headline) {
            const source = newsItem.source || "Fonte desconhecida";
            const texto = newsItem.important ? "URGENT: " + newsItem.headline : newsItem.headline;
            const formattedMessage = `${source}: ${texto}`;
            adicionarMensagem(formattedMessage, newsItem.important, texto);
            falarTexto(texto);
          }
        });
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
    }
  });
  
  socket.addEventListener('error', (error) => {
    console.error('Erro no WebSocket:', error);
    updateConnectionStatus(false);
    adicionarMensagem('Erro na conexão WebSocket.');
  });
  
  socket.addEventListener('close', () => {
    console.warn('WebSocket fechado');
    updateConnectionStatus(false);
    if (pingInterval) clearInterval(pingInterval);
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(5000 * reconnectAttempts, 30000);
      adicionarMensagem(`Tentando reconectar em ${delay/1000} segundos... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(iniciarWebSocket, delay);
    } else {
      adicionarMensagem('Falha na conexão. Recarregue a página.');
    }
  });
}

function startPingMonitor() {
  if (pingInterval) clearInterval(pingInterval);
  
  pingInterval = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      lastPingTime = Date.now();
      socket.send('ping');
      setTimeout(() => {
        const ping = Date.now() - lastPingTime;
        pingValue.textContent = `${ping} ms`;
        if (ping < 80) {
          statusDot.style.backgroundColor = 'var(--success-color)';
        } else if (ping < 150) {
          statusDot.style.backgroundColor = 'var(--warning-color)';
        } else {
          statusDot.style.backgroundColor = 'var(--danger-color)';
        }
      }, 500);
    }
  }, 3000);
}

function updateConnectionStatus(connected) {
  if (connected) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Conectado';
  } else {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Desconectado';
    pingValue.textContent = '-- ms';
  }
}

// Exibição de mensagens de notícias
function adicionarMensagem(texto, isUrgent = false, textoParaFala = '') {
  const sourceEnd = texto.indexOf(':');
  const source = texto.substring(0, sourceEnd);
  const message = texto.substring(sourceEnd + 2);
  
  const newsItem = document.createElement('div');
  newsItem.className = `news-item ${isUrgent ? 'urgent' : ''}`;
  newsItem.setAttribute('data-text', textoParaFala);
  
  const sourceEl = document.createElement('div');
  sourceEl.className = 'news-source';
  sourceEl.textContent = source;
  
  const textEl = document.createElement('div');
  textEl.className = 'news-text';
  textEl.textContent = message;
  
  const playBtn = document.createElement('button');
  playBtn.className = 'news-play-btn';
  playBtn.textContent = '▶️';
  playBtn.addEventListener('click', () => {
    const textToSpeak = newsItem.getAttribute('data-text');
    if (textToSpeak) {
      falarTexto(textToSpeak);
    }
  });
  
  newsItem.appendChild(sourceEl);
  newsItem.appendChild(textEl);
  newsItem.appendChild(playBtn);
  mensagensDiv.appendChild(newsItem);
  mensagensDiv.scrollTop = mensagensDiv.scrollHeight;

  // Ocultar placeholder quando há mensagens
  if (mensagensDiv.children.length > 1) {
    newsPlaceholder.style.display = 'none';
  } else {
    newsPlaceholder.style.display = 'block';
  }
}

// Síntese de Voz
function falarTexto(texto) {
  if (!('speechSynthesis' in window)) return;

  if (isSpeaking) {
    speechQueue.push(texto);
    return;
  }

  speakNow(texto);
}

function speakNow(texto) {
  if (utterance && speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }

  currentText = texto;
  currentCharIndex = 0;
  isSpeaking = true;
  utterance = new SpeechSynthesisUtterance(texto);
  utterance.volume = currentVolume;
  utterance.lang = 'en-US';
  
  // Rastrear posição da fala
  utterance.onboundary = (event) => {
    if (event.name === 'word' || event.name === 'sentence') {
      currentCharIndex = event.charIndex || currentCharIndex;
    }
  };

  pauseButton.disabled = false;
  resumeButton.disabled = true;
  stopButton.disabled = false;

  utterance.onend = utterance.onerror = () => {
    pauseButton.disabled = true;
    resumeButton.disabled = true;
    stopButton.disabled = true;
    utterance = null;
    currentText = '';
    currentCharIndex = 0;
    isSpeaking = false;
    processSpeechQueue();
  };

  speechSynthesis.speak(utterance);
}

function processSpeechQueue() {
  if (speechQueue.length > 0 && !isSpeaking) {
    const nextText = speechQueue.shift();
    speakNow(nextText);
  }
}

// Controle de volume com atualização instantânea
volumeControl.addEventListener('input', (e) => {
  currentVolume = parseFloat(e.target.value);
  volumeValue.textContent = `${Math.round(currentVolume * 100)}%`;
  if (utterance && speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause();
    speechSynthesis.cancel();
    const remainingText = currentText.substring(currentCharIndex);
    if (remainingText) {
      utterance = new SpeechSynthesisUtterance(remainingText);
      utterance.volume = currentVolume;
      utterance.lang = 'en-US';
      utterance.onboundary = (event) => {
        if (event.name === 'word' || event.name === 'sentence') {
          currentCharIndex = event.charIndex || currentCharIndex;
        }
      };
      utterance.onend = utterance.onerror = () => {
        pauseButton.disabled = true;
        resumeButton.disabled = true;
        stopButton.disabled = true;
        utterance = null;
        currentText = '';
        currentCharIndex = 0;
        isSpeaking = false;
        processSpeechQueue();
      };
      speechSynthesis.speak(utterance);
    } else {
      isSpeaking = false;
      processSpeechQueue();
    }
  } else if (utterance) {
    utterance.volume = currentVolume;
  }
});

// Controles de voz
pauseButton.addEventListener('click', () => {
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause();
    pauseButton.disabled = true;
    resumeButton.disabled = false;
  }
});

resumeButton.addEventListener('click', () => {
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
    resumeButton.disabled = true;
    pauseButton.disabled = false;
  }
});

stopButton.addEventListener('click', () => {
  speechSynthesis.cancel();
  utterance = null;
  currentText = '';
  currentCharIndex = 0;
  isSpeaking = false;
  speechQueue = []; // Limpar fila ao parar
  pauseButton.disabled = true;
  resumeButton.disabled = true;
  stopButton.disabled = true;
  processSpeechQueue();
});

// Atualização do gráfico
function atualizarGrafico(data) {
  if (!data || typeof data !== 'object') return;

  chartData = data;

  const products = Object.values(data).map(product => ({
    symbol: product.symbol,
    name: product.name,
    pnl: parseFloat(product.pnl) || 0
  }));

  products.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

  console.log('Dados do Gráfico:', products);

  const ctx = pnlChartCanvas.getContext('2d');
  const labels = products.map(p => p.symbol);
  const pnls = products.map(p => p.pnl);
  const backgroundColors = pnls.map(pnl => pnl >= 0 ? getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim() : getComputedStyle(document.documentElement).getPropertyValue('--danger-color').trim());
  const borderColors = backgroundColors;

  // Atualizar lista
  pnlList.innerHTML = '';
  products.forEach(product => {
    const li = document.createElement('li');
    li.className = 'pnl-item';
    
    const symbol = document.createElement('span');
    symbol.className = 'pnl-symbol';
    symbol.textContent = product.symbol;
    
    const value = document.createElement('span');
    value.className = `pnl-value ${product.pnl >= 0 ? 'positive' : 'negative'}`;
    value.textContent = `$${product.pnl.toFixed(2)}`;
    
    li.appendChild(symbol);
    li.appendChild(value);
    pnlList.appendChild(li);
  });

  // Atualizar gráfico
  if (chartInstance) {
    chartInstance.destroy();
  }

  pnlChartCanvas.width = 800;
  pnlChartCanvas.height = 400;

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'PnL ($)',
        data: pnls,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        borderWidth: 1
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: { 
            display: true, 
            text: 'Símbolo',
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
          },
          ticks: { 
            maxRotation: 45, 
            minRotation: 45,
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
          },
          grid: {
            color: 'rgba(255,255,255,0.1)'
          }
        },
        y: {
          title: { 
            display: true, 
            text: 'PnL ($)',
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
          },
          beginAtZero: false,
          ticks: {
            callback: value => `$${value.toFixed(2)}`,
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
          },
          grid: {
            color: 'rgba(255,255,255,0.1)'
          }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
          }
        },
        tooltip: {
          callbacks: {
            label: context => `PnL: $${context.raw.toFixed(2)}`
          }
        }
      }
    }
  });
}

// Manipular redimensionamento da janela sem perder dados do gráfico
window.addEventListener('resize', () => {
  if (pnlChartCanvas && chartInstance) {
    console.log('Redimensionando gráfico...');
    pnlChartCanvas.width = 800;
    pnlChartCanvas.height = 400;
    chartInstance.resize(800, 400);
    if (chartData) {
      atualizarGrafico(chartData);
    }
  }
});

// Limpeza
window.addEventListener('beforeunload', () => {
  if (socket) socket.close();
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  if (pingInterval) clearInterval(pingInterval);
});