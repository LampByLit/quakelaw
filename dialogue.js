// NPC Dialogue System
// Handles dialogue modal, conversation display, and API communication

let dialogueModalOpen = false;
let currentDialogueNPC = null;
let conversationHistory = [];
let isLoadingResponse = false;
let isRecording = false;
let recordingStartIndex = -1;

// Initialize dialogue modal
function InitDialogueModal() {
    const modal = document.getElementById('dialogueModal');
    const closeBtn = document.getElementById('closeModal');
    const recordBtn = document.getElementById('recordButton');
    const sendBtn = document.getElementById('sendMessage');
    const input = document.getElementById('playerMessageInput');
    
    // Close modal handlers
    closeBtn.addEventListener('click', CloseDialogueModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            CloseDialogueModal();
        }
    });
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dialogueModalOpen) {
            CloseDialogueModal();
        }
    });
    
    // Record button handler
    recordBtn.addEventListener('click', ToggleRecording);
    
    // Send message handlers
    sendBtn.addEventListener('click', SendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            SendMessage();
        }
    });
}

// Open dialogue modal with NPC
async function OpenDialogueModal(npc) {
    if (!npc || dialogueModalOpen) return;
    
    // Debug: Verify NPC has job
    console.log(`Opening dialogue with ${npc.surname}: job=${npc.job}, characteristic=${npc.characteristic}`);
    
    // Check if this is the judge on Friday - trigger Friday Judgment
    if (npc.isJudge && typeof gameTime !== 'undefined' && gameTime.dayOfWeek === 5)
    {
        // Check if there's a Friday Judgment event today
        if (typeof GetEventsForDate !== 'undefined')
        {
            let currentYear = typeof GetCurrentYear !== 'undefined' ? GetCurrentYear(gameTime) : (gameTime.daysElapsed >= 0 ? 1 : 0);
            let events = GetEventsForDate(currentYear, gameTime.month, gameTime.dayOfMonth);
            let judgmentEvent = events.find(e => e.taskId === 'fridayJudgement' && e.status === 'pending');
            
            if (judgmentEvent && typeof GetActiveCase !== 'undefined' && typeof ProcessFridayJudgment !== 'undefined')
            {
                const activeCase = GetActiveCase();
                if (activeCase) {
                    // Show judgment statement modal
                    ShowJudgmentStatementModal(activeCase, judgmentEvent, npc);
                    return; // Don't open normal dialogue modal
                } else {
                    console.warn('Friday Judgment event found but no active case');
                }
            }
        }
    }
    
    // Check if this is the judge on Monday - trigger case initialization
    if (npc.isJudge && typeof gameTime !== 'undefined' && gameTime.dayOfWeek === 1)
    {
        // Check if there's a Case of the Mondays event today
        if (typeof GetEventsForDate !== 'undefined')
        {
            let currentYear = typeof GetCurrentYear !== 'undefined' ? GetCurrentYear(gameTime) : (gameTime.daysElapsed >= 0 ? 1 : 0);
            let events = GetEventsForDate(currentYear, gameTime.month, gameTime.dayOfMonth);
            // Check for pending events first, but also allow completing missed events if player is attending
            let caseEvent = events.find(e => e.taskId === 'caseOfTheMondays' && (e.status === 'pending' || e.status === 'missed'));
            
            if (caseEvent && typeof InitializeNewCase !== 'undefined')
            {
                // Prevent double-triggering if already initializing
                if (caseEvent.isInitializing)
                {
                    return; // Already processing, don't start again
                }
                
                // Mark as initializing to prevent duplicate triggers
                caseEvent.isInitializing = true;
                caseEvent.initializationAttempts = (caseEvent.initializationAttempts || 0) + 1;
                
                // Show loading notification
                if (typeof ShowLoadingNotification !== 'undefined')
                {
                    ShowLoadingNotification('Initializing new case');
                }
                
                // Initialize new case (this will generate judge persona, select case, etc.)
                InitializeNewCase()
                    .then((result) => {
                        // Hide loading notification
                        if (typeof HideLoadingNotification !== 'undefined')
                        {
                            HideLoadingNotification();
                        }
                        
                        // Only complete event if initialization was successful
                        if (result)
                        {
                            // Update judge persona after case initialization
                            if (typeof GetJudgePersona !== 'undefined')
                            {
                                const persona = GetJudgePersona();
                                if (persona && persona.name)
                                {
                                    npc.UpdatePersona(persona);
                                }
                            }
                            
                            // Mark event as completed and remove it immediately
                            // Do this BEFORE any other operations to prevent race conditions
                            // Set status to completed first, then remove - this ensures ProcessMissedEvents won't mark it as missed
                            caseEvent.status = 'completed';
                            
                            // Remove the event immediately to prevent it from being displayed as missed
                            if (typeof RemoveEvent !== 'undefined')
                            {
                                let removed = RemoveEvent(caseEvent.id);
                                if (!removed)
                                {
                                    // Event might have already been removed, or there's an issue
                                    console.warn('Failed to remove Case of the Mondays event, it may have already been removed');
                                }
                            }
                            
                            // Show success notification
                            if (typeof ShowSuccessNotification !== 'undefined')
                            {
                                ShowSuccessNotification('Case initialized successfully');
                            }
                            
                            // Schedule next Monday's event
                            if (typeof TriggerTask !== 'undefined')
                            {
                                TriggerTask('caseOfTheMondays');
                            }
                        }
                        else
                        {
                            // Initialization returned null/undefined - keep pending for retry
                            caseEvent.isInitializing = false;
                            console.warn('Case initialization returned no result, keeping event pending for retry');
                            
                            if (typeof ShowSuccessNotification !== 'undefined')
                            {
                                ShowSuccessNotification('Case initialization incomplete');
                            }
                        }
                    })
                    .catch((err) => {
                        // Hide loading notification
                        if (typeof HideLoadingNotification !== 'undefined')
                        {
                            HideLoadingNotification();
                        }
                        
                        // Error occurred - keep event pending for retry
                        caseEvent.isInitializing = false;
                        caseEvent.lastError = err.message || 'Unknown error';
                        console.error('Error initializing case:', err);
                        
                        // Allow retry up to 3 times
                        if (caseEvent.initializationAttempts < 3)
                        {
                            console.warn(`Case initialization failed (attempt ${caseEvent.initializationAttempts}), will retry on next interaction`);
                        }
                        else
                        {
                            console.error('Case initialization failed after multiple attempts');
                            // Could optionally mark as 'failed' status instead of 'pending'
                        }
                    });
            }
        }
    }
    
    // Check and complete calendar events when player talks to NPC
    if (typeof CheckAndCompleteCalendarEvents !== 'undefined' && typeof gameTime !== 'undefined')
    {
        CheckAndCompleteCalendarEvents(npc, gameTime);
    }
    
    // Reset recording state
    isRecording = false;
    recordingStartIndex = -1;
    const recordBtn = document.getElementById('recordButton');
    if (recordBtn) {
        recordBtn.textContent = 'Record';
        recordBtn.classList.remove('recording');
    }
    
    currentDialogueNPC = npc;
    dialogueModalOpen = true;
    
    // Update modal header
    document.getElementById('npcName').textContent = npc.surname;
    document.getElementById('npcEmoji').textContent = npc.emoji ? GetEmojiCharacter(npc.emoji) : '⚖️'; // Default to scales emoji for judge if no emoji
    
    // Show modal
    const modal = document.getElementById('dialogueModal');
    modal.classList.add('open');
    
    // Focus input
    document.getElementById('playerMessageInput').focus();
    
    // Load conversation history
    await LoadConversationHistory(npc);
    
    // If first interaction, generate greeting
    if (conversationHistory.length === 0) {
        await GenerateGreeting(npc);
    }
}

