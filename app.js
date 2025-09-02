// Keep conversation history for better context

// ====== GLOBAL VARIABLES ======
let conversationHistory = [];
let recognition = null;
let isListening = false;
let autoSpeakEnabled = false;
let slowModeEnabled = false;
let pronunciationModeEnabled = false;

// Language codes for speech recognition and synthesis
const LANGUAGE_CODES = {
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

// ====== VOCABULARY TRACKING VARIABLES ======
let learnedVocabulary = {}; // Cache for learned vocabulary by language
let vocabularySuggestions = []; // Current suggestions
let isShowingSuggestions = false;
let selectedSuggestionIndex = -1;

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
    window.auth.onAuthStateChanged(async (user) => {
      if (user) {
        console.log('User authenticated:', user.email);
        createUserProfile(user);
        updateStreak();
        initializeSidebar(); // Initialize sidebar
        initializeWordSuggestions(); // Initialize word suggestions
        setTimeout(() => {
          loadConversationHistory();
          recalculateMessageCount(); // Fix any incorrect message counts
        }, 1000);
        // Load user preferences
        await loadUserPreferences(user);
        showChatInterface();
      } else {
        console.log('User signed out');
        showAuthInterface();
      }
    });

    setupEventListeners();
    
    // Initialize voice features, keyboard shortcuts, and UI setup
    initializeVoiceFeatures();
    setupKeyboardShortcuts();
    setupUIAndGlobals();

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
        // Only increment totalMessages counter for user messages (conversation exchanges)
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

// Function to recalculate accurate message count from database
async function recalculateMessageCount() {
    if (!db || !window.auth.currentUser) return;
    try {
        // Count only user messages (conversation exchanges)
        const snapshot = await db.collection('users')
            .doc(window.auth.currentUser.uid)
            .collection('conversations')
            .where('sender', '==', 'user')
            .get();
        
        const actualCount = snapshot.size;
        
        // Update the user's stats with the correct count
        const userRef = db.collection('users').doc(window.auth.currentUser.uid);
        await userRef.update({
            'stats.totalMessages': actualCount
        });
        
        console.log(`✅ Message count corrected: ${actualCount} conversations`);
        return actualCount;
    } catch (error) {
        console.error('Error recalculating message count:', error);
        return null;
    }
}

// Manual function to fix message count with user feedback
async function fixMessageCount() {
    addSystemMessage('🔧 Recalculating message count...');
    
    const correctedCount = await recalculateMessageCount();
    
    if (correctedCount !== null) {
        addSystemMessage(`✅ Message count fixed! You have ${correctedCount} conversation exchanges.`);
        
        // Refresh dashboard if it's open
        const dashboard = document.getElementById('dashboard-container');
        if (dashboard && dashboard.style.display !== 'none') {
            setTimeout(() => {
                loadDashboardData();
            }, 500);
        }
    } else {
        addSystemMessage('❌ Failed to fix message count. Please try again.');
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
        
        // Store conversation history by language but don't display yet
        Object.keys(messagesByLanguage).forEach(language => {
            if (conversationHistoryByLanguage[language]) {
                // Store messages in correct order (oldest first)
                const messages = messagesByLanguage[language].reverse();
                conversationHistoryByLanguage[language] = messages.map(msg => ({
                    message: msg.message,
                    sender: msg.sender
                }));
            }
        });
        
        // Load conversation for the current active language
        loadConversationForLanguage(currentActiveLanguage);
        
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

// ====== VOCABULARY TRACKING SYSTEM ======

// Save learned vocabulary from conversation summaries
async function saveLearnedVocabulary(phrases, language) {
    if (!db || !window.auth.currentUser || !phrases || phrases.length === 0) return;
    
    try {
        const batch = db.batch();
        const vocabRef = db.collection('users')
            .doc(window.auth.currentUser.uid)
            .collection('vocabulary');
        
        for (const phrase of phrases) {
            // Check if phrase already exists
            const existingDoc = await vocabRef
                .where('phrase', '==', phrase)
                .where('language', '==', language)
                .get();
            
            if (existingDoc.empty) {
                // Add new vocabulary entry
                const docRef = vocabRef.doc();
                batch.set(docRef, {
                    phrase: phrase,
                    language: language,
                    learnedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    usageCount: 0,
                    lastUsed: null,
                    isActive: false // Starts as passive vocabulary
                });
            }
        }
        
        await batch.commit();
        console.log('✅ Learned vocabulary saved:', phrases);
        
        // Update local cache by reloading vocabulary for this language
        await loadLearnedVocabulary(language);
    } catch (error) {
        console.error('Error saving learned vocabulary:', error);
    }
}

// Load learned vocabulary for a language
async function loadLearnedVocabulary(language) {
    if (!db || !window.auth.currentUser) return;
    
    try {
        const snapshot = await db.collection('users')
            .doc(window.auth.currentUser.uid)
            .collection('vocabulary')
            .where('language', '==', language)
            .orderBy('learnedAt', 'desc')
            .get();
        
        const vocabulary = [];
        snapshot.forEach(doc => {
            vocabulary.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Update cache
        learnedVocabulary[language] = vocabulary;
        console.log(`📚 Loaded ${vocabulary.length} vocabulary items for ${language}`);
        
        return vocabulary;
    } catch (error) {
        console.error('Error loading learned vocabulary:', error);
        return [];
    }
}

// Mark vocabulary as actively used
async function markVocabularyAsActive(phrase, language) {
    if (!db || !window.auth.currentUser) return;
    
    try {
        const snapshot = await db.collection('users')
            .doc(window.auth.currentUser.uid)
            .collection('vocabulary')
            .where('phrase', '==', phrase)
            .where('language', '==', language)
            .get();
        
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            await doc.ref.update({
                usageCount: firebase.firestore.FieldValue.increment(1),
                lastUsed: firebase.firestore.FieldValue.serverTimestamp(),
                isActive: true
            });
            
            console.log('✅ Vocabulary marked as active:', phrase);
            
            // Update local cache
            const cachedVocab = learnedVocabulary[language];
            if (cachedVocab) {
                const item = cachedVocab.find(v => v.phrase === phrase);
                if (item) {
                    item.usageCount = (item.usageCount || 0) + 1;
                    item.isActive = true;
                }
            }
        }
    } catch (error) {
        console.error('Error marking vocabulary as active:', error);
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

// ====== REMOVE DUPLICATE SENDMESSAGE WRAPPER ======
// This wrapper was causing duplication - removed to fix the issue

// ====== MESSAGE HANDLING UTILITIES ======
// WARNING: Do not re-introduce duplicate message handling functions!
// The functions below provide centralized, secure message handling to prevent duplication.

/**
 * Sanitizes message content to prevent XSS attacks and ensure safe display.
 * @param {string} message - The message content to sanitize
 * @returns {string} Sanitized message content
 */
function sanitizeMessageContent(message) {
    if (!message) return '';
    
    // Create a temporary element to safely escape HTML
    const temp = document.createElement('div');
    temp.textContent = message;
    let sanitized = temp.innerHTML;
    
    // Additional sanitization for common patterns
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/data:/gi, '');
    sanitized = sanitized.replace(/vbscript:/gi, '');
    
    return sanitized;
}

/**
 * Creates a message DOM element with proper structure and event handlers.
 * @param {string} message - The sanitized message content
 * @param {string} sender - The message sender ('user' or 'ai')
 * @returns {HTMLElement} The created message element
 */
function createMessageElement(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', sender);
    messageDiv.setAttribute('data-message-id', generateMessageId());
    
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Use safer event handlers instead of inline onclick
    const messageHTML = `
        <div class="message-content">
            <div class="message-text">${message}</div>
            <div class="message-actions">
                <button class="message-speaker-btn" title="Speak this message">🔊</button>
                <button class="message-favorite-btn" title="Add to favorites">⭐</button>
            </div>
            <div class="message-time">${timestamp}</div>
        </div>
    `;
    
    messageDiv.innerHTML = messageHTML;
    
    // Add event listeners safely
    const speakerBtn = messageDiv.querySelector('.message-speaker-btn');
    const favoriteBtn = messageDiv.querySelector('.message-favorite-btn');
    
    if (speakerBtn) {
        speakerBtn.addEventListener('click', () => speakMessage(message, sender));
    }
    
    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', () => favoriteMessage(message, sender));
    }
    
    return messageDiv;
}

/**
 * Adds a message element to the chat with smooth animation.
 * @param {HTMLElement} chatMessages - The chat messages container
 * @param {HTMLElement} messageDiv - The message element to add
 */
function addMessageWithAnimation(chatMessages, messageDiv) {
    // Add loading class for animation
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(20px)';
    
    chatMessages.appendChild(messageDiv);
    
    // Trigger smooth entrance animation
    requestAnimationFrame(() => {
        messageDiv.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateY(0)';
    });
    
    // Smooth scroll to bottom
    chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: 'smooth'
    });
}

/**
 * Handles message persistence to Firestore with retry logic and error handling.
 * @param {string} message - The message content
 * @param {string} sender - The message sender
 */
async function handleMessagePersistence(message, sender) {
    try {
        if (!db || !window.auth.currentUser) {
            console.warn('Database or authentication not available for message persistence');
            return;
        }
        
        // Show loading indicator
        showSaveIndicator(true);
        
        const targetLanguage = document.getElementById('targetLanguage')?.value || currentActiveLanguage || 'Spanish';
        
        // Attempt to save with retry logic
        await saveMessageWithRetry(message, sender, targetLanguage);
        
        // Show success indicator
        showSaveIndicator(false, true);
        
    } catch (error) {
        console.error('Failed to persist message:', error);
        showSaveIndicator(false, false);
        showErrorNotification('Failed to save message to database');
        
        // Queue for offline sync if network issues
        queueOfflineMessage(message, sender);
    }
}

/**
 * Schedules auto-speak functionality for AI messages.
 * @param {string} message - The message to speak
 */
function scheduleAutoSpeak(message) {
    const targetLanguage = currentActiveLanguage || 'Spanish';
    setTimeout(() => {
        try {
            speakText(message, targetLanguage);
        } catch (error) {
            console.error('Failed to auto-speak message:', error);
        }
    }, 500);
}

/**
 * Generates a unique message ID for tracking and debugging.
 * @returns {string} Unique message identifier
 */
function generateMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper function for auth validation
function validateAuthInput() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    document.getElementById('auth-error').textContent = 'Please fill in all fields';
    return null;
  }

  if (!window.auth) {
    document.getElementById('auth-error').textContent = 'Authentication service not ready. Please wait and try again.';
    return null;
  }
  
  // Clear any previous errors
  document.getElementById('auth-error').textContent = '';
  return { email, password };
}

