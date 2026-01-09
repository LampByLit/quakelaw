// Backend server for DeepSeek API proxy
// Keeps API keys secure on the server side

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Initialize data directory structure
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const conversationsDir = path.join(dataDir, 'conversations');

// Ensure data directories exist on startup
(async () => {
    try {
        await fs.mkdir(conversationsDir, { recursive: true });
        console.log(`Data directory initialized: ${conversationsDir}`);
    } catch (error) {
        console.error('Failed to create data directory:', error);
    }
})();

// Helper function to sanitize session ID for directory names
function sanitizeSessionId(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
        throw new Error('Session ID is required and must be a string');
    }
    // Only allow alphanumeric, hyphens, and underscores, remove any path traversal attempts
    return sessionId.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 100);
}

// Helper function to sanitize NPC surname for file names
function sanitizeSurname(surname) {
    // Only allow alphanumeric characters, remove any path traversal attempts
    return surname.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
}

// Helper function to get session directory path
function getSessionDirPath(sessionId) {
    const sanitized = sanitizeSessionId(sessionId);
    return path.join(conversationsDir, sanitized);
}

// Helper function to get conversation file path
function getConversationFilePath(sessionId, surname) {
    const sessionDir = getSessionDirPath(sessionId);
    const sanitized = sanitizeSurname(surname);
    return path.join(sessionDir, `${sanitized}.json`);
}

// Helper function to ensure session directory exists
async function ensureSessionDir(sessionId) {
    const sessionDir = getSessionDirPath(sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    return sessionDir;
}

// Helper function to load conversation
async function loadConversation(sessionId, surname) {
    try {
        const filePath = getConversationFilePath(sessionId, surname);
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return null
            return null;
        }
        throw error;
    }
}

// Helper function to save conversation
async function saveConversation(sessionId, conversationData) {
    await ensureSessionDir(sessionId);
    const filePath = getConversationFilePath(sessionId, conversationData.npcSurname);
    await fs.writeFile(filePath, JSON.stringify(conversationData, null, 2), 'utf8');
}

// ============================================================================
// Gossip Network Functions
// ============================================================================

// Spread rates based on NPC characteristics
const SPREAD_RATES = {
    'gossipy': 0.9,
    'talkative': 0.7,
    'friendly': 0.6,
    'reserved': 0.3,
    'quiet': 0.2,
    'shy': 0.15
};
const DEFAULT_SPREAD_RATE = 0.5;

// Get spread rate for an NPC based on their characteristic
function getSpreadRate(characteristic) {
    return SPREAD_RATES[characteristic] || DEFAULT_SPREAD_RATE;
}

// Generate a unique fact ID from content, source, and timestamp
function generateFactId(content, source, timestamp) {
    const hash = crypto.createHash('md5').update(`${content}|${source}|${timestamp}`).digest('hex');
    return `fact-${hash.substring(0, 12)}`;
}

// Extract sentences from text (split by sentence endings)
function extractSentences(text) {
    if (!text || typeof text !== 'string') return [];
    
    // Split by sentence endings, filter out empty/very short sentences
    return text
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 10); // Only meaningful sentences (at least 10 chars)
}

// Get gossip network file path
function getGossipNetworkFilePath(sessionId) {
    const sessionDir = getSessionDirPath(sessionId);
    return path.join(sessionDir, 'gossip-network.json');
}

// Load gossip network
async function loadGossipNetwork(sessionId) {
    try {
        const filePath = getGossipNetworkFilePath(sessionId);
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return empty network
            return { npcKnowledge: {} };
        }
        throw error;
    }
}

// Save gossip network
async function saveGossipNetwork(sessionId, networkData) {
    await ensureSessionDir(sessionId);
    const filePath = getGossipNetworkFilePath(sessionId);
    await fs.writeFile(filePath, JSON.stringify(networkData, null, 2), 'utf8');
}