// Close dialogue modal
function CloseDialogueModal() {
    if (!dialogueModalOpen) return;
    
    // Stop recording if active
    if (isRecording) {
        StopRecording();
    }
    
    dialogueModalOpen = false;
    currentDialogueNPC = null;
    conversationHistory = [];
    isRecording = false;
    recordingStartIndex = -1;
    
    const modal = document.getElementById('dialogueModal');
    modal.classList.remove('open');
    
    // Clear input
    document.getElementById('playerMessageInput').value = '';
    
    // Clear conversation display
    document.getElementById('conversationHistory').innerHTML = '';
    
    // Reset record button
    const recordBtn = document.getElementById('recordButton');
    recordBtn.textContent = 'Record';
    recordBtn.classList.remove('recording');
}

// Load conversation history from server
async function LoadConversationHistory(npc) {
    try {
        const sessionId = getSessionId();
        const response = await fetch(`/api/npc/conversation/${encodeURIComponent(npc.surname)}?sessionId=${encodeURIComponent(sessionId)}`);
        
        if (!response.ok) {
            console.error('Failed to load conversation:', response.statusText);
            conversationHistory = [];
            UpdateConversationDisplay();
            return;
        }
        
        const data = await response.json();
        conversationHistory = data.conversation || [];
        UpdateConversationDisplay();
        
    } catch (error) {
        console.error('Error loading conversation:', error);
        conversationHistory = [];
        UpdateConversationDisplay();
    }
}