// Helper function for notification styling
function getNotificationBaseStyles() {
  return `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    z-index: 10000;
  `;
}

// GLOBAL Authentication Functions (accessible to HTML onclick)
function signUp() {
  const credentials = validateAuthInput();
  if (!credentials) return;
  
  window.auth.createUserWithEmailAndPassword(credentials.email, credentials.password)
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
  const credentials = validateAuthInput();
  if (!credentials) return;
  
  window.auth.signInWithEmailAndPassword(credentials.email, credentials.password)
    .then((userCredential) => {
      console.log('✅ User signed in:', userCredential.user.email);
      showChatInterface();
    })
    .catch((error) => {
      console.error('❌ Sign in error:', error);
      document.getElementById('auth-error').textContent = getReadableError(error.code);
    });
}

async function signOut() {
  if (!window.auth) {
    alert('Authentication service not ready. Please wait and try again.');
    return;
  }
  
  // Check if there are conversations to summarize before signing out
  const languagesWithMessages = Object.keys(conversationHistoryByLanguage).filter(
    lang => conversationHistoryByLanguage[lang] && conversationHistoryByLanguage[lang].length >= 4
  );
  
  if (languagesWithMessages.length > 0) {
    const generateSummary = confirm(
      `📚 You have active conversations in ${languagesWithMessages.join(', ')}.\n\nWould you like to generate learning summaries before signing out?`
    );
    
    if (generateSummary) {
      for (const language of languagesWithMessages) {
        await generateAndSaveSummary(language);
      }
    }
  }
  
  window.auth.signOut().then(() => {
    console.log('✅ User signed out');
    conversationHistory = []; // Clear conversation when signing out
    // Clear conversation history by language to prevent duplication on re-login
    conversationHistoryByLanguage = {
      'Spanish': [],
      'French': [],
      'German': [],
      'Italian': [],
      'Portuguese': [],
      'Japanese': [],
      'Korean': [],
      'Chinese': []
    };
    const chatMessages = document.getElementById('chat-messages');
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

/**
 * Adds a message to the chat interface with proper validation, error handling, and database persistence.
 * This is the central message handling function that prevents duplication by managing both UI display
 * and database saves in a coordinated manner.
 * 
 * @param {string} message - The message content to display
 * @param {string} sender - The sender type ('user' or 'ai')
 * @param {boolean} [shouldAutoSpeak=true] - Whether to auto-speak AI messages and save to database.
 *                                          Set to false when loading existing messages to prevent re-saving.
 * @throws {Error} When message parameters are invalid or DOM manipulation fails
 * 
 * @example
 * // Add a new user message (will be saved to database)
 * addMessage("Hello!", "user");
 * 
 * @example
 * // Load existing message from database (won't be re-saved)
 * addMessage("Hello!", "user", false);
 */
async function addMessage(message, sender, shouldAutoSpeak = true) {
    // Initialize MessageHandler if not already done
    if (!window.messageHandler) {
        window.messageHandler = new MessageHandler();
    }
    
    // Use the enhanced MessageHandler for all message operations
    return await window.messageHandler.addMessage(message, sender, shouldAutoSpeak);
}

// Legacy function for compatibility
function addMessageToLanguageTab(message, sender, language) {
    addMessage(message, sender);
}

function showTypingIndicator() {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) {
    console.error('Chat messages container not found');
    return;
  }
  
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

async function clearChat() {
  // Generate summary before clearing if there are enough messages
  const currentMessages = conversationHistoryByLanguage[currentActiveLanguage] || [];
  let shouldGenerateSummary = currentMessages.length >= 4; // At least 2 exchanges
  
  if (shouldGenerateSummary) {
    const generateSummary = confirm(
      `📚 You have ${currentMessages.length} messages in this ${currentActiveLanguage} conversation.\n\nWould you like to generate a learning summary before clearing?`
    );
    
    if (generateSummary) {
      await generateAndSaveSummary(currentActiveLanguage);
    }
  }

  // Show confirmation dialog since this is permanent
  const confirmClear = confirm(
    `⚠️ Are you sure you want to permanently delete all ${currentActiveLanguage} conversation messages?\n\nThis action cannot be undone.`
  );
  
  if (!confirmClear) {
    console.log('Chat clear cancelled by user');
    return;
  }
  
  // Show loading message
  addSystemMessage(`Clearing ${currentActiveLanguage} conversation...`);
  
  const chatMessages = document.getElementById('chat-messages');
  if (chatMessages) {
    chatMessages.innerHTML = '';
  }
  
  // Clear the conversation history for the current language
  if (conversationHistoryByLanguage[currentActiveLanguage]) {
    conversationHistoryByLanguage[currentActiveLanguage] = [];
  }
  
  // Keep backward compatibility
  conversationHistory = [];
  
  // Delete messages from Firebase for the current language
  await clearChatFromDatabase(currentActiveLanguage);
  
  console.log('✅ Chat cleared permanently for', currentActiveLanguage);
}

async function clearChatFromDatabase(language) {
  if (!db || !window.auth.currentUser) {
    console.log('No database connection or user not authenticated');
    return;
  }
  
  try {
    const conversationsRef = db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('conversations');
    
    // Query for messages in the specific language
    const snapshot = await conversationsRef.where('language', '==', language).get();
    
    if (snapshot.empty) {
      console.log(`No messages found for language: ${language}`);
      addSystemMessage(`✅ ${language} conversation was already empty`);
      return;
    }
    
    // Delete all messages for this language in batches
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`✅ Successfully deleted ${snapshot.docs.length} messages for ${language} from database`);
    
    // Show success message to user
    addSystemMessage(`✅ Successfully cleared ${snapshot.docs.length} ${language} messages permanently`);
    
  } catch (error) {
    console.error('❌ Error clearing chat from database:', error);
    // Show user-friendly error message
    addSystemMessage(`❌ Failed to permanently delete messages. Error: ${error.message}`);
  }
}

// Handle Enter key press in message input
function handleKeyPress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  } else if (event.key === 'ArrowDown' && isShowingSuggestions) {
    event.preventDefault();
    navigateSuggestions(1);
  } else if (event.key === 'ArrowUp' && isShowingSuggestions) {
    event.preventDefault();
    navigateSuggestions(-1);
  } else if (event.key === 'Tab' && isShowingSuggestions && selectedSuggestionIndex >= 0) {
    event.preventDefault();
    selectSuggestion(selectedSuggestionIndex);
  } else if (event.key === 'Escape' && isShowingSuggestions) {
    hideSuggestions();
  }
}

