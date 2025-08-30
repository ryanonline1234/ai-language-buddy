  🌍 Language Buddy AI

An AI-powered language learning chat application that helps users practice conversations in multiple languages with an intelligent AI tutor.

   ✨ Features

- 🔐 **Secure Authentication** - Firebase Auth for user accounts
- 🤖 **AI-Powered Conversations** - Google Gemini API integration
- 🌐 **8 Languages Supported** - Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese
- 💬 **Real-time Chat Interface** - Modern, responsive design
- 📱 **Mobile-Friendly** - Works seamlessly on all devices
- 🎨 **Clean UI/UX** - Intuitive interface with typing indicators
- 🎤 **Voice Features** - Speech recognition and text-to-speech
- 📊 **Learning Dashboard** - Track progress and achievements
- ⭐ **Favorite Phrases** - Save and export useful expressions

   🚀 Live Demo

Check out the live app: [Language Buddy on Netlify](https://your-app-name.netlify.app)

> **Note**: When you first deploy, the app will show a setup screen with instructions for configuring your API keys. See our [Deployment Guide](DEPLOYMENT.md) for detailed setup instructions.

   🛠️ Technologies Used

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Authentication:** Firebase Auth
- **AI/ML:** Google Gemini 1.5 Flash API
- **Hosting:** Netlify
- **APIs:** Loaded via CDN (no local installation required)

   📦 Quick Start

> **🚀 Need help with deployment?** Check out our detailed [Deployment Guide](DEPLOYMENT.md) for step-by-step instructions and troubleshooting.

    Prerequisites
- A modern web browser
- Firebase account ([Sign up free](https://console.firebase.google.com))
- Google AI Studio account for Gemini API ([Get API key](https://makersuite.google.com/app/apikey))
- Netlify account for hosting ([Sign up free](https://netlify.com))

    Quick Setup
1. **Fork/Clone** this repository
2. **Create config.js** with your API keys (see template below)
3. **Deploy to Netlify** (drag & drop method recommended)
4. **Configure domains** in Firebase and Gemini API settings

    Configuration Template
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

> **Important**: Replace the placeholder values with your actual API keys. The app will automatically detect missing configuration and show setup instructions.

   ⚠️ Troubleshooting Deployment Issues

If you see a "Setup Required" screen after deployment:
1. ✅ Verify `config.js` exists in your project root
2. ✅ Check that API keys are real values (not placeholders)
3. ✅ Ensure Firebase/Gemini domains are configured correctly
4. ✅ See our [Deployment Guide](DEPLOYMENT.md) for detailed troubleshooting

   🔒 Security Notes

- **API Keys:** This is a learning project. For production apps, use environment variables and backend proxies
- **Domain Restrictions:** Both Firebase and Gemini API keys should be restricted to your domain
- **Authentication:** Firebase handles secure user authentication

   💡 How It Works

1. **User Registration/Login**: Secure authentication via Firebase
2. **Language Selection**: Choose from 8 supported languages
3. **AI Conversation**: Chat naturally with the AI tutor
4. **Context Awareness**: AI maintains conversation history for natural dialogue
5. **Learning Focus**: Get corrections, explanations, and practice in your target language

   🎯 Features in Detail

- **Multi-language Support**: Switch between languages anytime
- **Conversation History**: Messages persist during your session
- **Typing Indicators**: See when AI is generating a response
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Clean UI**: Modern, distraction-free interface

   🔜 Future Enhancements

- [ ] Voice input/output for pronunciation practice
- [ ] Save conversations to Firebase Firestore
- [ ] User progress tracking
- [ ] Flashcard generation from conversations
- [ ] Grammar explanation mode
- [ ] Offline support with service workers
- [ ] Dark mode toggle
- [ ] Export conversations as study notes

   🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

   📄 License

MIT License - feel free to use this project for learning!

   👤 Author

- GitHub: [@ryanonline1234](https://github.com/ryanonline1234)

   🙏 Acknowledgments

- Google Gemini API for AI capabilities
- Firebase for authentication
- Netlify for hosting
- The open-source community

---

⭐ If you find this project helpful, please give it a star!

   📝 Development Notes

This project uses CDN links for Firebase - no local package installation required. Simply open `index.html` in a browser after configuring your API keys.