// Generate greeting for first-time interaction
async function GenerateGreeting(npc) {
    if (isLoadingResponse) return;
    
    isLoadingResponse = true;
    const sendBtn = document.getElementById('sendMessage');
    const input = document.getElementById('playerMessageInput');
    sendBtn.disabled = true;
    input.disabled = true;
    
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-indicator';
    loadingDiv.textContent = `${npc.surname} is thinking...`;
    document.getElementById('conversationHistory').appendChild(loadingDiv);
    ScrollToBottom();
    
    try {
        const sessionId = getSessionId();
        const response = await fetch(`/api/npc/greeting/${encodeURIComponent(npc.surname)}?sessionId=${encodeURIComponent(sessionId)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                npcData: {
                    surname: npc.surname,
                    characteristic: npc.characteristic,
                    emoji: npc.emoji,
                    job: npc.job || '' // Ensure job is always a string
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to generate greeting: ${response.statusText}`);
        }
        
        const data = await response.json();
        conversationHistory = data.conversation || [];
        
        // Remove loading indicator
        const loading = document.querySelector('.loading-indicator');
        if (loading) loading.remove();
        
        UpdateConversationDisplay();
        
    } catch (error) {
        console.error('Error generating greeting:', error);
        const loading = document.querySelector('.loading-indicator');
        if (loading) loading.remove();
        
        // Add error message
        conversationHistory.push({
            role: 'npc',
            message: `Hello! I'm ${npc.surname}.`,
            timestamp: Date.now()
        });
        UpdateConversationDisplay();
    } finally {
        isLoadingResponse = false;
        sendBtn.disabled = false;
        input.disabled = false;
        input.focus();
    }
}