// ====== WORD SUGGESTION SYSTEM ======

// Initialize word suggestions when page loads
function initializeWordSuggestions() {
  const messageInput = document.getElementById('messageInput');
  if (messageInput) {
    // Add input event listener for real-time suggestions
    messageInput.addEventListener('input', handleInputChange);
    messageInput.addEventListener('focus', handleInputFocus);
    messageInput.addEventListener('blur', handleInputBlur);
    
    // Create suggestions container
    createSuggestionsContainer();
  }
}

// Handle input changes for word suggestions
function handleInputChange(event) {
  const input = event.target.value;
  const cursorPos = event.target.selectionStart;
  
  // Get the current word being typed
  const currentWord = getCurrentWord(input, cursorPos);
  
  if (currentWord && currentWord.length >= 2) {
    showWordSuggestions(currentWord);
  } else {
    hideSuggestions();
  }
}

// Get the current word being typed at cursor position
function getCurrentWord(text, cursorPos) {
  const beforeCursor = text.substring(0, cursorPos);
  const afterCursor = text.substring(cursorPos);
  
  // Find word boundaries
  const wordStart = beforeCursor.search(/\S+$/);
  const wordEnd = afterCursor.search(/\s/);
  
  if (wordStart === -1) return '';
  
  const start = wordStart;
  const end = cursorPos + (wordEnd === -1 ? afterCursor.length : wordEnd);
  
  return text.substring(start, end).trim();
}