// Add a fact to an NPC's knowledge (with deduplication)
async function addFactToNPC(sessionId, npcSurname, fact) {
    const network = await loadGossipNetwork(sessionId);
    
    // Initialize NPC knowledge if it doesn't exist
    if (!network.npcKnowledge[npcSurname]) {
        network.npcKnowledge[npcSurname] = { knownFacts: [] };
    }
    
    // Check for duplicates (by fact ID)
    const existingFactIds = network.npcKnowledge[npcSurname].knownFacts.map(f => f.id);
    if (!existingFactIds.includes(fact.id)) {
        network.npcKnowledge[npcSurname].knownFacts.push(fact);
        await saveGossipNetwork(sessionId, network);
        return true; // Fact added
    }
    
    return false; // Fact already exists
}

// Extract facts from a conversation message and add them to NPC knowledge
async function extractAndAddFacts(sessionId, npcSurname, message, learnedFrom) {
    const sentences = extractSentences(message);
    const timestamp = Date.now();
    let addedCount = 0;
    
    for (const sentence of sentences) {
        const fact = {
            id: generateFactId(sentence, npcSurname, timestamp),
            content: sentence,
            source: npcSurname,
            learnedFrom: learnedFrom,
            timestamp: timestamp,
            type: learnedFrom === 'player' ? 'conversation' : 'gossip'
        };
        
        if (await addFactToNPC(sessionId, npcSurname, fact)) {
            addedCount++;
        }
    }
    
    return addedCount;
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// DeepSeek API proxy endpoint
app.post('/api/deepseek', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'DEEPSEEK_API_KEY environment variable is not set' 
        });
    }

    const { message, systemPrompt, options = {} } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    const messages = [];
    
    // Add system prompt if provided
    if (systemPrompt) {
        if (Array.isArray(systemPrompt)) {
            messages.push(...systemPrompt);
        } else {
            messages.push({ role: 'system', content: systemPrompt });
        }
    }
    
    // Add user message
    messages.push({ role: 'user', content: message });
    
    const requestBody = {
        model: options.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: messages,
        temperature: options.temperature !== undefined ? options.temperature : 0.7,
        max_tokens: options.max_tokens || 2000,
        ...options
    };

    try {
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json({ 
                error: `API Error: ${response.status} ${response.statusText}`,
                details: errorData
            });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('DeepSeek API Error:', error);
        res.status(500).json({ 
            error: 'Failed to call DeepSeek API',
            message: error.message 
        });
    }
});

// NPC Conversation Endpoints

// Get conversation history for an NPC
app.get('/api/npc/conversation/:surname', async (req, res) => {
    try {
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        const surname = req.params.surname;
        const conversation = await loadConversation(sessionId, surname);
        
        if (!conversation) {
            return res.json({
                conversation: [],
                npcInfo: null
            });
        }
        
        res.json({
            conversation: conversation.conversation || [],
            npcInfo: {
                surname: conversation.npcSurname,
                characteristic: conversation.characteristic,
                emoji: conversation.emoji,
                job: conversation.job || ''
            }
        });
    } catch (error) {
        console.error('Error loading conversation:', error);
        res.status(500).json({ 
            error: 'Failed to load conversation',
            message: error.message 
        });
    }
});