// Send message to NPC
async function SendMessage() {
    if (!currentDialogueNPC || isLoadingResponse) return;
    
    const input = document.getElementById('playerMessageInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Check for dev command: npc.knownfacts
    if (message.toLowerCase() === 'npc.knownfacts') {
        // Fetch and display NPC's known facts
        try {
            const sessionId = getSessionId();
            const response = await fetch(`/api/npc/gossip/facts/${encodeURIComponent(currentDialogueNPC.surname)}?sessionId=${encodeURIComponent(sessionId)}`);
            
            if (!response.ok) {
                throw new Error('Failed to load facts');
            }
            
            const data = await response.json();
            const facts = data.knownFacts || [];
            
            // Add player message
            conversationHistory.push({
                role: 'player',
                message: message,
                timestamp: Date.now()
            });
            
            // Format facts for display
            let factsText = `${currentDialogueNPC.surname}'s Known Facts (${facts.length} total):\n\n`;
            
            if (facts.length === 0) {
                factsText += 'No known facts yet.';
            } else {
                facts.forEach((fact, idx) => {
                    const date = new Date(fact.timestamp);
                    const dateStr = date.toLocaleString();
                    const learnedFrom = fact.learnedFrom === 'player' ? 'player' : `${fact.learnedFrom} via gossip`;
                    factsText += `${idx + 1}. [${dateStr}] "${fact.content}" (learned from: ${learnedFrom})\n`;
                });
            }
            
            // Add NPC response with facts
            conversationHistory.push({
                role: 'npc',
                message: factsText,
                timestamp: Date.now()
            });
            
            UpdateConversationDisplay();
            input.value = '';
            return;
        } catch (error) {
            console.error('Error loading NPC facts:', error);
            conversationHistory.push({
                role: 'npc',
                message: 'Error loading known facts.',
                timestamp: Date.now()
            });
            UpdateConversationDisplay();
            input.value = '';
            return;
        }
    }
    
    // Add player message to history immediately
    const playerMessage = {
        role: 'player',
        message: message,
        timestamp: Date.now()
    };
    conversationHistory.push(playerMessage);
    UpdateConversationDisplay();
    
    // Clear input
    input.value = '';
    
    // Disable input while waiting for response
    isLoadingResponse = true;
    const sendBtn = document.getElementById('sendMessage');
    sendBtn.disabled = true;
    input.disabled = true;
    
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-indicator';
    loadingDiv.textContent = `${currentDialogueNPC.surname} is thinking...`;
    document.getElementById('conversationHistory').appendChild(loadingDiv);
    ScrollToBottom();
    
    try {
        const sessionId = getSessionId();
        if (!sessionId) {
            throw new Error('Failed to get session ID');
        }
        // Get active case if talking to judge
        let activeCase = null;
        if (currentDialogueNPC.isJudge && typeof GetActiveCase !== 'undefined') {
            activeCase = GetActiveCase();
        }
        
        const response = await fetch(`/api/npc/conversation/${encodeURIComponent(currentDialogueNPC.surname)}?sessionId=${encodeURIComponent(sessionId)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                npcData: {
                    surname: currentDialogueNPC.surname,
                    characteristic: currentDialogueNPC.characteristic,
                    emoji: currentDialogueNPC.emoji,
                    job: currentDialogueNPC.job || '', // Ensure job is always a string
                    isJudge: currentDialogueNPC.isJudge || false
                },
                activeCase: activeCase
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to send message: ${response.statusText}`);
        }
        
        const data = await response.json();
        conversationHistory = data.conversation || [];
        
        // Remove loading indicator
        const loading = document.querySelector('.loading-indicator');
        if (loading) loading.remove();
        
        UpdateConversationDisplay();
        
    } catch (error) {
        console.error('Error sending message:', error);
        const loading = document.querySelector('.loading-indicator');
        if (loading) loading.remove();
        
        // Add error message with more detail
        let errorMessage = "I'm having trouble responding right now. Please try again.";
        if (error.message && error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_RESET')) {
            errorMessage = "Cannot connect to server. Please make sure the server is running on port 3000.";
        }
        conversationHistory.push({
            role: 'npc',
            message: errorMessage,
            timestamp: Date.now()
        });
        UpdateConversationDisplay();
    } finally {
        isLoadingResponse = false;
        sendBtn.disabled = false;
        input.disabled = false;
        input.focus();
    }
}

