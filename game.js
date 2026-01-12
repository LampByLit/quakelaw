/*

*/

"use strict"; // strict mode
///////////////////////////////////////////////////////////////////////////////
// debug config

//godMode=1;
//debug=1;
//debugCanvas=1;
//debugCollision=1;
//soundEnable=0;

///////////////////////////////////////////////////////////////////////////////
// init

let level;
let levelColor = new Color();
let levelFrame;
let playerHomePos;
let buildingSprites = {};
let purchasedItemSprites = {};
let currentInterior = null;
let exteriorLevel = null;
let playerExteriorPos = null;
let tileImage2 = null; // tiles2.png for furniture
let tileImage5 = null; // tiles5.png for player skins (0-5)
let tileImage6 = null; // tiles6.png for player skins (6-11)
let interiorExitCooldown = new Timer();

let boss;
let player;
let playerData;
let playerStartPos;
let winTimer = new Timer();
let healthWarning = new Timer();
let buyTimer = new Timer();
let mainCanvas = c1;
let speedRunMode;
let speedRunTime=0;
let speedRunBestTime=0;
let coinSoundTimer = new Timer();
let gameTime = null;
let timePaused = 0;
let baseLevelColor = new Color(.1, .3, .1); // Base town color for day/night cycle
let sleepFadeTimer = new Timer();
let sleepFadeActive = 0;
let sleepFadeStateApplied = 0; // Track if state changes have been applied at midpoint
let gameOverTimer = new Timer();
let gameOverModalOpen = false;
let gameOverFadeActive = false;
let gameOverFadeTimer = new Timer();
let lawSchoolButtonHover = false;
let lawSchoolModalOpen = false;
let storeButtonHover = false;
let storeModalOpen = false;
let isLoadingWorld = false;
let loadingProgress = 0;
let loadingMessage = '';
let inventoryOpen = false;
let inventoryButtonHover = false;
let inventoryDropMode = false; // When true, next item clicked will be dropped
let evidenceNamingModalOpen = false;
let evidenceNamingInput = '';
let evidenceNamingCallback = null;
let evidenceNamingDefaultName = '';
let evidenceNamingLastKey = null;
let evidenceViewModalOpen = false;
let evidenceViewItem = null;
let evidenceViewScrollOffset = 0;
let townMapVisible = false; // Toggle for town grid map
let baseCameraScale = 2; // Base camera scale (default zoom level)

// Calendar system
let calendarOpen = false;
let calendarButtonHover = false;
let mapButtonHover = false;
let calendarViewMonth = 1; // Current month being viewed (1-12)
let calendarViewYear = 1; // Current year being viewed (starts at 1)
let calendarSelectedDate = null; // { month, day } when viewing date details
let calendarEvents = []; // Array of event objects
let calendarTasks = {}; // Task registry: { taskId: { active: bool, data: {...} } }

class GameTime
{
    constructor()
    {
        this.dayOfWeek = 0; // 0=Sunday, 1=Monday, ..., 6=Saturday
        this.gameHour = 7.0; // Start at 07:00
        this.daysElapsed = 0; // Total days since game start
        this.month = 1; // 1=January, 2=February, ..., 12=December
        this.dayOfMonth = 1; // Day within current month (1-28)
        this.realTimeStart = 0; // Real time when current day started
        this.realTimePerGameHour = 25; // 1 game hour = 25 seconds real time
        this.gameHoursPerRealSecond = 1.0 / this.realTimePerGameHour; // Hours of game time per real second
        this.realTimePerGameDay = this.realTimePerGameHour * 24; // 24 game hours = 600 seconds (10 minutes)
        this.daysPerMonth = 28; // Each month has 28 days (4 weeks)
        this.gossipProcessedToday = false; // Track if gossip has been processed today
    }
    
    Update()
    {
        // Time pauses when window loses focus, but continues in interiors
        if (timePaused && !currentInterior)
            return;
        
        // Calculate elapsed real time since day started (time is already in seconds)
        let realTimeElapsed = time - this.realTimeStart;
        
        // Convert to game hours (1 game hour = 25 real seconds)
        this.gameHour = 7.0 + (realTimeElapsed * this.gameHoursPerRealSecond);
        
        // Process gossip at 7:01 (once per day)
        if (this.gameHour >= 7.01 && this.gameHour < 7.02 && !this.gossipProcessedToday)
        {
            ProcessDailyGossip();
            this.gossipProcessedToday = true;
        }
        
        // Check for day rollover at midnight (24:00)
        if (this.gameHour >= 24.0)
        {
            this.AdvanceDay();
        }
    }
    
    AdvanceDay()
    {
        // Process missed events from the day that just ended (current day before advancing)
        if (typeof ProcessMissedEvents !== 'undefined')
        {
            ProcessMissedEvents(this);
        }
        
        this.daysElapsed++;
        this.dayOfWeek = (this.dayOfWeek + 1) % 7;
        this.dayOfMonth++;
        
        // Check for month rollover (28 days per month)
        if (this.dayOfMonth > this.daysPerMonth)
        {
            this.dayOfMonth = 1;
            this.month++;
            // Check for year rollover (12 months)
            if (this.month > 12)
            {
                this.month = 1;
            }
            // Reset rent payment flag for new month
            if (typeof playerData !== 'undefined')
            {
                playerData.rentPaidThisMonth = false;
            }
        }
        
        // On the 1st of every month, ensure Sunday Coffee is scheduled
        if (this.dayOfMonth === 1)
        {
            if (typeof calendarEvents !== 'undefined' && typeof ScheduleSundayCoffee !== 'undefined')
            {
                // Check if there's already a pending Sunday Coffee event scheduled
                let hasPendingSundayCoffee = calendarEvents.some(e => 
                    e.taskId === 'sundayCoffee' && e.status === 'pending'
                );
                
                // If no pending Sunday Coffee event exists, schedule one
                if (!hasPendingSundayCoffee)
                {
                    ScheduleSundayCoffee();
                }
            }
        }
        
        // Reset gossip flag for new day
        this.gossipProcessedToday = false;
        
        // Reset NPCs at start of new day (00:00)
        ResetNPCsForNewDay();
        
        this.gameHour = 7.0; // Wake at 07:00
        this.realTimeStart = time;
    }
    
    Sleep()
    {
        // Called when player sleeps - advance to next day, wake at 07:00
        this.AdvanceDay();
        this.realTimeStart = time;
    }
    
    GetHour() { return this.gameHour; }
    GetDayOfWeek() { return this.dayOfWeek; }
    GetDaysElapsed() { return this.daysElapsed; }
    GetMonth() { return this.month; }
    GetDayOfMonth() { return this.dayOfMonth; }
    
    GetDayName() 
    { 
        return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][this.dayOfWeek]; 
    }
    
    GetMonthName()
    {
        return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][this.month - 1];
    }
    
    FormatTime() 
    { 
        let h = Math.floor(this.gameHour);
        let m = Math.floor((this.gameHour - h) * 60);
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
    }
    
    FormatDate()
    {
        return `${this.GetDayName()}, ${this.GetMonthName()} ${this.dayOfMonth}`;
    }
    
    Save()
    {
        return {
            dayOfWeek: this.dayOfWeek,
            gameHour: this.gameHour,
            daysElapsed: this.daysElapsed,
            month: this.month,
            dayOfMonth: this.dayOfMonth,
            realTimeStart: this.realTimeStart,
            gossipProcessedToday: this.gossipProcessedToday
        };
    }
    
    Load(data)
    {
        if (data)
        {
            this.dayOfWeek = data.dayOfWeek || 0;
            this.gameHour = data.gameHour || 7.0;
            this.daysElapsed = data.daysElapsed || 0;
            this.month = data.month || 1;
            this.dayOfMonth = data.dayOfMonth || 1;
            this.realTimeStart = data.realTimeStart || time;
            this.gossipProcessedToday = data.gossipProcessedToday || false;
        }
    }
}

// Inventory item class
class InventoryItem
{
    constructor(type, name, tileX, tileY, quantity = 1)
    {
        this.type = type; // Item type identifier
        this.name = name; // Display name
        this.tileX = tileX; // Sprite tile X
        this.tileY = tileY; // Sprite tile Y
        this.quantity = quantity; // Stack size
    }
}

class PlayerData
{
    // track player data between levels (when player is destroyed)
    constructor()
    {
        this.health = 3;
        this.healthMax = 3;
        this.boomerangs = 1;
        this.bigBoomerangs = 0;
        this.coins = 20;
        this.inventory = []; // 16 slots (4x4 grid)
        this.rentPaidThisMonth = false; // Track if rent has been paid this month
        this.currentSkin = null; // null = use original tiles.png, 0-5 = tiles5.png, 6-11 = tiles6.png
    }
    
    // Add item to inventory (returns true if added, false if full)
    AddToInventory(type, name, tileX, tileY, quantity = 1)
    {
        // Coins are NOT added to inventory - they go directly to coin count
        if (type === 'coin')
        {
            return false; // Reject coins from inventory
        }
        
        // Find empty slot
        if (this.inventory.length < 16)
        {
            this.inventory.push(new InventoryItem(type, name, tileX, tileY, quantity));
            return true;
        }
        
        return false; // Inventory full
    }
    
    // Remove item from inventory by type (returns true if removed)
    RemoveFromInventory(type, quantity = 1)
    {
        for(let i = 0; i < this.inventory.length; i++)
        {
            if (this.inventory[i] && this.inventory[i].type === type)
            {
                this.inventory[i].quantity -= quantity;
                if (this.inventory[i].quantity <= 0)
                {
                    // Remove item completely
                    this.inventory.splice(i, 1);
                }
                return true;
            }
        }
        return false; // Item not found
    }
}

function Init()
{
    // Clear all game state from localStorage on page refresh to ensure fresh start
    if (typeof localStorage !== 'undefined') {
        delete localStorage.kbap_coins;
        delete localStorage.lawyer_gameState;
        delete localStorage.kbap_warp;
        delete localStorage.kbap_won;
        delete localStorage.kbap_bestTime;
        // Note: lastSessionId is kept for session cleanup purposes
    }
    
    EngineInit();
    
    // clear canvas to black so transition starts on a black screen
    mainCanvasContext.fillRect(0,0,mainCanvasSize.x, mainCanvasSize.y);

    Reset();
    InitTown();
    EngineUpdate();
}

function Reset()
{
    // load local storage
    playerData = new PlayerData();
    
    // Initialize game time
    gameTime = new GameTime();
    if (localStorage.lawyer_gameState)
    {
        try
        {
            let saved = JSON.parse(localStorage.lawyer_gameState);
            gameTime.Load(saved.gameTime);
            
            // Store banished NPCs for later restoration (after NPCs are initialized)
            if (saved.banishedNPCs && Array.isArray(saved.banishedNPCs))
            {
                // Store in a temporary variable that will be used after NPCs are initialized
                window._savedBanishedNPCs = saved.banishedNPCs;
            }
            
            // Load player data including inventory
            if (saved.playerData)
            {
                if (saved.playerData.health !== undefined) playerData.health = saved.playerData.health;
                if (saved.playerData.healthMax !== undefined) playerData.healthMax = saved.playerData.healthMax;
                if (saved.playerData.coins !== undefined) playerData.coins = saved.playerData.coins;
                else if (localStorage.kbap_coins) playerData.coins = parseInt(localStorage.kbap_coins, 10); // Fallback for old saves
                if (saved.playerData.boomerangs !== undefined) playerData.boomerangs = saved.playerData.boomerangs;
                if (saved.playerData.bigBoomerangs !== undefined) playerData.bigBoomerangs = saved.playerData.bigBoomerangs;
                if (saved.playerData.rentPaidThisMonth !== undefined) playerData.rentPaidThisMonth = saved.playerData.rentPaidThisMonth;
                if (saved.playerData.currentSkin !== undefined) playerData.currentSkin = saved.playerData.currentSkin;
                
                // Load inventory
                if (saved.playerData.inventory && Array.isArray(saved.playerData.inventory))
                {
                    playerData.inventory = [];
                    for(let i = 0; i < saved.playerData.inventory.length && i < 16; i++)
                    {
                        let item = saved.playerData.inventory[i];
                        if (item)
                        {
                            // Create inventory item, preserving all properties including metadata
                            let inventoryItem = new InventoryItem(
                                item.type,
                                item.name,
                                item.tileX,
                                item.tileY,
                                item.quantity || 1
                            );
                            // Preserve metadata if it exists (for evidence items)
                            if (item.metadata)
                            {
                                inventoryItem.metadata = item.metadata;
                            }
                            playerData.inventory.push(inventoryItem);
                        }
                    }
                }
            }
            
            // Load purchased items (after level is created)
            if (saved.purchasedItems && Array.isArray(saved.purchasedItems))
            {
                // Store for loading after world is generated
                window._savedPurchasedItems = saved.purchasedItems;
            }
        }
        catch(e)
        {
            // If load fails, start fresh
            gameTime.realTimeStart = time;
        }
    }
    else
    {
        // First time - start on Sunday at 07:00
        gameTime.realTimeStart = time;
    }
    
    // Sync inventory with boomerang counts
    // Count boomerangs in inventory
    let invBoomerangs = 0;
    let invBigBoomerangs = 0;
    if (playerData.inventory)
    {
        for(let i = 0; i < playerData.inventory.length; i++)
        {
            if (playerData.inventory[i])
            {
                if (playerData.inventory[i].type === 'boomerang')
                    invBoomerangs += playerData.inventory[i].quantity;
                else if (playerData.inventory[i].type === 'bigBoomerang')
                    invBigBoomerangs += playerData.inventory[i].quantity;
            }
        }
    }
    
    // Add boomerangs to inventory to match playerData counts
    while (invBoomerangs < playerData.boomerangs)
    {
        playerData.AddToInventory('boomerang', 'Boomerang', 0, 5, 1);
        invBoomerangs++;
    }
    while (invBigBoomerangs < playerData.bigBoomerangs)
    {
        playerData.AddToInventory('bigBoomerang', 'Big Boomerang', 7, 5, 1);
        invBigBoomerangs++;
    }
    
    // If no boomerangs at all, start with one
    if (playerData.boomerangs === 0 && playerData.bigBoomerangs === 0 && (!playerData.inventory || playerData.inventory.length === 0))
    {
        playerData.boomerangs = 1;
        playerData.AddToInventory('boomerang', 'Boomerang', 0, 5, 1);
    }
}

async function FullReset()
{
    // Prevent multiple simultaneous resets
    if (resetInProgress) {
        console.log('Reset already in progress, ignoring duplicate call');
        return;
    }
    
    resetInProgress = true;
    
    try {
        // Reset frame and time (from gameEngine.js)
        frame = 0;
        time = 1;
        
        // Reset speed run time
        speedRunTime = 0;
        
        // Reset game state variables
        winTimer.UnSet();
        sleepFadeActive = 0;
        sleepFadeStateApplied = 0;
        sleepFadeTimer.UnSet();
        gameOverTimer.UnSet();
        CloseGameOverModal();
        currentInterior = null;
        exteriorLevel = null;
        playerExteriorPos = null;
        interiorExitCooldown.UnSet();
        
        // Clear all game state from localStorage
        delete localStorage.kbap_coins;
        delete localStorage.lawyer_gameState;
        delete localStorage.kbap_warp;
        delete localStorage.kbap_won;
        delete localStorage.kbap_bestTime;
        
        // Clear calendar events and tasks
        if (typeof calendarEvents !== 'undefined') {
            calendarEvents = [];
        }
        if (typeof calendarTasks !== 'undefined') {
            calendarTasks = {};
        }
        if (typeof nextEventId !== 'undefined') {
            nextEventId = 1;
        }
        
        // Close dialogue modal if open (clears client-side conversation history)
        if (typeof CloseDialogueModal !== 'undefined') {
            CloseDialogueModal();
        }
        
        // Clear all NPCs from memory (before clearing conversations)
        ClearNPCs();
        
        // Clear all cookies - completely wipe session
        if (typeof document !== 'undefined' && document.cookie) {
            // Get all cookies and delete them by setting expiration to past date
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i];
                const eqPos = cookie.indexOf('=');
                const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                // Delete cookie by setting it to expire in the past
                // Also try with different path and domain combinations to ensure complete deletion
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + window.location.hostname;
                document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.' + window.location.hostname;
            }
            console.log('Reset: Cleared all cookies');
        }
        
        // Reset button is a dev tool - wipe entire /data folder
        try {
            const response = await fetch('/api/npc/conversations/all', {
                method: 'DELETE'
            });
            if (!response.ok) {
                console.error('Failed to clear all conversations:', response.status, response.statusText);
                // Continue anyway - will try to update jobs when conversations are loaded
            } else {
                const result = await response.json();
                console.log(`Reset: Deleted entire /data folder (${result.deletedCount || 0} session(s), ${result.deletedFiles || 0} file(s))`);
            }
        } catch (error) {
            console.error('Error clearing all conversations:', error);
            // Continue anyway - worst case old conversations exist but will be updated with new jobs
        }
        
        // Clear session and stored session ID for cleanup
        clearSession();
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('lastSessionId');
        }
        getSessionId(); // Generate new session ID
        
        // Reset game state
        Reset();
        InitTown();
    } finally {
        // Always clear the flag, even if an error occurred
        resetInProgress = false;
        // Set cooldown to prevent rapid successive clicks (2 seconds)
        resetCooldown.Set(2.0);
    }
}

function InitTown()
{
    levelFrame = 0;
    cameraScale = 2;
    baseCameraScale = 2;
    
    // clear everything
    StartTransiton();
    ClearGameObjects();
    ClearNPCs(); // Clear NPCs explicitly
    
    // prevent player being stuck with no boomerangs
    if (!playerData.boomerangs && !playerData.bigBoomerangs)
        playerData.boomerangs = 1;
    
    // Start loading screen and generate world asynchronously
    isLoadingWorld = true;
    loadingProgress = 0;
    loadingMessage = 'Initializing...';
    
    // Generate world asynchronously to allow loading screen to render
    GenerateWorldAsync();
}

function GenerateWorldAsync()
{
    // Use requestAnimationFrame to allow rendering between steps
    // Small delay ensures loading screen is visible
    setTimeout(() => {
        requestAnimationFrame(() => {
            loadingProgress = 0.1;
            loadingMessage = 'Preparing world...';
            
            setTimeout(() => {
                    requestAnimationFrame(() => {
                        // Generate town (this will also call GenerateAllInteriors which updates progress)
                        GenerateTown();
                        
                        // Build navigation grid for NPC pathfinding (after all buildings are placed)
                        if (isLoadingWorld)
                        {
                            loadingProgress = 0.77;
                            loadingMessage = 'Preparing navigation...';
                        }
                        if (typeof BuildNavigationGrid === 'function')
                        {
                            BuildNavigationGrid();
                        }
                        
                        setTimeout(() => {
                            requestAnimationFrame(() => {
                                loadingProgress = 0.8;
                            loadingMessage = 'Spawning NPCs...';
                            
                            setTimeout(() => {
                                requestAnimationFrame(() => {
                                    player = new Player(playerHomePos);
                                    // Set player to face south
                                    player.rotation = 1;
                                    
                                    // Generate NPCs after town is created (and all buildings have addresses)
                                    GenerateNPCs();
                                    
                                    // Restore banished NPCs from save data (must be after NPCs are generated)
                                    if (typeof window !== 'undefined' && window._savedBanishedNPCs && typeof RestoreBanishedNPCs !== 'undefined')
                                    {
                                        RestoreBanishedNPCs(window._savedBanishedNPCs);
                                        window._savedBanishedNPCs = null; // Clear temporary storage
                                    }
                                    
                                    // Restore purchased items from save data (must be after level is created)
                                    if (typeof window !== 'undefined' && window._savedPurchasedItems && typeof LoadPurchasedItems !== 'undefined')
                                    {
                                        LoadPurchasedItems(window._savedPurchasedItems);
                                        window._savedPurchasedItems = null; // Clear temporary storage
                                    }
                                    
                                    // Initialize calendar tasks (Sunday Coffee and Case of the Mondays)
                                    if (typeof InitializeSundayCoffee !== 'undefined')
                                    {
                                        InitializeSundayCoffee();
                                    }
                                    if (typeof InitializeCaseOfTheMondays !== 'undefined')
                                    {
                                        InitializeCaseOfTheMondays();
                                    }
                                    
                                    setTimeout(() => {
                                        requestAnimationFrame(() => {
                                            loadingProgress = 1.0;
                                            loadingMessage = 'Complete!';
                                            
                                            // Clear loading screen after a brief moment
                                            setTimeout(() => {
                                                isLoadingWorld = false;
                                            }, 300);
                                        });
                                    }, 50);
                                });
                            }, 50);
                        });
                    }, 50);
                });
            }, 50);
        });
    }, 50);
}

function SpawnPickups(pos, chance=1, count=1)
{
    // random chance to not drop
    if (Rand()>chance)
        return;
    
    for(let i=0;i<count;++i)
    {
        let p = new Pickup(pos.Clone(), 
            RandInt(8)?        // coin or heart?
            (RandInt(20)?3:4): // small or big coin?
            (RandInt(4)?0:1)   // half or whole heart?
        );
        
        // add extra velocity to sucessive spawns when dropping multiple
        if (count>1)
            p.velocity = RandVector(.1 + Clamp(i,3,30)*.03*Rand());
    }
}

 // collide with level object if one exists and return if bounced
function DestroyLevelObject(pos,bounceRock=1)
{
    // is something solid there?
    let data = level.GetDataFromPos(pos);
    if (!data.IsSolid())
        return 0;

    // did it hit an object?
    let bounce = 1;
    let type = data.object;
    if (type==1 || type==2)
    {
        // clear out the tile
        level.GetDataFromPos(pos).object = 0;
        level.DrawTileData(pos.x,pos.y);
        
        // small chance of dropping a pickup
        SpawnPickups(pos, .05);

        if (type==1)
        {
            // bush
            PlaySound(5);
            level.DrawEllipse(pos,RandBetween(.1,.15),RGBA(0,0,0,RandBetween(.3,.6)));
            bounce=0;
        }
        else
        {
            // rock
            PlaySound(14);
            for(let i=9;i--;)
                level.DrawEllipse(pos.Clone().Add(RandVector(.2)),RandBetween(.1,.2),RGBA(.2,.1,.05,RandBetween(.3,.6)));      
            bounce = bounceRock;
        }

        // particle effects
        new ParticleEmitter
        (
            pos, .5, .1,     // pos, emitter size, particle size
            type==1 ? new Color(.4,.8,.1,1) : new Color(.4,.2,.1,1),
            type==1 ? new Color(0,.1,0,1) : new Color(0,0,0,1)
        );
    }

    return bounce;
}

///////////////////////////////////////////////////////////////////////////////
// update/render

