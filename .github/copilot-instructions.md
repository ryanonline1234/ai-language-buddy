# AI Language Buddy - Development Instructions

AI Language Buddy is a client-side JavaScript web application for language learning with AI-powered conversations. It uses Firebase for authentication and Google Gemini API for AI interactions.

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Quick Setup & Validation
- **No build process required** - This is a pure client-side application
- **No npm dependencies** - All libraries loaded via CDN
- Start local development server:
  - `cd /path/to/ai-language-buddy`
  - `python3 -m http.server 8080` (or `python -m http.server 8080` on some systems)
  - **OR** `npx serve .` (if you have Node.js)
  - **OR** `php -S localhost:8080` (if you have PHP)
- Open browser: `http://localhost:8080`
- **Load time**: < 1 second locally, application loads instantly

### Essential Validation Commands
**ALWAYS run these before making changes:**
```bash
# Validate JavaScript syntax (takes < 1 second)
node -c app.js
node -c config.example.js
node -c config.prod.js

# Basic HTML structure validation (takes < 1 second)
python3 -c "
import html.parser
class HTMLValidator(html.parser.HTMLParser):
    def error(self, message): print(f'HTML Error: {message}')
validator = HTMLValidator()
with open('index.html', 'r') as f:
    validator.feed(f.read())
print('✅ HTML syntax is valid')
"

# Check repository size (should be ~400KB)
du -sh .
```

### Core Application Testing
**CRITICAL**: After making any changes, ALWAYS validate using these scenarios:

1. **Basic Application Load**:
   - Start local server: `python3 -m http.server 8080`
   - Navigate to `http://localhost:8080`
   - Verify: Language sidebar loads, login interface appears
   - Expected: Page loads in < 1 second

2. **Demo Page Functionality**:
   - Navigate to `http://localhost:8080/demo.html`
   - Type "hola" in the input field and click "Send"
   - Verify: Success message appears ("Nice use of 'hola'...")
   - Expected: Immediate response, no delays

3. **JavaScript Console Check**:
   - Open browser developer tools (F12)
   - Check for critical errors (Firebase CDN blocks are expected in sandboxed environments)
   - Expected warnings: "Firebase scripts blocked" (normal in restricted environments)

## File Structure & Key Components

### Critical Files (DO NOT DELETE):
- `index.html` - Main application (51KB, 1732 lines)
- `app.js` - Core JavaScript logic (87KB, 2603 lines)
- `config.prod.js` - Production configuration with API keys
- `config.example.js` - Template for new configurations
- `demo.html` - Word suggestions demo (21KB)

### Configuration Management:
- **Production config**: `config.prod.js` (contains real API keys)
- **Example config**: `config.example.js` (template with placeholders)
- **NEVER commit real API keys** - use `.gitignore` patterns

### Architecture Overview:
```
Repository root/
├── index.html          # Main SPA entry point
├── app.js             # 2603 lines of JavaScript
├── config.prod.js     # Firebase + Gemini API keys
├── config.example.js  # Configuration template  
├── demo.html          # Standalone demo page
└── .github/           # GitHub configuration
```

## Dependencies & API Requirements

### External Dependencies (CDN-loaded):
- **Firebase 8.10.0**: Authentication & Firestore database
  - `firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`
  - Loaded from: `https://www.gstatic.com/firebasejs/8.10.0/`
- **Google Gemini API**: AI conversation generation
  - API endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`

### API Configuration:
**Required for full functionality** (but app loads without them):
- Firebase project configuration (auth, Firestore)
- Google Gemini API key for AI features
- Both configured in `config.prod.js` or custom config file

### Network Requirements:
- **Development**: Local HTTP server only
- **Production**: CDN access for Firebase scripts + Gemini API calls
- **Offline**: Basic UI works, but no auth/AI features

## Common Development Tasks

### Making UI Changes:
1. Edit `index.html` for layout/structure changes
2. Edit embedded CSS in `<style>` tags within `index.html`
3. **Validation**: Reload `http://localhost:8080` and verify visually
4. **No build step required** - changes are immediate

