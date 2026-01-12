///////////////////////////////////////////////////////////////////////////////
// Case System
// Handles case selection, parsing, NPC assignment, and case file generation

// Active case data
let activeCase = null;
let usedCaseFiles = new Set(); // Track which case files have been used
let currentCaseNumber = 1; // Serial number for case files

// Judge persona (regenerated each Monday)
let judgePersona = {
    name: null,
    characteristic: null
};

// Banished NPCs (permanently removed from game)
let banishedNPCs = []; // Array of surnames

// Restore banished NPCs from save data (call after NPCs are initialized)
function RestoreBanishedNPCs(banishedList) {
    if (!banishedList || !Array.isArray(banishedList)) {
        return;
    }
    
    banishedNPCs = banishedList;
    
    // Remove banished NPCs from allNPCs
    if (typeof allNPCs !== 'undefined' && Array.isArray(allNPCs)) {
        allNPCs = allNPCs.filter(npc => !banishedNPCs.includes(npc.surname));
    }
    
    // Remove from gameObjects
    if (typeof gameObjects !== 'undefined' && Array.isArray(gameObjects)) {
        gameObjects = gameObjects.filter(obj => {
            if (obj.isNPC && banishedNPCs.includes(obj.surname)) return false;
            if (obj.isJudge && banishedNPCs.includes(obj.surname)) return false;
            return true;
        });
    }
    
    console.log(`Restored ${banishedNPCs.length} banished NPCs from save data`);
}

///////////////////////////////////////////////////////////////////////////////
// Case File Management

// Get list of all available case files
async function GetAvailableCaseFiles() {
    try {
        const response = await fetch('/api/cases/list');
        if (!response.ok) {
            throw new Error('Failed to fetch case files');
        }
        const data = await response.json();
        return data.caseFiles || [];
    } catch (error) {
        console.error('Error fetching case files:', error);
        return [];
    }
}

// Get a random unused case file
async function GetRandomUnusedCase() {
    const allCases = await GetAvailableCaseFiles();
    const unusedCases = allCases.filter(file => !usedCaseFiles.has(file));
    
    if (unusedCases.length === 0) {
        // All cases used, reset (or handle as needed)
        console.warn('All cases have been used! Resetting used cases.');
        usedCaseFiles.clear();
        return allCases[RandInt(allCases.length)];
    }
    
    const randomCase = unusedCases[RandInt(unusedCases.length)];
    usedCaseFiles.add(randomCase);
    return randomCase;
}

