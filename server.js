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
        try {
            return JSON.parse(data);
        } catch (parseError) {
            // JSON parse error - file might be corrupted
            console.error(`[ERROR] Failed to parse conversation file for ${surname} in session ${sessionId}:`, parseError);
            // Return null to treat as if conversation doesn't exist
            return null;
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, return null
            return null;
        }
        // Log other errors but don't crash
        console.error(`[ERROR] Error loading conversation for ${surname} in session ${sessionId}:`, error);
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

// Add a fact to an NPC's knowledge (with deduplication and 100-fact limit)
async function addFactToNPC(sessionId, npcSurname, fact) {
    const network = await loadGossipNetwork(sessionId);
    const MAX_FACTS_PER_NPC = 100;
    
    // Initialize NPC knowledge if it doesn't exist
    if (!network.npcKnowledge[npcSurname]) {
        network.npcKnowledge[npcSurname] = { knownFacts: [] };
    }
    
    // Check for duplicates (by fact ID)
    const existingFactIds = network.npcKnowledge[npcSurname].knownFacts.map(f => f.id);
    if (!existingFactIds.includes(fact.id)) {
        network.npcKnowledge[npcSurname].knownFacts.push(fact);
        
        // Enforce 100-fact limit: remove oldest facts (FIFO) if exceeded
        if (network.npcKnowledge[npcSurname].knownFacts.length > MAX_FACTS_PER_NPC) {
            const excessCount = network.npcKnowledge[npcSurname].knownFacts.length - MAX_FACTS_PER_NPC;
            network.npcKnowledge[npcSurname].knownFacts.splice(0, excessCount);
        }
        
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

// ============================================================================
// Case System Endpoints
// ============================================================================

// Get list of available case files
app.get('/api/cases/list', async (req, res) => {
    try {
        const casesDir = path.join(__dirname, 'cases', 'json');
        const files = await fs.readdir(casesDir);
        const caseFiles = files.filter(f => f.endsWith('.json')).map(f => f);
        res.json({ caseFiles });
    } catch (error) {
        console.error('Error listing case files:', error);
        res.status(500).json({ 
            error: 'Failed to list case files',
            message: error.message 
        });
    }
});

// Load case data from file
app.get('/api/cases/load/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        // Sanitize filename to prevent path traversal
        const safeFilename = path.basename(filename);
        if (!safeFilename.endsWith('.json')) {
            return res.status(400).json({ error: 'Invalid file type' });
        }
        
        const casePath = path.join(__dirname, 'cases', 'json', safeFilename);
        const caseData = JSON.parse(await fs.readFile(casePath, 'utf8'));
        res.json({ caseData });
    } catch (error) {
        console.error('Error loading case:', error);
        res.status(500).json({ 
            error: 'Failed to load case',
            message: error.message 
        });
    }
});