// Send message to NPC and get AI response
app.post('/api/npc/conversation/:surname', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'DEEPSEEK_API_KEY environment variable is not set' 
        });
    }

    try {
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        const surname = req.params.surname;
        const { message, npcData } = req.body;
        
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message is required and must be non-empty' });
        }
        
        if (message.length > 500) {
            return res.status(400).json({ error: 'Message too long (max 500 characters)' });
        }
        
        if (!npcData || !npcData.characteristic) {
            return res.status(400).json({ error: 'NPC data with characteristic is required' });
        }
        
        // Load or create conversation
        let conversation = await loadConversation(sessionId, surname);
        const isFirstInteraction = !conversation;
        
        // Debug: Log job data received
        console.log(`[SERVER] Message from ${surname}: npcData.job="${npcData.job}", existing conversation.job="${conversation?.job || 'none'}"`);
        
        if (!conversation) {
            // Create new conversation
            conversation = {
                npcSurname: surname,
                characteristic: npcData.characteristic,
                emoji: npcData.emoji || '',
                job: npcData.job || '',
                conversation: [],
                metadata: {
                    firstInteraction: Date.now(),
                    lastInteraction: Date.now(),
                    messageCount: 0
                }
            };
            console.log(`[SERVER] Created new conversation for ${surname} with job="${conversation.job}"`);
        } else {
            // Update NPC data if provided (in case it changed)
            // Always update job if provided - this ensures old conversations get jobs assigned
            if (npcData.characteristic) conversation.characteristic = npcData.characteristic;
            if (npcData.emoji !== undefined) conversation.emoji = npcData.emoji || '';
            if (npcData.job !== undefined) {
                // Always update job if provided - even if empty string, this ensures consistency
                const oldJob = conversation.job;
                conversation.job = npcData.job || '';
                if (oldJob !== conversation.job) {
                    console.log(`[SERVER] Updated job for ${surname}: "${oldJob}" -> "${conversation.job}"`);
                    // If job changed significantly, clear conversation history to prevent contamination
                    if (oldJob && oldJob !== '' && conversation.job && conversation.job !== '' && oldJob !== conversation.job) {
                        console.log(`[SERVER] Job changed for ${surname}, clearing old conversation history to prevent contamination`);
                        conversation.conversation = []; // Clear history when job changes
                    }
                }
            } else if (!conversation.job) {
                // If conversation has no job and npcData doesn't provide one, set empty
                conversation.job = '';
                console.log(`[SERVER] Warning: ${surname} has no job in conversation and npcData.job is missing!`);
            }
        }
        
        // Add player message
        const playerMessage = {
            role: 'player',
            message: message.trim(),
            timestamp: Date.now()
        };
        conversation.conversation.push(playerMessage);
        
        // Limit conversation history to last 20 messages to manage token usage
        const MAX_HISTORY = 20;
        if (conversation.conversation.length > MAX_HISTORY) {
            conversation.conversation = conversation.conversation.slice(-MAX_HISTORY);
        }
        
        // Build system prompt with NPC identity
        const job = conversation.job || '';
        const jobContext = job ? `You work as a ${job}. ` : '';
        const isLawyer = job === 'lawyer';
        
        // Load NPC's known facts from gossip network
        const gossipNetwork = await loadGossipNetwork(sessionId);
        const npcKnowledge = gossipNetwork.npcKnowledge[surname];
        let knownFactsText = '';
        if (npcKnowledge && npcKnowledge.knownFacts && npcKnowledge.knownFacts.length > 0) {
            const factsList = npcKnowledge.knownFacts
                .slice(-10) // Last 10 facts to avoid token bloat
                .map((fact, idx) => `${idx + 1}. "${fact.content}"`)
                .join('\n');
            knownFactsText = `\n\nYou know the following information from conversations and gossip:\n${factsList}\n\nYou can naturally reference this knowledge when talking to the player.`;
        }
        
        // Debug: Log what job is being used in prompt
        console.log(`[SERVER] ===== Building prompt for ${surname} =====`);
        console.log(`[SERVER] npcData.job="${npcData.job}", conversation.job="${conversation.job}", final job="${job}"`);
        console.log(`[SERVER] isLawyer=${isLawyer}, jobContext="${jobContext}"`);
        if (!job || job === '') {
            console.error(`[SERVER] ERROR: ${surname} has NO JOB assigned!`);
        }
        
        const systemPrompt = `You are ${surname}, a ${conversation.characteristic} person living in a real town.

ABSOLUTELY CRITICAL - YOUR PROFESSION (DO NOT IGNORE THIS):
${job ? `- Your job is: ${job}. This is your ONLY profession.` : '- You have a regular job.'}
${isLawyer ? '- You ARE a lawyer and work in the legal system. You understand legal matters and may work at the courthouse or a law firm.' : `- Your job is "${job}" - focus on this job in all your conversations.
- When you introduce yourself, say "I'm ${surname}, I'm a ${job}" - talk about YOUR job.
- REQUIRED: Talk about being a ${job} - talk about your interests and theories about the town other than your job sometimes.`}

Your personality traits:
- You are ${conversation.characteristic} (e.g., ${conversation.characteristic === 'rude' ? 'you are blunt and direct' : conversation.characteristic === 'joyful' ? 'you are cheerful and optimistic' : 'you have this personality trait'})
- Respond only with dialogue. Do not include actions.
- You remember previous conversations with this player
- You respond naturally in 1-2 sentences
- You stay in character based on your characteristic
- Keep your responses brief and character-appropriate

Context:
${jobContext}You may have witnessed events in town. Talk about your normal life and your job as a ${job || 'regular person'}. You are on a schedule and do not have time to follow the player anywhere. Other characters may ask you questions as well, answer them naturally. This is the real world.${knownFactsText}

REMEMBER: Your job is ${job}. You are a ${job}.`;
        
        // Build messages array from conversation history
        const messages = [{ role: 'system', content: systemPrompt }];
        
        // Add a reminder about job before conversation history
        if (!isLawyer && job) {
            messages.push({ 
                role: 'system', 
                content: `REMINDER: Your job is ${job}. You are a ${job}. Focus on your actual job and experiences.` 
            });
        }
        
        // Add conversation history (convert to API format)
        // BUT: If there's old conversation that contradicts the job, clear it
        let hasContradictoryHistory = false;
        if (conversation.conversation.length > 0 && !isLawyer && job) {
            // Check if any previous NPC messages mention legal work incorrectly
            for (const msg of conversation.conversation) {
                if (msg.role === 'npc' && msg.message) {
                    const lowerMsg = msg.message.toLowerCase();
                    // Only flag if they claim to be a lawyer or work in law (not just mentioning it in context)
                    if (lowerMsg.includes("i'm a lawyer") || lowerMsg.includes("i am a lawyer") || 
                        lowerMsg.includes("i practice law") || lowerMsg.includes("i work in law") ||
                        lowerMsg.includes("i'm a paralegal") || lowerMsg.includes("i work at a law firm")) {
                        hasContradictoryHistory = true;
                        console.log(`[SERVER] WARNING: ${surname} has contradictory history claiming legal work. Clearing conversation.`);
                        break;
                    }
                }
            }
        }
        
        // If contradictory history found, clear it
        if (hasContradictoryHistory) {
            conversation.conversation = [];
            console.log(`[SERVER] Cleared contradictory conversation history for ${surname}`);
        }
        
        // Add conversation history (convert to API format)
        for (const msg of conversation.conversation) {
            if (msg.role === 'player') {
                messages.push({ role: 'user', content: msg.message });
            } else if (msg.role === 'npc') {
                // Add job reminder before each NPC response in history (only for non-lawyers)
                if (!isLawyer && job) {
                    messages.push({ 
                        role: 'system', 
                        content: `Note: In this previous response, you were a ${job}.` 
                    });
                }
                messages.push({ role: 'assistant', content: msg.message });
            }
        }
        
        // Add another reminder at the end (only for non-lawyers)
        if (!isLawyer && job) {
            messages.push({ 
                role: 'system', 
                content: `FINAL REMINDER: You are responding as a ${job}. Your job is ${job}. Focus on your actual profession.` 
            });
        }
        
        // Debug: Log what we're sending to AI
        console.log(`[SERVER] Sending ${messages.length} messages to AI. Job="${job}", isLawyer=${isLawyer}`);
        if (messages.length > 0 && messages[0].role === 'system') {
            const hasJob = messages[0].content.includes(job);
            console.log(`[SERVER] First system message contains job "${job}": ${hasJob ? 'YES' : 'NO'}`);
            if (!hasJob && job) {
                console.error(`[SERVER] CRITICAL: Job "${job}" NOT FOUND in system prompt!`);
            }
        }
        
        // Call DeepSeek API
        const requestBody = {
            model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
            messages: messages,
            temperature: 0.3, // LOWER temperature to make it more deterministic and follow instructions
            max_tokens: 150 // Limit to 1-2 sentences
        };
        
        const apiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!apiResponse.ok) {
            const errorData = await apiResponse.json().catch(() => ({}));
            console.error('DeepSeek API Error:', errorData);
            return res.status(apiResponse.status).json({ 
                error: `AI API Error: ${apiResponse.status} ${apiResponse.statusText}`,
                details: errorData
            });
        }
        
        const apiData = await apiResponse.json();
        const npcResponse = apiData.choices && apiData.choices[0] 
            ? apiData.choices[0].message.content 
            : "I'm not sure how to respond to that.";
        
        // Add NPC response to conversation
        const npcMessage = {
            role: 'npc',
            message: npcResponse.trim(),
            timestamp: Date.now()
        };
        conversation.conversation.push(npcMessage);
        
        // Extract facts from player message and NPC response
        await extractAndAddFacts(sessionId, surname, message, 'player');
        await extractAndAddFacts(sessionId, surname, npcResponse.trim(), surname);
        
        // Update metadata
        conversation.metadata.lastInteraction = Date.now();
        conversation.metadata.messageCount = conversation.conversation.length;
        
        // Save conversation
        await saveConversation(sessionId, conversation);
        
        // Return response
        res.json({
            response: npcResponse.trim(),
            conversation: conversation.conversation,
            npcInfo: {
                surname: conversation.npcSurname,
                characteristic: conversation.characteristic,
                emoji: conversation.emoji,
                job: conversation.job || ''
            }
        });
        
    } catch (error) {
        console.error('Error in NPC conversation:', error);
        res.status(500).json({ 
            error: 'Failed to process conversation',
            message: error.message 
        });
    }
});

