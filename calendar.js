///////////////////////////////////////////////////////////////////////////////
// Calendar System
// Handles calendar modal, event scheduling, task system, and event completion

// Success notification
let successNotificationVisible = false;
let successNotificationTimer = new Timer();
let successNotificationText = '';

// Loading notification
let loadingNotificationVisible = false;
let loadingNotificationText = '';

// Event ID counter (for unique event IDs)
let nextEventId = 1;

///////////////////////////////////////////////////////////////////////////////
// Helper Functions

// Get current year from game time
function GetCurrentYear(gameTime)
{
    if (!gameTime)
        return 1; // Default fallback
    return gameTime.daysElapsed >= 0 ? 1 : 0;
}

///////////////////////////////////////////////////////////////////////////////
// Event Management

// Create a new event
function CreateCalendarEvent(year, month, day, npcSurname, houseAddress, workAddress, taskId = null)
{
    // Validate that the NPC actually exists before creating the event
    if (npcSurname)
    {
        let npc = GetNPCBySurname(npcSurname);
        if (!npc)
        {
            console.warn(`CreateCalendarEvent: NPC ${npcSurname} does not exist in town, skipping event creation`);
            return null;
        }
    }
    
    let event = {
        id: nextEventId++,
        year: year,
        month: month,
        day: day,
        npcSurname: npcSurname,
        houseAddress: houseAddress,
        workAddress: workAddress,
        status: 'pending', // 'pending', 'completed', 'missed'
        taskId: taskId,
        createdAt: gameTime ? gameTime.daysElapsed : 0
    };
    
    calendarEvents.push(event);
    return event;
}

// Get events for a specific date
function GetEventsForDate(year, month, day)
{
    let events = calendarEvents.filter(e => 
        e.year === year && 
        e.month === month && 
        e.day === day
    );
    
    // Filter out caseOfTheMondays events if it's Monday but before 07:02
    if (gameTime && gameTime.dayOfWeek === 1 && 
        year === GetCurrentYear(gameTime) && 
        month === gameTime.month && 
        day === gameTime.dayOfMonth)
    {
        // If it's the current Monday, check the time
        if (gameTime.gameHour < 7.02)
        {
            events = events.filter(e => e.taskId !== 'caseOfTheMondays');
        }
    }
    
    return events;
}

// Get pending events for a specific date
function GetPendingEventsForDate(year, month, day)
{
    let events = calendarEvents.filter(e => 
        e.year === year && 
        e.month === month && 
        e.day === day &&
        e.status === 'pending'
    );
    
    // Filter out caseOfTheMondays events if it's Monday but before 07:02
    if (gameTime && gameTime.dayOfWeek === 1 && 
        year === GetCurrentYear(gameTime) && 
        month === gameTime.month && 
        day === gameTime.dayOfMonth)
    {
        // If it's the current Monday, check the time
        if (gameTime.gameHour < 7.02)
        {
            events = events.filter(e => e.taskId !== 'caseOfTheMondays');
        }
    }
    
    return events;
}

// Check if date has any events
function DateHasEvents(year, month, day)
{
    return GetEventsForDate(year, month, day).length > 0;
}

// Check if date has pending events
function DateHasPendingEvents(year, month, day)
{
    return GetPendingEventsForDate(year, month, day).length > 0;
}

// Check if date has missed events (for red highlighting)
function DateHasMissedEvents(year, month, day)
{
    return calendarEvents.some(e => 
        e.year === year && 
        e.month === month && 
        e.day === day &&
        e.status === 'missed'
    );
}

// Remove event by ID
function RemoveEvent(eventId)
{
    let index = calendarEvents.findIndex(e => e.id === eventId);
    if (index !== -1)
    {
        calendarEvents.splice(index, 1);
        return true;
    }
    return false;
}

///////////////////////////////////////////////////////////////////////////////
// Event Completion Detection

// Helper function to find building by address (similar to NPC's FindBuildingByAddress)
function FindBuildingByAddress(address)
{
    if (typeof gameObjects === 'undefined')
        return null;
    
    for(let obj of gameObjects)
    {
        if (obj.isBuilding && obj.address === address)
            return obj;
    }
    return null;
}

// Helper function to get NPC by surname
function GetNPCBySurname(surname)
{
    if (typeof allNPCs === 'undefined')
        return null;
    
    return allNPCs.find(npc => npc.surname === surname);
}

// Check and complete events when player talks to NPC
function CheckAndCompleteCalendarEvents(npc, currentGameTime)
{
    if (!npc || !currentGameTime)
        return;
    
    // Get current date
    let currentYear = GetCurrentYear(currentGameTime);
    let currentMonth = currentGameTime.month;
    let currentDay = currentGameTime.dayOfMonth;
    
    // Find pending events for this NPC on current date
    let matchingEvents = calendarEvents.filter(e => 
        e.status === 'pending' &&
        e.year === currentYear &&
        e.month === currentMonth &&
        e.day === currentDay &&
        e.npcSurname === npc.surname
    );
    
    // Complete all matching events
    for (let event of matchingEvents)
    {
        event.status = 'completed';
        
        // Give reward
        GiveEventReward();
        
        // Trigger task if associated
        if (event.taskId)
        {
            TriggerTask(event.taskId);
        }
        
        // Remove completed event from calendar
        RemoveEvent(event.id);
        
        // Show success notification
        ShowSuccessNotification('Meeting Successfully Attended');
    }
}