// Load case data from file
async function LoadCaseData(caseFileName) {
    try {
        const response = await fetch(`/api/cases/load/${encodeURIComponent(caseFileName)}`);
        if (!response.ok) {
            throw new Error('Failed to load case data');
        }
        const data = await response.json();
        return data.caseData;
    } catch (error) {
        console.error('Error loading case data:', error);
        return null;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Case Parsing (AI)

// Parse case to extract individuals and evidence
async function ParseCase(caseData) {
    try {
        const response = await fetch('/api/cases/parse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ caseData })
        });
        
        if (!response.ok) {
            throw new Error('Failed to parse case');
        }
        
        const data = await response.json();
        return {
            individuals: data.individuals || [],
            evidence: data.evidence || []
        };
    } catch (error) {
        console.error('Error parsing case:', error);
        return { individuals: [], evidence: [] };
    }
}

// Generate case summary (100 words, no decision)
async function GenerateCaseSummary(caseData, individuals, witnesses) {
    try {
        // Build name mapping: original individual names -> assigned NPC names
        const nameMapping = {};
        individuals.forEach((individual, index) => {
            if (witnesses[index] && witnesses[index].npc && witnesses[index].npc.surname) {
                nameMapping[individual.name] = witnesses[index].npc.surname;
            }
        });
        
        const response = await fetch('/api/cases/summary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                caseData,
                individuals,
                witnesses: witnesses.map(w => ({
                    name: w.npc.surname,
                    role: w.role
                })),
                nameMapping: nameMapping // Mapping of original names to NPC names
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate case summary');
        }
        
        const data = await response.json();
        return data.summary || '';
    } catch (error) {
        console.error('Error generating case summary:', error);
        return 'Case summary unavailable.';
    }
}

///////////////////////////////////////////////////////////////////////////////
// Judge Persona Generation

// Generate new judge persona
function GenerateJudgePersona() {
    if (!npcSurnames || npcSurnames.length === 0) {
        console.warn('No NPC surnames available for judge persona');
        judgePersona.name = 'Judge';
        judgePersona.characteristic = 'serious';
        return;
    }
    
    if (!npcCharacteristics || npcCharacteristics.length === 0) {
        console.warn('No NPC characteristics available for judge persona');
        judgePersona.name = 'Judge';
        judgePersona.characteristic = 'serious';
        return;
    }
    
    // Pick random name and characteristic
    const randomName = npcSurnames[RandInt(npcSurnames.length)];
    const randomCharacteristic = npcCharacteristics[RandInt(npcCharacteristics.length)];
    
    judgePersona.name = randomName;
    judgePersona.characteristic = randomCharacteristic;
    
    console.log(`Generated judge persona: Judge ${randomName} (${randomCharacteristic})`);
}

// Get current judge persona
function GetJudgePersona() {
    return judgePersona;
}

///////////////////////////////////////////////////////////////////////////////
// NPC Role Assignment

// Assign NPCs to case roles using AI
async function AssignNPCsToRoles(individuals) {
    if (!individuals || individuals.length === 0) {
        return [];
    }
    
    if (!allNPCs || allNPCs.length === 0) {
        console.warn('No NPCs available for role assignment');
        return [];
    }
    
    try {
        // Filter out banished NPCs
        const availableNPCs = allNPCs.filter(npc => !IsNPCBanished(npc.surname));
        
        if (availableNPCs.length === 0) {
            console.warn('No available NPCs (all may be banished)');
            return [];
        }
        
        // Get NPC info for matching
        const npcInfo = availableNPCs.map(npc => ({
            surname: npc.surname,
            characteristic: npc.characteristic,
            job: npc.job
        }));
        
        const response = await fetch('/api/cases/assign-npcs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                individuals,
                availableNPCs: npcInfo
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to assign NPCs to roles');
        }
        
        const data = await response.json();
        const assignments = data.assignments || [];
        
        // Map assignments to actual NPC objects
        const witnessAssignments = [];
        for (const assignment of assignments) {
            const npc = GetNPCBySurname(assignment.npcSurname);
            if (npc) {
                witnessAssignments.push({
                    npc: npc,
                    role: assignment.role,
                    individual: assignment.individual
                });
            } else {
                console.warn(`NPC ${assignment.npcSurname} not found for role assignment`);
            }
        }
        
        return witnessAssignments;
    } catch (error) {
        console.error('Error assigning NPCs to roles:', error);
        // Fallback: assign randomly
        return AssignNPCsToRolesFallback(individuals);
    }
}

// Fallback NPC assignment (random)
function AssignNPCsToRolesFallback(individuals) {
    const assignments = [];
    const availableNPCs = allNPCs.filter(npc => npc && npc.surname && !IsNPCBanished(npc.surname));
    const shuffledNPCs = availableNPCs.slice();
    
    // Shuffle
    for (let i = shuffledNPCs.length - 1; i > 0; i--) {
        const j = RandInt(i + 1);
        [shuffledNPCs[i], shuffledNPCs[j]] = [shuffledNPCs[j], shuffledNPCs[i]];
    }
    
    for (let i = 0; i < Math.min(individuals.length, shuffledNPCs.length, 4); i++) {
        assignments.push({
            npc: shuffledNPCs[i],
            role: individuals[i].role || 'witness',
            individual: individuals[i]
        });
    }
    
    return assignments;
}

///////////////////////////////////////////////////////////////////////////////
// Evidence Distribution

// Distribute evidence to witness NPCs
async function DistributeEvidenceToWitnesses(witnesses, evidence, individuals) {
    if (!witnesses || witnesses.length === 0 || !evidence || evidence.length === 0) {
        return;
    }
    
    // Build name mapping: original individual names -> assigned NPC surnames
    const nameMapping = {};
    if (individuals && individuals.length > 0) {
        individuals.forEach((individual, index) => {
            if (witnesses[index] && witnesses[index].npc && witnesses[index].npc.surname) {
                nameMapping[individual.name] = witnesses[index].npc.surname;
            }
        });
    }
    
    // Get available NPCs for replacing other names (exclude witness NPCs and banished NPCs)
    const witnessSurnames = new Set(witnesses.map(w => w.npc.surname));
    const availableNPCs = [];
    if (typeof allNPCs !== 'undefined' && Array.isArray(allNPCs)) {
        for (const npc of allNPCs) {
            if (npc && npc.surname && 
                !witnessSurnames.has(npc.surname) && 
                !IsNPCBanished(npc.surname)) {
                availableNPCs.push(npc.surname);
            }
        }
    }
    
    // Shuffle available NPCs for random assignment
    const shuffledNPCs = [...availableNPCs];
    for (let i = shuffledNPCs.length - 1; i > 0; i--) {
        const j = RandInt(i + 1);
        [shuffledNPCs[i], shuffledNPCs[j]] = [shuffledNPCs[j], shuffledNPCs[i]];
    }
    
    // Track replacements for other names (so same name always maps to same NPC)
    const otherNameMapping = {};
    let npcIndex = 0;
    
    // Common words to exclude (not person names)
    const excludeWords = new Set(['The', 'A', 'An', 'This', 'That', 'These', 'Those', 
        'He', 'She', 'It', 'They', 'We', 'You', 'I', 'Mr', 'Mrs', 'Ms', 'Dr', 
        'Judge', 'Court', 'State', 'People', 'Appellant', 'Defendant', 'Plaintiff', 
        'Witness', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 
        'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 
        'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Penal', 'Code', 
        'Section', 'California', 'Michigan', 'Sacramento', 'Detroit', 'Pasadena']);
    
    // Function to transform evidence text by replacing all names
    function transformEvidenceText(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }
        
        let transformed = text;
        
        // First, replace known individual names with their NPC surnames
        for (const [originalName, npcName] of Object.entries(nameMapping)) {
            // Use word boundaries to avoid partial matches
            const regex = new RegExp(`\\b${originalName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            transformed = transformed.replace(regex, npcName);
        }
        
        // Then, find and replace other person names (capitalized word sequences that look like names)
        // Pattern: Two or more capitalized words in sequence (e.g., "First Last", "First Middle Last")
        const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;
        const matches = Array.from(transformed.matchAll(namePattern));
        const foundNames = new Set();
        
        for (const match of matches) {
            const potentialName = match[1];
            // Skip if already replaced, or if it contains excluded words
            const words = potentialName.split(/\s+/);
            const hasExcludedWord = words.some(word => excludeWords.has(word));
            
            if (!nameMapping[potentialName] && !hasExcludedWord) {
                foundNames.add(potentialName);
            }
        }
        
        // Also check for single capitalized words that appear before common verbs (likely names)
        const singleNamePattern = /\b([A-Z][a-z]{2,})\b(?=\s+(?:testified|said|stated|told|claimed|reported|witnessed|observed|noted|explained|described|indicated|mentioned|recalled|remembered|admitted|denied|confessed|declared|asserted|affirmed|alleged|contended|maintained|insisted|argued|suggested|proposed|recommended|requested|demanded|ordered|instructed|directed|commanded|required|asked|questioned|inquired|wondered|thought|believed|felt|knew|understood|realized|recognized|identified|discovered|found|learned|heard|saw|witnessed|observed|noticed|detected|perceived|sensed|experienced|encountered|met|visited|contacted|called|phoned|emailed|wrote|sent|received|gave|took|brought|carried|moved|left|arrived|departed|entered|exited|opened|closed|locked|unlocked|started|stopped|began|ended|continued|paused|waited|stayed|remained))/gi;
        const singleMatches = Array.from(transformed.matchAll(singleNamePattern));
        for (const match of singleMatches) {
            const potentialName = match[1];
            if (!nameMapping[potentialName] && !excludeWords.has(potentialName)) {
                foundNames.add(potentialName);
            }
        }
        
        // Replace found names with random NPCs
        for (const name of foundNames) {
            if (!otherNameMapping[name]) {
                if (shuffledNPCs.length === 0) {
                    // No available NPCs - skip replacement (shouldn't happen with 25 NPCs)
                    continue;
                }
                if (npcIndex >= shuffledNPCs.length) {
                    // If we run out of NPCs, cycle back (shouldn't happen with 25 NPCs)
                    npcIndex = 0;
                }
                otherNameMapping[name] = shuffledNPCs[npcIndex];
                npcIndex++;
            }
            const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
            transformed = transformed.replace(regex, otherNameMapping[name]);
        }
        
        return transformed;
    }
    
    // Distribute evidence equally among all witnesses
    const evidencePerWitness = Math.ceil(evidence.length / witnesses.length);
    const sessionId = getSessionId();
    
    for (let i = 0; i < witnesses.length; i++) {
        const witness = witnesses[i];
        const startIdx = i * evidencePerWitness;
        const endIdx = Math.min(startIdx + evidencePerWitness, evidence.length);
        const witnessEvidence = evidence.slice(startIdx, endIdx);
        
        // Add each piece of evidence as a knownfact
        for (const fact of witnessEvidence) {
            try {
                const factText = typeof fact === 'string' ? fact : fact.content || JSON.stringify(fact);
                // Transform the evidence text to replace all names
                const transformedText = transformEvidenceText(factText);
                
                const response = await fetch(`/api/npc/gossip/add-fact/${encodeURIComponent(witness.npc.surname)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        fact: {
                            id: `case_evidence_${Date.now()}_${Math.random()}`,
                            content: transformedText,
                            source: 'case',
                            learnedFrom: 'case',
                            timestamp: Date.now(),
                            type: 'case_evidence'
                        }
                    })
                });
                
                if (!response.ok) {
                    console.warn(`Failed to add evidence to ${witness.npc.surname}`);
                }
            } catch (error) {
                console.error(`Error adding evidence to ${witness.npc.surname}:`, error);
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// Case File Creation

// Create case file item for inventory
function CreateCaseFileItem(caseSummary, witnesses, caseNumber) {
    // Format witness info
    const witnessInfo = witnesses.map(w => {
        const npc = w.npc;
        return {
            name: npc.surname,
            role: w.role,
            home: npc.houseAddress || 'Unknown',
            work: npc.workAddress || 'Unknown'
        };
    });
    
    // Create case file text
    let caseFileText = caseSummary + '\n\n';
    caseFileText += 'WITNESSES:\n';
    for (const witness of witnessInfo) {
        caseFileText += `${witness.name} (${witness.role})\n`;
        caseFileText += `  Home: ${witness.home}\n`;
        caseFileText += `  Work: ${witness.work}\n\n`;
    }
    
    // Get first witness surname for naming
    const firstWitnessSurname = witnesses.length > 0 ? witnesses[0].npc.surname : 'Unknown';
    const caseFileName = `Case File: ${firstWitnessSurname} ${String(caseNumber).padStart(4, '0')}`;
    
    // Create inventory item (similar to evidence items)
    const caseFileItem = {
        type: `casefile_${Date.now()}`, // Unique type to prevent stacking
        name: caseFileName,
        tileX: 5, // Same sprite as evidence
        tileY: 5,
        quantity: 1,
        metadata: {
            caseSummary: caseSummary,
            witnesses: witnessInfo,
            caseNumber: caseNumber,
            caseFileText: caseFileText
        }
    };
    
    return caseFileItem;
}

///////////////////////////////////////////////////////////////////////////////
// Main Case Initialization

// Initialize a new case (called when Case of the Mondays event is triggered)
async function InitializeNewCase() {
    console.log('Initializing new case...');
    
    // 0. Clear completed case context (from previous case)
    if (typeof completedCaseContext !== 'undefined') {
        completedCaseContext = null;
        console.log('[CASE] Cleared completed case context');
    }
    
    // 0.5. Lock player in courthouse during initialization
    if (typeof caseInitializationLock !== 'undefined') {
        caseInitializationLock = true;
        console.log('[CASE] Locked player in courthouse during initialization');
    }
    
    // Find and enter courthouse if not already inside
    let courthouse = null;
    if (typeof gameObjects !== 'undefined') {
        for (let obj of gameObjects) {
            if (obj.isBuilding && obj.buildingType === 'court') {
                courthouse = obj;
                break;
            }
        }
    }
    
    // Enter courthouse if found and player is not already in it
    if (courthouse) {
        // Check if player is already in the courthouse interior
        let isInCourthouse = false;
        if (typeof currentInterior !== 'undefined' && currentInterior) {
            // Check if current interior belongs to courthouse
            if (courthouse.interior === currentInterior) {
                isInCourthouse = true;
            }
        }
        
        if (!isInCourthouse) {
            // Enter the courthouse
            if (typeof EnterInterior !== 'undefined') {
                console.log('[CASE] Entering courthouse for case initialization');
                EnterInterior(courthouse);
            }
        } else {
            console.log('[CASE] Player already in courthouse');
        }
    } else {
        console.warn('[CASE] Courthouse not found, cannot lock player');
    }
    
    // 1. Generate new judge persona
    GenerateJudgePersona();
    
    // 2. Get random unused case
    const caseFileName = await GetRandomUnusedCase();
    if (!caseFileName) {
        console.error('No case file available');
        // Unlock player on early return
        if (typeof caseInitializationLock !== 'undefined') {
            caseInitializationLock = false;
            console.log('[CASE] Unlocked player - no case file available');
        }
        return null;
    }
    
    // 3. Load case data
    const caseData = await LoadCaseData(caseFileName);
    if (!caseData) {
        console.error('Failed to load case data');
        // Unlock player on early return
        if (typeof caseInitializationLock !== 'undefined') {
            caseInitializationLock = false;
            console.log('[CASE] Unlocked player - failed to load case data');
        }
        return null;
    }
    
    // 4. Parse case to extract individuals and evidence
    const parsed = await ParseCase(caseData);
    const individuals = parsed.individuals || [];
    const evidence = parsed.evidence || [];
    
    if (individuals.length === 0) {
        console.warn('No individuals found in case');
    }
    
    // 5. Assign NPCs to roles
    const witnesses = await AssignNPCsToRoles(individuals);
    if (witnesses.length === 0) {
        console.warn('No witnesses assigned');
    }
    
    // 6. Schedule witness events (Tue-Fri)
    ScheduleWitnessEvents(witnesses);
    
    // 7. Distribute evidence to witnesses
    await DistributeEvidenceToWitnesses(witnesses, evidence, individuals);
    
    // 8. Generate case summary
    const caseSummary = await GenerateCaseSummary(caseData, individuals, witnesses);
    
    // 9. Create case file item
    const caseFileItem = CreateCaseFileItem(caseSummary, witnesses, currentCaseNumber);
    
    // 10. Add case file to player inventory
    if (typeof playerData !== 'undefined' && playerData.inventory) {
        if (playerData.inventory.length < 16) {
            playerData.inventory.push(caseFileItem);
            
            // Save game state
            if (typeof SaveGameState === 'function') {
                SaveGameState();
            }
        } else {
            console.warn('Inventory is full! Cannot add case file.');
        }
    }
    
    // 11. Schedule Friday Judgement event
    ScheduleFridayJudgement();
    
    // 12. Store active case data
    activeCase = {
        caseFileName: caseFileName,
        caseData: caseData,
        individuals: individuals,
        evidence: evidence,
        witnesses: witnesses,
        caseSummary: caseSummary,
        caseNumber: currentCaseNumber
    };
    
    // Increment case number for next case
    currentCaseNumber++;
    
    console.log(`Case initialized: ${caseFileName}, ${witnesses.length} witnesses`);
    
    // Unlock player after initialization completes
    if (typeof caseInitializationLock !== 'undefined') {
        caseInitializationLock = false;
        console.log('[CASE] Unlocked player from courthouse after initialization');
    }
    
    return activeCase;
}

// Get active case
function GetActiveCase() {
    return activeCase;
}

// Clear active case (when case is completed)
function ClearActiveCase() {
    activeCase = null;
}

///////////////////////////////////////////////////////////////////////////////
// Witness Event Scheduling

// Schedule events for witnesses (Tue-Fri based on count)
function ScheduleWitnessEvents(witnesses) {
    if (!witnesses || witnesses.length === 0) {
        return;
    }
    
    if (!gameTime) {
        console.warn('Cannot schedule witness events: gameTime not available');
        return;
    }
    
    // Days: 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday
    const daysOfWeek = [2, 3, 4, 5]; // Tue, Wed, Thu, Fri
    const maxWitnesses = Math.min(witnesses.length, 4);
    
    // Calculate current date
    let currentYear = typeof GetCurrentYear !== 'undefined' ? GetCurrentYear(gameTime) : (gameTime.daysElapsed >= 0 ? 1 : 0);
    let currentMonth = gameTime.month;
    let currentDay = gameTime.dayOfMonth;
    let currentDayOfWeek = gameTime.dayOfWeek;
    
    // Find next Tuesday (day 2)
    let daysUntilTuesday = (2 - currentDayOfWeek + 7) % 7;
    if (daysUntilTuesday === 0) daysUntilTuesday = 7; // If today is Tuesday, get next Tuesday
    
    for (let i = 0; i < maxWitnesses; i++) {
        const witness = witnesses[i];
        const targetDayOfWeek = daysOfWeek[i];
        
        // Calculate days until target day
        let daysUntilTarget = (targetDayOfWeek - currentDayOfWeek + 7) % 7;
        if (daysUntilTarget === 0) daysUntilTarget = 7;
        
        let targetDay = currentDay + daysUntilTarget;
        let targetMonth = currentMonth;
        let targetYear = currentYear;
        
        // Handle month rollover
        if (targetDay > 28) {
            targetDay -= 28;
            targetMonth++;
            if (targetMonth > 12) {
                targetMonth = 1;
                targetYear++;
            }
        }
        
        // Verify NPC exists and has addresses
        if (!witness.npc || !witness.npc.surname) {
            console.warn(`Cannot schedule event for invalid witness`);
            continue;
        }
        
        const houseAddress = witness.npc.houseAddress || null;
        const workAddress = witness.npc.workAddress || null;
        
        // Create calendar event
        CreateCalendarEvent(
            targetYear,
            targetMonth,
            targetDay,
            witness.npc.surname,
            houseAddress,
            workAddress,
            'witnessMeeting'
        );
        
        console.log(`Scheduled witness meeting: ${witness.npc.surname} on ${GetDayName(targetDayOfWeek)}`);
    }
}

// Helper to get day name
function GetDayName(dayOfWeek) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek] || 'Unknown';
}

