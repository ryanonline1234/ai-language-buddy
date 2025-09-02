/**
 * MessageHandler Class - Centralized message management with enhanced error handling,
 * retry logic, and security features.
 * 
 * This class encapsulates all message-related functionality to prevent duplication
 * and provide a clean, maintainable interface for message operations.
 */
class MessageHandler {
    constructor() {
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 1000,
            backoffMultiplier: 2
        };
        
        this.rateLimit = {
            maxMessages: 20,
            windowMs: 60000 // 1 minute
        };
        
        this.offlineQueue = [];
        this.isOnline = navigator.onLine;
        
        this.setupEventListeners();
        this.loadOfflineQueue();
        
        console.log('✅ MessageHandler initialized with enhanced features');
    }
    
    /**
     * Main method to add messages with full validation and error handling.
     * @param {string} message - The message content
     * @param {string} sender - The sender type ('user' or 'ai')
     * @param {boolean} shouldAutoSpeak - Whether to auto-speak and save to database
     * @returns {Promise<boolean>} Success status
     */
    async addMessage(message, sender, shouldAutoSpeak = true) {
        try {
            // Validate inputs
            this.validateMessageInputs(message, sender);
            
            // Check rate limiting
            if (!this.checkRateLimit()) {
                throw new Error('Rate limit exceeded. Please wait before sending another message.');
            }
            
            // Sanitize message content
            const sanitizedMessage = this.sanitizeMessage(message);
            
            // Create and display message element
            await this.displayMessage(sanitizedMessage, sender);
            
            // Handle persistence if needed
            if (shouldAutoSpeak !== false) {
                await this.handlePersistence(sanitizedMessage, sender);
            }
            
            // Handle auto-speak for AI messages
            if (sender === 'ai' && window.autoSpeakEnabled && shouldAutoSpeak) {
                this.scheduleAutoSpeak(sanitizedMessage);
            }
            
            // Log successful operation
            this.logOperation('message_added', { message: sanitizedMessage, sender, shouldAutoSpeak });
            
            return true;
            
        } catch (error) {
            this.handleError('addMessage', error, { message, sender, shouldAutoSpeak });
            return false;
        }
    }
    
    /**
     * Validates message inputs to ensure they meet requirements.
     * @param {string} message - The message content
     * @param {string} sender - The sender type
     * @throws {Error} If validation fails
     */
    validateMessageInputs(message, sender) {
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            throw new Error('Message must be a non-empty string');
        }
        
        if (!sender || !['user', 'ai'].includes(sender)) {
            throw new Error('Sender must be either "user" or "ai"');
        }
        
        if (message.length > 5000) {
            throw new Error('Message exceeds maximum length of 5000 characters');
        }
    }
    
    /**
     * Sanitizes message content to prevent XSS and other security issues.
     * @param {string} message - The message to sanitize
     * @returns {string} Sanitized message
     */
    sanitizeMessage(message) {
        if (!message) return '';
        
        // Create temporary element for HTML escaping
        const temp = document.createElement('div');
        temp.textContent = message;
        let sanitized = temp.innerHTML;
        
        // Remove dangerous URL schemes
        const dangerousSchemes = ['javascript:', 'data:', 'vbscript:', 'file:', 'ftp:'];
        dangerousSchemes.forEach(scheme => {
            const regex = new RegExp(scheme, 'gi');
            sanitized = sanitized.replace(regex, '');
        });
        
        // Remove event handlers
        sanitized = sanitized.replace(/on\w+\s*=/gi, '');
        
        return sanitized;
    }
    
    /**
     * Creates and displays a message element with smooth animations.
     * @param {string} message - The sanitized message content
     * @param {string} sender - The message sender
     * @returns {Promise<void>}
     */
    async displayMessage(message, sender) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) {
            throw new Error('Chat messages container not found in DOM');
        }
        
        const messageElement = this.createMessageElement(message, sender);
        
        // Add with animation
        await this.animateMessageEntry(chatMessages, messageElement);
    }
    
    /**
     * Creates a message DOM element with proper structure and security.
     * @param {string} message - The message content
     * @param {string} sender - The sender type
     * @returns {HTMLElement} The message element
     */
    createMessageElement(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        messageDiv.setAttribute('data-message-id', this.generateMessageId());
        messageDiv.setAttribute('data-timestamp', Date.now());
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Create message content safely
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = message; // Use textContent for security
        
        const messageActions = document.createElement('div');
        messageActions.className = 'message-actions';
        
        // Create action buttons with proper event listeners
        const speakerBtn = this.createActionButton('🔊', 'Speak this message', () => {
            this.speakMessage(message, sender);
        });
        
        const favoriteBtn = this.createActionButton('⭐', 'Add to favorites', () => {
            this.favoriteMessage(message, sender);
        });
        
        messageActions.appendChild(speakerBtn);
        messageActions.appendChild(favoriteBtn);
        
        const messageTime = document.createElement('div');
        messageTime.className = 'message-time';
        messageTime.textContent = timestamp;
        
        messageContent.appendChild(messageText);
        messageContent.appendChild(messageActions);
        messageContent.appendChild(messageTime);
        messageDiv.appendChild(messageContent);
        
        return messageDiv;
    }
    
    /**
     * Creates an action button with proper event handling.
     * @param {string} icon - The button icon
     * @param {string} title - The button title
     * @param {Function} handler - The click handler
     * @returns {HTMLElement} The button element
     */
    createActionButton(icon, title, handler) {
        const button = document.createElement('button');
        button.textContent = icon;
        button.title = title;
        button.className = `message-${icon === '🔊' ? 'speaker' : 'favorite'}-btn`;
        button.addEventListener('click', handler);
        return button;
    }
    
    /**
     * Animates message entry with smooth effects.
     * @param {HTMLElement} container - The messages container
     * @param {HTMLElement} messageElement - The message element
     * @returns {Promise<void>}
     */
    async animateMessageEntry(container, messageElement) {
        // Set initial state for animation
        messageElement.style.opacity = '0';
        messageElement.style.transform = 'translateY(20px)';
        messageElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        
        container.appendChild(messageElement);
        
        // Trigger animation
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                messageElement.style.opacity = '1';
                messageElement.style.transform = 'translateY(0)';
                
                // Smooth scroll to bottom
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });
                
                setTimeout(resolve, 300); // Wait for animation to complete
            });
        });
    }
    
    /**
     * Handles message persistence with retry logic and offline support.
     * @param {string} message - The message content
     * @param {string} sender - The sender type
     * @returns {Promise<void>}
     */
    async handlePersistence(message, sender) {
        if (!this.canSaveToDatabase()) {
            this.logOperation('persistence_skipped', { reason: 'No database or auth available' });
            return;
        }
        
        try {
            this.showSaveIndicator(true);
            await this.saveWithRetry(message, sender);
            this.showSaveIndicator(false, true);
            
        } catch (error) {
            this.showSaveIndicator(false, false);
            
            if (!this.isOnline) {
                this.queueForOfflineSync(message, sender);
            } else {
                throw error; // Re-throw if not a connectivity issue
            }
        }
    }
    
    /**
     * Checks if database saving is possible.
     * @returns {boolean} Whether saving is possible
     */
    canSaveToDatabase() {
        return !!(window.db && window.auth && window.auth.currentUser);
    }
    
    /**
     * Saves a message with retry logic and exponential backoff.
     * @param {string} message - The message content
     * @param {string} sender - The sender type
     * @returns {Promise<void>}
     */
    async saveWithRetry(message, sender) {
        let lastError;
        
        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                const targetLanguage = this.getTargetLanguage();
                await window.saveMessageToFirestore(message, sender, targetLanguage);
                
                this.logOperation('message_saved', { attempt, message, sender });
                return; // Success
                
            } catch (error) {
                lastError = error;
                
                if (attempt < this.retryConfig.maxRetries) {
                    const delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
                    console.warn(`Save attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
                    await this.delay(delay);
                }
            }
        }
        
        throw new Error(`Failed to save message after ${this.retryConfig.maxRetries} attempts: ${lastError.message}`);
    }
    
    /**
     * Gets the current target language.
     * @returns {string} The target language
     */
    getTargetLanguage() {
        return document.getElementById('targetLanguage')?.value || 
               window.currentActiveLanguage || 
               'Spanish';
    }
    
    /**
     * Utility method for delays.
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Shows save indicator with different states.
     * @param {boolean} isLoading - Whether in loading state
     * @param {boolean} success - Whether operation was successful
     */
    showSaveIndicator(isLoading, success = null) {
        // Use the global function if available
        if (typeof window.showSaveIndicator === 'function') {
            window.showSaveIndicator(isLoading, success);
        }
    }
    
    /**
     * Queues a message for offline synchronization.
     * @param {string} message - The message content
     * @param {string} sender - The sender type
     */
    queueForOfflineSync(message, sender) {
        const queuedMessage = {
            id: this.generateMessageId(),
            message,
            sender,
            targetLanguage: this.getTargetLanguage(),
            timestamp: Date.now(),
            retryCount: 0
        };
        
        this.offlineQueue.push(queuedMessage);
        this.saveOfflineQueue();
        
        this.logOperation('message_queued', queuedMessage);
        this.showOfflineNotification(this.offlineQueue.length);
    }
    
    /**
     * Processes the offline message queue when connection is restored.
     * @returns {Promise<void>}
     */
    async processOfflineQueue() {
        if (this.offlineQueue.length === 0) return;
        
        console.log(`Processing ${this.offlineQueue.length} offline messages...`);
        const processed = [];
        
        for (const queuedMessage of this.offlineQueue) {
            try {
                await this.saveWithRetry(queuedMessage.message, queuedMessage.sender);
                processed.push(queuedMessage.id);
                
            } catch (error) {
                console.error('Failed to sync queued message:', queuedMessage.id, error);
                queuedMessage.retryCount++;
                
                // Remove messages that have failed too many times
                if (queuedMessage.retryCount >= 5) {
                    processed.push(queuedMessage.id);
                    console.warn('Removing message from queue after 5 failed attempts:', queuedMessage.id);
                }
            }
        }
        
        // Remove processed messages
        this.offlineQueue = this.offlineQueue.filter(msg => !processed.includes(msg.id));
        this.saveOfflineQueue();
        
        if (processed.length > 0) {
            console.log(`Successfully processed ${processed.length} offline messages`);
        }
    }
    
    /**
     * Saves the offline queue to localStorage.
     */
    saveOfflineQueue() {
        try {
            localStorage.setItem('messageOfflineQueue', JSON.stringify(this.offlineQueue));
        } catch (error) {
            console.error('Failed to save offline queue:', error);
        }
    }
    
    /**
     * Loads the offline queue from localStorage.
     */
    loadOfflineQueue() {
        try {
            const stored = localStorage.getItem('messageOfflineQueue');
            this.offlineQueue = stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Failed to load offline queue:', error);
            this.offlineQueue = [];
        }
    }
    
    /**
     * Shows notification about offline queue status.
     * @param {number} queueSize - Number of messages in queue
     */
    showOfflineNotification(queueSize) {
        // Use global function if available
        if (typeof window.showOfflineQueueNotification === 'function') {
            window.showOfflineQueueNotification(queueSize);
        }
    }
    
    /**
     * Checks rate limiting for message sending.
     * @returns {boolean} Whether the action is allowed
     */
    checkRateLimit() {
        const now = Date.now();
        const rateLimitData = this.getRateLimitData();
        
        // Remove old timestamps
        rateLimitData.timestamps = rateLimitData.timestamps.filter(
            timestamp => now - timestamp < this.rateLimit.windowMs
        );
        
        // Check if under limit
        if (rateLimitData.timestamps.length >= this.rateLimit.maxMessages) {
            return false;
        }
        
        // Add current timestamp
        rateLimitData.timestamps.push(now);
        this.saveRateLimitData(rateLimitData);
        
        return true;
    }
    
    /**
     * Gets rate limit data from localStorage.
     * @returns {Object} Rate limit data
     */
    getRateLimitData() {
        try {
            return JSON.parse(localStorage.getItem('messageRateLimit') || '{"timestamps":[]}');
        } catch {
            return { timestamps: [] };
        }
    }
    
    /**
     * Saves rate limit data to localStorage.
     * @param {Object} data - Rate limit data
     */
    saveRateLimitData(data) {
        try {
            localStorage.setItem('messageRateLimit', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save rate limit data:', error);
        }
    }
    
    /**
     * Schedules auto-speak for AI messages.
     * @param {string} message - The message to speak
     */
    scheduleAutoSpeak(message) {
        const targetLanguage = this.getTargetLanguage();
        setTimeout(() => {
            try {
                if (typeof window.speakText === 'function') {
                    window.speakText(message, targetLanguage);
                }
            } catch (error) {
                console.error('Failed to auto-speak message:', error);
            }
        }, 500);
    }
    
    /**
     * Handles speaking a specific message.
     * @param {string} message - The message to speak
     * @param {string} sender - The message sender
     */
    speakMessage(message, sender) {
        try {
            if (typeof window.speakMessage === 'function') {
                window.speakMessage(message, sender);
            }
        } catch (error) {
            console.error('Failed to speak message:', error);
        }
    }
    
    /**
     * Handles favoriting a message.
     * @param {string} message - The message to favorite
     * @param {string} sender - The message sender
     */
    favoriteMessage(message, sender) {
        try {
            if (typeof window.favoriteMessage === 'function') {
                window.favoriteMessage(message, sender);
            }
        } catch (error) {
            console.error('Failed to favorite message:', error);
        }
    }
    
    /**
     * Sets up event listeners for online/offline detection.
     */
    setupEventListeners() {
        window.addEventListener('online', () => {
            console.log('Connection restored, processing offline queue...');
            this.isOnline = true;
            this.processOfflineQueue();
        });
        
        window.addEventListener('offline', () => {
            console.log('Connection lost, messages will be queued for later sync');
            this.isOnline = false;
        });
    }
    
    /**
     * Generates a unique message ID.
     * @returns {string} Unique message ID
     */
    generateMessageId() {
        return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Logs operations for debugging and monitoring.
     * @param {string} operation - The operation type
     * @param {Object} data - Operation data
     */
    logOperation(operation, data) {
        const isDevelopment = window.location.hostname === 'localhost' || 
                             window.location.hostname === '127.0.0.1';
        
        if (isDevelopment) {
            console.log(`[MessageHandler] ${operation}:`, {
                ...data,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Handles errors with logging and user feedback.
     * @param {string} method - The method where error occurred
     * @param {Error} error - The error object
     * @param {Object} context - Additional context
     */
    handleError(method, error, context = {}) {
        const errorData = {
            method,
            error: error.message,
            stack: error.stack,
            context,
            timestamp: new Date().toISOString()
        };
        
        console.error(`[MessageHandler Error] ${method}:`, errorData);
        
        // Show user-friendly error message
        if (typeof window.showErrorNotification === 'function') {
            window.showErrorNotification(`Failed to process message: ${error.message}`);
        }
        
        // Track error for monitoring (could integrate with error tracking service)
        this.logOperation('error', errorData);
    }
}

// Export for use in other modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessageHandler;
}

// Global instance for backward compatibility
window.MessageHandler = MessageHandler;