// Generate greeting for first-time interaction
app.post('/api/npc/greeting/:surname', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'DEEPSEEK_API_KEY environment variable is not set' 
        });
    }

    try {
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        const surname = req.params.surname;
        const { npcData } = req.body;
        
        if (!npcData || !npcData.characteristic) {
            return res.status(400).json({ error: 'NPC data with characteristic is required' });
        }
        
        // Check if conversation already exists
        const existing = await loadConversation(sessionId, surname);
        if (existing && existing.conversation.length > 0) {
            return res.status(400).json({ error: 'Conversation already exists' });
        }
        
        // Build greeting system prompt
        const job = npcData.job || '';
        const jobContext = job ? `You work as a ${job}. ` : '';
        const isLawyer = job === 'lawyer';
        
        const systemPrompt = `You are ${surname}, a ${npcData.characteristic} person living in a real town.

ABSOLUTELY CRITICAL - YOUR PROFESSION (DO NOT IGNORE THIS):
${job ? `- Your job is: ${job}. This is your ONLY profession.` : '- You have a regular job.'}
${isLawyer ? '- You ARE a lawyer and work in the legal system. You understand legal matters and may work at the courthouse or a law firm.' : `- Your job is "${job}" - focus on this job.
- REQUIRED: When greeting, say "I'm ${surname}, I'm a ${job}" - talk about YOUR job.`}

${jobContext}Greet the player naturally in 1-2 sentences. Be ${npcData.characteristic} in your greeting. 
This is the first time you're meeting them, so introduce yourself briefly. Say your name and mention you're a ${job || 'regular person'}.

REMEMBER: Your job is ${job}. You are a ${job}.`;
        
        const requestBody = {
            model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Hello!' }
            ],
            temperature: 0.3, // LOWER temperature to make it more deterministic and follow instructions
            max_tokens: 100
        };
        
        const apiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!apiResponse.ok) {
            const errorData = await apiResponse.json().catch(() => ({}));
            return res.status(apiResponse.status).json({ 
                error: `AI API Error: ${apiResponse.status}`,
                details: errorData
            });
        }
        
        const apiData = await apiResponse.json();
        const greeting = apiData.choices && apiData.choices[0] 
            ? apiData.choices[0].message.content 
            : `Hello! I'm ${surname}.`;
        
        // Create conversation with greeting
        const conversation = {
            npcSurname: surname,
            characteristic: npcData.characteristic,
            emoji: npcData.emoji || '',
            job: npcData.job || '',
            conversation: [
                {
                    role: 'npc',
                    message: greeting.trim(),
                    timestamp: Date.now()
                }
            ],
            metadata: {
                firstInteraction: Date.now(),
                lastInteraction: Date.now(),
                messageCount: 1
            }
        };
        
        await saveConversation(sessionId, conversation);
        
        res.json({
            greeting: greeting.trim(),
            conversation: conversation.conversation,
            npcInfo: {
                surname: conversation.npcSurname,
                characteristic: conversation.characteristic,
                emoji: conversation.emoji,
                job: conversation.job || ''
            }
        });
        
    } catch (error) {
        console.error('Error generating greeting:', error);
        res.status(500).json({ 
            error: 'Failed to generate greeting',
            message: error.message 
        });
    }
});

