# AI Language Buddy - Copilot Instructions

## Repository Overview

AI Language Buddy is a web-based language learning application that provides AI-powered conversation practice in 8 languages. Users can chat with an AI tutor, receive intelligent feedback, track learning progress, and get conversation summaries. This is a pure frontend application with no build system - it uses CDN dependencies and can run by opening `index.html` in any modern browser.

**Repository Size**: ~5K lines of code
- `app.js`: 2,603 lines (main application logic)
- `index.html`: 1,732 lines (UI and embedded CSS)
- `demo.html`: 606 lines (word suggestions demo)

**Technology Stack**:
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (no frameworks)
- **Database**: Firebase Firestore (user data, conversations, progress)
- **Authentication**: Firebase Auth (email/password)
- **AI**: Google Gemini 1.5 Flash API (conversations and summaries)
- **Hosting**: Netlify (static site deployment)
- **Dependencies**: Loaded via CDN (Firebase 8.10.0)

## Build and Validation Instructions

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Firebase account and project
- Google AI Studio account for Gemini API key
- HTTP server for local testing (any will work)

### Development Setup (Always follow this sequence)

1. **Clone and Basic Setup**:
```bash
git clone https://github.com/ryanonline1234/ai-language-buddy.git
cd ai-language-buddy
```

2. **Configure API Keys** (CRITICAL - App won't work without this):
   - Copy `config.example.js` to `config.js` or edit `config.prod.js`
   - Replace Firebase configuration object with your Firebase project settings
   - Replace `GEMINI_API_KEY` with your Google AI Studio API key
   - **Never commit real API keys to the repository**

3. **Local Testing** (Required before any changes):
```bash
# Start any HTTP server (examples):
python3 -m http.server 8000
# OR
npx http-server
# OR
php -S localhost:8000
```

4. **Validation Steps** (Run these after every change):
   - Open `http://localhost:8000/index.html` in browser
   - Open browser console (F12) - check for JavaScript errors
   - Test user registration/login functionality
   - Test chat functionality with AI responses
   - Test language switching between the 8 supported languages
   - Verify Firebase connection (check console logs for "✅ Firebase initialized")

### Testing Process (No automated tests - manual only)

**Critical Test Scenarios**:
1. **Authentication Flow**: Register → Login → Logout
2. **Chat Functionality**: Send message → Receive AI response → Save to database
3. **Language Switching**: Switch between Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese
4. **Voice Features**: Voice input, text-to-speech, pronunciation feedback
5. **Data Persistence**: Conversation history, learning stats, user preferences
6. **Dashboard**: View progress, achievements, conversation summaries

**Common Error Patterns to Check**:
- Console errors about undefined Firebase config
- CORS errors (use HTTP server, not file:// protocol)
- API key configuration warnings
- Network errors to Firebase or Gemini API
- CDN blocking by ad blockers (Firebase CDNs may be blocked in development)

### Deployment Process

1. **Pre-deployment Validation**:
   - Ensure `config.prod.js` has correct production API keys
   - Test locally with production config
   - Verify all console errors are resolved

2. **Netlify Deployment**:
   - Drag and drop all files to Netlify dashboard
   - Update Firebase authorized domains to include Netlify URL
   - Update Gemini API HTTP referrer restrictions

**Build Time**: N/A (no build process)
**Test Time**: 2-3 minutes for manual validation

## Project Layout and Architecture

### Key Files and Their Purpose

**Root Directory Files**:
- `index.html` - Main application UI with embedded CSS
- `app.js` - Complete application logic (2,603 lines)
- `demo.html` - Standalone word suggestions demo
- `config.example.js` - Template for API configuration
- `config.prod.js` - Production API keys (gitignored in practice)
- `README.md` - Setup and deployment instructions

### Architecture Overview

**Frontend Architecture**:
- Single-page application with no routing
- DOM manipulation via vanilla JavaScript
- CSS embedded in HTML (no external stylesheets)
- Event-driven architecture with global functions

**Key JavaScript Modules** (all in `app.js`):
```javascript
// Core initialization (lines 44-110)
initializeApp() // Firebase setup, auth state management

// Authentication (lines 1100-1300)
signUp(), signIn(), signOut() // User management

// Chat functionality (lines 1400-1600)
sendMessage(), getAIResponse() // Core chat features

// Data persistence (lines 200-400)
saveMessageToFirestore(), loadConversationHistory()

// Voice features (lines 2000-2400)
initSpeechRecognition(), toggleVoiceInput()

// Dashboard and analytics (lines 800-1000)
loadDashboardData(), updateLearningStats()
```

**Data Structure in Firestore**:
```
users/{userId}/
├── profile: { email, preferences, stats }
├── conversations/{conversationId}/
│   └── messages: [{ message, sender, timestamp, language }]
├── summaries/{summaryId}/
│   └── { takeaways, newPhrases, grammarPoints, timestamp }
└── vocabulary/{language}/
    └── { learned: [], favorites: [] }
```

### Configuration Files

- **Firebase Config**: Must be updated in `config.prod.js` with project-specific values
- **API Keys**: Gemini API key must be configured for AI functionality
- **Security**: API keys are restricted by domain referrer in production

### Development Patterns

**Error Handling Pattern**:
```javascript
try {
  // Firebase/API operations
} catch (error) {
  console.error('Descriptive error message:', error);
  // User-friendly error display
}
```

**Async/Await Pattern** (used throughout):
```javascript
async function functionName() {
  const result = await firebaseOperation();
  // Handle result
}
```

**Global Function Registration** (for HTML onclick handlers):
```javascript
window.functionName = functionName; // Make accessible to HTML
```

### Dependencies and Loading Order (CRITICAL)

**Loading Order in `index.html`** (must be maintained):
1. Firebase CDN scripts (app, auth, firestore)
2. Configuration file (`config.prod.js`)
3. Main application (`app.js`)

**CDN Dependencies**:
- Firebase 8.10.0 (compatible version - don't upgrade)
- No package.json or node_modules
- All dependencies loaded via CDN

### Security Considerations

**API Key Management**:
- Development: Use `config.js` (gitignored)
- Production: Use `config.prod.js` with domain restrictions
- Never commit real API keys to version control

**Firebase Security Rules**: App expects specific Firestore rules for user data isolation

### Common Development Issues and Solutions

**Issue**: "Config not loaded" error
**Solution**: Ensure config file is loaded before `app.js` in HTML

**Issue**: CORS errors during development
**Solution**: Always use HTTP server, never file:// protocol

**Issue**: Authentication not working
**Solution**: Check Firebase project settings and authorized domains

**Issue**: AI responses not working
**Solution**: Verify Gemini API key and check for quota limits

**Issue**: CDN blocking by ad blockers/browser security
**Solution**: Disable ad blocker for localhost or test in different browser

**Issue**: Data not persisting
**Solution**: Check Firestore rules and network connectivity

### Validation and Quality Checks

**Before Making Changes**:
1. Test current functionality locally
2. Check browser console for existing errors
3. Verify API keys are configured

**After Making Changes**:
1. Test in multiple browsers (Chrome, Firefox, Safari)
2. Verify all console errors are resolved
3. Test core user flows (auth, chat, data persistence)
4. Check responsive design on mobile

**Code Quality Guidelines**:
- Maintain existing vanilla JS patterns
- Use async/await for all Firebase operations
- Include error handling for all network operations
- Follow existing naming conventions
- Add console logs for debugging

### Trust These Instructions

These instructions are comprehensive and tested. Only perform additional exploration if:
- Instructions are incomplete for your specific task
- You encounter errors not covered in the troubleshooting section
- You need to understand implementation details not documented here

The application architecture is straightforward - focus on the specific functionality you need to modify rather than trying to understand the entire codebase at once.