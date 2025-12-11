let currentlyEditingId = null;
// --- Milestone 4.1: The "Smarter" Prompt Library Logic ---

document.addEventListener('DOMContentLoaded', restore_options);
document.getElementById('saveApi').addEventListener('click', save_api_key);
document.getElementById('addPrompt').addEventListener('click', handle_form_submit);
document.getElementById('cancelEdit').addEventListener('click', reset_form);

// --- NEW DATA STRUCTURE ---
// We now store a 'placeholders' array with each prompt:
// {
//   id: "...",
//   name: "Summarize",
//   template: "Summarize: {TEXT}",
//   placeholders: ["{TEXT}"] 
// },
// {
//   id: "...",
//   name: "Explain Command/Key",
//   template: "Command: {TEXT1}, Key: {TEXT2}",
//   placeholders: ["{TEXT1}", "{TEXT2}"] 
// }

function save_api_key() {
  const apiKey = document.getElementById('apiKey').value;
  chrome.storage.sync.set({ userApiKey: apiKey }, () => {
    show_status("API Key saved.");
  });
}

function restore_options() {
  chrome.storage.sync.get(['userApiKey', 'prompts'], (result) => {
    if (result.userApiKey) {
      document.getElementById('apiKey').value = result.userApiKey;
    }
    render_prompt_list(result.prompts || []);
  });
}

function render_prompt_list(prompts) {
  const listElement = document.getElementById('promptList');
  listElement.innerHTML = ''; 

  if (prompts.length === 0) {
    listElement.innerHTML = '<li>No prompts saved yet.</li>';
    return;
  }

  prompts.forEach(prompt => {
    const li = document.createElement('li');
    
    // Create a preview of the placeholders
    const placeholders = prompt.placeholders ? prompt.placeholders.join(', ') : 'None';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    nameSpan.textContent = prompt.name;
    
    const templateSpan = document.createElement('span');
    templateSpan.className = 'template';
    templateSpan.textContent = `(Placeholders: ${placeholders})`; // Show the placeholders
    templateSpan.title = prompt.template; // Show full template on hover
    
    const editButton = document.createElement('button');
    editButton.className = 'edit'; // You can style this in CSS if you want
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => {
    // Find the full prompt object and pass it
    const promptToEdit = prompts.find(p => p.id === prompt.id);
    if (promptToEdit) {
        populate_form_for_edit(promptToEdit);
    }
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => delete_prompt(prompt.id));
    
    li.appendChild(nameSpan);
    li.appendChild(templateSpan);
    li.appendChild(editButton); 
    li.appendChild(deleteButton);
    listElement.appendChild(li);
  });
}

/**
 * NEW: The main submit handler
 * Decides whether to add a new prompt or update an existing one
 */
function handle_form_submit() {
  if (currentlyEditingId) {
    update_existing_prompt(currentlyEditingId);
  } else {
    save_new_prompt();
  }
}

/**
 * This is your OLD "add_new_prompt" function, just renamed
 */
function save_new_prompt() {
  const name = document.getElementById('promptName').value;
  const template = document.getElementById('promptTemplate').value;

  if (!name || !template) {
    show_status("Please fill in both name and template.", true);
    return;
  }

  const placeholderRegex = /\{[^\}]+\}/g;
  const placeholders = template.match(placeholderRegex); 

  if (!placeholders) {
    show_status("Error: Template needs at least one placeholder, like {TEXT}.", true);
    return;
  }

  const newPrompt = {
    id: `prompt_${Date.now()}`,
    name: name,
    template: template,
    placeholders: placeholders
  };

  chrome.storage.sync.get(['prompts'], (result) => {
    const prompts = result.prompts || [];
    prompts.push(newPrompt);

    chrome.storage.sync.set({ prompts: prompts }, () => {
      reset_form(); // Use our new reset function
      render_prompt_list(prompts);
      show_status("Prompt added!");
    });
  });
}

/**
 * NEW: Updates an existing prompt in storage
 */
function update_existing_prompt(id) {
  const name = document.getElementById('promptName').value;
  const template = document.getElementById('promptTemplate').value;

  // Re-run placeholder validation
  const placeholderRegex = /\{[^\}]+\}/g;
  const placeholders = template.match(placeholderRegex);
  if (!placeholders) {
    show_status("Error: Template needs at least one placeholder, like {TEXT}.", true);
    return;
  }

  chrome.storage.sync.get(['prompts'], (result) => {
    let prompts = result.prompts || [];

    // Find the prompt and update it
    const promptIndex = prompts.findIndex(p => p.id === id);
    if (promptIndex === -1) {
      show_status("Error: Could not find prompt to update.", true);
      return;
    }

    prompts[promptIndex].name = name;
    prompts[promptIndex].template = template;
    prompts[promptIndex].placeholders = placeholders;

    // Save the *entire* modified array
    chrome.storage.sync.set({ prompts: prompts }, () => {
      reset_form(); // Reset the form
      render_prompt_list(prompts);
      show_status("Prompt updated!");
    });
  });
}

function delete_prompt(id) {
  chrome.storage.sync.get(['prompts'], (result) => {
    let prompts = result.prompts || [];
    prompts = prompts.filter(p => p.id !== id);
    
    chrome.storage.sync.set({ prompts: prompts }, () => {
      render_prompt_list(prompts);
      show_status("Prompt deleted.");
    });
  });
}

function show_status(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.style.color = isError ? '#dc3545' : 'green';
  setTimeout(() => {
    status.textContent = '';
  }, 3000);
}

/**
 * Puts a prompt's data into the form for editing
 */
function populate_form_for_edit(prompt) {
  document.getElementById('promptName').value = prompt.name;
  document.getElementById('promptTemplate').value = prompt.template;

  currentlyEditingId = prompt.id; // Set our "state"

  // Change button text and show "Cancel"
  document.getElementById('addPrompt').textContent = 'Update Prompt';
  document.getElementById('cancelEdit').style.display = 'inline-block';
}

/**
 * Resets the form back to "Add" mode
 */
function reset_form() {
  document.getElementById('promptName').value = '';
  document.getElementById('promptTemplate').value = '';

  currentlyEditingId = null; // Clear "state"

  // Reset buttons
  document.getElementById('addPrompt').textContent = 'Add Prompt';
  document.getElementById('cancelEdit').style.display = 'none';
}
