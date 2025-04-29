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
const pingDot = document.getElementById('pingDot');
const pingValue = document.getElementById('pingValue');
const pnlChartCanvas = document.getElementById('pnlChart');
const themeToggle = document.getElementById('themeToggle');

// Estado do Aplicativo
let chartInstance = null;
let chartData = null;
let utterance = null;
let currentVolume = parseFloat(localStorage.getItem('volume')) || 0.7;
let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let pingInterval;
let lastPingTime = 0;
let currentCharIndex = 0;
let currentText = '';
let isSpeaking = false;
let speechQueue = [];
let isPaused = false;

// Inicialização do volume
volumeControl.value = currentVolume;
volumeValue.textContent = `${Math.round(currentVolume * 100)}%`;

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
    
    // Altera o ícone conforme o estado da senha
    const iconPath = isPassword ? 'assets/images/olho-aberto.png' : 'assets/images/olho-fechado.png';
    togglePassword.innerHTML = `<img src="${iconPath}" alt="${isPassword ? 'Mostrar senha' : 'Ocultar senha'}">`;
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
    showError('Credenciais inválidas, tente novamente.');
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
            adicionarMensagem(formattedMessage, newsItem.important, texto, newsItem);
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
          pingDot.className = 'status-dot connected';
        } else if (ping < 150) {
          pingDot.className = 'status-dot warning';
        } else {
          pingDot.className = 'status-dot';
        }
      }, 500);
    } else {
      pingDot.className = 'status-dot';
      pingValue.textContent = '-- ms';
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
    pingDot.className = 'status-dot';
    pingValue.textContent = '-- ms';
  }
}

// Exibição de mensagens de notícias
function adicionarMensagem(texto, isUrgent = false, textoParaFala = '', newsItem = {}) {
  const sourceEnd = texto.indexOf(':');
  const source = texto.substring(0, sourceEnd);
  const message = texto.substring(sourceEnd + 2);
  
  const newsItemEl = document.createElement('div');
  newsItemEl.className = `news-item ${isUrgent ? 'urgent' : ''}`;
  newsItemEl.setAttribute('data-text', textoParaFala);
  
  const sourceEl = document.createElement('div');
  sourceEl.className = 'news-source';
  sourceEl.textContent = source;
  
  const dateEl = document.createElement('div');
  dateEl.className = 'news-date';
  const date = newsItem.timestamp ? new Date(newsItem.timestamp) : new Date();
  const formattedDate = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${Math.floor(date.getMilliseconds() / 10).toString().padStart(2, '0')}  -  ${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
  dateEl.textContent = formattedDate;
  const textEl = document.createElement('div');
  textEl.className = 'news-text';
  textEl.textContent = message;
  
  const playBtn = document.createElement('button');
  playBtn.className = 'news-play-btn';
  playBtn.textContent = '▶️';
  playBtn.addEventListener('click', () => {
    const textToSpeak = newsItemEl.getAttribute('data-text');
    if (textToSpeak) {
      falarTexto(textToSpeak);
    }
  });
  
  newsItemEl.appendChild(sourceEl);
  newsItemEl.appendChild(dateEl);
  newsItemEl.appendChild(textEl);
  newsItemEl.appendChild(playBtn);
  mensagensDiv.appendChild(newsItemEl);
  mensagensDiv.scrollTop = mensagensDiv.scrollHeight;

  if (mensagensDiv.children.length > 1) {
    newsPlaceholder.style.display = 'none';
  } else {
    newsPlaceholder.style.display = 'block';
  }
}

// Fluxo TTS
function falarTexto(texto) {
  if (!('speechSynthesis' in window)) {
    console.warn('Síntese de voz não suportada neste navegador');
    return;
  }

  if (isSpeaking || isPaused) {
    speechQueue.push(texto);
    return;
  }

  speakNow(texto);
}

function speakNow(texto) {
  if (utterance) {
    speechSynthesis.cancel();
  }

  currentText = texto;
  currentCharIndex = 0;
  isSpeaking = true;
  isPaused = false;
  
  utterance = new SpeechSynthesisUtterance(texto);
  utterance.volume = currentVolume;
  utterance.lang = 'en-US'; // Define a nacionalidade da locução
  
  utterance.onboundary = (event) => {
    if (event.name === 'word' || event.name === 'sentence') {
      currentCharIndex = event.charIndex;
    }
  };

  updateSpeechControls();

  utterance.onend = utterance.onerror = (event) => {
    if (event.type === 'error') {
      console.error('Erro na síntese de voz:', event.error);
    }
    isSpeaking = false;
    isPaused = false;
    utterance = null;
    currentText = '';
    currentCharIndex = 0;
    updateSpeechControls();
    processSpeechQueue();
  };

  speechSynthesis.speak(utterance);
}

function processSpeechQueue() {
  if (speechQueue.length > 0 && !isSpeaking && !isPaused) {
    const nextText = speechQueue.shift();
    speakNow(nextText);
  }
}

function updateSpeechControls() {
  pauseButton.disabled = !isSpeaking || isPaused;
  resumeButton.disabled = !isPaused;
  stopButton.disabled = !isSpeaking && !isPaused;
}

// Controle de volume
let volumeDebounce;
volumeControl.addEventListener('input', (e) => {
  clearTimeout(volumeDebounce);
  volumeDebounce = setTimeout(() => {
    currentVolume = parseFloat(e.target.value);
    volumeValue.textContent = `${Math.round(currentVolume * 100)}%`;
    localStorage.setItem('volume', currentVolume);
    
    if (utterance) {
      utterance.volume = currentVolume;
    }
    
    if (isSpeaking && !isPaused) {
      const remainingText = currentText.substring(currentCharIndex);
      if (remainingText) {
        speechSynthesis.cancel();
        speakNow(remainingText);
      }
    }
  }, 300);
});

// Controles de voz
pauseButton.addEventListener('click', () => {
  if (isSpeaking && !isPaused) {
    speechSynthesis.pause();
    isPaused = true;
    updateSpeechControls();
  }
});

resumeButton.addEventListener('click', () => {
  if (isPaused) {
    speechSynthesis.resume();
    isPaused = false;
    updateSpeechControls();
  }
});

stopButton.addEventListener('click', () => {
  speechSynthesis.cancel();
  isSpeaking = false;
  isPaused = false;
  utterance = null;
  currentText = '';
  currentCharIndex = 0;
  speechQueue = [];
  updateSpeechControls();
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

  const ctx = pnlChartCanvas.getContext('2d');
  const labels = products.map(p => p.symbol);
  const pnls = products.map(p => p.pnl);
  const backgroundColors = pnls.map(pnl => 
    pnl >= 0 ? getComputedStyle(document.documentElement).getPropertyValue('--success-color').trim() 
              : getComputedStyle(document.documentElement).getPropertyValue('--danger-color').trim()
  );
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
      responsive: true, // Ativar redimensionamento responsivo
      maintainAspectRatio: false, // Permitir que o gráfico ajuste sua proporção
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

// Manipular redimensionamento da janela
window.addEventListener('resize', () => {
  if (pnlChartCanvas && chartInstance) {
    // Não é necessário ajustar width e height manualmente, pois responsive: true cuidará disso
    chartInstance.resize();
  }
});

// Limpeza
window.addEventListener('beforeunload', () => {
  if (socket) socket.close();
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  if (pingInterval) clearInterval(pingInterval);
});