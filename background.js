//background.js
const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

// Default prompts configuration
const DEFAULT_PROMPTS = [
  {
    id: "default_1",
    name: "Threat Triage (Concise)",
    template: "Act as a senior SOC analyst. Triage this artifact: **{TEXT}**. Is it benign, suspicious, or malicious? Provide a 1-sentence explanation of the threat or common use. Be brief.",
    placeholders: ["{TEXT}"]
  },
  {
    id: "default_2",
    name: "Map to MITRE (Brief)",
    template: "Map to MITRE ATT&CK: **{TEXT}**. List relevant Tactic/Technique IDs and names (e.g., \"T1059.001: PowerShell\"). Provide 2-3 bullet points on *why*. Omit all other explanation.",
    placeholders: ["{TEXT}"]
  },
  {
    id: "default_3",
    name: "Correlate 2 Artifacts",
    template: "Act as a senior threat analyst. Correlate these two artifacts. What is the likely activity or TTP? Be brief (2 sentences max). \nArtifact 1: **{TEXT1}** \nArtifact 2: **{TEXT2}**",
    placeholders: ["{TEXT1}", "{TEXT2}"]
  },
  {
    id: "default_4",
    name: "Process <> File/Key",
    template: "Explain the relationship between this process/command and the file/key it accessed. Focus on threat. \nProcess: **{PROCESS}** \nArtifact: **{ARTIFACT}**",
    placeholders: ["{PROCESS}", "{ARTIFACT}"]
  },
  {
    id: "default_5",
    name: "Suggest 2 Steps",
    template: "Act as a senior analyst. Given this artifact: **{TEXT}**. List the 2 most important follow-up investigation steps. Use brief bullet points.",
    placeholders: ["{TEXT}"]
  }
];

// Extension lifecycle events
browserAPI.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("First install: Setting default security prompts.");
    browserAPI.storage.sync.set({ prompts: DEFAULT_PROMPTS });
  }
});

// Message handling
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "getPrompts":
      browserAPI.storage.sync.get(['prompts'], (result) => {
        const prompts = result.prompts || DEFAULT_PROMPTS;
        sendResponse({ prompts: prompts });
      });
      return true;

    case "sendStagedPrompt":
      handleStagedPrompt(request, sendResponse);
      return true;

    case "sendFollowUp":
      handleFollowUp(request, sendResponse);
      return true;

    default:
      console.warn(`Unknown action: ${request.action}`);
      sendResponse({ status: "Error", error: "Unknown action" });
  }
});

// Tab update listener for floating button injection
browserAPI.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  console.log(`🔧 Tab updated - tabId: ${tabId}, status: ${changeInfo.status}, provided url: ${tab?.url}`);
  
  // Only proceed if status is complete
  if (changeInfo.status === 'complete') {
    console.log(`🔧 Tab ${tabId} is complete, fetching fresh tab info...`);
    
    try {
      // Get fresh tab information manually
      const freshTab = await browserAPI.tabs.get(tabId);
      console.log(`🔧 Fresh tab info - url: ${freshTab.url}, status: ${freshTab.status}`);
      
      // Check if it's a valid URL for injection
      if (freshTab.url && 
          typeof freshTab.url === 'string' &&
          !freshTab.url.startsWith('chrome://') && 
          !freshTab.url.startsWith('chrome-extension://') &&
          !freshTab.url.startsWith('edge://') &&
          !freshTab.url.startsWith('about:') &&
          (freshTab.url.startsWith('http://') || freshTab.url.startsWith('https://'))) {
        
        console.log(`🔧 Valid tab for injection: ${freshTab.url}`);
        
        // Add a delay to ensure page is fully loaded
        setTimeout(async () => {
          await injectFloatingButton(tabId);
        }, 1500);
        
      } else {
        console.log(`🔧 Skipping invalid URL: ${freshTab.url}`);
      }
      
    } catch (error) {
      console.log(`🔧 Could not get fresh tab info for ${tabId}:`, error.message);
    }
  }
});

