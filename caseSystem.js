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
async function DistributeEvidenceToWitnesses(witnesses, evidence) {
    if (!witnesses || witnesses.length === 0 || !evidence || evidence.length === 0) {
        return;
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
                const response = await fetch(`/api/npc/gossip/add-fact/${encodeURIComponent(witness.npc.surname)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        fact: {
                            id: `case_evidence_${Date.now()}_${Math.random()}`,
                            content: factText,
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
    
    // 1. Generate new judge persona
    GenerateJudgePersona();
    
    // 2. Get random unused case
    const caseFileName = await GetRandomUnusedCase();
    if (!caseFileName) {
        console.error('No case file available');
        return null;
    }
    
    // 3. Load case data
    const caseData = await LoadCaseData(caseFileName);
    if (!caseData) {
        console.error('Failed to load case data');
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
    await DistributeEvidenceToWitnesses(witnesses, evidence);
    
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
        const { witnessSurname, punishmentType } = punishment;
        
        if (!witnessSurname) continue;
        
        if (punishmentType === 'corporeal') {
            // Add known fact about brutal punishment
            try {
                const response = await fetch(`/api/npc/gossip/add-fact/${encodeURIComponent(witnessSurname)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        fact: {
                            id: `punishment_${Date.now()}_${Math.random()}`,
                            content: 'You have been brutally punished by the court for your testimony and should feel terrible about your actions in this case.',
                            source: 'court',
                            learnedFrom: 'court',
                            timestamp: Date.now(),
                            type: 'punishment'
                        }
                    })
                });
                
                if (!response.ok) {
                    console.warn(`Failed to add punishment fact to ${witnessSurname}`);
                } else {
                    console.log(`Applied corporeal punishment to ${witnessSurname}`);
                }
            } catch (error) {
                console.error(`Error applying corporeal punishment to ${witnessSurname}:`, error);
            }
        } else if (punishmentType === 'banishment') {
            // Permanently banish NPC
            BanishNPC(witnessSurname);
            console.log(`Banned NPC ${witnessSurname} from the game`);
        }
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

// Collect all evidence from player inventory
function CollectEvidenceFromInventory() {
    if (!playerData || !playerData.inventory) {
        return [];
    }
    
    const evidence = [];
    for (const item of playerData.inventory) {
        // Only collect evidence items (not case files)
        if (item.type && item.type.startsWith('evidence_') && item.metadata) {
            evidence.push({
                name: item.name || 'Unnamed Evidence',
                metadata: item.metadata
            });
        }
    }
    
    return evidence;
}

// Process Friday Judgment (called when player submits statement or event is missed)
async function ProcessFridayJudgment(playerStatement, isMissedEvent = false) {
    const activeCase = GetActiveCase();
    
    if (!activeCase) {
        console.error('No active case for Friday Judgment');
        return null;
    }
    
    try {
        // Show loading notification
        if (typeof ShowLoadingNotification !== 'undefined') {
            ShowLoadingNotification('Judge is thinking...');
        }
        
        const sessionId = getSessionId();
        
        // 1. Get 10 random NPCs with facts for prosecution
        const npcsWithFacts = await GetRandomNPCsWithFacts(10);
        const npcSurnames = npcsWithFacts.map(n => n.surname);
        
        // 2. Generate prosecution
        let prosecution = '';
        if (npcsWithFacts.length > 0) {
            try {
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
                }
            } catch (error) {
                console.error('Error generating prosecution:', error);
            }
        }
        
        // 3. Collect evidence from inventory
        const evidence = CollectEvidenceFromInventory();
        
        // 4. Get judge persona
        const judgePersona = GetJudgePersona();
        
        // 5. Get witnesses list
        const witnesses = activeCase.witnesses.map(w => ({
            surname: w.npc.surname,
            role: w.role
        }));
        
        // 6. Judge makes decision
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
                isMissedEvent: isMissedEvent
            })
        });
        
        if (!judgmentResponse.ok) {
            throw new Error('Failed to get judgment decision');
        }
        
        const judgmentData = await judgmentResponse.json();
        const { playerWins, punishments, ruling } = judgmentData;
        
        // 7. Execute punishments
        if (punishments && punishments.length > 0) {
            await ExecutePunishments(punishments);
        }
        
        // 8. Add coins if player won
        if (playerWins && typeof playerData !== 'undefined') {
            playerData.coins = (playerData.coins || 0) + 20;
            if (typeof SaveGameState === 'function') {
                SaveGameState();
            }
        }
        
        // Hide loading notification
        if (typeof HideLoadingNotification !== 'undefined') {
            HideLoadingNotification();
        }
        
        return {
            playerWins: playerWins,
            punishments: punishments || [],
            ruling: ruling || 'The judge has made a decision.',
            coinsAwarded: playerWins ? 20 : 0
        };
        
    } catch (error) {
        console.error('Error processing Friday Judgment:', error);
        
        // Hide loading notification
        if (typeof HideLoadingNotification !== 'undefined') {
            HideLoadingNotification();
        }
        
        return null;
    }
}

