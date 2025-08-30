# 🚀 Deployment Guide for AI Language Buddy

This guide will help you deploy the AI Language Buddy to Netlify and resolve common deployment issues.

## 📋 Prerequisites

Before deploying, ensure you have:
- A GitHub account (for the repository)
- A Firebase account (for authentication and database)
- A Google AI Studio account (for Gemini API)
- A Netlify account (for hosting)

## 🔧 Step-by-Step Setup

### 1. Fork or Clone the Repository

Fork this repository to your GitHub account or clone it locally:

```bash
git clone https://github.com/ryanonline1234/ai-language-buddy.git
cd ai-language-buddy
```

### 2. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use an existing one)
3. Enable **Authentication** with Email/Password provider
4. Enable **Firestore Database** in production mode
5. In Project Settings, find your web app config

### 3. Set Up Google Gemini API

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. **Important**: Configure API restrictions for your domain

### 4. Create Configuration File

Create a `config.js` file in your project root:

```javascript
const firebaseConfig = {
    apiKey: "your-firebase-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "your-sender-id",
    appId: "your-app-id"
};

const GEMINI_API_KEY = 'your-gemini-api-key';
```

### 5. Deploy to Netlify

#### Option A: Drag and Drop (Recommended for beginners)

1. Create the `config.js` file with your API keys
2. Drag and drop all project files to [Netlify Deploy](https://app.netlify.com/drop)
3. Note your deployment URL (e.g., `https://amazing-name-123456.netlify.app`)

#### Option B: Git Integration

1. Push your code to GitHub (with `config.js` included)
2. Connect your GitHub repo to Netlify
3. Deploy from the main branch

### 6. Configure Domain Restrictions

After deployment, update your API restrictions:

#### Firebase
1. Go to Firebase Console → Authentication → Settings
2. Add your Netlify domain to **Authorized domains**
3. Example: `https://amazing-name-123456.netlify.app`

#### Gemini API
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Edit your API key
3. Add HTTP referrer restriction for your Netlify domain

## 🚨 Common Deployment Issues & Solutions

### Issue 1: Setup Mode Appears on Deployed Site

**Symptoms**: The app shows "Setup Required" screen instead of login

**Causes**:
- Missing `config.js` file
- API keys are still placeholder values
- Firebase CDN blocked by ad blockers

**Solutions**:
1. Ensure `config.js` exists and has real API keys
2. Check browser console for 404 errors on config.js
3. Disable ad blockers while testing
4. Verify Firebase CDN resources are loading

### Issue 2: Authentication Fails

**Symptoms**: "Firebase initialization failed" error

**Causes**:
- Incorrect Firebase configuration
- Domain not authorized in Firebase

**Solutions**:
1. Double-check Firebase config values
2. Add Netlify domain to Firebase authorized domains
3. Enable Email/Password authentication in Firebase

### Issue 3: AI Chat Not Working

**Symptoms**: Messages send but no AI responses

**Causes**:
- Invalid Gemini API key
- API key restricted to wrong domain
- API quota exceeded

**Solutions**:
1. Verify Gemini API key is correct
2. Update API restrictions to include your domain
3. Check API usage in Google Cloud Console

### Issue 4: 404 on config.js

**Symptoms**: Console shows "Failed to load config.js"

**Causes**:
- File not uploaded to Netlify
- File named incorrectly

**Solutions**:
1. Ensure config.js is in the root directory
2. Re-upload files to Netlify
3. Check file exists in Netlify's file browser

## 🔒 Security Best Practices

### For Learning Projects
- Use domain restrictions on all API keys
- Monitor API usage regularly
- Keep API keys in `config.js` (already gitignored)

### For Production Applications
- Use environment variables
- Implement backend API proxy
- Use Firebase security rules
- Enable rate limiting

## 🧪 Testing Your Deployment

1. Visit your Netlify URL
2. Check that login/signup works
3. Send a test message to verify AI responses
4. Test voice features (if using HTTPS)
5. Check browser console for errors

## 📞 Getting Help

If you encounter issues:

1. Check the browser console for error messages
2. Verify all API keys are correct and active
3. Ensure domains are properly configured
4. Test locally first before deploying

## 🎯 Quick Deployment Checklist

- [ ] Firebase project created and configured
- [ ] Gemini API key obtained
- [ ] `config.js` created with real API keys
- [ ] Files uploaded to Netlify
- [ ] Firebase authorized domains updated
- [ ] Gemini API restrictions updated
- [ ] Site tested and working

---

**💡 Pro Tip**: Both Firebase and Gemini API offer generous free tiers perfect for learning projects!