// ============================================================================
// Gossip Network Endpoints
// ============================================================================

// Get gossip network (for dev command)
app.get('/api/npc/gossip/network', async (req, res) => {
    try {
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        const network = await loadGossipNetwork(sessionId);
        res.json(network);
    } catch (error) {
        console.error('Error loading gossip network:', error);
        res.status(500).json({ 
            error: 'Failed to load gossip network',
            message: error.message 
        });
    }
});

// Get specific NPC's known facts (for dev command)
app.get('/api/npc/gossip/facts/:surname', async (req, res) => {
    try {
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        const surname = req.params.surname;
        const network = await loadGossipNetwork(sessionId);
        const npcKnowledge = network.npcKnowledge[surname];
        
        if (!npcKnowledge || !npcKnowledge.knownFacts || npcKnowledge.knownFacts.length === 0) {
            return res.json({ 
                surname: surname,
                knownFacts: [],
                count: 0
            });
        }
        
        res.json({
            surname: surname,
            knownFacts: npcKnowledge.knownFacts,
            count: npcKnowledge.knownFacts.length
        });
    } catch (error) {
        console.error('Error loading NPC facts:', error);
        res.status(500).json({ 
            error: 'Failed to load NPC facts',
            message: error.message 
        });
    }
});

// Process daily gossip (called at 7:01 each day)
app.post('/api/npc/gossip/process', async (req, res) => {
    try {
        const sessionId = req.query.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        const { npcLocations } = req.body; // Array of {surname, currentInterior, workAddress, houseAddress, characteristic}
        
        if (!npcLocations || !Array.isArray(npcLocations)) {
            return res.status(400).json({ error: 'NPC locations array is required' });
        }
        
        const network = await loadGossipNetwork(sessionId);
        let gossipCount = 0;
        
        // Group NPCs by location
        const locationGroups = {};
        
        for (const npc of npcLocations) {
            // Group by currentInterior (same building)
            const interiorKey = `interior:${npc.currentInterior || 'exterior'}`;
            if (!locationGroups[interiorKey]) {
                locationGroups[interiorKey] = [];
            }
            locationGroups[interiorKey].push(npc);
            
            // Group by workAddress (coworkers)
            if (npc.workAddress) {
                const workKey = `work:${npc.workAddress}`;
                if (!locationGroups[workKey]) {
                    locationGroups[workKey] = [];
                }
                if (!locationGroups[workKey].find(n => n.surname === npc.surname)) {
                    locationGroups[workKey].push(npc);
                }
            }
            
            // Group by houseAddress (housemates)
            if (npc.houseAddress) {
                const houseKey = `house:${npc.houseAddress}`;
                if (!locationGroups[houseKey]) {
                    locationGroups[houseKey] = [];
                }
                if (!locationGroups[houseKey].find(n => n.surname === npc.surname)) {
                    locationGroups[houseKey].push(npc);
                }
            }
        }
        
        // Process gossip for each group
        for (const groupKey in locationGroups) {
            const group = locationGroups[groupKey];
            
            // Only process groups with 2+ NPCs
            if (group.length < 2) continue;
            
            // For each pair in the group, have them share knowledge
            for (let i = 0; i < group.length; i++) {
                for (let j = i + 1; j < group.length; j++) {
                    const npcA = group[i];
                    const npcB = group[j];
                    
                    // Get their knowledge
                    const knowledgeA = network.npcKnowledge[npcA.surname];
                    const knowledgeB = network.npcKnowledge[npcB.surname];
                    
                    // NPC A shares with NPC B
                    if (knowledgeA && knowledgeA.knownFacts) {
                        const spreadRate = getSpreadRate(npcA.characteristic);
                        for (const fact of knowledgeA.knownFacts) {
                            if (Math.random() < spreadRate) {
                                // Check if NPC B already knows this fact
                                const bFacts = knowledgeB ? knowledgeB.knownFacts : [];
                                if (!bFacts.find(f => f.id === fact.id)) {
                                    // NPC B learns the fact
                                    const newFact = {
                                        ...fact,
                                        learnedFrom: npcA.surname,
                                        type: 'gossip'
                                    };
                                    if (!network.npcKnowledge[npcB.surname]) {
                                        network.npcKnowledge[npcB.surname] = { knownFacts: [] };
                                    }
                                    network.npcKnowledge[npcB.surname].knownFacts.push(newFact);
                                    gossipCount++;
                                }
                            }
                        }
                    }
                    
                    // NPC B shares with NPC A
                    if (knowledgeB && knowledgeB.knownFacts) {
                        const spreadRate = getSpreadRate(npcB.characteristic);
                        for (const fact of knowledgeB.knownFacts) {
                            if (Math.random() < spreadRate) {
                                // Check if NPC A already knows this fact
                                const aFacts = knowledgeA ? knowledgeA.knownFacts : [];
                                if (!aFacts.find(f => f.id === fact.id)) {
                                    // NPC A learns the fact
                                    const newFact = {
                                        ...fact,
                                        learnedFrom: npcB.surname,
                                        type: 'gossip'
                                    };
                                    if (!network.npcKnowledge[npcA.surname]) {
                                        network.npcKnowledge[npcA.surname] = { knownFacts: [] };
                                    }
                                    network.npcKnowledge[npcA.surname].knownFacts.push(newFact);
                                    gossipCount++;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Save updated network
        await saveGossipNetwork(sessionId, network);
        
        res.json({
            success: true,
            message: `Processed gossip for ${npcLocations.length} NPCs`,
            gossipCount: gossipCount,
            groupsProcessed: Object.keys(locationGroups).length
        });
        
    } catch (error) {
        console.error('Error processing gossip:', error);
        res.status(500).json({ 
            error: 'Failed to process gossip',
            message: error.message 
        });
    }
});

// Delete conversations for a specific session (used for browser close and page refresh)
app.delete('/api/npc/conversations/:sessionId', async (req, res) => {
    try {
        const sessionId = req.params.sessionId;
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        const sessionDir = getSessionDirPath(sessionId);
        
        // Check if session directory exists
        try {
            const files = await fs.readdir(sessionDir);
            
            // Delete all JSON files in session directory
            let deletedCount = 0;
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        await fs.unlink(path.join(sessionDir, file));
                        deletedCount++;
                    } catch (error) {
                        console.warn(`Failed to delete conversation file ${file}:`, error);
                    }
                }
            }
            
            // Try to remove the session directory if it's empty (best effort)
            try {
                await fs.rmdir(sessionDir);
            } catch (error) {
                // Directory not empty or other error - that's fine
            }
            
            res.json({
                success: true,
                message: `Deleted ${deletedCount} conversation file(s) for session`,
                deletedCount: deletedCount
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Session directory doesn't exist, that's fine
                res.json({
                    success: true,
                    message: 'No conversations found for session',
                    deletedCount: 0
                });
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Error clearing conversations:', error);
        res.status(500).json({ 
            error: 'Failed to clear conversations',
            message: error.message 
        });
    }
});

// Delete ALL conversations - dev tool to wipe entire /data folder
app.delete('/api/npc/conversations/all', async (req, res) => {
    try {
        // Read all session directories
        const sessions = await fs.readdir(conversationsDir);
        
        let deletedSessions = 0;
        let deletedFiles = 0;
        
        for (const sessionName of sessions) {
            const sessionDir = path.join(conversationsDir, sessionName);
            try {
                const stats = await fs.stat(sessionDir);
                if (stats.isDirectory()) {
                    // Delete all files in the session directory
                    const files = await fs.readdir(sessionDir);
                    for (const file of files) {
                        if (file.endsWith('.json')) {
                            try {
                                await fs.unlink(path.join(sessionDir, file));
                                deletedFiles++;
                            } catch (error) {
                                console.warn(`Failed to delete file ${file} in session ${sessionName}:`, error);
                            }
                        }
                    }
                    
                    // Remove the session directory
                    try {
                        await fs.rmdir(sessionDir);
                        deletedSessions++;
                    } catch (error) {
                        console.warn(`Failed to remove session directory ${sessionName}:`, error);
                    }
                }
            } catch (error) {
                console.warn(`Error processing session ${sessionName}:`, error);
            }
        }
        
        res.json({
            success: true,
            message: `Deleted entire /data folder: ${deletedSessions} session(s), ${deletedFiles} file(s)`,
            deletedCount: deletedSessions,
            deletedFiles: deletedFiles
        });
    } catch (error) {
        console.error('Error clearing all conversations:', error);
        res.status(500).json({ 
            error: 'Failed to clear all conversations',
            message: error.message 
        });
    }
});

// Automatic cleanup of old sessions (older than 24 hours)
async function cleanupOldSessions() {
    try {
        const files = await fs.readdir(conversationsDir);
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        let cleanedCount = 0;
        
        for (const file of files) {
            const sessionDir = path.join(conversationsDir, file);
            try {
                const stats = await fs.stat(sessionDir);
                if (stats.isDirectory()) {
                    // Check if directory is older than 24 hours
                    const age = now - stats.mtime.getTime();
                    if (age > maxAge) {
                        // Delete all files in the directory
                        const sessionFiles = await fs.readdir(sessionDir);
                        for (const sessionFile of sessionFiles) {
                            try {
                                await fs.unlink(path.join(sessionDir, sessionFile));
                            } catch (error) {
                                console.warn(`Failed to delete file ${sessionFile} in session ${file}:`, error);
                            }
                        }
                        // Remove the directory
                        try {
                            await fs.rmdir(sessionDir);
                            cleanedCount++;
                            console.log(`Cleaned up old session: ${file}`);
                        } catch (error) {
                            console.warn(`Failed to remove session directory ${file}:`, error);
                        }
                    }
                }
            } catch (error) {
                // Skip files that can't be accessed
                console.warn(`Error checking session ${file}:`, error);
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`Automatic cleanup: Removed ${cleanedCount} old session(s)`);
        }
    } catch (error) {
        console.error('Error during automatic cleanup:', error);
    }
}

// Run cleanup every hour
setInterval(cleanupOldSessions, 60 * 60 * 1000);

// Run cleanup on startup
cleanupOldSessions();

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    if (!process.env.DEEPSEEK_API_KEY) {
        console.warn('⚠️  WARNING: DEEPSEEK_API_KEY environment variable is not set!');
    }
    console.log(`Using model: ${process.env.DEEPSEEK_MODEL || 'deepseek-chat'}`);
});

// Graceful shutdown handling
function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    
    server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