// Utility functions
async function injectFloatingButton(tabId) {
  try {
    console.log(`🔧 Starting injection process for tab ${tabId}`);
    
    // Get fresh tab info
    let tab;
    try {
      tab = await browserAPI.tabs.get(tabId);
    } catch (error) {
      console.log(`🔧 Could not get tab info for ${tabId}: ${error.message}`);
      return;
    }
    
    console.log(`🔧 Tab info:`, tab.url, tab.status);
    
    // Skip special pages
    if (!tab.url || 
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('moz-extension://')) {
      console.log(`🔧 Skipping special page: ${tab.url}`);
      return;
    }
    
    // Check if already injected by trying to ping the content script
    try {
      const pingResponse = await browserAPI.tabs.sendMessage(tabId, { action: "ping" });
      if (pingResponse) {
        console.log(`🔧 Content script already exists on tab ${tabId}`);
        return;
      }
    } catch (e) {
      // Expected if no content script exists yet
      console.log(`🔧 No existing content script, proceeding with injection`);
    }
    
    // Inject CSS first
    try {
      await browserAPI.scripting.insertCSS({
        target: { tabId: tabId },
        files: ["floating-button.css"]
      });
      console.log(`🔧 CSS injected successfully on tab ${tabId}`);
    } catch (cssError) {
      console.error(`🔧 CSS injection failed:`, cssError);
      return; // Don't continue if CSS fails
    }
    
    // Then inject JavaScript
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tabId },
        files: ["floating-button.js"]
      });
      console.log(`🔧 JavaScript injected successfully on tab ${tabId}`);
      
      // Verify injection worked
      setTimeout(async () => {
        try {
          await browserAPI.tabs.sendMessage(tabId, { action: "ping" });
          console.log(`🔧 Floating button injection verified for tab ${tabId}`);
        } catch (e) {
          console.log(`🔧 Floating button injection verification failed for tab ${tabId}`);
        }
      }, 500);
      
    } catch (jsError) {
      console.error(`🔧 JavaScript injection failed:`, jsError);
    }
    
  } catch (error) {
    console.error(`🔧 Error injecting floating button on tab ${tabId}:`, error);
  }
}


async function injectSidebarScripts(tabId) {
  await browserAPI.scripting.insertCSS({
    target: { tabId: tabId },
    files: ["sidebar.css"]
  });
  await browserAPI.scripting.executeScript({
    target: { tabId: tabId },
    files: ["purify.min.js", "marked.min.js", "injector.js"]
  });
}

async function ensureContentScriptReady(tabId, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const response = await browserAPI.tabs.sendMessage(tabId, { action: "pingSidebar" });
      if (response?.status === "ready") {
        console.log("Content script is ready.");
        return true;
      }
    } catch (e) {
      console.warn(`Ping attempt ${i + 1} failed:`, e.message);
    }
    
    if (i < maxRetries - 1) {
      console.log("Re-injecting content script...");
      await injectSidebarScripts(tabId);
    }
  }
  throw new Error("Content script failed to respond after multiple attempts");
}

// Handler functions
async function handleStagedPrompt(request, sendResponse) {
  console.log("Handling sendStagedPrompt...");
  
  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("Could not find active tab to inject sidebar.");
    }
    
    const tabId = tab.id;
    await injectSidebarScripts(tabId);
    await ensureContentScriptReady(tabId);

    // Show loading state
    await browserAPI.tabs.sendMessage(tabId, { 
      action: "showLoading",
      originalQuery: request.finalPrompt 
    });
    
    // Get API key and call Gemini
    const keyData = await browserAPI.storage.sync.get(['userApiKey']);
    if (!keyData.userApiKey) {
      throw new Error("API Key not found.");
    }
    
    await callGemini(request.finalPrompt, keyData.userApiKey, tabId);
    sendResponse({ status: "Stream started" });

  } catch (error) { 
    console.error("Error sending staged prompt:", error.message);
    await sendErrorToTab(error.message);
    sendResponse({ status: "Error", error: error.message });
  }
}

