// Backend server for DeepSeek API proxy
// Keeps API keys secure on the server side

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

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

// Helper function to sanitize NPC surname for file names
function sanitizeSurname(surname) {
    // Only allow alphanumeric characters, remove any path traversal attempts
    return surname.replace(/[^a-zA-Z0-9]/g, '').substring(0, 50);
}

// Helper function to get conversation file path
function getConversationFilePath(surname) {
    const sanitized = sanitizeSurname(surname);
    return path.join(conversationsDir, `${sanitized}.json`);
}

// Helper function to load conversation
async function loadConversation(surname) {
    try {
        const filePath = getConversationFilePath(surname);
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
async function saveConversation(conversationData) {
    const filePath = getConversationFilePath(conversationData.npcSurname);
    await fs.writeFile(filePath, JSON.stringify(conversationData, null, 2), 'utf8');
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
        const surname = req.params.surname;
        const conversation = await loadConversation(surname);
        
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
        let conversation = await loadConversation(surname);
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
- REQUIRED: Talk about being a ${job} - that's your actual job and what you know about.`}

Your personality traits:
- You are ${conversation.characteristic} (e.g., ${conversation.characteristic === 'rude' ? 'you are blunt and direct' : conversation.characteristic === 'joyful' ? 'you are cheerful and optimistic' : 'you have this personality trait'})
- Respond only with dialogue. Do not include actions.
- You remember previous conversations with this player
- You respond naturally in 1-2 sentences
- You stay in character based on your characteristic
- Keep your responses brief and character-appropriate

Context:
${jobContext}You may have witnessed events in town. Talk about your normal life and your job as a ${job || 'regular person'}. You are on a schedule and do not have time to follow the player anywhere. Other characters may ask you questions as well, answer them naturally. This is the real world.

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
        
        // Update metadata
        conversation.metadata.lastInteraction = Date.now();
        conversation.metadata.messageCount = conversation.conversation.length;
        
        // Save conversation
        await saveConversation(conversation);
        
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
        const surname = req.params.surname;
        const { npcData } = req.body;
        
        if (!npcData || !npcData.characteristic) {
            return res.status(400).json({ error: 'NPC data with characteristic is required' });
        }
        
        // Check if conversation already exists
        const existing = await loadConversation(surname);
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
        
        await saveConversation(conversation);
        
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

// Delete all conversations (used for game reset)
app.delete('/api/npc/conversations', async (req, res) => {
    try {
        // Read all files in conversations directory
        const files = await fs.readdir(conversationsDir);
        
        // Delete all JSON files
        let deletedCount = 0;
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    await fs.unlink(path.join(conversationsDir, file));
                    deletedCount++;
                } catch (error) {
                    console.warn(`Failed to delete conversation file ${file}:`, error);
                }
            }
        }
        
        res.json({
            success: true,
            message: `Deleted ${deletedCount} conversation file(s)`,
            deletedCount: deletedCount
        });
    } catch (error) {
        console.error('Error clearing conversations:', error);
        res.status(500).json({ 
            error: 'Failed to clear conversations',
            message: error.message 
        });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    if (!process.env.DEEPSEEK_API_KEY) {
        console.warn('⚠️  WARNING: DEEPSEEK_API_KEY environment variable is not set!');
    }
    console.log(`Using model: ${process.env.DEEPSEEK_MODEL || 'deepseek-chat'}`);
});

