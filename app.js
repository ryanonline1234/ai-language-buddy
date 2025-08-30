// Keep conversation history for better context

// ====== GLOBAL VARIABLES ======
let conversationHistory = [];
let recognition = null;
let isListening = false;
let autoSpeakEnabled = false;
let slowModeEnabled = false;
let pronunciationModeEnabled = false;

// Language tab variables
let currentActiveLanguage = 'Spanish';
let conversationHistoryByLanguage = {
  'Spanish': [],
  'French': [],
  'German': [],
  'Italian': [],
  'Portuguese': [],
  'Japanese': [],
  'Korean': [],
  'Chinese': []
};

// Initialize Firebase when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 DOM loaded, starting Firebase initialization...');
  initializeApp();
});

// ====== Firestore Initialization ======
let db;

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
    // Initialize Firestore
    db = firebase.firestore();
    console.log('✅ Firestore initialized');
    // Get auth reference
    window.auth = firebase.auth();

    // Auth state listener
    window.auth.onAuthStateChanged((user) => {
      if (user) {
        console.log('User authenticated:', user.email);
        createUserProfile(user);
        updateStreak();
        setTimeout(() => {
          loadConversationHistory();
        }, 1000);
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

// ====== USER DATA STRUCTURE ======
async function createUserProfile(user) {
    if (!db) return;
    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();
    if (!doc.exists) {
        // New user - create profile
        await userRef.set({
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            stats: {
                totalSessions: 0,
                totalMessages: 0,
                minutesLearned: 0,
                streak: 0,
                lastActive: null,
                lastStreakUpdate: null
            },
            preferences: {
                targetLanguage: 'Spanish',
                nativeLanguage: 'English'
            }
        });
        console.log('✅ User profile created');
    }
    // Update last active
    await userRef.update({
        'stats.lastActive': firebase.firestore.FieldValue.serverTimestamp()
    });
}

// ====== SAVE CONVERSATIONS ======
async function saveMessageToFirestore(message, sender, language) {
    if (!db || !window.auth.currentUser) return;
    try {
        // Save to user's conversation history
        await db.collection('users')
            .doc(window.auth.currentUser.uid)
            .collection('conversations')
            .add({
                message: message,
                sender: sender,
                language: language,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        // Update user stats
        if (sender === 'user') {
            const userRef = db.collection('users').doc(window.auth.currentUser.uid);
            await userRef.update({
                'stats.totalMessages': firebase.firestore.FieldValue.increment(1)
            });
        }
    } catch (error) {
        console.error('Error saving message:', error);
    }
}

// ====== LOAD CONVERSATION HISTORY ======
async function loadConversationHistory() {
    if (!db || !window.auth.currentUser) return;
    try {
        const snapshot = await db.collection('users')
            .doc(window.auth.currentUser.uid)
            .collection('conversations')
            .orderBy('timestamp', 'desc')
            .limit(200) // Increased limit to accommodate multiple languages
            .get();
        
        // Group messages by language
        const messagesByLanguage = {};
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const language = data.language || 'Spanish'; // Default to Spanish for older messages
            
            if (!messagesByLanguage[language]) {
                messagesByLanguage[language] = [];
            }
            messagesByLanguage[language].push(data);
        });
        
        // Load messages for each language tab
        Object.keys(messagesByLanguage).forEach(language => {
            if (conversationHistoryByLanguage[language]) {
                // Display messages in reverse order (oldest first)
                const messages = messagesByLanguage[language].reverse();
                messages.forEach(msg => {
                    addMessageToLanguageTab(msg.message, msg.sender, language);
                });
                
                // Store in our conversation history
                conversationHistoryByLanguage[language] = messages.map(msg => ({
                    message: msg.message,
                    sender: msg.sender
                }));
            }
        });
        
        console.log(`✅ Loaded conversation history for languages:`, Object.keys(messagesByLanguage));
    } catch (error) {
        console.error('Error loading history:', error);
    }
}

// ====== TRACK LEARNING STATS ======
async function updateLearningStats(sessionMinutes = 0) {
    if (!db || !window.auth.currentUser) return;
    const userRef = db.collection('users').doc(window.auth.currentUser.uid);
    try {
        await userRef.update({
            'stats.totalSessions': firebase.firestore.FieldValue.increment(1),
            'stats.minutesLearned': firebase.firestore.FieldValue.increment(sessionMinutes),
            'stats.lastActive': firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// ====== LEARNING STREAKS ======
async function updateStreak() {
    if (!db || !window.auth.currentUser) return;
    const userRef = db.collection('users').doc(window.auth.currentUser.uid);
    const doc = await userRef.get();
    if (doc.exists) {
        const userData = doc.data();
        const lastStreakUpdate = userData.stats.lastStreakUpdate;
        const currentStreak = userData.stats.streak || 0;
        const today = new Date();
        
        // Get today's date at midnight for comparison
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        if (lastStreakUpdate) {
            const lastStreakDate = lastStreakUpdate.toDate();
            const lastStreakMidnight = new Date(lastStreakDate.getFullYear(), lastStreakDate.getMonth(), lastStreakDate.getDate());
            
            // Calculate difference in calendar days
            const diffTime = todayMidnight - lastStreakMidnight;
            const diffDays = diffTime / (1000 * 60 * 60 * 24);
            
            if (diffDays === 0) {
                // Same day - don't update streak
                console.log('Same day login - streak unchanged');
                return;
            } else if (diffDays === 1) {
                // Next day - increase streak
                await userRef.update({
                    'stats.streak': currentStreak + 1,
                    'stats.lastStreakUpdate': firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log(`✅ Streak increased to ${currentStreak + 1}`);
            } else if (diffDays > 1) {
                // Missed day(s) - reset streak to 1
                await userRef.update({
                    'stats.streak': 1,
                    'stats.lastStreakUpdate': firebase.firestore.FieldValue.serverTimestamp()
                });
                console.log('🔄 Streak reset to 1 (missed days)');
            }
        } else {
            // First time - start streak
            await userRef.update({
                'stats.streak': 1,
                'stats.lastStreakUpdate': firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('🌟 Streak started at 1 (first time)');
        }
    }
}

// ====== FAVORITE PHRASES ======
async function saveFavoritePhrase(phrase, translation, language) {
    if (!db || !window.auth.currentUser) return;
    try {
        await db.collection('users')
            .doc(window.auth.currentUser.uid)
            .collection('favorites')
            .add({
                phrase: phrase,
                translation: translation,
                language: language,
                savedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        console.log('✅ Phrase saved to favorites');
        alert('Phrase saved to your favorites!');
    } catch (error) {
        console.error('Error saving favorite:', error);
    }
}

// ====== GET USER STATS FOR DASHBOARD ======
async function getUserStats() {
    if (!db || !window.auth.currentUser) return null;
    try {
        const doc = await db.collection('users')
            .doc(window.auth.currentUser.uid)
            .get();
        if (doc.exists) {
            return doc.data().stats;
        }
    } catch (error) {
        console.error('Error getting stats:', error);
    }
    return null;
}

// ====== UPDATE YOUR EXISTING FUNCTIONS ======
// Modify your existing sendMessage function to save to Firestore
const originalSendMessage = sendMessage;
window.sendMessage = async function() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    const targetLanguage = document.getElementById('targetLanguage').value;
    if (message) {
        // Save to Firestore
        await saveMessageToFirestore(message, 'user', targetLanguage);
    }
    // Call original function
    originalSendMessage();
};

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
    // Add to current active language tab
    addMessageToLanguageTab(message, sender, currentActiveLanguage);
}

function addMessageToLanguageTab(message, sender, language) {
    const chatMessages = document.getElementById(language) || document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Add buttons to messages
    const messageHTML = `
        <div class="message-content">
            <div class="message-text">${message}</div>
            <div class="message-actions">
                <button class="message-speaker-btn" onclick="speakMessage('${message.replace(/'/g, "\\'")}', '${sender}')">🔊</button>
                <button class="message-favorite-btn" onclick="favoriteMessage('${message.replace(/'/g, "\\'")}', '${sender}')">⭐</button>
            </div>
            <div class="message-time">${timestamp}</div>
        </div>
    `;
    
    messageDiv.innerHTML = messageHTML;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Auto-speak if enabled
    if (sender === 'ai' && autoSpeakEnabled) {
        const targetLanguage = language || currentActiveLanguage || 'Spanish';
        setTimeout(() => speakText(message, targetLanguage), 500);
    }
}

function showTypingIndicator() {
  const chatMessages = document.getElementById(currentActiveLanguage) || document.getElementById('chatMessages');
  if (!chatMessages) return;
  
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
  const chatMessages = document.getElementById(currentActiveLanguage) || document.getElementById('chatMessages');
  if (chatMessages) chatMessages.innerHTML = '';
  
  // Clear the conversation history for the current language
  if (conversationHistoryByLanguage[currentActiveLanguage]) {
    conversationHistoryByLanguage[currentActiveLanguage] = [];
  }
  
  // Keep backward compatibility
  conversationHistory = [];
  console.log('✅ Chat cleared for', currentActiveLanguage);
}

// Handle Enter key press in message input
function handleKeyPress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}

// Handle language change
function changeLanguage() {
  const targetLanguage = document.getElementById('targetLanguage').value;
  console.log('Language changed to:', targetLanguage);
  // Update speech recognition language if available
  if (typeof updateRecognitionLanguage === 'function') {
    updateRecognitionLanguage();
  }
  // Also switch to the corresponding language tab
  openLanguageTab(targetLanguage);
}

// ====== LANGUAGE SIDEBAR FUNCTIONS ======
function selectLanguage(language) {
  // Save current conversation before switching
  saveCurrentConversationState();
  
  // Update active language
  currentActiveLanguage = language;
  
  // Update sidebar visual state
  const languageItems = document.querySelectorAll('.language-item');
  languageItems.forEach(item => {
    item.classList.remove('active');
  });
  
  const selectedItem = document.querySelector(`[data-language="${language}"]`);
  if (selectedItem) {
    selectedItem.classList.add('active');
  }
  
  // Update the learning language dropdown to match
  const learningSelect = document.getElementById('learning-language');
  if (learningSelect) {
    learningSelect.value = language;
  }
  
  // Clear and load conversation for this language
  loadConversationForLanguage(language);
  
  // Update speech recognition language if available
  if (typeof updateRecognitionLanguage === 'function') {
    updateRecognitionLanguage();
  }
  
  console.log(`🌍 Switched to ${language}`);
}

// Legacy function for compatibility
function openLanguageTab(language) {
  selectLanguage(language);
}

function saveCurrentConversationState() {
  // Save the current conversation to the appropriate language array
  if (currentActiveLanguage && conversationHistoryByLanguage[currentActiveLanguage]) {
    // Get all messages from the current chat container
    const chatContainer = document.getElementById('chat-messages');
    if (chatContainer) {
      const messages = chatContainer.querySelectorAll('.message');
      conversationHistoryByLanguage[currentActiveLanguage] = Array.from(messages).map(msg => {
        const messageText = msg.querySelector('.message-text')?.textContent || '';
        const sender = msg.classList.contains('user') ? 'user' : 'ai';
        return { message: messageText, sender: sender };
      });
    }
  }
}

function loadConversationForLanguage(language) {
  const chatContainer = document.getElementById('chat-messages');
  if (!chatContainer) return;
  
  // Clear the chat container
  chatContainer.innerHTML = '';
  
  // Load messages for this language from the stored conversation history
  if (conversationHistoryByLanguage[language] && conversationHistoryByLanguage[language].length > 0) {
    conversationHistoryByLanguage[language].forEach(msgData => {
      addMessage(msgData.message, msgData.sender);
    });
  }
}

// Dashboard Functions
// ====== COMPLETE DASHBOARD FUNCTIONALITY ======

function openDashboard() {
  const dashboard = document.getElementById('dashboard-container');
  dashboard.style.display = 'flex';
  loadDashboardData();
  loadFavorites();
  loadLanguageStats();
  loadActivityChart();
}

function closeDashboard() {
  document.getElementById('dashboard-container').style.display = 'none';
}

// Close dashboard when clicking overlay
document.getElementById('dashboard-container')?.addEventListener('click', function(e) {
  if (e.target === this) {
    closeDashboard();
  }
});

// Load complete dashboard data
async function loadDashboardData() {
  if (!db || !window.auth.currentUser) return;
  try {
    const userDoc = await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      const stats = userData.stats || {};
      // Update user info
      document.getElementById('user-email').textContent = userData.email || 'User';
      if (userData.createdAt) {
        const date = userData.createdAt.toDate();
        document.getElementById('member-date').textContent = date.toLocaleDateString();
      }
      // Update stats with animation
      animateValue('streak-value', 0, stats.streak || 0, 1000);
      animateValue('messages-value', 0, stats.totalMessages || 0, 1000);
      animateValue('sessions-value', 0, stats.totalSessions || 0, 1000);
      // Convert minutes to hours and minutes
      const totalMinutes = stats.minutesLearned || 0;
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      document.getElementById('hours-value').textContent = hours;
      document.getElementById('minutes-value').textContent = minutes;
      // Update progress bars
      updateProgressBars(stats);
      // Check achievements
      checkAchievements(stats);
    }
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

// Animate number counting
function animateValue(id, start, end, duration) {
  const element = document.getElementById(id);
  if (!element) return;
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;
  const timer = setInterval(() => {
    current += increment;
    if (current >= end) {
      element.textContent = end;
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
}

// Update progress bars
function updateProgressBars(stats) {
  // Define goals
  const goals = {
    streak: 30,      // 30 day goal
    messages: 500,   // 500 messages goal
    time: 1440,      // 24 hours goal (1440 minutes)
    sessions: 100    // 100 sessions goal
  };
  // Calculate percentages
  const streakPercent = Math.min((stats.streak || 0) / goals.streak * 100, 100);
  const messagesPercent = Math.min((stats.totalMessages || 0) / goals.messages * 100, 100);
  const timePercent = Math.min((stats.minutesLearned || 0) / goals.time * 100, 100);
  const sessionsPercent = Math.min((stats.totalSessions || 0) / goals.sessions * 100, 100);
  // Update progress bars
  document.getElementById('streak-progress').style.width = streakPercent + '%';
  document.getElementById('messages-progress').style.width = messagesPercent + '%';
  document.getElementById('time-progress').style.width = timePercent + '%';
  document.getElementById('sessions-progress').style.width = sessionsPercent + '%';
}

// Check and update achievements
function checkAchievements(stats) {
  const achievements = [
    { id: 'first-steps', stat: 'totalMessages', threshold: 1 },
    { id: 'conversation-starter', stat: 'totalMessages', threshold: 10 },
    { id: 'week-warrior', stat: 'streak', threshold: 7 },
    { id: 'dedicated-learner', stat: 'minutesLearned', threshold: 60 },
    { id: 'century', stat: 'totalMessages', threshold: 100 }
  ];
  achievements.forEach(achievement => {
    const element = document.querySelector(`[data-id="${achievement.id}"]`);
    if (!element) return;
    const current = stats[achievement.stat] || 0;
    const achieved = current >= achievement.threshold;
    element.setAttribute('data-achieved', achieved);
    // Update progress text
    const progressElement = element.querySelector('.achievement-progress');
    if (progressElement) {
      progressElement.textContent = `${Math.min(current, achievement.threshold)}/${achievement.threshold}`;
    }
    // Show unlock animation
    if (achieved && !element.classList.contains('unlocked')) {
      element.classList.add('unlocked');
      showAchievementNotification(element.querySelector('.achievement-name').textContent);
    }
  });
}

// Show achievement notification
function showAchievementNotification(achievementName) {
  const notification = document.createElement('div');
  notification.className = 'achievement-notification';
  notification.innerHTML = `
    <div class="notification-content">
      🏆 Achievement Unlocked!
      <strong>${achievementName}</strong>
    </div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// Load language statistics
async function loadLanguageStats() {
  if (!db || !window.auth.currentUser) return;
  try {
    const conversations = await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('conversations')
      .get();
    const languageCounts = {};
    conversations.forEach(doc => {
      const lang = doc.data().language || 'Unknown';
      languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    });
    const languageFlags = {
      'Spanish': '🇪🇸',
      'French': '🇫🇷',
      'German': '🇩🇪',
      'Italian': '🇮🇹',
      'Portuguese': '🇵🇹',
      'Japanese': '🇯🇵',
      'Korean': '🇰🇷',
      'Chinese': '🇨🇳'
    };
    const container = document.getElementById('language-stats');
    container.innerHTML = '';
    Object.entries(languageCounts).forEach(([lang, count]) => {
      const stat = document.createElement('div');
      stat.className = 'language-stat';
      stat.innerHTML = `
        <div class="language-flag">${languageFlags[lang] || '🌐'}</div>
        <div class="language-name">${lang}</div>
        <div class="language-count">${count} messages</div>
      `;
      container.appendChild(stat);
    });
    // Update polyglot achievement
    const languageCount = Object.keys(languageCounts).length;
    if (languageCount >= 3) {
      document.querySelector('[data-id="polyglot"]')?.setAttribute('data-achieved', 'true');
    }
  } catch (error) {
    console.error('Error loading language stats:', error);
  }
}

// Load favorite phrases
async function loadFavorites() {
  if (!db || !window.auth.currentUser) return;
  try {
    const favorites = await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('favorites')
      .orderBy('savedAt', 'desc')
      .limit(10)
      .get();
    const container = document.getElementById('favorites-list');
    if (favorites.empty) {
      container.innerHTML = '<div class="empty-state"><p>No saved phrases yet. Click the ⭐ on any message to save it!</p></div>';
      return;
    }
    container.innerHTML = '';
    favorites.forEach(doc => {
      const data = doc.data();
      const item = document.createElement('div');
      item.className = 'favorite-item';
      item.innerHTML = `
        <div class="favorite-content">
          <div class="favorite-phrase">${data.phrase}</div>
          <div class="favorite-translation">${data.translation || ''}</div>
        </div>
        <div class="favorite-meta">
          <span class="favorite-language">${data.language}</span>
          <button class="remove-btn" onclick="removeFavorite('${doc.id}')">🗑️</button>
        </div>
      `;
      container.appendChild(item);
    });
  } catch (error) {
    console.error('Error loading favorites:', error);
  }
}

// Load activity chart (last 7 days)
async function loadActivityChart() {
  if (!db || !window.auth.currentUser) return;
  const container = document.getElementById('activity-chart');
  container.innerHTML = '';
  // Create last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const day = document.createElement('div');
    day.className = 'activity-day';
    day.setAttribute('data-tooltip', date.toLocaleDateString());
    // Check if user was active on this day (simplified)
    // In production, you'd query Firestore for activity on specific dates
    if (Math.random() > 0.5) { // Placeholder - replace with real data
      day.classList.add('active');
    }
    container.appendChild(day);
  }
}

// Export favorites
async function exportFavorites() {
  if (!db || !window.auth.currentUser) return;
  try {
    const favorites = await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('favorites')
      .orderBy('savedAt', 'desc')
      .get();
    let content = 'MY FAVORITE PHRASES\n';
    content += '==================\n\n';
    favorites.forEach(doc => {
      const data = doc.data();
      content += `Language: ${data.language}\n`;
      content += `Phrase: ${data.phrase}\n`;
      if (data.translation) {
        content += `Translation: ${data.translation}\n`;
      }
      content += '---\n\n';
    });
    // Create download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'favorite_phrases.txt';
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting favorites:', error);
  }
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
window.openDashboard = openDashboard;
window.closeDashboard = closeDashboard;
window.speakMessage = speakMessage;
window.favoriteMessage = favoriteMessage;

// ====== COMPLETE WEB SPEECH API IMPLEMENTATION ======

// Voice recognition variables

// Initialize Speech Recognition
function initSpeechRecognition() {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    // Configure recognition
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    // Set language based on selected target language
    updateRecognitionLanguage();
    // Event handlers
    recognition.onstart = () => {
      isListening = true;
      updateMicButton(true);
      updateVoiceStatus('🎤 Listening...');
      console.log('Voice recognition started');
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      document.getElementById('messageInput').value = transcript;
      if (event.results[0].isFinal) {
        console.log(`Final transcript: ${transcript} (confidence: ${confidence})`);
        updateVoiceStatus(`Recognized: "${transcript}"`);
        // Auto-send in pronunciation mode
        if (pronunciationModeEnabled && confidence > 0.7) {
          setTimeout(() => sendMessage(), 500);
        }
      }
    };
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      isListening = false;
      updateMicButton(false);
      let errorMessage = '';
      switch(event.error) {
        case 'no-speech':
          errorMessage = 'No speech detected. Try again.';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone access denied.';
          break;
        case 'network':
          errorMessage = 'Network error. Check connection.';
          break;
        default:
          errorMessage = `Error: ${event.error}`;
      }
      updateVoiceStatus(errorMessage);
    };
    recognition.onend = () => {
      isListening = false;
      updateMicButton(false);
      updateVoiceStatus('');
      console.log('Voice recognition ended');
    };
    return true;
  }
  return false;
}

// Update recognition language
function updateRecognitionLanguage() {
  if (!recognition) return;
  const targetLanguage = document.getElementById('targetLanguage')?.value || 'Spanish';
  const langCodes = {
    'Spanish': 'es-ES',
    'French': 'fr-FR',
    'German': 'de-DE',
    'Italian': 'it-IT',
    'Portuguese': 'pt-PT',
    'Japanese': 'ja-JP',
    'Korean': 'ko-KR',
    'Chinese': 'zh-CN',
    'English': 'en-US'
  };
  recognition.lang = langCodes[targetLanguage] || 'en-US';
  console.log('Recognition language set to:', recognition.lang);
}

// Toggle voice input
function toggleVoiceInput() {
  if (!recognition) {
    if (!initSpeechRecognition()) {
      alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }
  }
  if (isListening) {
    recognition.stop();
  } else {
    updateRecognitionLanguage();
    try {
      recognition.start();
    } catch (error) {
      console.error('Failed to start recognition:', error);
      updateVoiceStatus('Failed to start microphone');
    }
  }
}

// Update mic button appearance
function updateMicButton(listening) {
  const micBtn = document.getElementById('micButton');
  if (!micBtn) return;
  if (listening) {
    micBtn.classList.add('listening');
    micBtn.innerHTML = '🔴';
    micBtn.title = 'Stop listening';
  } else {
    micBtn.classList.remove('listening');
    micBtn.innerHTML = '🎤';
    micBtn.title = 'Start voice input';
  }
}

// Update voice status
function updateVoiceStatus(status) {
  const statusElement = document.getElementById('voice-status');
  if (statusElement) {
    statusElement.textContent = status;
    statusElement.style.display = status ? 'block' : 'none';
  }
}

// ====== TEXT TO SPEECH IMPLEMENTATION ======

function speakText(text, language) {
  if (!('speechSynthesis' in window)) {
    console.log('Text-to-speech not supported');
    return;
  }
  
  // Wait for any pending speech to complete before starting new one
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    // Small delay to ensure cancellation completes
    setTimeout(() => speakText(text, language), 100);
    return;
  }
  
  const utterance = new SpeechSynthesisUtterance(text);
  const langCodes = {
    'Spanish': 'es-ES',
    'French': 'fr-FR',
    'German': 'de-DE',
    'Italian': 'it-IT',
    'Portuguese': 'pt-PT',
    'Japanese': 'ja-JP',
    'Korean': 'ko-KR',
    'Chinese': 'zh-CN',
    'English': 'en-US'
  };
  utterance.lang = langCodes[language] || 'en-US';
  utterance.rate = slowModeEnabled ? 0.7 : 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;
  utterance.onstart = () => {
    console.log('Speaking:', text.substring(0, 50) + '...');
    updateVoiceStatus('🔊 Speaking...');
  };
  utterance.onend = () => {
    console.log('Finished speaking');
    updateVoiceStatus('');
  };
  utterance.onerror = (event) => {
    // Only log non-interruption errors to reduce console spam
    if (event.error !== 'interrupted') {
      console.error('Speech synthesis error:', event.error);
    }
    updateVoiceStatus('');
  };
  window.speechSynthesis.speak(utterance);
}

// Toggle auto-speak mode
function toggleAutoSpeak() {
  autoSpeakEnabled = !autoSpeakEnabled;
  const btn = event.target;
  if (autoSpeakEnabled) {
    btn.classList.add('active');
    updateVoiceStatus('🔊 Auto-speak enabled');
  } else {
    btn.classList.remove('active');
    updateVoiceStatus('Auto-speak disabled');
  }
  // Save preference
  if (window.auth.currentUser && db) {
    db.collection('users').doc(window.auth.currentUser.uid).update({
      'preferences.autoSpeak': autoSpeakEnabled
    }).catch(console.error);
  }
}

// Toggle slow mode
function toggleSlowMode() {
  slowModeEnabled = !slowModeEnabled;
  const btn = event.target;
  if (slowModeEnabled) {
    btn.classList.add('active');
    updateVoiceStatus('🐢 Slow mode enabled');
  } else {
    btn.classList.remove('active');
    updateVoiceStatus('Normal speed');
  }
}

// Toggle pronunciation mode
function togglePronunciationMode() {
  pronunciationModeEnabled = !pronunciationModeEnabled;
  const btn = event.target;
  if (pronunciationModeEnabled) {
    btn.classList.add('active');
    updateVoiceStatus('🎯 Pronunciation mode active');
    addSystemMessage('Pronunciation Mode Active! I\'ll focus on helping you with pronunciation. Try speaking clearly and I\'ll give you feedback.');
  } else {
    btn.classList.remove('active');
    updateVoiceStatus('Pronunciation mode off');
  }
}

// ====== ENHANCED MESSAGE FUNCTIONS ======

window.addMessage = function(message, sender) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // Add buttons to messages
    const messageHTML = `
        <div class="message-content">
            <div class="message-text">${message}</div>
            <div class="message-actions">
                <button class="message-speaker-btn" onclick="speakMessage('${message.replace(/'/g, "\\'")}', '${sender}')">🔊</button>
                <button class="message-favorite-btn" onclick="favoriteMessage('${message.replace(/'/g, "\\'")}', '${sender}')">⭐</button>
            </div>
            <div class="message-time">${timestamp}</div>
        </div>
    `;
    messageDiv.innerHTML = messageHTML;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    // Auto-speak if enabled
    if (sender === 'ai' && autoSpeakEnabled) {
        const targetLanguage = document.getElementById('targetLanguage')?.value || 'Spanish';
        setTimeout(() => speakText(message, targetLanguage), 500);
    }
    if (db && window.auth.currentUser) {
        const targetLanguage = document.getElementById('targetLanguage')?.value || 'Spanish';
        saveMessageToFirestore(message, sender, targetLanguage);
    }
};

// Speak a specific message
function speakMessage(message, sender) {
    const targetLanguage = document.getElementById('targetLanguage')?.value || 'Spanish';
    speakText(message, targetLanguage);
}

// Favorite a message
async function favoriteMessage(message, sender) {
    if (!db || !window.auth.currentUser) {
        alert('Please sign in to save favorites');
        return;
    }
    
    const targetLanguage = document.getElementById('targetLanguage')?.value || 'Spanish';
    
    try {
        await db.collection('users')
            .doc(window.auth.currentUser.uid)
            .collection('favorites')
            .add({
                phrase: message,
                sender: sender,
                language: targetLanguage,
                savedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        
        // Visual feedback
        alert('⭐ Phrase saved to favorites!');
    } catch (error) {
        console.error('Error saving favorite:', error);
    }
}

async function removeFavorite(favoriteId) {
  if (!db || !window.auth.currentUser) return;
  try {
    await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('favorites')
      .doc(favoriteId)
      .delete();
    loadFavorites();
    showNotification('🗑️ Favorite removed');
  } catch (error) {
    console.error('Error removing favorite:', error);
  }
}

function addSystemMessage(message) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message system-message';
  messageDiv.innerHTML = `
    <div class="system-content">
      <span class="system-icon">ℹ️</span>
      <span>${message}</span>
    </div>
  `;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideInRight 0.3s ease;
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ====== PRONUNCIATION FEEDBACK ======

function analyzePronunciation(transcript, confidence) {
  if (!pronunciationModeEnabled) return;
  let feedback = '';
  if (confidence > 0.9) {
    feedback = '🎉 Excellent pronunciation!';
  } else if (confidence > 0.7) {
    feedback = '👍 Good pronunciation! Keep practicing.';
  } else if (confidence > 0.5) {
    feedback = '🤔 Try speaking more clearly. Focus on each syllable.';
  } else {
    feedback = '💪 Keep trying! Speak slowly and clearly.';
  }
  addSystemMessage(feedback);
}

// ====== INITIALIZATION ======

document.addEventListener('DOMContentLoaded', function() {
  // Check browser support
  const speechRecognitionSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  const speechSynthesisSupported = 'speechSynthesis' in window;
  console.log('Voice Features Status:');
  console.log('- Speech Recognition:', speechRecognitionSupported ? '✅ Supported' : '❌ Not supported');
  console.log('- Text-to-Speech:', speechSynthesisSupported ? '✅ Supported' : '❌ Not supported');
  // Load user preferences
  if (window.auth && db) {
    window.auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const userDoc = await db.collection('users').doc(user.uid).get();
          if (userDoc.exists) {
            const prefs = userDoc.data().preferences || {};
            autoSpeakEnabled = prefs.autoSpeak || false;
            // Update UI
            if (autoSpeakEnabled) {
              document.querySelector('[onclick="toggleAutoSpeak()"]')?.classList.add('active');
            }
          }
        } catch (error) {
          console.error('Error loading preferences:', error);
        }
      }
    });
  }
  // Add keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + M: Toggle microphone
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
      e.preventDefault();
      toggleVoiceInput();
    }
    // Ctrl/Cmd + S: Toggle auto-speak
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      toggleAutoSpeak();
    }
  });
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOutRight {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
  .system-message {
    background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
    color: white;
    text-align: center;
    padding: 10px;
    margin: 10px 0;
    border-radius: 10px;
  }
  .system-content {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .message-actions {
    display: inline-flex;
    gap: 5px;
    margin-left: 10px;
  }
  .message-favorite-btn {
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.3;
    transition: opacity 0.3s;
  }
  .message-favorite-btn:hover {
    opacity: 1;
  }
  .achievement-notification {
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%);
    color: white;
    padding: 20px;
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    z-index: 10001;
    animation: bounceIn 0.5s ease;
  }
  @keyframes bounceIn {
    0% { transform: scale(0.5) rotate(-10deg); opacity: 0; }
    50% { transform: scale(1.1) rotate(5deg); }
    100% { transform: scale(1) rotate(0); opacity: 1; }
  }
`;
document.head.appendChild(style);

console.log('✅ Dashboard and Voice Features fully loaded!');
// Make all voice functions globally accessible (for HTML onclick)
if (typeof window !== 'undefined') {
  window.toggleVoiceInput = toggleVoiceInput;
  window.togglePronunciationMode = togglePronunciationMode;
  window.toggleAutoSpeak = toggleAutoSpeak;
  window.toggleSlowMode = toggleSlowMode;
}