function Update()
{
    ++levelFrame;
    UpdateAudio();
    
    // Update game time (pauses when window loses focus, but continues in interiors)
    timePaused = paused;
    if (gameTime)
        gameTime.Update();
    
    // Update sleep fade transition
    if (sleepFadeActive)
    {
        let elapsed = 1.0 + sleepFadeTimer.Get(); // Get elapsed time (0 to 1.0)
        
        // Apply state changes at midpoint (0.5s) when screen is fully black
        if (!sleepFadeStateApplied && elapsed >= 0.5)
        {
            sleepFadeStateApplied = 1;
            
            // Advance to next day
            if (gameTime)
                gameTime.Sleep();
            
            // Exit interior if in one
            if (currentInterior)
            {
                // Remove furniture from game objects
                gameObjects = gameObjects.filter(o => !o.isFurniture);
                
                // Restore exterior level
                levelSize = 64;
                levelCanvas.width = levelCanvas.height = levelSize * tileSize;
                level = exteriorLevel;
                if (level)
                    level.Redraw();
                
                currentInterior = null;
                exteriorLevel = null;
                playerExteriorPos = null;
            }
            
            // Teleport player to home spawn position (outside home, like game start)
            if (playerHomePos)
            {
                player.pos.Copy(playerHomePos);
                player.rotation = 1; // Face south
            }
            
            // Save game state
            SaveGameState();
        }
        
        // Clean up when transition completes
        if (sleepFadeTimer.Elapsed())
        {
            sleepFadeActive = 0;
            sleepFadeStateApplied = 0;
            sleepFadeTimer.UnSet();
        }
    }
    
    // Handle R key zoom out (keyCode 82 for 'R')
    // Zoom out to 300% (3x wider view) when R is held, smoothly interpolate
    // Only works outdoors when no modals are open
    let canZoom = !currentInterior && // Must be outdoors
                 !inventoryOpen &&
                 !storeModalOpen &&
                 !lawSchoolModalOpen &&
                 !gameOverModalOpen &&
                 !calendarOpen &&
                 !evidenceNamingModalOpen &&
                 !evidenceViewModalOpen &&
                 !(typeof IsDialogueModalOpen !== 'undefined' && IsDialogueModalOpen()) &&
                 !(typeof IsJudgmentModalOpen !== 'undefined' && IsJudgmentModalOpen()) &&
                 !(typeof IsRentModalOpen !== 'undefined' && IsRentModalOpen()) &&
                 !(typeof IsPenaltyModalOpen !== 'undefined' && IsPenaltyModalOpen());
    
    if (KeyIsDown(82) && canZoom) // R key
    {
        let targetScale = baseCameraScale / 3; // 300% zoom out (divide by 3 to make view 3x wider)
        // Smoothly interpolate towards target (lerp with factor ~0.05 per frame for slow, smooth transition)
        cameraScale = cameraScale + (targetScale - cameraScale) * 0.05;
    }
    else
    {
        // Smoothly return to base scale when R is released or conditions not met
        cameraScale = cameraScale + (baseCameraScale - cameraScale) * 0.05;
    }
    
    // save data
    if (!speedRunMode)
        localStorage.kbap_coins = playerData.coins;
    
    // Check for game over due to negative money
    if (player && !player.IsDead() && playerData && playerData.coins < 0)
    {
        console.log('[GAME OVER] Player money went below $0. Triggering game over.');
        // Set coins to 0 so HUD displays $0 instead of negative value
        playerData.coins = 0;
        player.Kill();
        if (typeof ShowErrorNotification !== 'undefined') {
            ShowErrorNotification('You ran out of money. Game Over.');
        }
    }
        
    // update speed run time
    if (player && !paused && !winTimer.IsSet() && !player.IsDead())
        speedRunTime += timeDelta;
    
    // Handle game over auto-reset
    if (player && player.IsDead())
    {
        // Show game over modal if not already shown
        if (!gameOverModalOpen)
        {
            ShowGameOverModal();
        }
        
        // Update countdown in modal
        if (gameOverModalOpen)
        {
            const countdownEl = document.getElementById('gameOverCountdown');
            if (countdownEl)
            {
                if (!gameOverTimer.IsSet())
                {
                    gameOverTimer.Set(5.0); // 5 seconds
                }
                
                if (!gameOverTimer.Elapsed())
                {
                    let timeLeft = Math.max(0, Math.ceil(-gameOverTimer.Get())); // Get() returns negative, so negate it
                    if (timeLeft > 0)
                    {
                        countdownEl.textContent = `Restarting in ${timeLeft}...`;
                    }
                    else
                    {
                        countdownEl.textContent = 'Press ESC to reset';
                    }
                }
                else
                {
                    countdownEl.textContent = 'Press ESC to reset';
                }
            }
        }
        
        // Start the 5-second timer if not already started
        if (!gameOverTimer.IsSet())
        {
            gameOverTimer.Set(5.0); // 5 seconds
        }
        
        // Auto-refresh after 5 seconds or when Escape/OK is pressed
        if (gameOverTimer.Elapsed() || KeyWasPressed(27))
        {
            gameOverTimer.UnSet();
            location.reload();
            return; // Exit early to prevent other updates
        }
    }
    else
    {
        // Clear timer if player is not dead
        if (gameOverTimer.IsSet())
        {
            gameOverTimer.UnSet();
        }
    }
    
    // restart if won (separate from game over)
    if (player && winTimer.IsSet() && KeyWasPressed(27))
    {
        Reset();
        InitTown();
    }
    
    // Check for Law School button hover and click
    {
        let buttonX = mainCanvasSize.x - 50;
        let buttonY = 25; // Position at top
        let buttonWidth = 80;
        let buttonHeight = 24;
        
        // Check if mouse is hovering over button
        lawSchoolButtonHover = (mousePos.x >= buttonX - buttonWidth/2 && mousePos.x <= buttonX + buttonWidth/2 &&
                               mousePos.y >= buttonY - buttonHeight/2 && mousePos.y <= buttonY + buttonHeight/2);
        
        // Check for Law School button click
        if (MouseWasPressed() && lawSchoolButtonHover)
        {
            OpenLawSchoolModal();
        }
    }
    
    // Check for Store button hover and click
    {
        let buttonX = mainCanvasSize.x - 50;
        let buttonY = 25 + 32; // Position below law school button
        let buttonWidth = 80;
        let buttonHeight = 24;
        
        // Check if mouse is hovering over button
        storeButtonHover = (mousePos.x >= buttonX - buttonWidth/2 && mousePos.x <= buttonX + buttonWidth/2 &&
                            mousePos.y >= buttonY - buttonHeight/2 && mousePos.y <= buttonY + buttonHeight/2);
        
        // Check for Store button click
        if (MouseWasPressed() && storeButtonHover)
        {
            OpenStoreModal();
        }
    }
    
    // Check for inventory button hover and click
    // Don't allow inventory to open if dialogue modal is open
    if (!inventoryOpen && !(typeof IsDialogueModalOpen !== 'undefined' && IsDialogueModalOpen()))
    {
        let invButtonX = 40;
        let invButtonY = 140;
        let invButtonWidth = 30;
        let invButtonHeight = 30;
        
        // Check if mouse is hovering over inventory button
        inventoryButtonHover = (mousePos.x >= invButtonX - invButtonWidth/2 && mousePos.x <= invButtonX + invButtonWidth/2 &&
                               mousePos.y >= invButtonY - invButtonHeight/2 && mousePos.y <= invButtonY + invButtonHeight/2);
        
        // Check for inventory button click
        if (MouseWasPressed() && inventoryButtonHover)
        {
            inventoryOpen = true;
        }
    }
    else
    {
        // Reset hover state when inventory or dialogue is open
        inventoryButtonHover = false;
    }
    
    // Check for calendar button hover and click
    // Don't allow calendar to open if dialogue modal is open
    if (!calendarOpen && !(typeof IsDialogueModalOpen !== 'undefined' && IsDialogueModalOpen()))
    {
        let calButtonX = 40;
        let calButtonY = 175;
        let calButtonWidth = 30;
        let calButtonHeight = 30;
        
        // Check if mouse is hovering over calendar button
        calendarButtonHover = (mousePos.x >= calButtonX - calButtonWidth/2 && mousePos.x <= calButtonX + calButtonWidth/2 &&
                              mousePos.y >= calButtonY - calButtonHeight/2 && mousePos.y <= calButtonY + calButtonHeight/2);
        
        // Check for calendar button click
        if (MouseWasPressed() && calendarButtonHover)
        {
            calendarOpen = true;
            // Sync calendar view with current date
            if (gameTime)
            {
                calendarViewYear = typeof GetCurrentYear !== 'undefined' ? GetCurrentYear(gameTime) : (gameTime.daysElapsed >= 0 ? 1 : 0);
                calendarViewMonth = gameTime.month;
            }
        }
    }
    else
    {
        // Reset hover state when calendar or dialogue is open
        calendarButtonHover = false;
    }
    
    // Check for map button hover and click
    // Don't allow map to toggle if dialogue modal or judgment modal is open
    if (!(typeof IsDialogueModalOpen !== 'undefined' && IsDialogueModalOpen()) && !(typeof IsJudgmentModalOpen !== 'undefined' && IsJudgmentModalOpen()))
    {
        let mapButtonX = 40;
        let mapButtonY = 210;
        let mapButtonWidth = 30;
        let mapButtonHeight = 30;
        
        // Check if mouse is hovering over map button
        mapButtonHover = (mousePos.x >= mapButtonX - mapButtonWidth/2 && mousePos.x <= mapButtonX + mapButtonWidth/2 &&
                         mousePos.y >= mapButtonY - mapButtonHeight/2 && mousePos.y <= mapButtonY + mapButtonHeight/2);
        
        // Check for map button click
        if (MouseWasPressed() && mapButtonHover)
        {
            townMapVisible = !townMapVisible;
        }
    }
    else
    {
        // Reset hover state when dialogue or judgment modal is open
        mapButtonHover = false;
    }
    
    // Check for inventory key press (I key = 73)
    // Don't open inventory if dialogue modal or judgment modal is open
    if (KeyWasPressed(73) && !(typeof IsDialogueModalOpen !== 'undefined' && IsDialogueModalOpen()) && !(typeof IsJudgmentModalOpen !== 'undefined' && IsJudgmentModalOpen()))
    {
        if (inventoryOpen) {
            inventoryDropMode = false; // Reset drop mode when closing
        }
        inventoryOpen = !inventoryOpen;
    }
    
    // Check for calendar key press (C key = 67)
    // Don't open calendar if dialogue modal or judgment modal is open
    if (KeyWasPressed(67) && !(typeof IsDialogueModalOpen !== 'undefined' && IsDialogueModalOpen()) && !(typeof IsJudgmentModalOpen !== 'undefined' && IsJudgmentModalOpen()))
    {
        if (calendarOpen) {
            calendarSelectedDate = null; // Reset selected date when closing
        } else {
            // Sync calendar view with current date when opening
            if (gameTime)
            {
                calendarViewYear = typeof GetCurrentYear !== 'undefined' ? GetCurrentYear(gameTime) : (gameTime.daysElapsed >= 0 ? 1 : 0);
                calendarViewMonth = gameTime.month;
            }
        }
        calendarOpen = !calendarOpen;
    }
    
    // Check for town map key press (M key = 77)
    // Don't toggle map if dialogue modal or judgment modal is open
    if (KeyWasPressed(77) && !(typeof IsDialogueModalOpen !== 'undefined' && IsDialogueModalOpen()) && !(typeof IsJudgmentModalOpen !== 'undefined' && IsJudgmentModalOpen()))
    {
        townMapVisible = !townMapVisible;
    }
    
    // Close inventory with Escape key
    // Don't close inventory if dialogue modal, judgment modal, evidence naming modal, or evidence view modal is open (ESC closes those instead)
    if (inventoryOpen && KeyWasPressed(27) && !(typeof IsDialogueModalOpen !== 'undefined' && IsDialogueModalOpen()) && !(typeof IsJudgmentModalOpen !== 'undefined' && IsJudgmentModalOpen()) && !evidenceNamingModalOpen && !evidenceViewModalOpen)
    {
        inventoryOpen = false;
        inventoryDropMode = false; // Reset drop mode when closing
    }
    
    // Update calendar
    if (typeof UpdateCalendar !== 'undefined')
    {
        UpdateCalendar();
    }
    
    // Update success notification (must run every frame to update timer)
    if (typeof UpdateSuccessNotification !== 'undefined')
    {
        UpdateSuccessNotification();
    }
    
    if (typeof UpdateLoadingNotification !== 'undefined')
    {
        UpdateLoadingNotification();
    }
    
    // Check for rent payment due (07:03 on the 28th of every month)
    // Initialize flag if not exists
    if (typeof rentCheckDoneToday === 'undefined')
    {
        window.rentCheckDoneToday = false;
        window.lastRentCheckDay = -1;
    }
    
    // Reset flag when day changes
    if (gameTime && window.lastRentCheckDay !== gameTime.dayOfMonth)
    {
        window.rentCheckDoneToday = false;
        window.lastRentCheckDay = gameTime.dayOfMonth;
    }
    
    // Check for rent payment
    if (gameTime && playerData && !playerData.rentPaidThisMonth && 
        gameTime.dayOfMonth === 28 && 
        gameTime.gameHour >= 7.03 &&
        !window.rentCheckDoneToday)
    {
        // Only trigger if rent modal is not already open
        if (typeof IsRentModalOpen === 'undefined' || !IsRentModalOpen())
        {
            window.rentCheckDoneToday = true;
            if (typeof ShowRentModal !== 'undefined')
            {
                ShowRentModal();
            }
        }
    }
    
    // Check for random penalty at 07:05 (3% chance daily)
    // Initialize flag if not exists
    if (typeof penaltyCheckDoneToday === 'undefined')
    {
        window.penaltyCheckDoneToday = false;
        window.lastPenaltyCheckDay = -1;
    }
    
    // Reset flag when day changes
    if (gameTime && window.lastPenaltyCheckDay !== gameTime.dayOfMonth)
    {
        window.penaltyCheckDoneToday = false;
        window.lastPenaltyCheckDay = gameTime.dayOfMonth;
    }
    
    // Check for random penalty
    if (gameTime && playerData && 
        gameTime.gameHour >= 7.05 && 
        gameTime.gameHour < 7.06 &&
        !window.penaltyCheckDoneToday)
    {
        // Only trigger if penalty modal is not already open and rent modal is not open
        if ((typeof IsPenaltyModalOpen === 'undefined' || !IsPenaltyModalOpen()) &&
            (typeof IsRentModalOpen === 'undefined' || !IsRentModalOpen()))
        {
            window.penaltyCheckDoneToday = true;
            
            // 3% chance
            if (Math.random() < 0.03)
            {
                if (typeof ShowPenaltyModal !== 'undefined')
                {
                    ShowPenaltyModal();
                }
            }
        }
    }
        
}

function PreRender()
{
    // Show loading screen if world is being generated
    if (isLoadingWorld)
    {
        RenderLoadingScreen();
        return;
    }
    
    // Don't render if player doesn't exist yet
    if (!player)
        return;
    
    // camera is always centered on player
    cameraPos.Copy(player.pos);
    
        // Calculate day/night lighting based on game time
        if (gameTime && !currentInterior)
        {
            let hour = gameTime.GetHour();
            // Brightest at noon (12:00), darkest at midnight (00:00)
            // Use cosine for smooth transition: brightness = 0.3 + 0.7 * (1 - |hour - 12| / 12)
            let brightness = 0.3 + 0.7 * (1 - Math.abs(hour - 12) / 12);
            brightness = Clamp(brightness, 0.2, 1.0); // Clamp between 20% and 100%
            levelColor = baseLevelColor.Clone(brightness); // Clone with brightness scale
        }
    else if (currentInterior)
    {
        // Interiors use their own tint, but can still be affected by time
        // For now, keep interior tint as-is
    }
    
    // clear canvas to level color
    mainCanvasContext.fillStyle=levelColor.RGBA();
    mainCanvasContext.fillRect(0,0,mainCanvasSize.x, mainCanvasSize.y);
    
    // Apply sleep fade overlay if active
    if (sleepFadeActive)
    {
        let elapsed = 1.0 + sleepFadeTimer.Get(); // Get elapsed time (0 to 1.0)
        let opacity = 0;
        
        if (elapsed < 0.5)
        {
            // Fade out: 0 to 1 over first 0.5 seconds
            opacity = elapsed * 2.0;
        }
        else
        {
            // Fade in: 1 to 0 over second 0.5 seconds
            opacity = 2.0 - (elapsed * 2.0);
        }
        
        opacity = Clamp(opacity, 0, 1);
        mainCanvasContext.fillStyle = `rgba(0,0,0,${opacity})`;
        mainCanvasContext.fillRect(0,0,mainCanvasSize.x, mainCanvasSize.y);
    }
    
    // Apply game over fade to black overlay if active
    if (gameOverFadeActive)
    {
        let elapsed = 1.0 + gameOverFadeTimer.Get(); // Get elapsed time (0 to 1.0)
        // Fade out: 0 to 1 over 1 second, then stay at 1.0
        let opacity = Math.min(elapsed, 1.0);
        opacity = Clamp(opacity, 0, 1);
        mainCanvasContext.fillStyle = `rgba(0,0,0,${opacity})`;
        mainCanvasContext.fillRect(0,0,mainCanvasSize.x, mainCanvasSize.y);
    }
    
    // draw the level (bottom layer)
    if (currentInterior)
    {
        // Render interior with tint
        currentInterior.Render();
    }
    else
    {
        level.Render();
    }
}