// Show word suggestions based on input
function showWordSuggestions(currentWord) {
  const targetLanguage = document.getElementById('targetLanguage').value;
  const vocabulary = learnedVocabulary[targetLanguage] || [];
  
  // Filter vocabulary based on current input
  const suggestions = vocabulary.filter(item => {
    return item.phrase.toLowerCase().includes(currentWord.toLowerCase()) ||
           item.phrase.toLowerCase().startsWith(currentWord.toLowerCase());
  }).slice(0, 5); // Limit to 5 suggestions
  
  if (suggestions.length > 0) {
    displaySuggestions(suggestions);
  } else {
    hideSuggestions();
  }
}

// Display suggestions in UI
function displaySuggestions(suggestions) {
  const container = document.getElementById('suggestions-container');
  if (!container) return;
  
  vocabularySuggestions = suggestions;
  selectedSuggestionIndex = -1;
  isShowingSuggestions = true;
  
  container.innerHTML = '';
  container.style.display = 'block';
  
  suggestions.forEach((suggestion, index) => {
    const suggestionElement = document.createElement('div');
    suggestionElement.className = 'suggestion-item';
    suggestionElement.setAttribute('data-index', index);
    
    // Calculate how long ago it was learned
    const learnedDate = suggestion.learnedAt?.toDate ? suggestion.learnedAt.toDate() : new Date();
    const daysAgo = Math.floor((new Date() - learnedDate) / (1000 * 60 * 60 * 24));
    const timeAgo = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
    
    // Status indicator
    const statusIcon = suggestion.isActive ? '🔥' : '💤';
    const statusText = suggestion.isActive ? 'Active' : 'Passive';
    const usageCount = suggestion.usageCount || 0;
    
    suggestionElement.innerHTML = `
      <div class="suggestion-phrase">${suggestion.phrase}</div>
      <div class="suggestion-meta">
        <span class="suggestion-learned">📚 Learned ${timeAgo}</span>
        <span class="suggestion-status">${statusIcon} ${statusText}</span>
        <span class="suggestion-usage">Used ${usageCount}x</span>
      </div>
    `;
    
    suggestionElement.addEventListener('click', () => selectSuggestion(index));
    suggestionElement.addEventListener('mouseenter', () => {
      selectedSuggestionIndex = index;
      updateSuggestionSelection();
    });
    
    container.appendChild(suggestionElement);
  });
}

// Navigate through suggestions with arrow keys
function navigateSuggestions(direction) {
  if (vocabularySuggestions.length === 0) return;
  
  selectedSuggestionIndex += direction;
  
  if (selectedSuggestionIndex < 0) {
    selectedSuggestionIndex = vocabularySuggestions.length - 1;
  } else if (selectedSuggestionIndex >= vocabularySuggestions.length) {
    selectedSuggestionIndex = 0;
  }
  
  updateSuggestionSelection();
}

// Update visual selection of suggestions
function updateSuggestionSelection() {
  const container = document.getElementById('suggestions-container');
  if (!container) return;
  
  const items = container.querySelectorAll('.suggestion-item');
  items.forEach((item, index) => {
    item.classList.toggle('selected', index === selectedSuggestionIndex);
  });
}

// Select a suggestion and insert it into the input
function selectSuggestion(index) {
  if (index < 0 || index >= vocabularySuggestions.length) return;
  
  const suggestion = vocabularySuggestions[index];
  const messageInput = document.getElementById('messageInput');
  const cursorPos = messageInput.selectionStart;
  const text = messageInput.value;
  
  // Find the current word boundaries
  const beforeCursor = text.substring(0, cursorPos);
  const afterCursor = text.substring(cursorPos);
  const wordStart = beforeCursor.search(/\S+$/);
  const wordEnd = afterCursor.search(/\s/);
  
  if (wordStart !== -1) {
    const beforeWord = text.substring(0, wordStart);
    const afterWord = wordEnd === -1 ? '' : afterCursor.substring(wordEnd);
    
    // Replace the current word with the suggestion
    messageInput.value = beforeWord + suggestion.phrase + afterWord;
    
    // Set cursor position after the inserted phrase
    const newCursorPos = beforeWord.length + suggestion.phrase.length;
    messageInput.setSelectionRange(newCursorPos, newCursorPos);
    
    // Mark vocabulary as actively used (async operation)
    const targetLanguage = document.getElementById('targetLanguage').value;
    markVocabularyAsActive(suggestion.phrase, targetLanguage).catch(error => {
      console.error('Error marking vocabulary as active:', error);
    });
    
    // Show encouragement message
    showEncouragementMessage(suggestion);
  }
  
  hideSuggestions();
  messageInput.focus();
}

// Show encouragement message when using learned vocabulary
function showEncouragementMessage(suggestion) {
  if (!suggestion || !suggestion.phrase) return; // Safety check
  
  const isFirstTimeActive = !suggestion.isActive;
  let message = '';
  
  if (isFirstTimeActive) {
    message = `🎉 Great! You just activated "${suggestion.phrase}" from passive to active vocabulary!`;
  } else {
    message = `🔥 Nice use of "${suggestion.phrase}" - building your active vocabulary!`;
  }
  
  // Show temporary message
  const messageContainer = document.createElement('div');
  messageContainer.className = 'encouragement-message';
  messageContainer.textContent = message;
  
  const chatContainer = document.querySelector('.chat-messages');
  if (chatContainer) {
    chatContainer.appendChild(messageContainer);
    
    // Remove after 3 seconds
    setTimeout(() => {
      messageContainer.remove();
    }, 3000);
  }
}

// Hide suggestions
function hideSuggestions() {
  const container = document.getElementById('suggestions-container');
  if (container) {
    container.style.display = 'none';
    isShowingSuggestions = false;
    selectedSuggestionIndex = -1;
    vocabularySuggestions = [];
  }
}

// Handle input focus
function handleInputFocus() {
  // Load vocabulary for current language if not already loaded
  const targetLanguage = document.getElementById('targetLanguage').value;
  if (!learnedVocabulary[targetLanguage]) {
    loadLearnedVocabulary(targetLanguage);
  }
}

// Handle input blur (with delay to allow clicks on suggestions)
function handleInputBlur() {
  setTimeout(() => {
    hideSuggestions();
  }, 200);
}