async function handleFollowUp(request, sendResponse) {
  console.log("Handling follow-up request...");

  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error("No active tab for follow-up.");
    }
    
    const tabId = tab.id;

    // Show loading state
    await browserAPI.tabs.sendMessage(tabId, { action: "showLoading" });

    const keyData = await browserAPI.storage.sync.get(['userApiKey']);
    if (!keyData.userApiKey) {
      throw new Error("API Key not found.");
    }
    
    await callGeminiChat(request.history, keyData.userApiKey, tabId);
    sendResponse({ status: "Follow-up stream started" });
  
  } catch (error) {
    console.error("Error in follow-up:", error.message);
    await sendErrorToTab(error.message);
    sendResponse({ status: "Error", error: error.message });
  }
}

async function sendErrorToTab(errorMessage, tabId = null) {
  try {
    if (!tabId) {
      const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
    }
    
    if (tabId) {
      await browserAPI.tabs.sendMessage(tabId, {
        action: "showError",
        error: errorMessage
      });
    }
  } catch (e) {
    console.error("Failed to send error to sidebar:", e.message);
  }
}

// Gemini API functions
async function callGemini(promptText, apiKey, tabId) {
  console.log("Calling callGemini (V1.0 wrapper)");
  const history = [{
    "role": "user",
    "parts": [{ "text": promptText }]
  }];
  return await callGeminiChat(history, apiKey, tabId);
}

async function callGeminiChat(history, apiKey, tabId) {
  console.log("Calling callGeminiChat (V2.0 STREAMING)");
  
  // Ensure content script is responsive
  await ensureContentScriptReady(tabId);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${apiKey}`;
  const MAX_RETRIES = 3;
  let delay = 1000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const requestBody = {
        "contents": history,
        "generationConfig": {
          "temperature": 0.5,
          "maxOutputTokens": 100000
        },
        "safetySettings": [
          { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
          { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
          { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
          { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" }
        ]
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        if (response.status === 503 || response.status === 429) {
          if (attempt < MAX_RETRIES - 1) {
            console.warn(`Attempt ${attempt + 1} failed: ${response.status}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
            continue;
          }
        }
        
        let errorMessage;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody?.error?.message || JSON.stringify(errorBody);
        } catch (e) {
          errorMessage = response.statusText;
        }
        throw new Error(`API Error (${response.status}): ${errorMessage}`);
      }

      await processStreamResponse(response, tabId);
      return; // Success, exit retry loop

    } catch (error) {
      if (attempt === MAX_RETRIES - 1 || !error.message.includes("503") && !error.message.includes("429")) {
        console.error("API call failed:", error.message);
        throw error;
      }
      
      console.warn(`Attempt ${attempt + 1} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

async function processStreamResponse(response, tabId) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponseText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      
      if (!chunk || chunk.trim() === '' || chunk.trim() === '[]') {
        continue;
      }

      // Extract text content from JSON chunks
      const textRegex = /"text": "([^"]*)"/g;
      let match;
      let foundText = false;
      
      while ((match = textRegex.exec(chunk)) !== null) {
        foundText = true;
        const textChunk = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
        
        if (textChunk) {
          fullResponseText += textChunk;
          
          try {
            await browserAPI.tabs.sendMessage(tabId, {
              action: "appendStreamChunk",
              chunk: textChunk
            });
          } catch (e) {
            console.error("Failed to send chunk to tab, attempting recovery:", e);
            await recoverContentScript(tabId);
            // Try sending the chunk again
            await browserAPI.tabs.sendMessage(tabId, {
              action: "appendStreamChunk",
              chunk: textChunk
            });
          }
        }
      }
      
      if (!foundText) {
        console.warn("No text found in chunk:", chunk);
      }
    }

    // Send completion message
    if (fullResponseText.trim()) {
      await browserAPI.tabs.sendMessage(tabId, {
        action: "streamComplete",
        fullContent: fullResponseText
      });
    } else {
      throw new Error("No response received from AI");
    }

  } catch (error) {
    console.error("Stream processing error:", error);
    await sendErrorToTab(error.message, tabId);
  }
}

async function recoverContentScript(tabId) {
  try {
    await browserAPI.scripting.executeScript({
      target: { tabId: tabId },
      files: ["purify.min.js", "marked.min.js", "injector.js"]
    });
    await new Promise(resolve => setTimeout(resolve, 200));
  } catch (e) {
    console.error("Failed to recover content script:", e);
    throw new Error("Content script recovery failed");
  }
}
