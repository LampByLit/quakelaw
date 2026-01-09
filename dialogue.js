// NPC Dialogue System
// Handles dialogue modal, conversation display, and API communication

let dialogueModalOpen = false;
let currentDialogueNPC = null;
let conversationHistory = [];
let isLoadingResponse = false;
let isRecording = false;
let recordingStartIndex = -1;

// Store completed case context for judge discussion after ruling
let completedCaseContext = null;

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
        // Prevent re-triggering if judgment is already processing
        if (judgmentProcessing) {
            console.log('[JUDGMENT] Judgment already processing, ignoring judge interaction');
            return;
        }
        
        // Check if there's a Friday Judgment event today
        if (typeof GetEventsForDate !== 'undefined')
        {
            let currentYear = typeof GetCurrentYear !== 'undefined' ? GetCurrentYear(gameTime) : (gameTime.daysElapsed >= 0 ? 1 : 0);
            let events = GetEventsForDate(currentYear, gameTime.month, gameTime.dayOfMonth);
            let judgmentEvent = events.find(e => e.taskId === 'fridayJudgement' && e.status === 'pending');
            
            console.log(`[JUDGMENT] Checking for Friday Judgment event. Found: ${judgmentEvent ? 'YES' : 'NO'}, Status: ${judgmentEvent ? judgmentEvent.status : 'N/A'}, Processing: ${judgmentProcessing}`);
            
            if (judgmentEvent && typeof GetActiveCase !== 'undefined' && typeof ProcessFridayJudgment !== 'undefined')
            {
                const activeCase = GetActiveCase();
                if (activeCase) {
                    console.log('[JUDGMENT] Opening judgment statement modal');
                    // Show judgment statement modal
                    ShowJudgmentStatementModal(activeCase, judgmentEvent, npc);
                    return; // Don't open normal dialogue modal
                } else {
                    console.warn('[JUDGMENT] Friday Judgment event found but no active case');
                }
            }
        }
    }
    
    // Check if this is the judge on Monday - trigger case initialization
    if (npc.isJudge && typeof gameTime !== 'undefined' && gameTime.dayOfWeek === 1)
    {
        // Prevent duplicate case initialization
        if (caseInitializing) {
            console.log('[CASE] Case initialization already in progress, ignoring judge interaction');
            return;
        }
        
        // Check if there's a Case of the Mondays event today
        if (typeof GetEventsForDate !== 'undefined')
        {
            let currentYear = typeof GetCurrentYear !== 'undefined' ? GetCurrentYear(gameTime) : (gameTime.daysElapsed >= 0 ? 1 : 0);
            let events = GetEventsForDate(currentYear, gameTime.month, gameTime.dayOfMonth);
            let caseEvent = events.find(e => e.taskId === 'caseOfTheMondays' && e.status === 'pending');
            
            console.log(`[CASE] Checking for Case of the Mondays event. Found: ${caseEvent ? 'YES' : 'NO'}, Status: ${caseEvent ? caseEvent.status : 'N/A'}, Initializing: ${caseInitializing}`);
            
            // CRITICAL: Mark event as completed and remove it IMMEDIATELY when dialogue opens with judge on Monday
            // This happens regardless of whether a case is already initialized
            let caseEventId = null;
            let shouldInitializeCase = false;
            if (caseEvent)
            {
                // Store event ID before removal
                caseEventId = caseEvent.id;
                
                // Mark event as completed immediately - speaking to judge on Monday completes the event, that's final
                caseEvent.status = 'completed';
                
                // Remove event from calendar
                let removed = false;
                if (typeof RemoveEvent !== 'undefined')
                {
                    removed = RemoveEvent(caseEvent.id);
                    console.log(`[DIALOGUE] Removed Case of the Mondays event (ID: ${caseEvent.id}): ${removed ? 'SUCCESS' : 'FAILED'}`);
                }
                else
                {
                    console.error('[DIALOGUE] RemoveEvent function is not defined!');
                }
                
                // Verify event was actually removed
                if (typeof GetEventsForDate !== 'undefined')
                {
                    let verifyEvents = GetEventsForDate(currentYear, gameTime.month, gameTime.dayOfMonth);
                    let stillExists = verifyEvents.some(e => e.id === caseEventId);
                    if (stillExists)
                    {
                        console.error(`[DIALOGUE] WARNING: Event ${caseEventId} still exists after removal attempt!`);
                    }
                    else
                    {
                        console.log(`[DIALOGUE] Verified: Event ${caseEventId} successfully removed from calendar.`);
                    }
                }
                
                // Show success notification for event completion
                if (typeof ShowSuccessNotification !== 'undefined')
                {
                    ShowSuccessNotification('Event attended: A Case of the Mondays');
                }
                
                // Update task data to mark that we completed today's event
                // This prevents ScheduleCaseOfTheMondays from re-creating the event for today
                if (typeof calendarTasks !== 'undefined' && calendarTasks['caseOfTheMondays'])
                {
                    calendarTasks['caseOfTheMondays'].data.lastScheduledDate = {
                        year: currentYear,
                        month: gameTime.month,
                        day: gameTime.dayOfMonth
                    };
                    console.log(`[DIALOGUE] Updated task data to mark event completed for today (${currentYear}/${gameTime.month}/${gameTime.dayOfMonth})`);
                }
                
                // Determine if we should initialize a case (only if event existed and was pending)
                shouldInitializeCase = true;
            }
            
            // Also check if a case is already initialized to prevent duplicate initialization
            let activeCase = null;
            if (typeof GetActiveCase !== 'undefined')
            {
                activeCase = GetActiveCase();
            }
            
            // Only initialize a new case if one doesn't already exist and we found a pending event
            if (shouldInitializeCase && typeof InitializeNewCase !== 'undefined' && !activeCase)
            {
                // Double-check activeCase right before initialization (race condition protection)
                let doubleCheckActiveCase = null;
                if (typeof GetActiveCase !== 'undefined')
                {
                    doubleCheckActiveCase = GetActiveCase();
                }
                
                if (doubleCheckActiveCase) {
                    console.log('[CASE] Active case already exists on double-check, skipping initialization');
                    return;
                }
                
                // Set global flag to prevent duplicate initialization
                caseInitializing = true;
                console.log('[CASE] Set caseInitializing = true');
                
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
                        
                        // Update judge persona after case initialization
                        if (result && typeof GetJudgePersona !== 'undefined')
                        {
                            const persona = GetJudgePersona();
                            if (persona && persona.name)
                            {
                                npc.UpdatePersona(persona);
                            }
                        }
                        
                        if (result)
                        {
                            console.log(`[CASE] Case initialized successfully. Case file: ${result.caseFileName}, Case number: ${result.caseNumber}`);
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
                            console.warn('[CASE] Case initialization returned no result, but event was already marked as completed');
                            
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
                        
                        console.error('[CASE] Error during case initialization:', err);
                        
                        if (typeof ShowSuccessNotification !== 'undefined')
                        {
                            ShowSuccessNotification('Error initializing case');
                        }
                    })
                    .finally(() => {
                        // Always clear the initialization flag
                        caseInitializing = false;
                        console.log('[CASE] Set caseInitializing = false');
                        
                        // Also clear the lock flag in case of error
                        if (typeof caseInitializationLock !== 'undefined') {
                            caseInitializationLock = false;
                            console.log('[CASE] Cleared case initialization lock');
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
    // But check if judge is uninitialized first
    if (conversationHistory.length === 0) {
        if (npc.isJudge && (!npc.characteristic || npc.characteristic === null)) {
            // Judge is uninitialized - show busy message instead of greeting
            conversationHistory.push({
                role: 'npc',
                message: "I'm too busy to speak right now. I'll be ready momentarily.",
                timestamp: Date.now()
            });
            UpdateConversationDisplay();
        } else {
            await GenerateGreeting(npc);
        }
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
            // Handle different error status codes
            if (response.status === 502) {
                console.error(`[ERROR] Server error (502) loading conversation for ${npc.surname}. Server may be down or crashed.`);
            } else if (response.status === 500) {
                console.error(`[ERROR] Server error (500) loading conversation for ${npc.surname}`);
            } else {
                console.error(`[ERROR] Failed to load conversation for ${npc.surname}: ${response.status} ${response.statusText}`);
            }
            // Return empty conversation history on error
            conversationHistory = [];
            UpdateConversationDisplay();
            return;
        }
        
        const data = await response.json();
        conversationHistory = data.conversation || [];
        UpdateConversationDisplay();
        
    } catch (error) {
        // Network errors, JSON parse errors, etc.
        console.error(`[ERROR] Error loading conversation for ${npc.surname}:`, error);
        if (error.message && error.message.includes('502')) {
            console.error('[ERROR] Server returned 502 Bad Gateway - server may have crashed. Please restart the server.');
        }
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
                    job: npc.job || '', // Ensure job is always a string
                    isJudge: npc.isJudge || false
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
        
        // Add error message - check if judge is uninitialized
        let errorMessage = `Hello! I'm ${npc.surname}.`;
        if (npc.isJudge && (!npc.characteristic || npc.characteristic === null)) {
            errorMessage = "I'm too busy to speak right now. I'll be ready momentarily.";
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
    
    // Check if judge is uninitialized (characteristic is null)
    if (currentDialogueNPC.isJudge && (!currentDialogueNPC.characteristic || currentDialogueNPC.characteristic === null)) {
        // Judge is uninitialized - show busy message
        conversationHistory.push({
            role: 'npc',
            message: "I'm too busy to speak right now. I'll be ready momentarily.",
            timestamp: Date.now()
        });
        UpdateConversationDisplay();
        ScrollToBottom();
        return;
    }
    
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
        // Get active case (for judge and for NPCs involved in cases)
        let activeCase = null;
        if (typeof GetActiveCase !== 'undefined') {
            activeCase = GetActiveCase();
        }
        
        // Get completed case context if talking to judge and no active case
        let completedCase = null;
        if (currentDialogueNPC.isJudge && !activeCase && completedCaseContext) {
            completedCase = completedCaseContext;
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
                activeCase: activeCase,
                completedCase: completedCase
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
        
        // Check if judge agreed to hear a claim (look for claim agreement indicators in response)
        // Only allow claims after a trial has been completed (when completedCaseContext exists)
        if (currentDialogueNPC.isJudge && !isLoadingResponse && completedCaseContext) {
            const lastMessage = conversationHistory[conversationHistory.length - 1];
            if (lastMessage && lastMessage.role === 'npc') {
                const responseText = lastMessage.message.toLowerCase();
                // Check if judge agreed to hear claim (look for keywords like "hear", "will hear", "accept", "$20", etc.)
                const claimAgreementPatterns = [
                    /will hear.*claim/i,
                    /i.*hear.*claim/i,
                    /accept.*claim/i,
                    /\$20.*claim/i,
                    /claim.*\$20/i,
                    /fee.*\$20/i,
                    /\$20.*fee/i
                ];
                
                const hasAgreementPattern = claimAgreementPatterns.some(pattern => pattern.test(responseText));
                
                // Also check if response mentions $20 and seems positive about hearing
                const mentionsFee = /\$20/.test(responseText);
                const seemsPositive = /(will|can|shall|agree|accept|yes|okay|ok)/i.test(responseText);
                
                if (hasAgreementPattern || (mentionsFee && seemsPositive)) {
                    // Check if player has $20
                    const playerCoins = typeof playerData !== 'undefined' && playerData ? (playerData.coins || 0) : 0;
                    if (playerCoins >= 20) {
                        // Deduct $20 immediately
                        playerData.coins = playerCoins - 20;
                        if (typeof SaveGameState === 'function') {
                            SaveGameState();
                        }
                        console.log('[CLAIM] Judge agreed to hear claim. Deducted $20. New balance: $' + playerData.coins);
                        
                        // Show claim input modal after a short delay
                        setTimeout(() => {
                            ShowClaimInputModal();
                        }, 500);
                    } else {
                        console.log('[CLAIM] Judge agreed but player cannot afford $20 fee');
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        const loading = document.querySelector('.loading-indicator');
        if (loading) loading.remove();
        
        // Add error message with more detail
        let errorMessage = "I'm having trouble responding right now. Please try again.";
        // Check if judge is uninitialized (characteristic is null)
        if (currentDialogueNPC.isJudge && (!currentDialogueNPC.characteristic || currentDialogueNPC.characteristic === null)) {
            errorMessage = "I'm too busy to speak right now. I'll be ready momentarily.";
        } else if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('ERR_CONNECTION_RESET'))) {
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

// Check if judgment modal is open
function IsJudgmentModalOpen() {
    return judgmentModalOpen;
}

///////////////////////////////////////////////////////////////////////////////
// Friday Judgment Modal

let judgmentModalOpen = false;
let currentJudgmentEvent = null;
let currentJudgmentNPC = null;
let judgmentProcessing = false; // Flag to prevent re-triggering while processing
let caseInitializing = false; // Flag to prevent duplicate case initialization
let caseInitializationLock = false; // Flag to lock player in courthouse during case initialization
let judgmentModalEscHandler = null; // Store ESC key handler to prevent duplicates

// Get bonuses from inventory for display
function GetBonusesForDisplay() {
    if (!playerData || !playerData.inventory) {
        return {
            credibility: 0,
            countersuit: 0,
            exculpation: 0
        };
    }
    
    const bonuses = {
        credibility: 0,
        countersuit: 0,
        exculpation: 0
    };
    
    for (const item of playerData.inventory) {
        if (item.type === 'credibility') {
            bonuses.credibility += item.quantity || 1;
        } else if (item.type === 'countersuit') {
            bonuses.countersuit += item.quantity || 1;
        } else if (item.type === 'exculpation') {
            bonuses.exculpation += item.quantity || 1;
        }
    }
    
    return bonuses;
}

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
    
    // Set bonuses display
    const bonusesElement = document.getElementById('judgmentBonuses');
    if (bonusesElement) {
        const bonuses = GetBonusesForDisplay();
        const bonusParts = [];
        
        if (bonuses.credibility > 0) {
            bonusParts.push(`Credibility: ${bonuses.credibility}`);
        }
        if (bonuses.countersuit > 0) {
            bonusParts.push(`Countersuit: ${bonuses.countersuit}`);
        }
        if (bonuses.exculpation > 0) {
            bonusParts.push(`Exculpation: ${bonuses.exculpation}`);
        }
        
        if (bonusParts.length > 0) {
            bonusesElement.textContent = bonusParts.join(' | ');
        } else {
            bonusesElement.textContent = 'No bonuses available';
        }
    }
    
    // Clear statement and CRITICAL: Enable input and submit button
    const statementElement = document.getElementById('judgmentStatement');
    const submitBtn = document.getElementById('submitJudgment');
    if (statementElement) {
        statementElement.value = '';
        statementElement.disabled = false; // CRITICAL FIX: Enable input field
        UpdateJudgmentWordCount();
    }
    if (submitBtn) {
        submitBtn.disabled = false; // CRITICAL FIX: Enable submit button
    }
    
    // Show modal
    const modal = document.getElementById('judgmentModal');
    if (modal) {
        modal.classList.add('open');
        
        // Focus the textarea after modal is rendered
        // Use requestAnimationFrame + setTimeout to ensure modal is fully visible and focusable
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (statementElement) {
                    statementElement.focus();
                    // Ensure focus worked - try again if needed
                    if (document.activeElement !== statementElement) {
                        setTimeout(() => {
                            statementElement.focus();
                        }, 50);
                    }
                }
            }, 50);
        });
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
    
    // ESC key to close - prevent duplicate listeners
    if (judgmentModalEscHandler) {
        document.removeEventListener('keydown', judgmentModalEscHandler);
    }
    judgmentModalEscHandler = function escHandler(e) {
        if (e.key === 'Escape' && judgmentModalOpen) {
            CloseJudgmentModal();
            document.removeEventListener('keydown', escHandler);
            judgmentModalEscHandler = null;
        }
    };
    document.addEventListener('keydown', judgmentModalEscHandler);
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
    
    // CRITICAL FIX: Re-enable input and submit button when closing modal
    const statementInput = document.getElementById('judgmentStatement');
    const submitBtn = document.getElementById('submitJudgment');
    if (statementInput) {
        statementInput.disabled = false;
    }
    if (submitBtn) {
        submitBtn.disabled = false;
    }
    
    const modal = document.getElementById('judgmentModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

// Submit judgment statement
async function SubmitJudgmentStatement() {
    if (!judgmentModalOpen || !currentJudgmentEvent) {
        console.log('[JUDGMENT] SubmitJudgmentStatement called but modal not open or no event');
        return;
    }
    
    // Prevent double submission
    if (judgmentProcessing) {
        console.log('[JUDGMENT] Already processing, ignoring submit');
        return;
    }
    
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
    
    console.log(`[JUDGMENT] Submitting statement (${words.length} words). Player location: ${typeof currentInterior !== 'undefined' && currentInterior ? 'INTERIOR' : 'EXTERIOR'}`);
    
    // Store references before closing modal
    const judgmentEvent = currentJudgmentEvent;
    const judgmentNPC = currentJudgmentNPC;
    
    // CRITICAL FIX: Mark event as completed IMMEDIATELY to prevent re-triggering
    if (judgmentEvent) {
        console.log(`[JUDGMENT] Marking event ${judgmentEvent.id} as completed immediately`);
        judgmentEvent.status = 'completed';
        if (typeof RemoveEvent !== 'undefined') {
            RemoveEvent(judgmentEvent.id);
            console.log(`[JUDGMENT] Event ${judgmentEvent.id} removed from calendar`);
        }
    }
    
    // Set processing flag
    judgmentProcessing = true;
    console.log('[JUDGMENT] Set judgmentProcessing = true');
    
    // Disable input
    if (statementInput) statementInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    
    // Close judgment modal
    CloseJudgmentModal();
    
    // Process judgment
    if (typeof ProcessFridayJudgment !== 'undefined') {
        try {
            console.log('[JUDGMENT] Starting ProcessFridayJudgment');
            const result = await ProcessFridayJudgment(statement, false);
            
            if (result) {
                console.log(`[JUDGMENT] Judgment complete. Player wins: ${result.playerWins}, Coins: ${result.coinsAwarded}, Punishments: ${result.punishments ? result.punishments.length : 0}`);
                
                // Show results in ruling modal (case will be cleared after player clicks OK)
                await ShowJudgmentResults(result, judgmentNPC);
                
                // Note: Case is now cleared in CloseJudgmentRulingModal after evidence is created
                
                // Show success notification
                if (typeof ShowSuccessNotification !== 'undefined') {
                    let notificationText = result.playerWins ? 'Case won!' : 'Case lost';
                    if (result.coinsAwarded > 0) {
                        notificationText += ` +$${result.coinsAwarded}`;
                    }
                    if (result.playerReprimanded) {
                        notificationText += ' | Reprimanded: -$20';
                    }
                    if (result.playerDisbarred) {
                        notificationText = 'DISBARRED - Game Over';
                    }
                    ShowSuccessNotification(notificationText);
                }
            } else {
                console.error('[JUDGMENT] ProcessFridayJudgment returned null');
                alert('Error processing judgment. Please try again.');
                // Clear flag on error
                judgmentProcessing = false;
            }
        } catch (error) {
            console.error('[JUDGMENT] Error processing judgment:', error);
            alert('Error processing judgment. Please try again.');
            // Clear flag on error
            judgmentProcessing = false;
        }
        // Note: judgmentProcessing flag is now cleared in CloseJudgmentRulingModal
        // after player clicks OK, not here
    } else {
        judgmentProcessing = false;
        console.log('[JUDGMENT] ProcessFridayJudgment function not available');
    }
}

// Find judge NPC (even if player is outside courthouse)
function FindJudgeNPC() {
    // First try: if player is in interior and judge exists there
    if (typeof currentInterior !== 'undefined' && currentInterior && currentInterior.judge) {
        console.log('[JUDGMENT] Found judge in current interior');
        return currentInterior.judge;
    }
    
    // Second try: find courthouse building and get judge from its interior
    if (typeof gameObjects !== 'undefined') {
        for (let obj of gameObjects) {
            if (obj.isBuilding && obj.buildingType === 'court' && obj.interior && obj.interior.judge) {
                console.log('[JUDGMENT] Found judge in courthouse building interior');
                return obj.interior.judge;
            }
        }
    }
    
    console.warn('[JUDGMENT] Could not find judge NPC');
    return null;
}

// Create evidence item from judgment results
function CreateJudgmentEvidenceItem(result) {
    // Get active case info for case number
    let caseNumber = 'Unknown';
    let caseSummary = '';
    if (typeof GetActiveCase !== 'undefined') {
        const activeCase = GetActiveCase();
        if (activeCase && activeCase.caseNumber) {
            caseNumber = activeCase.caseNumber;
        }
        if (activeCase && activeCase.caseSummary) {
            caseSummary = activeCase.caseSummary;
        }
    }
    
    // Format judgment text
    let judgmentText = 'COURT RULING\n';
    judgmentText += '============\n\n';
    judgmentText += result.ruling + '\n\n';
    judgmentText += '--- VERDICT ---\n';
    judgmentText += result.playerWins ? 'VERDICT: You WON the case!\n' : 'VERDICT: You LOST the case.\n';
    
    // Show coin award
    if (result.coinsAwarded > 0) {
        judgmentText += `\n--- COIN AWARD ---\n`;
        judgmentText += `The judge awarded you $${result.coinsAwarded} coins for your work as lawyer.\n`;
    }
    
    // Show reprimand
    if (result.playerReprimanded) {
        judgmentText += '\n--- JUDGE REPRIMAND ---\n';
        judgmentText += 'You have been officially reprimanded by the judge.\n';
        judgmentText += 'FINE: -$20 coins\n';
    }
    
    // Show disbarment
    if (result.playerDisbarred) {
        judgmentText += '\n--- DISBARMENT ---\n';
        judgmentText += 'You have been DISBARRED by the judge.\n';
        judgmentText += 'GAME OVER\n';
    }
    
    judgmentText += '\n--- PUNISHMENTS ---\n';
    if (result.punishments && result.punishments.length > 0) {
        for (const p of result.punishments) {
            const npcSurname = p.npcSurname || p.witnessSurname || 'Unknown';
            const reason = p.reason ? ` (${p.reason})` : '';
            if (p.punishmentType === 'corporeal') {
                judgmentText += `- ${npcSurname}: Corporeal punishment${reason}\n`;
            } else if (p.punishmentType === 'banishment') {
                judgmentText += `- ${npcSurname}: Permanently banished${reason}\n`;
            } else if (p.punishmentType === 'death') {
                judgmentText += `- ${npcSurname}: Sentenced to death${reason}\n`;
            }
        }
    } else {
        judgmentText += 'No NPCs were punished.\n';
    }
    
    if (result.jobChanges && result.jobChanges.length > 0) {
        judgmentText += '\n--- JOB CHANGES ---\n';
        for (const change of result.jobChanges) {
            const reason = change.reason ? ` (${change.reason})` : '';
            judgmentText += `- ${change.npcSurname}: Changed to "${change.newJob}"${reason}\n`;
        }
    }
    
    if (result.prosecution) {
        judgmentText += '\n--- PROSECUTION ---\n';
        judgmentText += result.prosecution + '\n';
    }
    
    // Create evidence item name (format: "0001 - Ruling")
    const evidenceName = `${String(caseNumber).padStart(4, '0')} - Ruling`;
    
    // Create evidence item (similar to conversation evidence)
    const evidenceItem = {
        type: `judgment_${Date.now()}`, // Unique type to prevent stacking
        name: evidenceName,
        tileX: 5,
        tileY: 5,
        quantity: 1,
        metadata: {
            judgmentText: judgmentText,
            ruling: result.ruling,
            playerWins: result.playerWins,
            coinsAwarded: result.coinsAwarded || 0,
            punishments: result.punishments || [],
            jobChanges: result.jobChanges || [],
            playerReprimanded: result.playerReprimanded || false,
            playerDisbarred: result.playerDisbarred || false,
            caseNumber: caseNumber,
            prosecution: result.prosecution || '',
            timestamp: Date.now()
        }
    };
    
    return evidenceItem;
}

// Store current judgment result for OK button
let currentJudgmentResult = null;

// Show judgment ruling in dedicated modal
function ShowJudgmentRulingModal(result) {
    console.log('[JUDGMENT] ShowJudgmentRulingModal called');
    
    // Store result for OK button handler
    currentJudgmentResult = result;
    
    const modal = document.getElementById('judgmentRulingModal');
    const rulingTextEl = document.getElementById('judgmentRulingText');
    const verdictEl = document.getElementById('judgmentVerdict');
    const punishmentsEl = document.getElementById('judgmentPunishments');
    const okButton = document.getElementById('okJudgmentRuling');
    
    // Set ruling text
    rulingTextEl.textContent = result.ruling || 'The judge has made a decision.';
    
    // Set verdict with reprimand/disbarment info
    let verdictText = result.playerWins ? 'VERDICT: You WON the case!' : 'VERDICT: You LOST the case.';
    if (result.coinsAwarded > 0) {
        verdictText += `\n\n💰 COIN AWARD: +$${result.coinsAwarded}`;
    }
    if (result.playerReprimanded) {
        verdictText += '\n\n⚠️ OFFICIAL REPRIMAND: -$20 coins';
    }
    if (result.playerDisbarred) {
        verdictText += '\n\n🚫 DISBARRED: Game Over';
        verdictEl.className = 'verdict-section disbarred';
    } else {
        verdictEl.className = 'verdict-section ' + (result.playerWins ? 'win' : 'lose');
    }
    verdictEl.textContent = verdictText;
    
    // Set punishments and job changes
    let punishmentsText = '';
    if (result.punishments && result.punishments.length > 0) {
        punishmentsText += 'PUNISHMENTS:\n';
        for (const p of result.punishments) {
            const npcSurname = p.npcSurname || p.witnessSurname || 'Unknown';
            const reason = p.reason ? ` (${p.reason})` : '';
            if (p.punishmentType === 'corporeal') {
                punishmentsText += `- ${npcSurname}: Corporeal punishment${reason}\n`;
            } else if (p.punishmentType === 'banishment') {
                punishmentsText += `- ${npcSurname}: Permanently banished${reason}\n`;
            } else if (p.punishmentType === 'death') {
                punishmentsText += `- ${npcSurname}: Sentenced to death${reason}\n`;
            }
        }
    }
    
    if (result.jobChanges && result.jobChanges.length > 0) {
        if (punishmentsText) punishmentsText += '\n';
        punishmentsText += 'JOB CHANGES:\n';
        for (const change of result.jobChanges) {
            const reason = change.reason ? ` (${change.reason})` : '';
            punishmentsText += `- ${change.npcSurname}: Changed to "${change.newJob}"${reason}\n`;
        }
    }
    
    punishmentsEl.textContent = punishmentsText;
    
    // Show modal
    modal.classList.add('open');
    
    // Wire up OK button (only once, on first call)
    if (!okButton.hasAttribute('data-wired')) {
        okButton.setAttribute('data-wired', 'true');
        okButton.addEventListener('click', () => {
            if (currentJudgmentResult) {
                CloseJudgmentRulingModal(currentJudgmentResult);
            }
        });
    }
    
    console.log('[JUDGMENT] Judgment ruling modal displayed');
}

// Close judgment ruling modal and create evidence item
function CloseJudgmentRulingModal(result) {
    console.log('[JUDGMENT] Closing judgment ruling modal');
    
    const modal = document.getElementById('judgmentRulingModal');
    modal.classList.remove('open');
    
    // Create evidence item (before clearing case, so we have case info)
    const evidenceItem = CreateJudgmentEvidenceItem(result);
    
    // Add to inventory
    if (typeof playerData !== 'undefined' && playerData.inventory) {
        if (playerData.inventory.length < 16) {
            playerData.inventory.push(evidenceItem);
            console.log('[JUDGMENT] Evidence item created and added to inventory:', evidenceItem.name);
            
            // Save game state
            if (typeof SaveGameState === 'function') {
                SaveGameState();
            }
        } else {
            console.warn('[JUDGMENT] Inventory is full! Cannot add judgment evidence.');
            alert('Inventory is full! Judgment evidence could not be added.');
        }
    } else {
        console.error('[JUDGMENT] Cannot access playerData or inventory');
    }
    
    // Store completed case context for judge discussion (before clearing case)
    if (typeof GetActiveCase !== 'undefined') {
        const activeCase = GetActiveCase();
        if (activeCase && result) {
            completedCaseContext = {
                caseSummary: activeCase.caseSummary || '',
                prosecution: result.prosecution || '',
                ruling: result.ruling || '',
                playerWins: result.playerWins || false,
                playerReprimanded: result.playerReprimanded || false,
                playerDisbarred: result.playerDisbarred || false,
                punishments: result.punishments || [],
                jobChanges: result.jobChanges || []
            };
            console.log('[JUDGMENT] Stored completed case context for judge discussion');
        }
    }
    
    // Clear active case AFTER evidence is created and context is stored
    if (typeof ClearActiveCase !== 'undefined') {
        ClearActiveCase();
        console.log('[JUDGMENT] Active case cleared');
    }
    
    // Handle disbarment (game over)
    if (result.playerDisbarred) {
        console.log('[JUDGMENT] Player disbarred - triggering game over');
        // Trigger game over after a short delay to let player see the message
        setTimeout(() => {
            if (typeof player !== 'undefined' && player) {
                player.Kill();
            }
            // Also show game over message
            if (typeof ShowErrorNotification !== 'undefined') {
                ShowErrorNotification('You have been DISBARRED. Game Over.');
            }
        }, 1000);
    }
    
    // Clear judgment processing flag AFTER player acknowledges the ruling
    // This allows player to exit courtroom once they've seen the results
    if (typeof judgmentProcessing !== 'undefined') {
        judgmentProcessing = false;
        console.log('[JUDGMENT] Set judgmentProcessing = false - player can now exit courtroom');
    }
    
    // Clear stored result
    currentJudgmentResult = null;
}

// Show judgment results (now redirects to ruling modal)
async function ShowJudgmentResults(result, npc) {
    console.log(`[JUDGMENT] ShowJudgmentResults called. NPC provided: ${npc ? 'YES' : 'NO'}, Player location: ${typeof currentInterior !== 'undefined' && currentInterior ? 'INTERIOR' : 'EXTERIOR'}`);
    
    // Show ruling in dedicated modal
    ShowJudgmentRulingModal(result);
    
    console.log('[JUDGMENT] Judgment results displayed. Player should remain in courtroom.');
}

// Initialize judgment ruling modal (prevent ESC and outside clicks)
function InitJudgmentRulingModal() {
    const modal = document.getElementById('judgmentRulingModal');
    
    // Prevent closing by clicking outside modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            // Don't close - player must click OK button
            e.stopPropagation();
        }
    });
    
    // Prevent closing by ESC key
    // Note: We don't add ESC handler here because we want to prevent it entirely
    // The modal can only be closed via OK button
}

///////////////////////////////////////////////////////////////////////////////
// Rent Payment Modal

let rentModalOpen = false;

// Check if rent modal is open
function IsRentModalOpen() {
    return rentModalOpen;
}

// Show rent payment modal
function ShowRentModal() {
    if (rentModalOpen || typeof playerData === 'undefined') {
        return;
    }
    
    rentModalOpen = true;
    
    const modal = document.getElementById('rentModal');
    const messageEl = document.getElementById('rentMessage');
    const balanceEl = document.getElementById('rentBalance');
    const okButton = document.getElementById('okRentModal');
    
    const rentAmount = 50;
    const currentCoins = playerData.coins || 0;
    const canAfford = currentCoins >= rentAmount;
    
    // Set message based on whether player can afford rent
    if (canAfford) {
        messageEl.textContent = `RENT DUE: $${rentAmount}\n\nYou have enough money to pay rent.`;
        messageEl.style.color = '#fff';
    } else {
        messageEl.textContent = `RENT DUE: $${rentAmount}\n\nYou cannot afford rent!\n\nGAME OVER`;
        messageEl.style.color = '#ff4444';
    }
    
    // Show current balance
    balanceEl.textContent = `Current Balance: $${currentCoins}`;
    
    // Show modal
    modal.classList.add('open');
    
    // Wire up OK button (only once, on first call)
    if (!okButton.hasAttribute('data-wired')) {
        okButton.setAttribute('data-wired', 'true');
        okButton.addEventListener('click', () => {
            HandleRentPayment();
        });
    }
    
    console.log(`[RENT] Rent modal shown. Can afford: ${canAfford}, Balance: $${currentCoins}`);
}

// Handle rent payment
function HandleRentPayment() {
    if (!rentModalOpen || typeof playerData === 'undefined') {
        return;
    }
    
    const rentAmount = 50;
    const currentCoins = playerData.coins || 0;
    const canAfford = currentCoins >= rentAmount;
    
    if (canAfford) {
        // Deduct rent
        playerData.coins = Math.max(0, currentCoins - rentAmount);
        playerData.rentPaidThisMonth = true;
        
        // Save game state
        if (typeof SaveGameState === 'function') {
            SaveGameState();
        }
        
        console.log(`[RENT] Rent paid. Deducted $${rentAmount}. New balance: $${playerData.coins}`);
        
        // Close modal
        CloseRentModal();
    } else {
        // Cannot afford rent - trigger game over
        console.log('[RENT] Cannot afford rent - triggering game over');
        
        // Close modal first
        CloseRentModal();
        
        // Trigger game over after a short delay
        setTimeout(() => {
            if (typeof player !== 'undefined' && player) {
                player.Kill();
            }
            // Show game over message
            if (typeof ShowErrorNotification !== 'undefined') {
                ShowErrorNotification('You cannot afford rent. Game Over.');
            }
        }, 500);
    }
}

// Close rent modal
function CloseRentModal() {
    if (!rentModalOpen) {
        return;
    }
    
    rentModalOpen = false;
    
    const modal = document.getElementById('rentModal');
    if (modal) {
        modal.classList.remove('open');
    }
    
    console.log('[RENT] Rent modal closed');
}

// Initialize rent modal
function InitRentModal() {
    const modal = document.getElementById('rentModal');
    
    // Prevent closing by clicking outside modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            // Don't close - player must click OK button
            e.stopPropagation();
        }
    });
    
    // Prevent closing by ESC key
    // The modal can only be closed via OK button
}

///////////////////////////////////////////////////////////////////////////////
// Claim Modal Functions

let claimModalOpen = false;
let claimProcessing = false;

// Show claim input modal
function ShowClaimInputModal() {
    if (claimModalOpen) return;
    
    claimModalOpen = true;
    
    // Clear inputs
    const descriptionInput = document.getElementById('claimDescription');
    const outcomeInput = document.getElementById('claimDesiredOutcome');
    if (descriptionInput) {
        descriptionInput.value = '';
        descriptionInput.disabled = false;
    }
    if (outcomeInput) {
        outcomeInput.value = '';
        outcomeInput.disabled = false;
    }
    
    // Update word counts
    UpdateClaimWordCount();
    
    // Enable submit button
    const submitBtn = document.getElementById('submitClaim');
    if (submitBtn) {
        submitBtn.disabled = false;
    }
    
    // Show modal
    const modal = document.getElementById('claimModal');
    if (modal) {
        modal.classList.add('open');
        
        // Focus the description textarea after modal is rendered
        requestAnimationFrame(() => {
            setTimeout(() => {
                if (descriptionInput) {
                    descriptionInput.focus();
                }
            }, 50);
        });
    }
    
    // Initialize event handlers
    InitClaimModal();
}

// Initialize claim modal handlers
function InitClaimModal() {
    const closeBtn = document.getElementById('closeClaimModal');
    const cancelBtn = document.getElementById('cancelClaim');
    const submitBtn = document.getElementById('submitClaim');
    const descriptionInput = document.getElementById('claimDescription');
    const outcomeInput = document.getElementById('claimDesiredOutcome');
    
    if (closeBtn) {
        closeBtn.onclick = CloseClaimModal;
    }
    if (cancelBtn) {
        cancelBtn.onclick = CloseClaimModal;
    }
    if (submitBtn) {
        submitBtn.onclick = SubmitClaim;
    }
    if (descriptionInput) {
        descriptionInput.oninput = UpdateClaimWordCount;
        descriptionInput.onkeydown = (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                SubmitClaim();
            }
        };
    }
    if (outcomeInput) {
        outcomeInput.oninput = UpdateClaimWordCount;
    }
    
    // ESC key to close
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape' && claimModalOpen) {
            CloseClaimModal();
            document.removeEventListener('keydown', escHandler);
        }
    });
}