// Create suggestions container in DOM
function createSuggestionsContainer() {
  const chatInput = document.querySelector('.chat-input');
  if (!chatInput || document.getElementById('suggestions-container')) return;
  
  const container = document.createElement('div');
  container.id = 'suggestions-container';
  container.className = 'suggestions-container';
  container.style.display = 'none';
  
  chatInput.appendChild(container);
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
function initializeSidebar() {
  // Set initial active language
  selectLanguage(currentActiveLanguage);
  console.log('🌍 Sidebar initialized with language:', currentActiveLanguage);
}

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
  const learningSelect = document.getElementById('targetLanguage');
  if (learningSelect) {
    learningSelect.value = language;
  }
  
  // Clear and load conversation for this language
  loadConversationForLanguage(language);
  
  // Load vocabulary for this language
  loadLearnedVocabulary(language);
  
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

// Display message without saving to Firestore (for loading existing messages)
function displayMessage(message, sender) {
    // Use addMessage with auto-speak disabled for loaded messages
    addMessage(message, sender, false);
}

function loadConversationForLanguage(language) {
  const chatContainer = document.getElementById('chat-messages');
  if (!chatContainer) return;
  
  // Clear the chat container
  chatContainer.innerHTML = '';
  
  // Load messages for this language from the stored conversation history
  if (conversationHistoryByLanguage[language] && conversationHistoryByLanguage[language].length > 0) {
    conversationHistoryByLanguage[language].forEach(msgData => {
      displayMessage(msgData.message, msgData.sender);
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
  loadSummariesList();
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

// ====== SMART REVIEW SUMMARIES FEATURE ======

// Generate AI-powered conversation summary
async function generateConversationSummary(messages, targetLanguage, nativeLanguage) {
  try {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
      console.warn('Gemini API key not configured for summary generation');
      return null;
    }

    if (!messages || messages.length < 2) {
      console.log('Not enough messages for summary generation');
      return null;
    }

    // Build conversation text for analysis
    let conversationText = '';
    messages.forEach(msg => {
      const speaker = msg.sender === 'user' ? 'Student' : 'AI Tutor';
      conversationText += `${speaker}: ${msg.message}\n`;
    });

    const summaryPrompt = `Analyze this ${targetLanguage} language learning conversation and provide 3-5 key takeaways in ${nativeLanguage}. Focus on:

1. New phrases or vocabulary the student learned
2. Grammar mistakes and areas for improvement  
3. Topics discussed and conversation themes
4. Student's progress and achievements
5. Specific recommendations for continued learning

Conversation:
${conversationText}

Provide your response as a JSON object with this structure:
{
  "takeaways": [
    "Today you learned these phrases: [list specific phrases]",
    "You struggled with [grammar point] - here's a quick guide: [brief explanation]", 
    "Great job discussing [topic] - you're building confidence in [area]",
    "Recommendation: Practice [specific skill] next time"
  ],
  "newPhrases": ["phrase1", "phrase2"],
  "grammarPoints": ["point1", "point2"],
  "topics": ["topic1", "topic2"],
  "recommendations": ["recommendation1", "recommendation2"]
}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: summaryPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 500
        }
      })
    });

    if (!response.ok) {
      console.error('Failed to generate summary:', response.statusText);
      return null;
    }

    const data = await response.json();
    const summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!summaryText) {
      console.error('No summary text received from API');
      return null;
    }

    // Try to parse JSON response
    try {
      const jsonMatch = summaryText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.warn('Failed to parse JSON summary, using fallback format');
    }

    // Fallback: create simple takeaways from text
    const takeaways = summaryText.split('\n').filter(line => line.trim().length > 0).slice(0, 5);
    return {
      takeaways,
      newPhrases: [],
      grammarPoints: [],
      topics: [],
      recommendations: []
    };

  } catch (error) {
    console.error('Error generating conversation summary:', error);
    return null;
  }
}

// Save conversation summary to Firestore
async function saveConversationSummary(summary, language, messageCount) {
  if (!db || !window.auth.currentUser || !summary) return;
  
  try {
    const summaryData = {
      ...summary,
      language: language,
      messageCount: messageCount,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      userId: window.auth.currentUser.uid
    };

    await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('summaries')
      .add(summaryData);

    // Save learned vocabulary from this summary
    if (summary.newPhrases && summary.newPhrases.length > 0) {
      await saveLearnedVocabulary(summary.newPhrases, language);
    }

    console.log('✅ Conversation summary saved');
    return true;
  } catch (error) {
    console.error('Error saving summary:', error);
    return false;
  }
}

// Generate and save summary for current conversation
async function generateAndSaveSummary(language = null) {
  const currentLang = language || currentActiveLanguage;
  const messages = conversationHistoryByLanguage[currentLang] || [];
  
  if (messages.length < 2) {
    showNotification('❌ Need at least 2 messages to generate a summary');
    return null;
  }

  // Show progress notification
  const progressNotification = document.createElement('div');
  progressNotification.className = 'notification progress-notification';
  progressNotification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px;">
      <div class="spinner"></div>
      <span>Generating ${currentLang} conversation summary...</span>
    </div>
  `;
  progressNotification.style.cssText = getNotificationBaseStyles();
  document.body.appendChild(progressNotification);
  
  try {
    const targetLanguage = currentLang;
    const nativeLanguage = document.getElementById('nativeLanguage')?.value || 'English';
    
    const summary = await generateConversationSummary(messages, targetLanguage, nativeLanguage);
    
    // Remove progress notification
    progressNotification.remove();
    
    if (summary) {
      await saveConversationSummary(summary, currentLang, messages.length);
      showSummaryModal(summary, currentLang);
      showNotification('✅ Summary generated successfully!');
      return summary;
    } else {
      showNotification('❌ Failed to generate summary. Please try again.');
      return null;
    }
  } catch (error) {
    console.error('Error in generateAndSaveSummary:', error);
    progressNotification.remove();
    showNotification('❌ Error generating summary. Please check your connection.');
    return null;
  }
}

// Show summary in a modal popup
function showSummaryModal(summary, language) {
  // Create modal HTML
  const modalHTML = `
    <div id="summary-modal" class="summary-modal-overlay">
      <div class="summary-modal">
        <div class="summary-header">
          <h3>📚 ${language} Conversation Summary</h3>
          <button class="btn-close" onclick="closeSummaryModal()">✖</button>
        </div>
        <div class="summary-content">
          <div class="takeaways-section">
            <h4>🎯 Key Takeaways</h4>
            <ul class="takeaways-list">
              ${summary.takeaways.map(takeaway => `<li>${takeaway}</li>`).join('')}
            </ul>
          </div>
          ${summary.newPhrases && summary.newPhrases.length > 0 ? `
            <div class="phrases-section">
              <h4>✨ New Phrases</h4>
              <div class="phrases-list">
                ${summary.newPhrases.map(phrase => `<span class="phrase-tag">${phrase}</span>`).join('')}
              </div>
            </div>
          ` : ''}
          ${summary.recommendations && summary.recommendations.length > 0 ? `
            <div class="recommendations-section">
              <h4>💡 Recommendations</h4>
              <ul class="recommendations-list">
                ${summary.recommendations.map(rec => `<li>${rec}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
        <div class="summary-actions">
          <button class="btn btn-primary" onclick="closeSummaryModal()">Got it!</button>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if any
  const existingModal = document.getElementById('summary-modal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to DOM
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Close summary modal
function closeSummaryModal() {
  const modal = document.getElementById('summary-modal');
  if (modal) {
    modal.remove();
  }
}

// Load recent summaries for dashboard
async function loadRecentSummaries() {
  if (!db || !window.auth.currentUser) return [];
  
  try {
    const snapshot = await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('summaries')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .get();

    const summaries = [];
    snapshot.forEach(doc => {
      summaries.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return summaries;
  } catch (error) {
    console.error('Error loading summaries:', error);
    return [];
  }
}

// Load and display summaries in dashboard
async function loadSummariesList() {
  const summariesContainer = document.getElementById('summaries-list');
  if (!summariesContainer) return;

  try {
    const summaries = await loadRecentSummaries();
    
    if (summaries.length === 0) {
      summariesContainer.innerHTML = `
        <div class="empty-state">
          <p>No summaries yet. Complete a conversation and generate your first summary!</p>
        </div>
      `;
      return;
    }

    let summariesHTML = '';
    summaries.forEach(summary => {
      const date = summary.timestamp ? summary.timestamp.toDate().toLocaleDateString() : 'Unknown date';
      const preview = summary.takeaways && summary.takeaways.length > 0 ? summary.takeaways[0].substring(0, 80) + '...' : 'No preview available';
      
      summariesHTML += `
        <div class="summary-item" onclick="showSummaryDetails('${summary.id}')">
          <div class="summary-item-header">
            <span class="summary-language">${summary.language || 'Unknown'}</span>
            <span class="summary-date">${date}</span>
          </div>
          <div class="summary-preview">${preview}</div>
          <div class="summary-stats">
            <span>📝 ${summary.takeaways ? summary.takeaways.length : 0} takeaways</span>
            <span>💬 ${summary.messageCount || 0} messages</span>
          </div>
        </div>
      `;
    });

    summariesContainer.innerHTML = summariesHTML;
  } catch (error) {
    console.error('Error loading summaries list:', error);
    summariesContainer.innerHTML = `
      <div class="empty-state">
        <p>Error loading summaries. Please try again.</p>
      </div>
    `;
  }
}

// Show summary details in modal
async function showSummaryDetails(summaryId) {
  if (!db || !window.auth.currentUser) return;
  
  try {
    const doc = await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('summaries')
      .doc(summaryId)
      .get();

    if (doc.exists) {
      const summary = doc.data();
      showSummaryModal(summary, summary.language);
    }
  } catch (error) {
    console.error('Error loading summary details:', error);
    showNotification('❌ Error loading summary details');
  }
}

// Generate weekly summary (foundation for future email feature)
async function generateWeeklySummary() {
  if (!db || !window.auth.currentUser) return null;
  
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    // Get all summaries from the past week
    const snapshot = await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('summaries')
      .where('timestamp', '>=', oneWeekAgo)
      .orderBy('timestamp', 'desc')
      .get();

    const weeklySummaries = [];
    snapshot.forEach(doc => {
      weeklySummaries.push(doc.data());
    });

    if (weeklySummaries.length === 0) {
      return null;
    }

    // Aggregate data across all languages
    const languageStats = {};
    let totalMessages = 0;
    const allTakeaways = [];
    const allRecommendations = [];

    weeklySummaries.forEach(summary => {
      const lang = summary.language;
      if (!languageStats[lang]) {
        languageStats[lang] = { conversations: 0, messages: 0 };
      }
      languageStats[lang].conversations++;
      languageStats[lang].messages += summary.messageCount || 0;
      totalMessages += summary.messageCount || 0;
      
      if (summary.takeaways) {
        allTakeaways.push(...summary.takeaways);
      }
      if (summary.recommendations) {
        allRecommendations.push(...summary.recommendations);
      }
    });

    const weeklyReport = {
      weekStart: oneWeekAgo.toLocaleDateString(),
      weekEnd: new Date().toLocaleDateString(),
      totalConversations: weeklySummaries.length,
      totalMessages: totalMessages,
      languageStats: languageStats,
      topTakeaways: allTakeaways.slice(0, 5), // Top 5 takeaways
      topRecommendations: allRecommendations.slice(0, 3), // Top 3 recommendations
      generatedAt: new Date()
    };

    // Save weekly summary
    await db.collection('users')
      .doc(window.auth.currentUser.uid)
      .collection('weeklySummaries')
      .add({
        ...weeklyReport,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

    return weeklyReport;
  } catch (error) {
    console.error('Error generating weekly summary:', error);
    return null;
  }
}

// Show weekly summary modal (for testing)
function showWeeklySummaryModal(weeklyReport) {
  if (!weeklyReport) return;
  
  const languageStatsHTML = Object.entries(weeklyReport.languageStats)
    .map(([lang, stats]) => `
      <div class="weekly-language-stat">
        <strong>${lang}:</strong> ${stats.conversations} conversations, ${stats.messages} messages
      </div>
    `).join('');

  const modalHTML = `
    <div id="weekly-summary-modal" class="summary-modal-overlay">
      <div class="summary-modal">
        <div class="summary-header">
          <h3>📅 Weekly Learning Summary</h3>
          <button class="btn-close" onclick="closeWeeklySummaryModal()">✖</button>
        </div>
        <div class="summary-content">
          <div class="weekly-overview">
            <h4>📊 Week Overview (${weeklyReport.weekStart} - ${weeklyReport.weekEnd})</h4>
            <div class="weekly-stats">
              <div class="weekly-stat">Total Conversations: <strong>${weeklyReport.totalConversations}</strong></div>
              <div class="weekly-stat">Total Messages: <strong>${weeklyReport.totalMessages}</strong></div>
            </div>
          </div>
          
          <div class="weekly-languages">
            <h4>🌍 Languages Practiced</h4>
            ${languageStatsHTML}
          </div>
          
          ${weeklyReport.topTakeaways.length > 0 ? `
            <div class="weekly-takeaways">
              <h4>🎯 Top Learnings This Week</h4>
              <ul class="takeaways-list">
                ${weeklyReport.topTakeaways.map(takeaway => `<li>${takeaway}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          ${weeklyReport.topRecommendations.length > 0 ? `
            <div class="weekly-recommendations">
              <h4>💡 Focus Areas for Next Week</h4>
              <ul class="recommendations-list">
                ${weeklyReport.topRecommendations.map(rec => `<li>${rec}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
        <div class="summary-actions">
          <button class="btn btn-primary" onclick="closeWeeklySummaryModal()">Great Progress!</button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Close weekly summary modal
function closeWeeklySummaryModal() {
  const modal = document.getElementById('weekly-summary-modal');
  if (modal) {
    modal.remove();
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
window.generateAndSaveSummary = generateAndSaveSummary;
window.closeSummaryModal = closeSummaryModal;
window.showSummaryDetails = showSummaryDetails;
window.generateWeeklySummary = generateWeeklySummary;
window.closeWeeklySummaryModal = closeWeeklySummaryModal;

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
  recognition.lang = LANGUAGE_CODES[targetLanguage] || 'en-US';
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
  utterance.lang = LANGUAGE_CODES[language] || 'en-US';
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

// ====== REMOVE DUPLICATE ADDMESSAGE FUNCTION ======
// This duplicate function was causing message duplication - removed

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
  const chatMessages = document.getElementById('chat-messages');
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
  notification.style.cssText = getNotificationBaseStyles() + `
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

// ====== VOICE FEATURES INITIALIZATION ======
function initializeVoiceFeatures() {
  // Check browser support
  const speechRecognitionSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  const speechSynthesisSupported = 'speechSynthesis' in window;
  console.log('Voice Features Status:');
  console.log('- Speech Recognition:', speechRecognitionSupported ? '✅ Supported' : '❌ Not supported');
  console.log('- Text-to-Speech:', speechSynthesisSupported ? '✅ Supported' : '❌ Not supported');
  
  console.log('✅ Voice Features initialized!');
}

// ====== USER PREFERENCES LOADING ======
async function loadUserPreferences(user) {
  if (!db || !user) return;
  
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

// ====== KEYBOARD SHORTCUTS ======
function setupKeyboardShortcuts() {
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
}

// ====== CSS AND GLOBAL SETUP ======
function setupUIAndGlobals() {
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
    @keyframes fadeInUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
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

  // Make all voice functions globally accessible (for HTML onclick)
  if (typeof window !== 'undefined') {
    window.toggleVoiceInput = toggleVoiceInput;
    window.togglePronunciationMode = togglePronunciationMode;
    window.toggleAutoSpeak = toggleAutoSpeak;
    window.toggleSlowMode = toggleSlowMode;
  }
  
  console.log('✅ UI styles and global functions loaded!');
}

// ====== ENHANCED MESSAGE HANDLING SUPPORT FUNCTIONS ======

/**
 * Shows or hides the save indicator for message persistence feedback.
 * @param {boolean} isLoading - Whether to show loading state
 * @param {boolean} success - Whether the operation was successful (only used when not loading)
 */
function showSaveIndicator(isLoading, success = null) {
    let indicator = document.getElementById('save-indicator');
    
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'save-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            z-index: 10000;
            transition: all 0.3s ease;
            opacity: 0;
            pointer-events: none;
        `;
        document.body.appendChild(indicator);
    }
    
    if (isLoading) {
        indicator.textContent = '💾 Saving message...';
        indicator.style.background = '#3498db';
        indicator.style.color = 'white';
        indicator.style.opacity = '1';
    } else if (success === true) {
        indicator.textContent = '✅ Message saved';
        indicator.style.background = '#27ae60';
        indicator.style.color = 'white';
        indicator.style.opacity = '1';
        setTimeout(() => {
            indicator.style.opacity = '0';
        }, 2000);
    } else if (success === false) {
        indicator.textContent = '❌ Save failed';
        indicator.style.background = '#e74c3c';
        indicator.style.color = 'white';
        indicator.style.opacity = '1';
        setTimeout(() => {
            indicator.style.opacity = '0';
        }, 3000);
    } else {
        indicator.style.opacity = '0';
    }
}

/**
 * Shows error notifications to the user with auto-dismiss.
 * @param {string} message - The error message to display
 * @param {number} duration - How long to show the notification (ms)
 */
function showErrorNotification(message, duration = 5000) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #e74c3c;
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10001;
        max-width: 300px;
        font-size: 14px;
        line-height: 1.4;
        animation: slideInRight 0.3s ease;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span>⚠️</span>
            <span>${message}</span>
            <button onclick="this.parentElement.parentElement.remove()" 
                    style="background: none; border: none; color: white; margin-left: auto; cursor: pointer; font-size: 16px;">×</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after duration
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, duration);
}

/**
 * Enhanced saveMessageToFirestore with retry logic and exponential backoff.
 * @param {string} message - The message content
 * @param {string} sender - The message sender
 * @param {string} targetLanguage - The target language
 * @param {number} maxRetries - Maximum number of retry attempts
 */
async function saveMessageWithRetry(message, sender, targetLanguage, maxRetries = 3) {
    let retryCount = 0;
    let lastError;
    
    while (retryCount <= maxRetries) {
        try {
            // Check network connectivity before attempting save
            if (!navigator.onLine) {
                throw new Error('No network connection available');
            }
            
            // Validate authentication state
            if (!window.auth.currentUser) {
                throw new Error('User not authenticated');
            }
            
            // Attempt the save operation
            await saveMessageToFirestore(message, sender, targetLanguage);
            
            // Log successful save for monitoring
            logMessageOperation('saved', message, sender, true, retryCount);
            return; // Success, exit retry loop
            
        } catch (error) {
            lastError = error;
            retryCount++;
            
            if (retryCount <= maxRetries) {
                // Exponential backoff: wait 1s, 2s, 4s for retries
                const delay = Math.pow(2, retryCount - 1) * 1000;
                console.warn(`Save attempt ${retryCount} failed, retrying in ${delay}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    // All retries failed
    throw new Error(`Failed to save message after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Queues messages for offline sync when Firestore is unavailable.
 * @param {string} message - The message content
 * @param {string} sender - The message sender
 */
function queueOfflineMessage(message, sender) {
    try {
        const offlineQueue = JSON.parse(localStorage.getItem('offlineMessageQueue') || '[]');
        const queuedMessage = {
            id: generateMessageId(),
            message,
            sender,
            targetLanguage: document.getElementById('targetLanguage')?.value || currentActiveLanguage || 'Spanish',
            timestamp: Date.now(),
            retryCount: 0
        };
        
        offlineQueue.push(queuedMessage);
        localStorage.setItem('offlineMessageQueue', JSON.stringify(offlineQueue));
        
        console.log('Message queued for offline sync:', queuedMessage.id);
        showOfflineQueueNotification(offlineQueue.length);
        
    } catch (error) {
        console.error('Failed to queue offline message:', error);
    }
}

/**
 * Shows notification about offline message queue status.
 * @param {number} queueSize - Number of messages in queue
 */
function showOfflineQueueNotification(queueSize) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: #f39c12;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 12px;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    notification.textContent = `📤 ${queueSize} message(s) queued for sync`;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 3000);
}

/**
 * Processes the offline message queue when connection is restored.
 */
async function processOfflineQueue() {
    try {
        const offlineQueue = JSON.parse(localStorage.getItem('offlineMessageQueue') || '[]');
        if (offlineQueue.length === 0) return;
        
        console.log(`Processing ${offlineQueue.length} offline messages...`);
        const processed = [];
        
        for (const queuedMessage of offlineQueue) {
            try {
                await saveMessageWithRetry(
                    queuedMessage.message, 
                    queuedMessage.sender, 
                    queuedMessage.targetLanguage, 
                    2 // Reduced retries for queued messages
                );
                processed.push(queuedMessage.id);
            } catch (error) {
                console.error('Failed to sync queued message:', queuedMessage.id, error);
                // Keep failed messages in queue for next attempt
            }
        }
        
        // Remove successfully processed messages from queue
        const remainingQueue = offlineQueue.filter(msg => !processed.includes(msg.id));
        localStorage.setItem('offlineMessageQueue', JSON.stringify(remainingQueue));
        
        if (processed.length > 0) {
            console.log(`Successfully synced ${processed.length} offline messages`);
        }
        
    } catch (error) {
        console.error('Error processing offline queue:', error);
    }
}

/**
 * Logs message operations for debugging and monitoring.
 * @param {string} operation - The operation type ('added', 'saved', 'failed', etc.)
 * @param {string} message - The message content (truncated for logging)
 * @param {string} sender - The message sender
 * @param {boolean} autoSpeak - Whether auto-speak was enabled
 * @param {number} retryCount - Number of retries (if applicable)
 */
function logMessageOperation(operation, message, sender, autoSpeak, retryCount = 0) {
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isDevelopment) {
        const truncatedMessage = message.length > 50 ? message.substring(0, 50) + '...' : message;
        const logData = {
            operation,
            sender,
            messagePreview: truncatedMessage,
            autoSpeak,
            retryCount,
            timestamp: new Date().toISOString()
        };
        
        console.log(`[MessageHandler] ${operation}:`, logData);
    }
}

/**
 * Tracks message errors for monitoring and debugging.
 * @param {string} functionName - The function where the error occurred
 * @param {Error} error - The error object
 * @param {Object} context - Additional context about the error
 */
function trackMessageError(functionName, error, context = {}) {
    const errorData = {
        function: functionName,
        error: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
    };
    
    // Log to console for development
    console.error(`[MessageHandler Error] ${functionName}:`, errorData);
    
    // In production, this could send to an error tracking service
    // Example: sendToErrorTracking(errorData);
}

// ====== DEBOUNCING AND RATE LIMITING ======

/**
 * Debounced message sending to prevent spam and improve performance.
 */
const debouncedSendMessage = debounce(function() {
    // Get the original sendMessage function
    const messageInput = document.getElementById('messageInput');
    if (messageInput && messageInput.value.trim()) {
        // Call the original sendMessage logic
        sendMessageInternal();
    }
}, 300); // 300ms debounce delay

/**
 * Internal message sending function with rate limiting.
 */
function sendMessageInternal() {
    // Check rate limiting
    if (!checkRateLimit()) {
        showErrorNotification('Please wait before sending another message');
        return;
    }
    
    // Call the original sendMessage function
    if (typeof sendMessage === 'function') {
        sendMessage();
    }
}

/**
 * Rate limiting for message sending.
 * @returns {boolean} Whether the action is allowed
 */
function checkRateLimit() {
    const now = Date.now();
    const rateLimit = getRateLimitData();
    
    // Remove timestamps older than 1 minute
    rateLimit.timestamps = rateLimit.timestamps.filter(timestamp => now - timestamp < 60000);
    
    // Check if under limit (max 20 messages per minute)
    if (rateLimit.timestamps.length >= 20) {
        return false;
    }
    
    // Add current timestamp
    rateLimit.timestamps.push(now);
    localStorage.setItem('messageSendRateLimit', JSON.stringify(rateLimit));
    
    return true;
}

/**
 * Gets rate limit data from localStorage.
 * @returns {Object} Rate limit data
 */
function getRateLimitData() {
    try {
        return JSON.parse(localStorage.getItem('messageSendRateLimit') || '{"timestamps":[]}');
    } catch {
        return { timestamps: [] };
    }
}

/**
 * Generic debounce utility function.
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// ====== INITIALIZATION AND EVENT LISTENERS ======

// Set up offline/online event listeners for queue processing
window.addEventListener('online', () => {
    console.log('Connection restored, processing offline queue...');
    processOfflineQueue();
});

window.addEventListener('offline', () => {
    console.log('Connection lost, messages will be queued for later sync');
});

// Set up keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Ctrl+Enter to send message
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault();
        const messageInput = document.getElementById('messageInput');
        if (messageInput && messageInput.value.trim()) {
            debouncedSendMessage();
        }
    }
});

console.log('✅ Enhanced message handling system loaded with error handling, retry logic, and performance optimizations!');