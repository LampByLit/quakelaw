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
                emoji: conversation.emoji
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
        
        if (!conversation) {
            // Create new conversation
            conversation = {
                npcSurname: surname,
                characteristic: npcData.characteristic,
                emoji: npcData.emoji || '',
                conversation: [],
                metadata: {
                    firstInteraction: Date.now(),
                    lastInteraction: Date.now(),
                    messageCount: 0
                }
            };
        } else {
            // Update NPC data if provided (in case it changed)
            if (npcData.characteristic) conversation.characteristic = npcData.characteristic;
            if (npcData.emoji) conversation.emoji = npcData.emoji;
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
        const systemPrompt = `You are ${surname}, a ${conversation.characteristic} person living in a legal/lawyer game world.

Your personality traits:
- You are ${conversation.characteristic} (e.g., ${conversation.characteristic === 'rude' ? 'you are blunt and direct' : conversation.characteristic === 'joyful' ? 'you are cheerful and optimistic' : 'you have this personality trait'})
- Respond only with dialogue. Do not include actions.
- You remember previous conversations with this player
- You respond naturally in 1-2 sentences
- You stay in character based on your characteristic
- Keep your responses brief and character-appropriate

Context:
- The player is a lawyer working on cases
- You may be given information by the system
- You may have information relevant to legal cases
- Other characters may ask you questions as well, answer them naturally
- This is the real world`;
        
        // Build messages array from conversation history
        const messages = [{ role: 'system', content: systemPrompt }];
        
        // Add conversation history (convert to API format)
        for (const msg of conversation.conversation) {
            if (msg.role === 'player') {
                messages.push({ role: 'user', content: msg.message });
            } else if (msg.role === 'npc') {
                messages.push({ role: 'assistant', content: msg.message });
            }
        }
        
        // Call DeepSeek API
        const requestBody = {
            model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
            messages: messages,
            temperature: 0.75, // Slightly higher for more personality
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
                emoji: conversation.emoji
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
        const systemPrompt = `You are ${surname}, a ${npcData.characteristic} person living in a legal/lawyer game world.

Greet the player naturally in 1-2 sentences. Be ${npcData.characteristic} in your greeting. 
This is the first time you're meeting them, so introduce yourself briefly.`;
        
        const requestBody = {
            model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Hello!' }
            ],
            temperature: 0.75,
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
                emoji: conversation.emoji
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