// Update word count for claim inputs
function UpdateClaimWordCount() {
    const descriptionInput = document.getElementById('claimDescription');
    const outcomeInput = document.getElementById('claimDesiredOutcome');
    const descriptionCountEl = document.getElementById('claimDescriptionWordCount');
    const outcomeCountEl = document.getElementById('claimOutcomeWordCount');
    const submitBtn = document.getElementById('submitClaim');
    
    if (!descriptionInput || !descriptionCountEl) return;
    
    const descriptionText = descriptionInput.value.trim();
    const descriptionWords = descriptionText.split(/\s+/).filter(w => w.length > 0);
    const descriptionWordCount = descriptionWords.length;
    const maxWords = 100;
    
    descriptionCountEl.textContent = `${descriptionWordCount}/${maxWords} words`;
    descriptionCountEl.classList.remove('warning', 'error');
    if (descriptionWordCount > maxWords) {
        descriptionCountEl.classList.add('error');
        if (submitBtn) submitBtn.disabled = true;
    } else if (descriptionWordCount > maxWords * 0.9) {
        descriptionCountEl.classList.add('warning');
        if (submitBtn) submitBtn.disabled = false;
    } else {
        if (submitBtn) submitBtn.disabled = false;
    }
    
    if (outcomeInput && outcomeCountEl) {
        const outcomeText = outcomeInput.value.trim();
        const outcomeWords = outcomeText.split(/\s+/).filter(w => w.length > 0);
        const outcomeWordCount = outcomeWords.length;
        
        outcomeCountEl.textContent = `${outcomeWordCount}/${maxWords} words`;
        outcomeCountEl.classList.remove('warning', 'error');
        if (outcomeWordCount > maxWords) {
            outcomeCountEl.classList.add('error');
            if (submitBtn) submitBtn.disabled = true;
        } else if (outcomeWordCount > maxWords * 0.9) {
            outcomeCountEl.classList.add('warning');
            if (submitBtn && !descriptionCountEl.classList.contains('error')) {
                submitBtn.disabled = false;
            }
        }
    }
}

