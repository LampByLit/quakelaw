// DeepSeek API Integration
// Utility functions for interacting with the DeepSeek API
// All API calls are proxied through the backend server to keep API keys secure

/**
 * Call the DeepSeek API with a chat completion request
 * @param {string} message - The message to send to the API
 * @param {Array} systemPrompt - Optional system prompt messages
 * @param {Object} options - Additional options (temperature, max_tokens, etc.)
 * @returns {Promise<Object>} The API response
 */
async function callDeepSeekAPI(message, systemPrompt = null, options = {}) {
    try {
        const response = await fetch(CONFIG.DEEPSEEK_PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                systemPrompt: systemPrompt,
                options: options
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('DeepSeek API Error:', error);
        throw error;
    }
}

/**
 * Get the content from a DeepSeek API response
 * @param {Object} apiResponse - The response from callDeepSeekAPI
 * @returns {string} The message content
 */
function getDeepSeekResponseContent(apiResponse) {
    if (apiResponse && apiResponse.choices && apiResponse.choices.length > 0) {
        return apiResponse.choices[0].message.content;
    }
    return null;
}

/**
 * Judge decision function for case system
 * Simulates a judge's decision based on evidence and player statement
 * @param {Object} caseData - The case information
 * @param {Array} evidence - Array of evidence items
 * @param {string} playerStatement - The player's statement
 * @returns {Promise<string>} The judge's decision
 */
async function getJudgeDecision(caseData, evidence, playerStatement) {
    const systemPrompt = `You are a judge in a legal case. Analyze the evidence presented and the lawyer's statement to make a fair and reasoned decision. 
Consider the strength of the evidence, the quality of the legal argument, and the merits of the case. 
Provide a clear decision with brief reasoning.`;

    const message = `Case: ${JSON.stringify(caseData, null, 2)}

Evidence Presented:
${evidence.map((e, i) => `${i + 1}. ${JSON.stringify(e)}`).join('\n')}

Lawyer's Statement:
${playerStatement}

Please provide your decision and reasoning.`;

    try {
        const response = await callDeepSeekAPI(message, systemPrompt, {
            temperature: 0.5, // Lower temperature for more consistent legal decisions
            max_tokens: 1000
        });
        
        return getDeepSeekResponseContent(response);
    } catch (error) {
        console.error('Error getting judge decision:', error);
        return 'Error: Unable to reach the judge. Please try again.';
    }
}