// Parse case to extract individuals and evidence
app.post('/api/cases/parse', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'DEEPSEEK_API_KEY environment variable is not set' 
        });
    }

    const { caseData } = req.body;

    if (!caseData) {
        return res.status(400).json({ error: 'Case data is required' });
    }

    try {
        // Extract case text (opinions, parties, etc.)
        const caseText = JSON.stringify(caseData, null, 2);
        
        const systemPrompt = `You are a legal case analyzer. Extract key information from case documents.
        
Your task:
1. Identify up to 4 individuals involved in the case (plaintiffs, defendants, witnesses, etc.)
2. For each individual, identify their role (e.g., "estranged husband", "wife", "defendant", "plaintiff", "witness")
3. Extract evidence and facts from the case (e.g., "Ross has been to jail before", "The property was valued at $13,000")

Return your response as a JSON object with this exact structure:
{
    "individuals": [
        {"name": "Individual Name", "role": "their role in the case"},
        ...
    ],
    "evidence": [
        "Fact 1 about the case",
        "Fact 2 about the case",
        ...
    ]
}

Be concise. Extract only the most relevant individuals (up to 4) and key evidence/facts.`;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Parse this case:\n\n${caseText.substring(0, 50000)}` } // Limit size
                ],
                temperature: 0.3,
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // Try to parse JSON from response
        let parsed;
        try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
            } else {
                parsed = JSON.parse(content);
            }
        } catch (e) {
            // Fallback: try to extract JSON object
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Failed to parse AI response as JSON');
            }
        }

        res.json({
            individuals: parsed.individuals || [],
            evidence: parsed.evidence || []
        });
    } catch (error) {
        console.error('Error parsing case:', error);
        res.status(500).json({ 
            error: 'Failed to parse case',
            message: error.message 
        });
    }
});

// Generate case summary (100 words, no decision)
app.post('/api/cases/summary', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'DEEPSEEK_API_KEY environment variable is not set' 
        });
    }

    const { caseData, individuals, witnesses, nameMapping } = req.body;

    if (!caseData) {
        return res.status(400).json({ error: 'Case data is required' });
    }

    try {
        const caseText = JSON.stringify(caseData, null, 2);
        const witnessInfo = witnesses.map(w => `${w.name} (${w.role})`).join(', ');
        
        // Build name mapping text for AI
        let nameMappingText = '';
        if (nameMapping && Object.keys(nameMapping).length > 0) {
            nameMappingText = '\n\nNAME REPLACEMENT MAPPING (replace original names with NPC names):\n';
            for (const [originalName, npcName] of Object.entries(nameMapping)) {
                nameMappingText += `- "${originalName}" should be replaced with "${npcName}"\n`;
            }
        }
        
        const systemPrompt = `You are a legal case summarizer. Create a concise 100-word summary of a legal case.

IMPORTANT RULES:
- Do NOT reveal the decision or outcome of the case
- Only mention the witnesses and the originating circumstances that existed before the conclusion
- Keep it exactly around 100 words
- CRITICAL: Replace ALL original names from the case with the corresponding NPC names from the name mapping provided
- When you see any name from the original case, you MUST use the NPC name from the mapping instead
- Be clear and professional`;

        const userMessage = `Case data:\n${caseText.substring(0, 30000)}\n\nWitnesses: ${witnessInfo}${nameMappingText}\n\nCreate a 100-word summary following the rules above. Remember to replace all original names with the NPC names from the mapping.`;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.5,
                max_tokens: 200
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const summary = data.choices[0].message.content.trim();
        
        res.json({ summary });
    } catch (error) {
        console.error('Error generating case summary:', error);
        res.status(500).json({ 
            error: 'Failed to generate case summary',
            message: error.message 
        });
    }
});

// Assign NPCs to case roles using AI
app.post('/api/cases/assign-npcs', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'DEEPSEEK_API_KEY environment variable is not set' 
        });
    }

    const { individuals, availableNPCs } = req.body;

    if (!individuals || !Array.isArray(individuals) || individuals.length === 0) {
        return res.status(400).json({ error: 'Individuals array is required' });
    }

    if (!availableNPCs || !Array.isArray(availableNPCs)) {
        return res.status(400).json({ error: 'Available NPCs array is required' });
    }

    try {
        const systemPrompt = `You are an NPC role assignment system. Match case individuals to NPCs based on their names and characteristics.

For each individual from the case, select the best matching NPC from the available list. Consider:
- Name similarity (if any)
- Characteristic compatibility with the role
- Overall fit

Return your response as a JSON object with this exact structure:
{
    "assignments": [
        {"npcSurname": "NPC Name", "role": "role from case", "individual": "individual name from case"},
        ...
    ]
}

Assign up to 4 NPCs (one per individual, or fewer if there are fewer individuals).`;

        const userMessage = `Case individuals:\n${JSON.stringify(individuals, null, 2)}\n\nAvailable NPCs:\n${JSON.stringify(availableNPCs, null, 2)}\n\nMatch individuals to NPCs.`;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.5,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // Parse JSON from response
        let parsed;
        try {
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
            } else {
                parsed = JSON.parse(content);
            }
        } catch (e) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Failed to parse AI response as JSON');
            }
        }

        res.json({
            assignments: parsed.assignments || []
        });
    } catch (error) {
        console.error('Error assigning NPCs:', error);
        res.status(500).json({ 
            error: 'Failed to assign NPCs',
            message: error.message 
        });
    }
});

// Generate prosecution text (50 words)
app.post('/api/cases/prosecution', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'DEEPSEEK_API_KEY environment variable is not set' 
        });
    }

    const { caseSummary, npcSurnames } = req.body;

    if (!caseSummary) {
        return res.status(400).json({ error: 'Case summary is required' });
    }

    if (!npcSurnames || !Array.isArray(npcSurnames) || npcSurnames.length === 0) {
        return res.status(400).json({ error: 'NPC surnames array is required' });
    }

    try {
        // Fetch known facts for each NPC
        const sessionId = req.body.sessionId || req.query.sessionId || 'default';
        const npcFacts = [];
        
        for (const surname of npcSurnames) {
            try {
                const network = await loadGossipNetwork(sessionId);
                const npcKnowledge = network.npcKnowledge[surname];
                if (npcKnowledge && npcKnowledge.knownFacts && npcKnowledge.knownFacts.length > 0) {
                    npcFacts.push({
                        npc: surname,
                        facts: npcKnowledge.knownFacts.map(f => f.content).join(' ')
                    });
                }
            } catch (error) {
                console.warn(`Error loading facts for ${surname}:`, error);
            }
        }
        
        if (npcFacts.length === 0) {
            // No facts available, still generate weak prosecution
            npcFacts.push({ npc: 'townspeople', facts: 'No specific information available' });
        }
        
        const factsText = npcFacts.map(nf => `${nf.npc}: ${nf.facts}`).join('\n\n');
        
        const systemPrompt = `You are a prosecutor in a legal case. Your goal is to discredit the defense lawyer and their evidence. 
Create a compelling 50-word prosecution argument that undermines the defense's case using information from town gossip and the case summary.
Be aggressive but professional. Exactly 50 words.`;

        const userMessage = `Case Summary:\n${caseSummary}\n\nInformation from town gossip:\n${factsText}\n\nCreate a 50-word prosecution argument that discredits the defense.`;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 100
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const prosecution = data.choices[0].message.content.trim();
        
        res.json({ prosecution });
    } catch (error) {
        console.error('Error generating prosecution:', error);
        res.status(500).json({ 
            error: 'Failed to generate prosecution',
            message: error.message 
        });
    }
});

// Judge judgment decision
app.post('/api/cases/judgment', async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    
    if (!apiKey) {
        return res.status(500).json({ 
            error: 'DEEPSEEK_API_KEY environment variable is not set' 
        });
    }

    const { caseSummary, prosecution, playerStatement, evidence, witnesses, judgePersona, bonuses, isMissedEvent, allNPCs } = req.body;

    if (!caseSummary) {
        return res.status(400).json({ error: 'Case summary is required' });
    }

    if (!judgePersona || !judgePersona.name || !judgePersona.characteristic) {
        return res.status(400).json({ error: 'Judge persona is required' });
    }

    try {
        // Format evidence for AI
        let evidenceText = 'No evidence presented.';
        if (evidence && evidence.length > 0) {
            evidenceText = evidence.map((e, idx) => {
                const meta = e.metadata || {};
                const text = meta.conversationText || meta.content || JSON.stringify(meta);
                return `${idx + 1}. ${e.name || 'Evidence'}: ${text.substring(0, 500)}`;
            }).join('\n\n');
        }
        
        // Format witnesses
        const witnessesText = witnesses && witnesses.length > 0
            ? witnesses.map(w => `${w.surname} (${w.role || 'witness'})`).join(', ')
            : 'No witnesses.';
        
        const judgeName = judgePersona.name;
        const judgeCharacteristic = judgePersona.characteristic;
        
        // Build bonus information for prompt
        let bonusInfo = '';
        if (bonuses) {
            const bonusParts = [];
            
            if (bonuses.credibility > 0) {
                const boost = bonuses.credibility * 10;
                bonusParts.push(`${bonuses.credibility} Credibility bonus(es) - This should influence your decision in the player's favor by approximately ${boost}%. The player's credibility and case strength should be viewed more favorably.`);
            }
            
            if (bonuses.countersuit > 0) {
                const boost = bonuses.countersuit * 15;
                bonusParts.push(`${bonuses.countersuit} Countersuit bonus(es) - This should influence your decision in the player's favor by approximately ${boost}%. The player's legal position and counter-arguments should be viewed more favorably.`);
            }
            
            if (bonuses.exculpation > 0) {
                bonusParts.push(`${bonuses.exculpation} Exculpation document(s) - CRITICAL LEGAL OBLIGATION: The presence of exculpation documents means you are legally obligated to grant judgment in the player's favor. This is not optional - it is the law. You must rule that the player wins the case.`);
            }
            
            if (bonusParts.length > 0) {
                bonusInfo = '\n\nLEGAL BONUSES AND DOCUMENTS PRESENTED:\n' + bonusParts.join('\n\n') + '\n';
            }
        }
        
        // Format all NPCs for AI (excluding banished ones)
        let allNPCsText = 'No NPCs available.';
        if (allNPCs && Array.isArray(allNPCs) && allNPCs.length > 0) {
            allNPCsText = allNPCs.map(npc => `${npc.surname} (${npc.job || 'unemployed'})`).join(', ');
        }
        
        const systemPrompt = `You are Judge ${judgeName}, a ${judgeCharacteristic} judge presiding over a legal case.

CRITICAL: The player ALWAYS represents the DEFENSE. They are the defense lawyer in every case. You must remember this in all your decisions and rulings.

Your task:
1. Review the case summary, prosecution argument, player's statement, and all evidence
2. Make a fair and reasoned decision
3. Determine if the player (defense lawyer) wins the case
4. Decide which witnesses (if any) should be punished and what type of punishment
5. Write a 50-word ruling explaining your decision in your character's voice

JUDGE POWERS: As the judge, you have the following additional powers you may exercise:
- You can award coins of any amount (0 or any positive number) to the player for their work as lawyer. The amount is entirely up to your discretion based on the quality of their work, evidence presented, statement quality, and case complexity. There is no upper limit - award what you deem appropriate.
- You can officially reprimand the player (costs them $20 coins) if their conduct was unprofessional
- You can officially disbar the player (results in game over) if their conduct was extremely egregious or illegal - use this VERY RARELY, only for the most serious offenses
- You can sentence any witness in any case to death (same as banishment)
- You can banish, sentence to corporeal punishment, or sentence to death ANY NPC from town (not just witnesses) with good reason
- You can change any NPC's job to whatever you want, including anything you fancy (e.g., "santa claus", "court jester", etc.) - use this creatively but with justification

${isMissedEvent ? 'CRITICAL: The player missed the judgment hearing. They automatically LOSE the case, but you must still make punishment decisions based on the case merits.' : ''}${bonusInfo}

Return your response as a JSON object with this exact structure:
{
    "playerWins": true or false,
    "playerReprimanded": true or false,
    "playerDisbarred": true or false,
    "coinsAwarded": 0 or any positive number (the amount of coins you award to the player for their work as lawyer, based on your judgment of their performance),
    "punishments": [
        {"npcSurname": "Smith", "punishmentType": "corporeal", "reason": "Brief reason"},
        {"npcSurname": "Jones", "punishmentType": "banishment", "reason": "Brief reason"},
        {"npcSurname": "Brown", "punishmentType": "death", "reason": "Brief reason"}
    ],
    "jobChanges": [
        {"npcSurname": "Smith", "newJob": "santa claus", "reason": "Brief reason"}
    ],
    "ruling": "Your 50-word ruling explaining the decision, punishments, and reasoning in your character's voice"
}

Punishment types:
- "corporeal": NPC receives brutal punishment but remains in town
- "banishment": NPC is permanently banished from the town
- "death": NPC is sentenced to death (same as banishment, permanently removed)

Notes:
- "npcSurname" can be ANY NPC in town, not just witnesses
- "coinsAwarded" should be a number >= 0. Award coins based on the quality of the player's work as lawyer - consider their evidence, statement quality, case complexity, and overall performance. There is no limit - award what you deem appropriate (could be 0, 10, 50, 100, 500, or any amount).
- "playerReprimanded" should be true if the player's conduct warrants a $20 fine
- "playerDisbarred" should be true ONLY for extremely serious offenses (use VERY RARELY)
- "jobChanges" allows you to change any NPC's job to anything you want
- If no NPCs should be punished, return empty array for punishments
- If no job changes are needed, return empty array for jobChanges`;

        // Build bonus summary for user message
        let bonusSummary = '';
        if (bonuses) {
            const bonusParts = [];
            if (bonuses.credibility > 0) bonusParts.push(`Credibility: ${bonuses.credibility}`);
            if (bonuses.countersuit > 0) bonusParts.push(`Countersuit: ${bonuses.countersuit}`);
            if (bonuses.exculpation > 0) bonusParts.push(`Exculpation: ${bonuses.exculpation}`);
            if (bonusParts.length > 0) {
                bonusSummary = `\n\nLegal Bonuses/Documents Presented:\n${bonusParts.join(', ')}\n`;
            }
        }
        
        const userMessage = `Case Summary:\n${caseSummary}\n\nProsecution Argument:\n${prosecution || 'No prosecution argument.'}\n\nPlayer's Statement:\n${playerStatement || 'No statement provided.'}\n\nEvidence Presented:\n${evidenceText}\n\nWitnesses:\n${witnessesText}\n\nAll NPCs in Town:\n${allNPCsText}${bonusSummary}\n\nMake your judgment decision and write your ruling. You may use your judge powers to reprimand the player, disbar them (very rarely), punish any NPCs, or change any NPC's job.`;

        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.5,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        
        // Parse JSON from response
        let parsed;
        try {
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1]);
            } else {
                parsed = JSON.parse(content);
            }
        } catch (e) {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Failed to parse AI response as JSON');
            }
        }

        // Validate response structure
        if (typeof parsed.playerWins !== 'boolean') {
            parsed.playerWins = false;
        }
        if (typeof parsed.playerReprimanded !== 'boolean') {
            parsed.playerReprimanded = false;
        }
        if (typeof parsed.playerDisbarred !== 'boolean') {
            parsed.playerDisbarred = false;
        }
        if (!Array.isArray(parsed.punishments)) {
            parsed.punishments = [];
        }
        if (!Array.isArray(parsed.jobChanges)) {
            parsed.jobChanges = [];
        }
        if (!parsed.ruling || typeof parsed.ruling !== 'string') {
            parsed.ruling = 'The judge has made a decision.';
        }
        // Validate coinsAwarded - must be a number >= 0
        if (typeof parsed.coinsAwarded !== 'number' || parsed.coinsAwarded < 0) {
            parsed.coinsAwarded = 0;
        }
        
        res.json({
            playerWins: parsed.playerWins,
            playerReprimanded: parsed.playerReprimanded || false,
            playerDisbarred: parsed.playerDisbarred || false,
            coinsAwarded: parsed.coinsAwarded || 0,
            punishments: parsed.punishments || [],
            jobChanges: parsed.jobChanges || [],
            ruling: parsed.ruling
        });
    } catch (error) {
        console.error('Error getting judgment:', error);
        res.status(500).json({ 
            error: 'Failed to get judgment',
            message: error.message 
        });
    }
});