// Close claim modal
function CloseClaimModal() {
    if (!claimModalOpen) return;
    
    claimModalOpen = false;
    
    const modal = document.getElementById('claimModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

// Submit claim
async function SubmitClaim() {
    if (!claimModalOpen || claimProcessing) {
        return;
    }
    
    const descriptionInput = document.getElementById('claimDescription');
    const outcomeInput = document.getElementById('claimDesiredOutcome');
    const submitBtn = document.getElementById('submitClaim');
    
    if (!descriptionInput) return;
    
    const claimDescription = descriptionInput.value.trim();
    const desiredOutcome = outcomeInput ? outcomeInput.value.trim() : '';
    
    // Validate word count
    const descriptionWords = claimDescription.split(/\s+/).filter(w => w.length > 0);
    const outcomeWords = desiredOutcome.split(/\s+/).filter(w => w.length > 0);
    
    if (descriptionWords.length === 0) {
        alert('Please enter a claim description.');
        return;
    }
    
    if (descriptionWords.length > 100) {
        alert('Claim description is too long! Maximum 100 words.');
        return;
    }
    
    if (outcomeWords.length > 100) {
        alert('Desired outcome is too long! Maximum 100 words.');
        return;
    }
    
    console.log(`[CLAIM] Submitting claim. Description: ${descriptionWords.length} words, Outcome: ${outcomeWords.length} words`);
    
    // Prevent double submission
    claimProcessing = true;
    
    // Disable inputs
    if (descriptionInput) descriptionInput.disabled = true;
    if (outcomeInput) outcomeInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
    
    // Close claim modal
    CloseClaimModal();
    
    // Process claim
    if (typeof ProcessClaim !== 'undefined') {
        try {
            console.log('[CLAIM] Starting ProcessClaim');
            const result = await ProcessClaim(claimDescription, desiredOutcome);
            
            if (result) {
                console.log(`[CLAIM] Claim complete. Granted: ${result.claimGranted}, Coins: ${result.coinsAwarded}, Punishments: ${result.punishments ? result.punishments.length : 0}`);
                
                // Show results in ruling modal
                await ShowClaimResults(result);
                
                // Show success notification
                if (typeof ShowSuccessNotification !== 'undefined') {
                    let notificationText = result.claimGranted ? 'Claim granted!' : 'Claim denied';
                    if (result.coinsAwarded > 0) {
                        notificationText += ` +$${result.coinsAwarded}`;
                    }
                    if (result.playerReprimanded) {
                        notificationText += ' | Reprimanded: -$20';
                    }
                    if (result.playerDisbarred) {
                        notificationText = 'DISBARRED - Game Over';
                    }
                    ShowSuccessNotification(notificationText);
                }
            } else {
                console.error('[CLAIM] ProcessClaim returned null');
                alert('Error processing claim. Please try again.');
                claimProcessing = false;
            }
        } catch (error) {
            console.error('[CLAIM] Error processing claim:', error);
            alert('Error processing claim. Please try again.');
            claimProcessing = false;
        }
    } else {
        claimProcessing = false;
        console.log('[CLAIM] ProcessClaim function not available');
    }
}

// Store current claim result for OK button
let currentClaimResult = null;

// Show claim ruling in dedicated modal
function ShowClaimRulingModal(result) {
    console.log('[CLAIM] ShowClaimRulingModal called');
    
    // Store result for OK button handler
    currentClaimResult = result;
    
    const modal = document.getElementById('claimRulingModal');
    const rulingTextEl = document.getElementById('claimRulingText');
    const verdictEl = document.getElementById('claimVerdict');
    const punishmentsEl = document.getElementById('claimPunishments');
    const okButton = document.getElementById('okClaimRuling');
    
    // Set ruling text
    rulingTextEl.textContent = result.ruling || 'The judge has made a decision.';
    
    // Set verdict with reprimand/disbarment info
    let verdictText = result.claimGranted ? 'VERDICT: Claim GRANTED' : 'VERDICT: Claim DENIED';
    if (result.coinsAwarded > 0) {
        verdictText += `\n\n💰 COIN AWARD: +$${result.coinsAwarded}`;
    }
    if (result.playerReprimanded) {
        verdictText += '\n\n⚠️ OFFICIAL REPRIMAND: -$20 coins';
    }
    if (result.playerDisbarred) {
        verdictText += '\n\n🚫 DISBARRED: Game Over';
        verdictEl.className = 'verdict-section disbarred';
    } else {
        verdictEl.className = 'verdict-section ' + (result.claimGranted ? 'win' : 'lose');
    }
    verdictEl.textContent = verdictText;
    
    // Set punishments and job changes
    let punishmentsText = '';
    if (result.punishments && result.punishments.length > 0) {
        punishmentsText += 'PUNISHMENTS:\n';
        for (const p of result.punishments) {
            const npcSurname = p.npcSurname || p.witnessSurname || 'Unknown';
            const reason = p.reason ? ` (${p.reason})` : '';
            if (p.punishmentType === 'corporeal') {
                punishmentsText += `- ${npcSurname}: Corporeal punishment${reason}\n`;
            } else if (p.punishmentType === 'banishment') {
                punishmentsText += `- ${npcSurname}: Permanently banished${reason}\n`;
            } else if (p.punishmentType === 'death') {
                punishmentsText += `- ${npcSurname}: Sentenced to death${reason}\n`;
            }
        }
    }
    
    if (result.jobChanges && result.jobChanges.length > 0) {
        if (punishmentsText) punishmentsText += '\n';
        punishmentsText += 'JOB CHANGES:\n';
        for (const change of result.jobChanges) {
            const reason = change.reason ? ` (${change.reason})` : '';
            punishmentsText += `- ${change.npcSurname}: Changed to "${change.newJob}"${reason}\n`;
        }
    }
    
    punishmentsEl.textContent = punishmentsText;
    
    // Show modal
    modal.classList.add('open');
    
    // Wire up OK button (only once, on first call)
    if (!okButton.hasAttribute('data-wired')) {
        okButton.setAttribute('data-wired', 'true');
        okButton.addEventListener('click', () => {
            if (currentClaimResult) {
                CloseClaimRulingModal(currentClaimResult);
            }
        });
    }
    
    console.log('[CLAIM] Claim ruling modal displayed');
}

// Close claim ruling modal and create evidence item
function CloseClaimRulingModal(result) {
    console.log('[CLAIM] Closing claim ruling modal');
    
    const modal = document.getElementById('claimRulingModal');
    modal.classList.remove('open');
    
    // Create evidence item
    const evidenceItem = CreateClaimEvidenceItem(result);
    
    // Add to inventory
    if (typeof playerData !== 'undefined' && playerData.inventory) {
        if (playerData.inventory.length < 16) {
            playerData.inventory.push(evidenceItem);
            console.log('[CLAIM] Evidence item created and added to inventory:', evidenceItem.name);
            
            // Save game state
            if (typeof SaveGameState === 'function') {
                SaveGameState();
            }
        } else {
            console.warn('[CLAIM] Inventory is full! Cannot add claim evidence.');
            alert('Inventory is full! Claim evidence could not be added.');
        }
    } else {
        console.error('[CLAIM] Cannot access playerData or inventory');
    }
    
    // Handle disbarment (game over)
    if (result.playerDisbarred) {
        console.log('[CLAIM] Player disbarred - triggering game over');
        setTimeout(() => {
            if (typeof player !== 'undefined' && player) {
                player.Kill();
            }
            if (typeof ShowErrorNotification !== 'undefined') {
                ShowErrorNotification('You have been DISBARRED. Game Over.');
            }
        }, 1000);
    }
    
    // Clear claim processing flag
    claimProcessing = false;
    
    // Clear stored result
    currentClaimResult = null;
}

// Show claim results (redirects to ruling modal)
async function ShowClaimResults(result) {
    console.log('[CLAIM] ShowClaimResults called');
    
    // Show ruling in dedicated modal
    ShowClaimRulingModal(result);
    
    console.log('[CLAIM] Claim results displayed.');
}

// Initialize claim ruling modal
function InitClaimRulingModal() {
    const modal = document.getElementById('claimRulingModal');
    
    // Prevent closing by clicking outside modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            // Don't close - player must click OK button
            e.stopPropagation();
        }
    });
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        InitDialogueModal();
        InitJudgmentRulingModal();
        InitRentModal();
        InitClaimRulingModal();
    });
} else {
    InitDialogueModal();
    InitJudgmentRulingModal();
    InitRentModal();
    InitClaimRulingModal();
}