### Making Logic Changes:
1. Edit `app.js` for functionality changes
2. **Validation**: Run `node -c app.js` to check syntax
3. **Testing**: Reload browser and test affected functionality
4. **Debug**: Use browser developer tools for JavaScript errors

### Adding New Features:
1. **Pattern**: Most functions are globally exposed via `window.functionName`
2. **Event handling**: Uses inline `onclick` handlers in HTML
3. **State management**: Global JavaScript variables
4. **API calls**: Uses `fetch()` for external API communication

## Language Support & Features

### Supported Languages:
Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese

### Core Features:
- **Authentication**: Firebase email/password auth
- **AI Conversations**: Google Gemini-powered language tutoring
- **Smart Summaries**: AI-generated conversation analysis
- **Vocabulary Tracking**: Learn/practice word recognition
- **Progress Dashboard**: Statistics and learning progress
- **Speech Recognition**: Web Speech API integration
- **Multi-language**: Switch between learning languages

## Troubleshooting

### Common Issues:
1. **"Firebase not loaded"**: Normal in sandboxed environments - app structure still testable
2. **API key warnings**: Expected when using placeholder keys
3. **CORS errors**: Use local HTTP server, never file:// protocol
4. **Console errors**: Focus on JavaScript syntax errors, ignore CDN blocks

### Quick Fixes:
```bash
# If local server fails to start:
python3 -m http.server 8080 --bind 127.0.0.1

# If port 8080 is busy:
python3 -m http.server 8081

# Check JavaScript errors:
node -c app.js && echo "✅ Syntax OK" || echo "❌ Syntax Error"
```

### Development Environment:
- **Browser**: Any modern browser (Chrome, Firefox, Safari, Edge)
- **No special tools required**: No Node.js, npm, or build tools needed
- **Testing**: Manual functional testing through browser interface
- **Debugging**: Browser developer tools (F12)

## Validation Scenarios

### ALWAYS Test These After Changes:

1. **Application Startup**:
   - ✅ Page loads without JavaScript errors
   - ✅ Language sidebar appears with 8 language options
   - ✅ Login form displays properly
   - ✅ UI responsive on different screen sizes

2. **Demo Page Functionality**:
   - ✅ Navigate to `/demo.html` successfully
   - ✅ Type test words and receive feedback
   - ✅ Vocabulary list displays correctly
   - ✅ Interactive elements respond properly

3. **Configuration Validation**:
   - ✅ Config files have valid JavaScript syntax
   - ✅ API key placeholders are properly formatted
   - ✅ Firebase config object structure is correct

### Performance Expectations:
- **Local server startup**: < 1 second
- **Page load time**: < 1 second locally
- **Demo interactions**: Immediate response
- **Repository size**: ~400KB total

### Manual Testing Checklist:
- [ ] Start local server without errors
- [ ] Main page loads and displays correctly
- [ ] Demo page interactive features work
- [ ] Browser console shows no critical JavaScript errors
- [ ] All HTML/JS files pass syntax validation

## Best Practices

### Code Changes:
- **Test immediately**: Refresh browser after every change
- **Validate syntax**: Run `node -c` on modified JavaScript files  
- **Check console**: Monitor browser developer tools for errors
- **Incremental testing**: Test small changes frequently

### File Management:
- **Never delete**: `index.html`, `app.js`, `config.prod.js`
- **Backup config**: Copy `config.prod.js` before API key changes
- **Syntax check**: Always validate before committing changes

### Debugging Approach:
1. Check browser developer tools console (F12)
2. Verify local HTTP server is running
3. Test with demo page for isolated functionality
4. Use browser network tab to check API calls
5. Validate JavaScript syntax with Node.js

**Remember**: This is a client-side application. No server-side code, no build process, no npm scripts. Keep it simple and test frequently through the browser.