// Validate and clean up calendar events - remove events for NPCs that no longer exist
function ValidateCalendarEvents()
{
    if (!calendarEvents || calendarEvents.length === 0)
        return;
    
    let eventsToRemove = [];
    let sundayCoffeeToReschedule = [];
    
    for (let event of calendarEvents)
    {
        // Check if event has an NPC surname
        if (event.npcSurname && event.status === 'pending')
        {
            // Verify the NPC still exists
            let npc = GetNPCBySurname(event.npcSurname);
            if (!npc)
            {
                // If it's a Sunday Coffee event, reschedule it instead of just removing
                if (event.taskId === 'sundayCoffee')
                {
                    console.log(`ValidateCalendarEvents: NPC ${event.npcSurname} no longer exists, rescheduling Sunday Coffee event`);
                    sundayCoffeeToReschedule.push(event);
                    eventsToRemove.push(event.id);
                }
                else
                {
                    console.warn(`ValidateCalendarEvents: Removing event for non-existent NPC ${event.npcSurname}`);
                    eventsToRemove.push(event.id);
                }
            }
        }
    }
    
    // Remove invalid events
    for (let eventId of eventsToRemove)
    {
        RemoveEvent(eventId);
    }
    
    // Reschedule Sunday Coffee events if needed
    if (sundayCoffeeToReschedule.length > 0 && typeof ScheduleSundayCoffee !== 'undefined')
    {
        ScheduleSundayCoffee();
    }
}

///////////////////////////////////////////////////////////////////////////////
// Reward System

// Give random reward for completing event
function GiveEventReward()
{
    if (!playerData)
        return;
    
    // Weighted random: 70% credibility, 25% countersuit, 5% exculpation
    let roll = RandBetween(0, 100);
    let rewardType, rewardName, tileX, tileY;
    
    if (roll < 70)
    {
        // Credibility (common) - sprite index 18
        rewardType = 'credibility';
        rewardName = 'Credibility';
        tileX = 18 % 8; // 2
        tileY = Math.floor(18 / 8); // 2
    }
    else if (roll < 95)
    {
        // Countersuit (less common) - sprite index 19
        rewardType = 'countersuit';
        rewardName = 'Countersuit';
        tileX = 19 % 8; // 3
        tileY = Math.floor(19 / 8); // 2
    }
    else
    {
        // Exculpation (least common) - sprite index 20
        rewardType = 'exculpation';
        rewardName = 'Exculpation';
        tileX = 20 % 8; // 4
        tileY = Math.floor(20 / 8); // 2
    }
    
    // Add to inventory
    playerData.AddToInventory(rewardType, rewardName, tileX, tileY, 1);
}

///////////////////////////////////////////////////////////////////////////////
// Missed Event Handling

