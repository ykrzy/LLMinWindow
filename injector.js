// injector.js
"use strict";

(function() {
  // --- Guard Clause: Prevent Double Injection ---
  if (window.aiContextHelperInitialized) {
    // If the sidebar exists, ensure it is visible, then stop
    const existingSidebar = document.getElementById('ai-context-sidebar-container');
    if (existingSidebar) {
        existingSidebar.style.display = 'flex';
    }
    return; 
  }
  window.aiContextHelperInitialized = true;

  const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

  // --- 1. State Management ---
  class ChatState {
    constructor() {
      this.conversationHistory = [];
      this.currentStreamedMessage = "";
      this.isStreaming = false;
      this.elements = {};
    }

    reset() {
      this.conversationHistory = [];
      this.currentStreamedMessage = "";
      this.isStreaming = false;
    }

    addMessage(role, text) {
      this.conversationHistory.push({
        role,
        parts: [{ text }]
      });
    }

    appendToStream(chunk) {
      this.currentStreamedMessage += chunk;
    }

    completeStream() {
      const content = this.currentStreamedMessage;
      this.currentStreamedMessage = "";
      this.isStreaming = false;
      return content;
    }
  }

  const chatState = new ChatState();

  // --- 2. Utility Functions ---
  function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeAndParseMarkdown(text) {
    if (!text || typeof text !== 'string') return '';
    try {
      const dirtyHtml = typeof marked !== 'undefined' ? marked.parse(text) : escapeHTML(text);
      return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(dirtyHtml) : dirtyHtml;
    } catch (error) {
      console.warn('Markdown parsing failed:', error);
      return escapeHTML(text);
    }
  }

  function getElement(id) {
    if (!chatState.elements[id]) {
      chatState.elements[id] = document.getElementById(id);
    }
    return chatState.elements[id];
  }

  function clearElementCache() {
    chatState.elements = {};
  }

  // --- 3. DOM Event Handlers ---
  const eventHandlers = {
    closeSidebar() {
      const sidebar = getElement('ai-context-sidebar-container');
      if (sidebar) {
        sidebar.style.display = 'none';
        chatState.reset();
        clearElementCache();
        
        const messageList = getElement('ai-context-message-list');
        const footer = getElement('ai-context-sidebar-footer');
        
        if (messageList) messageList.innerHTML = '';
        if (footer) footer.style.display = 'none';
      }
    },

    handleChatSubmit(e) {
      e.preventDefault();
      
      if (chatState.isStreaming) {
        console.warn('Cannot send message while streaming');
        return;
      }

      const inputEl = getElement('ai-context-chat-input');
      if (!inputEl) return;

      const userText = inputEl.value.trim();
      if (userText.length === 0) return;

      try {
        chatState.addMessage('user', userText);
        const cleanHtml = sanitizeAndParseMarkdown(userText);
        addMessageToChat(`<p>${cleanHtml}</p>`, 'user');
        
        inputEl.value = '';

        browserAPI.runtime.sendMessage({
          action: "sendFollowUp",
          history: chatState.conversationHistory
        }).catch(error => {
          console.error('Failed to send follow-up:', error);
          showError('Failed to send message. Please try again.');
        });
      } catch (error) {
        console.error('Error handling chat submit:', error);
        showError('An error occurred while sending your message.');
      }
    },

    handleSummaryRequest() {
      if (chatState.isStreaming) {
        console.warn('Cannot generate summary while streaming');
        return;
      }

      console.log("Generating summary...");

      const summaryPromptText = `
        Act as a senior SOC analyst. Please provide a 2-3 sentence summary 
        of this entire investigation for my case notes. Focus on the final 
        conclusion, key artifacts, and recommended next steps (if any).
      `;

      try {
        const summaryPrompt = {
          "role": "user",
          "parts": [{ "text": summaryPromptText }]
        };

        const summaryHistory = [...chatState.conversationHistory, summaryPrompt];
        
        console.log("Summary history being sent:", JSON.stringify(summaryHistory, null, 2));

        browserAPI.runtime.sendMessage({
          action: "sendFollowUp",
          history: summaryHistory
        }).catch(error => {
          console.error('Failed to generate summary:', error);
          showError('Failed to generate summary. Please try again.');
        });
      } catch (error) {
        console.error('Error handling summary request:', error);
        showError('An error occurred while generating summary.');
      }
    }
  };

  // --- 4. UI Building Functions ---
  function createSidebar() {
    try {
      const existingSidebar = getElement('ai-context-sidebar-container');
      if (existingSidebar) {
        existingSidebar.style.display = 'flex';
        return;
      }

      const sidebar = document.createElement('div');
      sidebar.id = 'ai-context-sidebar-container';

      if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        sidebar.classList.add('dark');
      }
      
      sidebar.innerHTML = `
        <div id="ai-context-sidebar-header">
          <h3>AI Context Helper</h3>
          <div>
            <button id="ai-context-summary-btn" title="Generate Close Notes"></button>
            <button id="ai-context-sidebar-close" title="Close">&times;</button>
          </div>
        </div>
        <div id="ai-context-sidebar-body">
          <div id="ai-context-message-list"></div>
        </div>
        <div id="ai-context-sidebar-footer" style="display: none;">
          <form id="ai-context-chat-form">
            <textarea id="ai-context-chat-input" placeholder="Ask a follow-up..." rows="3"></textarea>
            <button id="ai-context-chat-send" type="submit" title="Send">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"></path></svg>
            </button>
          </form>
        </div>
      `;

      document.body.appendChild(sidebar);
      clearElementCache(); // Clear cache since we added new elements
      
      // Attach event listeners
      attachEventListeners();
      
    } catch (error) {
      console.error('Error creating sidebar:', error);
    }
  }

  function attachEventListeners() {
    const closeBtn = getElement('ai-context-sidebar-close');
    const summaryBtn = getElement('ai-context-summary-btn');
    const chatForm = getElement('ai-context-chat-form');

    if (closeBtn) {
      closeBtn.addEventListener('click', eventHandlers.closeSidebar);
    }

    if (summaryBtn) {
      summaryBtn.addEventListener('click', eventHandlers.handleSummaryRequest);
    }

    if (chatForm) {
      chatForm.addEventListener('submit', eventHandlers.handleChatSubmit);
    }
  }

  function addMessageToChat(content, role, id = null) {
    try {
      const messageList = getElement('ai-context-message-list');
      if (!messageList) {
        console.error('Message list element not found');
        return;
      }

      const bubble = document.createElement('div');
      bubble.className = `ai-context-message-bubble ${role}`;
      if (id) bubble.id = `ai-context-bubble-${id}`;

      if (role === 'model' && id === 'loading') {
        bubble.innerHTML = `
          <div id="ai-context-sidebar-loader">
            <div class="bounce1"></div><div class="bounce2"></div><div class="bounce3"></div>
          </div>
        `;
      } else {
        bubble.innerHTML = content || '';
      }
      
      messageList.appendChild(bubble);
      scrollToBottom();
      
    } catch (error) {
      console.error('Error adding message to chat:', error);
    }
  }

  function scrollToBottom() {
    const messageBody = getElement('ai-context-sidebar-body');
    if (messageBody) {
      messageBody.scrollTop = messageBody.scrollHeight;
    }
  }

  function showError(errorMessage) {
    const safeError = escapeHTML(errorMessage);
    const errorHtml = `<span class="ai-context-error">Error: ${safeError}</span>`;
    addMessageToChat(errorHtml, 'model');
    
    const footer = getElement('ai-context-sidebar-footer');
    if (footer) {
      footer.style.display = 'block';
    }
  }

  // --- 5. Message Handlers ---
  const messageHandlers = {
    ping(request, sendResponse) {
      sendResponse({ status: "ready" });
    },

    showLoading(request) {
      chatState.isStreaming = true;
      
      if (chatState.conversationHistory.length === 0 && request.originalQuery) {
        const messageList = getElement('ai-context-message-list');
        if (messageList) messageList.innerHTML = '';
        
        chatState.addMessage('user', request.originalQuery);
      }
      
      addMessageToChat(null, 'model', 'loading');
      
      const footer = getElement('ai-context-sidebar-footer');
      if (footer) footer.style.display = 'none';
    },

    appendStreamChunk(request) {
      console.log("Processing chunk:", request.chunk);
      
      if (!request.chunk) return;
      
      chatState.appendToStream(request.chunk);

      let loadingBubble = document.getElementById('ai-context-bubble-loading');
      if (loadingBubble) {
        loadingBubble.innerHTML = '';
        loadingBubble.id = 'ai-context-bubble-streaming';
      }
      
      const streamingBubble = document.getElementById('ai-context-bubble-streaming');
      if (streamingBubble) {
        const cleanHtml = sanitizeAndParseMarkdown(chatState.currentStreamedMessage);
        streamingBubble.innerHTML = cleanHtml;
        scrollToBottom();
      }
    },

    streamComplete(request) {
      console.log("Stream complete with content:", request.fullContent);
      
      const bufferedContent = chatState.completeStream(); 
      const content = request.fullContent || bufferedContent;
      
      if (content) {
        chatState.addMessage('model', content);
      }

      const finalBubble = document.getElementById('ai-context-bubble-streaming');
      if (finalBubble) {
        finalBubble.id = '';
      }

      const footer = getElement('ai-context-sidebar-footer');
      if (footer) footer.style.display = 'block';
    },

    showError(request) {
      chatState.isStreaming = false;
      
      const loading = document.getElementById('ai-context-bubble-loading');
      const streaming = document.getElementById('ai-context-bubble-streaming');
      const safeError = escapeHTML(request.error || 'Unknown error occurred');
      const errorHtml = `<span class="ai-context-error">Error: ${safeError}</span>`;

      if (loading) {
        loading.innerHTML = errorHtml;
        loading.id = '';
      } else if (streaming) {
        streaming.innerHTML += errorHtml;
        streaming.id = '';
      } else {
        addMessageToChat(errorHtml, 'model');
      }
      
      const footer = getElement('ai-context-sidebar-footer');
      if (footer) footer.style.display = 'block';
    }
  };

  // --- 6. Main Message Listener ---
  browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
      console.log("Content script received:", request.action, request);
      
      if (request.action === "pingSidebar") {
        messageHandlers.ping(request, sendResponse);
        return true;
      }

      createSidebar();

      const handler = messageHandlers[request.action];
      if (handler) {
        handler(request);
        sendResponse({ status: "Message received by injector V3.1" });
      } else {
        console.warn('Unknown action:', request.action);
        sendResponse({ status: "Unknown action", error: true });
      }
      
    } catch (error) {
      console.error('Error handling message:', error);
      showError('An unexpected error occurred');
      sendResponse({ status: "Error", error: error.message });
    }
    
    return true;
  });

  // --- 7. Error Handling for Global Errors ---
  window.addEventListener('error', (event) => {
    console.error('Global error in injector:', event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection in injector:', event.reason);
  });

})(); // <--- End of IIFE