///////////////////////////////////////////////////////////////////////////////
// Friday Judgement Event

// Schedule Friday Judgement event
function ScheduleFridayJudgement() {
    if (!gameTime) {
        console.warn('Cannot schedule Friday Judgement: gameTime not available');
        return;
    }
    
    // Calculate next Friday
    let currentYear = typeof GetCurrentYear !== 'undefined' ? GetCurrentYear(gameTime) : (gameTime.daysElapsed >= 0 ? 1 : 0);
    let currentMonth = gameTime.month;
    let currentDay = gameTime.dayOfMonth;
    let currentDayOfWeek = gameTime.dayOfWeek;
    
    // Calculate days until Friday (day 5)
    let daysUntilFriday = (5 - currentDayOfWeek + 7) % 7;
    if (daysUntilFriday === 0) daysUntilFriday = 7; // If today is Friday, get next Friday
    
    let targetDay = currentDay + daysUntilFriday;
    let targetMonth = currentMonth;
    let targetYear = currentYear;
    
    // Handle month rollover
    if (targetDay > 28) {
        targetDay -= 28;
        targetMonth++;
        if (targetMonth > 12) {
            targetMonth = 1;
            targetYear++;
        }
    }
    
    // Find courthouse building
    let courthouse = null;
    if (typeof gameObjects !== 'undefined') {
        for (let obj of gameObjects) {
            if (obj.isBuilding && obj.buildingType === 'court') {
                courthouse = obj;
                break;
            }
        }
    }
    
    const courthouseAddress = courthouse ? courthouse.address : null;
    
    // Create calendar event (no NPC, just location)
    CreateCalendarEvent(
        targetYear,
        targetMonth,
        targetDay,
        null, // No NPC for judgement
        null,
        courthouseAddress, // Work address is courthouse
        'fridayJudgement'
    );
    
    console.log(`Scheduled Friday Judgement for ${targetMonth}/${targetDay}/${targetYear}`);
}