// Process missed events (called at day rollover)
// Called BEFORE day advances, so currentGameTime represents the day that just ended
function ProcessMissedEvents(currentGameTime)
{
    if (!currentGameTime)
        return;
    
    // Get the date that just ended (current day before advancing)
    let endedDay = currentGameTime.dayOfMonth;
    let endedMonth = currentGameTime.month;
    let endedYear = GetCurrentYear(currentGameTime);
    
    // Mark the day that just ended's pending events as missed
    // Exclude events that are already completed or removed
    let endedDayEvents = calendarEvents.filter(e => 
        e.status === 'pending' &&
        e.year === endedYear &&
        e.month === endedMonth &&
        e.day === endedDay
    );
    
    // Check for missed Friday Judgment event
    let missedJudgmentEvent = endedDayEvents.find(e => e.taskId === 'fridayJudgement');
    
    if (missedJudgmentEvent && typeof ProcessMissedFridayJudgment !== 'undefined')
    {
        // Process missed judgment (player auto-loses but judge still makes decisions)
        ProcessMissedFridayJudgment(missedJudgmentEvent);
    }
    
    // Mark events as missed, but skip any that are already completed or being processed
    for (let event of endedDayEvents)
    {
        // Double-check the event is still pending and hasn't been completed/removed
        // This prevents race conditions where an event is completed but ProcessMissedEvents runs
        let currentEvent = calendarEvents.find(e => e.id === event.id);
        if (currentEvent && currentEvent.status === 'pending')
        {
            event.status = 'missed';
        }
    }
    
    // Remove missed events from the day before the day that just ended (missed events are removed after 1 day)
    let dayToRemove = endedDay - 1;
    let dayToRemoveMonth = endedMonth;
    let dayToRemoveYear = endedYear;
    
    if (dayToRemove < 1)
    {
        dayToRemoveMonth--;
        dayToRemove = 28; // All months have 28 days
        if (dayToRemoveMonth < 1)
        {
            dayToRemoveMonth = 12;
            dayToRemoveYear--;
        }
    }
    
    let oldMissedEvents = calendarEvents.filter(e => 
        e.status === 'missed' &&
        e.year === dayToRemoveYear &&
        e.month === dayToRemoveMonth &&
        e.day === dayToRemove
    );
    
    for (let event of oldMissedEvents)
    {
        RemoveEvent(event.id);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Task System

// Register a task
function RegisterTask(taskId, data = {})
{
    calendarTasks[taskId] = {
        active: true,
        data: data
    };
}

// Trigger a task (called when event is completed)
function TriggerTask(taskId)
{
    if (!calendarTasks[taskId] || !calendarTasks[taskId].active)
        return;
    
    // Handle specific tasks
    if (taskId === 'sundayCoffee')
    {
        ScheduleSundayCoffee();
    }
    if (taskId === 'caseOfTheMondays')
    {
        ScheduleCaseOfTheMondays();
    }
    // Add more tasks here as needed
}

///////////////////////////////////////////////////////////////////////////////
// Missed Friday Judgment Processing

// Process missed Friday Judgment event (player auto-loses)
async function ProcessMissedFridayJudgment(event)
{
    if (!event || event.taskId !== 'fridayJudgement')
        return;
    
    console.log('Processing missed Friday Judgment event');
    
    // Get active case
    if (typeof GetActiveCase === 'undefined')
    {
        console.warn('GetActiveCase function not available');
        return;
    }
    
    const activeCase = GetActiveCase();
    if (!activeCase)
    {
        console.warn('No active case for missed Friday Judgment');
        // Still mark event as missed
        event.status = 'missed';
        return;
    }
    
    // Process judgment with empty statement and isMissedEvent = true
    if (typeof ProcessFridayJudgment !== 'undefined')
    {
        try
        {
            const result = await ProcessFridayJudgment('', true);
            
            if (result)
            {
                console.log('Missed judgment processed:', result);
                
                // Clear active case
                if (typeof ClearActiveCase !== 'undefined')
                {
                    ClearActiveCase();
                }
                
                // Event status will be set to 'missed' by ProcessMissedEvents
            }
        }
        catch (error)
        {
            console.error('Error processing missed Friday Judgment:', error);
        }
    }
}

// Find next Sunday from current date
function FindNextSunday(currentGameTime)
{
    if (!currentGameTime)
        return null;
    
    let currentYear = GetCurrentYear(currentGameTime);
    let currentMonth = currentGameTime.month;
    let currentDay = currentGameTime.dayOfMonth;
    let currentDayOfWeek = currentGameTime.dayOfWeek;
    
    // Calculate days until next Sunday
    let daysUntilSunday = (7 - currentDayOfWeek) % 7;
    if (daysUntilSunday === 0)
        daysUntilSunday = 7; // If today is Sunday, get next Sunday
    
    let nextSundayDay = currentDay + daysUntilSunday;
    let nextSundayMonth = currentMonth;
    let nextSundayYear = currentYear;
    
    // Handle month rollover
    if (nextSundayDay > 28)
    {
        nextSundayDay -= 28;
        nextSundayMonth++;
        if (nextSundayMonth > 12)
        {
            nextSundayMonth = 1;
            nextSundayYear++;
        }
    }
    
    return {
        year: nextSundayYear,
        month: nextSundayMonth,
        day: nextSundayDay
    };
}

// Schedule Sunday Coffee event
function ScheduleSundayCoffee()
{
    if (!gameTime)
        return;
    
    // Find next Sunday
    let nextSunday = FindNextSunday(gameTime);
    if (!nextSunday)
        return;
    
    // Check if event already exists for this date (prevent duplicates)
    let existingEvents = GetEventsForDate(nextSunday.year, nextSunday.month, nextSunday.day);
    if (existingEvents.some(e => e.taskId === 'sundayCoffee'))
    {
        // Event already exists, just update task data
        if (calendarTasks['sundayCoffee'])
        {
            calendarTasks['sundayCoffee'].data.lastScheduledDate = nextSunday;
        }
        return;
    }
    
    // Pick random NPC - verify they exist and are valid
    if (!allNPCs || allNPCs.length === 0)
    {
        console.warn('ScheduleSundayCoffee: No NPCs available');
        return;
    }
    
    // Filter to only valid NPCs that actually exist in allNPCs (must have surname and addresses)
    let validNPCs = allNPCs.filter(npc => 
        npc && 
        npc.surname && 
        npc.houseAddress !== null && npc.houseAddress !== undefined &&
        npc.workAddress !== null && npc.workAddress !== undefined &&
        GetNPCBySurname(npc.surname) !== undefined // Double-check NPC exists
    );
    
    if (validNPCs.length === 0)
    {
        console.warn('ScheduleSundayCoffee: No valid NPCs found in town');
        return;
    }
    
    let randomNPC = validNPCs[RandInt(validNPCs.length)];
    
    // Final verification - NPC must exist
    let verifiedNPC = GetNPCBySurname(randomNPC.surname);
    if (!verifiedNPC)
    {
        console.warn(`ScheduleSundayCoffee: NPC ${randomNPC.surname} not found in allNPCs, cannot schedule`);
        return;
    }
    
    // Use verified NPC
    randomNPC = verifiedNPC;
    
    // Verify addresses by looking up buildings (ensure addresses are valid)
    let houseBuilding = FindBuildingByAddress(randomNPC.houseAddress);
    let workBuilding = FindBuildingByAddress(randomNPC.workAddress);
    
    // Use verified addresses (fallback to NPC's stored addresses if buildings not found)
    let houseAddress = houseBuilding ? houseBuilding.address : randomNPC.houseAddress;
    let workAddress = workBuilding ? workBuilding.address : randomNPC.workAddress;
    
    // Create event
    CreateCalendarEvent(
        nextSunday.year,
        nextSunday.month,
        nextSunday.day,
        randomNPC.surname,
        houseAddress,
        workAddress,
        'sundayCoffee'
    );
    
    // Update task data
    if (calendarTasks['sundayCoffee'])
    {
        calendarTasks['sundayCoffee'].data.lastScheduledDate = nextSunday;
    }
}

// Find next Monday from current date
function FindNextMonday(currentGameTime)
{
    if (!currentGameTime)
        return null;
    
    let currentYear = GetCurrentYear(currentGameTime);
    let currentMonth = currentGameTime.month;
    let currentDay = currentGameTime.dayOfMonth;
    let currentDayOfWeek = currentGameTime.dayOfWeek;
    
    // Calculate days until next Monday (day 1)
    let daysUntilMonday = (1 - currentDayOfWeek + 7) % 7;
    if (daysUntilMonday === 0)
        daysUntilMonday = 7; // If today is Monday, get next Monday
    
    let nextMondayDay = currentDay + daysUntilMonday;
    let nextMondayMonth = currentMonth;
    let nextMondayYear = currentYear;
    
    // Handle month rollover
    if (nextMondayDay > 28)
    {
        nextMondayDay -= 28;
        nextMondayMonth++;
        if (nextMondayMonth > 12)
        {
            nextMondayMonth = 1;
            nextMondayYear++;
        }
    }
    
    return {
        year: nextMondayYear,
        month: nextMondayMonth,
        day: nextMondayDay
    };
}

// Schedule Case of the Mondays event
function ScheduleCaseOfTheMondays()
{
    if (!gameTime)
        return;
    
    // If today is Monday and it's >= 07:02, schedule for today
    if (gameTime.dayOfWeek === 1 && gameTime.gameHour >= 7.02)
    {
        let currentYear = GetCurrentYear(gameTime);
        
        // Check if event already exists for today
        let existingEvents = calendarEvents.filter(e => 
            e.year === currentYear && 
            e.month === gameTime.month && 
            e.day === gameTime.dayOfMonth &&
            e.taskId === 'caseOfTheMondays'
        );
        if (existingEvents.length > 0)
        {
            // Event already exists, just update task data
            if (calendarTasks['caseOfTheMondays'])
            {
                calendarTasks['caseOfTheMondays'].data.lastScheduledDate = {
                    year: currentYear,
                    month: gameTime.month,
                    day: gameTime.dayOfMonth
                };
            }
            return;
        }
        
        // Find courthouse building
        let courthouse = null;
        if (typeof gameObjects !== 'undefined')
        {
            for (let obj of gameObjects)
            {
                if (obj.isBuilding && obj.buildingType === 'court')
                {
                    courthouse = obj;
                    break;
                }
            }
        }
        
        if (!courthouse)
        {
            console.warn('ScheduleCaseOfTheMondays: Courthouse not found');
            return;
        }
        
        const courthouseAddress = courthouse.address;
        
        // Create event (no NPC, just location - judge is at courthouse)
        CreateCalendarEvent(
            currentYear,
            gameTime.month,
            gameTime.dayOfMonth,
            null, // No NPC - player talks to judge
            null,
            courthouseAddress, // Work address is courthouse
            'caseOfTheMondays'
        );
        
        // Update task data
        if (calendarTasks['caseOfTheMondays'])
        {
            calendarTasks['caseOfTheMondays'].data.lastScheduledDate = {
                year: currentYear,
                month: gameTime.month,
                day: gameTime.dayOfMonth
            };
        }
        return;
    }
    
    // Otherwise, find next Monday
    let nextMonday = FindNextMonday(gameTime);
    if (!nextMonday)
        return;
    
    // Check if event already exists for this date (prevent duplicates)
    let existingEvents = calendarEvents.filter(e => 
        e.year === nextMonday.year && 
        e.month === nextMonday.month && 
        e.day === nextMonday.day &&
        e.taskId === 'caseOfTheMondays'
    );
    if (existingEvents.length > 0)
    {
        // Event already exists, just update task data
        if (calendarTasks['caseOfTheMondays'])
        {
            calendarTasks['caseOfTheMondays'].data.lastScheduledDate = nextMonday;
        }
        return;
    }
    
    // Don't create event yet - it will be created on Monday at 07:02
    // Just update task data to track that we're waiting for next Monday
    if (calendarTasks['caseOfTheMondays'])
    {
        calendarTasks['caseOfTheMondays'].data.lastScheduledDate = nextMonday;
    }
}

// Initialize Case of the Mondays task (call on game start)
function InitializeCaseOfTheMondays()
{
    if (!gameTime)
        return;
    
    // Check if task already initialized (prevent duplicates)
    if (calendarTasks['caseOfTheMondays'])
        return;
    
    // Register task
    RegisterTask('caseOfTheMondays', {
        lastScheduledDate: null
    });
    
    // Schedule for next Monday (will be created at 07:02 on Monday)
    ScheduleCaseOfTheMondays();
}

// Initialize Sunday Coffee task (call on game start)
function InitializeSundayCoffee()
{
    if (!gameTime)
        return;
    
    // Check if task already initialized (prevent duplicates)
    if (calendarTasks['sundayCoffee'])
        return;
    
    // Register task
    RegisterTask('sundayCoffee', {
        lastScheduledDate: null
    });
    
    // If today is Sunday, schedule for today
    if (gameTime.dayOfWeek === 0)
    {
        let currentYear = GetCurrentYear(gameTime);
        
        // Check if event already exists for today
        let existingEvents = GetEventsForDate(currentYear, gameTime.month, gameTime.dayOfMonth);
        if (existingEvents.some(e => e.taskId === 'sundayCoffee'))
        {
            // Event already exists, just update task data
            calendarTasks['sundayCoffee'].data.lastScheduledDate = {
                year: currentYear,
                month: gameTime.month,
                day: gameTime.dayOfMonth
            };
            return;
        }
        
        // Get valid NPCs that actually exist (must have surname and addresses)
        let validNPCs = allNPCs && allNPCs.length > 0 ? 
            allNPCs.filter(npc => 
                npc && 
                npc.surname && 
                npc.houseAddress !== null && npc.houseAddress !== undefined &&
                npc.workAddress !== null && npc.workAddress !== undefined &&
                GetNPCBySurname(npc.surname) !== undefined // Double-check NPC exists
            ) : [];
        
        if (validNPCs.length === 0)
        {
            console.warn('InitializeSundayCoffee: No valid NPCs found in town');
            return;
        }
        
        let randomNPC = validNPCs[RandInt(validNPCs.length)];
        
        // Final verification - NPC must exist
        let verifiedNPC = GetNPCBySurname(randomNPC.surname);
        if (!verifiedNPC)
        {
            console.warn(`InitializeSundayCoffee: NPC ${randomNPC.surname} not found in allNPCs, cannot schedule`);
            return;
        }
        
        // Use verified NPC
        randomNPC = verifiedNPC;
        
        // Verify addresses by looking up buildings (ensure addresses are valid)
        let houseBuilding = FindBuildingByAddress(randomNPC.houseAddress);
        let workBuilding = FindBuildingByAddress(randomNPC.workAddress);
        
        // Use verified addresses (fallback to NPC's stored addresses if buildings not found)
        let houseAddress = houseBuilding ? houseBuilding.address : randomNPC.houseAddress;
        let workAddress = workBuilding ? workBuilding.address : randomNPC.workAddress;
        
        CreateCalendarEvent(
            currentYear,
            gameTime.month,
            gameTime.dayOfMonth,
            randomNPC.surname,
            houseAddress,
            workAddress,
            'sundayCoffee'
        );
        
        calendarTasks['sundayCoffee'].data.lastScheduledDate = {
            year: currentYear,
            month: gameTime.month,
            day: gameTime.dayOfMonth
        };
    }
    else
    {
        // Schedule for next Sunday
        ScheduleSundayCoffee();
    }
}

///////////////////////////////////////////////////////////////////////////////
// Success Notification

function ShowSuccessNotification(text)
{
    successNotificationVisible = true;
    successNotificationText = text;
    successNotificationTimer.Set(2.0); // Show for 2 seconds
}

function UpdateSuccessNotification()
{
    if (successNotificationVisible && successNotificationTimer.Elapsed())
    {
        successNotificationVisible = false;
        successNotificationText = '';
        successNotificationTimer.UnSet();
    }
}

function RenderSuccessNotification()
{
    if (!successNotificationVisible)
        return;
    
    // Calculate fade effect (fade out in last 0.3 seconds)
    let timeRemaining = successNotificationTimer.Get();
    let fadeAlpha = 1.0;
    if (timeRemaining < 0.3)
    {
        fadeAlpha = Math.max(0, timeRemaining / 0.3);
    }
    
    // Pop-up at top center of screen
    let textX = mainCanvasSize.x / 2;
    let textY = 50; // Top of screen
    let padding = 15;
    let fontSize = 16;
    
    // Measure text width (approximate)
    let textWidth = successNotificationText.length * 8; // Rough estimate
    let boxWidth = textWidth + padding * 2;
    let boxHeight = fontSize + padding * 2;
    
    // Draw semi-transparent background
    mainCanvasContext.fillStyle = `rgba(0, 0, 0, ${0.7 * fadeAlpha})`;
    mainCanvasContext.fillRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
    
    // Draw border
    mainCanvasContext.strokeStyle = `rgba(74, 255, 74, ${fadeAlpha})`;
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
    
    // Draw text with fade
    let textColor = `rgba(74, 255, 74, ${fadeAlpha})`;
    DrawText(successNotificationText, textX, textY, fontSize, 'center', 1, textColor, '#000');
}

///////////////////////////////////////////////////////////////////////////////
// Loading Notification

function ShowLoadingNotification(text)
{
    loadingNotificationVisible = true;
    loadingNotificationText = text;
}

function HideLoadingNotification()
{
    loadingNotificationVisible = false;
    loadingNotificationText = '';
}

function UpdateLoadingNotification()
{
    // Loading notifications don't auto-hide, they're manually controlled
    // This function exists for consistency with other notification systems
}

function RenderLoadingNotification()
{
    if (!loadingNotificationVisible)
        return;
    
    // Pop-up at top center of screen (below success notification if both are visible)
    let textX = mainCanvasSize.x / 2;
    let textY = 90; // Below success notification area
    let padding = 15;
    let fontSize = 16;
    
    // Measure text width (approximate)
    let textWidth = loadingNotificationText.length * 8; // Rough estimate
    let boxWidth = textWidth + padding * 2;
    let boxHeight = fontSize + padding * 2;
    
    // Animated dots for loading indicator
    let dotCount = (Math.floor(time / 0.5) % 4);
    let loadingText = loadingNotificationText + '.'.repeat(dotCount);
    
    // Draw semi-transparent background
    mainCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
    mainCanvasContext.fillRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
    
    // Draw border (blue for loading)
    mainCanvasContext.strokeStyle = 'rgba(74, 144, 255, 1.0)';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(textX - boxWidth/2, textY - boxHeight/2, boxWidth, boxHeight);
    
    // Draw text
    let textColor = 'rgba(74, 144, 255, 1.0)';
    DrawText(loadingText, textX, textY, fontSize, 'center', 1, textColor, '#000');
}

///////////////////////////////////////////////////////////////////////////////
// Calendar Modal UI

// Update calendar (called from game.js Update())
function UpdateCalendar()
{
    // Check if it's Monday at 07:02 and schedule caseOfTheMondays event if needed
    if (gameTime && gameTime.dayOfWeek === 1 && gameTime.gameHour >= 7.02)
    {
        if (calendarTasks['caseOfTheMondays'] && calendarTasks['caseOfTheMondays'].active)
        {
            let currentYear = GetCurrentYear(gameTime);
            let existingEvents = calendarEvents.filter(e => 
                e.year === currentYear && 
                e.month === gameTime.month && 
                e.day === gameTime.dayOfMonth &&
                e.taskId === 'caseOfTheMondays'
            );
            
            // If event doesn't exist yet, create it (ScheduleCaseOfTheMondays handles duplicate check)
            if (existingEvents.length === 0)
            {
                ScheduleCaseOfTheMondays();
            }
        }
    }
    
    if (!calendarOpen)
        return;
    
    // Close calendar with Escape key
    if (KeyWasPressed(27))
    {
        calendarOpen = false;
        calendarSelectedDate = null;
        return;
    }
}

// Render calendar modal (called from game.js PostRender())
function RenderCalendarModal()
{
    if (!calendarOpen)
        return;
    
    // Draw semi-transparent overlay
    mainCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
    mainCanvasContext.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    
    // Modal dimensions
    let modalWidth = 480;
    let modalHeight = 400;
    let modalX = mainCanvasSize.x / 2;
    let modalY = mainCanvasSize.y / 2;
    
    // Draw modal background
    mainCanvasContext.fillStyle = '#333';
    mainCanvasContext.fillRect(modalX - modalWidth/2, modalY - modalHeight/2, modalWidth, modalHeight);
    
    // Draw modal border
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 3;
    mainCanvasContext.strokeRect(modalX - modalWidth/2, modalY - modalHeight/2, modalWidth, modalHeight);
    
    if (calendarSelectedDate)
    {
        // Show date details view
        RenderDateDetailsView(modalX, modalY, modalWidth, modalHeight);
    }
    else
    {
        // Show month view
        RenderMonthView(modalX, modalY, modalWidth, modalHeight);
    }
}

// Render month view
function RenderMonthView(modalX, modalY, modalWidth, modalHeight)
{
    // Title
    let monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let monthName = monthNames[calendarViewMonth - 1];
    DrawText(`CALENDAR - ${monthName.toUpperCase()} YEAR ${calendarViewYear}`, modalX, modalY - modalHeight/2 + 25, 14, 'center', 1, '#FFF', '#000');
    
    // Navigation buttons
    let navButtonWidth = 60;
    let navButtonHeight = 30;
    let navButtonY = modalY - modalHeight/2 + 25;
    
    // Previous month button
    let prevButtonX = modalX - modalWidth/2 + 50;
    let prevButtonHover = (mousePos.x >= prevButtonX - navButtonWidth/2 && mousePos.x <= prevButtonX + navButtonWidth/2 &&
                          mousePos.y >= navButtonY - navButtonHeight/2 && mousePos.y <= navButtonY + navButtonHeight/2);
    
    mainCanvasContext.fillStyle = prevButtonHover ? '#844' : '#644';
    mainCanvasContext.fillRect(prevButtonX - navButtonWidth/2, navButtonY - navButtonHeight/2, navButtonWidth, navButtonHeight);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(prevButtonX - navButtonWidth/2, navButtonY - navButtonHeight/2, navButtonWidth, navButtonHeight);
    DrawText('<', prevButtonX, navButtonY, 14, 'center', 1, '#FFF', '#000');
    
    if (MouseWasPressed() && prevButtonHover)
    {
        // Check bounds: can't go before Year 1 Month 1
        if (!(calendarViewYear === 1 && calendarViewMonth === 1))
        {
            calendarViewMonth--;
            if (calendarViewMonth < 1)
            {
                calendarViewMonth = 12;
                calendarViewYear--;
            }
        }
    }
    
    // Next month button
    let nextButtonX = modalX + modalWidth/2 - 50;
    let nextButtonHover = (mousePos.x >= nextButtonX - navButtonWidth/2 && mousePos.x <= nextButtonX + navButtonWidth/2 &&
                          mousePos.y >= navButtonY - navButtonHeight/2 && mousePos.y <= navButtonY + navButtonHeight/2);
    
    mainCanvasContext.fillStyle = nextButtonHover ? '#844' : '#644';
    mainCanvasContext.fillRect(nextButtonX - navButtonWidth/2, navButtonY - navButtonHeight/2, navButtonWidth, navButtonHeight);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(nextButtonX - navButtonWidth/2, navButtonY - navButtonHeight/2, navButtonWidth, navButtonHeight);
    DrawText('>', nextButtonX, navButtonY, 14, 'center', 1, '#FFF', '#000');
    
    if (MouseWasPressed() && nextButtonHover)
    {
        // Check bounds: can't go after Year 1 Month 12 Day 28
        if (!(calendarViewYear === 1 && calendarViewMonth === 12))
        {
            calendarViewMonth++;
            if (calendarViewMonth > 12)
            {
                calendarViewMonth = 1;
                calendarViewYear++;
            }
        }
    }
    
    // Close button
    let closeButtonX = modalX + modalWidth/2 - 30;
    let closeButtonY = modalY - modalHeight/2 + 25;
    let closeButtonSize = 20;
    
    let closeButtonHover = (mousePos.x >= closeButtonX - closeButtonSize/2 && mousePos.x <= closeButtonX + closeButtonSize/2 &&
                           mousePos.y >= closeButtonY - closeButtonSize/2 && mousePos.y <= closeButtonY + closeButtonSize/2);
    
    mainCanvasContext.fillStyle = closeButtonHover ? '#F44' : '#844';
    mainCanvasContext.fillRect(closeButtonX - closeButtonSize/2, closeButtonY - closeButtonSize/2, closeButtonSize, closeButtonSize);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(closeButtonX - closeButtonSize/2, closeButtonY - closeButtonSize/2, closeButtonSize, closeButtonSize);
    DrawText('X', closeButtonX, closeButtonY, 12, 'center', 1, '#FFF', '#000');
    
    if (MouseWasPressed() && closeButtonHover)
    {
        calendarOpen = false;
        return;
    }
    
    // Calendar grid (4 weeks × 7 days = 28 days)
    let gridStartX = modalX - modalWidth/2 + 40;
    let gridStartY = modalY - modalHeight/2 + 70;
    let cellWidth = 55;
    let cellHeight = 50;
    let cellSpacing = 4;
    
    // Day labels (Sun, Mon, Tue, Wed, Thu, Fri, Sat)
    let dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    for (let col = 0; col < 7; col++)
    {
        let labelX = gridStartX + col * (cellWidth + cellSpacing) + cellWidth/2;
        let labelY = gridStartY - 20;
        DrawText(dayLabels[col], labelX, labelY, 10, 'center', 1, '#AAA', '#000');
    }
    
    // Draw calendar days
    for (let day = 1; day <= 28; day++)
    {
        let week = Math.floor((day - 1) / 7);
        let dayOfWeek = (day - 1) % 7;
        
        let cellX = gridStartX + dayOfWeek * (cellWidth + cellSpacing);
        let cellY = gridStartY + week * (cellHeight + cellSpacing);
        
        // Check if this is current date
        let currentYear = gameTime ? GetCurrentYear(gameTime) : 1;
        let isCurrentDate = gameTime && 
                           calendarViewYear === currentYear &&
                           calendarViewMonth === gameTime.month &&
                           day === gameTime.dayOfMonth;
        
        // Check if date has events
        let hasEvents = DateHasEvents(calendarViewYear, calendarViewMonth, day);
        let hasPendingEvents = DateHasPendingEvents(calendarViewYear, calendarViewMonth, day);
        let hasMissedEvents = DateHasMissedEvents(calendarViewYear, calendarViewMonth, day);
        
        // Check if mouse is over this cell
        let cellHover = (mousePos.x >= cellX && mousePos.x <= cellX + cellWidth &&
                        mousePos.y >= cellY && mousePos.y <= cellY + cellHeight);
        
        // Determine cell color
        let cellColor = '#222';
        if (hasMissedEvents)
            cellColor = '#422'; // Red for missed events
        else if (hasPendingEvents)
            cellColor = '#242'; // Green for pending events
        else if (hasEvents)
            cellColor = '#442'; // Yellow for completed events
        else if (isCurrentDate)
            cellColor = '#333'; // Darker for current date
        
        if (cellHover)
            cellColor = '#444'; // Lighter on hover
        
        // Draw cell background
        mainCanvasContext.fillStyle = cellColor;
        mainCanvasContext.fillRect(cellX, cellY, cellWidth, cellHeight);
        
        // Draw cell border
        mainCanvasContext.strokeStyle = isCurrentDate ? '#4a9eff' : '#666';
        mainCanvasContext.lineWidth = isCurrentDate ? 3 : 1;
        mainCanvasContext.strokeRect(cellX, cellY, cellWidth, cellHeight);
        
        // Draw day number
        DrawText(day.toString(), cellX + cellWidth/2, cellY + 20, 14, 'center', 1, '#FFF', '#000');
        
        // Draw event indicator (small dot)
        if (hasEvents)
        {
            let dotSize = 6;
            let dotX = cellX + cellWidth/2;
            let dotY = cellY + cellHeight - 12;
            mainCanvasContext.fillStyle = hasMissedEvents ? '#F44' : (hasPendingEvents ? '#4F4' : '#FF4');
            mainCanvasContext.beginPath();
            mainCanvasContext.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
            mainCanvasContext.fill();
        }
        
        // Handle click
        if (cellHover && MouseWasPressed())
        {
            calendarSelectedDate = {
                year: calendarViewYear,
                month: calendarViewMonth,
                day: day
            };
        }
    }
}

// Render date details view
function RenderDateDetailsView(modalX, modalY, modalWidth, modalHeight)
{
    // Title
    let monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let monthName = monthNames[calendarSelectedDate.month - 1];
    DrawText(`${monthName.toUpperCase()} ${calendarSelectedDate.day}, YEAR ${calendarSelectedDate.year}`, modalX, modalY - modalHeight/2 + 25, 14, 'center', 1, '#FFF', '#000');
    
    // Back button
    let backButtonX = modalX - modalWidth/2 + 50;
    let backButtonY = modalY - modalHeight/2 + 25;
    let backButtonWidth = 80;
    let backButtonHeight = 30;
    
    let backButtonHover = (mousePos.x >= backButtonX - backButtonWidth/2 && mousePos.x <= backButtonX + backButtonWidth/2 &&
                          mousePos.y >= backButtonY - backButtonHeight/2 && mousePos.y <= backButtonY + backButtonHeight/2);
    
    mainCanvasContext.fillStyle = backButtonHover ? '#844' : '#644';
    mainCanvasContext.fillRect(backButtonX - backButtonWidth/2, backButtonY - backButtonHeight/2, backButtonWidth, backButtonHeight);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(backButtonX - backButtonWidth/2, backButtonY - backButtonHeight/2, backButtonWidth, backButtonHeight);
    DrawText('BACK', backButtonX, backButtonY, 10, 'center', 1, '#FFF', '#000');
    
    if (MouseWasPressed() && backButtonHover)
    {
        calendarSelectedDate = null;
        return;
    }
    
    // Close button
    let closeButtonX = modalX + modalWidth/2 - 30;
    let closeButtonY = modalY - modalHeight/2 + 25;
    let closeButtonSize = 20;
    
    let closeButtonHover = (mousePos.x >= closeButtonX - closeButtonSize/2 && mousePos.x <= closeButtonX + closeButtonSize/2 &&
                           mousePos.y >= closeButtonY - closeButtonSize/2 && mousePos.y <= closeButtonY + closeButtonSize/2);
    
    mainCanvasContext.fillStyle = closeButtonHover ? '#F44' : '#844';
    mainCanvasContext.fillRect(closeButtonX - closeButtonSize/2, closeButtonY - closeButtonSize/2, closeButtonSize, closeButtonSize);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(closeButtonX - closeButtonSize/2, closeButtonY - closeButtonSize/2, closeButtonSize, closeButtonSize);
    DrawText('X', closeButtonX, closeButtonY, 12, 'center', 1, '#FFF', '#000');
    
    if (MouseWasPressed() && closeButtonHover)
    {
        calendarOpen = false;
        calendarSelectedDate = null;
        return;
    }
    
    // Get events for this date
    let events = GetEventsForDate(calendarSelectedDate.year, calendarSelectedDate.month, calendarSelectedDate.day);
    
    // Event list area
    let listStartY = modalY - modalHeight/2 + 70;
    let listItemHeight = 50;
    let listItemSpacing = 10;
    let maxVisibleItems = 5;
    
    if (events.length === 0)
    {
        DrawText('No events scheduled', modalX, modalY, 12, 'center', 1, '#AAA', '#000');
    }
    else
    {
        // Draw each event
        for (let i = 0; i < events.length && i < maxVisibleItems; i++)
        {
            let event = events[i];
            let itemY = listStartY + i * (listItemHeight + listItemSpacing);
            
            // Event background
            let eventColor = '#222';
            if (event.status === 'missed')
                eventColor = '#422';
            else if (event.status === 'pending')
                eventColor = '#242';
            else if (event.status === 'completed')
                eventColor = '#442';
            
            mainCanvasContext.fillStyle = eventColor;
            mainCanvasContext.fillRect(modalX - modalWidth/2 + 30, itemY, modalWidth - 60, listItemHeight);
            
            // Event border
            mainCanvasContext.strokeStyle = '#666';
            mainCanvasContext.lineWidth = 2;
            mainCanvasContext.strokeRect(modalX - modalWidth/2 + 30, itemY, modalWidth - 60, listItemHeight);
            
            // Event text
            let textX = modalX - modalWidth/2 + 50;
            let textY = itemY + listItemHeight/2;
            
            // Event name - use special name for caseOfTheMondays, otherwise use NPC name
            let eventName = event.npcSurname;
            if (event.taskId === 'caseOfTheMondays')
            {
                eventName = 'A Case of the Mondays';
            }
            DrawText(eventName, textX, textY - 10, 12, 'left', 1, '#FFF', '#000');
            
            // Get current addresses from NPC (verify they're still accurate)
            let npc = GetNPCBySurname(event.npcSurname);
            let houseAddress = event.houseAddress;
            let workAddress = event.workAddress;
            
            // If NPC exists, verify addresses by looking up buildings
            if (npc)
            {
                let houseBuilding = FindBuildingByAddress(npc.houseAddress);
                let workBuilding = FindBuildingByAddress(npc.workAddress);
                
                // Use verified addresses from buildings (fallback to stored event addresses)
                if (houseBuilding)
                    houseAddress = houseBuilding.address;
                if (workBuilding)
                    workAddress = workBuilding.address;
            }
            
            // Addresses - show N/A for null values
            let homeText = houseAddress ? `Home: ${houseAddress}` : 'Home: N/A';
            let workText = workAddress ? `Work: ${workAddress}` : 'Work: N/A';
            DrawText(homeText, textX, textY + 5, 10, 'left', 1, '#AAA', '#000');
            DrawText(workText, textX, textY + 18, 10, 'left', 1, '#AAA', '#000');
            
            // Status indicator
            let statusText = '';
            if (event.status === 'missed')
                statusText = 'MISSED';
            else if (event.status === 'pending')
                statusText = 'PENDING';
            else if (event.status === 'completed')
                statusText = 'COMPLETED';
            
            if (statusText)
            {
                DrawText(statusText, modalX + modalWidth/2 - 50, textY, 10, 'right', 1, '#AAA', '#000');
            }
        }
        
        // Scroll indicator if more events
        if (events.length > maxVisibleItems)
        {
            DrawText(`+${events.length - maxVisibleItems} more...`, modalX, modalY + modalHeight/2 - 30, 10, 'center', 1, '#AAA', '#000');
        }
    }
}

