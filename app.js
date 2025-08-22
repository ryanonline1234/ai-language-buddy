// Keep conversation history for better context
let conversationHistory = [];

// Initialize Firebase when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 DOM loaded, starting Firebase initialization...');
  initializeApp();
});

function initializeApp() {
  try {
    // Check if Firebase is loaded
    if (typeof firebase === 'undefined') {
      console.log('Waiting for Firebase to load...');
      setTimeout(initializeApp, 100);
      return;
    }

    // Check if config is loaded
    if (typeof firebaseConfig === 'undefined') {
      console.error('Config not loaded. Make sure config.js is included before app.js');
      return;
    }

    // Initialize Firebase (only once)
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log('✅ Firebase initialized successfully');
    }
    
    // Get auth reference
    window.auth = firebase.auth();

    // Auth state listener
    window.auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('User authenticated:', user.email);
        showChatInterface();
      } else {
        console.log('User signed out');
        showAuthInterface();
      }
    });

    setupEventListeners();

  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    document.getElementById('auth-error').textContent = 'Firebase initialization failed. Please refresh the page.';
  }
}

function setupEventListeners() {
  // Helper function to check if Gemini API key is configured
  function checkAPIConfiguration() {
    if (typeof GEMINI_API_KEY === 'undefined' || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
      console.warn('⚠️ Gemini API key not configured! Get your free key at https://ai.google.dev');
      return false;
    }
    return true;
  }

  // Initialize API check
  if (!checkAPIConfiguration()) {
    console.log('🔑 Don\'t forget to add your free Gemini API key!');
  }
}

// Handle Enter key press
function handleKeyPress(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

// Handle language change
function changeLanguage() {
  const targetLanguage = document.getElementById('targetLanguage').value;
  console.log('Language changed to:', targetLanguage);
  
  if (conversationHistory.length > 0) {
    if (confirm('Changing language will clear your chat history. Continue?')) {
      clearChat();
    }
  }
}

// GLOBAL Authentication Functions (accessible to HTML onclick)
function signUp() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    document.getElementById('auth-error').textContent = 'Please fill in all fields';
    return;
  }

  if (!window.auth) {
    document.getElementById('auth-error').textContent = 'Authentication service not ready. Please wait and try again.';
    return;
  }
  
  // Clear any previous errors
  document.getElementById('auth-error').textContent = '';
  
  window.auth.createUserWithEmailAndPassword(email, password)
    .then((userCredential) => {
      console.log('✅ User signed up:', userCredential.user.email);
      showChatInterface();
    })
    .catch((error) => {
      console.error('❌ Sign up error:', error);
      document.getElementById('auth-error').textContent = getReadableError(error.code);
    });
}

function signIn() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    document.getElementById('auth-error').textContent = 'Please fill in all fields';
    return;
  }

  if (!window.auth) {
    document.getElementById('auth-error').textContent = 'Authentication service not ready. Please wait and try again.';
    return;
  }
  
  // Clear any previous errors
  document.getElementById('auth-error').textContent = '';
  
  window.auth.signInWithEmailAndPassword(email, password)
    .then((userCredential) => {
      console.log('✅ User signed in:', userCredential.user.email);
      showChatInterface();
    })
    .catch((error) => {
      console.error('❌ Sign in error:', error);
      document.getElementById('auth-error').textContent = getReadableError(error.code);
    });
}

function signOut() {
  if (!window.auth) {
    alert('Authentication service not ready. Please wait and try again.');
    return;
  }
  
  window.auth.signOut().then(() => {
    console.log('✅ User signed out');
    conversationHistory = []; // Clear conversation when signing out
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) chatMessages.innerHTML = '';
    showAuthInterface();
  }).catch((error) => {
    console.error('❌ Sign out error:', error);
    alert('Sign out failed: ' + (error && error.message ? error.message : 'Unknown error'));
  });
}