// Update conversation display
function UpdateConversationDisplay() {
    const container = document.getElementById('conversationHistory');
    container.innerHTML = '';
    
    for (const msg of conversationHistory) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role}`;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'message-label';
        labelDiv.textContent = msg.role === 'player' ? 'You' : currentDialogueNPC ? currentDialogueNPC.surname : 'NPC';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = msg.message;
        
        messageDiv.appendChild(labelDiv);
        messageDiv.appendChild(textDiv);
        container.appendChild(messageDiv);
    }
    
    ScrollToBottom();
}

// Scroll conversation to bottom
function ScrollToBottom() {
    const container = document.getElementById('conversationHistory');
    container.scrollTop = container.scrollHeight;
}

// Get emoji character from emoji code (e.g., "1F620" -> actual emoji)
function GetEmojiCharacter(emojiCode) {
    // If it's already an emoji character, return it
    if (emojiCode.length === 1 || emojiCode.length === 2) {
        return emojiCode;
    }
    
    // Try to convert emoji code to character
    // Format: "1F620" -> convert hex to unicode
    try {
        const codePoint = parseInt(emojiCode, 16);
        return String.fromCodePoint(codePoint);
    } catch (e) {
        // Fallback: return a default emoji
        return '😊';
    }
}

// Toggle recording state
function ToggleRecording() {
    if (!dialogueModalOpen || !currentDialogueNPC) return;
    
    if (isRecording) {
        StopRecording();
    } else {
        StartRecording();
    }
}

// Start recording conversation
function StartRecording() {
    isRecording = true;
    recordingStartIndex = conversationHistory.length;
    
    const recordBtn = document.getElementById('recordButton');
    recordBtn.textContent = 'Stop';
    recordBtn.classList.add('recording');
}

// Stop recording and create evidence
function StopRecording() {
    if (!isRecording || !currentDialogueNPC) return;
    
    // Set isRecording to false immediately to prevent infinite recursion
    isRecording = false;
    
    // Get recorded messages
    const recordedMessages = conversationHistory.slice(recordingStartIndex);
    
    if (recordedMessages.length === 0) {
        // No messages recorded, just stop
        recordingStartIndex = -1;
        const recordBtn = document.getElementById('recordButton');
        recordBtn.textContent = 'Record';
        recordBtn.classList.remove('recording');
        return;
    }
    
    // Store NPC reference before closing modal
    const npcSurname = currentDialogueNPC.surname;
    
    // Close dialogue modal first so naming modal can be shown
    // Note: CloseDialogueModal checks isRecording, but we've already set it to false
    CloseDialogueModal();
    
    // Open naming modal with callback
    const defaultName = `${npcSurname} Conversation`;
    if (typeof OpenEvidenceNamingModal === 'function') {
        OpenEvidenceNamingModal(defaultName, (evidenceName) => {
            if (!evidenceName || evidenceName.trim() === '') {
                // User cancelled or entered empty name
                recordingStartIndex = -1;
                return;
            }
            
            // Format conversation text
            const conversationText = FormatConversationText(recordedMessages, npcSurname);
            
            // Create evidence item
            // Sprite index 45: tileX = 45 % 8 = 5, tileY = Math.floor(45 / 8) = 5
            const evidenceItem = {
                type: `evidence_${Date.now()}`, // Unique type to prevent stacking
                name: evidenceName.trim(),
                tileX: 5,
                tileY: 5,
                quantity: 1,
                metadata: {
                    conversationText: conversationText,
                    npcName: npcSurname,
                    recordedTimestamp: Date.now(),
                    messages: recordedMessages
                }
            };
            
            // Add to inventory (need to access playerData from game.js)
            if (typeof playerData !== 'undefined' && playerData.inventory) {
                // Add evidence directly to inventory array since it's non-stackable
                if (playerData.inventory.length < 16) {
                    playerData.inventory.push(evidenceItem);
                    
                    // Save game state
                    if (typeof SaveGameState === 'function') {
                        SaveGameState();
                    }
                    
                    // Open inventory
                    setTimeout(() => {
                        // Set inventoryOpen directly (it's a global in game.js)
                        if (typeof inventoryOpen !== 'undefined') {
                            inventoryOpen = true;
                        }
                    }, 100);
                } else {
                    // Inventory full - show error (could add in-game error message later)
                    console.warn('Inventory is full! Cannot add evidence.');
                }
            } else {
                console.error('Cannot access playerData or inventory');
            }
            
            // Reset recording state
            recordingStartIndex = -1;
        });
    } else {
        // Fallback if modal function not available
        console.error('OpenEvidenceNamingModal function not available');
        isRecording = false;
        recordingStartIndex = -1;
    }
}

// Format conversation messages into readable text
function FormatConversationText(messages, npcName) {
    let text = `Conversation with ${npcName}\n`;
    text += `Recorded: ${new Date().toLocaleString()}\n\n`;
    text += '---\n\n';
    
    for (const msg of messages) {
        const speaker = msg.role === 'player' ? 'You' : npcName;
        const timestamp = new Date(msg.timestamp).toLocaleTimeString();
        text += `[${timestamp}] ${speaker}:\n${msg.message}\n\n`;
    }
    
    return text;
}

// Check if dialogue modal is open
function IsDialogueModalOpen() {
    return dialogueModalOpen;
}

///////////////////////////////////////////////////////////////////////////////
// Friday Judgment Modal

let judgmentModalOpen = false;
let currentJudgmentEvent = null;
let currentJudgmentNPC = null;

// Show judgment statement modal
function ShowJudgmentStatementModal(activeCase, event, npc) {
    if (judgmentModalOpen) return;
    
    judgmentModalOpen = true;
    currentJudgmentEvent = event;
    currentJudgmentNPC = npc;
    
    // Set case summary
    const summaryElement = document.getElementById('judgmentCaseSummary');
    if (summaryElement && activeCase.caseSummary) {
        summaryElement.textContent = activeCase.caseSummary;
    }
    
    // Clear statement
    const statementElement = document.getElementById('judgmentStatement');
    if (statementElement) {
        statementElement.value = '';
        UpdateJudgmentWordCount();
    }
    
    // Show modal
    const modal = document.getElementById('judgmentModal');
    if (modal) {
        modal.classList.add('open');
        statementElement.focus();
    }
    
    // Initialize event handlers
    InitJudgmentModal();
}

// Initialize judgment modal handlers
function InitJudgmentModal() {
    const closeBtn = document.getElementById('closeJudgmentModal');
    const cancelBtn = document.getElementById('cancelJudgment');
    const submitBtn = document.getElementById('submitJudgment');
    const statementInput = document.getElementById('judgmentStatement');
    
    if (closeBtn) {
        closeBtn.onclick = CloseJudgmentModal;
    }
    if (cancelBtn) {
        cancelBtn.onclick = CloseJudgmentModal;
    }
    if (submitBtn) {
        submitBtn.onclick = SubmitJudgmentStatement;
    }
    if (statementInput) {
        statementInput.oninput = UpdateJudgmentWordCount;
        statementInput.onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                SubmitJudgmentStatement();
            }
        };
    }
    
    // ESC key to close
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape' && judgmentModalOpen) {
            CloseJudgmentModal();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

// Update word count
function UpdateJudgmentWordCount() {
    const statementInput = document.getElementById('judgmentStatement');
    const wordCountElement = document.getElementById('judgmentWordCount');
    const submitBtn = document.getElementById('submitJudgment');
    
    if (!statementInput || !wordCountElement) return;
    
    const text = statementInput.value.trim();
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const maxWords = 100;
    
    wordCountElement.textContent = `${wordCount}/${maxWords} words`;
    
    // Update styling
    wordCountElement.classList.remove('warning', 'error');
    if (wordCount > maxWords) {
        wordCountElement.classList.add('error');
        if (submitBtn) submitBtn.disabled = true;
    } else if (wordCount > maxWords * 0.9) {
        wordCountElement.classList.add('warning');
        if (submitBtn) submitBtn.disabled = false;
    } else {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// Close judgment modal
function CloseJudgmentModal() {
    if (!judgmentModalOpen) return;
    
    judgmentModalOpen = false;
    currentJudgmentEvent = null;
    currentJudgmentNPC = null;
    
    const modal = document.getElementById('judgmentModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

// Submit judgment statement
async function SubmitJudgmentStatement() {
    if (!judgmentModalOpen || !currentJudgmentEvent) return;
    
    const statementInput = document.getElementById('judgmentStatement');
    const submitBtn = document.getElementById('submitJudgment');
    
    if (!statementInput) return;
    
    const statement = statementInput.value.trim();
    const words = statement.split(/\s+/).filter(w => w.length > 0);
    
    // Validate word count
    if (words.length > 100) {
        alert('Statement is too long! Maximum 100 words.');
        return;
    }
    
    // Store references before closing modal
    const judgmentEvent = currentJudgmentEvent;
    const judgmentNPC = currentJudgmentNPC;
    
    // Disable input
    if (statementInput) statementInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    
    // Close judgment modal
    CloseJudgmentModal();
    
    // Process judgment
    if (typeof ProcessFridayJudgment !== 'undefined') {
        try {
            const result = await ProcessFridayJudgment(statement, false);
            
            if (result) {
                // Show results in dialogue modal
                await ShowJudgmentResults(result, judgmentNPC);
                
                // Complete event
                if (judgmentEvent) {
                    judgmentEvent.status = 'completed';
                    if (typeof RemoveEvent !== 'undefined') {
                        RemoveEvent(judgmentEvent.id);
                    }
                }
                
                // Clear active case
                if (typeof ClearActiveCase !== 'undefined') {
                    ClearActiveCase();
                }
                
                // Show success notification
                if (typeof ShowSuccessNotification !== 'undefined') {
                    ShowSuccessNotification(result.playerWins ? 'Case won! +$20' : 'Case lost');
                }
            } else {
                alert('Error processing judgment. Please try again.');
            }
        } catch (error) {
            console.error('Error processing judgment:', error);
            alert('Error processing judgment. Please try again.');
        }
    }
}

// Show judgment results in dialogue modal
async function ShowJudgmentResults(result, npc) {
    if (!npc) return;
    
    // Open dialogue modal
    await OpenDialogueModal(npc);
    
    // Add ruling to conversation
    if (typeof conversationHistory !== 'undefined') {
        conversationHistory.push({
            role: 'npc',
            message: result.ruling,
            timestamp: Date.now()
        });
        
        // Add results summary
        let summary = '\n\n--- JUDGMENT RESULTS ---\n';
        summary += result.playerWins ? 'VERDICT: You WON the case!\n' : 'VERDICT: You LOST the case.\n';
        
        if (result.coinsAwarded > 0) {
            summary += `REWARD: $${result.coinsAwarded} coins\n`;
        }
        
        if (result.punishments && result.punishments.length > 0) {
            summary += '\nPUNISHMENTS:\n';
            for (const p of result.punishments) {
                if (p.punishmentType === 'corporeal') {
                    summary += `- ${p.witnessSurname}: Corporeal punishment\n`;
                } else if (p.punishmentType === 'banishment') {
                    summary += `- ${p.witnessSurname}: Permanently banished\n`;
                }
            }
        } else {
            summary += '\nNo witnesses were punished.\n';
        }
        
        conversationHistory.push({
            role: 'system',
            message: summary,
            timestamp: Date.now()
        });
        
        // Update display
        if (typeof UpdateConversationDisplay !== 'undefined') {
            UpdateConversationDisplay();
        }
    }
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', InitDialogueModal);
} else {
    InitDialogueModal();
}