///////////////////////////////////////////////////////////////////////////////
// Session ID helper (if not available globally)

function getSessionId() {
    if (typeof GetSessionId === 'function') {
        return GetSessionId();
    }
    // Fallback: try to get from session.js or return default
    if (typeof sessionId !== 'undefined') {
        return sessionId;
    }
    return 'default';
}

///////////////////////////////////////////////////////////////////////////////
// Banished NPCs Management

// Check if NPC is banished
function IsNPCBanished(surname) {
    return banishedNPCs.includes(surname);
}

// Get list of banished NPCs
function GetBanishedNPCs() {
    return banishedNPCs.slice(); // Return copy
}

// Banish an NPC (permanently remove from game)
function BanishNPC(surname) {
    if (!surname || IsNPCBanished(surname)) {
        return; // Already banished or invalid
    }
    
    console.log(`Banishing NPC: ${surname}`);
    
    // Add to banished list
    banishedNPCs.push(surname);
    
    // Remove from allNPCs
    if (typeof allNPCs !== 'undefined') {
        allNPCs = allNPCs.filter(npc => npc.surname !== surname);
    }
    
    // Remove from gameObjects
    if (typeof gameObjects !== 'undefined') {
        gameObjects = gameObjects.filter(obj => {
            if (obj.isNPC && obj.surname === surname) return false;
            if (obj.isJudge && obj.surname === surname) return false;
            return true;
        });
    }
    
    // Remove from interiors (courthouse judge, home NPCs, etc.)
    if (typeof gameObjects !== 'undefined') {
        for (let obj of gameObjects) {
            if (obj.isBuilding && obj.interior) {
                // Remove judge if it's the banished NPC
                if (obj.interior.judge && obj.interior.judge.surname === surname) {
                    obj.interior.judge = null;
                }
                // Remove NPCs from furniture list if they're NPCs (unlikely but safe)
                if (obj.interior.furniture) {
                    obj.interior.furniture = obj.interior.furniture.filter(f => 
                        !(f.isNPC && f.surname === surname)
                    );
                }
            }
        }
    }
    
    // Remove calendar events for this NPC
    if (typeof calendarEvents !== 'undefined') {
        calendarEvents = calendarEvents.filter(e => e.npcSurname !== surname);
    }
    
    // Save game state
    if (typeof SaveGameState === 'function') {
        SaveGameState();
    }
}

