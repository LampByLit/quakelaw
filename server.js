// Backend server for DeepSeek API proxy
// Keeps API keys secure on the server side

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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