// GLOBAL Helper Functions
function getReadableError(errorCode) {
  switch(errorCode) {
    case 'auth/user-not-found':
      return 'No account found with this email. Please sign up first.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    default:
      return `Authentication error: ${errorCode}. Please try again.`;
  }
}

// GLOBAL Chat Functions
function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  const message = messageInput.value.trim();
  
  if (message === '') return;
  
  const targetLanguage = document.getElementById('targetLanguage').value;
  const nativeLanguage = document.getElementById('nativeLanguage').value;
  
  // Validate language selection
  if (!targetLanguage || !nativeLanguage) {
    alert('Please select both target language and native language first!');
    return;
  }
  
  // Add user message to chat
  addMessage(message, 'user');
  messageInput.value = '';
  
  // Show typing indicator
  showTypingIndicator();
  
  // Get AI response
  getAIResponse(message, targetLanguage, nativeLanguage)
    .then(response => {
      hideTypingIndicator();
      addMessage(response, 'ai');
    })
    .catch(error => {
      hideTypingIndicator();
      console.error('Error getting AI response:', error);
      addMessage('Sorry, I had trouble understanding. Could you try again? 😊', 'ai');
    });
}

function addMessage(message, sender) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', sender);
  
  // Add timestamp for better UX
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  messageDiv.innerHTML = `
    <div class="message-content">${message}</div>
    <div class="message-time">${timestamp}</div>
  `;
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
  const chatMessages = document.getElementById('chatMessages');
  const typingDiv = document.createElement('div');
  typingDiv.classList.add('message', 'ai', 'typing');
  typingDiv.id = 'typing-indicator';
  typingDiv.innerHTML = `
    <div class="typing-dots">
      <span></span><span></span><span></span>
    </div>
    <div class="typing-text">Thinking...</div>
  `;
  chatMessages.appendChild(typingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
  const typingIndicator = document.getElementById('typing-indicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

// GLOBAL UI Functions
function showChatInterface() {
  const authContainer = document.getElementById('auth-container');
  const chatContainer = document.getElementById('chat-container');
  if (authContainer) authContainer.style.display = 'none';
  if (chatContainer) chatContainer.style.display = 'flex';
  
  // Focus on message input
  setTimeout(() => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) messageInput.focus();
  }, 100);
}

function showAuthInterface() {
  const authContainer = document.getElementById('auth-container');
  const chatContainer = document.getElementById('chat-container');
  if (authContainer) authContainer.style.display = 'block';
  if (chatContainer) chatContainer.style.display = 'none';
  
  // Clear form fields
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  if (email) email.value = '';
  if (password) password.value = '';
}

function clearChat() {
  const chatMessages = document.getElementById('chatMessages');
  if (chatMessages) chatMessages.innerHTML = '';
  conversationHistory = [];
  console.log('✅ Chat cleared');
}