// Execute punishments from judgment decision
async function ExecutePunishments(punishments) {
    if (!punishments || punishments.length === 0) {
        return;
    }
    
    const sessionId = getSessionId();
    
    for (const punishment of punishments) {
        // Support both "witnessSurname" (old) and "npcSurname" (new) for backwards compatibility
        const npcSurname = punishment.npcSurname || punishment.witnessSurname;
        const punishmentType = punishment.punishmentType;
        const reason = punishment.reason || '';
        
        if (!npcSurname) continue;
        
        // Check if NPC exists (not just witnesses, but any NPC)
        const npc = typeof GetNPCBySurname !== 'undefined' ? GetNPCBySurname(npcSurname) : null;
        if (!npc && !IsNPCBanished(npcSurname)) {
            console.warn(`[JUDGMENT] NPC ${npcSurname} not found for punishment`);
            continue;
        }
        
        if (punishmentType === 'corporeal') {
            // Add known fact about brutal punishment
            try {
                const factContent = reason 
                    ? `${npcSurname} has been brutally punished by the court. ${reason}`
                    : `${npcSurname} has been brutally punished by the court for their actions and should feel terrible about it.`;
                
                const response = await fetch(`/api/npc/gossip/add-fact/${encodeURIComponent(npcSurname)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        fact: {
                            id: `punishment_${Date.now()}_${Math.random()}`,
                            content: factContent,
                            source: 'court',
                            learnedFrom: 'court',
                            timestamp: Date.now(),
                            type: 'punishment'
                        }
                    })
                });
                
                if (!response.ok) {
                    console.warn(`Failed to add punishment fact to ${npcSurname}`);
                } else {
                    console.log(`[JUDGMENT] Applied corporeal punishment to ${npcSurname}`);
                }
            } catch (error) {
                console.error(`Error applying corporeal punishment to ${npcSurname}:`, error);
            }
        } else if (punishmentType === 'banishment' || punishmentType === 'death') {
            // Permanently banish NPC (death is same as banishment)
            BanishNPC(npcSurname);
            console.log(`[JUDGMENT] ${punishmentType === 'death' ? 'Sentenced to death' : 'Banned'} NPC ${npcSurname} from the game${reason ? ` - ${reason}` : ''}`);
        }
    }
}

// Execute job changes from judgment decision
async function ExecuteJobChanges(jobChanges) {
    if (!jobChanges || jobChanges.length === 0) {
        return;
    }
    
    const sessionId = getSessionId();
    
    for (const change of jobChanges) {
        const { npcSurname, newJob, reason } = change;
        
        if (!npcSurname || !newJob) {
            console.warn('[JUDGMENT] Invalid job change entry:', change);
            continue;
        }
        
        // Find NPC and update job
        const npc = typeof GetNPCBySurname !== 'undefined' ? GetNPCBySurname(npcSurname) : null;
        if (npc) {
            const oldJob = npc.job || 'unemployed';
            npc.job = newJob;
            console.log(`[JUDGMENT] Changed ${npcSurname}'s job from "${oldJob}" to "${newJob}"${reason ? ` - ${reason}` : ''}`);
            
            // Update job on server (conversation metadata)
            try {
                const response = await fetch(`/api/npc/update-job/${encodeURIComponent(npcSurname)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        job: newJob
                    })
                });
                
                if (!response.ok) {
                    console.warn(`Failed to update job on server for ${npcSurname}`);
                } else {
                    console.log(`[JUDGMENT] Updated job on server for ${npcSurname}`);
                }
            } catch (error) {
                console.error(`Error updating job on server for ${npcSurname}:`, error);
            }
        } else {
            console.warn(`[JUDGMENT] NPC ${npcSurname} not found for job change`);
        }
    }
    
    // Save game state after all job changes
    if (typeof SaveGameState === 'function') {
        SaveGameState();
    }
}

// Execute name changes from judgment decision
async function ExecuteNameChanges(nameChanges) {
    if (!nameChanges || nameChanges.length === 0) {
        return;
    }
    
    const sessionId = getSessionId();
    
    for (const change of nameChanges) {
        const { npcSurname, newName, reason } = change;
        
        if (!npcSurname || !newName) {
            console.warn('[JUDGMENT] Invalid name change entry:', change);
            continue;
        }
        
        // Find NPC and update surname
        const npc = typeof GetNPCBySurname !== 'undefined' ? GetNPCBySurname(npcSurname) : null;
        if (npc) {
            const oldSurname = npc.surname;
            npc.surname = newName;
            console.log(`[JUDGMENT] Changed ${oldSurname}'s name to "${newName}"${reason ? ` - ${reason}` : ''}`);
            
            // Update name on server (conversation file)
            try {
                const response = await fetch(`/api/npc/update-name/${encodeURIComponent(oldSurname)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        newName: newName
                    })
                });
                
                if (!response.ok) {
                    console.warn(`Failed to update name on server for ${oldSurname}`);
                } else {
                    console.log(`[JUDGMENT] Updated name on server: ${oldSurname} -> ${newName}`);
                }
            } catch (error) {
                console.error(`Error updating name on server for ${oldSurname}:`, error);
            }
        } else {
            console.warn(`[JUDGMENT] NPC ${npcSurname} not found for name change`);
        }
    }
    
    // Save game state after all name changes
    if (typeof SaveGameState === 'function') {
        SaveGameState();
    }
}

///////////////////////////////////////////////////////////////////////////////
// Friday Judgment Processing

// Get 10 random NPCs with known facts (excluding banished NPCs)
async function GetRandomNPCsWithFacts(count = 10) {
    if (!allNPCs || allNPCs.length === 0) {
        return [];
    }
    
    const sessionId = getSessionId();
    const availableNPCs = allNPCs.filter(npc => npc && npc.surname && !IsNPCBanished(npc.surname));
    
    // Fetch facts for each NPC
    const npcsWithFacts = [];
    for (const npc of availableNPCs) {
        try {
            const response = await fetch(`/api/npc/gossip/facts/${encodeURIComponent(npc.surname)}?sessionId=${encodeURIComponent(sessionId)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.knownFacts && data.knownFacts.length > 0) {
                    npcsWithFacts.push({
                        surname: npc.surname,
                        facts: data.knownFacts
                    });
                }
            }
        } catch (error) {
            console.error(`Error fetching facts for ${npc.surname}:`, error);
        }
    }
    
    // Randomly select up to 'count' NPCs
    const selected = [];
    const shuffled = npcsWithFacts.slice();
    
    // Shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Collect all evidence from player inventory (recordings and documents)
function CollectEvidenceFromInventory() {
    if (!playerData || !playerData.inventory) {
        return [];
    }
    
    const evidence = [];
    for (const item of playerData.inventory) {
        // Collect evidence_ type items (recordings) and document_ type items (documents)
        // Exclude case files and other non-evidence items
        if (item.type && 
            item.metadata &&
            (item.type.startsWith('evidence_') || item.type.startsWith('document_'))) {
            evidence.push({
                name: item.name || 'Unnamed Evidence',
                metadata: item.metadata
            });
        }
    }
    
    return evidence;
}

// Collect recording and document evidence from player inventory (for claims)
function CollectRecordingEvidenceFromInventory() {
    if (!playerData || !playerData.inventory) {
        return [];
    }
    
    const evidence = [];
    for (const item of playerData.inventory) {
        // Collect evidence_ type items (recordings) and document_ type items (documents)
        // Exclude judgment_, casefile_, claim_ items
        if (item.type && 
            item.metadata &&
            (item.type.startsWith('evidence_') || item.type.startsWith('document_')) &&
            !item.type.startsWith('judgment_') &&
            !item.type.startsWith('casefile_') &&
            !item.type.startsWith('claim_')) {
            evidence.push({
                name: item.name || 'Unnamed Evidence',
                metadata: item.metadata
            });
        }
    }
    
    return evidence;
}

// Collect all evidence including recordings, documents, and casefiles (for automatic claims)
function CollectAllEvidenceFromInventory() {
    if (!playerData || !playerData.inventory) {
        return [];
    }
    
    const evidence = [];
    for (const item of playerData.inventory) {
        // Collect evidence_ (recordings), document_ (documents), and casefile_ (casefiles)
        // Exclude judgment_ and claim_ items
        if (item.type && 
            item.metadata &&
            (item.type.startsWith('evidence_') || 
             item.type.startsWith('document_') || 
             item.type.startsWith('casefile_')) &&
            !item.type.startsWith('judgment_') &&
            !item.type.startsWith('claim_')) {
            evidence.push({
                name: item.name || 'Unnamed Evidence',
                metadata: item.metadata
            });
        }
    }
    
    return evidence;
}

// Collect bonuses from inventory (credibility, countersuit, exculpation)
function CollectBonusesFromInventory() {
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

// Consume all bonuses from inventory
function ConsumeBonusesFromInventory() {
    if (!playerData || !playerData.inventory) {
        return;
    }
    
    // Remove all bonus items
    playerData.inventory = playerData.inventory.filter(item => {
        return item.type !== 'credibility' && 
               item.type !== 'countersuit' && 
               item.type !== 'exculpation';
    });
    
    // Save game state after consuming
    if (typeof SaveGameState === 'function') {
        SaveGameState();
    }
}

// Process Friday Judgment (called when player submits statement or event is missed)
async function ProcessFridayJudgment(playerStatement, isMissedEvent = false) {
    console.log(`[JUDGMENT] ProcessFridayJudgment called. Statement length: ${playerStatement ? playerStatement.length : 0}, Missed: ${isMissedEvent}`);
    
    const activeCase = GetActiveCase();
    
    if (!activeCase) {
        console.error('[JUDGMENT] No active case for Friday Judgment');
        return null;
    }
    
    console.log(`[JUDGMENT] Active case found. Summary: ${activeCase.caseSummary ? activeCase.caseSummary.substring(0, 50) + '...' : 'N/A'}`);
    
    try {
        // Show loading notification
        if (typeof ShowLoadingNotification !== 'undefined') {
            ShowLoadingNotification('Judge is thinking...');
        }
        
        console.log('[JUDGMENT] Step 1: Getting NPCs with facts for prosecution');
        
        const sessionId = getSessionId();
        
        // 1. Get 10 random NPCs with facts for prosecution
        const npcsWithFacts = await GetRandomNPCsWithFacts(10);
        const npcSurnames = npcsWithFacts.map(n => n.surname);
        console.log(`[JUDGMENT] Step 1 complete. Found ${npcsWithFacts.length} NPCs with facts`);
        
        // 2. Generate prosecution
        let prosecution = '';
        if (npcsWithFacts.length > 0) {
            try {
                console.log('[JUDGMENT] Step 2: Generating prosecution');
                const prosecutionResponse = await fetch(`/api/cases/prosecution?sessionId=${encodeURIComponent(sessionId)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        caseSummary: activeCase.caseSummary,
                        npcSurnames: npcSurnames,
                        sessionId: sessionId
                    })
                });
                
                if (prosecutionResponse.ok) {
                    const prosecutionData = await prosecutionResponse.json();
                    prosecution = prosecutionData.prosecution || '';
                    console.log(`[JUDGMENT] Step 2 complete. Prosecution length: ${prosecution.length}`);
                }
            } catch (error) {
                console.error('[JUDGMENT] Error generating prosecution:', error);
            }
        }
        
        // 3. Collect and consume bonuses from inventory (must happen before judgment)
        console.log('[JUDGMENT] Step 3: Collecting and consuming bonuses from inventory');
        const bonuses = CollectBonusesFromInventory();
        console.log(`[JUDGMENT] Step 3: Bonuses found - Circumstantial Evidence: ${bonuses.credibility}, Direct Evidence: ${bonuses.countersuit}, Exculpation: ${bonuses.exculpation}`);
        
        // Consume all bonuses immediately on submission
        ConsumeBonusesFromInventory();
        console.log('[JUDGMENT] Step 3: All bonuses consumed from inventory');
        
        // 4. Collect evidence from inventory
        console.log('[JUDGMENT] Step 4: Collecting evidence from inventory');
        const evidence = CollectEvidenceFromInventory();
        console.log(`[JUDGMENT] Step 4 complete. Evidence items: ${evidence ? evidence.length : 0}`);
        
        // 5. Get judge persona
        console.log('[JUDGMENT] Step 5: Getting judge persona');
        const judgePersona = GetJudgePersona();
        console.log(`[JUDGMENT] Step 5 complete. Judge: ${judgePersona ? judgePersona.name : 'N/A'}`);
        
        // 6. Get witnesses list
        console.log('[JUDGMENT] Step 6: Getting witnesses list');
        const witnesses = activeCase.witnesses.map(w => ({
            surname: w.npc.surname,
            role: w.role
        }));
        console.log(`[JUDGMENT] Step 6 complete. Witnesses: ${witnesses.length}`);
        
        // 6.5. Get all NPCs list (for judge powers)
        console.log('[JUDGMENT] Step 6.5: Getting all NPCs list');
        let allNPCsList = [];
        if (typeof allNPCs !== 'undefined' && Array.isArray(allNPCs)) {
            // Filter out banished NPCs and get NPC info
            allNPCsList = allNPCs
                .filter(npc => npc && npc.surname && !IsNPCBanished(npc.surname))
                .map(npc => ({
                    surname: npc.surname,
                    job: npc.job || 'unemployed'
                }));
        }
        console.log(`[JUDGMENT] Step 6.5 complete. All NPCs: ${allNPCsList.length}`);
        
        // 7. Judge makes decision
        console.log('[JUDGMENT] Step 7: Sending judgment request to server');
        const judgmentResponse = await fetch('/api/cases/judgment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                caseSummary: activeCase.caseSummary,
                prosecution: prosecution,
                playerStatement: playerStatement || '',
                evidence: evidence,
                witnesses: witnesses,
                judgePersona: judgePersona,
                bonuses: bonuses,
                isMissedEvent: isMissedEvent,
                allNPCs: allNPCsList
            })
        });
        
        if (!judgmentResponse.ok) {
            throw new Error('Failed to get judgment decision');
        }
        
        const judgmentData = await judgmentResponse.json();
        const { playerWins, playerReprimanded, playerDisbarred, coinsAwarded, punishments, jobChanges, nameChanges, ruling } = judgmentData;
        console.log(`[JUDGMENT] Step 7 complete. Player wins: ${playerWins}, Reprimanded: ${playerReprimanded}, Disbarred: ${playerDisbarred}, Coins awarded: ${coinsAwarded || 0}, Punishments: ${punishments ? punishments.length : 0}, Job changes: ${jobChanges ? jobChanges.length : 0}, Name changes: ${nameChanges ? nameChanges.length : 0}`);
        
        // 8. Handle player reprimand (deduct $20)
        if (playerReprimanded && typeof playerData !== 'undefined') {
            const oldCoins = playerData.coins || 0;
            playerData.coins = Math.max(0, oldCoins - 20);
            console.log(`[JUDGMENT] Step 8: Player reprimanded. Deducted $20. Old: $${oldCoins}, New: $${playerData.coins}`);
            if (typeof SaveGameState === 'function') {
                SaveGameState();
            }
        }
        
        // 9. Handle player disbarment (game over)
        if (playerDisbarred) {
            console.log('[JUDGMENT] Step 9: Player disbarred - triggering game over');
            // Trigger game over after showing the ruling
            // We'll set a flag and handle it after the ruling modal
        }
        
        // 10. Execute punishments
        if (punishments && punishments.length > 0) {
            console.log(`[JUDGMENT] Step 10: Executing ${punishments.length} punishments`);
            await ExecutePunishments(punishments);
            console.log('[JUDGMENT] Step 10 complete');
        } else {
            console.log('[JUDGMENT] Step 10: No punishments to execute');
        }
        
        // 11. Execute job changes
        if (jobChanges && jobChanges.length > 0) {
            console.log(`[JUDGMENT] Step 11: Executing ${jobChanges.length} job changes`);
            await ExecuteJobChanges(jobChanges);
            console.log('[JUDGMENT] Step 11 complete');
        } else {
            console.log('[JUDGMENT] Step 11: No job changes to execute');
        }
        
        // 11.5. Execute name changes
        if (nameChanges && nameChanges.length > 0) {
            console.log(`[JUDGMENT] Step 11.5: Executing ${nameChanges.length} name changes`);
            await ExecuteNameChanges(nameChanges);
            console.log('[JUDGMENT] Step 11.5 complete');
        } else {
            console.log('[JUDGMENT] Step 11.5: No name changes to execute');
        }
        
        // 12. Add coins awarded by judge (if any)
        const awardAmount = coinsAwarded || 0;
        if (awardAmount > 0 && typeof playerData !== 'undefined') {
            const oldCoins = playerData.coins || 0;
            playerData.coins = oldCoins + awardAmount;
            console.log(`[JUDGMENT] Step 12: Added $${awardAmount} coins from judge. Old: $${oldCoins}, New: $${playerData.coins}`);
            if (typeof SaveGameState === 'function') {
                SaveGameState();
            }
        } else {
            console.log(`[JUDGMENT] Step 12: No coins awarded from judge (amount: ${awardAmount})`);
        }
        
        // 13. Add automatic $20 win bonus if player won the case
        if (playerWins && typeof playerData !== 'undefined') {
            const oldCoins = playerData.coins || 0;
            playerData.coins = oldCoins + 20;
            console.log(`[JUDGMENT] Step 13: Player won case - added $20 win bonus. Old: $${oldCoins}, New: $${playerData.coins}`);
            if (typeof SaveGameState === 'function') {
                SaveGameState();
            }
        } else if (playerWins) {
            console.log(`[JUDGMENT] Step 13: Player won case but playerData not available - cannot award $20 win bonus`);
        }
        
        // Hide loading notification
        if (typeof HideLoadingNotification !== 'undefined') {
            HideLoadingNotification();
        }
        
        // Calculate total coins awarded (judge award + win bonus)
        const totalCoinsAwarded = awardAmount + (playerWins ? 20 : 0);
        
        const result = {
            playerWins: playerWins,
            playerReprimanded: playerReprimanded || false,
            playerDisbarred: playerDisbarred || false,
            punishments: punishments || [],
            jobChanges: jobChanges || [],
            nameChanges: nameChanges || [],
            ruling: ruling || 'The judge has made a decision.',
            coinsAwarded: totalCoinsAwarded,
            prosecution: prosecution || ''
        };
        
        console.log('[JUDGMENT] ProcessFridayJudgment complete. Returning result');
        return result;
        
    } catch (error) {
        console.error('[JUDGMENT] Error processing Friday Judgment:', error);
        
        // Hide loading notification
        if (typeof HideLoadingNotification !== 'undefined') {
            HideLoadingNotification();
        }
        
        return null;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Claim Processing

// Process an automatic claim (called when player confirms they want to file a claim)
// The judge automatically reads all evidence and makes a decision
async function ProcessAutomaticClaim() {
    console.log('[CLAIM] ProcessAutomaticClaim called - processing claim automatically');
    
    try {
        // Show loading notification
        if (typeof ShowLoadingNotification !== 'undefined') {
            ShowLoadingNotification('Judge is reviewing your claim and evidence...');
        }
        
        const sessionId = getSessionId();
        
        // 1. Collect all evidence from inventory (recordings, documents, and casefiles)
        console.log('[CLAIM] Step 1: Collecting all evidence from inventory');
        const evidence = CollectAllEvidenceFromInventory();
        console.log(`[CLAIM] Step 1 complete. Evidence items: ${evidence ? evidence.length : 0}`);
        
        // 2. Collect and consume bonuses from inventory
        console.log('[CLAIM] Step 2: Collecting and consuming bonuses from inventory');
        const bonuses = CollectBonusesFromInventory();
        console.log(`[CLAIM] Step 2: Bonuses found - Circumstantial Evidence: ${bonuses.credibility}, Direct Evidence: ${bonuses.countersuit}, Exculpation: ${bonuses.exculpation}`);
        
        // Consume all bonuses immediately
        ConsumeBonusesFromInventory();
        console.log('[CLAIM] Step 2: All bonuses consumed from inventory');
        
        // 3. Get judge persona
        console.log('[CLAIM] Step 3: Getting judge persona');
        const judgePersona = GetJudgePersona();
        console.log(`[CLAIM] Step 3 complete. Judge: ${judgePersona ? judgePersona.name : 'N/A'}`);
        
        // 4. Get completed case context (required for claims)
        let completedCase = null;
        if (typeof completedCaseContext !== 'undefined' && completedCaseContext) {
            completedCase = completedCaseContext;
            console.log('[CLAIM] Step 4: Found completed case context');
        } else {
            console.log('[CLAIM] Step 4: No completed case context available - this should not happen for claims');
        }
        
        // 5. Get all NPCs list (for judge powers)
        console.log('[CLAIM] Step 5: Getting all NPCs list');
        let allNPCsList = [];
        if (typeof allNPCs !== 'undefined' && Array.isArray(allNPCs)) {
            // Filter out banished NPCs and get NPC info
            allNPCsList = allNPCs
                .filter(npc => npc && npc.surname && !IsNPCBanished(npc.surname))
                .map(npc => ({
                    surname: npc.surname,
                    job: npc.job || 'unemployed'
                }));
        }
        console.log(`[CLAIM] Step 5 complete. All NPCs: ${allNPCsList.length}`);
        
        // 6. Judge makes decision (no claim description or desired outcome - judge reads evidence and decides)
        console.log('[CLAIM] Step 6: Sending automatic claim judgment request to server');
        const claimResponse = await fetch('/api/claims/judgment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                evidence: evidence,
                bonuses: bonuses,
                completedCaseContext: completedCase,
                judgePersona: judgePersona,
                allNPCs: allNPCsList
            })
        });
        
        if (!claimResponse.ok) {
            throw new Error('Failed to get claim judgment decision');
        }
        
        const claimData = await claimResponse.json();
        const { claimGranted, playerReprimanded, playerDisbarred, coinsAwarded, punishments, jobChanges, nameChanges, ruling } = claimData;
        console.log(`[CLAIM] Step 6 complete. Claim granted: ${claimGranted}, Reprimanded: ${playerReprimanded}, Disbarred: ${playerDisbarred}, Coins awarded: ${coinsAwarded || 0}, Punishments: ${punishments ? punishments.length : 0}, Job changes: ${jobChanges ? jobChanges.length : 0}, Name changes: ${nameChanges ? nameChanges.length : 0}`);
        
        // 7. Handle player reprimand (deduct $20)
        if (playerReprimanded && typeof playerData !== 'undefined') {
            const oldCoins = playerData.coins || 0;
            playerData.coins = Math.max(0, oldCoins - 20);
            console.log(`[CLAIM] Step 7: Player reprimanded. Deducted $20. Old: $${oldCoins}, New: $${playerData.coins}`);
            if (typeof SaveGameState === 'function') {
                SaveGameState();
            }
        }
        
        // 8. Handle player disbarment (game over)
        if (playerDisbarred) {
            console.log('[CLAIM] Step 8: Player disbarred - triggering game over');
            // Trigger game over after showing the ruling
        }
        
        // 9. Execute punishments
        if (punishments && punishments.length > 0) {
            console.log(`[CLAIM] Step 9: Executing ${punishments.length} punishments`);
            await ExecutePunishments(punishments);
            console.log('[CLAIM] Step 9 complete');
        } else {
            console.log('[CLAIM] Step 9: No punishments to execute');
        }
        
        // 10. Execute job changes
        if (jobChanges && jobChanges.length > 0) {
            console.log(`[CLAIM] Step 10: Executing ${jobChanges.length} job changes`);
            await ExecuteJobChanges(jobChanges);
            console.log('[CLAIM] Step 10 complete');
        } else {
            console.log('[CLAIM] Step 10: No job changes to execute');
        }
        
        // 11. Execute name changes
        if (nameChanges && nameChanges.length > 0) {
            console.log(`[CLAIM] Step 11: Executing ${nameChanges.length} name changes`);
            await ExecuteNameChanges(nameChanges);
            console.log('[CLAIM] Step 11 complete');
        } else {
            console.log('[CLAIM] Step 11: No name changes to execute');
        }
        
        // 12. Add coins awarded by judge (if any)
        const awardAmount = coinsAwarded || 0;
        if (awardAmount > 0 && typeof playerData !== 'undefined') {
            const oldCoins = playerData.coins || 0;
            playerData.coins = oldCoins + awardAmount;
            console.log(`[CLAIM] Step 12: Added $${awardAmount} coins. Old: $${oldCoins}, New: $${playerData.coins}`);
            if (typeof SaveGameState === 'function') {
                SaveGameState();
            }
        } else {
            console.log(`[CLAIM] Step 12: No coins awarded (amount: ${awardAmount})`);
        }
        
        // Hide loading notification
        if (typeof HideLoadingNotification !== 'undefined') {
            HideLoadingNotification();
        }
        
        // Convert claim result to judgment format for compatibility with judgment modal
        const result = {
            playerWins: claimGranted || false, // Use claimGranted as playerWins for judgment modal
            playerReprimanded: playerReprimanded || false,
            playerDisbarred: playerDisbarred || false,
            punishments: punishments || [],
            jobChanges: jobChanges || [],
            nameChanges: nameChanges || [],
            ruling: ruling || 'The judge has made a decision.',
            coinsAwarded: awardAmount,
            isClaim: true // Flag to indicate this is a claim judgment
        };
        
        console.log('[CLAIM] ProcessAutomaticClaim complete. Returning result');
        return result;
        
    } catch (error) {
        console.error('[CLAIM] Error processing automatic claim:', error);
        
        // Hide loading notification
        if (typeof HideLoadingNotification !== 'undefined') {
            HideLoadingNotification();
        }
        
        return null;
    }
}