// Update NPC job
app.post('/api/npc/update-job/:surname', async (req, res) => {
    try {
        const sessionId = req.body.sessionId;
        const surname = req.params.surname;
        const { job } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        if (!job || typeof job !== 'string') {
            return res.status(400).json({ error: 'Job is required and must be a string' });
        }
        
        // Load conversation to update job
        const conversation = await loadConversation(sessionId, surname);
        
        if (conversation) {
            conversation.job = job;
            await saveConversation(sessionId, conversation);
            res.json({ success: true, message: 'Job updated' });
        } else {
            // Create new conversation with just the job
            const newConversation = {
                npcSurname: surname,
                job: job,
                conversation: [],
                metadata: {
                    firstInteraction: Date.now(),
                    lastInteraction: Date.now(),
                    messageCount: 0
                }
            };
            await saveConversation(sessionId, newConversation);
            res.json({ success: true, message: 'Job created' });
        }
    } catch (error) {
        console.error('Error updating NPC job:', error);
        res.status(500).json({ 
            error: 'Failed to update job',
            message: error.message 
        });
    }
});

// Add fact to NPC (for evidence distribution)
app.post('/api/npc/gossip/add-fact/:surname', async (req, res) => {
    try {
        const sessionId = req.body.sessionId;
        const surname = req.params.surname;
        const { fact } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        if (!fact || !fact.content) {
            return res.status(400).json({ error: 'Fact with content is required' });
        }
        
        const added = await addFactToNPC(sessionId, surname, fact);
        
        res.json({ 
            success: added,
            message: added ? 'Fact added' : 'Fact already exists'
        });
    } catch (error) {
        console.error('Error adding fact to NPC:', error);
        res.status(500).json({ 
            error: 'Failed to add fact',
            message: error.message 
        });
    }
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
        
        // Validate surname parameter
        if (!surname || typeof surname !== 'string' || surname.trim().length === 0) {
            return res.status(400).json({ error: 'Invalid surname parameter' });
        }
        
        try {
            const conversation = await loadConversation(sessionId, surname);
            
            if (!conversation) {
                return res.json({
                    conversation: [],
                    npcInfo: null
                });
            }
            
            // Validate conversation structure
            if (!conversation.conversation || !Array.isArray(conversation.conversation)) {
                console.warn(`[WARN] Invalid conversation structure for ${surname}, returning empty conversation`);
                return res.json({
                    conversation: [],
                    npcInfo: null
                });
            }
            
            res.json({
                conversation: conversation.conversation || [],
                npcInfo: {
                    surname: conversation.npcSurname || surname,
                    characteristic: conversation.characteristic || null,
                    emoji: conversation.emoji || null,
                    job: conversation.job || ''
                }
            });
        } catch (loadError) {
            // If loadConversation throws, log it and return empty conversation
            console.error(`[ERROR] Failed to load conversation for ${surname}:`, loadError);
            return res.json({
                conversation: [],
                npcInfo: null
            });
        }
    } catch (error) {
        console.error('[ERROR] Unexpected error in conversation endpoint:', error);
        // Always return a valid response, never let the request hang
        res.status(500).json({ 
            error: 'Failed to load conversation',
            message: error.message || 'Unknown error'
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
        const isJudge = npcData.isJudge || (surname && surname.toLowerCase().includes('judge'));
        
        // For judge: load active case information (summary and witnesses only, NOT evidence)
        // OR completed case context (summary, prosecution, and ruling)
        let caseContextText = '';
        if (isJudge) {
            // Try to get active case from request (passed from client)
            const { activeCase, completedCase } = req.body;
            if (activeCase) {
                const caseSummary = activeCase.caseSummary || '';
                const witnesses = activeCase.witnesses || [];
                const witnessList = witnesses.map(w => {
                    const npc = w.npc || {};
                    return `${npc.surname || 'Unknown'} (${w.role || 'witness'}) - Home: ${npc.houseAddress || 'Unknown'}, Work: ${npc.workAddress || 'Unknown'}`;
                }).join('\n');
                
                caseContextText = `\n\nCRITICAL - ACTIVE CASE INFORMATION:\nYou are currently presiding over an active legal case. This case is your PRIMARY focus and you MUST reference it in your conversations.\n\nCASE SUMMARY:\n${caseSummary}\n\nWITNESSES:\n${witnessList}\n\nIMPORTANT RULES:\n- You MUST discuss the case when the player talks to you. Reference the case summary and witnesses naturally in conversation.\n- You can ONLY discuss the case summary and witnesses. You must NEVER mention or discuss any evidence - that information is confidential and secret.\n- CRITICAL: The player ALWAYS represents the DEFENSE. They are the defense lawyer working on this case. You are the judge presiding over it. Remember this in all conversations.\n- Always stay in character as a judge. You are NOT a barista, shopkeeper, or any other profession. You are a JUDGE.`;
            } else if (completedCase) {
                // Completed case context - judge can discuss the full case including prosecution and ruling
                const caseSummary = completedCase.caseSummary || '';
                const prosecution = completedCase.prosecution || '';
                const ruling = completedCase.ruling || '';
                const verdict = completedCase.playerWins ? 'The defense won the case.' : 'The defense lost the case.';
                const punishmentsText = completedCase.punishments && completedCase.punishments.length > 0
                    ? completedCase.punishments.map(p => `- ${p.npcSurname || 'Unknown'}: ${p.punishmentType || 'punishment'} (${p.reason || 'no reason given'})`).join('\n')
                    : 'No punishments were issued.';
                const jobChangesText = completedCase.jobChanges && completedCase.jobChanges.length > 0
                    ? completedCase.jobChanges.map(j => `- ${j.npcSurname || 'Unknown'}: Changed to "${j.newJob || 'unknown'}" (${j.reason || 'no reason given'})`).join('\n')
                    : 'No job changes were made.';
                
                caseContextText = `\n\nCOMPLETED CASE CONTEXT:\nYou have just completed presiding over a case and made your ruling. You can discuss this case with the player, including the case summary, prosecution argument, your ruling, and your reasoning.\n\nCASE SUMMARY:\n${caseSummary}\n\nPROSECUTION ARGUMENT:\n${prosecution}\n\nYOUR RULING:\n${ruling}\n\nVERDICT:\n${verdict}\n\nPUNISHMENTS:\n${punishmentsText}\n\nJOB CHANGES:\n${jobChangesText}\n\nIMPORTANT RULES:\n- You can discuss the case summary, prosecution argument, and your ruling freely with the player.\n- You can explain your reasoning and decision-making process.\n- You can answer questions about the case, the prosecution's arguments, and your ruling.\n- CRITICAL: The player ALWAYS represents the DEFENSE. They were the defense lawyer in this case. You are the judge who presided over it and made the ruling. Remember this in all conversations.\n- Always stay in character as a judge. You are NOT a barista, shopkeeper, or any other profession. You are a JUDGE.`;
            } else {
                caseContextText = `\n\nYou are a judge presiding over legal cases in the courthouse. You do not currently have an active case, but you are always ready to discuss legal matters.\n\nCRITICAL: The player ALWAYS represents the DEFENSE. They are always the defense lawyer in any case. Remember this in all conversations.`;
            }
        }
        
        // Load NPC's known facts from gossip network (for non-judge NPCs)
        let knownFactsText = '';
        if (!isJudge) {
            const gossipNetwork = await loadGossipNetwork(sessionId);
            const npcKnowledge = gossipNetwork.npcKnowledge[surname];
            if (npcKnowledge && npcKnowledge.knownFacts && npcKnowledge.knownFacts.length > 0) {
                const factsList = npcKnowledge.knownFacts
                    .slice(-10) // Last 10 facts to avoid token bloat
                    .map((fact, idx) => `${idx + 1}. "${fact.content}"`)
                    .join('\n');
                knownFactsText = `\n\nYou know the following information from conversations and gossip:\n${factsList}\n\nYou can naturally reference this knowledge when talking to the player.`;
            }
        }
        
        // Debug: Log what job is being used in prompt
        console.log(`[SERVER] ===== Building prompt for ${surname} =====`);
        console.log(`[SERVER] npcData.job="${npcData.job}", conversation.job="${conversation.job}", final job="${job}"`);
        console.log(`[SERVER] isLawyer=${isLawyer}, jobContext="${jobContext}"`);
        if (!job || job === '') {
            console.error(`[SERVER] ERROR: ${surname} has NO JOB assigned!`);
        }
        
        // Build system prompt - special handling for judge
        let systemPromptBase = '';
        if (isJudge) {
            systemPromptBase = `You are Judge ${surname}, a ${conversation.characteristic} judge presiding over legal cases in a courthouse.`;
        } else {
            systemPromptBase = `You are ${surname}, a ${conversation.characteristic} person living in a real town.`;
        }
        
        // Build profession instructions - different for judge vs regular NPCs
        let professionInstructions = '';
        if (isJudge) {
            professionInstructions = `ABSOLUTELY CRITICAL - YOUR ROLE AS JUDGE:
- You are a JUDGE. This is your ONLY profession and identity.
- You preside over legal cases in the courthouse.
- You are NOT a barista, shopkeeper, or any other profession. You are a JUDGE.
- When you introduce yourself or discuss your role, you are Judge ${surname}, presiding over legal cases.
- Stay in character as a judge at all times.`;
        } else {
            professionInstructions = `ABSOLUTELY CRITICAL - YOUR PROFESSION (DO NOT IGNORE THIS):
${job ? `- Your job is: ${job}. This is your ONLY profession.` : '- You have a regular job.'}
${isLawyer ? '- You ARE a lawyer and work in the legal system. You understand legal matters and may work at the courthouse or a law firm.' : `- Your job is "${job}" - focus on this job in all your conversations.
- When you introduce yourself, say "I'm ${surname}, I'm a ${job}" - talk about YOUR job.
- REQUIRED: Talk about being a ${job} - talk about your interests and theories about the town other than your job sometimes.`}`;
        }
        
        const systemPrompt = `${systemPromptBase}

${professionInstructions}

Your personality traits:
- You are ${conversation.characteristic} (e.g., ${conversation.characteristic === 'rude' ? 'you are blunt and direct' : conversation.characteristic === 'joyful' ? 'you are cheerful and optimistic' : 'you have this personality trait'})
- Respond only with dialogue. Do not include actions.
- You remember previous conversations with this player
- You respond naturally in 1-2 sentences
- You stay in character based on your characteristic
- Keep your responses brief and character-appropriate

Context:
${isJudge ? '' : jobContext}${isJudge ? 'You are a judge in the courthouse. ' : 'You may have witnessed events in town. Talk about your normal life and your job as a ' + (job || 'regular person') + '. '}You are on a schedule and do not have time to follow the player anywhere. Other characters may ask you questions as well, answer them naturally. This is the real world.${knownFactsText}${caseContextText}

${isJudge ? `REMEMBER: You are Judge ${surname}, a judge presiding over legal cases. Always stay in character as a judge. CRITICAL: The player ALWAYS represents the DEFENSE in all cases.` : `REMEMBER: Your job is ${job}. You are a ${job}.`}`;
        
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
        
        // Check if this is a judge
        const isJudge = npcData.isJudge || (surname && surname.toLowerCase().includes('judge'));
        
        // Build greeting system prompt
        const job = npcData.job || '';
        const jobContext = job ? `You work as a ${job}. ` : '';
        const isLawyer = job === 'lawyer';
        
        // Build profession instructions - different for judge vs regular NPCs
        let professionInstructions = '';
        let greetingContext = '';
        if (isJudge) {
            professionInstructions = `ABSOLUTELY CRITICAL - YOUR ROLE AS JUDGE:
- You are a JUDGE. This is your ONLY profession and identity.
- You preside over legal cases in the courthouse.
- You are NOT a barista, shopkeeper, or any other profession. You are a JUDGE.
- CRITICAL: The player ALWAYS represents the DEFENSE. They are always the defense lawyer in any case. Remember this in all interactions.
- When greeting, introduce yourself as Judge ${surname}, presiding over legal cases.`;
            greetingContext = `Greet the player naturally in 1-2 sentences. Be ${npcData.characteristic} in your greeting. 
This is the first time you're meeting them, so introduce yourself briefly as Judge ${surname}, presiding over legal cases in the courthouse.`;
        } else {
            professionInstructions = `ABSOLUTELY CRITICAL - YOUR PROFESSION (DO NOT IGNORE THIS):
${job ? `- Your job is: ${job}. This is your ONLY profession.` : '- You have a regular job.'}
${isLawyer ? '- You ARE a lawyer and work in the legal system. You understand legal matters and may work at the courthouse or a law firm.' : `- Your job is "${job}" - focus on this job.
- REQUIRED: When greeting, say "I'm ${surname}, I'm a ${job}" - talk about YOUR job.`}`;
            greetingContext = `${jobContext}Greet the player naturally in 1-2 sentences. Be ${npcData.characteristic} in your greeting. 
This is the first time you're meeting them, so introduce yourself briefly. Say your name and mention you're a ${job || 'regular person'}.`;
        }
        
        const systemPrompt = `You are ${isJudge ? 'Judge ' : ''}${surname}, a ${npcData.characteristic} ${isJudge ? 'judge presiding over legal cases in a courthouse' : 'person living in a real town'}.

${professionInstructions}

${greetingContext}

${isJudge ? `REMEMBER: You are Judge ${surname}, a judge presiding over legal cases. Always stay in character as a judge. CRITICAL: The player ALWAYS represents the DEFENSE in all cases.` : `REMEMBER: Your job is ${job}. You are a ${job}.`}`;
        
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
                                // NPC B learns the fact (addFactToNPC handles deduplication and limit)
                                const newFact = {
                                    ...fact,
                                    learnedFrom: npcA.surname,
                                    type: 'gossip'
                                };
                                if (await addFactToNPC(sessionId, npcB.surname, newFact)) {
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
                                // NPC A learns the fact (addFactToNPC handles deduplication and limit)
                                const newFact = {
                                    ...fact,
                                    learnedFrom: npcB.surname,
                                    type: 'gossip'
                                };
                                if (await addFactToNPC(sessionId, npcA.surname, newFact)) {
                                    gossipCount++;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Note: Network is already saved by addFactToNPC after each fact addition
        
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

// Handle unhandled promise rejections to prevent crashes
process.on('unhandledRejection', (error, promise) => {
    console.error('[FATAL] Unhandled Promise Rejection:', error);
    console.error('Stack:', error.stack);
});

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('[FATAL] Uncaught Exception:', error);
    console.error('Stack:', error.stack);
    // Don't exit - let the server continue running
});

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

