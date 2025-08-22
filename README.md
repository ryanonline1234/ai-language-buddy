  🌍 Language Buddy AI

An AI-powered language learning chat application that helps users practice conversations in multiple languages with an intelligent AI tutor.

   ✨ Features

- 🔐 **Secure Authentication** - Firebase Auth for user accounts
- 🤖 **AI-Powered Conversations** - Google Gemini API integration
- 🌐 **8 Languages Supported** - Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese
- 💬 **Real-time Chat Interface** - Modern, responsive design
- 📱 **Mobile-Friendly** - Works seamlessly on all devices
- 🎨 **Clean UI/UX** - Intuitive interface with typing indicators

   🚀 Live Demo

Check out the live app: [Language Buddy on Netlify]((https://adorable-puffpuff-fc6e40.netlify.app/))

   🛠️ Technologies Used

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Authentication:** Firebase Auth
- **AI/ML:** Google Gemini 1.5 Flash API
- **Hosting:** Netlify
- **APIs:** Loaded via CDN (no local installation required)

   📦 Installation & Setup

    Prerequisites
- A modern web browser
- Firebase account
- Google AI Studio account for Gemini API
- Netlify account (for deployment)

    Step 1: Clone the Repository
```bash
git clone https://github.com/yourusername/language-buddy-ai.git
cd language-buddy-ai
```

    Step 2: Set Up Firebase
1. Create a project in [Firebase Console](https://console.firebase.google.com)
2. Enable Email/Password authentication
3. Add your domain to authorized domains
4. Copy your Firebase configuration

    Step 3: Set Up Google Gemini API
1. Get an API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Add HTTP referrer restrictions for your domain

    Step 4: Configure the Application
1. Open `app.js`
2. Replace the Firebase config object with your own:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```
3. Replace the Gemini API key:
```javascript
const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
```

    Step 5: Deploy
1. Drag and drop files to [Netlify](https://netlify.com)
2. Add your Netlify domain to Firebase authorized domains
3. Update Gemini API restrictions to include your Netlify domain

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