// 🤖 AI Response Function using FREE Google Gemini
async function getAIResponse(message, targetLanguage, nativeLanguage) {
  try {
    // Check if API key is configured
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
      return `Please configure your Gemini API key in config.js. Get a free key at https://ai.google.dev`;
    }

    // Add current message to conversation history
    conversationHistory.push({
      role: 'user',
      message: message
    });
    
    // Keep only last 6 messages for context (to stay within limits)
    if (conversationHistory.length > 6) {
      conversationHistory = conversationHistory.slice(-6);
    }
    
    // Build conversation context
    let conversationContext = '';
    conversationHistory.forEach(entry => {
      conversationContext += `${entry.role === 'user' ? 'Student' : 'Tutor'}: ${entry.message}\n`;
    });
    
    // Create smart language learning prompt
    const systemPrompt = `You are a friendly, encouraging language tutor helping someone learn ${targetLanguage}. Their native language is ${nativeLanguage}.

IMPORTANT RULES:
1. Always respond in ${targetLanguage} (unless they need urgent clarification)
2. Keep responses to 1-3 sentences maximum
3. If they make grammar mistakes, gently correct: "Good try! We say '[correct version]' instead."
4. Ask follow-up questions to keep conversation flowing
5. Be positive and encouraging
6. Explain new vocabulary briefly if needed
7. Match their conversation level (don't be too advanced)

Previous conversation:
${conversationContext}

Now respond to their latest message naturally and helpfully:`;

    console.log('Sending request to Gemini API...');
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: systemPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 150,
          stopSequences: []
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      })
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('API Error Response:', errorData);
      throw new Error(`Gemini API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Gemini API response:', data);
    
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const aiResponse = data.candidates[0].content.parts[0].text.trim();
      
      // Add AI response to conversation history
      conversationHistory.push({
        role: 'assistant',
        message: aiResponse
      });
      
      return aiResponse;
    } else {
      console.error('Invalid response format:', data);
      throw new Error('Invalid response format from Gemini API');
    }

  } catch (error) {
    console.error('Gemini API Error:', error);
    
    // Smart fallback responses based on target language
    const fallbackResponses = {
      'Spanish': [
        '¡Hola! Soy tu compañero de práctica de español. ¿Cómo estás hoy?',
        '¡Genial conocerte! ¿De qué te gustaría hablar en español?',
        'Perfecto, vamos a practicar español juntos. ¿Qué hiciste hoy?'
      ],
      'French': [
        'Bonjour! Je suis votre partenaire de pratique français. Comment allez-vous?',
        'Enchanté! De quoi aimeriez-vous parler en français?',
        'Parfait, pratiquons le français ensemble. Qu\'avez-vous fait aujourd\'hui?'
      ],
      'German': [
        'Hallo! Ich bin Ihr Deutsch-Übungspartner. Wie geht es Ihnen?',
        'Schön, Sie kennenzulernen! Worüber möchten Sie auf Deutsch sprechen?',
        'Prima, lassen Sie uns zusammen Deutsch üben. Was haben Sie heute gemacht?'
      ],
      'Italian': [
        'Ciao! Sono il tuo compagno di pratica italiana. Come stai oggi?',
        'Piacere di conoscerti! Di cosa ti piacerebbe parlare in italiano?',
        'Perfetto, pratichiamo l\'italiano insieme. Cosa hai fatto oggi?'
      ],
      'Portuguese': [
        'Olá! Sou seu parceiro de prática de português. Como está hoje?',
        'Prazer em conhecê-lo! Do que gostaria de falar em português?',
        'Perfeito, vamos praticar português juntos. O que você fez hoje?'
      ],
      'Japanese': [
        'こんにちは！日本語練習のパートナーです。今日はどうですか？',
        'はじめまして！何について日本語で話したいですか？',
        '素晴らしい！一緒に日本語を練習しましょう。今日何をしましたか？'
      ],
      'Korean': [
        '안녕하세요! 한국어 연습 파트너입니다. 오늘 어떠세요?',
        '만나서 반갑습니다! 한국어로 무엇에 대해 이야기하고 싶으세요?',
        '좋아요! 함께 한국어를 연습해요. 오늘 뭐 하셨어요?'
      ],
      'Chinese': [
        '你好！我是你的中文练习伙伴。今天怎么样？',
        '很高兴认识你！你想用中文聊什么？',
        '太好了！让我们一起练习中文。你今天做了什么？'
      ],
      'default': [
        `Hello! I'm your ${targetLanguage} practice buddy. How are you today?`,
        `Nice to meet you! What would you like to talk about in ${targetLanguage}?`,
        `Great! Let's practice ${targetLanguage} together. What did you do today?`
      ]
    };
    
    const responses = fallbackResponses[targetLanguage] || fallbackResponses['default'];
    return responses[Math.floor(Math.random() * responses.length)];
  }
}

// Make functions globally accessible (required for HTML onclick handlers)
window.signUp = signUp;
window.signIn = signIn;
window.signOut = signOut;
window.sendMessage = sendMessage;
window.clearChat = clearChat;
window.handleKeyPress = handleKeyPress;
window.changeLanguage = changeLanguage;