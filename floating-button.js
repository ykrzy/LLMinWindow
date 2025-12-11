// floating-button.js
const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

const LOG_CONFIG = {
  general: false,
  staging: true
};

function debugLog(category, ...args) {
  if (!LOG_CONFIG[category]) return;
  console.log(`[FloatingButton:${category}]`, ...args);
}

debugLog('general', 'Floating button script loaded at', new Date().toISOString());
debugLog('general', 'Document ready state', document.readyState);
debugLog('general', 'Window location', window.location.href);

class FloatingAIButton {
  constructor() {
    debugLog('general', 'FloatingAIButton constructor called');
    this.button = null;
    this.popup = null;
    this.prompts = [];
    this.stagingState = {};
    this.currentSelection = null;
    
    // Timeout references for cleanup
    this.scrollTimeout = null;
    this.mouseLeaveTimeout = null;
    
    this.init();
  }

  // Add a cleanup method
  cleanup() {
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.mouseLeaveTimeout) clearTimeout(this.mouseLeaveTimeout);
    
    if (this.button) {
      this.button.remove();
      this.button = null;
    }
    
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }

    // Remove event listeners
    document.removeEventListener('mouseup', this.boundHandleTextSelection);
    document.removeEventListener('mousedown', this.boundHandleClickOutside);
    document.removeEventListener('keydown', this.boundHandleKeyDown);
    document.removeEventListener('scroll', this.boundHandleScroll);
  }

  async init() {
    try {
      debugLog('general', 'Initializing floating button');
      await this.loadPrompts();
      debugLog('general', `Prompts loaded: ${this.prompts.length}`);
      this.setupEventListeners();
      debugLog('general', 'Event listeners ready');
      this.createButton();
      debugLog('general', 'Button created');
    } catch (error) {
      console.error('Error in init():', error);
    }
  }

  async loadPrompts() {
    debugLog('general', 'Loading prompts');
    return new Promise((resolve) => {
      browserAPI.runtime.sendMessage({ action: "getPrompts" }, (response) => {
        debugLog('general', 'Prompts response received');
        this.prompts = response?.prompts || [];
        resolve();
      });
    });
  }

  setupEventListeners() {
    // Bind methods to maintain context and enable cleanup
    this.boundHandleTextSelection = (e) => this.handleTextSelection(e);
    this.boundHandleClickOutside = (e) => this.handleClickOutside(e);
    this.boundHandleKeyDown = (e) => {
      if (e.key === 'Escape') this.hideButton();
    };
    this.boundHandleScroll = () => {
      if (this.button && this.button.style.display !== 'none') {
        // Debounce scroll updates
        if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => this.updateButtonPosition(), 100);
      }
    };

    // Use passive listeners for better performance
    document.addEventListener('mouseup', this.boundHandleTextSelection, { passive: true });
    document.addEventListener('mousedown', this.boundHandleClickOutside, { passive: true });
    document.addEventListener('keydown', this.boundHandleKeyDown, { passive: true });
    document.addEventListener('scroll', this.boundHandleScroll, { passive: true });
  }

    handleTextSelection(e) {
    if (this.button?.contains(e.target) || 
        this.popup?.contains(e.target) || 
        document.getElementById('ai-position-slideout')?.contains(e.target)) {
      return;
    }
    // Small delay to ensure selection is complete
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      debugLog('general', 'Selection event', {
        length: selectedText.length,
        preview: this.truncateText(selectedText, 60)
      });
      
      if (selectedText.length > 0) {
        this.currentSelection = selectedText;
        debugLog('general', 'Showing floating button');
        try {
          this.showButton(selection);
          debugLog('general', 'Floating button visible');
        } catch (error) {
          console.error('FloatingButton - Error showing button:', error);
        }
      } else if (!this.hasActiveStaging()) {
        debugLog('general', 'No selection, hiding button');
        this.hideButton();
      }
    }, 10);
  }

  isPromptFullyStaged(promptId) {
    if (!this.stagingState[promptId]) return false;
    
    const prompt = this.prompts.find(p => p.id === promptId);
    if (!prompt) return false;

    // Check if every placeholder defined in the prompt has a value in the staging state
    return prompt.placeholders.every(ph => 
      this.stagingState[promptId][ph] && this.stagingState[promptId][ph].length > 0
    );
  }

  showButton(selection) {
    debugLog('general', 'showButton called');

    if (selection.rangeCount === 0) {
      console.warn('FloatingButton - No ranges in selection');
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    debugLog('general', 'Selection rect', rect);

    // Position at start of first line
    const buttonX = rect.left;
    const buttonY = rect.top - 40; // Above the selection

    if (!this.button) {
      debugLog('general', 'Creating floating button');
      this.createButton();
    }

    debugLog('general', 'Updating button position', { x: buttonX, y: buttonY + window.scrollY });

    this.button.style.left = `${buttonX}px`;
    this.button.style.top = `${buttonY + window.scrollY}px`;
    this.button.style.display = 'flex'; // Changed from 'block' to 'flex'

    debugLog('general', 'Button display/style', this.button.style.display);

    // Update button state based on staging
    this.updateButtonState();
  }

  createButton() {
    debugLog('general', 'createButton called', { exists: !!this.button });
    if (this.button) return;
    
    this.button = document.createElement('div');
    this.button.id = 'ai-floating-button';
    this.button.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"></path>
      </svg>
    `;
    debugLog('general', 'Floating button element created');
    
    // --- UPDATED LISTENER HERE ---
    this.button.addEventListener('mouseenter', (e) => {
      debugLog('general', 'Floating button mouseenter');
      this.handleMouseEnter(e); // Use the dedicated handler!
    });
    
    this.button.addEventListener('mouseleave', (e) => {
      debugLog('general', 'Floating button mouseleave');
      this.handleMouseLeave(e);
    });
    this.button.addEventListener('click', () => {
      debugLog('general', 'Floating button clicked');
      this.handleButtonClick();
    });
    
    document.body.appendChild(this.button);
    debugLog('general', 'Floating button appended');
  }

  updateButtonPosition() {
    if (!this.button || !this.currentSelection) return;
    
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      this.hideButton();
      return;
    }
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Hide button if selection is out of view
    if (rect.top < 0 || rect.bottom > window.innerHeight || 
        rect.left < 0 || rect.right > window.innerWidth) {
      this.hideButton();
      return;
    }
    
    const buttonX = rect.left;
    const buttonY = rect.top - 40;
    
    this.button.style.left = `${buttonX}px`;
    this.button.style.top = `${buttonY + window.scrollY}px`;
  }

  updateButtonState() {
    const activePromptId = Object.keys(this.stagingState)[0];
    
    if (activePromptId) {
      // We have an active staging session
      const isComplete = this.isPromptFullyStaged(activePromptId);
      
      this.button.classList.add('visible');
      
      if (isComplete) {
        // All slots filled: Blue button, ready to send
        this.button.classList.add('ready-to-send');
        this.button.classList.remove('staging-mode');
        this.button.textContent = '➤'; // Or your send icon
      } else {
        // Partial slots: Grey/Neutral button, waiting for more input
        this.button.classList.remove('ready-to-send');
        this.button.classList.add('staging-mode');
        this.button.textContent = '➕'; // Indicating "Add more" or "Set slot"
      }
    } else {
      // No active session
      this.button.classList.remove('ready-to-send', 'staging-mode');
      this.button.textContent = ''; // Reset text
      this.button.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"></path>
        </svg>
      `;
    }
  }

  isReadyToExecute() {
    // Check if we have a complete multi-placeholder prompt ready
    for (const promptId in this.stagingState) {
      const prompt = this.prompts.find(p => p.id === promptId);
      if (prompt && this.isPromptComplete(prompt, this.stagingState[promptId])) {
        return true;
      }
    }
    return false;
  }

  isPromptComplete(prompt, stagedData) {
    return prompt.placeholders.every(placeholder => stagedData[placeholder]);
  }

  hasActiveStaging() {
    return Object.keys(this.stagingState).length > 0;
  }

  showPopup() {
    if (this.popup) {
      this.popup.remove();
    }
    
    this.popup = document.createElement('div');
    this.popup.id = 'ai-floating-popup';
    
    if (this.hasActiveStaging()) {
      this.createStagingPopup();
    } else {
      this.createPromptSelectionPopup();
    }
    
    this.positionPopup();
    document.body.appendChild(this.popup);
  }

  createPromptSelectionPopup() {
    const promptList = this.prompts.map(prompt => {
      const isSingle = prompt.placeholders.length === 1 && prompt.placeholders[0] === '{TEXT}';
      return `
        <div class="prompt-item ${isSingle ? 'single' : 'multi'}" data-prompt-id="${prompt.id}">
          ${prompt.name}
          ${!isSingle ? '<span class="arrow">→</span>' : ''}
        </div>
      `;
    }).join('');
    
    this.popup.innerHTML = `<div class="prompt-list">${promptList}</div>`;
    
    // Add event listeners
    this.popup.querySelectorAll('.prompt-item').forEach(item => {
      item.addEventListener('click', (e) => this.handlePromptSelection(e));
      item.addEventListener('mouseenter', (e) => this.handlePromptHover(e));
    });
  }

  createStagingPopup() {
    const activePromptId = Object.keys(this.stagingState)[0];
    const activePrompt = this.prompts.find(p => p.id === activePromptId);
    
    // Safety check: If for some reason the prompt is lost, reset to avoid getting stuck
    if (!activePrompt) {
        console.warn('Active prompt not found in staging state. Resetting.');
        this.resetStaging();
        return;
    }

    const stagedData = this.stagingState[activePromptId];
    
    // We want to show which slots are filled, but allow clicking ANY of them to assign current text
    const positionList = activePrompt.placeholders.map(placeholder => {
      const isFilled = !!stagedData[placeholder];
      const val = isFilled ? this.truncateText(stagedData[placeholder], 25) : 'Click to assign current selection';
      const statusClass = isFilled ? 'filled' : 'empty';
      const icon = isFilled ? '✓' : '＋';

      return `
        <div class="position-item ${statusClass}" data-placeholder="${placeholder}">
          <div class="position-header">
            <span class="placeholder-name">${placeholder}</span>
            <span class="status-icon">${icon}</span>
          </div>
          <div class="placeholder-value">${val}</div>
        </div>
      `;
    }).join('');
    
    this.popup.innerHTML = `
      <div class="staging-popup">
        <div class="prompt-title">
            ${activePrompt.name}
            <div class="prompt-subtitle">Assign selection to:</div>
        </div>
        <div class="position-list">${positionList}</div>
        <div class="reset-button" data-action="reset">
            <span class="reset-icon">⟲</span>
            <span>Reset / Clear All</span>
        </div>
      </div>
    `;
    
    // Add event listeners using currentTarget to ensure we get the data attribute
    this.popup.querySelectorAll('.position-item').forEach(item => {
      item.addEventListener('click', (e) => this.handlePositionSelection(e));
      item.addEventListener('mouseenter', (e) => {
          e.currentTarget.style.filter = 'brightness(0.95)';
      });
      item.addEventListener('mouseleave', (e) => {
          e.currentTarget.style.filter = 'none';
      });
    });
    
    this.popup.querySelector('.reset-button').addEventListener('click', () => this.resetStaging());
  }

  handlePromptSelection(e) {
    // FIX: Use currentTarget to ensure we get the DIV with the dataset, not a child text node
    const target = e.currentTarget;
    const promptId = target.dataset.promptId;
    const prompt = this.prompts.find(p => p.id === promptId);
    
    if (prompt.placeholders.length === 1 && prompt.placeholders[0] === '{TEXT}') {
      this.executeSinglePrompt(prompt);
      debugLog('staging', `Executed single-slot prompt ${prompt.name}`);
    } else {
      debugLog('staging', `Prompt ${prompt.name} selected for staging`);
      this.startStaging(prompt);
    }
  }

  startStaging(prompt) {
    debugLog('staging', `Starting staging for "${prompt.name}" (${prompt.id})`);

    const activePromptId = Object.keys(this.stagingState)[0];

    // Switching prompts? Clear the old session to avoid mixing slots
    if (activePromptId && activePromptId !== prompt.id) {
      debugLog('staging', `Switching staging from ${activePromptId} to ${prompt.id}`);
      this.stagingState = {};
    }

    if (!this.stagingState[prompt.id]) {
      this.stagingState[prompt.id] = {};
    }

    this.updateButtonState();

    // Swap UI from the prompt picker to the slot list immediately
    this.hidePopup();
    this.showPopup();
  }

  handlePromptHover(e) {
    // FIX: Use currentTarget here as well
    const target = e.currentTarget;
    const promptId = target.dataset.promptId;
    const prompt = this.prompts.find(p => p.id === promptId);
    
    // If it's a multi-placeholder prompt, show slide-out
    if (prompt && prompt.placeholders.length > 1) {
      debugLog('staging', `Hovering staged prompt ${prompt.name}`);
      this.showPositionSlideOut(prompt, target);
    }
  }

  showPositionSlideOut(prompt, triggerElement) {
    // Remove existing slide-out
    const existing = document.getElementById('ai-position-slideout');
    if (existing) existing.remove();
    
    const slideOut = document.createElement('div');
    slideOut.id = 'ai-position-slideout';
    
    const positionList = prompt.placeholders.map(placeholder => 
      `<div class="position-option" data-prompt-id="${prompt.id}" data-placeholder="${placeholder}">
        Set as ${placeholder}
      </div>`
    ).join('');
    
    slideOut.innerHTML = `
      <div class="slideout-header">${prompt.name}</div>
      <div class="position-options">${positionList}</div>
    `;
    
    // Append first so we can measure height for viewport clamping
    slideOut.style.position = 'fixed';
    slideOut.style.width = '220px';
    document.body.appendChild(slideOut);
    
    const rect = triggerElement.getBoundingClientRect();
    const GAP = 8;
    const slideWidth = slideOut.offsetWidth || 220;
    
    // Prefer rendering to the right if there is space
    const fitsRight = rect.right + GAP + slideWidth < window.innerWidth;
    const left = fitsRight 
      ? rect.right + GAP 
      : Math.max(GAP, rect.left - slideWidth - GAP);
    
    slideOut.style.left = `${left}px`;
    slideOut.style.right = 'auto';
    
    // Clamp top so panel stays within viewport vertically
    const slideHeight = slideOut.offsetHeight;
    let top = rect.top;
    if (top + slideHeight + GAP > window.innerHeight) {
      top = Math.max(GAP, window.innerHeight - slideHeight - GAP);
    }
    slideOut.style.top = `${Math.max(GAP, top)}px`;
    
    // Add event listeners
    slideOut.querySelectorAll('.position-option').forEach(option => {
      option.addEventListener('click', (e) => this.handlePositionOptionClick(e));
    });
  }

  handlePositionOptionClick(e) {
    // FIX: Use currentTarget here as well
    const target = e.currentTarget;
    const promptId = target.dataset.promptId;
    const placeholder = target.dataset.placeholder;
    
    this.stageText(promptId, placeholder, this.currentSelection);
    debugLog('staging', `Slide-out assignment: ${placeholder}`);
    this.hidePopup();
    
    // Remove slide-out
    const slideOut = document.getElementById('ai-position-slideout');
    if (slideOut) {
      debugLog('staging', 'Slide-out removed');
      slideOut.remove();
    }
  }

  handlePositionSelection(e) {
    const target = e.currentTarget; 
    const placeholder = target.dataset.placeholder;
    const activePromptId = Object.keys(this.stagingState)[0];
    
    // Stage the currently selected text into this slot
    if (!activePromptId) {
      debugLog('staging', 'Position selected but no active prompt');
      return;
    }

    this.stageText(activePromptId, placeholder, this.currentSelection);
    debugLog('staging', `Popup assignment: ${placeholder}`);
    this.hidePopup();
  }

  stageText(promptId, placeholder, text) {
    if (!this.stagingState[promptId]) {
      this.stagingState[promptId] = {};
    }
    
    this.stagingState[promptId][placeholder] = text;
    this.updateButtonState();
    
    debugLog('staging', 'Slot staged', {
      promptId,
      placeholder,
      length: text.length,
      preview: this.truncateText(text, 80)
    });
  }

  executeSinglePrompt(prompt) {
    const finalPrompt = prompt.template.replace('{TEXT}', this.currentSelection);
    this.executePrompt(finalPrompt);
  }

  executePrompt(finalPrompt) {
    // Turn button blue briefly to show execution
    this.button.classList.add('executing');
    
    browserAPI.runtime.sendMessage({
      action: "sendStagedPrompt",
      finalPrompt: finalPrompt
    });
    
    // Hide button after execution
    setTimeout(() => this.hideButton(), 500);
  }

  handleButtonClick() {
    if (this.isReadyToExecute()) {
      // Execute the staged prompt
      const activePromptId = Object.keys(this.stagingState)[0];
      const activePrompt = this.prompts.find(p => p.id === activePromptId);
      const stagedData = this.stagingState[activePromptId];
      
      let finalPrompt = activePrompt.template;
      for (const placeholder of activePrompt.placeholders) {
        finalPrompt = finalPrompt.replace(placeholder, stagedData[placeholder]);
      }
      
      this.executePrompt(finalPrompt);
      this.resetStaging();
    }
  }

  resetStaging() {
    if (Object.keys(this.stagingState).length > 0) {
      debugLog('staging', 'Clearing staging state', {
        previousState: JSON.parse(JSON.stringify(this.stagingState))
      });
    }

    this.stagingState = {};
    this.updateButtonState();
    this.hidePopup();
    
    // If no text selected, hide button
    if (!window.getSelection().toString().trim()) {
      this.hideButton();
    }
  }

  positionPopup() {
    if (!this.popup || !this.button) return;
    
    const buttonRect = this.button.getBoundingClientRect();
    const isTopHalf = buttonRect.top < window.innerHeight / 2;
    
    this.popup.style.position = 'fixed';
    this.popup.style.left = `${buttonRect.left}px`;
    
    if (isTopHalf) {
      // Dropdown
      this.popup.style.top = `${buttonRect.bottom + 5}px`;
    } else {
      // Popup
      this.popup.style.bottom = `${window.innerHeight - buttonRect.top + 5}px`;
    }
  }

  handleMouseEnter() {
    const activePromptId = Object.keys(this.stagingState)[0];
    
    // Condition 1: If we have a fully staged prompt, we do NOT want the staging popup
    if (activePromptId && this.isPromptFullyStaged(activePromptId)) {
       debugLog('staging', 'Hover ignored because prompt fully staged');
       return; 
    }

    // Condition 2: Otherwise (Partial staging OR No active staging), show the appropriate popup
    // showPopup() safely creates the DOM element and checks hasActiveStaging() internally.
    this.showPopup();
  }

  handleMouseLeave(e) {
    // Small delay to allow moving to popup
    if (this.mouseLeaveTimeout) clearTimeout(this.mouseLeaveTimeout);
    this.mouseLeaveTimeout = setTimeout(() => {
      const slideOut = document.getElementById('ai-position-slideout');
      const isOverSlideOut = slideOut?.matches(':hover');
      
      if (!this.popup?.matches(':hover') && !this.button?.matches(':hover') && !isOverSlideOut) {
        debugLog('staging', 'Mouse left controls; hiding popup');
        this.hidePopup();
      }
    }, 100);
  }

  handleClickOutside(e) {
    const slideOut = document.getElementById('ai-position-slideout');
    const clickedSlideOut = slideOut?.contains(e.target);

    if (!this.button?.contains(e.target) && !this.popup?.contains(e.target) && !clickedSlideOut) {
      debugLog('staging', 'Outside click detected; hiding popup');
      this.hidePopup();
    }
  }

  hidePopup() {
    if (this.popup) {
      debugLog('staging', 'Popup hidden/removed');
      this.popup.remove();
      this.popup = null;
    }
    
    const slideOut = document.getElementById('ai-position-slideout');
    if (slideOut) {
      debugLog('staging', 'Slide-out removed');
      slideOut.remove();
    }
  }

  hideButton() {
    if (this.button && this.button.style.display !== 'none') {
      debugLog('staging', 'Floating button hidden');
      this.button.style.display = 'none';
    }
    this.hidePopup();
  }

  truncateText(text, maxLength) {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
}

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ping") {
    debugLog('general', 'Floating button ping received');
    sendResponse({ status: "floating-button-ready" });
    return true;
  }
});

// Global instance for potential cleanup
debugLog('general', 'Initializing floating button bootstrap');

if (window.floatingButtonInstance) {
  debugLog('general', 'Cleaning up previous floating button instance');
  window.floatingButtonInstance.cleanup();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  debugLog('general', 'DOM loading, waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', () => {
    debugLog('general', 'DOMContentLoaded fired, creating instance');
    window.floatingButtonInstance = new FloatingAIButton();
  });
} else {
  debugLog('general', 'DOM ready, creating instance immediately');
  window.floatingButtonInstance = new FloatingAIButton();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.floatingButtonInstance) {
    window.floatingButtonInstance.cleanup();
  }
});