function PostRender()
{  
    UpdateTransiton();
    
    // Display calendar-style time and date (top-left, center-aligned)
    if (gameTime)
    {
        let x = 40; // Fixed left position
        let y = 10; // Start from top
        
        // Time at top (small) - center-aligned with other elements
        DrawText(gameTime.FormatTime(), x, y, 10, 'center', 1, '#FFF', '#000');
        
        // Month below time (medium) - center-aligned with other elements
        DrawText(gameTime.GetMonthName().toUpperCase(), x, y + 18, 12, 'center', 1, '#FFF', '#000');
        
        // Date number in middle (large) - center-aligned
        DrawText(gameTime.dayOfMonth.toString(), x, y + 42, 28, 'center', 1, '#FFF', '#000');
        
        // Day of week at bottom (medium) - same distance from date as month, center-aligned
        DrawText(gameTime.GetDayName().substring(0, 3).toUpperCase(), x, y + 66, 12, 'center', 1, '#FFF', '#000');
    }
    
    // Coin display HUD (below time/date, above inventory button)
    {
        let coinDisplayX = 40;
        let coinDisplayY = 105;
        let coinDisplayWidth = 60;
        let coinDisplayHeight = 24;
        
        // Draw background box
        mainCanvasContext.fillStyle = '#333';
        mainCanvasContext.fillRect(coinDisplayX - coinDisplayWidth/2, coinDisplayY - coinDisplayHeight/2, coinDisplayWidth, coinDisplayHeight);
        
        // Draw border
        mainCanvasContext.strokeStyle = '#FFF';
        mainCanvasContext.lineWidth = 1;
        mainCanvasContext.strokeRect(coinDisplayX - coinDisplayWidth/2, coinDisplayY - coinDisplayHeight/2, coinDisplayWidth, coinDisplayHeight);
        
        // Draw coin count as "$x" format
        // If player is dead and coins are negative, display $0 instead
        let coinCount = playerData ? playerData.coins : 0;
        if (player && player.IsDead() && coinCount < 0) {
            coinCount = 0;
        }
        let coinText = '$' + coinCount.toString();
        DrawText(coinText, coinDisplayX, coinDisplayY, 12, 'center', 1, '#4F4', '#000');
    }
    
    // Inventory button (below coin display)
    {
        let invButtonX = 40;
        let invButtonY = 140;
        let invButtonWidth = 30;
        let invButtonHeight = 30;
        
        // Draw button background (hover state is set in Update())
        let bgColor = inventoryButtonHover ? '#48F' : '#248';
        mainCanvasContext.fillStyle = bgColor;
        mainCanvasContext.fillRect(invButtonX - invButtonWidth/2, invButtonY - invButtonHeight/2, invButtonWidth, invButtonHeight);
        
        // Draw button border
        mainCanvasContext.strokeStyle = '#FFF';
        mainCanvasContext.lineWidth = 2;
        mainCanvasContext.strokeRect(invButtonX - invButtonWidth/2, invButtonY - invButtonHeight/2, invButtonWidth, invButtonHeight);
        
        // Draw button text (lowercase 'i')
        DrawText('i', invButtonX, invButtonY, 16, 'center', 1, '#FFF', '#000');
    }
    
    // Calendar button (below inventory button)
    {
        let calButtonX = 40;
        let calButtonY = 175;
        let calButtonWidth = 30;
        let calButtonHeight = 30;
        
        // Draw button background (hover state is set in Update())
        let bgColor = calendarButtonHover ? '#48F' : '#248';
        mainCanvasContext.fillStyle = bgColor;
        mainCanvasContext.fillRect(calButtonX - calButtonWidth/2, calButtonY - calButtonHeight/2, calButtonWidth, calButtonHeight);
        
        // Draw button border
        mainCanvasContext.strokeStyle = '#FFF';
        mainCanvasContext.lineWidth = 2;
        mainCanvasContext.strokeRect(calButtonX - calButtonWidth/2, calButtonY - calButtonHeight/2, calButtonWidth, calButtonHeight);
        
        // Draw button text ('C')
        DrawText('C', calButtonX, calButtonY, 16, 'center', 1, '#FFF', '#000');
    }
    
    // Map button (below calendar button)
    {
        let mapButtonX = 40;
        let mapButtonY = 210;
        let mapButtonWidth = 30;
        let mapButtonHeight = 30;
        
        // Draw button background (hover state is set in Update())
        let bgColor = mapButtonHover ? '#48F' : '#248';
        mainCanvasContext.fillStyle = bgColor;
        mainCanvasContext.fillRect(mapButtonX - mapButtonWidth/2, mapButtonY - mapButtonHeight/2, mapButtonWidth, mapButtonHeight);
        
        // Draw button border
        mainCanvasContext.strokeStyle = '#FFF';
        mainCanvasContext.lineWidth = 2;
        mainCanvasContext.strokeRect(mapButtonX - mapButtonWidth/2, mapButtonY - mapButtonHeight/2, mapButtonWidth, mapButtonHeight);
        
        // Draw button text ('M')
        DrawText('M', mapButtonX, mapButtonY, 16, 'center', 1, '#FFF', '#000');
    }
    
    // Law School button (top-right)
    {
        let buttonX = mainCanvasSize.x - 50;
        let buttonY = 25; // Position at top
        let buttonWidth = 80;
        let buttonHeight = 24;
        
        // Draw button background (hover state is set in Update())
        let bgColor = lawSchoolButtonHover ? '#4A4' : '#484';
        mainCanvasContext.fillStyle = bgColor;
        mainCanvasContext.fillRect(buttonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
        
        // Draw button border
        mainCanvasContext.strokeStyle = '#FFF';
        mainCanvasContext.lineWidth = 2;
        mainCanvasContext.strokeRect(buttonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
        
        // Draw button text
        DrawText('Law School', buttonX, buttonY, 8, 'center', 1, '#FFF', '#000');
    }
    
    // Store button (below law school button)
    {
        let buttonX = mainCanvasSize.x - 50;
        let buttonY = 25 + 32; // Position below law school button
        let buttonWidth = 80;
        let buttonHeight = 24;
        
        // Draw button background (hover state is set in Update())
        let bgColor = storeButtonHover ? '#4A4' : '#484';
        mainCanvasContext.fillStyle = bgColor;
        mainCanvasContext.fillRect(buttonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
        
        // Draw button border
        mainCanvasContext.strokeStyle = '#FFF';
        mainCanvasContext.lineWidth = 2;
        mainCanvasContext.strokeRect(buttonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
        
        // Draw button text
        DrawText('Store', buttonX, buttonY, 8, 'center', 1, '#FFF', '#000');
    }
    
    // centered hud text (only show if game over modal is not open)
    let bigText = '';
    if (paused)
        bigText = '-paused-'
    if (winTimer.IsSet())
        bigText = 'You Win!';
    // Don't show "Game Over!" text if modal is open (modal handles display)
    if (player && player.IsDead() && !gameOverModalOpen)
    {
        bigText = 'Game Over!'
        // Show countdown or "Press OK" message
        if (gameOverTimer.IsSet() && !gameOverTimer.Elapsed())
        {
            let timeLeft = Math.max(0, Math.ceil(-gameOverTimer.Get())); // Get() returns negative, so negate it
            if (timeLeft > 0)
            {
                DrawText(`Restarting in ${timeLeft}...`, mainCanvasSize.x/2, mainCanvasSize.y/2+80, 42);
            }
            else
            {
                DrawText('Press OK', mainCanvasSize.x/2, mainCanvasSize.y/2+80, 42);
            }
        }
        else
        {
            DrawText('Press OK', mainCanvasSize.x/2, mainCanvasSize.y/2+80, 42);
        }
    }  
    if (bigText)
        DrawText(bigText,mainCanvasSize.x/2, mainCanvasSize.y/2-80, 72, 'center', 2, '#FFF');
   
    if (speedRunMode)
    {
        // show time if speed run mode is activated
        let c = (player && (player.IsDead() || winTimer.IsSet()))? '#F00' : '#000';
        DrawText(FormatTime(speedRunTime), mainCanvas.width/2, 28, 40, 'center',1,c);
    }

    RenderMap();
    
    // Display "F" prompt when near bed
    if (player && player.nearBed)
    {
        // Draw "F" prompt above player
        let promptPos = player.pos.Clone();
        promptPos.Subtract(cameraPos).Multiply(tileSize*cameraScale);
        promptPos.Add(mainCanvasSize.Clone(.5));
        promptPos.y -= 40; // Above player
        DrawText('F', promptPos.x|0, promptPos.y|0, 24, 'center', 1, '#FFF', '#000');
    }
    
    // Render inventory modal if open
    if (inventoryOpen)
    {
        RenderInventoryModal();
    }
    
    // Render calendar modal if open
    if (calendarOpen && typeof RenderCalendarModal !== 'undefined')
    {
        RenderCalendarModal();
    }
    
    // Render evidence naming modal if open
    if (evidenceNamingModalOpen)
    {
        RenderEvidenceNamingModal();
    }
    
    // Render evidence view modal if open
    if (evidenceViewModalOpen)
    {
        RenderEvidenceViewModal();
    }
    
    // Render success notification last (so it appears on top of everything)
    if (typeof RenderSuccessNotification !== 'undefined')
    {
        RenderSuccessNotification();
    }
    
    if (typeof RenderLoadingNotification !== 'undefined')
    {
        RenderLoadingNotification();
    }
    
    // mouse cursor (rendered last so it appears on top of everything, including modals)
    mainCanvas.style.cursor='none'; 
    let mx = mousePos.x|0;
    let my = mousePos.y|0;
    let mw = 2;
    let mh = 15;
    mainCanvasContext.globalCompositeOperation = 'difference';
    mainCanvasContext.fillStyle='#FFF'
    mainCanvasContext.fillRect(mx-mw,my-mh,mw*2,mh*2);
    mainCanvasContext.fillRect(mx-mh,my-mw,mh*2,mw*2);
    mainCanvasContext.globalCompositeOperation = 'source-over';
}

function MazeDataPos(pos)
{
    // get the index into the maze array
    let cellRatio = levelMazeSize / levelSize;
    pos = pos.Clone(cellRatio);
    return (pos.x|0) + (pos.y|0) * levelMazeSize;
}

function RenderMap()
{
    // Only show town map when toggled on and not in interior
    if (!townMapVisible || currentInterior)
        return;
    
    // Map dimensions
    let mapSize = 140; // Fixed size
    let mapPadding = 10;
    let mapX = mapPadding;
    let mapY = mainCanvasSize.y - mapSize - mapPadding;
    
    // Grid is 4x4 cells
    let gridSize = 4;
    let cellSize = mapSize / gridSize;
    
    // Calculate world cell size (same as in GenerateTown)
    let worldCellSize = levelSize / 4;
    
    // Draw semi-transparent background
    mainCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
    mainCanvasContext.fillRect(mapX, mapY, mapSize, mapSize);
    
    // Draw grid cells and collect buildings
    let cellBuildings = []; // Array of arrays: cellBuildings[cellY][cellX] = [address1, address2, ...]
    
    // Initialize cell arrays
    for(let cy = 0; cy < gridSize; cy++)
    {
        cellBuildings[cy] = [];
        for(let cx = 0; cx < gridSize; cx++)
        {
            cellBuildings[cy][cx] = [];
        }
    }
    
    // Get all buildings and map them to grid cells
    for(let obj of gameObjects)
    {
        if (obj.isBuilding && obj.address !== null && obj.address !== undefined)
        {
            // Calculate which grid cell this building is in
            let cellX = Math.floor(obj.pos.x / worldCellSize);
            let cellY = Math.floor(obj.pos.y / worldCellSize);
            
            // Clamp to valid grid range (0-3)
            cellX = Math.max(0, Math.min(3, cellX));
            cellY = Math.max(0, Math.min(3, cellY));
            
            // Add address to cell
            cellBuildings[cellY][cellX].push(obj.address);
        }
    }
    
    // Calculate player's grid cell
    let playerCellX = -1;
    let playerCellY = -1;
    if (player && !currentInterior)
    {
        playerCellX = Math.floor(player.pos.x / worldCellSize);
        playerCellY = Math.floor(player.pos.y / worldCellSize);
        playerCellX = Math.max(0, Math.min(3, playerCellX));
        playerCellY = Math.max(0, Math.min(3, playerCellY));
    }
    
    // Draw grid cells
    for(let cy = 0; cy < gridSize; cy++)
    {
        for(let cx = 0; cx < gridSize; cx++)
        {
            let cellX = mapX + cx * cellSize;
            let cellY = mapY + cy * cellSize;
            
            // Highlight player's cell
            if (cx === playerCellX && cy === playerCellY)
            {
                mainCanvasContext.fillStyle = 'rgba(74, 255, 74, 0.3)';
                mainCanvasContext.fillRect(cellX, cellY, cellSize, cellSize);
            }
            
            // Draw cell border
            mainCanvasContext.strokeStyle = '#666';
            mainCanvasContext.lineWidth = 1;
            mainCanvasContext.strokeRect(cellX, cellY, cellSize, cellSize);
            
            // Draw address numbers in this cell (stacked vertically)
            let addresses = cellBuildings[cy][cx];
            if (addresses.length > 0)
            {
                // Sort addresses for consistent display
                addresses.sort((a, b) => a - b);
                
                // Calculate font size based on cell size and number of addresses
                let fontSize = Math.min(8, Math.floor(cellSize / (addresses.length + 1)));
                fontSize = Math.max(6, fontSize); // Minimum readable size
                
                // Calculate spacing between stacked numbers
                let totalHeight = addresses.length * fontSize * 1.2; // 1.2 for line spacing
                let startY = cellY + cellSize/2 - totalHeight/2 + fontSize/2;
                
                // Draw each address number stacked vertically
                for(let i = 0; i < addresses.length; i++)
                {
                    let addressY = startY + i * fontSize * 1.2;
                    DrawText(addresses[i].toString(), cellX + cellSize/2, addressY, fontSize, 'center', 1, '#FFF', '#000');
                }
            }
        }
    }
    
    // Draw outer border
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(mapX, mapY, mapSize, mapSize);
}

///////////////////////////////////////////////////////////////////////////////
// game objects

class MyGameObject extends GameObject
{
    constructor(pos,tileX=0,tileY=0,size=.5,collisionSize=0,health=1)
    {
        super(pos,tileX,tileY,size,collisionSize,health);
        this.walkFrame=0;
        this.rotation=1;
        this.radarSize=1;
        this.isInvisible = 0;
        this.bloodColor = new Color(.8,0,.05,.5);
        this.bloodAdditive = 0;
    }
    
    UpdateWalk()
    {
        // footprints
        let lastWalkFrame = this.walkFrame;
        this.walkFrame += 1.5*this.velocity.Length();
        if (lastWalkFrame%2 < 1 && this.walkFrame%2 >1 || this.walkFrame%2 < lastWalkFrame%2)
        {
            let isOnSand = this.IsOnSand();
            let angle = this.rotation * PI/2;
            let side = this.walkFrame%2 < lastWalkFrame%2? 1 : -1
            let offset = (new Vector2(0,side/8)).Rotate(angle);
            let footPos = this.pos.Clone().Add(offset);
            let c = isOnSand?'#4215':'#2223';
            let s = new Vector2(.2,isOnSand?.2:.1);
            if (isOnSand)
            {
                s.y*=RandBetween(1,1.5);
                s.x*=RandBetween(1,1.5);
            }
            footPos.y+=.3;
            level.DrawEllipse(footPos,s,c,angle);
        }
    }
    
    BloodSplat(scale=1,particles=1)
    {
        // draw a bunch of random ellipses
        if (this.bloodAdditive)
            levelCanvasContext.globalCompositeOperation='screen';
        for(let i=30;i--;)
        {
            let pos = this.pos.Clone().Add(RandVector(Rand(scale*this.size.x)));
            let size = new Vector2(this.size.x*RandBetween(.2,.5),this.size.y*RandBetween(.2,.5))
            let angle = RandBetween(0,2*PI);
            level.DrawEllipse(pos,size.Multiply(scale),this.bloodColor.RGBA(),angle); 
        }  
        levelCanvasContext.globalCompositeOperation='source-over';

        // kick off a particle effect
        if (particles)
        {
            let s = scale*this.size.x;
            let p = new ParticleEmitter
            (
                this.pos, s*.6, s*.2, // pos, emitter size, particle size
                this.bloodColor.Clone().SetAlpha(1), 
                this.bloodColor.Clone(this.bloodAdditive?3:.5).SetAlpha(1)
            );
        }
    }
    
    Kill()
    {
        this.BloodSplat();
        PlaySound(9);
        super.Kill();
    }
    
    Render()
    {
        // invisible objects become visible when damaged
        if (this.isInvisible && !shadowRenderPass && !hitRenderPass)
            mainCanvasContext.globalAlpha= .1 + this.GetDamageFlashPercent();
        super.Render();
    }
    
    IsOnSand() { return level.GetDataFromPos(this.pos).type == 2; }
}
    
class Player extends MyGameObject
{
    constructor(pos) 
    {
        super(pos,0,4,.5,.4,playerData.healthMax);
        this.health = playerData.health;
        this.dashTimer = new Timer();
        this.throwTimer = new Timer();
        this.inputTimer = new Timer();
        this.playerDamageTimer = new Timer();
        this.inputTimer.Set();
        this.throwRotation = 0;
        this.posBuffer = [];
        this.dashWaitTime = 3;
        this.radarSize=2;
        this.nearBed = 0; // Flag for bed interaction
        this.nearNPC = null; // Nearest NPC for dialogue interaction
    }
    
    IsDashing() { return !this.dashTimer.Elapsed(); }
    
    CollideLevel(data, pos)
    {
        // destroy level if dashing
        if (this.IsDashing())
            return DestroyLevelObject(pos);
        else
            return super.CollideLevel(data, pos);
    }
    
    IsIntro() { return false; }
    
    Update() 
    {
        // Check if player has left town bounds - kill them if so
        if (this.pos.x < 0 || this.pos.x >= levelSize || this.pos.y < 0 || this.pos.y >= levelSize)
        {
            this.Kill();
            return;
        }
        
        // keep player data updated
        playerData.health = this.health;
        if (this.IsDead() || this.IsIntro())
        {
            // stop and do no more
            return;
        }
        
        // Don't process input if game over modal is open
        if (gameOverModalOpen)
        {
            this.nearBed = 0;
            this.nearNPC = null;
            super.Update();
            return;
        }
        
        // Don't process input if dialogue modal is open
        if (typeof IsDialogueModalOpen !== 'undefined' && IsDialogueModalOpen())
        {
            this.nearBed = 0;
            this.nearNPC = null;
            super.Update();
            return;
        }
        
        // Don't process input if judgment modal is open
        if (typeof IsJudgmentModalOpen !== 'undefined' && IsJudgmentModalOpen())
        {
            this.nearBed = 0;
            this.nearNPC = null;
            super.Update();
            return;
        }
        
        if (this.health <= 1 && healthWarning.Get() > this.health)
        {
            // health warning
            healthWarning.Set();
            PlaySound(11);
        }
    
        // Don't allow boomerang throw if inventory modal is open
        if (MouseWasPressed() && (playerData.boomerangs|| playerData.bigBoomerangs) && !inventoryOpen)
        {
            // throw boomerang
            let isBig = 0;
            if (playerData.bigBoomerangs)
            {
                --playerData.bigBoomerangs;
                isBig = 1;
                // Remove from inventory immediately when thrown
                playerData.RemoveFromInventory('bigBoomerang', 1);
            }
            else
            {
                --playerData.boomerangs;
                // Remove from inventory immediately when thrown
                playerData.RemoveFromInventory('boomerang', 1);
            }
            let b = new Boomerang(this.pos,isBig);
            this.throwRotation= b.Throw(this, mousePosWorld);
            this.throwTimer.Set(.4);
        }
    
        // move input
        let acceleration = new Vector2();
        if (KeyIsDown(65))
            acceleration.x -= 1,this.rotation=0;
        if (KeyIsDown(68))
            acceleration.x += 1,this.rotation=2;
        if (KeyIsDown(87))
            acceleration.y -= 1,this.rotation=3;
        if (KeyIsDown(83))
            acceleration.y += 1,this.rotation=1;

        let isOnSand = this.IsOnSand();
        if (this.IsDashing())
        {
            // update dash
            if (!acceleration.x && !acceleration.y)
                acceleration.Set(-1,0).Rotate(-this.rotation*PI/2);
        
            // no damage or slow from sand while dashing
            this.damageTimer.Set();
            isOnSand = 0;
            
            // track players position for the dash render effect
            if (frame%3==0)
                this.posBuffer.push(this.pos.Clone());
            if (this.posBuffer.length > 20)
                this.posBuffer.shift();
        }
        else
        {
            // update non dash
            this.posBuffer = [];
            
            if (this.dashTimer.IsSet() && this.dashTimer.Get()>this.dashWaitTime)
            {
                // play sound when dash is ready again
                this.dashTimer.UnSet();
                PlaySound(16);
            }
        
            if ((KeyWasPressed(32)||KeyWasPressed(16)) && !this.dashTimer.IsSet())
            {
                // start dash
                PlaySound(12);
                this.dashTimer.Set(.5);
            }
        }
        
        if (acceleration.x || acceleration.y)
        {
            // apply acceleration
            acceleration.Normalize(.016*(isOnSand?.5:1));
            if (this.IsDashing())
                acceleration.Multiply(2);
            this.velocity.Add(acceleration);
            this.inputTimer.Set();
        }
        
        // reset walk frame when input isnt pressed for a while
        if (this.inputTimer.Get() > 1)
            this.walkFrame = 0;
             
        // update walk if not throwing or dashing
        if (this.throwTimer.Elapsed() && !this.IsDashing())
           this.UpdateWalk();
        
        // Check for building entry/exit
        if (currentInterior)
        {
            // Check for exit (middle of bottom edge)
            ExitInterior();
            
            // Check for bed interaction in home interior
            // Note: ExitInterior() might have set currentInterior to null, so check again
            if (currentInterior && currentInterior.bedPosition)
            {
                let bedDistance = this.pos.Distance(currentInterior.bedPosition);
                if (bedDistance < 1.5) // Within 1.5 tiles of bed
                {
                    this.nearBed = 1;
                    this.nearNPC = null; // Bed takes priority
                    // Check for F key press to sleep
                    if (KeyWasPressed(70)) // F key
                    {
                        Sleep();
                    }
                }
                else
                {
                    this.nearBed = 0;
                    // Check for nearby NPCs in interior
                    this.nearNPC = GetNearestNPC(this.pos, 1.0);
                    if (this.nearNPC && KeyWasPressed(70) && typeof OpenDialogueModal !== 'undefined')
                    {
                        OpenDialogueModal(this.nearNPC);
                    }
                    // Check for nearby judge in interior (courthouse only)
                    let nearJudge = GetNearestJudge(this.pos, 1.0);
                    if (nearJudge && KeyWasPressed(70) && typeof OpenDialogueModal !== 'undefined')
                    {
                        OpenDialogueModal(nearJudge);
                    }
                }
            }
            else
            {
                this.nearBed = 0;
                // Check for nearby NPCs in interior
                this.nearNPC = GetNearestNPC(this.pos, 1.0);
                if (this.nearNPC && KeyWasPressed(70) && typeof OpenDialogueModal !== 'undefined')
                {
                    OpenDialogueModal(this.nearNPC);
                }
                // Check for nearby judge in interior (courthouse only)
                let nearJudge = GetNearestJudge(this.pos, 1.0);
                if (nearJudge && KeyWasPressed(70) && typeof OpenDialogueModal !== 'undefined')
                {
                    OpenDialogueModal(nearJudge);
                }
            }
        }
        else
        {
            this.nearBed = 0;
            // Check for nearby NPCs outdoors
            this.nearNPC = GetNearestNPC(this.pos, 1.0);
            if (this.nearNPC && KeyWasPressed(70) && typeof OpenDialogueModal !== 'undefined')
            {
                OpenDialogueModal(this.nearNPC);
            }
            // Check for building entry (touch south face)
            // Don't allow entry if we just exited (cooldown period)
            if (interiorExitCooldown.Elapsed())
            {
                gameObjects.forEach(obj => {
                    if (obj.isBuilding)
                    {
                        let southEdge = obj.pos.y + obj.size.y;
                        let buildingWidth = obj.size.x;
                        
                        // Check if player is touching south face
                        if (this.pos.y >= southEdge - 0.3 && 
                            this.pos.y <= southEdge + 0.5 &&
                            Math.abs(this.pos.x - obj.pos.x) < buildingWidth)
                        {
                            EnterInterior(obj);
                        }
                    }
                });
            }
        }
        
        super.Update();
    }
    
    Render()
    {
        // Helper function to draw tile from custom image
        let DrawTileWithImage = (pos, size, tileX, tileY, angle, mirror, height, image) => {
            SetCanvasTransform(pos, size, angle, height);
            
            let drawImage = image;
            
            if (shadowRenderPass)
            {
                // For shadows with original tiles.png, use tileMaskCanvas
                if (image === tileImage)
                {
                    drawImage = tileMaskCanvas;
                    mainCanvasContext.globalAlpha *= shadowAlpha;
                    tileX += tileImage.width / tileSize; // shift over to shadow position
                }
                else if (image === tileImage5 || image === tileImage6)
                {
                    // For custom skins, use tileMaskCanvas (same as default skin) instead of drawing sprite
                    drawImage = tileMaskCanvas;
                    mainCanvasContext.globalAlpha *= shadowAlpha;
                    tileX += tileImage.width / tileSize; // shift over to shadow position
                }
                else
                {
                    // For other custom images, we'll draw the sprite and darken it below
                    mainCanvasContext.globalAlpha *= shadowAlpha;
                }
            }
            else if (hitRenderPass)
            {
                // For hit effects (dash trail), use mask only for default sprite
                // Store skins must use their actual image because tileMaskCanvas only contains masks for tileImage
                if (image === tileImage)
                {
                    drawImage = tileMaskCanvas;
                }
                // For tileImage5 and tileImage6, keep using the actual skin image (drawImage = image)
            }
            
            let renderTileShrink = .25;
            let s = size.Clone(2 * tileSize);
            mainCanvasContext.scale(mirror ? -s.x : s.x, s.y);
            
            // Draw the sprite
            mainCanvasContext.drawImage(drawImage,
                tileX * tileSize + renderTileShrink,
                tileY * tileSize + renderTileShrink,
                tileSize - 2 * renderTileShrink,
                tileSize - 2 * renderTileShrink, -.5, -.5, 1, 1);
            
            // For skin shadows, apply darkening effect (only for non-mask custom images)
            if (shadowRenderPass && image !== tileImage && image !== tileImage5 && image !== tileImage6)
            {
                // Darken the shadow by using multiply blend mode with black
                mainCanvasContext.globalCompositeOperation = 'multiply';
                mainCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.8)';
                mainCanvasContext.fillRect(-.5, -.5, 1, 1);
                mainCanvasContext.globalCompositeOperation = 'source-over';
            }
            
            mainCanvasContext.restore();
            mainCanvasContext.globalAlpha = 1;
        };
    
        if (this.IsDead() || this.IsIntro())
        {
            // set to dead tile
            this.tileX = 7;
            this.tileY = 3;
            super.Render();
            return;
        }   
        
        // Check if using a skin
        let useSkin = playerData.currentSkin !== null && playerData.currentSkin !== undefined;
        let skinImage = tileImage;
        let skinRow = 0;
        if (useSkin)
        {
            if (playerData.currentSkin >= 0 && playerData.currentSkin <= 5 && tileImage5 && tileImage5.complete)
            {
                // Skins 0-5 from tiles5.png
                skinImage = tileImage5;
                skinRow = playerData.currentSkin;
            }
            else if (playerData.currentSkin >= 6 && playerData.currentSkin <= 11 && tileImage6 && tileImage6.complete)
            {
                // Skins 6-11 from tiles6.png
                skinImage = tileImage6;
                skinRow = playerData.currentSkin - 6;
            }
            else
            {
                // Skin image not loaded yet, fall back to original
                useSkin = false;
            }
        }
        
        // figure out the tile, rotation and mirror
        let baseTileX, baseTileY;
        if (useSkin)
        {
            // For skins, tileY is the row (within the tileset), tileX is the column (0-7)
            baseTileY = skinRow;
            if (this.rotation&1)
            {
                // facing left or right
                baseTileX = this.rotation==1?2:3;
                this.mirror = this.walkFrame%2|0;
                if (!this.throwTimer.Elapsed()||!this.dashTimer.Elapsed())
                    baseTileX += 3; // throw/dash frame
                else if (this.inputTimer.Get() > 1 && this.rotation==1)
                {
                    // idle
                    baseTileX = 7;
                    this.mirror = (this.inputTimer.Get()/2|0)&1;
                }
            }
            else
            {
                // facing up or down
                this.mirror = this.rotation!=2;
                baseTileX = this.walkFrame%2|0;
                if (!this.throwTimer.Elapsed()||!this.dashTimer.Elapsed())
                    baseTileX = 4; // throw/dash frame
            }
            this.tileX = baseTileX;
            this.tileY = baseTileY;
        }
        else
        {
            // Original behavior
            this.tileY = 4;
            if (this.rotation&1)
            {
                // facing left or right
                // walk by toggling betwen 2 frames and mirror to face direction
                this.tileX = this.rotation==1?2:3;
                this.mirror = this.walkFrame%2|0;
                if (!this.throwTimer.Elapsed()||!this.dashTimer.Elapsed())
                    this.tileX += 3; // throw/dash frame
                else if (this.inputTimer.Get() > 1 && this.rotation==1)
                {
                    // idle
                    this.tileX = 7;
                    this.mirror = (this.inputTimer.Get()/2|0)&1;
                }
            }
            else
            {
                // facing up or down
                // walk by toggling mirror and select frame to face direction
                this.mirror = this.rotation!=2;
                this.tileX = this.walkFrame%2|0;
                if (!this.throwTimer.Elapsed()||!this.dashTimer.Elapsed())
                    this.tileX = 4; // throw/dash frame
            }
        }
           
        let hit = hitRenderPass;
        if (!this.throwTimer.Elapsed())
        {
            // use the throw rotation if throwing
            this.rotation = this.throwRotation;
            if (this.rotation&1)
                this.mirror = this.rotation==1;
        }
        
        // Draw function that uses skin image if applicable
        let DrawPlayerTile = (pos, size, tileX, tileY, angle, mirror, height) => {
            if (useSkin)
                DrawTileWithImage(pos, size, tileX, tileY, angle, mirror, height, skinImage);
            else
                DrawTile(pos, size, tileX, tileY, angle, mirror, height);
        };
        
        if (!shadowRenderPass && hit)
        {
            // draw the position buffer during the hit render pass when dashing
            mainCanvasContext.globalCompositeOperation = 'screen';
            for(let i=this.posBuffer.length;i--;)
            {
                hitRenderPass = hit*(i/this.posBuffer.length + .01);
                DrawPlayerTile(this.posBuffer[i],this.size,this.tileX,this.tileY,this.angle,this.mirror,this.height);
            }
            hitRenderPass = hit;
            mainCanvasContext.globalCompositeOperation = 'difference';
        }
    
        let d = this.dashTimer.Get();
        // Only show cooldown outline for original sprite, not for skins
        if (!shadowRenderPass && d<this.dashWaitTime+.5 && !useSkin)
        {
            // show a white outline around the player when dash is charging
            hitRenderPass = d<this.dashWaitTime?d/this.dashWaitTime:Math.sin((d-this.dashWaitTime)*PI*4);
            DrawPlayerTile(this.pos,this.size.Clone(1.1),this.tileX,this.tileY,this.angle,this.mirror,this.height);
            hitRenderPass = hit;
        }
        
        // Use custom render for skin, or default for original
        if (useSkin)
        {
            DrawPlayerTile(this.pos, this.size, this.tileX, this.tileY, this.angle, this.mirror, this.height);
        }
        else
        {
            super.Render();
        }
        
        if (playerData.boomerangs || playerData.bigBoomerangs)
        {
            // draw boomerang on player's back
            let x = playerData.bigBoomerangs?7:0;
            if (this.rotation == 3)
                DrawTile(this.pos,this.size,x,5);
            if (this.rotation%2==0)
                DrawTile(this.pos.Clone().AddXY(-(this.rotation-1)*.2,0),this.size.Clone(new Vector2(.6,1)),x,5);
        }
    }
    
    Damage(damage) 
    {
        // extra long damage timer for player
        if (!this.playerDamageTimer.Elapsed())
            return 0;
    
        // prepvent damage during intro/outro
        if (godMode || this.IsIntro() || winTimer.IsSet())
            return 0;
    
        // try to apply damage
        let damageDone = super.Damage(damage);
        if (!damageDone)
            return 0;
            
        this.BloodSplat();
        PlaySound(1);
        this.playerDamageTimer.Set(1);
        return damageDone;
    }
    
    Kill()                  
    {  
        this.BloodSplat(2);
        PlaySound(2);
        // Set health to 0 so IsDead() returns true (but don't call super.Kill() to avoid destroying player object)
        this.health = 0;
    }
}

///////////////////////////////////////////////////////////////////////////////

class Boomerang  extends MyGameObject
{
    constructor(pos,isBig=0) 
    {
        super(pos,isBig?7:0,5,.5,isBig?.45:.4);
            
        this.damping = .98;
        this.angle = 0;
        this.canDamageLevel = 1;
        this.heldPickup = 0;
        this.throwAccel = 0;
        this.throwFrames = 0;
        this.bounceObject = 0;
        this.isBig = isBig;
    }
    
    Throw(owner, targetPos)
    {
        PlaySound(7)
        this.throwFrames = this.isBig?9:8;
        this.throwAccel = targetPos.Clone().Subtract(owner.pos);
        this.throwAccel.Normalize(.04);
        this.angleVelocity = .5;
        this.height = this.angleVelocity/2;
        this.velocity = owner.velocity.Clone();
        return this.throwAccel.Rotation();
    }
    
    CollideLevel(data, pos)
    {
        if (data.object)
            this.damageTimer.Set(); // flash when it hits an object
        return DestroyLevelObject(pos,!this.isBig);
    }
    
    Update() 
    {
        if (this.throwFrames)
            this.throwFrames--;
    
        if (!this.angleVelocity)
        {
            // boomerang is on the ground
            this.radarSize=3;
            this.damageFlashTime = .8;
            this.differenceFlash = 0;
            if (this.heldPickup)
                this.heldPickup.isHeld=0;
            this.heldPickup=0;
            if (Rand() < .005 && this.damageTimer.Get() > 4*this.damageFlashTime)
                this.damageTimer.Set(-this.damageFlashTime/2); // sparkle
        }
        else
        {
        
            // apply throw acceleration
            let a = this.GetLifeTime();
            if (!mouseIsDown || !this.throwFrames)
                this.throwAccel=0;
            else if (this.throwAccel)
                this.velocity.Add(this.throwAccel);
        
            // reduce angular velocity
            this.angleVelocity -= .002;
            if (this.angleVelocity < .1)
            {
                // slow it down even faster
                this.angleVelocity -= .005;
                this.velocity.Multiply(.8);
                if (this.angleVelocity < 0)
                    this.angleVelocity = 0;
            }
            
            // height is proportional to angular velocity
            this.height = this.angleVelocity/2;
            if (!this.throwAccel && this.height > 0)
            {
                // pull to player
                let d = player.pos.Clone();
                d.Subtract(this.pos).Multiply(0.004 * this.angleVelocity);
                this.velocity.Add(d);
            }
            
            gameObjects.forEach(o=>
            {
                if (!this.isBig && o.isSmallPickup && o.GetLifeTime() > .5 && !o.isHeld && !this.heldPickup && o.IsTouching(this))
                {
                    // grab object
                    o.isHeld = 1;
                    this.heldPickup = o;
                }
                else if ((o.isEnemy||o.isStore) && o.IsTouching(this))
                {
                    // hit object
                    if (this.bounceObject == o || o.ReflectDamage(this.velocity))
                    {
                        if (this.bounceObject != o)
                        {
                            // reflect
                            PlaySound(15);
                            this.bounceObject = o;
                            this.velocity.Multiply(-.4);
                            this.angleVelocity*=.4;
                            this.damageTimer.Set();
                            this.throwAccel=0;
                        }
                    }
                    else if (o.Damage(1+this.isBig))
                    {
                        // apply damage
                        o.velocity.Add(this.velocity.Clone(.5));
                        this.damageTimer.Set();
                    }
                }
            });
        }
        
        // let player pick it up
        if ((!this.angleVelocity || this.GetLifeTime() > .5) && !player.IsDead() && player.Distance(this) < .6)
            this.Pickup();
        
        super.Update();

        // set all pickups to match our position
        if (this.heldPickup)
            this.heldPickup.pos.Copy(this.pos).AddXY(0,-.001);
    }
    
    Pickup()
    {
        PlaySound(6);
        if (this.isBig)
        {
            playerData.bigBoomerangs++;
            // Always add back to inventory when caught (whether returning or new)
            playerData.AddToInventory('bigBoomerang', 'Big Boomerang', 7, 5, 1);
        }
        else
        {
            playerData.boomerangs++;
            // Always add back to inventory when caught (whether returning or new)
            playerData.AddToInventory('boomerang', 'Boomerang', 0, 5, 1);
        }
        player.throwTimer.Set(.3);
        player.throwRotation=this.pos.Clone().Subtract(player.pos).Rotation();
        this.Destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

class Pickup extends MyGameObject
{
    // type: 0=half, 1=whole, 2=container, 3=coin, 4=large coin
    
    constructor(pos, type=0) 
    { 
        super(pos,2+type,5,.5,.3); 
        this.type = type;
        this.timeOffset = Rand(9);
        this.isSmallPickup = type != 2;
        this.isHeld=0;
        this.differenceFlash = 0;
        this.damageFlashTime = .8;
        this.radarSize = this.isSmallPickup?1:3;
    }
    
    Update() 
    {
        // random sparkles
        if (Rand() < .005 && this.damageTimer.Get() > 4*this.damageFlashTime)
            this.damageTimer.Set(-this.damageFlashTime/2);
        
        // bob up and down
        this.height = .1+.1*Math.sin(2*time+this.timeOffset);
        
        // let player pick it up
        if (!player.IsDead() && player.IsTouching(this))
            this.Pickup();
        else if (boss && boss.IsTouching(this))
        {
            // boss destroys pickups
            PlaySound(14);
            this.Destroy();
        }
        
        super.Update();
    }
    
    Pickup()
    {
        if (this.type==2)
        {
            // heart container - apply directly, don't add to inventory
            ++playerData.healthMax;
            player.healthMax = playerData.healthMax;
            player.Heal(1);
            PlaySound(4);
        }
        else if (this.type==3)
        {
            // 1 coin - goes directly to coin count, NOT inventory
            PlaySound(10);
            ++playerData.coins;
        }
        else if (this.type==4)
        {
            // 5 coin - goes directly to coin count, NOT inventory
            PlaySound(10);
            playerData.coins+=5;
        }
        else
        {
            // half or whole heart - apply directly, don't add to inventory
            player.Heal(.5+ this.type/2)
            PlaySound(3);
        }
        this.Destroy();
    }
}

///////////////////////////////////////////////////////////////////////////////

class Enemy extends MyGameObject
{
    constructor(pos,tileX=0,tileY=0,size=.5,collisionSize=0,health=1,big=0)
    { 
        super(pos,tileX,tileY,size,collisionSize,health); 
        this.isEnemy = 1
        this.spawnPickup = 1;
        this.bloodAdditive = 1;
        this.isBig = big;
        this.radarSize=big?2:1;
    }
    
    Damage(damage) 
    {
        let damageDone = super.Damage(damage);
        if (damageDone && !this.IsDead())
        {
            this.BloodSplat(.5);
            PlaySound(8);
        }
        
        return damageDone;
    }
    
    Update()
    {
        if (player.IsTouching(this))
        if (player.Damage(.5))
        {
            // push player when damaged
            let accel = player.pos.Clone();
            accel.Subtract(this.pos).Normalize(.1);
            player.velocity.Add(accel);
        }

        super.Update();
    }
    
    Kill()
    {
        super.Kill();
        
        // spawn portal if no enemies left
        if (!levelExit && !player.IsDead())
        {
            if (!gameObjects.some(o=>o.isEnemy))
            {
                levelExit = new LevelExit(this.pos);
                if (!this.isBig)
                    this.spawnPickup = 0;
            }
        }

        // spawn pickups
        let count = 1;
        if (this.isBig)
            count = RandIntBetween(3, 5);
        if (this.isInvisible)
            count = count * 2;
        SpawnPickups(this.pos, this.spawnPickup, count);
    }
}

///////////////////////////////////////////////////////////////////////////////

class SlimeEnemy extends Enemy
{
    constructor(pos,healthLevel,difficulty=1)
    { 
        let size = .25*healthLevel;
        super(pos,5+difficulty,0,size,size*.8,healthLevel*difficulty,healthLevel>3); 
        this.bloodColor = difficulty>1?new Color(1,0,.5,.5):new Color(0,.5,1,.5);
        this.randMoveTimer = new Timer();
        this.randAccel = new Vector2();
        this.spawnPickup = healthLevel == 1? difficulty/2 : 0;
        this.difficulty = difficulty;
        this.healthLevel = healthLevel;
        this.baseSize = size;
        this.damping = .9;
    }
    
    Update()
    {
        let playerDistance = player.pos.Distance(this.pos);
        if (playerDistance > 20)
            return;
        
        // draw additive trail
        levelCanvasContext.globalCompositeOperation='screen';
        let trailColor = this.bloodColor.Clone().SetAlpha(.05).RGBA();
        level.DrawEllipse(this.pos,(new Vector2(.6,.4)).Multiply(this.size),trailColor);
        levelCanvasContext.globalCompositeOperation='source-over';
     
        // random movement
        if (this.randMoveTimer.Elapsed())
        {
            this.randMoveTimer.Set(RandBetween(.5,1));
            this.randAccel = RandVector(1.3);
        }
    
        // calculate acceleration
        let accel = new Vector2();
        if (!player.IsDead() && playerDistance < 15)
            accel.Copy(player.pos)
                .Subtract(this.pos)
                .Normalize();
        accel.Add(this.randAccel)
            .Multiply(this.difficulty>1?.004:.003)
            .Multiply(this.IsOnSand()?.5:1);
        this.velocity.Add(accel);
    
        // change shape as it moves
        let s = Math.sin(10 * this.GetLifeTime());
        let sx = .9+.1*(1-s);
        let sy = .9+.1*s;
        this.size.Set(this.baseSize*sx,this.baseSize*sy);
        
        super.Update();
    }
       
    Kill() 
    {
        if (this.healthLevel > 1)
        {
            // spawn baby slimes
            for(let i=2;i--;)
            {
                let s = new SlimeEnemy(this.pos, this.healthLevel-1, this.difficulty);
                s.damageTimer.Set(); // prevent them taking damage right away
                s.isInvisible = this.isInvisible;
                s.velocity = this.velocity.Clone();
            }
        }
        
        super.Kill();
    }
}

///////////////////////////////////////////////////////////////////////////////

class JumpingEnemy extends Enemy
{
    constructor(pos,isBig=0)
    { 
        super(pos,2,2,isBig?1:.5,isBig?.8:.4,isBig?12:4,isBig); 
        this.landTimer = new Timer();
        this.jumpWaitTimer = new Timer();
        this.jumpWaitTimer.Set(RandBetween(1,3));
        this.zVelocity = 0;
        this.randOffset = new Vector2();
        this.bloodColor = new Color(1,.5,0,.1);
        this.speed = isBig?.012:.01;
    }
    
    Update()
    {
        let playerDistance = player.pos.Distance(this.pos);
        if (playerDistance > 20)
            return;
        
        if (this.jumpWaitTimer.Elapsed() && this.height <= 0)
        {
            // jump
            this.zVelocity = RandBetween(.15,.2);
            if (this.isBig)
                 this.zVelocity *= 1.2;
            this.jumpWaitTimer.Set(RandBetween(1.5,3));
            this.randOffset = RandVector(RandBetween(0,1));
            this.landTimer.UnSet();
        }
    
        // update jump
        this.height += this.zVelocity;
        this.zVelocity -= .005;
        if (this.height <= 0)
        {
            // is on ground
            if (!this.landTimer.IsSet())
            {
                // just landed
                this.landTimer.Set(.3);
                this.BloodSplat(.8,0);
            }
            this.height = this.zVelocity = 0;
        }
        else
        {
            // is in the air
            let accel = new Vector2();
            if (!player.IsDead() && playerDistance < 15)
            {
                // move towards player
                accel.Copy(player.pos)
                    .Subtract(this.pos)
                    .ClampLength(1)
                    .Add(this.randOffset);
            }
            else
                accel.Copy(this.randOffset);
            this.velocity.Add(accel.Multiply(this.speed));
            
            //DebugPoint(player.pos.Clone().Add(this.randOffset));
        }
    
        // set draw tile when jumping or landed
        this.tileX = 2;
        if (this.jumpWaitTimer.Get() > -.25 || !this.landTimer.Elapsed())
            ++this.tileX;
            
        super.Update();
    }
}

///////////////////////////////////////////////////////////////////////////////

class ShieldEnemy extends Enemy
{
    constructor(pos, type=0, isBig=0)
    { 
        super(pos,4,2,isBig?1:.5,isBig?.8:.4,type?50:isBig?6:2,isBig); 
        this.moveTimer = new Timer();
        this.dashTimer = new Timer();
        this.damping=.8;
        this.bumped=0;
        this.type = type;
        this.moveBackwards = 0;
        this.speed = isBig?.015:.012;
        if (type)
        {
            boss = this;
            this.speed = .018;
            this.bloodAdditive = 0;
        }
        else
            this.bloodColor = new Color(.3,1,0,.5);
            
        this.bossIntro = 0;
    }
    
    ReflectDamage(direction)
    { 
        if (this.damageTimer.Get() < .5)
            return 0;
    
        // figure out if damge should be reflected
        let d = new Vector2(1,0).Rotate(this.rotation*PI/2);
        let a = direction.Clone().Normalize().DotProduct(d);
        return this.type? (a > .4) : (a < -.4);
    }
    
    CollideLevel(data, pos)
    {
        let small = !this.isBig && !this.type;
        if (data.IsSolid())
        {
            if (small)
            {
                if (this.dashTimer.Elapsed()) // change direction if not dashing
                    this.rotation = (this.rotation+2)%4;
            }
            this.velocity.Multiply(0);
        }
        
        // break level objects
        return DestroyLevelObject(pos, !this.type);
    }
    
    Damage(damage) 
    {
        // prevent player killing the boss after dying
        if (this.type && player.IsDead())
            return 0;
    
        return super.Damage(damage);
    }
    
    Update()
    {
        let lifeTime = this.GetLifeTime();
        let isOnSand = !this.type && this.IsOnSand();
        let playerDistance = player.pos.Distance(this.pos);
        
        if (false && this.type) // disabled
        {
            // title screen - run towards the level exit
            let d = this.pos.x - levelExit.pos.x;
            this.rotation = Math.abs(d) < .5? 1: 0;
            if (this.Distance(levelExit) < 1)
                this.Destroy();
        }
        else if (this.bossIntro)
        {
            // boss intro, run left and up
            if (this.pos.x>24)
            {
                this.pos.x = 24
                this.rotation = 3;
            }
            else
                this.rotation = 0;
        }
        else
        {
            if (playerDistance > 20 && !this.type)
                return;

            // update ai
            if (this.moveTimer.Elapsed() && this.dashTimer.Elapsed())
            {
                this.moveBackwards = 0;
                if (!player.IsDead() && (playerDistance < 15 || this.type))
                {
                    // get player direction
                    let d = player.pos.Clone().Subtract(this.pos);
                    let r = d.Rotation();
                    if (!(r&1))
                        r=(r+2)%4; // left/right is backwards
                    this.rotation = r;
                    
                    // boss can randomly move backwards
                    if (this.type)
                        this.moveBackwards = Rand()<.5;
                    if (this.moveBackwards)
                        this.rotation = (this.rotation+2)%4

                    // randomly decide to dash
                    if (Rand()<.2)
                        this.dashTimer.Set(2);
                }
                else
                    this.rotation = RandInt(4);
                this.moveTimer.Set(RandBetween(.8,2));
            }
        }

        // apply move acceleration
        let moveAccel = new Vector2(this.speed*(isOnSand?.5:1),0).Rotate(this.rotation*PI/2);
        if (!this.dashTimer.Elapsed())
            moveAccel.Multiply((this.dashTimer.Get() < -1)?0:2);
        
        if (false && this.type) // disabled
        {
            // title screen 
            if (playerDistance > 10.5)
                moveAccel.Multiply(0);
        }
        else if (this.type)
        {
            // boss fight
            if (lifeTime > 10 && this.health < this.healthMax || lifeTime > 20 && playerDistance < 10 )
                this.bossIntro = 0;
        
            if (this.bossIntro)
            {
                if (playerDistance > 14)
                    moveAccel.Multiply(0);
                if (this.pos.y < 21)
                {
                    // wait to get hit
                    moveAccel.Multiply(0);
                    this.rotation = 1;
                    this.walkFrame += .021;
                }
            }
            else
            {
                this.bossIntro = 0;
                if (this.size.x<2)
                {
                    // grow giant
                    this.size.AddXY(.005,.005);
                    this.collisionSize = this.size.x*.8;
                    moveAccel.Multiply(0);
                    this.walkFrame += .1;
                    if (frame%10==0)
                        this.rotation = (this.rotation+1)%4;
                    moveAccel.Multiply(0);
                }
                else
                    this.size.Set(2,2);
            }
        }
        
        // apply acceleration
        this.velocity.Add(moveAccel.Multiply(this.moveBackwards?-1:1));
    
        // set the tile and mirror
        if (this.rotation&1)
        {
            // facing left or right
            this.tileX = (this.rotation==1)?6:7;
            this.mirror = this.walkFrame%2|0;
        }
        else
        {
            // facing up or down
            this.mirror = this.rotation;
            this.tileX = 4 + (this.walkFrame%2|0);
        }
        
        if (this.type)
        {
            // if boss, offset the tile position
            this.tileY=3;
            this.tileX-=2;
        }
        
        this.UpdateWalk();
        super.Update();
    }
    
    Kill()
    {
        super.Kill();
        
        if (this.type)
        {
            boss = 0;
            if (false) // disabled
            {
                // player win
                new Pickup(this.pos, 2);
                SpawnPickups(this.pos,1,40);
                winTimer.Set();
                localStorage.kbap_warp=0;
                localStorage.kbap_won=1;
                speedRunTime=speedRunTime|0;
                if (speedRunMode && (!speedRunBestTime || speedRunTime < speedRunBestTime))
                {
                    // track best speed run time
                    speedRunBestTime = speedRunTime;
                    localStorage.kbap_bestTime=speedRunBestTime;
                }
                PlaySound(2);
            }
        }
    }
}

///////////////////////////////////////////////////////////////////////////////

class Store extends MyGameObject
{
    constructor(pos) 
    {
        super(pos,7,1,.5,.5);
        
        // Store no longer spawns physical items - skins are purchased through modal
        this.count = 0;
            
        this.pos.y-=2;
        this.isStore = 1;
        level.FillCircleType(pos,3,1); // clear area
        level.FillCircleObject(pos,5,0); // clear area
    }
    
    Kill()
    {
        SpawnPickups(this.pos);
        super.Kill();
    }
    
    Update()
    {        
        // draw carpet after being spawned
        if (this.GetLifeTime()<.1)
        {
            let p = this.pos.Clone().AddXY(0,2).Multiply(tileSize);
            let w = this.count*16;
            levelCanvasContext.fillStyle='#CCC';
            levelCanvasContext.fillRect(p.x-w-2,p.y-30-2,w*2+4,40+4);
            levelCanvasContext.fillStyle='#329';
            levelCanvasContext.fillRect(p.x-w,p.y-30,w*2,40);
        }
    
        this.mirror = player.pos.x<this.pos.x; // allways face player
        if (!buyTimer.Elapsed())
        {
            // jump on buy
            let b = buyTimer.Get();
            this.height = -b*(.5-.5*Math.cos(6*PI*b))/2;
        }
        
        // check enemy hits
        gameObjects.forEach(o=>{if (o.isEnemy && o.IsTouching(this))this.Kill();}); 
        
        super.Update();
    }
}

class StoreItem extends MyGameObject
{
    constructor(pos,type,owner) 
    { 
        // 0 = whole heart
        // 1 = heart container
        // 2 = boomerang
        // 3 = big boomerang
        
        super(pos,type+3,5,.5,.2); 
        this.owner = owner;
        this.type = type;
        this.cost = 5;
        this.wasTouching=0;
        
        // set up tile and cost
        if (this.type == 1)
            this.cost = 50;
        if (this.type == 2)
        {
            this.cost = 40;
            this.tileX = 0;
        }
        if (this.type == 3)
        {
            this.cost = 90;
            this.tileX = 7;
        }
    
        // randomize cost
        this.cost *= RandBetween(.5,1.5);
        this.cost = Clamp(this.cost, 1, 99);
        this.cost |= 0;
    }
    
    Update()
    {
        // let player pickup
        if (!player.IsDead() && player.IsTouching(this))
        {
            if (!this.wasTouching)
                this.Pickup();
            this.wasTouching = 1;
        }
        else
            this.wasTouching = 0;
            
        if (this.owner && this.owner.IsDead())
            this.Destroy();
            
        super.Update();
    }
    
    Pickup()
    {
        if (this.cost>playerData.coins)
        {
            // player doesn't have enough money
            PlaySound(15);
            this.damageTimer.Set();
            return;
        }
        
        // give player the item
        if (this.type < 2)
            (new Pickup(this.pos,this.type+1)).Pickup();
        else 
            (new Boomerang(this.pos,this.type == 3)).Pickup();
            
        buyTimer.Set(1);
        playerData.coins-=this.cost;
        this.Destroy();
    }
    
    Render()
    {
        if (!shadowRenderPass && !hitRenderPass)
        {
            // draw the price
            SetCanvasTransform(this.pos.Clone().AddXY(0,-1), this.size);
            DrawText(this.cost,-6,0,14,'left',.5,this.GetDamageTime()<.5?"#F00":"#000");
            DrawScreenTile(-10,-1,4,5,5);
            mainCanvasContext.restore();
        }
        
        super.Render(); 
    } 
}

///////////////////////////////////////////////////////////////////////////////

class LevelExit extends MyGameObject
{
    constructor(pos,type=0) 
    { 
        super(pos,0,0,0,.5); 
        this.type=type; 
        this.radarSize=2;
        this.closeTimer = new Timer();
        this.pos.y+=.01;
    }
       
    Update() 
    {
        // bob and spin
        this.height =.1+.1*Math.sin(5*time);
        this.angleVelocity =.05/(this.size+.1); 
        
        let playerOffset = this.pos.Clone().Subtract(player.pos);
        let playerDistance = playerOffset.Length();
        let radius = this.size.x;
        if (this.type==1)
        {
            // incomming portal as player spawns in
            if (levelFrame==60)
                PlaySound(13);
        
            // get smaller and go away
            radius = Max(0,1 - levelTimer.Get()/2);
            if (radius <= 0)
                this.Destroy();
        }
        else if (this.closeTimer.IsSet())
        {
            // get smaller if closing
            radius = -this.closeTimer.Get();
        }
        else if (this.GetLifeTime() < 1)
        {
            // open up when it first appears
            let t = this.GetLifeTime();
            radius = Min(t*2,1);
        }
        else if (!player.IsDead() && playerDistance < 3 && player.dashTimer.Elapsed())
        {
            // player is close to portal
            if (playerDistance < .5)
            {
                // player entered portal
                if (false && this.type == 3) // disabled
                {
                    // speed run portal
                    speedRunMode = 1;
                    speedRunTime = 0;
                    playerData = new PlayerData();
                }
                if (this.type == 2)
                {
                    // warp portal
                    nextLevel = warpLevel; 
                }
                PlaySound(13);
                this.closeTimer.Set(1);
            }
            else
            {
                // pull player into portal
                player.velocity.Add(playerOffset.Normalize(.005/playerDistance));
            }
        }
        
        radius = Max(0,radius);
        this.size.Set(radius,radius);
        
        super.Update();
    }
       
    Render() 
    {
        SetCanvasTransform(this.pos,this.size,this.angle,this.height);
        
        // draw wrap portal effect
        mainCanvasContext.lineWidth=1;
        let color;
        for(let i=19;i--;mainCanvasContext.stroke())
        {
            mainCanvasContext.beginPath();
            color=`hsla(${i*9+time*99},99%,${shadowRenderPass?0:50}%,${shadowRenderPass?.5:1})`;
            mainCanvasContext.strokeStyle=color;
            for(let j=8;j--;)
            {
                let a=time-j*PI/3+5*Math.sin(i/2+time*2)/19;
                mainCanvasContext.arc(0,0,i*this.size.x,a,a)
            }
        }   
        
        if (this.type > 1 && !shadowRenderPass  && !this.closeTimer.IsSet())
        { 
            // render warp or speed run text
            let text = (this.type == 2)? 'Warp '+warpLevel : 'Speed Run';
            DrawText(text,0,-24,14,'center',1,color,'#000');
            if (this.type == 3 && speedRunBestTime)
                DrawText('Best '+FormatTime(speedRunBestTime),0,-36,12,'center',1,color,'#000');
            
        }
        mainCanvasContext.restore();
    }
}

///////////////////////////////////////////////////////////////////////////////
// interior system

// Judge class - special character that spawns in courthouse
class Judge extends MyGameObject
{
    constructor(pos)
    {
        super(pos, 0, 0, 0.5, 0.4, 1); // Same size as player
        this.surname = 'Judge'; // Will be updated with persona
        this.emoji = null; // No emoji for now (dialogue system will handle null)
        this.spriteIndex = 15; // Sprite index 15 from tiles.png
        this.isJudge = 1;
        this.rotation = 1; // Facing south
        this.characteristic = null; // Will be set from persona
        this.job = 'judge'; // Judge's profession
    }
    
    // Update judge persona
    UpdatePersona(persona)
    {
        if (persona && persona.name)
        {
            this.surname = persona.name;
            this.characteristic = persona.characteristic || 'serious';
        }
        // Ensure job is always set to 'judge'
        this.job = 'judge';
    }
    
    Render()
    {
        if (shadowRenderPass)
            return;
        
        // Only render if in same interior as player (or both outdoors)
        if (currentInterior)
        {
            // Player is indoors - judge must be in same interior
            if (!this.isIndoors || this.currentInterior !== currentInterior)
                return;
        }
        else
        {
            // Player is outdoors - judge should not be visible
            return;
        }
        
        // Custom rendering using tiles.png sprite index 15
        mainCanvasContext.save();
        let drawPos = this.pos.Clone();
        drawPos.y -= this.height;
        drawPos.Subtract(cameraPos).Multiply(tileSize*cameraScale);
        drawPos.Add(mainCanvasSize.Clone(.5));
        mainCanvasContext.translate(drawPos.x|0, drawPos.y|0);
        
        let s = this.size.x * tileSize * cameraScale;
        
        // Calculate tile position from sprite index 15
        // tiles.png uses 8 sprites per row
        let tileX = this.spriteIndex % 8;
        let tileY = Math.floor(this.spriteIndex / 8);
        
        if (tileImage)
        {
            mainCanvasContext.drawImage(
                tileImage,
                tileX * tileSize, tileY * tileSize,
                tileSize, tileSize,
                -s, -s,
                s * 2, s * 2
            );
        }
        else
        {
            // Placeholder
            mainCanvasContext.fillStyle = '#642';
            mainCanvasContext.fillRect(-s, -s, s * 2, s * 2);
        }
        
        mainCanvasContext.restore();
        
        // Display judge name when player is within 1 tile
        if (player && player.pos)
        {
            let distance = this.pos.Distance(player.pos);
            if (distance <= 1.0) // Within 1 tile
            {
                let namePos = this.pos.Clone();
                namePos.y -= this.height + 0.6; // Above judge sprite
                namePos.Subtract(cameraPos).Multiply(tileSize*cameraScale);
                namePos.Add(mainCanvasSize.Clone(.5));
                
                // Draw judge name above sprite
                DrawText(this.surname, namePos.x|0, namePos.y|0, 8 * cameraScale, 'center', 1, '#FFF', '#000');
            }
        }
    }
}

class Furniture extends MyGameObject
{
    constructor(pos, spriteIndex, size, tilesetImage)
    {
        // size is in tiles (1 = 16px, 2 = 32px)
        let tileSize = size * 0.5; // Convert to world units (0.5 = 1 tile)
        super(pos, 0, 0, tileSize, tileSize * 0.9); // Collision slightly smaller than visual
        this.spriteIndex = spriteIndex;
        this.tilesetImage = tilesetImage;
        this.furnitureSize = size; // Store tile size
        this.isFurniture = 1;
    }
    
    Render()
    {
        if (shadowRenderPass)
            return;
        
        // Custom rendering for furniture from tiles2.png
        mainCanvasContext.save();
        let drawPos = this.pos.Clone();
        drawPos.y -= this.height;
        drawPos.Subtract(cameraPos).Multiply(tileSize*cameraScale);
        drawPos.Add(mainCanvasSize.Clone(.5));
        mainCanvasContext.translate(drawPos.x|0, drawPos.y|0);
        
        let s = this.furnitureSize * tileSize * cameraScale;
        
        if (this.tilesetImage)
        {
            if (this.isEndtable)
            {
                // Endtable uses tiles.png with tile index system
                let tileX = this.spriteIndex % 8;
                let tileY = Math.floor(this.spriteIndex / 8);
                mainCanvasContext.drawImage(
                    this.tilesetImage,
                    tileX * tileSize, tileY * tileSize,
                    tileSize, tileSize,
                    -s, -s,
                    s * 2, s * 2
                );
            }
            else
            {
                // Draw from tiles2.png - sprite index determines which sprite
                // tiles2.png uses 32px sprites, assume 4 sprites per row (grid layout)
                let spriteSize = this.furnitureSize * 16; // 16px per tile, so 32px for size 2
                let spritesPerRow = 4; // tiles2.png likely has 4 sprites per row
                let spriteX = (this.spriteIndex % spritesPerRow) * spriteSize;
                let spriteY = Math.floor(this.spriteIndex / spritesPerRow) * spriteSize;
                mainCanvasContext.drawImage(
                    this.tilesetImage,
                    spriteX, spriteY, // Source position (grid layout)
                    spriteSize, spriteSize, // Source size
                    -s, -s, // Destination position
                    s * 2, s * 2 // Destination size
                );
            }
        }
        else
        {
            // Placeholder
            mainCanvasContext.fillStyle = '#642';
            mainCanvasContext.fillRect(-s, -s, s * 2, s * 2);
        }
        
        mainCanvasContext.restore();
    }
}

class Interior
{
    constructor(size, floorTint)
    {
        // size is in tiles (8x8)
        this.size = size;
        this.floorTint = floorTint; // Dark brown color
        this.furniture = [];
        this.exitPoint = new Vector2(size / 2, size - 0.5); // Middle of bottom edge (entry/exit point)
        this.bedPosition = null; // Bed position for sleep interaction
        
        // Create interior level with custom size
        this.interiorSize = size;
    }
    
    CreateLevel()
    {
        // levelSize should already be set to interiorSize before calling this
        // Create new level (uses current levelSize)
        this.level = new Level();
    }
    
    // Furniture pool definitions
    static GetFurniturePool(includeBed = true)
    {
        let pool = [
            // From tiles2.png (32px, size 2)
            {name: 'dresser', spriteIndex: 0, size: 2, tilesetImage: tileImage2, isEndtable: false},
            {name: 'storeshelf', spriteIndex: 2, size: 2, tilesetImage: tileImage2, isEndtable: false},
            {name: 'shopshelf', spriteIndex: 3, size: 2, tilesetImage: tileImage2, isEndtable: false},
            {name: 'desk', spriteIndex: 4, size: 2, tilesetImage: tileImage2, isEndtable: false},
            {name: 'cabinet', spriteIndex: 5, size: 2, tilesetImage: tileImage2, isEndtable: false},
            // From tiles.png (16px, size 1)
            {name: 'endtable', spriteIndex: 0, size: 1, tilesetImage: tileImage, isEndtable: true},
            {name: 'plant', spriteIndex: 1, size: 1, tilesetImage: tileImage, isEndtable: true},
            {name: 'stool', spriteIndex: 2, size: 1, tilesetImage: tileImage, isEndtable: true},
            {name: 'blueplant', spriteIndex: 3, size: 1, tilesetImage: tileImage, isEndtable: true}
        ];
        
        if (includeBed)
        {
            pool.push({name: 'bed', spriteIndex: 1, size: 2, tilesetImage: tileImage2, isEndtable: false});
        }
        
        return pool;
    }
    
    // Shuffle array and pick N unique items
    static SelectRandomFurniture(pool, count)
    {
        // Shuffle the pool
        let shuffled = pool.slice(); // Copy array
        for(let i = shuffled.length - 1; i > 0; i--)
        {
            let j = RandInt(i + 1);
            let temp = shuffled[i];
            shuffled[i] = shuffled[j];
            shuffled[j] = temp;
        }
        
        // Pick first N items
        return shuffled.slice(0, count);
    }
    
    // Place a single furniture piece
    PlaceFurniture(furnitureDef, furniturePlaced)
    {
        let pos = this.FindFurniturePosition(furnitureDef.size, furniturePlaced);
        if (pos)
        {
            let furniture = new Furniture(pos, furnitureDef.spriteIndex, furnitureDef.size, furnitureDef.tilesetImage);
            if (furnitureDef.isEndtable)
                furniture.isEndtable = true;
            
            furniturePlaced.push({pos: pos, size: furnitureDef.size});
            this.furniture.push(furniture);
            
            // Make furniture area solid (impassable)
            let furnitureSize = furnitureDef.size;
            this.level.FillCircleCallback(pos, furnitureSize * 0.5 * 0.9, (data) => {
                data.type = 0; // solid
            });
            return true;
        }
        return false;
    }
    
    GenerateHome()
    {
        // levelSize should already be set to interiorSize before calling this
        // Create the level (uses current levelSize)
        this.CreateLevel();
        
        // Fill entire interior with floor tiles (type 1 = grass, will be tinted)
        for(let x = 0; x < this.interiorSize; x++)
        for(let y = 0; y < this.interiorSize; y++)
        {
            this.level.GetData(x, y).type = 1; // Grass tile (will be tinted brown)
        }
        
        // Ensure exit area (bottom center) is clear and walkable
        let exitX = this.size / 2;
        let exitY = this.size - 0.5;
        this.level.FillCircleType(new Vector2(exitX, exitY), 1.0, 1); // Clear exit area (1 tile radius)
        
        // Place furniture: 1 bed + 2 random pieces
        let furniturePlaced = [];
        
        // Always place bed first
        let bedDef = {name: 'bed', spriteIndex: 1, size: 2, tilesetImage: tileImage2, isEndtable: false};
        let bedPlaced = this.PlaceFurniture(bedDef, furniturePlaced);
        // Store bed position for sleep interaction
        if (bedPlaced)
        {
            // Find the bed furniture we just placed
            for(let f of this.furniture)
            {
                if (f.furnitureSize == 2 && f.spriteIndex == 1 && f.tilesetImage == tileImage2)
                {
                    this.bedPosition = f.pos.Clone();
                    break;
                }
            }
        }
        
        // Get pool without bed and select 2 random pieces
        let pool = Interior.GetFurniturePool(false); // Exclude bed
        let randomFurniture = Interior.SelectRandomFurniture(pool, 2);
        
        // Place the 2 random pieces
        for(let furnitureDef of randomFurniture)
        {
            this.PlaceFurniture(furnitureDef, furniturePlaced);
        }
        
        // Apply tiling and redraw
        // (levelSize should still be set to interiorSize at this point)
        this.level.ApplyTiling();
        this.level.Redraw();
    }
    
    GenerateHouse()
    {
        // levelSize should already be set to interiorSize before calling this
        // Create the level (uses current levelSize)
        this.CreateLevel();
        
        // Fill entire interior with floor tiles (type 1 = grass, will be tinted)
        for(let x = 0; x < this.interiorSize; x++)
        for(let y = 0; y < this.interiorSize; y++)
        {
            this.level.GetData(x, y).type = 1; // Grass tile (will be tinted brown)
        }
        
        // Ensure exit area (bottom center) is clear and walkable
        let exitX = this.size / 2;
        let exitY = this.size - 0.5;
        this.level.FillCircleType(new Vector2(exitX, exitY), 1.0, 1); // Clear exit area (1 tile radius)
        
        // Place furniture: 1 bed + 2 random pieces
        let furniturePlaced = [];
        
        // Always place bed first
        let bedDef = {name: 'bed', spriteIndex: 1, size: 2, tilesetImage: tileImage2, isEndtable: false};
        this.PlaceFurniture(bedDef, furniturePlaced);
        
        // Store bed position for sleep interaction
        for(let f of this.furniture)
        {
            if (f.furnitureSize == 2 && f.spriteIndex == 1 && f.tilesetImage == tileImage2)
            {
                this.bedPosition = f.pos.Clone();
                break;
            }
        }
        
        // Get pool without bed and select 2 random pieces
        let pool = Interior.GetFurniturePool(false); // Exclude bed
        let randomFurniture = Interior.SelectRandomFurniture(pool, 2);
        
        // Place the 2 random pieces
        for(let furnitureDef of randomFurniture)
        {
            this.PlaceFurniture(furnitureDef, furniturePlaced);
        }
        
        // Apply tiling and redraw
        // (levelSize should still be set to interiorSize at this point)
        this.level.ApplyTiling();
        this.level.Redraw();
    }
    
    GenerateShop()
    {
        // levelSize should already be set to interiorSize before calling this
        // Create the level (uses current levelSize)
        this.CreateLevel();
        
        // Fill entire interior with floor tiles (type 1 = grass, will be tinted)
        for(let x = 0; x < this.interiorSize; x++)
        for(let y = 0; y < this.interiorSize; y++)
        {
            this.level.GetData(x, y).type = 1; // Grass tile (will be tinted blue)
        }
        
        // Ensure exit area (bottom center) is clear and walkable
        let exitX = this.size / 2;
        let exitY = this.size - 0.5;
        this.level.FillCircleType(new Vector2(exitX, exitY), 1.0, 1); // Clear exit area (1 tile radius)
        
        // Place furniture: 4 random pieces (no bed)
        let furniturePlaced = [];
        
        // Get pool without bed and select 4 random pieces
        let pool = Interior.GetFurniturePool(false); // Exclude bed
        let randomFurniture = Interior.SelectRandomFurniture(pool, 4);
        
        // Place the 4 random pieces
        for(let furnitureDef of randomFurniture)
        {
            this.PlaceFurniture(furnitureDef, furniturePlaced);
        }
        
        // Apply tiling and redraw
        // (levelSize should still be set to interiorSize at this point)
        this.level.ApplyTiling();
        this.level.Redraw();
    }
    
    GenerateStore()
    {
        // levelSize should already be set to interiorSize before calling this
        // Create the level (uses current levelSize)
        this.CreateLevel();
        
        // Fill entire interior with floor tiles (type 1 = grass, will be tinted)
        for(let x = 0; x < this.interiorSize; x++)
        for(let y = 0; y < this.interiorSize; y++)
        {
            this.level.GetData(x, y).type = 1; // Grass tile (will be tinted pink)
        }
        
        // Ensure exit area (bottom center) is clear and walkable
        let exitX = this.size / 2;
        let exitY = this.size - 0.5;
        this.level.FillCircleType(new Vector2(exitX, exitY), 1.0, 1); // Clear exit area (1 tile radius)
        
        // Place furniture: 4 random pieces (no bed)
        let furniturePlaced = [];
        
        // Get pool without bed and select 4 random pieces
        let pool = Interior.GetFurniturePool(false); // Exclude bed
        let randomFurniture = Interior.SelectRandomFurniture(pool, 4);
        
        // Place the 4 random pieces
        for(let furnitureDef of randomFurniture)
        {
            this.PlaceFurniture(furnitureDef, furniturePlaced);
        }
        
        // Apply tiling and redraw
        // (levelSize should still be set to interiorSize at this point)
        this.level.ApplyTiling();
        this.level.Redraw();
    }
    
    GenerateFirm()
    {
        // levelSize should already be set to interiorSize before calling this
        // Create the level (uses current levelSize)
        this.CreateLevel();
        
        // Fill entire interior with floor tiles (type 1 = grass, will be tinted)
        for(let x = 0; x < this.interiorSize; x++)
        for(let y = 0; y < this.interiorSize; y++)
        {
            this.level.GetData(x, y).type = 1; // Grass tile (will be tinted yellow/gold)
        }
        
        // Ensure exit area (bottom center) is clear and walkable
        let exitX = this.size / 2;
        let exitY = this.size - 0.5;
        this.level.FillCircleType(new Vector2(exitX, exitY), 1.0, 1); // Clear exit area (1 tile radius)
        
        // Place furniture: 4 random pieces (no bed)
        let furniturePlaced = [];
        
        // Get pool without bed and select 4 random pieces
        let pool = Interior.GetFurniturePool(false); // Exclude bed
        let randomFurniture = Interior.SelectRandomFurniture(pool, 4);
        
        // Place the 4 random pieces
        for(let furnitureDef of randomFurniture)
        {
            this.PlaceFurniture(furnitureDef, furniturePlaced);
        }
        
        // Apply tiling and redraw
        // (levelSize should still be set to interiorSize at this point)
        this.level.ApplyTiling();
        this.level.Redraw();
    }
    
    GenerateCourthouse()
    {
        // levelSize should already be set to interiorSize before calling this
        // Create the level (uses current levelSize)
        this.CreateLevel();
        
        // Fill entire interior with floor tiles (type 1 = grass, will be tinted)
        for(let x = 0; x < this.interiorSize; x++)
        for(let y = 0; y < this.interiorSize; y++)
        {
            this.level.GetData(x, y).type = 1; // Grass tile (will be tinted purple)
        }
        
        // Ensure exit area (bottom center) is clear and walkable
        let exitX = this.size / 2;
        let exitY = this.size - 0.5;
        this.level.FillCircleType(new Vector2(exitX, exitY), 1.0, 1); // Clear exit area (1 tile radius)
        
        // Place furniture: ALL pieces except bed
        let furniturePlaced = [];
        
        // Get pool without bed - place all of them
        let pool = Interior.GetFurniturePool(false); // Exclude bed
        
        // Place all furniture pieces
        for(let furnitureDef of pool)
        {
            this.PlaceFurniture(furnitureDef, furniturePlaced);
        }
        
        // Spawn judge in courthouse
        let judgePos = this.FindJudgePosition(furniturePlaced);
        this.judge = new Judge(judgePos);
        this.judge.isIndoors = true;
        this.judge.currentInterior = this;
        
        // Apply tiling and redraw
        // (levelSize should still be set to interiorSize at this point)
        this.level.ApplyTiling();
        this.level.Redraw();
    }
    
    FindFurniturePosition(furnitureSize, existingFurniture)
    {
        // Find a random position that doesn't overlap with existing furniture or exit area
        let exitX = this.size / 2; // Exit is at middle of bottom edge
        let exitY = this.size - 0.5;
        let exitClearance = 1.5; // Keep furniture at least 1.5 tiles away from exit
        
        for(let attempt = 0; attempt < 50; attempt++)
        {
            let margin = 0.5; // Keep furniture away from walls
            let x = RandBetween(margin, this.size - margin - furnitureSize);
            let y = RandBetween(margin, this.size - margin - furnitureSize);
            let pos = new Vector2(x, y);
            
            // Don't place furniture near the exit (bottom center)
            let distToExit = pos.Distance(new Vector2(exitX, exitY));
            if (distToExit < exitClearance)
                continue; // Too close to exit, try again
            
            // Check if it overlaps with existing furniture
            let overlaps = false;
            for(let f of existingFurniture)
            {
                let dist = pos.Distance(f.pos);
                if (dist < (furnitureSize + f.size) / 2 + 0.3) // 0.3 tile buffer
                {
                    overlaps = true;
                    break;
                }
            }
            
            if (!overlaps)
                return pos;
        }
        
        // Fallback: place in corner if can't find space (but not near exit)
        return new Vector2(1, 1);
    }
    
    // Find a valid position for the judge (character-sized, clear of furniture)
    FindJudgePosition(existingFurniture)
    {
        // Judge is character-sized (0.5 x 0.4), similar to furniture size 1
        let characterSize = 0.5; // Use 0.5 as the size for clearance calculations
        let exitX = this.size / 2; // Exit is at middle of bottom edge
        let exitY = this.size - 0.5;
        let exitClearance = 1.5; // Keep judge at least 1.5 tiles away from exit
        
        for(let attempt = 0; attempt < 100; attempt++)
        {
            let margin = 0.5; // Keep away from walls
            let x = RandBetween(margin, this.size - margin - characterSize);
            let y = RandBetween(margin, this.size - margin - characterSize);
            let pos = new Vector2(x, y);
            
            // Don't place judge near the exit (bottom center)
            let distToExit = pos.Distance(new Vector2(exitX, exitY));
            if (distToExit < exitClearance)
                continue; // Too close to exit, try again
            
            // Check if it overlaps with existing furniture
            let overlaps = false;
            for(let f of existingFurniture)
            {
                let dist = pos.Distance(f.pos);
                // Need clearance from furniture (furniture size + character size + buffer)
                let minDist = (f.size + characterSize) / 2 + 0.3; // 0.3 tile buffer
                if (dist < minDist)
                {
                    overlaps = true;
                    break;
                }
            }
            
            // Also check if position is walkable (not solid)
            if (!overlaps)
            {
                let data = this.level.GetDataFromPos(pos);
                if (data.type === 1) // Walkable (grass/floor)
                {
                    return pos;
                }
            }
        }
        
        // Fallback: place in center-back area if can't find space
        return new Vector2(this.size / 2, 2);
    }
    
    Render()
    {
        // Render the level with dark brown tint
        if (!this.level)
            return; // Level not ready yet
        
        // Level uses the global levelCanvas, so we can use that
        // But we need to make sure the level has been redrawn
        mainCanvasContext.save();
        
        // Draw the level first (Level.Render() handles the canvas drawing)
        // We'll call the level's render method, then apply tint
        let pos = cameraPos.Clone(-cameraScale*tileSize).Add(mainCanvasSize.Clone(.5));
        
        // Draw the level canvas
        if (levelCanvas && levelCanvas.width > 0)
        {
            mainCanvasContext.drawImage(
                levelCanvas, 
                pos.x|0, pos.y|0,
                cameraScale*levelCanvas.width|0, 
                cameraScale*levelCanvas.height|0
            );
            
            // Apply dark brown tint overlay
            mainCanvasContext.globalCompositeOperation = 'multiply';
            mainCanvasContext.fillStyle = this.floorTint.RGBA();
            mainCanvasContext.fillRect(
                pos.x|0, pos.y|0,
                cameraScale*levelCanvas.width|0, 
                cameraScale*levelCanvas.height|0
            );
            mainCanvasContext.globalCompositeOperation = 'source-over';
        }
        
        mainCanvasContext.restore();
    }
}

function EnterInterior(building)
{
    if (currentInterior)
        return; // Already in an interior
    
    // Store exterior state
    exteriorLevel = level;
    playerExteriorPos = player.pos.Clone();
    
    // Check if this building already has an interior (persisted from previous visit)
    if (building.interior)
    {
        // Reuse existing interior
        currentInterior = building.interior;
        
        // Set level size to match interior size
        levelSize = currentInterior.size;
        
        // Resize levelCanvas to match interior level size
        levelCanvas.width = levelCanvas.height = levelSize * tileSize;
        
        // Switch to interior level
        level = currentInterior.level;
        
        // Redraw the level to the canvas (canvas was cleared when resized)
        // The level data (tiles, edge sprites) is already correct, just need to redraw
        if (level)
        {
            level.Redraw();
        }
        
        // Remove any existing furniture first (safety check in case of duplicates)
        gameObjects = gameObjects.filter(o => !o.isFurniture);
        
        // Remove any existing judge (safety check)
        gameObjects = gameObjects.filter(o => !o.isJudge);
        
        // Add furniture to game objects (recreate from stored positions)
        for(let f of currentInterior.furniture)
        {
            gameObjects.push(f);
        }
        
        // Add judge to game objects if it exists (for courthouse)
        if (currentInterior.judge)
        {
            gameObjects.push(currentInterior.judge);
        }
        
        // Position player at entrance (bottom center, but slightly inside to avoid immediate exit)
        // Courthouse needs more clearance due to larger size and exit detection sensitivity
        let spawnY = building.buildingType === 'court' ? currentInterior.size - 2.5 : currentInterior.size - 1.5;
        player.pos.Set(currentInterior.size / 2, spawnY); // Bottom center, further inside for courthouse
        player.rotation = 3; // Facing north (into room)
        
        // Set a brief cooldown to prevent immediate exit after entering
        interiorExitCooldown.Set(0.2);
    }
    else
    {
        // Create new interior based on building type
        if (building.buildingType === 'home')
        {
            // Set level size BEFORE creating interior (Level constructor uses levelSize)
            levelSize = 8;
            
            currentInterior = new Interior(8, new Color(0.4, 0.25, 0.15)); // Dark brown
            currentInterior.GenerateHome();
            
            // Store interior on building for persistence
            building.interior = currentInterior;
            
            // Switch to interior level
            level = currentInterior.level;
            
            // Remove any existing furniture first (safety check in case of duplicates)
            gameObjects = gameObjects.filter(o => !o.isFurniture);
            
            // Add furniture to game objects
            for(let f of currentInterior.furniture)
            {
                gameObjects.push(f);
            }
            
            // Position player at entrance (bottom center, but slightly inside to avoid immediate exit)
            // Place player 1 tile inside from the bottom edge to prevent instant exit
            player.pos.Set(currentInterior.size / 2, currentInterior.size - 1.5); // Bottom center, 1 tile inside
            player.rotation = 3; // Facing north (into room)
            
            // Set a brief cooldown to prevent immediate exit after entering
            interiorExitCooldown.Set(0.2);
        }
        else if (building.buildingType === 'house')
        {
            // Set level size BEFORE creating interior (Level constructor uses levelSize)
            levelSize = 16;
            
            currentInterior = new Interior(16, new Color(0.4, 0.25, 0.15)); // Dark brown
            currentInterior.GenerateHouse();
            
            // Store interior on building for persistence
            building.interior = currentInterior;
            
            // Switch to interior level
            level = currentInterior.level;
            
            // Remove any existing furniture first (safety check in case of duplicates)
            gameObjects = gameObjects.filter(o => !o.isFurniture);
            
            // Add furniture to game objects
            for(let f of currentInterior.furniture)
            {
                gameObjects.push(f);
            }
            
            // Position player at entrance (bottom center, but slightly inside to avoid immediate exit)
            // Place player 1 tile inside from the bottom edge to prevent instant exit
            player.pos.Set(currentInterior.size / 2, currentInterior.size - 1.5); // Bottom center, 1 tile inside
            player.rotation = 3; // Facing north (into room)
            
            // Set a brief cooldown to prevent immediate exit after entering
            interiorExitCooldown.Set(0.2);
        }
        else if (building.buildingType === 'shop')
        {
            // Set level size BEFORE creating interior (Level constructor uses levelSize)
            levelSize = 16;
            
            currentInterior = new Interior(16, new Color(0.2, 0.4, 0.8)); // Blue
            currentInterior.GenerateShop();
            
            // Store interior on building for persistence
            building.interior = currentInterior;
            
            // Switch to interior level
            level = currentInterior.level;
            
            // Remove any existing furniture first (safety check in case of duplicates)
            gameObjects = gameObjects.filter(o => !o.isFurniture);
            
            // Add furniture to game objects
            for(let f of currentInterior.furniture)
            {
                gameObjects.push(f);
            }
            
            // Position player at entrance (bottom center, but slightly inside to avoid immediate exit)
            player.pos.Set(currentInterior.size / 2, currentInterior.size - 1.5); // Bottom center, 1 tile inside
            player.rotation = 3; // Facing north (into room)
            
            // Set a brief cooldown to prevent immediate exit after entering
            interiorExitCooldown.Set(0.2);
        }
        else if (building.buildingType === 'store')
        {
            // Set level size BEFORE creating interior (Level constructor uses levelSize)
            levelSize = 16;
            
            currentInterior = new Interior(16, new Color(0.8, 0.4, 0.6)); // Pink
            currentInterior.GenerateStore();
            
            // Store interior on building for persistence
            building.interior = currentInterior;
            
            // Switch to interior level
            level = currentInterior.level;
            
            // Remove any existing furniture first (safety check in case of duplicates)
            gameObjects = gameObjects.filter(o => !o.isFurniture);
            
            // Add furniture to game objects
            for(let f of currentInterior.furniture)
            {
                gameObjects.push(f);
            }
            
            // Position player at entrance (bottom center, but slightly inside to avoid immediate exit)
            player.pos.Set(currentInterior.size / 2, currentInterior.size - 1.5); // Bottom center, 1 tile inside
            player.rotation = 3; // Facing north (into room)
            
            // Set a brief cooldown to prevent immediate exit after entering
            interiorExitCooldown.Set(0.2);
        }
        else if (building.buildingType === 'firm')
        {
            // Set level size BEFORE creating interior (Level constructor uses levelSize)
            levelSize = 16;
            
            currentInterior = new Interior(16, new Color(0.6, 0.5, 0.2)); // Yellow/Gold
            currentInterior.GenerateFirm();
            
            // Store interior on building for persistence
            building.interior = currentInterior;
            
            // Switch to interior level
            level = currentInterior.level;
            
            // Remove any existing furniture first (safety check in case of duplicates)
            gameObjects = gameObjects.filter(o => !o.isFurniture);
            
            // Add furniture to game objects
            for(let f of currentInterior.furniture)
            {
                gameObjects.push(f);
            }
            
            // Position player at entrance (bottom center, but slightly inside to avoid immediate exit)
            player.pos.Set(currentInterior.size / 2, currentInterior.size - 1.5); // Bottom center, 1 tile inside
            player.rotation = 3; // Facing north (into room)
            
            // Set a brief cooldown to prevent immediate exit after entering
            interiorExitCooldown.Set(0.2);
        }
        else if (building.buildingType === 'court')
        {
            // Set level size BEFORE creating interior (Level constructor uses levelSize)
            levelSize = 16;
            
            currentInterior = new Interior(16, new Color(0.5, 0.3, 0.7)); // Purple
            currentInterior.GenerateCourthouse();
            
            // Store interior on building for persistence
            building.interior = currentInterior;
            
            // Switch to interior level
            level = currentInterior.level;
            
            // Remove any existing furniture first (safety check in case of duplicates)
            gameObjects = gameObjects.filter(o => !o.isFurniture);
            
            // Remove any existing judge (safety check)
            gameObjects = gameObjects.filter(o => !o.isJudge);
            
            // Add furniture to game objects
            for(let f of currentInterior.furniture)
            {
                gameObjects.push(f);
            }
            
            // Add judge to game objects if it exists
            if (currentInterior.judge)
            {
                gameObjects.push(currentInterior.judge);
            }
            
            // Position player at entrance (bottom center, but slightly inside to avoid immediate exit)
            // Courthouse needs more clearance due to larger size and exit detection sensitivity
            player.pos.Set(currentInterior.size / 2, currentInterior.size - 2.5); // Bottom center, 2 tiles inside for courthouse
            player.rotation = 3; // Facing north (into room)
            
            // Set a brief cooldown to prevent immediate exit after entering
            interiorExitCooldown.Set(0.2);
        }
    }
}

function ExitInterior()
{
    if (!currentInterior)
        return;
    
    // Prevent exit while judgment is processing
    if (typeof judgmentProcessing !== 'undefined' && judgmentProcessing) {
        console.log('[JUDGMENT] Blocked interior exit - judgment processing');
        return;
    }
    
    // Prevent exit while case initialization is in progress (only if in courthouse)
    if (typeof caseInitializationLock !== 'undefined' && caseInitializationLock) {
        // Check if we're in the courthouse
        let isInCourthouse = false;
        if (typeof gameObjects !== 'undefined') {
            for (let obj of gameObjects) {
                if (obj.isBuilding && obj.buildingType === 'court' && obj.interior === currentInterior) {
                    isInCourthouse = true;
                    break;
                }
            }
        }
        
        if (isInCourthouse) {
            console.log('[CASE] Blocked interior exit - case initialization in progress');
            return;
        }
    }
    
    // Don't allow exit immediately after entering (cooldown period)
    if (!interiorExitCooldown.Elapsed())
        return;
    
    // Check if player is at exit point (middle of bottom edge)
    let exitDist = player.pos.Distance(currentInterior.exitPoint);
    if (exitDist < 1.0) // Within 1.0 tiles of exit
    {
        // Remove ALL furniture from game objects (filter by isFurniture to catch any duplicates)
        gameObjects = gameObjects.filter(o => !o.isFurniture);
        
        // Remove judge from game objects
        gameObjects = gameObjects.filter(o => !o.isJudge);
        
        // Restore exterior level size FIRST (before restoring level)
        levelSize = 64;
        
        // Resize levelCanvas to match exterior level size
        // (The interior Level constructor resized it to 8*16=128, need to restore to 64*16=1024)
        levelCanvas.width = levelCanvas.height = levelSize * tileSize;
        
        // Restore exterior level
        level = exteriorLevel;
        
        // Redraw the exterior level to the canvas (it was drawn at interior canvas size)
        if (level)
        {
            level.Redraw();
        }
        
        // Find the building that owns this interior
        let building = null;
        for(let obj of gameObjects)
        {
            if (obj.isBuilding && obj.interior === currentInterior)
            {
                building = obj;
                break;
            }
        }
        
        // Position player back outside building (south of building)
        // Use helper function to find valid position that avoids buildings and impassable terrain
        if (building)
        {
            // Calculate preferred position (south of building, slightly further than stored position)
            // Courthouse needs more clearance to avoid entry detection zone
            let southOffset = building.buildingType === 'court' ? building.size.y + 1.5 : building.size.y + 0.5;
            let preferredOffset = new Vector2(0, southOffset);
            if (playerExteriorPos)
            {
                // Use stored position as base, but adjust slightly south
                preferredOffset = playerExteriorPos.Clone().Subtract(building.pos);
                // Push further south to avoid entry detection zone (more for courthouse)
                preferredOffset.y += building.buildingType === 'court' ? 1.5 : 0.5;
            }
            
            // Find valid position near building
            player.pos = FindValidPositionNearBuilding(building, preferredOffset, 0.5);
        }
        else if (playerExteriorPos)
        {
            // Fallback: use stored position if building not found
            player.pos.Copy(playerExteriorPos);
            player.pos.y += 0.5;
            
            // Still validate the position
            if (!level.IsAreaClear(player.pos, 0.5))
            {
                // Try to find nearby valid position
                let searchRadius = 0.5;
                let found = false;
                for(let angle = 0; angle < Math.PI * 2 && !found; angle += Math.PI / 4)
                {
                    let testPos = playerExteriorPos.Clone();
                    testPos.x += Math.cos(angle) * searchRadius;
                    testPos.y += Math.sin(angle) * searchRadius;
                    if (level.IsAreaClear(testPos, 0.5))
                    {
                        let data = level.GetDataFromPos(testPos);
                        if (!data.road)
                        {
                            player.pos.Copy(testPos);
                            found = true;
                        }
                    }
                }
            }
        }
        
        // Set cooldown to prevent immediate re-entry (longer for courthouse to avoid loop)
        let cooldownTime = building && building.buildingType === 'court' ? 0.6 : 0.3;
        interiorExitCooldown.Set(cooldownTime);
        
        // Clear current interior reference (but keep it stored on the building for persistence)
        // The interior is still stored in building.interior, so it will be reused on next entry
        currentInterior = null;
        exteriorLevel = null;
        playerExteriorPos = null;
    }
}

// Process daily gossip at 7:01
async function ProcessDailyGossip()
{
    if (!allNPCs || allNPCs.length === 0)
        return;
    
    try {
        // Collect NPC locations
        const npcLocations = [];
        for (const npc of allNPCs)
        {
            if (!npc || !npc.surname)
                continue;
            
            // Get current interior address (if any)
            let interiorAddress = null;
            if (npc.currentInterior)
            {
                // Find the building that owns this interior
                for (const obj of gameObjects)
                {
                    if (obj.isBuilding && obj.interior === npc.currentInterior)
                    {
                        interiorAddress = obj.address;
                        break;
                    }
                }
            }
            
            npcLocations.push({
                surname: npc.surname,
                currentInterior: interiorAddress,
                workAddress: npc.workAddress || null,
                houseAddress: npc.houseAddress || null,
                characteristic: npc.characteristic || 'friendly'
            });
        }
        
        // Send to server
        const sessionId = getSessionId();
        if (!sessionId)
        {
            console.warn('Cannot process gossip: No session ID');
            return;
        }
        
        const response = await fetch(`/api/npc/gossip/process?sessionId=${encodeURIComponent(sessionId)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ npcLocations: npcLocations })
        });
        
        if (!response.ok)
        {
            const errorData = await response.json().catch(() => ({}));
            console.warn('Failed to process gossip:', errorData);
            return;
        }
        
        const data = await response.json();
        console.log(`Gossip processed: ${data.gossipCount} facts shared among ${npcLocations.length} NPCs`);
        
    } catch (error) {
        console.error('Error processing daily gossip:', error);
    }
}

function Sleep()
{
    // Start fade transition (1 second total: 0.5s fade out, 0.5s fade in)
    sleepFadeActive = 1;
    sleepFadeStateApplied = 0; // Reset flag for state changes
    sleepFadeTimer.Set(1.0);
    
    // State changes will be applied at midpoint (when screen is fully black)
    // See Update() function for where this happens
}

function SaveGameState()
{
    if (!gameTime)
        return;
    
    let gameState = {
        gameTime: gameTime.Save(),
        playerData: {
            health: playerData.health,
            healthMax: playerData.healthMax,
            coins: playerData.coins,
            boomerangs: playerData.boomerangs,
            bigBoomerangs: playerData.bigBoomerangs,
            inventory: playerData.inventory,
            rentPaidThisMonth: playerData.rentPaidThisMonth,
            currentSkin: playerData.currentSkin
        }
    };
    
    // Save banished NPCs if available
    if (typeof GetBanishedNPCs === 'function')
    {
        gameState.banishedNPCs = GetBanishedNPCs();
    }
    
    // Save purchased items
    let purchasedItems = [];
    for (let obj of gameObjects)
    {
        if (obj.isPurchasedItem && obj.Save)
        {
            purchasedItems.push(obj.Save());
        }
    }
    gameState.purchasedItems = purchasedItems;
    
    try
    {
        localStorage.lawyer_gameState = JSON.stringify(gameState);
    }
    catch(e)
    {
        console.warn('Failed to save game state:', e);
    }
}

///////////////////////////////////////////////////////////////////////////////
// Inventory system

function RenderInventoryModal()
{
    // Draw semi-transparent overlay
    mainCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
    mainCanvasContext.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    
    // Modal dimensions
    let modalWidth = 320;
    let modalHeight = 360;
    let modalX = mainCanvasSize.x / 2;
    let modalY = mainCanvasSize.y / 2;
    
    // Draw modal background
    mainCanvasContext.fillStyle = '#333';
    mainCanvasContext.fillRect(modalX - modalWidth/2, modalY - modalHeight/2, modalWidth, modalHeight);
    
    // Draw modal border
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 3;
    mainCanvasContext.strokeRect(modalX - modalWidth/2, modalY - modalHeight/2, modalWidth, modalHeight);
    
    // Draw title
    DrawText('INVENTORY', modalX, modalY - modalHeight/2 + 20, 16, 'center', 1, '#FFF', '#000');
    
    // Draw close button
    let closeButtonX = modalX + modalWidth/2 - 30;
    let closeButtonY = modalY - modalHeight/2 + 20;
    let closeButtonSize = 20;
    
    // Check if mouse is over close button
    let closeButtonHover = (mousePos.x >= closeButtonX - closeButtonSize/2 && mousePos.x <= closeButtonX + closeButtonSize/2 &&
                            mousePos.y >= closeButtonY - closeButtonSize/2 && mousePos.y <= closeButtonY + closeButtonSize/2);
    
    // Draw close button
    mainCanvasContext.fillStyle = closeButtonHover ? '#F44' : '#844';
    mainCanvasContext.fillRect(closeButtonX - closeButtonSize/2, closeButtonY - closeButtonSize/2, closeButtonSize, closeButtonSize);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(closeButtonX - closeButtonSize/2, closeButtonY - closeButtonSize/2, closeButtonSize, closeButtonSize);
    DrawText('X', closeButtonX, closeButtonY, 12, 'center', 1, '#FFF', '#000');
    
    // Handle close button click
    if (MouseWasPressed() && closeButtonHover)
    {
        inventoryOpen = false;
        inventoryDropMode = false; // Reset drop mode when closing
        return;
    }
    
    // Grid settings (4x4 = 16 slots)
    let gridCols = 4;
    let gridRows = 4;
    let slotSize = 60;
    let slotSpacing = 8;
    let gridStartX = modalX - (gridCols * (slotSize + slotSpacing) - slotSpacing) / 2;
    let gridStartY = modalY - modalHeight/2 + 60;
    
    // Draw inventory grid
    let tooltipsToDraw = []; // Collect tooltips to draw after all slots
    if (playerData && playerData.inventory)
    {
        for(let row = 0; row < gridRows; row++)
        {
            for(let col = 0; col < gridCols; col++)
            {
                let slotIndex = row * gridCols + col;
                let slotX = gridStartX + col * (slotSize + slotSpacing);
                let slotY = gridStartY + row * (slotSize + slotSpacing);
                
                // Check if mouse is over this slot
                let slotHover = (mousePos.x >= slotX && mousePos.x <= slotX + slotSize &&
                                mousePos.y >= slotY && mousePos.y <= slotY + slotSize);
                
                // Draw slot background
                mainCanvasContext.fillStyle = slotHover ? '#333' : '#222';
                mainCanvasContext.fillRect(slotX, slotY, slotSize, slotSize);
                
                // Draw slot border
                mainCanvasContext.strokeStyle = slotHover ? '#888' : '#666';
                mainCanvasContext.lineWidth = 2;
                mainCanvasContext.strokeRect(slotX, slotY, slotSize, slotSize);
                
                // Draw item if exists
                if (slotIndex < playerData.inventory.length && playerData.inventory[slotIndex])
                {
                    let item = playerData.inventory[slotIndex];
                    let isEvidence = item.type && (item.type.startsWith('evidence_') || item.type.startsWith('casefile_') || item.type.startsWith('judgment_') || item.type.startsWith('document_'));
                    
                    // Draw item sprite
                    let spriteSize = slotSize - 8;
                    let spriteX = slotX + (slotSize - spriteSize) / 2;
                    let spriteY = slotY + (slotSize - spriteSize) / 2;
                    
                    // Draw sprite from tileImage
                    if (tileImage && tileImage.complete)
                    {
                        mainCanvasContext.drawImage(
                            tileImage,
                            item.tileX * tileSize, item.tileY * tileSize,
                            tileSize, tileSize,
                            spriteX, spriteY,
                            spriteSize, spriteSize
                        );
                    }
                    
                    // Collect tooltip info for evidence items and bonus items on hover (draw after all slots)
                    let isBonusItem = item.type === 'credibility' || item.type === 'countersuit' || item.type === 'exculpation';
                    if (slotHover && item.name && (isEvidence || isBonusItem))
                    {
                        let tooltipText = item.name;
                        let tooltipX = slotX + slotSize + 10;
                        let tooltipY = slotY;
                        let tooltipPadding = 8;
                        let tooltipWidth = tooltipText.length * 6 + tooltipPadding * 2;
                        let tooltipHeight = 20;
                        tooltipsToDraw.push({ text: tooltipText, x: tooltipX, y: tooltipY, width: tooltipWidth, height: tooltipHeight });
                    }
                    
                    // Handle item click
                    if (slotHover && MouseWasPressed())
                    {
                        if (inventoryDropMode)
                        {
                            // Drop mode: drop the clicked item
                            DropItem(slotIndex, item);
                            inventoryDropMode = false; // Reset drop mode
                        }
                        else if (isEvidence)
                        {
                            // Open evidence viewing modal
                            OpenEvidenceViewModal(item, slotIndex);
                        }
                        // Non-evidence items: clicking does nothing (can be extended later for item details)
                    }
                }
            }
        }
    }
    
    // Draw tooltips after all slots (so they appear on top)
    for (let tooltip of tooltipsToDraw)
    {
        // Draw tooltip text only (no background or border)
        DrawText(tooltip.text, tooltip.x + tooltip.width/2, tooltip.y, 10, 'center', 1, '#FFF', '#000');
    }
    
    // Draw DROP button
    let dropButtonX = modalX - modalWidth/2 + 40;
    let dropButtonY = modalY + modalHeight/2 - 30;
    let dropButtonWidth = 80;
    let dropButtonHeight = 25;
    
    // Check if mouse is over drop button
    let dropButtonHover = (mousePos.x >= dropButtonX && mousePos.x <= dropButtonX + dropButtonWidth &&
                          mousePos.y >= dropButtonY && mousePos.y <= dropButtonY + dropButtonHeight);
    
    // Draw drop button
    mainCanvasContext.fillStyle = inventoryDropMode ? '#F44' : (dropButtonHover ? '#844' : '#644');
    mainCanvasContext.fillRect(dropButtonX, dropButtonY, dropButtonWidth, dropButtonHeight);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(dropButtonX, dropButtonY, dropButtonWidth, dropButtonHeight);
    DrawText(inventoryDropMode ? 'DROP MODE' : 'DROP', dropButtonX + dropButtonWidth/2, dropButtonY + dropButtonHeight/2, 10, 'center', 1, '#FFF', '#000');
    
    // Handle drop button click
    if (MouseWasPressed() && dropButtonHover)
    {
        inventoryDropMode = !inventoryDropMode; // Toggle drop mode
    }
    
    // Draw instruction text at bottom
    let instructionText = inventoryDropMode ? 'Click an item to drop it | Press DROP again to cancel' : 'Click evidence to view | Press I or ESC to close';
    DrawText(instructionText, modalX, modalY + modalHeight/2 - 5, 10, 'center', 1, '#AAA', '#000');
}

///////////////////////////////////////////////////////////////////////////////
// Evidence naming modal

function OpenEvidenceNamingModal(defaultName, callback) {
    evidenceNamingModalOpen = true;
    evidenceNamingInput = defaultName || '';
    evidenceNamingDefaultName = defaultName || '';
    evidenceNamingCallback = callback;
}

function CloseEvidenceNamingModal() {
    evidenceNamingModalOpen = false;
    evidenceNamingInput = '';
    evidenceNamingDefaultName = '';
    evidenceNamingCallback = null;
}

function RenderEvidenceNamingModal() {
    // Draw semi-transparent overlay
    mainCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.8)';
    mainCanvasContext.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    
    // Modal dimensions
    let modalWidth = 400;
    let modalHeight = 180;
    let modalX = mainCanvasSize.x / 2;
    let modalY = mainCanvasSize.y / 2;
    
    // Draw modal background
    mainCanvasContext.fillStyle = '#333';
    mainCanvasContext.fillRect(modalX - modalWidth/2, modalY - modalHeight/2, modalWidth, modalHeight);
    
    // Draw modal border
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 3;
    mainCanvasContext.strokeRect(modalX - modalWidth/2, modalY - modalHeight/2, modalWidth, modalHeight);
    
    // Draw title
    DrawText('NAME EVIDENCE', modalX, modalY - modalHeight/2 + 25, 14, 'center', 1, '#FFF', '#000');
    
    // Draw input box
    let inputWidth = modalWidth - 40;
    let inputHeight = 40;
    let inputX = modalX;
    let inputY = modalY - 10;
    
    // Input background
    mainCanvasContext.fillStyle = '#222';
    mainCanvasContext.fillRect(inputX - inputWidth/2, inputY - inputHeight/2, inputWidth, inputHeight);
    
    // Input border
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(inputX - inputWidth/2, inputY - inputHeight/2, inputWidth, inputHeight);
    
    // Draw input text (with cursor) - preserve case
    let displayText = evidenceNamingInput || '';
    let cursorBlink = (Math.floor(time * 4) % 2) === 0; // Blink cursor
    
    // Limit text width - truncate if too long
    let maxChars = 30;
    if (displayText.length > maxChars) {
        displayText = displayText.substring(0, maxChars);
    }
    let textToShow = displayText + (cursorBlink ? '|' : '');
    
    // Draw text directly to preserve case (DrawText converts to uppercase)
    mainCanvasContext.fillStyle = '#FFF';
    mainCanvasContext.font = '900 12px "Press Start 2P"';
    mainCanvasContext.textAlign = 'left';
    mainCanvasContext.textBaseline = 'middle';
    mainCanvasContext.fillText(textToShow, inputX - inputWidth/2 + 10, inputY);
    
    // Draw buttons
    let buttonY = modalY + modalHeight/2 - 35;
    let buttonWidth = 100;
    let buttonHeight = 30;
    let buttonSpacing = 20;
    
    // OK button
    let okButtonX = modalX - buttonWidth/2 - buttonSpacing/2;
    let okButtonHover = (mousePos.x >= okButtonX - buttonWidth/2 && mousePos.x <= okButtonX + buttonWidth/2 &&
                        mousePos.y >= buttonY - buttonHeight/2 && mousePos.y <= buttonY + buttonHeight/2);
    
    mainCanvasContext.fillStyle = okButtonHover ? '#4A9' : '#4A6';
    mainCanvasContext.fillRect(okButtonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(okButtonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
    DrawText('OK', okButtonX, buttonY, 12, 'center', 1, '#FFF', '#000');
    
    // Cancel button
    let cancelButtonX = modalX + buttonWidth/2 + buttonSpacing/2;
    let cancelButtonHover = (mousePos.x >= cancelButtonX - buttonWidth/2 && mousePos.x <= cancelButtonX + buttonWidth/2 &&
                            mousePos.y >= buttonY - buttonHeight/2 && mousePos.y <= buttonY + buttonHeight/2);
    
    mainCanvasContext.fillStyle = cancelButtonHover ? '#F44' : '#844';
    mainCanvasContext.fillRect(cancelButtonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(cancelButtonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
    DrawText('CANCEL', cancelButtonX, buttonY, 12, 'center', 1, '#FFF', '#000');
    
    // Handle button clicks
    if (MouseWasPressed()) {
        if (okButtonHover) {
            // Confirm
            let finalName = evidenceNamingInput.trim() || evidenceNamingDefaultName.trim();
            if (finalName && evidenceNamingCallback) {
                evidenceNamingCallback(finalName);
            }
            CloseEvidenceNamingModal();
        } else if (cancelButtonHover) {
            // Cancel
            if (evidenceNamingCallback) {
                evidenceNamingCallback(null);
            }
            CloseEvidenceNamingModal();
        }
    }
    
    // Handle keyboard input
    HandleEvidenceNamingInput();
}

function HandleEvidenceNamingInput() {
    // Handle Enter key (confirm)
    if (KeyWasPressed(13)) { // Enter
        let finalName = evidenceNamingInput.trim() || evidenceNamingDefaultName.trim();
        if (finalName && evidenceNamingCallback) {
            evidenceNamingCallback(finalName);
        }
        CloseEvidenceNamingModal();
        return;
    }
    
    // Handle Escape key (cancel)
    if (KeyWasPressed(27)) { // Escape
        if (evidenceNamingCallback) {
            evidenceNamingCallback(null);
        }
        CloseEvidenceNamingModal();
        return;
    }
    
    // Handle Backspace
    if (KeyWasPressed(8)) { // Backspace
        evidenceNamingInput = evidenceNamingInput.slice(0, -1);
        evidenceNamingLastKey = null;
        return;
    }
    
    // Process stored key character if available
    if (evidenceNamingLastKey !== null) {
        if (evidenceNamingInput.length < 50) { // Limit length
            evidenceNamingInput += evidenceNamingLastKey;
        }
        evidenceNamingLastKey = null;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Evidence view modal

function OpenEvidenceViewModal(item, slotIndex) {
    evidenceViewModalOpen = true;
    evidenceViewItem = { item: item, slotIndex: slotIndex };
    evidenceViewScrollOffset = 0; // Reset scroll when opening
}

function CloseEvidenceViewModal() {
    evidenceViewModalOpen = false;
    evidenceViewItem = null;
    evidenceViewScrollOffset = 0;
}

// Word wrap text function
function WrapText(text, maxWidth, context) {
    let lines = [];
    let paragraphs = text.split('\n');
    
    for (let para of paragraphs) {
        if (!para.trim()) {
            lines.push(''); // Preserve empty lines
            continue;
        }
        
        let words = para.split(' ');
        let currentLine = '';
        
        for (let word of words) {
            let testLine = currentLine ? currentLine + ' ' + word : word;
            let metrics = context.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine) {
                // Current line is too long, start a new line
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
    }
    
    return lines;
}

function RenderEvidenceViewModal() {
    if (!evidenceViewItem || !evidenceViewItem.item) {
        CloseEvidenceViewModal();
        return;
    }
    
    let item = evidenceViewItem.item;
    
    // Draw semi-transparent overlay
    mainCanvasContext.fillStyle = 'rgba(0, 0, 0, 0.8)';
    mainCanvasContext.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    
    // Modal dimensions (reduced size to fit on screen)
    let modalWidth = 500;
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
    
    // Draw title
    DrawText(item.name || 'EVIDENCE', modalX, modalY - modalHeight/2 + 25, 14, 'center', 1, '#FFF', '#000');
    
    // Draw drop button at top left (before title)
    let dropButtonWidth = 90;
    let dropButtonHeight = 25;
    let dropButtonX = modalX - modalWidth/2 + 20;
    let dropButtonY = modalY - modalHeight/2 + 25;
    let dropButtonHover = (mousePos.x >= dropButtonX - dropButtonWidth/2 && mousePos.x <= dropButtonX + dropButtonWidth/2 &&
                          mousePos.y >= dropButtonY - dropButtonHeight/2 && mousePos.y <= dropButtonY + dropButtonHeight/2);
    
    mainCanvasContext.fillStyle = dropButtonHover ? '#F44' : '#844';
    mainCanvasContext.fillRect(dropButtonX - dropButtonWidth/2, dropButtonY - dropButtonHeight/2, dropButtonWidth, dropButtonHeight);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(dropButtonX - dropButtonWidth/2, dropButtonY - dropButtonHeight/2, dropButtonWidth, dropButtonHeight);
    DrawText('DROP', dropButtonX, dropButtonY, 11, 'center', 1, '#FFF', '#000');
    
    // Draw close button (X) at top right
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
    
    // Handle drop button click
    if (MouseWasPressed() && dropButtonHover) {
        // Drop the evidence item
        DropEvidenceItem(evidenceViewItem.slotIndex, item);
        CloseEvidenceViewModal();
        return;
    }
    
    // Handle close button click
    if (MouseWasPressed() && closeButtonHover) {
        CloseEvidenceViewModal();
        return;
    }
    
    // Handle Escape key
    if (KeyWasPressed(27)) {
        CloseEvidenceViewModal();
        return;
    }
    
    // Draw conversation text area
    let textAreaX = modalX;
    let textAreaY = modalY;
    let textAreaWidth = modalWidth - 40;
    let textAreaHeight = modalHeight - 100; // Space for title/buttons at top and back button at bottom
    
    // Text area background
    mainCanvasContext.fillStyle = '#222';
    mainCanvasContext.fillRect(textAreaX - textAreaWidth/2, textAreaY - textAreaHeight/2 + 20, textAreaWidth, textAreaHeight);
    
    // Text area border
    mainCanvasContext.strokeStyle = '#666';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(textAreaX - textAreaWidth/2, textAreaY - textAreaHeight/2 + 20, textAreaWidth, textAreaHeight);
    
                    // Draw conversation text, case file text, judgment text, or document text with proper word wrapping
    let text = null;
    if (item.metadata) {
        // Check if it's a case file
        if (item.metadata.caseFileText) {
            text = item.metadata.caseFileText;
        } else if (item.metadata.conversationText) {
            text = item.metadata.conversationText;
        } else if (item.metadata.judgmentText) {
            text = item.metadata.judgmentText;
        } else if (item.metadata.documentText) {
            // Format document text with header info
            let docText = `${item.name}\n`;
            docText += `By: ${item.metadata.npcName || 'Unknown'}\n`;
            if (item.metadata.job) {
                docText += `Profession: ${item.metadata.job}\n`;
            }
            if (item.metadata.purchasePrice) {
                docText += `Purchased for: $${item.metadata.purchasePrice}\n`;
            }
            docText += '\n---\n\n';
            docText += item.metadata.documentText;
            text = docText;
        }
    }
    
    if (text) {
        // Draw text directly to preserve formatting
        mainCanvasContext.fillStyle = '#FFF';
        mainCanvasContext.font = '900 10px "Press Start 2P"';
        mainCanvasContext.textAlign = 'left';
        mainCanvasContext.textBaseline = 'top';
        
        // Word wrap the text
        let wrappedLines = WrapText(text, textAreaWidth - 20, mainCanvasContext);
        let lineHeight = 14;
        let startY = textAreaY - textAreaHeight/2 + 30;
        let maxVisibleLines = Math.floor(textAreaHeight / lineHeight) - 1;
        
        // Handle scrolling with mouse wheel or arrow keys
        if (KeyWasPressed(38)) { // Up arrow
            evidenceViewScrollOffset = Math.max(0, evidenceViewScrollOffset - 1);
        }
        if (KeyWasPressed(40)) { // Down arrow
            evidenceViewScrollOffset = Math.min(wrappedLines.length - maxVisibleLines, evidenceViewScrollOffset + 1);
        }
        
        // Draw visible lines
        let startLine = evidenceViewScrollOffset;
        for (let i = 0; i < Math.min(maxVisibleLines, wrappedLines.length - startLine); i++) {
            let line = wrappedLines[startLine + i];
            if (line) {
                mainCanvasContext.fillText(line, textAreaX - textAreaWidth/2 + 10, startY + i * lineHeight);
            }
        }
        
        // Draw scroll indicator if needed
        if (wrappedLines.length > maxVisibleLines) {
            let scrollBarX = textAreaX + textAreaWidth/2 - 15;
            let scrollBarY = textAreaY - textAreaHeight/2 + 20;
            let scrollBarHeight = textAreaHeight;
            let scrollThumbHeight = (maxVisibleLines / wrappedLines.length) * scrollBarHeight;
            let scrollThumbY = scrollBarY + (evidenceViewScrollOffset / (wrappedLines.length - maxVisibleLines)) * (scrollBarHeight - scrollThumbHeight);
            
            // Draw scrollbar track
            mainCanvasContext.fillStyle = '#444';
            mainCanvasContext.fillRect(scrollBarX, scrollBarY, 8, scrollBarHeight);
            
            // Draw scrollbar thumb
            mainCanvasContext.fillStyle = '#888';
            mainCanvasContext.fillRect(scrollBarX, scrollThumbY, 8, scrollThumbHeight);
        }
    } else {
        DrawText('NO CONVERSATION DATA', textAreaX, textAreaY, 12, 'center', 1, '#AAA', '#000');
    }
    
    // Draw back button at bottom
    let buttonY = modalY + modalHeight/2 - 35;
    let buttonWidth = 120;
    let buttonHeight = 30;
    
    // Back/Close button
    let backButtonX = modalX;
    let backButtonHover = (mousePos.x >= backButtonX - buttonWidth/2 && mousePos.x <= backButtonX + buttonWidth/2 &&
                          mousePos.y >= buttonY - buttonHeight/2 && mousePos.y <= buttonY + buttonHeight/2);
    
    mainCanvasContext.fillStyle = backButtonHover ? '#4A9' : '#4A6';
    mainCanvasContext.fillRect(backButtonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
    mainCanvasContext.strokeStyle = '#FFF';
    mainCanvasContext.lineWidth = 2;
    mainCanvasContext.strokeRect(backButtonX - buttonWidth/2, buttonY - buttonHeight/2, buttonWidth, buttonHeight);
    DrawText('BACK', backButtonX, buttonY, 12, 'center', 1, '#FFF', '#000');
    
    // Handle back button click
    if (MouseWasPressed() && backButtonHover) {
        CloseEvidenceViewModal();
    }
}

// General function to drop any item from inventory
function DropItem(slotIndex, item) {
    if (!player || !playerData || !item) return;
    
    // Coins cannot be dropped - they are not in inventory
    if (item.type === 'coin') {
        return;
    }
    
    // First, verify the item exists in inventory and find its actual index
    let actualIndex = -1;
    if (slotIndex >= 0 && slotIndex < playerData.inventory.length) {
        // Check if the item at this slot matches
        let slotItem = playerData.inventory[slotIndex];
        if (slotItem === item || 
            (slotItem.type === item.type && slotItem.name === item.name)) {
            actualIndex = slotIndex;
        }
    }
    
    // If slotIndex doesn't match, search for the item
    if (actualIndex === -1) {
        for (let i = playerData.inventory.length - 1; i >= 0; i--) {
            if (playerData.inventory[i] === item || 
                (playerData.inventory[i].type === item.type && playerData.inventory[i].name === item.name)) {
                actualIndex = i;
                break;
            }
        }
    }
    
    // Remove from inventory if found
    if (actualIndex >= 0) {
        playerData.inventory.splice(actualIndex, 1);
    } else {
        // Item not found in inventory, don't drop it (prevents duplication)
        console.warn('Item not found in inventory, cannot drop');
        return;
    }
    
    SaveGameState();
    
    // Clone the item object to avoid reference issues - preserve ALL properties including metadata
    let clonedItem = {
        type: item.type,
        name: item.name,
        tileX: item.tileX !== undefined ? item.tileX : 5,
        tileY: item.tileY !== undefined ? item.tileY : 5,
        quantity: item.quantity !== undefined ? item.quantity : 1
    };
    
    // Preserve metadata if it exists (critical for recordings, documents, bonuses, case files)
    if (item.metadata) {
        clonedItem.metadata = JSON.parse(JSON.stringify(item.metadata)); // Deep clone metadata
    }
    
    // Preserve any other properties that might exist
    for (let key in item) {
        if (!clonedItem.hasOwnProperty(key) && key !== 'metadata') {
            clonedItem[key] = item[key];
        }
    }
    
    // Create dropped item on ground in front of player (thrown forward)
    let dropPos = player.pos.Clone();
    
    // Drop in front of player based on rotation (throw forward, not behind)
    // rotation: 0=up, 1=right, 2=down, 3=left
    let dropOffset = 2.0; // Distance in front of player (increased to prevent immediate pickup)
    
    if (player.rotation === 0) {
        // Facing up, so throw forward (negative Y)
        dropPos.AddXY(0, -dropOffset);
    } else if (player.rotation === 1) {
        // Facing right, so throw forward (positive X)
        dropPos.AddXY(dropOffset, 0);
    } else if (player.rotation === 2) {
        // Facing down, so throw forward (positive Y)
        dropPos.AddXY(0, dropOffset);
    } else if (player.rotation === 3) {
        // Facing left, so throw forward (negative X)
        dropPos.AddXY(-dropOffset, 0);
    }
    
    // Create dropped item object with cloned item
    let droppedItem = new DroppedEvidence(dropPos, clonedItem);
    gameObjects.push(droppedItem);
}

// Keep old function name for backwards compatibility with evidence view modal
function DropEvidenceItem(slotIndex, item) {
    DropItem(slotIndex, item);
}

///////////////////////////////////////////////////////////////////////////////
// Dropped Evidence class

class DroppedEvidence extends MyGameObject
{
    constructor(pos, item)
    {
        // Use item's tileX/tileY if available, otherwise default to 5,5 (evidence sprite)
        let tileX = item.tileX !== undefined ? item.tileX : 5;
        let tileY = item.tileY !== undefined ? item.tileY : 5;
        super(pos, tileX, tileY, 0.5, 0.3);
        this.item = item;
        this.dropTime = gameTime ? gameTime.gameHour : 0;
        this.timeOffset = Rand(9);
        this.pickupDelay = new Timer();
        this.pickupDelay.Set(0.3); // Prevent pickup for 0.3 seconds after dropping
        this.isPickedUp = false; // Guard flag to prevent multiple pickups
        // Note: Not setting isSmallPickup so it appears both indoors and outdoors
    }
    
    Update()
    {
        // Check if 1 game hour has passed
        if (gameTime) {
            let currentHour = gameTime.gameHour;
            let hoursPassed = currentHour - this.dropTime;
            
            // Handle day rollover (if dropped near midnight)
            if (hoursPassed < 0) {
                hoursPassed = (24 - this.dropTime) + currentHour;
            }
            
            if (hoursPassed >= 1.0) {
                // 1 game hour has passed, remove the evidence
                this.Destroy();
                return;
            }
        }
        
        // Bob up and down like pickups
        this.height = .1 + .1 * Math.sin(2 * time + this.timeOffset);
        
        // Let player pick it up (only after delay has elapsed and not already picked up)
        if (!this.isPickedUp && player && !player.IsDead() && this.pickupDelay.Elapsed() && player.IsTouching(this)) {
            this.Pickup();
        }
        
        super.Update();
    }
    
    Pickup()
    {
        // CRITICAL: Prevent multiple pickups - return immediately if already picked up
        if (this.isPickedUp) {
            return;
        }
        
        // Set flag immediately to prevent any duplicate pickups
        this.isPickedUp = true;
        
        // Coins cannot be picked up from dropped items - they go directly to coin count
        if (this.item.type === 'coin') {
            // Add to coin count instead of inventory
            if (playerData) {
                let coinAmount = this.item.quantity || 1;
                playerData.coins += coinAmount;
                SaveGameState();
                PlaySound(10); // Use coin pickup sound
                this.Destroy();
            } else {
                // playerData is null - reset flag so pickup can be attempted again
                this.isPickedUp = false;
            }
            return;
        }
        
        // Add back to inventory if there's space
        if (playerData && playerData.inventory && playerData.inventory.length < 16) {
            playerData.inventory.push(this.item);
            SaveGameState();
            PlaySound(10); // Use coin pickup sound
            this.Destroy();
        } else {
            // Inventory full or playerData missing - reset flag so player can try again later
            this.isPickedUp = false;
        }
    }
    
    Render()
    {
        if (shadowRenderPass)
            return;
        
        // Render like a pickup item
        mainCanvasContext.save();
        let drawPos = this.pos.Clone();
        drawPos.y -= this.height;
        drawPos.Subtract(cameraPos).Multiply(tileSize * cameraScale);
        drawPos.Add(mainCanvasSize.Clone(.5));
        mainCanvasContext.translate(drawPos.x|0, drawPos.y|0);
        
        let s = this.size.x * tileSize * cameraScale;
        
        // Draw sprite from tileImage
        if (tileImage && tileImage.complete)
        {
            mainCanvasContext.drawImage(
                tileImage,
                this.tileX * tileSize, this.tileY * tileSize,
                tileSize, tileSize,
                -s, -s,
                s * 2, s * 2
            );
        }
        else
        {
            // Placeholder
            mainCanvasContext.fillStyle = '#642';
            mainCanvasContext.fillRect(-s, -s, s * 2, s * 2);
        }
        
        mainCanvasContext.restore();
    }
}

///////////////////////////////////////////////////////////////////////////////
// purchased items system

function LoadPurchasedItemSprites(callback)
{
    // Load all purchased item sprite images
    let spriteFiles = ['fridge.png', 'boat.png', 'car.png', 'jet.png'];
    let loaded = 0;
    let total = spriteFiles.length;
    
    spriteFiles.forEach(file => {
        let img = new Image();
        img.onload = () => {
            purchasedItemSprites[file] = img;
            loaded++;
            if (loaded === total && callback)
                callback();
        };
        img.onerror = () => {
            // Retry without cache-busting in case of cached 404
            let retryImg = new Image();
            retryImg.onload = () => {
                purchasedItemSprites[file] = retryImg;
                loaded++;
                if (loaded === total && callback)
                    callback();
            };
            retryImg.onerror = () => {
                // Final failure - will use placeholder in render
                console.warn(`Failed to load purchased item sprite: ${file}`);
                loaded++;
                if (loaded === total && callback)
                    callback();
            };
            // Retry with fresh request (no cache)
            retryImg.src = file + '?nocache=' + Math.random();
        };
        // Load with cache-busting to avoid browser-cached 404 responses
        img.src = file + '?v=1';
    });
}

class PurchasedItem extends MyGameObject
{
    constructor(pos, itemType)
    {
        // Define item properties
        let size, collisionSize, spriteFile;
        switch(itemType)
        {
            case 'fridge':
                size = 1.0;
                collisionSize = 0.8;
                spriteFile = 'fridge.png';
                break;
            case 'boat':
                size = 2.5;
                collisionSize = 2.0;
                spriteFile = 'boat.png';
                break;
            case 'car':
                size = 1.8;
                collisionSize = 1.5;
                spriteFile = 'car.png';
                break;
            case 'jet':
                size = 3.5;
                collisionSize = 3.0;
                spriteFile = 'jet.png';
                break;
            default:
                size = 1.0;
                collisionSize = 0.8;
                spriteFile = 'fridge.png';
        }
        
        super(pos, 0, 0, size, collisionSize);
        this.itemType = itemType;
        this.spriteFile = spriteFile;
        this.sprite = purchasedItemSprites[spriteFile];
        this.isPurchasedItem = 1;
        
        // Create unique ID based on position
        this.id = `purchased_${itemType}_${Math.round(pos.x * 100)}_${Math.round(pos.y * 100)}`;
        
        // Clear area around item and make it solid
        level.FillCircleType(pos, size * 1.2, 1); // grass
        level.FillCircleObject(pos, size * 1.5, 0); // clear objects
        
        // Make item area solid (impassable)
        level.FillCircleCallback(pos, size * 0.9, (data) => {
            if (!data.road) // Don't make roads solid
                data.type = 0; // solid
        });
    }
    
    Render()
    {
        // Purchased items don't cast shadows - skip shadow render pass
        if (shadowRenderPass)
            return;
        
        // Check for sprite dynamically (in case it loads after item is created)
        let sprite = purchasedItemSprites[this.spriteFile];
        
        // Custom transform for purchased items - no skewing, only proportional scaling
        mainCanvasContext.save();
        let drawPos = this.pos.Clone();
        drawPos.y -= this.height; // Apply height offset
        drawPos.Subtract(cameraPos).Multiply(tileSize*cameraScale);
        drawPos.Add(mainCanvasSize.Clone(.5));
        mainCanvasContext.translate(drawPos.x|0, drawPos.y|0);
        
        // Proportional scaling only (no skew)
        let s = this.size.Clone(tileSize * cameraScale);
        
        if (sprite)
        {
            // Draw custom sprite with proportional scaling
            mainCanvasContext.drawImage(sprite, -s.x, -s.y, s.x * 2, s.y * 2);
        }
        else
        {
            // Draw placeholder (gray rectangle)
            mainCanvasContext.fillStyle = '#888';
            mainCanvasContext.fillRect(-s.x, -s.y, s.x * 2, s.y * 2);
            mainCanvasContext.strokeStyle = '#000';
            mainCanvasContext.lineWidth = 2;
            mainCanvasContext.strokeRect(-s.x, -s.y, s.x * 2, s.y * 2);
        }
        
        mainCanvasContext.restore();
    }
    
    Save()
    {
        return {
            itemType: this.itemType,
            pos: { x: this.pos.x, y: this.pos.y }
        };
    }
}

// Place purchased item at position
function PlacePurchasedItem(itemType, pos)
{
    // Check if position is valid (not on road, not overlapping with other objects)
    if (!level.IsAreaClear(pos, 1.0))
    {
        // Try to find a nearby valid position
        let attempts = 0;
        let found = false;
        while (attempts < 10 && !found)
        {
            let angle = (attempts / 10) * Math.PI * 2;
            let distance = 1.0 + attempts * 0.5;
            let testPos = pos.Clone().AddXY(Math.cos(angle) * distance, Math.sin(angle) * distance);
            
            if (level.IsAreaClear(testPos, 1.0))
            {
                pos = testPos;
                found = true;
            }
            attempts++;
        }
        
        if (!found)
        {
            console.warn(`Could not find valid position for ${itemType}`);
            return null;
        }
    }
    
    // Create the purchased item
    let item = new PurchasedItem(pos, itemType);
    gameObjects.push(item);
    
    return item;
}

// Load purchased items from save data
function LoadPurchasedItems(itemsData)
{
    if (!itemsData || !Array.isArray(itemsData))
        return;
    
    for (let itemData of itemsData)
    {
        if (itemData.itemType && itemData.pos)
        {
            let pos = new Vector2(itemData.pos.x, itemData.pos.y);
            PlacePurchasedItem(itemData.itemType, pos);
        }
    }
}

///////////////////////////////////////////////////////////////////////////////
// building system

function LoadBuildingSprites(callback)
{
    // Load all building sprite images
    let spriteFiles = ['home.png', 'house.png', 'court.png', 'firm.png', 'shop.png', 'store.png'];
    let loaded = 0;
    let total = spriteFiles.length;
    
    spriteFiles.forEach(file => {
        let img = new Image();
        img.onload = () => {
            buildingSprites[file] = img;
            loaded++;
            if (loaded === total && callback)
                callback();
        };
        img.onerror = () => {
            // If sprite fails to load, still count it and proceed
            loaded++;
            if (loaded === total && callback)
                callback();
        };
        img.src = file;
    });
}

class Building extends MyGameObject
{
    constructor(pos, type, spriteFile, size = 1.5, address = null)
    {
        // Use placeholder tile for now until sprites load
        super(pos, 0, 0, size, size * 0.8);
        this.buildingType = type;
        this.spriteFile = spriteFile;
        this.sprite = buildingSprites[spriteFile];
        this.isBuilding = 1;
        this.address = address; // Building address number for scheduling/NPC systems
        
        // Create unique ID based on position (rounded to avoid floating point issues)
        this.id = `building_${Math.round(pos.x * 100)}_${Math.round(pos.y * 100)}`;
        
        // Store interior for persistence (will be created on first entry)
        this.interior = null;
        
        // Clear area around building and make it solid
        level.FillCircleType(pos, size * 1.2, 1); // grass
        level.FillCircleObject(pos, size * 1.5, 0); // clear objects
        
        // Make building area solid (impassable)
        level.FillCircleCallback(pos, size * 0.9, (data) => {
            if (!data.road) // Don't make roads solid
                data.type = 0; // solid
        });
    }
    
    Render()
    {
        // Buildings don't cast shadows - skip shadow render pass
        if (shadowRenderPass)
            return;
        
        // Check for sprite dynamically (in case it loads after building is created)
        let sprite = buildingSprites[this.spriteFile];
        
        // Custom transform for buildings - no skewing, only proportional scaling
        mainCanvasContext.save();
        let drawPos = this.pos.Clone();
        drawPos.y -= this.height; // Apply height offset
        drawPos.Subtract(cameraPos).Multiply(tileSize*cameraScale);
        drawPos.Add(mainCanvasSize.Clone(.5));
        mainCanvasContext.translate(drawPos.x|0, drawPos.y|0);
        
        // Proportional scaling only (no skew)
        let s = this.size.Clone(tileSize * cameraScale);
        
        if (sprite)
        {
            // Draw custom sprite with proportional scaling
            mainCanvasContext.drawImage(sprite, -s.x, -s.y, s.x * 2, s.y * 2);
        }
        else
        {
            // Draw placeholder (brown rectangle)
            mainCanvasContext.fillStyle = '#842';
            mainCanvasContext.fillRect(-s.x, -s.y, s.x * 2, s.y * 2);
            mainCanvasContext.strokeStyle = '#000';
            mainCanvasContext.lineWidth = 2;
            mainCanvasContext.strokeRect(-s.x, -s.y, s.x * 2, s.y * 2);
        }
        
        // Draw building address number on the sprite (small black text)
        if (this.address !== null && this.address !== undefined)
        {
            // Position address at bottom-center of building, scaled with camera
            let addressSize = 8 * cameraScale; // Small text that scales with zoom
            DrawText(String(this.address), 0, s.y * 0.65, addressSize, 'center', 0, '#000', '#000', mainCanvasContext);
        }
        
        mainCanvasContext.restore();
    }
}

///////////////////////////////////////////////////////////////////////////////
// Helper function to find valid spawn/exit position near a building
function FindValidPositionNearBuilding(building, preferredOffset = null, entitySize = 0.5)
{
    // Default to south of building if no preferred offset
    if (!preferredOffset)
    {
        preferredOffset = new Vector2(0, building.size.y + 0.5);
    }
    
    // Start with preferred position
    let basePos = building.pos.Clone().Add(preferredOffset);
    
    // Try positions in a spiral pattern around the preferred position
    let searchRadius = 0.5;
    const maxSearchRadius = 5.0; // Increased from 3.0 for better coverage
    const angleStep = Math.PI / 6; // 12 directions for better coverage
    let attempts = 0;
    const maxAttempts = 120; // Increased to allow more thorough search
    
    // Track best position found so far (even if on road)
    let bestPos = null;
    let bestPosOnRoad = false;
    
    while (attempts < maxAttempts && searchRadius <= maxSearchRadius)
    {
        // Try positions in a circle around base position
        for(let angle = 0; angle < Math.PI * 2; angle += angleStep)
        {
            let testPos = basePos.Clone();
            testPos.x += Math.cos(angle) * searchRadius;
            testPos.y += Math.sin(angle) * searchRadius;
            
            // Check if area is clear (not solid terrain)
            if (level.IsAreaClear(testPos, entitySize))
            {
                let data = level.GetDataFromPos(testPos);
                let isOnRoad = data.road;
                
                // Check if position doesn't overlap with other buildings
                let tooCloseToBuilding = false;
                for(let obj of gameObjects)
                {
                    if (obj.isBuilding && obj !== building)
                    {
                        // Check if test position is inside another building's solid area
                        let distToBuilding = testPos.Distance(obj.pos);
                        let buildingSolidRadius = obj.size.x * 0.9; // Building solid area
                        if (distToBuilding < buildingSolidRadius + entitySize + 0.3)
                        {
                            tooCloseToBuilding = true;
                            break;
                        }
                    }
                }
                
                if (!tooCloseToBuilding)
                {
                    // Prefer positions not on roads
                    if (!isOnRoad)
                    {
                        // Found ideal position - clear area and ensure it's walkable
                        level.FillCircleObject(testPos, entitySize + 0.3, 0); // Clear objects
                        level.FillCircleType(testPos, entitySize + 0.3, 1); // Ensure grass
                        return testPos;
                    }
                    else if (!bestPos)
                    {
                        // Save as fallback if we haven't found a non-road position yet
                        bestPos = testPos.Clone();
                        bestPosOnRoad = true;
                    }
                }
            }
            
            attempts++;
            if (attempts >= maxAttempts)
                break;
        }
        
        // Increase search radius for next iteration
        searchRadius += 0.5;
    }
    
    // Use best position found (even if on road) if available
    if (bestPos)
    {
        level.FillCircleObject(bestPos, entitySize + 0.3, 0); // Clear objects
        if (!bestPosOnRoad)
        {
            level.FillCircleType(bestPos, entitySize + 0.3, 1); // Ensure grass
        }
        return bestPos;
    }
    
    // Final fallback: validate and use preferred position
    // Check if fallback position is actually valid
    let fallbackValid = level.IsAreaClear(basePos, entitySize);
    if (!fallbackValid)
    {
        // Try to find ANY clear position near the building (last resort)
        for(let radius = 1.0; radius <= 8.0; radius += 1.0)
        {
            for(let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4)
            {
                let testPos = building.pos.Clone();
                testPos.x += Math.cos(angle) * radius;
                testPos.y += Math.sin(angle) * radius;
                
                if (level.IsAreaClear(testPos, entitySize))
                {
                    level.FillCircleObject(testPos, entitySize + 0.5, 0);
                    level.FillCircleType(testPos, entitySize + 0.5, 1);
                    return testPos;
                }
            }
        }
    }
    
    // Last resort: force clear the preferred position
    level.FillCircleObject(basePos, entitySize + 0.5, 0); // Clear objects
    level.FillCircleType(basePos, entitySize + 0.5, 1); // Ensure grass
    return basePos;
}

///////////////////////////////////////////////////////////////////////////////
// town generation

function GenerateTown()
{
    if (isLoadingWorld)
    {
        loadingProgress = 0.15;
        loadingMessage = 'Creating terrain...';
    }
    
    baseLevelColor = new Color(.1, .3, .1); // greenish town color (base for day/night cycle)
    levelColor = baseLevelColor.Clone();
    level = new Level();
    ClearGameObjects();
    
    // Fill entire map with grass
    for(let x = 0; x < levelSize; x++)
    for(let y = 0; y < levelSize; y++)
    {
        level.GetData(x, y).type = 1; // grass
    }
    
    if (isLoadingWorld)
    {
        loadingProgress = 0.25;
        loadingMessage = 'Building roads...';
    }
    
    // Create road network (4x4 grid system)
    let cellSize = levelSize / 4; // 16 tiles per cell
    let roadWidth = 2;
    
    // Horizontal roads
    for(let i = 1; i < 4; i++)
    {
        let y = i * cellSize;
        for(let x = 0; x < levelSize; x++)
        {
            for(let w = -roadWidth/2; w <= roadWidth/2; w++)
            {
                let data = level.GetData(x, y + w);
                if (data)
                {
                    data.road = 1;
                    data.object = 0; // clear objects on roads
                }
            }
        }
    }
    
    // Vertical roads
    for(let i = 1; i < 4; i++)
    {
        let x = i * cellSize;
        for(let y = 0; y < levelSize; y++)
        {
            for(let w = -roadWidth/2; w <= roadWidth/2; w++)
            {
                let data = level.GetData(x + w, y);
                if (data)
                {
                    data.road = 1;
                    data.object = 0; // clear objects on roads
                }
            }
        }
    }
    
    if (isLoadingWorld)
    {
        loadingProgress = 0.35;
        loadingMessage = 'Placing buildings...';
    }
    
    // Place buildings in grid cells
    let buildings = [];
    let cellPositions = [];
    
    // Generate positions for each cell
    for(let cx = 0; cx < 4; cx++)
    for(let cy = 0; cy < 4; cy++)
    {
        let cellX = cx * cellSize + cellSize / 2;
        let cellY = cy * cellSize + cellSize / 2;
        cellPositions.push(new Vector2(cellX, cellY));
    }
    
    // Shuffle cell positions for random placement
    for(let i = cellPositions.length - 1; i > 0; i--)
    {
        let j = RandInt(i + 1);
        let temp = cellPositions[i];
        cellPositions[i] = cellPositions[j];
        cellPositions[j] = temp;
    }
    
    // Building list to place: 1 home, 1 courthouse, 3 firms, 3 shops, 3 stores, 16 houses = 27 total
    let buildingsToPlace = [
        {type: 'home', file: 'home.png', size: 2, count: 1},
        {type: 'court', file: 'court.png', size: 2.5, count: 1},
        {type: 'firm', file: 'firm.png', size: 2, count: 3},
        {type: 'shop', file: 'shop.png', size: 1.5, count: 3},
        {type: 'store', file: 'store.png', size: 1.5, count: 3},
        {type: 'house', file: 'house.png', size: 1.5, count: 16}
    ];
    
    let cellIndex = 0;
    let buildingsInCurrentCell = 0;
    let maxBuildingsPerCell = 2; // Allow 2 buildings per cell
    let homeBuilding = null; // Track the home building for player spawn
    let buildingAddressCounter = 1; // Counter for assigning sequential addresses to buildings
    
    // Place all buildings
    for(let buildingType of buildingsToPlace)
    {
        for(let i = 0; i < buildingType.count; i++)
        {
            let pos;
            let attempts = 0;
            const maxAttempts = 50;
            const minDistance = 6; // Minimum 6 tiles between building centers
            const southEdgeMargin = 3; // Minimum distance from south edge of map
            
            // Try to find a valid position with proper spacing
            let placed = false;
            let totalAttempts = 0;
            const maxTotalAttempts = 500; // Overall limit to prevent infinite loops
            
            while (!placed && totalAttempts < maxTotalAttempts)
            {
                // Get current cell position
                let cellPos = cellPositions[cellIndex % cellPositions.length];
                
                // Calculate offset within cell (spread buildings out)
                let offsetX = 0;
                let offsetY = 0;
                if (buildingsInCurrentCell === 0)
                {
                    // First building in cell - center it
                    offsetX = RandBetween(-2, 2);
                    offsetY = RandBetween(-2, 2);
                }
                else
                {
                    // Second building - place it offset from center
                    offsetX = RandBetween(-5, 5);
                    offsetY = RandBetween(-5, 5);
                }
                
                pos = cellPos.Clone().AddXY(offsetX, offsetY);
                attempts++;
                totalAttempts++;
                
                // Check if building would be too close to south edge
                // Building uses size * 1.5 for clearance, so check that position + clearance doesn't reach south edge
                let buildingClearance = buildingType.size * 1.5;
                if (pos.y + buildingClearance >= levelSize - southEdgeMargin)
                {
                    // Too close to south edge, try again
                    continue;
                }
                
                // Check distance to all existing buildings
                let tooClose = false;
                for(let b of buildings)
                {
                    if (pos.Distance(b.pos) < minDistance)
                    {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose)
                {
                    placed = true;
                    break;
                }
                    
                // If too close and we've tried many times in this cell, try next cell
                if (attempts >= maxAttempts)
                {
                    cellIndex++;
                    buildingsInCurrentCell = 0;
                    attempts = 0;
                }
            }
            
            // If we still couldn't place it after many attempts, place it anyway (shouldn't happen with 16 cells)
            if (!placed)
            {
                // Fallback: place at a random valid cell position
                let fallbackCell = cellPositions[cellIndex % cellPositions.length];
                pos = fallbackCell.Clone().AddXY(RandBetween(-3, 3), RandBetween(-3, 3));
                
                // Ensure fallback position also respects south edge constraint
                let buildingClearance = buildingType.size * 1.5;
                if (pos.y + buildingClearance >= levelSize - southEdgeMargin)
                {
                    // Adjust position to be further from south edge
                    pos.y = levelSize - southEdgeMargin - buildingClearance - 1;
                }
                
                console.warn(`Warning: Building ${buildingType.type} placed at fallback position after ${totalAttempts} attempts`);
            }
            
            // Special handling for player home (first building)
            if (buildingType.type === 'home' && i === 0)
            {
                let building = new Building(pos, buildingType.type, buildingType.file, buildingType.size, buildingAddressCounter);
                buildingAddressCounter++;
                homeBuilding = building;
                buildings.push(building);
                
                // Calculate player spawn position - south of home, facing south
                // Use helper function to find valid position that avoids buildings and impassable terrain
                let spawnOffset = new Vector2(0, building.size.y * 1.5 + 1); // South of building with clearance
                playerHomePos = FindValidPositionNearBuilding(building, spawnOffset, 0.5);
            }
            else
            {
                let building = new Building(pos, buildingType.type, buildingType.file, buildingType.size, buildingAddressCounter);
                buildingAddressCounter++;
                buildings.push(building);
            }
            
            buildingsInCurrentCell++;
            if (buildingsInCurrentCell >= maxBuildingsPerCell)
            {
                buildingsInCurrentCell = 0;
                cellIndex++;
            }
        }
    }
    
    // Clear any existing object type 1 (bushes/plants) from the entire map first
    for(let x = 0; x < levelSize; x++)
    for(let y = 0; y < levelSize; y++)
    {
        let data = level.GetData(x, y);
        if (data.object == 1) // Remove any existing bushes/plants
            data.object = 0;
    }
    
    // Generate rocks randomly (no bushes/plants)
    for(let i = 0; i < 100; i++)
    {
        let pos = new Vector2(RandBetween(2, levelSize - 2), RandBetween(2, levelSize - 2));
        let data = level.GetDataFromPos(pos);
        
        // Don't place on roads or buildings
        if (data.road || data.IsSolid())
            continue;
            
        // Don't place at player spawn position (keep spawn area clear)
        if (playerHomePos && pos.Distance(playerHomePos) < 2)
            continue;
            
        // Check if too close to buildings
        let tooClose = false;
        for(let b of buildings)
        {
            if (pos.Distance(b.pos) < 3)
            {
                tooClose = true;
                break;
            }
        }
        if (tooClose)
            continue;
        
        // Place rock only (bushes/plants removed to avoid confusion with houseplant furniture)
        level.FillCircleObject(pos, RandBetween(0.3, 1), 2); // rock
    }
    
    if (isLoadingWorld)
    {
        loadingProgress = 0.55;
        loadingMessage = 'Finalizing terrain...';
    }
    
    // Draw the level
    level.ClearBorder();
    level.ApplyTiling();
    level.Redraw();
    
    if (isLoadingWorld)
    {
        loadingProgress = 0.6;
        loadingMessage = 'Building interiors...';
    }
    
    // Pre-generate all building interiors (for NPCs)
    GenerateAllInteriors(buildings);
}

// Render loading screen
function RenderLoadingScreen()
{
    // Clear canvas to black
    mainCanvasContext.fillStyle = '#000';
    mainCanvasContext.fillRect(0, 0, mainCanvasSize.x, mainCanvasSize.y);
    
    // Draw title
    let titleY = mainCanvasSize.y / 2 - 60;
    DrawText('Pocket Docket', mainCanvasSize.x / 2, titleY, 32, 'center', 2, '#FFF', '#000');
    
    // Draw loading message
    let messageY = mainCanvasSize.y / 2;
    DrawText(loadingMessage, mainCanvasSize.x / 2, messageY, 12, 'center', 1, '#FFF', '#000');
    
    // Draw progress bar background
    let barWidth = mainCanvasSize.x * 0.6;
    let barHeight = 8;
    let barX = (mainCanvasSize.x - barWidth) / 2;
    let barY = mainCanvasSize.y / 2 + 30;
    
    mainCanvasContext.fillStyle = '#333';
    mainCanvasContext.fillRect(barX, barY, barWidth, barHeight);
    
    // Draw progress bar fill
    let progressWidth = barWidth * Clamp(loadingProgress, 0, 1);
    mainCanvasContext.fillStyle = '#FFF';
    mainCanvasContext.fillRect(barX, barY, progressWidth, barHeight);
    
    // Draw progress percentage
    let percentText = Math.floor(loadingProgress * 100) + '%';
    DrawText(percentText, mainCanvasSize.x / 2, barY + barHeight + 15, 10, 'center', 0, '#FFF', '#000');
}

// Pre-generate all building interiors for NPCs
function GenerateAllInteriors(buildings)
{
    let oldLevelSize = levelSize;
    let totalBuildings = buildings.length;
    let processed = 0;
    
    for(let building of buildings)
    {
        // Update loading progress
        processed++;
        if (isLoadingWorld)
        {
            loadingProgress = 0.6 + (processed / totalBuildings) * 0.15; // 60% to 75%
        }
        // Skip if interior already exists
        if (building.interior)
            continue;
        
        let interiorSize = 16; // Default size
        let floorTint = new Color(0.4, 0.25, 0.15); // Default brown
        
        // Determine interior size and type based on building type
        if (building.buildingType === 'home')
        {
            interiorSize = 8;
            floorTint = new Color(0.4, 0.25, 0.15); // Dark brown
        }
        else if (building.buildingType === 'house')
        {
            interiorSize = 16;
            floorTint = new Color(0.4, 0.25, 0.15); // Dark brown
        }
        else if (building.buildingType === 'court')
        {
            interiorSize = 16;
            floorTint = new Color(0.5, 0.3, 0.7); // Purple
        }
        else if (building.buildingType === 'firm')
        {
            interiorSize = 16;
            floorTint = new Color(0.6, 0.5, 0.2); // Yellow/Gold
        }
        else if (building.buildingType === 'shop')
        {
            interiorSize = 16;
            floorTint = new Color(0.2, 0.4, 0.8); // Blue
        }
        else if (building.buildingType === 'store')
        {
            interiorSize = 16;
            floorTint = new Color(0.8, 0.4, 0.6); // Pink
        }
        
        // Set levelSize before creating interior (Level constructor uses it)
        levelSize = interiorSize;
        
        // Create interior
        let interior = new Interior(interiorSize, floorTint);
        
        // Generate interior based on building type
        if (building.buildingType === 'home')
        {
            interior.GenerateHome();
        }
        else if (building.buildingType === 'house')
        {
            interior.GenerateHouse();
        }
        else if (building.buildingType === 'court')
        {
            interior.GenerateCourthouse();
        }
        else if (building.buildingType === 'firm')
        {
            interior.GenerateFirm();
        }
        else if (building.buildingType === 'shop')
        {
            interior.GenerateShop();
        }
        else if (building.buildingType === 'store')
        {
            interior.GenerateStore();
        }
        else
        {
            // Default to house layout
            interior.GenerateHouse();
        }
        
        // Store interior on building
        building.interior = interior;
    }
    
    // CRITICAL: Remove all furniture from gameObjects
    // Furniture is automatically added to gameObjects when created (via GameObject constructor),
    // but it should only exist in gameObjects when someone is actually inside an interior.
    // Furniture will be re-added when entering interiors via EnterInterior().
    gameObjects = gameObjects.filter(o => !o.isFurniture);
    
    // Restore levelSize
    levelSize = oldLevelSize;
    
    // CRITICAL: Restore levelCanvas to exterior level size
    // The Level constructor resizes levelCanvas, so we need to restore it
    // after generating all interiors
    levelCanvas.width = levelCanvas.height = levelSize * tileSize;
    
    // Redraw the exterior level to ensure it's properly cached
    if (level)
    {
        level.Redraw();
    }
}

///////////////////////////////////////////////////////////////////////////////
// level builder (old code - keeping for reference, will be removed)
    
function GenerateMaze(cellCount)
{
    // 2d maze
    let size = levelMazeSize;
    let cells = [];
    cells.length = size*size;
    cells.fill(0);
    let GetCell=(x,y)=>cells[x+y*size];
    let SetCell=(x,y,v=1)=>cells[x+y*size]=v;
    
    // set start pos (it may change when generating the level)
    let xStart=RandInt(levelMazeSize);
    let yStart=RandInt(levelMazeSize);
    
    if (false) // disabled
    {
        // hub level
        xStart=yStart=0;
        SetCell(0,0);
        SetCell(1,0);
    }
    if (false) // disabled
    {
        // boss level
        xStart=0;
        yStart=3;
        SetCell(0,3);
        SetCell(1,3);
        SetCell(2,3);
        SetCell(1,2);
        for(let i=4;i--;)
        for(let j=2;j--;)
            SetCell(i,j);
    }
    
    playerStartPos = new Vector2(xStart, yStart);
    if (false) // disabled
        return cells;
        
    // depth first search style maze generation
    // https://en.wikipedia.org/wiki/Maze_generation_algorithm#Depth-first_search
    let IsOpen=(x,y)=>(IsArrayValid(x,y,size)? cells[x+y*size] : 0);
    let OpenNeighborCount=(xo,yo)=>
    {
        let n = 0;
        n += IsOpen(xo+1,yo);
        n += IsOpen(xo-1,yo);
        n += IsOpen(xo,yo+1);
        n += IsOpen(xo,yo-1);
        return n;
    }
    
    let CheckMove=(xo,yo,xd,yd)=>
    !(
        !IsArrayValid(xo+xd,yo+yd,size) || // must be valid cell
        IsOpen(xo+xd,yo+yd) ||             // must be solid

        // surrounding cells in that direction must be solid
        IsOpen(xo+xd*2,yo+yd*2) ||
        IsOpen(xo+xd*2+yd,yo+yd*2+xd) ||
        IsOpen(xo+xd*2-yd,yo+yd*2-xd) ||
        IsOpen(xo+xd+yd,yo+yd+xd) ||
        IsOpen(xo+xd-yd,yo+yd-xd)
    );
    
    let x=xStart;
    let y=yStart;
    SetCell(x,y);
        
    // generate a maze
    let stack = [];
    let endCount = 0;
    for(let i=0; i<cellCount*1.5; ++i)
    {
        // check which neighbors are valid moves
        let neighbors = 0;
        if (CheckMove(x,y,-1,0))
            ++neighbors;
        if (CheckMove(x,y,1,0))
            ++neighbors;
        if (CheckMove(x,y,0,-1))
            ++neighbors;
        if (CheckMove(x,y,0,1))
            ++neighbors;
            
        if (neighbors && i!=cellCount && (i<cellCount || Rand() < .5))
        {  
            // pick a random neighbor to open
            let xd = 0;
            let yd = 0;
            let r=RandInt(neighbors);
            if (CheckMove(x,y,-1,0) && !r--)
                xd=-1,yd=0;
            else if (CheckMove(x,y,1,0) && !r--)
                xd=1,yd=0;
            else if (CheckMove(x,y,0,-1) && !r--)
                xd=0,yd=-1;
            else
                xd=0,yd=1;
                
            stack.push({x:x,y:y});
            SetCell(x+=xd,y+=yd);
        }
        else if (stack.length)
        {
            // track dead ends (to put stores and powerups there)
            if (OpenNeighborCount(x,y)<=1)
                SetCell(x,y,2+endCount++);
            else if (Rand() < .5) // change up start pos
                playerStartPos.Set(x,y);
            
            // pop cell from stack and make current
            let c = stack.pop();
            x = c.x;
            y = c.y;
        }
        else
            break;
    }
    
    return cells;
}

function GenerateLevel()
{
    // randomize background color
    levelColor=new Color(Rand(.1),Rand(.1),Rand(.1));
    if (false) // disabled
        levelColor=new Color(.1,0,.2);
    
    // loop incase level generation fails
    while(!GenerateLevelInternal()){}
}

function GenerateLevelInternal()
{
    level = new Level();
    ClearGameObjects();
    
    // generate maze and draw to level data
    levelMaze = GenerateMaze(levelNumber);
    for(let x=levelMazeSize;x--;)
    for(let y=levelMazeSize;y--;)
    {
        if (!levelMaze[x+y*levelMazeSize])
            continue;

        // for each open maze cell, fill out a circle of open space
        let pos = (new Vector2(x+.5,y+.5)).Multiply(levelSize/levelMazeSize);
        let radius = 9;
        level.FillCircleType(pos,radius,1);
        for(let i=RandInt(4);i--;) // add extra randomness
            level.FillCircleType(pos.Clone().Add(RandVector(Rand(8))),RandBetween(2,6),1+RandInt(2));
    }
    
    // convert player pos to world pos
    playerStartPos.Add(.5).Multiply(levelSize/levelMazeSize);
    
    if (false) // disabled
    {
        // place a ton of objects everywhere
        let r = levelSize/levelMazeSize;
        for(let i=30;i--;)
            level.FillCircleObject(new Vector2(RandIntBetween(0,64),RandIntBetween(0,50)),RandIntBetween(4,14),1+RandInt(2));  
        level.FillCircleObject(playerStartPos,12,0);  
        level.FillCircleType(playerStartPos.Clone().AddXY(16,-20),12,1);
        level.FillCircleType(playerStartPos.Clone().AddXY(16,-14),12,1);

        // draw a heart
        let centerPos = new Vector2(24,18);
        level.FillCircleType(centerPos,9,2);
        level.FillCircleObject(centerPos,10,0);
        levelCanvasContext.fillStyle='#F00'
        levelCanvasContext.fillRect(0,0,mainCanvasSize.x,mainCanvasSize.y)
        levelCanvasContext.drawImage(tileImage,0,0);
        for(let x=16;x--;)
        for(let y=16;y--;)
        {
            let d = levelCanvasContext.getImageData(x+64, y+80, 1, 1).data;
            level.GetDataFromPos(centerPos.Clone().AddXY(x-8,y-7)).object=d[1]?2:d[0]?0:1;
        }
    }
    else if (false) // disabled
    {
        // set up start level area
        level.FillCircleType(playerStartPos,8,1); // start on grass
        level.FillCircleType(playerStartPos.Clone().AddXY(16,0),7,1);
        level.FillCircleObject(playerStartPos.Clone().AddXY(8,-2),3,1); 
        level.FillCircleObject(playerStartPos.Clone().AddXY(8,2),3,1); 
    }
    else
    {
        // place random objects
        for(let i=levelMazeSize*levelMazeSize*4;i--;)
            level.FillCircleObject(new Vector2(RandIntBetween(0,64),RandIntBetween(0,64)),RandIntBetween(1,10),RandInt(3));  
        
        // clear player start
        level.FillCircleObject(playerStartPos,RandBetween(2,5),0);

        // spawn enemies with a controled amount of total power
        let totalEnemyPower = levelNumber*5;
        let tries = 0;
        while(totalEnemyPower>0)
        {
            if (++tries>1e4)
                return 0;

            // pick random pos
            let pos = new Vector2(RandBetween(0,levelSize),RandBetween(0,levelSize));

            // must be open maze cell except level 1
            let m = levelMaze[MazeDataPos(pos)]
            if (!m || (m==2 && levelNumber>1))
                continue; 

            // must not be near player
            if (pos.Distance(playerStartPos) < 15)
                continue;

            // must be clear
            if (tries > 500)
                level.FillCircleObject(pos,2,0); // clear area if necessary
            if (!level.IsAreaClear(pos,2))
                continue;

            // spawn enemy
            let enemyPower = 0;
            let e;
            if (Rand() < .33 || levelNumber<=1)
            {
                // slime enemy
                let healthLevel = RandIntBetween(1,3);
                if (Rand() < .1 && levelNumber > 5)
                    healthLevel = 4;
                
                let difficulty = levelNumber<5||Rand()<.5?1:2;
                e = new SlimeEnemy(pos,healthLevel,difficulty);
                enemyPower = difficulty*healthLevel;
            }
            else if (levelNumber != 3 && (Rand() < .5 || levelNumber<=2))
            {
                // jumping enemy
                let isBig = Rand() < .1 && levelNumber > 3;
                e = new JumpingEnemy(pos,isBig);
                enemyPower = isBig?6:2;
            }
            else // shield enemy
            {
                let isBig = Rand() < .1 && levelNumber > 4;
                e = new ShieldEnemy(pos,0,isBig);
                enemyPower = isBig?9:3;
            }
            if (levelNumber > 4 && Rand()<.1)
            {
                 // random invisible enemy
                e.isInvisible = 1;
                enemyPower *= 2;
            }
                
            totalEnemyPower -= enemyPower;
        }
    }
    
    // spawn stores and other special objects
    if (false) // disabled
    {
        // title screen
        new Store(new Vector2(24,3.5));
        new ShieldEnemy(playerStartPos.Clone(), 1);
        new Pickup(playerStartPos.Clone().Add(new Vector2(16,0)), 2);
        levelExit = new LevelExit(new Vector2(24,13));
        
        if (warpLevel>1)
            new LevelExit(new Vector2(29.5,8),2); // warp
        if (localStorage.kbap_won)
            new LevelExit(new Vector2(29.5,13),3); // speed run
    }
    else if (false) // disabled
    {
        // boss level
        new Store(new Vector2(43,47));
        new ShieldEnemy(playerStartPos.Clone().Add(new Vector2(.5,0)), 1);
        new Pickup(new Vector2(24,19.5), 2);
    }
    else
    {
        // spawn stores and special powerups
        for(let x=levelMazeSize;x--;)
        for(let y=levelMazeSize;y--;)
        {
            let m = levelMaze[x+y*levelMazeSize];
            if (m==2 && levelNumber > 1)
            {
                let p = new Vector2(x+.5,y+.5).Multiply(levelSize/levelMazeSize);
                let d = p.Distance(playerStartPos);
                if (d>30&&Rand()<.3)
                {
                    // random powerup spawn
                    if (Rand()>.5)
                        new Pickup(p, 2);
                    else
                        new Boomerang(p);  
                         
                    level.FillCircleType(p,RandIntBetween(2,4),1);
                    level.FillCircleObject(p,RandIntBetween(3,5),0); 
                }
                else
                    new Store(p);
            }
        }

        new LevelExit(playerStartPos,1);
    }
    
    // draw the level
    level.ClearBorder();
    level.ApplyTiling();
    level.Redraw();
    
    return 1;
}

///////////////////////////////////////////////////////////////////////////////
// level transition system

let transitionTimer = new Timer();
let transitionCanvas = c2;
let transitionCanvasContext = transitionCanvas.getContext('2d');
function StartTransiton()
{
    // copy main canvas to transition canvas
    transitionTimer.Set();
    transitionCanvas.width = mainCanvasSize.x;
    transitionCanvas.height = mainCanvasSize.y;
    transitionCanvasContext.drawImage(mainCanvas,0,0);
}

function UpdateTransiton()
{
    let transitionTime = transitionTimer.Get();
    if (transitionTime > 2)
        return;
        
    // render stored main canvas with circle transition effect
    mainCanvasContext.save();
    mainCanvasContext.beginPath();
    let r = transitionTime*mainCanvasSize.x/2;
    mainCanvasContext.rect(0,0,mainCanvasSize.x,mainCanvasSize.y);
    mainCanvasContext.arc(mainCanvasSize.x/2,mainCanvasSize.y/2,r,0,7);
    mainCanvasContext.clip('evenodd');
    mainCanvasContext.drawImage(transitionCanvas,0,0);
    mainCanvasContext.restore();
}

///////////////////////////////////////////////////////////////////////////////
// ZzFXmicro - Zuper Zmall Zound Zynth - MIT License - Copyright 2019 Frank Force
let zzfx_v=.2;
let zzfx_x=0;
let zzfx=(e,f,a,b=1,d=.1,g=0,h=0,k=0,l=0)=>{if(!zzfx_x)return;let S=44100;a*=2*PI/S;a*=1+RandBetween(-f,f);g*=1E3*PI/(S**2);b=S*b|0;d=d*b|0;k*=2*PI/S;l*=PI;f=[];for(let m=0,n=0,c=0;c<b;++c)f[c]=e*zzfx_v*Math.cos(m*a*Math.cos(n*k+l))*(c<d?c/d:1-(c-d)/(b-d)),m+=1+RandBetween(-h,h),n+=1+RandBetween(-h,h),a+=g;e=zzfx_x.createBuffer(1,b,S);a=zzfx_x.createBufferSource();e.getChannelData(0).set(f);a.buffer=e;a.connect(zzfx_x.destination);a.start();return a}

let beatTimer = new Timer();
let beatCount = 0;
let lastNote;
function UpdateAudio()
{
    if (!zzfx_x && MouseWasPressed() && soundEnable)
        zzfx_x = new AudioContext;

    if (coinSoundTimer.IsSet() && coinSoundTimer.Elapsed())
    {
        // coin sound plays twice quickly with higher pitch the second time
        PlaySound(10, 800)
        coinSoundTimer.UnSet();
    }

    // Music disabled for now
    return;
        
    // update music
    let scale = [-5,0,2,4,7,12,-5,-8]; // major pentatonic scale
    if (beatTimer.Elapsed())
    {
        ++beatCount;
        beatTimer.Set(.5);
        
        // melody
        if (beatCount>15 && (!(beatCount&1) || RandInt(2)))
        {
            if (beatCount%8==0)
                lastNote = 1; // return to root note every 8 beats
            
            // play the note
            zzfx(.4,0,220*2**(scale[lastNote]/12), (RandInt(2)+1)/2, .05, 0, .4);
            
            // random walk to another note in the scale
            lastNote = (lastNote + (RandInt(6)-2)+scale.length)%scale.length;
        }
        
        // precussion
        if (beatCount%2==0||beatCount&18||!RandInt(20))
        {
            if (beatCount%4==0)
                zzfx(.3,.2,1e3,.08,.05,.8,21,51); // ZzFX  highhat
            else
                zzfx(.8,.2,150,.04,.002,.1,1,.5,.15); // ZzFX 17553 kick
        }
    }
}

function PlaySound(sound, p=0)
{
    switch(sound)
    {
        case 1: // player hit
        zzfx(1,.1,4504,.3,.1,-30,.5,.5,.33); // ZzFX 36695
        break;
        
        case 2: // player die
        zzfx(.7,0,500,4,.01,-0.2,3,3,0); // ZzFX 23250
        break;
        
        case 3: // get heart
        zzfx(1,0,1504,.3,.17,1.7,.5,.4,.33); // ZzFX 36695
        break;
        
        case 4: // get heart container
        zzfx(1,0,805,1.1,.71,.5,1.5,.5);  // ZzFX 16886
        break;
        
        case 5: // boomerang cut
        zzfx(.3,.2,370,.2,.1,3.9,13,27,.12); // ZzFX 23473
        break;
        
        case 6: // boomerang catch
        zzfx(1,.1,0,.2,.23,2,.4,.6,.9); // ZzFX 20183
        break;
        
        case 7: // boomerang throw
        zzfx(1,.1,53,.2,.26,0,.1,7.5,.58); // ZzFX 24904
        break;
        
        case 8: // enemy hit
        zzfx(1,.2,370,.1,.23,4.5,2.8,27.4,.12); // ZzFX 23473
        break;

        case 9: // enemy kill
        zzfx(1,.1,1138,.2,.02,0,4,1.2,.1); // ZzFX 10015
        break;

        case 10: // coin
        if (!coinSoundTimer.IsSet())
            coinSoundTimer.Set(.05); // trigger coin sound to play again
        zzfx(1,.01,800+p,.2,.05); // ZzFX 98600
        break;
        
        case 11: // low health
        zzfx(.4,.1,418,.1,.79,5,0,1.9,.74); // ZzFX 7364
        break;

        case 12: // dash
        zzfx(1,.1,319,.4,.08,6.6,3.2,2.6,.59); // ZzFX 79527
        break;

        case 13: // teleport
        zzfx(1,.1,7,1,.97,0,.6,21.7,.5); // ZzFX 60532
        break;

        case 14: // boomerang hit solid
        zzfx(.8,.1,70,.1,.23,4.5,2.8,27,.12); // ZzFX 23473
        break;

        case 15: // boomerang reflect
        zzfx(1,.1,800,.2,.02,-0.3); // ZzFX 14772
        break;

        case 16: // dodge recharge
        zzfx(1,.1,0,.1,.1,1,.1,100); // ZzFX 88949
        break;
    }
}

///////////////////////////////////////////////////////////////////////////////
// Store Modal

// Initialize Store modal
function InitStoreModal() {
    const modal = document.getElementById('storeModal');
    const closeBtn = document.getElementById('closeStoreModal');
    
    if (!modal || !closeBtn) {
        console.warn('Store modal elements not found');
        return;
    }
    
    closeBtn.addEventListener('click', CloseStoreModal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            CloseStoreModal();
        }
    });
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && storeModalOpen) {
            CloseStoreModal();
        }
    });
    
    // Purchase button handlers
    const purchaseButtons = document.querySelectorAll('.store-item-button');
    purchaseButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const itemType = button.getAttribute('data-item');
            const price = parseInt(button.getAttribute('data-price'));
            PurchaseItem(itemType, price);
        });
    });
}

// Generate skin thumbnails from tiles5.png and tiles6.png
function GenerateSkinThumbnails() {
    // Generate thumbnails for skins 0-5 (tiles5.png)
    if (tileImage5 && tileImage5.complete) {
        for (let skinIndex = 0; skinIndex < 6; skinIndex++) {
            const canvas = document.getElementById(`skin${skinIndex}Image`);
            if (!canvas) continue;
            
            const ctx = canvas.getContext('2d');
            const tileX = 7; // Last sprite (column 7)
            const tileY = skinIndex; // Row matches skin index
            
            // Clear and draw the sprite
            ctx.clearRect(0, 0, 16, 16);
            ctx.drawImage(
                tileImage5,
                tileX * 16, tileY * 16, 16, 16, // Source
                0, 0, 16, 16 // Destination
            );
        }
    }
    
    // Generate thumbnails for skins 6-11 (tiles6.png)
    if (tileImage6 && tileImage6.complete) {
        for (let skinIndex = 6; skinIndex < 12; skinIndex++) {
            const canvas = document.getElementById(`skin${skinIndex}Image`);
            if (!canvas) continue;
            
            const ctx = canvas.getContext('2d');
            const tileX = 7; // Last sprite (column 7)
            const tileY = skinIndex - 6; // Row within tiles6.png
            
            // Clear and draw the sprite
            ctx.clearRect(0, 0, 16, 16);
            ctx.drawImage(
                tileImage6,
                tileX * 16, tileY * 16, 16, 16, // Source
                0, 0, 16, 16 // Destination
            );
        }
    }
    
    // If images aren't loaded yet, try again after a short delay
    if ((!tileImage5 || !tileImage5.complete) || (!tileImage6 || !tileImage6.complete)) {
        setTimeout(GenerateSkinThumbnails, 100);
    }
}

// Open Store modal
function OpenStoreModal() {
    if (storeModalOpen) return;
    
    storeModalOpen = true;
    const modal = document.getElementById('storeModal');
    if (modal) {
        GenerateSkinThumbnails();
        UpdateStoreBalance();
        UpdatePurchaseButtons();
        modal.classList.add('open');
    }
}

// Close Store modal
function CloseStoreModal() {
    if (!storeModalOpen) return;
    
    storeModalOpen = false;
    const modal = document.getElementById('storeModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

///////////////////////////////////////////////////////////////////////////////
// Game Over Modal

// Check if game over modal is open
function IsGameOverModalOpen() {
    return gameOverModalOpen;
}

// Show game over modal
function ShowGameOverModal(message = '') {
    if (gameOverModalOpen) return;
    
    gameOverModalOpen = true;
    
    // Start fade to black
    gameOverFadeActive = true;
    gameOverFadeTimer.Set(1.0); // 1 second fade
    
    const modal = document.getElementById('gameOverModal');
    const messageEl = document.getElementById('gameOverMessage');
    const countdownEl = document.getElementById('gameOverCountdown');
    
    if (!modal) {
        console.warn('Game Over modal element not found');
        return;
    }
    
    // Set message if provided
    if (messageEl && message) {
        messageEl.textContent = message;
    } else if (messageEl) {
        messageEl.textContent = '';
    }
    
    // Show modal
    modal.classList.add('open');
    
    // Close any other open modals
    if (typeof CloseDialogueModal !== 'undefined' && IsDialogueModalOpen()) {
        CloseDialogueModal();
    }
    if (typeof CloseRentModal !== 'undefined' && IsRentModalOpen()) {
        CloseRentModal();
    }
    if (typeof ClosePenaltyModal !== 'undefined' && IsPenaltyModalOpen()) {
        ClosePenaltyModal();
    }
    if (storeModalOpen) {
        CloseStoreModal();
    }
    if (lawSchoolModalOpen) {
        CloseLawSchoolModal();
    }
    if (inventoryOpen) {
        inventoryOpen = false;
    }
    
    console.log('[GAME OVER] Game Over modal shown');
}

// Close game over modal
function CloseGameOverModal() {
    if (!gameOverModalOpen) return;
    
    gameOverModalOpen = false;
    gameOverFadeActive = false;
    gameOverFadeTimer.UnSet();
    
    const modal = document.getElementById('gameOverModal');
    if (modal) {
        modal.classList.remove('open');
    }
    
    console.log('[GAME OVER] Game Over modal closed');
}

// Update store balance display
function UpdateStoreBalance() {
    const balanceEl = document.getElementById('storeBalance');
    if (balanceEl && typeof playerData !== 'undefined' && playerData) {
        const coins = playerData.coins || 0;
        balanceEl.textContent = `Balance: $${coins}`;
    }
}

// Update purchase buttons based on available funds
function UpdatePurchaseButtons() {
    if (typeof playerData === 'undefined' || !playerData) return;
    
    const coins = playerData.coins || 0;
    const purchaseButtons = document.querySelectorAll('.store-item-button');
    
    purchaseButtons.forEach(button => {
        const price = parseInt(button.getAttribute('data-price'));
        if (coins >= price) {
            button.disabled = false;
        } else {
            button.disabled = true;
        }
    });
}

// Purchase item
function PurchaseItem(itemType, price) {
    if (typeof playerData === 'undefined' || !playerData) {
        console.warn('Player data not available');
        return;
    }
    
    const coins = playerData.coins || 0;
    if (coins < price) {
        PlaySound(15); // Error sound
        return;
    }
    
    // Check if this is a skin purchase
    if (itemType && itemType.startsWith('skin')) {
        const skinIndex = parseInt(itemType.replace('skin', ''));
        if (!isNaN(skinIndex) && skinIndex >= 0 && skinIndex <= 11) {
            // Deduct coins
            playerData.coins = coins - price;
            
            // Set the skin
            playerData.currentSkin = skinIndex;
            
            // Update UI
            UpdateStoreBalance();
            UpdatePurchaseButtons();
            
            // Save game state
            SaveGameState();
            
            // Play purchase sound
            PlaySound(10); // Coin sound
            
            // Close modal after purchase
            CloseStoreModal();
            return;
        }
    }
    
    // Legacy item purchase (shouldn't happen with new store, but keep for compatibility)
    // Deduct coins
    playerData.coins = coins - price;
    
    // Place item at player position
    if (player && player.pos) {
        PlacePurchasedItem(itemType, player.pos.Clone());
    }
    
    // Update UI
    UpdateStoreBalance();
    UpdatePurchaseButtons();
    
    // Save game state
    SaveGameState();
    
    // Play purchase sound
    PlaySound(10); // Coin sound
    
    // Close modal after purchase
    CloseStoreModal();
}

///////////////////////////////////////////////////////////////////////////////
// Law School Modal

// Initialize Law School modal
function InitLawSchoolModal() {
    const modal = document.getElementById('lawSchoolModal');
    const closeBtn = document.getElementById('closeLawSchoolModal');
    
    if (!modal || !closeBtn) {
        console.warn('Law School modal elements not found');
        return;
    }
    
    // Close modal handlers
    closeBtn.addEventListener('click', CloseLawSchoolModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            CloseLawSchoolModal();
        }
    });
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && lawSchoolModalOpen) {
            CloseLawSchoolModal();
        }
    });
}

// Open Law School modal
function OpenLawSchoolModal() {
    if (lawSchoolModalOpen) return;
    
    lawSchoolModalOpen = true;
    const modal = document.getElementById('lawSchoolModal');
    if (modal) {
        modal.classList.add('open');
    }
}

// Close Law School modal
function CloseLawSchoolModal() {
    if (!lawSchoolModalOpen) return;
    
    lawSchoolModalOpen = false;
    const modal = document.getElementById('lawSchoolModal');
    if (modal) {
        modal.classList.remove('open');
    }
}

// load texture and building sprites, then kick off init!
let tileImage = new Image();
let tilesLoaded = 0;
let totalTilesToLoad = 4;
let tilesLoadedCallback = null;

tileImage.onload = () => {
    tilesLoaded++;
    if (tilesLoaded >= totalTilesToLoad && tilesLoadedCallback)
    {
        tilesLoadedCallback();
    }
};
tileImage.src = 'tiles.png';

// Load tiles2.png for furniture
tileImage2 = new Image();
tileImage2.onload = () => {
    tilesLoaded++;
    if (tilesLoaded >= totalTilesToLoad && tilesLoadedCallback)
    {
        tilesLoadedCallback();
    }
};
tileImage2.src = 'tiles2.png';

// Load tiles5.png for player skins
tileImage5 = new Image();
tileImage5.onload = () => {
    tilesLoaded++;
    if (tilesLoaded >= totalTilesToLoad && tilesLoadedCallback)
    {
        tilesLoadedCallback();
    }
};
tileImage5.src = 'tiles5.png';

// Load tiles6.png for player skins (6-11)
tileImage6 = new Image();
tileImage6.onload = () => {
    tilesLoaded++;
    if (tilesLoaded >= totalTilesToLoad && tilesLoadedCallback)
    {
        tilesLoadedCallback();
    }
};
tileImage6.src = 'tiles6.png';

// Initialize Law School modal on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        InitLawSchoolModal();
        InitStoreModal();
    });
} else {
    InitLawSchoolModal();
    InitStoreModal();
}

// Set up callback after both tiles load
tilesLoadedCallback = () => {
    // After all tiles load, load NPC sprites, then building sprites, then purchased item sprites, then init
    LoadNPCSprites(() => {
        LoadBuildingSprites(() => {
            LoadPurchasedItemSprites(() => {
                Init();
            });
        });
    });
};