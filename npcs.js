///////////////////////////////////////////////////////////////////////////////
// NPC System

// NPC sprite images (tiles3.png and tiles4.png)
let tileImage3 = null;
let tileImage4 = null;
let npcSpritesLoaded = 0;

// Navigation grid for A* pathfinding
let navigationGrid = null; // 64x64 grid: true = walkable, false = blocked
let navigationGridSize = 64; // Match levelSize

// Build navigation grid - marks walkable/unwalkable cells
function BuildNavigationGrid()
{
    if (!level || typeof levelSize === 'undefined')
        return;
    
    navigationGrid = [];
    navigationGridSize = levelSize;
    
    // Initialize grid - all walkable by default
    for(let y = 0; y < navigationGridSize; y++)
    {
        navigationGrid[y] = [];
        for(let x = 0; x < navigationGridSize; x++)
        {
            navigationGrid[y][x] = true; // Default to walkable
        }
    }
    
    // Mark solid terrain and objects as unwalkable
    for(let y = 0; y < navigationGridSize; y++)
    {
        for(let x = 0; x < navigationGridSize; x++)
        {
            let data = level.GetData(x, y);
            if (data.IsSolid())
            {
                navigationGrid[y][x] = false; // Blocked
            }
        }
    }
    
    // Mark building areas as unwalkable
    for(let obj of gameObjects)
    {
        if (obj.isBuilding)
        {
            // Mark building area as unwalkable (circular area)
            let buildingRadius = obj.size.x * 0.9; // Building solid radius
            let centerX = obj.pos.x;
            let centerY = obj.pos.y;
            
            // Mark all cells within building radius
            for(let y = 0; y < navigationGridSize; y++)
            {
                for(let x = 0; x < navigationGridSize; x++)
                {
                    let cellX = x + 0.5; // Cell center
                    let cellY = y + 0.5;
                    let dist = Math.hypot(cellX - centerX, cellY - centerY);
                    
                    if (dist < buildingRadius)
                    {
                        navigationGrid[y][x] = false; // Blocked by building
                    }
                }
            }
        }
    }
}

// A* pathfinding - returns array of waypoints (Vector2 positions) or null if no path
function FindPathAStar(startPos, endPos)
{
    if (!navigationGrid || !startPos || !endPos)
        return null;
    
    // Convert world positions to grid coordinates
    let startX = Math.floor(startPos.x);
    let startY = Math.floor(startPos.y);
    let endX = Math.floor(endPos.x);
    let endY = Math.floor(endPos.y);
    
    // Clamp to grid bounds
    startX = Math.max(0, Math.min(navigationGridSize - 1, startX));
    startY = Math.max(0, Math.min(navigationGridSize - 1, startY));
    endX = Math.max(0, Math.min(navigationGridSize - 1, endX));
    endY = Math.max(0, Math.min(navigationGridSize - 1, endY));
    
    // Check if start or end is blocked
    if (!navigationGrid[startY][startX] || !navigationGrid[endY][endX])
    {
        // Try to find nearest walkable cell
        let startFound = false;
        let endFound = false;
        
        // Find nearest walkable cell for start
        for(let radius = 1; radius <= 3 && !startFound; radius++)
        {
            for(let dy = -radius; dy <= radius; dy++)
            {
                for(let dx = -radius; dx <= radius; dx++)
                {
                    let testX = startX + dx;
                    let testY = startY + dy;
                    if (testX >= 0 && testX < navigationGridSize && 
                        testY >= 0 && testY < navigationGridSize &&
                        navigationGrid[testY][testX])
                    {
                        startX = testX;
                        startY = testY;
                        startFound = true;
                        break;
                    }
                }
                if (startFound) break;
            }
        }
        
        // Find nearest walkable cell for end
        for(let radius = 1; radius <= 3 && !endFound; radius++)
        {
            for(let dy = -radius; dy <= radius; dy++)
            {
                for(let dx = -radius; dx <= radius; dx++)
                {
                    let testX = endX + dx;
                    let testY = endY + dy;
                    if (testX >= 0 && testX < navigationGridSize && 
                        testY >= 0 && testY < navigationGridSize &&
                        navigationGrid[testY][testX])
                    {
                        endX = testX;
                        endY = testY;
                        endFound = true;
                        break;
                    }
                }
                if (endFound) break;
            }
        }
        
        if (!startFound || !endFound)
            return null; // Can't find walkable cells
    }
    
    // A* algorithm
    let openSet = [{x: startX, y: startY, g: 0, h: 0, f: 0, parent: null}];
    let closedSet = {};
    let cameFrom = {};
    
    // Heuristic function (Manhattan distance)
    let heuristic = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);
    
    while (openSet.length > 0)
    {
        // Find node with lowest f score
        let currentIndex = 0;
        for(let i = 1; i < openSet.length; i++)
        {
            if (openSet[i].f < openSet[currentIndex].f)
                currentIndex = i;
        }
        
        let current = openSet[currentIndex];
        
        // Check if we reached the goal
        if (current.x === endX && current.y === endY)
        {
            // Reconstruct path
            let path = [];
            let node = current;
            while (node)
            {
                // Convert grid coordinates back to world positions (cell centers)
                path.unshift(new Vector2(node.x + 0.5, node.y + 0.5));
                node = node.parent;
            }
            return path;
        }
        
        // Move current from open to closed
        openSet.splice(currentIndex, 1);
        let key = `${current.x},${current.y}`;
        closedSet[key] = true;
        
        // Check neighbors (4-directional: up, down, left, right)
        let neighbors = [
            {x: current.x, y: current.y - 1},
            {x: current.x, y: current.y + 1},
            {x: current.x - 1, y: current.y},
            {x: current.x + 1, y: current.y}
        ];
        
        for(let neighbor of neighbors)
        {
            // Check bounds
            if (neighbor.x < 0 || neighbor.x >= navigationGridSize ||
                neighbor.y < 0 || neighbor.y >= navigationGridSize)
                continue;
            
            // Check if walkable
            if (!navigationGrid[neighbor.y][neighbor.x])
                continue;
            
            let neighborKey = `${neighbor.x},${neighbor.y}`;
            if (closedSet[neighborKey])
                continue;
            
            // Calculate g score (movement cost)
            let g = current.g + 1;
            
            // Check if this neighbor is already in open set
            let inOpenSet = false;
            let neighborNode = null;
            for(let node of openSet)
            {
                if (node.x === neighbor.x && node.y === neighbor.y)
                {
                    inOpenSet = true;
                    neighborNode = node;
                    break;
                }
            }
            
            if (!inOpenSet)
            {
                // Add to open set
                let h = heuristic(neighbor.x, neighbor.y, endX, endY);
                neighborNode = {
                    x: neighbor.x,
                    y: neighbor.y,
                    g: g,
                    h: h,
                    f: g + h,
                    parent: current
                };
                openSet.push(neighborNode);
            }
            else if (g < neighborNode.g)
            {
                // Found better path to this neighbor
                neighborNode.g = g;
                neighborNode.f = g + neighborNode.h;
                neighborNode.parent = current;
            }
        }
    }
    
    // No path found
    return null;
}

// NPC management
let allNPCs = []; // All NPCs in the game
let npcSurnames = []; // Pool of unique surnames
let npcCharacteristics = ['rude', 'joyful', 'insane', 'flirtatious', 'grumpy', 'cheerful', 'mysterious', 'talkative', 'quiet', 'energetic', 'criminal', 'nervous', 'confident', 'shy', 'bold', 'cautious', 'friendly', 'hostile', 'curious', 'indifferent', 'optimistic', 'pessimistic', 'wise', 'foolish', 'brave', 'sarcastic', 'serious', 'playful', 'anxious', 'calm', 'passionate', 'stoic', 'charismatic', 'aloof', 'gossipy', 'reserved', 'impulsive', 'methodical', 'stubborn', 'flexible', 'analytical', 'creative', 'paranoid', 'trusting', 'ambitious', 'laid-back', 'perfectionist', 'sloppy', 'gentle', 'aggressive', 'psychotic', 'delusional', 'mentally handicapped', 'racist', 'homosexual', 'homeless', 'drug addicted', 'violent', 'angry', 'stoned and high', 'confused', 'anarchstic', 'corrupt', 'generous', 'wrathful', 'horny', 'nihilistic'];
// Use emoji filenames directly (OpenMoji format) - these are emojis we verified exist as simple files
// Each NPC gets a unique emoji from this list
// Removed emojis that only exist as sequences (1F642-1F64E) - they don't exist as simple files
let npcEmojis = ['1F608', '1F609', '1F618', '1F619', '1F620', '1F621', '1F622', '1F623', '1F624', '1F625', '1F626', '1F627', '1F62A', '1F62B', '1F62C', '1F62D', '1F62E', '1F62F', '1F630', '1F631', '1F632', '1F633', '1F634', '1F635', '1F636', '1F637', '1F63A', '1F63B', '1F63C', '1F63D', '1F63E', '1F63F', '1F640', '1F641', '1F64F'];

// Pool of 100 jobs (excluding "lawyer" which is special)
// Each NPC will be assigned one of these jobs to help shape their dialogue
let npcJobs = [
    'judge', 'clerk', 'bailiff', 'court reporter', 'paralegal', 'secretary', 'receptionist', 'legal assistant',
    'accountant', 'bookkeeper', 'auditor', 'tax preparer', 'financial advisor', 'jewish banker',
    'shopkeeper', 'cashier', 'store manager', 'sales associate', 'retail worker', 'merchant',
    'cook', 'waiter', 'bartender', 'chef', 'barista', 'server', 'restaurant manager',
    'teacher', 'principal', 'student', 'librarian', 'professor', 'tutor', 'expert', 'scientist',
    'nurse', 'doctor', 'dentist', 'pharmacist', 'veterinarian', 'therapist', 'surgeon',
    'mechanic', 'carpenter', 'plumber', 'electrician', 'contractor', 'handyman',
    'police officer', 'security guard', 'firefighter', 'detective', 'sheriff',
    'mail carrier', 'delivery driver', 'taxi driver', 'truck driver', 'bus driver',
    'architect', 'engineer', 'designer', 'artist', 'musician', 'writer', 'journalist',
    'farmer', 'rancher', 'fisherman', 'gardener', 'landscaper', 'crackpot',
    'real estate agent', 'insurance agent', 'banker', 'loan officer',
    'hairdresser', 'barber', 'cosmetologist', 'tailor', 'seamstress',
    'baker', 'butcher', 'grocer', 'florist', 'drug dealer', 'hitman',
    'construction worker', 'roofer', 'painter', 'welder', 'mason', 'sex worker',
    'janitor', 'custodian', 'cleaner', 'maintenance worker', 'street hooker',
    'office manager', 'administrative assistant', 'data entry clerk', 'file clerk',
    'photographer', 'videographer', 'filmmaker', 'graphic designer',
    'coach', 'trainer', 'athlete', 'soldier', 'homeless pederast',
    'social worker', 'counselor', 'psychologist', 'psychiatrist',
    'pilot', 'unemployed', 'concierge', 'pornographer', 'maid', 'groundskeeper'
];

// Load NPC sprite images
function LoadNPCSprites(callback)
{
    tileImage3 = new Image();
    tileImage4 = new Image();
    
    let loaded = 0;
    let total = 2;
    
    tileImage3.onload = () => {
        loaded++;
        npcSpritesLoaded++;
        if (loaded >= total && callback)
            callback();
    };
    tileImage3.onerror = () => {
        console.warn('Failed to load tiles3.png');
        loaded++;
        if (loaded >= total && callback)
            callback();
    };
    tileImage3.src = 'tiles3.png';
    
    tileImage4.onload = () => {
        loaded++;
        npcSpritesLoaded++;
        if (loaded >= total && callback)
            callback();
    };
    tileImage4.onerror = () => {
        console.warn('Failed to load tiles4.png');
        loaded++;
        if (loaded >= total && callback)
            callback();
    };
    tileImage4.src = 'tiles4.png';
    
    // Preload all NPC emojis in the background
    if (typeof preloadEmojis === 'function') {
        preloadEmojis(npcEmojis, () => {
            console.log('NPC emojis preloaded');
        });
    }
}

// Generate unique surnames for NPCs
function GenerateNPCSurnames()
{
    let surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Hill', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Phillips', 'Evans', 'Turner', 'Parker', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Wood', 'James', 'Bennett', 'Gray', 'Hughes', 'Price', 'Sanders', 'Myers', 'Long', 'Ross', 'Foster', 'Schmidt', 'Mueller', 'Weber', 'Fischer', 'Wagner', 'Becker', 'Schneider', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schroeder', 'Hoffman', 'Schaefer', 'Keller', 'Lange', 'Werner', 'Krause', 'Meier', 'Lehmann', 'Rossi', 'Romano', 'Ferrari', 'Esposito', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Costa', 'Fontana', 'Caruso', 'Mancini', 'Rizzo', 'Lombardi', 'Moretti', 'bin laden', 'dogface', 'the realest', 'big ounce', 'el wiz', 'fuquer', 'shekelstein', 'kycowitz', 'shit for brains', 'amanda', 'jason', 'josh', 'peter', 'paul', 'emily', 'epstein', 'cosby', 'slim fatty', 'g wigga', 'slim beans', 'slim phony', 'Garcia', 'Martinez', 'Rodriguez', 'Lopez', 'Gonzalez', 'Hernandez', 'Sanchez', 'Ramirez', 'Chotchy', 'Vag', 'Big Snot', 'The Judge is Gay', 'Babyshit Pancakes', 'Dumpster Girl', 'Fuckywucky', 'Jackfuck', 'Sickly Creep', 'Pedophile Bob', 'Steve the Nazi', 'Ol Reliable', 'Puppy', 'Mel Gibson', 'David Duke', '420 Hitler', 'Lil Stinker', 'Lil Shit', 'Lil Pups', 'Loser Greg', 'Foxy', 'Smutty Debra', 'Tony with the Lip', 'Papa Jumbo', 'Flores', 'Chopper'];
    
    // Shuffle and return
    for(let i = surnames.length - 1; i > 0; i--)
    {
        let j = RandInt(i + 1);
        let temp = surnames[i];
        surnames[i] = surnames[j];
        surnames[j] = temp;
    }
    
    return surnames;
}

// NPC class
class NPC extends MyGameObject
{
    constructor(pos, surname, characteristic, emoji, spriteIndex, houseAddress, workAddress, job)
    {
        super(pos, 0, 0, 0.5, 0.4, 1); // Same size as player
        this.surname = surname;
        this.characteristic = characteristic;
        this.emoji = emoji;
        this.spriteIndex = spriteIndex; // 0-indexed across tiles3.png and tiles4.png (0-15 for 8 sprites each)
        this.houseAddress = houseAddress;
        this.workAddress = workAddress;
        this.job = job; // NPC's profession (e.g., 'lawyer', 'judge', 'clerk', 'shopkeeper')
        this.isNPC = 1;
        this.canSellDocuments = false; // Set during generation - ~50% of NPCs can sell documents
        
        // Movement properties
        this.moveSpeed = RandBetween(0.02, 0.05); // Very slow, graceful movement
        this.targetPos = null;
        this.currentState = 'atHouse'; // 'atHouse', 'exitingHouse', 'travelingToWork', 'enteringWork', 'atWork', 'exitingWork', 'travelingToHouse', 'enteringHouse'
        this.isIndoors = true; // Start indoors
        this.exitTargetPos = null; // Target position when exiting interior
        
        // Schedule timers (in game hours)
        this.departureTime = 0; // When to leave house for work
        this.returnTime = 0; // When to leave work for house
        
        // Pathfinding
        this.pathfindingTimer = new Timer();
        this.pathfindingTimer.Set(0.1); // Update pathfinding every 0.1 seconds
        this.targetBuilding = null; // Building we're trying to reach (house or work)
        this.failedDirections = []; // Track recently failed directions to avoid loops
        
        // A* pathfinding
        this.currentPath = null; // Array of waypoints from A* pathfinding
        this.currentPathIndex = 0; // Current waypoint index in path
        this.pathUpdateTimer = new Timer();
        this.pathUpdateTimer.Set(2.0); // Recalculate path every 2 seconds (or when target changes)
        
        // Stuck detection
        this.lastPosition = this.pos.Clone();
        this.stuckTimer = new Timer();
        this.stuckTimer.Set(0); // Start checking immediately
        this.stuckThreshold = 0.15; // Consider stuck if moved less than this
        this.stuckTime = 0.8; // Reduced from 2.0 - faster stuck detection
        this.detourAngle = 0; // Current detour angle when stuck
        
        // Interior tracking
        this.currentInterior = null; // Which interior the NPC is in (null if exterior)
        this.exteriorPos = null; // Position when outside
        
        // Animation
        this.idleTimer = new Timer();
        this.idleTimer.Set();
        this.movementTimer = new Timer();
        this.movementTimer.Set();
    }
    
    // Get the sprite image (tiles3.png or tiles4.png) and calculate tile position
    // Each NPC has 8 sprites, linear 0-indexed across both tilesets
    // NPC 0: sprites 0-7, NPC 1: sprites 8-15, etc.
    // Layout per NPC: [down0, down1, left0, left1, right0, right1, up0, up1]
    // Tilesets are 8 tiles wide × 6 tiles high = 48 sprites each
    // Animation matches player: left uses right sprites (mirrored), up uses down sprites (mirrored)
    GetSpriteInfo()
    {
        // Check if idle (not moving for > 1 second)
        let isIdle = this.idleTimer.Get() > 1;
        let walkFrame = Math.floor(this.walkFrame) % 2;
        let spriteOffset = 0;
        let needsMirror = false;
        
        // rotation: 0=up, 1=right, 2=down, 3=left
        if (this.rotation & 1)
        {
            // Left or right - use right sprites (4-5), mirror for left
            // Right (rotation=1): use sprites 4-5, no mirror
            // Left (rotation=3): use sprites 4-5, with mirror
            spriteOffset = 4 + walkFrame;
            needsMirror = (this.rotation == 3); // Mirror for left
            
            // Idle animation when facing right (matching player behavior)
            if (isIdle && this.rotation == 1)
            {
                // Use alternating mirror for idle animation (like player's tileX=7 behavior)
                needsMirror = (Math.floor(this.idleTimer.Get() / 2) % 2) == 1;
            }
        }
        else
        {
            // Up or down
            // Down (rotation=2): use sprites 0-1, no mirror
            // Up (rotation=0): use 4th and 7th sprites (indices 3 and 6), no mirror
            if (this.rotation == 2) // down
            {
                spriteOffset = 0 + walkFrame;
                needsMirror = false;
            }
            else // up (rotation == 0)
            {
                // Use 4th sprite (index 3) and 7th sprite (index 6) for north-facing
                spriteOffset = walkFrame == 0 ? 3 : 6;
                needsMirror = false;
            }
        }
        
        // Calculate absolute sprite index across both tilesets
        // NPC spriteIndex is 0-24, each NPC has 8 sprites
        let absoluteSpriteIndex = this.spriteIndex * 8 + spriteOffset;
        
        // Tilesets are 8×6 = 48 sprites each
        let spritesPerTileset = 48; // 8 columns × 6 rows
        let tilesetIndex = Math.floor(absoluteSpriteIndex / spritesPerTileset);
        let spriteInTileset = absoluteSpriteIndex % spritesPerTileset;
        
        // Calculate tileX and tileY within tileset (8 sprites per row)
        let spritesPerRow = 8;
        let tileX = spriteInTileset % spritesPerRow;
        let tileY = Math.floor(spriteInTileset / spritesPerRow);
        
        // Map tileset index to image (0 = tiles3, 1 = tiles4, etc.)
        // For now, we only have tiles3 and tiles4, so wrap around if needed
        let imageIndex = tilesetIndex % 2;
        
        return {
            image: imageIndex === 0 ? tileImage3 : tileImage4,
            tileX: tileX,
            tileY: tileY,
            mirror: needsMirror,
            isIdle: isIdle
        };
    }
    
    // Randomize schedule for the day
    RandomizeSchedule()
    {
        // Departure time: random in first half of day (00:00 - 12:00)
        this.departureTime = RandBetween(0.0, 12.0);
        
        // Return time: random in second half of day (12:00 - 24:00)
        this.returnTime = RandBetween(12.0, 24.0);
    }
    
    // Update NPC state based on time
    UpdateSchedule(gameHour)
    {
        // Simple timing: departure is 00:00-12:00, return is 12:00-24:00
        // No day wrap needed since game hour is always 7.0-24.0+ (wraps at 24.0)
        
        // State transitions
        if (this.currentState === 'atHouse' && gameHour >= this.departureTime && gameHour < 12.0)
        {
            // Start exiting house
            this.currentState = 'exitingHouse';
            // Move towards exit point
            if (this.currentInterior && this.currentInterior.exitPoint)
            {
                this.exitTargetPos = this.currentInterior.exitPoint.Clone();
            }
        }
        else if (this.currentState === 'exitingHouse')
        {
            // Move to exit point
            if (this.currentInterior && this.currentInterior.exitPoint)
            {
                let distToExit = this.pos.Distance(this.currentInterior.exitPoint);
                if (distToExit < 0.3)
                {
                    // Reached exit, now exit interior
                    this.ExitInterior();
                    this.currentState = 'travelingToWork';
                    this.isIndoors = false;
                    // Set target to work building
                    let workBuilding = this.FindBuildingByAddress(this.workAddress);
                    if (workBuilding)
                    {
                        let preferredOffset = new Vector2(0, workBuilding.size.y + 0.3);
                        this.targetPos = FindValidPositionNearBuilding(workBuilding, preferredOffset, this.collisionSize);
                    }
                }
            }
            else
            {
                // No exit point found, just exit immediately
                this.ExitInterior();
                this.currentState = 'travelingToWork';
                this.isIndoors = false;
                let workBuilding = this.FindBuildingByAddress(this.workAddress);
                if (workBuilding)
                {
                    let preferredOffset = new Vector2(0, workBuilding.size.y + 0.3);
                    this.targetPos = FindValidPositionNearBuilding(workBuilding, preferredOffset, this.collisionSize);
                }
            }
        }
        else if (this.currentState === 'travelingToWork')
        {
            let workBuilding = this.FindBuildingByAddress(this.workAddress);
            if (workBuilding && this.pos.Distance(workBuilding.pos) < workBuilding.size.y + 1.0)
            {
                // Close enough to building - enter interior
                if (!this.currentInterior)
                {
                    this.currentState = 'enteringWork';
                    // Position at door, then enter
                    this.EnterWorkInterior();
                    this.currentState = 'atWork';
                    this.isIndoors = true;
                }
            }
        }
        else if (this.currentState === 'atWork' && gameHour >= this.returnTime)
        {
            // Start exiting work
            this.currentState = 'exitingWork';
            // Move towards exit point
            if (this.currentInterior && this.currentInterior.exitPoint)
            {
                this.exitTargetPos = this.currentInterior.exitPoint.Clone();
            }
        }
        else if (this.currentState === 'exitingWork')
        {
            // Move to exit point
            if (this.currentInterior && this.currentInterior.exitPoint)
            {
                let distToExit = this.pos.Distance(this.currentInterior.exitPoint);
                if (distToExit < 0.3)
                {
                    // Reached exit, now exit interior
                    this.ExitInterior();
                    this.currentState = 'travelingToHouse';
                    this.isIndoors = false;
                    // Set target to house building
                    let houseBuilding = this.FindBuildingByAddress(this.houseAddress);
                    if (houseBuilding)
                    {
                        let preferredOffset = new Vector2(0, houseBuilding.size.y + 0.3);
                        this.targetPos = FindValidPositionNearBuilding(houseBuilding, preferredOffset, this.collisionSize);
                    }
                }
            }
            else
            {
                // No exit point found, just exit immediately
                this.ExitInterior();
                this.currentState = 'travelingToHouse';
                this.isIndoors = false;
                let houseBuilding = this.FindBuildingByAddress(this.houseAddress);
                if (houseBuilding)
                {
                    let preferredOffset = new Vector2(0, houseBuilding.size.y + 0.3);
                    this.targetPos = FindValidPositionNearBuilding(houseBuilding, preferredOffset, this.collisionSize);
                }
            }
        }
        else if (this.currentState === 'travelingToHouse')
        {
            let houseBuilding = this.FindBuildingByAddress(this.houseAddress);
            if (houseBuilding && this.pos.Distance(houseBuilding.pos) < houseBuilding.size.y + 1.0)
            {
                // Close enough to building - enter interior
                if (!this.currentInterior)
                {
                    this.currentState = 'enteringHouse';
                    // Position at door, then enter
                    this.EnterHouseInterior();
                    this.currentState = 'atHouse';
                    this.isIndoors = true;
                }
            }
        }
    }
    
    // Find building by address
    FindBuildingByAddress(address)
    {
        for(let obj of gameObjects)
        {
            if (obj.isBuilding && obj.address === address)
                return obj;
        }
        return null;
    }
    
    // Enter house interior
    EnterHouseInterior()
    {
        let houseBuilding = this.FindBuildingByAddress(this.houseAddress);
        if (!houseBuilding || !houseBuilding.interior)
        {
            // Interior should have been pre-generated, but if not, skip
            console.warn(`NPC ${this.surname}: House interior not found for address ${this.houseAddress}`);
            return;
        }
        
        this.currentInterior = houseBuilding.interior;
        
        // Find a random position inside the interior (avoid furniture)
        let spawnPos = this.FindValidInteriorPosition(houseBuilding.interior);
        if (spawnPos)
        {
            this.pos.Copy(spawnPos);
        }
        else
        {
            // Fallback: center of interior
            this.pos.Set(houseBuilding.interior.size / 2, houseBuilding.interior.size / 2);
        }
        
        this.velocity.Set(0, 0);
    }
    
    // Enter work interior
    EnterWorkInterior()
    {
        let workBuilding = this.FindBuildingByAddress(this.workAddress);
        if (!workBuilding || !workBuilding.interior)
        {
            // Interior should have been pre-generated, but if not, skip
            console.warn(`NPC ${this.surname}: Work interior not found for address ${this.workAddress}`);
            return;
        }
        
        this.currentInterior = workBuilding.interior;
        
        // Find a random position inside the interior (avoid furniture)
        let spawnPos = this.FindValidInteriorPosition(workBuilding.interior);
        if (spawnPos)
        {
            this.pos.Copy(spawnPos);
        }
        else
        {
            // Fallback: center of interior
            this.pos.Set(workBuilding.interior.size / 2, workBuilding.interior.size / 2);
        }
        
        this.velocity.Set(0, 0);
    }
    
    // Exit interior (go to exterior)
    ExitInterior()
    {
        if (!this.currentInterior)
            return;
        
        // Find the building that owns this interior
        let building = null;
        for(let obj of gameObjects)
        {
            if (obj.isBuilding && obj.interior === this.currentInterior)
            {
                building = obj;
                break;
            }
        }
        
        if (building)
        {
            // Position NPC outside building (south of building, at door)
            // Use helper function to find valid position that avoids buildings and impassable terrain
            let preferredOffset = new Vector2(0, building.size.y + 0.3); // South of building, at door
            this.exteriorPos = FindValidPositionNearBuilding(building, preferredOffset, 0.5);
            this.pos.Copy(this.exteriorPos);
        }
        else
        {
            // Fallback: if building not found, try to find any valid position
            // This shouldn't happen, but handle gracefully
            console.warn(`NPC ${this.surname}: Building not found when exiting interior`);
            this.exteriorPos = new Vector2(32, 32); // Center of map as fallback
            this.pos.Copy(this.exteriorPos);
        }
        
        this.currentInterior = null;
    }
    
    // Find valid position in interior (avoiding furniture)
    FindValidInteriorPosition(interior)
    {
        let attempts = 0;
        const maxAttempts = 50;
        
        while (attempts < maxAttempts)
        {
            // Random position in interior (avoid edges)
            let x = RandBetween(1.5, interior.size - 1.5);
            let y = RandBetween(1.5, interior.size - 1.5);
            let testPos = new Vector2(x, y);
            
            // Check if position is clear (not colliding with furniture)
            let clear = true;
            for(let obj of gameObjects)
            {
                if (obj.isFurniture && testPos.Distance(obj.pos) < 1.0)
                {
                    clear = false;
                    break;
                }
                // Also check other NPCs
                if (obj.isNPC && obj !== this && obj.currentInterior === interior && testPos.Distance(obj.pos) < 0.8)
                {
                    clear = false;
                    break;
                }
            }
            
            if (clear)
                return testPos;
            
            attempts++;
        }
        
        return null; // Couldn't find valid position
    }
    
    // Check if a position is clear of obstacles (buildings, rocks, solid terrain)
    // allowedBuilding: building we're allowed to approach (target building)
    // isVeryClose: if true, we're very close to target building and should allow entrance approach
    IsPositionClear(pos, checkDistance = 0.5, allowedBuilding = null, isVeryClose = false)
    {
        // Check level collision
        if (!level.IsAreaClear(pos, this.collisionSize, this))
            return false;
        
        // Check for rocks and other solid objects
        let data = level.GetDataFromPos(pos);
        if (data.IsSolid())
            return false;
        
        // Check distance to buildings
        for(let obj of gameObjects)
        {
            if (obj.isBuilding && obj !== this)
            {
                // If this is our target building and we're very close, skip collision check entirely
                // This allows smooth approach to entrance without stuttering
                if (obj === allowedBuilding && isVeryClose)
                {
                    // Check if we're near the entrance area (wider detection)
                    let southEdge = obj.pos.y + obj.size.y;
                    let isNearSouthEntrance = (pos.y >= southEdge - 1.0 && pos.y <= southEdge + 1.5) &&
                                             (Math.abs(pos.x - obj.pos.x) < obj.size.x + 1.0);
                    
                    // If near entrance, allow it (no collision check for target building)
                    if (isNearSouthEntrance)
                    {
                        continue; // Skip collision check for target building entrance
                    }
                    // If not near entrance but very close, still allow (we're approaching)
                    continue;
                }
                
                let distToBuilding = pos.Distance(obj.pos);
                let buildingSolidRadius = obj.size.x * 0.9; // Building solid area
                let minDistance = buildingSolidRadius + this.collisionSize + 0.2;
                
                // If this is our target building, allow approaching the entrance area
                if (obj === allowedBuilding)
                {
                    // Allow getting close to south entrance (south side of building)
                    // Wider entrance detection area to prevent stuttering
                    let southEdge = obj.pos.y + obj.size.y;
                    let isNearSouthEntrance = (pos.y >= southEdge - 1.0 && pos.y <= southEdge + 1.5) &&
                                             (Math.abs(pos.x - obj.pos.x) < obj.size.x + 1.0);
                    
                    // If near entrance, allow closer approach
                    if (isNearSouthEntrance)
                    {
                        minDistance = buildingSolidRadius * 0.2; // Allow very close to entrance
                    }
                    else
                    {
                        // Still avoid other sides of target building, but less strictly
                        minDistance = buildingSolidRadius * 0.7;
                    }
                }
                
                if (distToBuilding < minDistance)
                {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    // Check if path ahead is clear (multi-step checking)
    // Increased lookahead for better obstacle detection
    IsPathClear(direction, lookAheadDistance = 3.0, allowedBuilding = null, isVeryClose = false)
    {
        let normalizedDir = direction.Clone().Normalize();
        
        // When very close to target building, use shorter lookahead to prevent stuttering
        let effectiveLookahead = isVeryClose ? 1.0 : Math.min(lookAheadDistance, 3.0);
        
        // Check multiple points along the path for better obstacle detection
        // Increased check distances: 0.5, 1.0, 1.5, 2.0, 2.5, 3.0 (or up to lookAheadDistance)
        let checkDistances = [];
        for(let d = 0.5; d <= effectiveLookahead; d += 0.5)
        {
            checkDistances.push(d);
        }
        
        for(let dist of checkDistances)
        {
            let checkPos = this.pos.Clone();
            checkPos.Add(normalizedDir.Clone().Multiply(dist));
            if (!this.IsPositionClear(checkPos, 0.5, allowedBuilding, isVeryClose))
            {
                return false; // Path blocked at this distance
            }
        }
        
        return true; // All check points are clear
    }
    
    // Find alternative direction when blocked (wider obstacle detection)
    // Expanded search arc and path memory to avoid loops
    FindAlternativeDirection(targetDir, blockedDir, allowedBuilding = null, isVeryClose = false)
    {
        // Wider arc search: check ±90 degrees around target direction (expanded from ±45)
        const searchArc = PI / 2; // 90 degrees
        const angleStep = PI / 18; // 10 degree increments (finer resolution)
        
        // Score each direction by how clear the path is and how close to target
        let bestDir = null;
        let bestScore = -1;
        
        // Check a wide arc around the target direction
        for(let angle = -searchArc; angle <= searchArc; angle += angleStep)
        {
            let testDir = targetDir.Clone().Rotate(angle);
            
            // Skip directions we recently failed with (path memory)
            let angleKey = Math.round(angle * 100) / 100; // Round to avoid floating point issues
            if (this.failedDirections.some(fd => Math.abs(fd - angleKey) < 0.1))
                continue;
            
            // Check if this direction has a clear path
            if (this.IsPathClear(testDir, 3.0, allowedBuilding, isVeryClose))
            {
                // Score: prefer directions closer to target (smaller angle)
                // Also prefer directions that have longer clear paths
                let angleScore = 1.0 - (Math.abs(angle) / searchArc); // 1.0 at center, 0.0 at edges
                let clearDistance = this.GetClearPathDistance(testDir, allowedBuilding, isVeryClose);
                let pathScore = Math.min(clearDistance / 3.0, 1.0); // Normalize to 0-1
                
                // Combined score: 60% angle preference, 40% path length
                let totalScore = angleScore * 0.6 + pathScore * 0.4;
                
                if (totalScore > bestScore)
                {
                    bestScore = totalScore;
                    bestDir = testDir;
                }
            }
        }
        
        if (bestDir)
        {
            // Blend with target direction for smoother movement
            let blended = targetDir.Clone().Multiply(0.3).Add(bestDir.Clone().Multiply(0.7));
            return blended.Normalize();
        }
        
        // Fallback: Try perpendicular directions (left and right)
        let perp1 = new Vector2(-blockedDir.y, blockedDir.x); // 90 degrees left
        let perp2 = new Vector2(blockedDir.y, -blockedDir.x); // 90 degrees right
        
        if (this.IsPathClear(perp1, 3.0, allowedBuilding, isVeryClose))
        {
            let blended = targetDir.Clone().Multiply(0.3).Add(perp1.Clone().Multiply(0.7));
            return blended.Normalize();
        }
        
        if (this.IsPathClear(perp2, 3.0, allowedBuilding, isVeryClose))
        {
            let blended = targetDir.Clone().Multiply(0.3).Add(perp2.Clone().Multiply(0.7));
            return blended.Normalize();
        }
        
        // Try opposite direction (back away)
        let opposite = blockedDir.Clone().Multiply(-1);
        if (this.IsPathClear(opposite, 3.0, allowedBuilding, isVeryClose))
        {
            return opposite.Normalize();
        }
        
        // Last resort: try random direction (but not one we recently failed with)
        let attempts = 0;
        while (attempts < 10)
        {
            let randomDir = RandVector(1).Normalize();
            let randomAngle = Math.atan2(randomDir.y, randomDir.x) - Math.atan2(targetDir.y, targetDir.x);
            let angleKey = Math.round(randomAngle * 100) / 100;
            
            if (!this.failedDirections.some(fd => Math.abs(fd - angleKey) < 0.1))
            {
                if (this.IsPathClear(randomDir, 2.0, allowedBuilding, isVeryClose))
                    return randomDir;
            }
            attempts++;
        }
        
        // Ultimate fallback
        return RandVector(1).Normalize();
    }
    
    // Get the distance we can travel in a direction before hitting an obstacle
    GetClearPathDistance(direction, allowedBuilding = null, isVeryClose = false)
    {
        let normalizedDir = direction.Clone().Normalize();
        let maxCheck = isVeryClose ? 2.0 : 4.0; // Shorter check when very close
        let step = 0.3; // Check every 0.3 units
        
        for(let dist = step; dist <= maxCheck; dist += step)
        {
            let checkPos = this.pos.Clone();
            checkPos.Add(normalizedDir.Clone().Multiply(dist));
            if (!this.IsPositionClear(checkPos, 0.5, allowedBuilding, isVeryClose))
            {
                return dist - step; // Return last clear distance
            }
        }
        
        return maxCheck; // Path is clear for max distance
    }
    
    // Improved pathfinding using A* pathfinding with global map knowledge
    UpdatePathfinding()
    {
        if (!this.targetPos)
        {
            this.currentPath = null;
            this.currentPathIndex = 0;
            return;
        }
        
        // Update targetBuilding based on current state
        if (this.currentState === 'travelingToWork')
        {
            this.targetBuilding = this.FindBuildingByAddress(this.workAddress);
        }
        else if (this.currentState === 'travelingToHouse')
        {
            this.targetBuilding = this.FindBuildingByAddress(this.houseAddress);
        }
        else
        {
            this.targetBuilding = null; // Not traveling to a building
        }
        
        // Recalculate path if needed (target changed, timer elapsed, or no path)
        let needsNewPath = false;
        if (!this.currentPath || this.currentPath.length === 0)
        {
            needsNewPath = true;
        }
        else if (this.pathUpdateTimer.Elapsed())
        {
            // Periodically recalculate to handle dynamic obstacles
            needsNewPath = true;
            this.pathUpdateTimer.Set(2.0);
        }
        
        // Calculate new path if needed
        if (needsNewPath && navigationGrid)
        {
            this.currentPath = FindPathAStar(this.pos, this.targetPos);
            this.currentPathIndex = 0;
            
            if (!this.currentPath || this.currentPath.length === 0)
            {
                // No path found - fall back to direct movement
                this.currentPath = null;
            }
        }
        
        // If we have a path, follow it
        if (this.currentPath && this.currentPath.length > 0)
        {
            // Get current waypoint
            if (this.currentPathIndex >= this.currentPath.length)
            {
                this.currentPathIndex = this.currentPath.length - 1;
            }
            
            let waypoint = this.currentPath[this.currentPathIndex];
            let toWaypoint = waypoint.Clone().Subtract(this.pos);
            let distanceToWaypoint = toWaypoint.Length();
            
            // If we reached this waypoint, move to next
            if (distanceToWaypoint < 0.5)
            {
                this.currentPathIndex++;
                
                // If we reached the end of the path, check if we're close enough to target
                if (this.currentPathIndex >= this.currentPath.length)
                {
                    let distanceToTarget = this.pos.Distance(this.targetPos);
                    let arrivalDistance = 0.3;
                    if (this.targetBuilding)
                    {
                        arrivalDistance = this.targetBuilding.size.y + 1.0;
                    }
                    
                    if (distanceToTarget < arrivalDistance)
                    {
                        // Reached target
                        this.velocity.Set(0, 0);
                        this.targetPos = null;
                        this.currentPath = null;
                        this.currentPathIndex = 0;
                        return;
                    }
                    else
                    {
                        // Not close enough, recalculate path
                        this.currentPath = FindPathAStar(this.pos, this.targetPos);
                        this.currentPathIndex = 0;
                        if (!this.currentPath || this.currentPath.length === 0)
                        {
                            this.currentPath = null;
                        }
                    }
                }
                
                // Get next waypoint
                if (this.currentPath && this.currentPathIndex < this.currentPath.length)
                {
                    waypoint = this.currentPath[this.currentPathIndex];
                    toWaypoint = waypoint.Clone().Subtract(this.pos);
                }
            }
            
            // Move towards current waypoint
            if (toWaypoint)
            {
                let targetDir = toWaypoint.Normalize();
                this.velocity.Copy(targetDir).Multiply(this.moveSpeed);
                
                // Update rotation based on velocity
                if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y))
                {
                    this.rotation = this.velocity.x > 0 ? 1 : 3; // right or left
                }
                else
                {
                    this.rotation = this.velocity.y > 0 ? 2 : 0; // down or up
                }
            }
        }
        else
        {
            // No path available - fall back to direct movement (old behavior)
            let toTarget = this.targetPos.Clone().Subtract(this.pos);
            let distance = toTarget.Length();
            
            // Check if we're very close to target building (within entry range)
            let isVeryClose = false;
            if (this.targetBuilding)
            {
                let distToBuilding = this.pos.Distance(this.targetBuilding.pos);
                isVeryClose = (distToBuilding < this.targetBuilding.size.y + 1.5);
            }
            
            // If close to target building, match arrival distance to building entry trigger
            let arrivalDistance = 0.3;
            if (this.targetBuilding && isVeryClose)
            {
                arrivalDistance = this.targetBuilding.size.y + 1.0;
            }
            
            if (distance < arrivalDistance)
            {
                // Close enough, stop
                this.velocity.Set(0, 0);
                this.targetPos = null;
                this.currentPath = null;
                this.currentPathIndex = 0;
                return;
            }
            
            // Direct movement towards target
            let targetDir = toTarget.Normalize();
            this.velocity.Copy(targetDir).Multiply(this.moveSpeed);
            
            // Update rotation based on velocity
            if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y))
            {
                this.rotation = this.velocity.x > 0 ? 1 : 3; // right or left
            }
            else
            {
                this.rotation = this.velocity.y > 0 ? 2 : 0; // down or up
            }
        }
    }
    
    // Simple collision avoidance with other NPCs
    AvoidOtherNPCs()
    {
        // Only avoid when actually moving (prevent vibration when stationary)
        if (this.velocity.Length() < 0.01)
            return;
        
        let avoidanceRadius = 0.8;
        let avoidanceForce = 0.1; // Reduced to prevent oscillation
        
        for(let obj of gameObjects)
        {
            if (obj.isNPC && obj !== this && !obj.isIndoors && !this.isIndoors)
            {
                let dist = this.pos.Distance(obj.pos);
                if (dist < avoidanceRadius && dist > 0.01) // Avoid division by zero
                {
                    let away = this.pos.Clone().Subtract(obj.pos);
                    away.Normalize();
                    away.Multiply(avoidanceForce / dist); // Stronger when closer
                    this.velocity.Add(away);
                }
            }
        }
        
        // Also avoid player if close (only when player is outdoors)
        if (player && !this.isIndoors && !currentInterior)
        {
            let dist = this.pos.Distance(player.pos);
            if (dist < avoidanceRadius && dist > 0.01)
            {
                let away = this.pos.Clone().Subtract(player.pos);
                away.Normalize();
                away.Multiply(avoidanceForce / dist);
                this.velocity.Add(away);
            }
        }
    }
    
    Update()
    {
        // Update schedule if we have game time
        if (gameTime)
        {
            this.UpdateSchedule(gameTime.GetHour());
        }
        
        // Handle different states
        if (this.currentState === 'exitingHouse' || this.currentState === 'exitingWork')
        {
            // Moving to exit point inside interior
            if (this.exitTargetPos)
            {
                let toExit = this.exitTargetPos.Clone().Subtract(this.pos);
                let distance = toExit.Length();
                
                if (distance < 0.3)
                {
                    // Close enough, stop (state transition handled in UpdateSchedule)
                    this.velocity.Set(0, 0);
                }
                else
                {
                    // Move towards exit
                    toExit.Normalize();
                    this.velocity.Copy(toExit).Multiply(this.moveSpeed);
                    
                    // Update rotation based on velocity
                    if (Math.abs(this.velocity.x) > Math.abs(this.velocity.y))
                    {
                        this.rotation = this.velocity.x > 0 ? 1 : 3; // right or left
                    }
                    else
                    {
                        this.rotation = this.velocity.y > 0 ? 2 : 0; // down or up
                    }
                }
            }
        }
        else if (this.isIndoors && (this.currentState === 'atHouse' || this.currentState === 'atWork'))
        {
            // Standing still indoors
            this.velocity.Set(0, 0);
            // Update idle animation
            if (this.idleTimer.Elapsed())
            {
                this.idleTimer.Set(RandBetween(2, 5)); // Random idle time
            }
        }
        else
        {
            // Outdoors - update pathfinding
            if (this.pathfindingTimer.Elapsed())
            {
                this.pathfindingTimer.Set(0.1);
                
                // Set target based on state
                if (this.currentState === 'travelingToWork')
                {
                    let workBuilding = this.FindBuildingByAddress(this.workAddress);
                    if (workBuilding)
                    {
                        // Target is south of building (entrance) - use FindValidPositionNearBuilding to avoid impassible terrain
                        let preferredOffset = new Vector2(0, workBuilding.size.y + 0.3);
                        this.targetPos = FindValidPositionNearBuilding(workBuilding, preferredOffset, this.collisionSize);
                    }
                }
                else if (this.currentState === 'travelingToHouse')
                {
                    let houseBuilding = this.FindBuildingByAddress(this.houseAddress);
                    if (houseBuilding)
                    {
                        // Target is south of building (entrance) - use FindValidPositionNearBuilding to avoid impassible terrain
                        let preferredOffset = new Vector2(0, houseBuilding.size.y + 0.3);
                        this.targetPos = FindValidPositionNearBuilding(houseBuilding, preferredOffset, this.collisionSize);
                    }
                }
                
                this.UpdatePathfinding();
            }
            
            // Collision avoidance (only when outdoors)
            if (!this.isIndoors)
            {
                this.AvoidOtherNPCs();
            }
            
            // Limit velocity magnitude
            let speed = this.velocity.Length();
            if (speed > this.moveSpeed)
            {
                this.velocity.Normalize().Multiply(this.moveSpeed);
            }
        }
        
        // Update walk animation and idle timer
        if (this.velocity.Length() > 0.01)
        {
            // Moving - update walk frame and reset idle timer
            this.walkFrame += 1.5 * this.velocity.Length();
            this.movementTimer.Set();
            this.idleTimer.Set();
        }
        else
        {
            // Not moving - update idle timer
            if (this.movementTimer.Elapsed())
            {
                // Reset walk frame when idle for > 1 second (matching player behavior)
                if (this.idleTimer.Get() > 1)
                {
                    this.walkFrame = 0;
                }
            }
        }
        
        super.Update();
    }
    
    Render()
    {
        // Don't render if in different interior than player
        if (this.currentInterior && this.currentInterior !== currentInterior)
            return;
        
        // Don't render if NPC is indoors but player is outdoors
        if (this.isIndoors && !currentInterior)
            return;
        
        // Don't render if NPC is outdoors but player is indoors
        if (!this.isIndoors && currentInterior)
            return;
        
        // Get sprite info
        let spriteInfo = this.GetSpriteInfo();
        
        // Custom rendering for NPC sprites
        if (spriteInfo.image && spriteInfo.image.complete)
        {
            mainCanvasContext.save();
            let drawPos = this.pos.Clone();
            drawPos.y -= this.height;
            drawPos.Subtract(cameraPos).Multiply(tileSize*cameraScale);
            drawPos.Add(mainCanvasSize.Clone(.5));
            mainCanvasContext.translate(drawPos.x|0, drawPos.y|0);
            
            let s = this.size.Clone(tileSize * cameraScale);
            
            // Apply mirror if needed (matching player behavior)
            if (spriteInfo.mirror)
            {
                mainCanvasContext.scale(-1, 1);
            }
            
            // Draw sprite from tileset
            mainCanvasContext.drawImage(
                spriteInfo.image,
                spriteInfo.tileX * tileSize, spriteInfo.tileY * tileSize,
                tileSize, tileSize,
                -s.x, -s.y,
                s.x * 2, s.y * 2
            );
            
            mainCanvasContext.restore();
            
            // Draw emoji above NPC (only in main render pass, not shadow)
            if (!shadowRenderPass && !hitRenderPass)
            {
                try
                {
                    let emojiPos = this.pos.Clone();
                    emojiPos.y -= this.height + 0.4; // Above NPC
                    emojiPos.Subtract(cameraPos).Multiply(tileSize*cameraScale);
                    emojiPos.Add(mainCanvasSize.Clone(.5));
                    
                    // Use dedicated emoji renderer for proper emoji display
                    DrawEmoji(this.emoji, emojiPos.x|0, (emojiPos.y|0) + 2, 12 * cameraScale, 'center');
                    
                    // Display NPC name when player is within 1 tile
                    if (player && player.pos)
                    {
                        let distance = this.pos.Distance(player.pos);
                        if (distance <= 1.0) // Within 1 tile
                        {
                            let namePos = this.pos.Clone();
                            namePos.y -= this.height + 0.9; // Above emoji
                            namePos.Subtract(cameraPos).Multiply(tileSize*cameraScale);
                            namePos.Add(mainCanvasSize.Clone(.5));
                            
                            // Draw NPC surname above emoji
                            DrawText(this.surname, namePos.x|0, namePos.y|0, 8 * cameraScale, 'center', 1, '#FFF', '#000');
                        }
                    }
                }
                catch(e)
                {
                    // If DrawEmoji fails, just continue (emoji won't show but game won't crash)
                    console.warn('Failed to draw NPC emoji:', e);
                }
            }
        }
        else
        {
            // Fallback: use default rendering with placeholder
            this.tileX = 0;
            this.tileY = 4; // Use player sprite row as placeholder
            super.Render();
        }
    }
}

// Generate all NPCs
function GenerateNPCs()
{
    // Clear existing NPCs
    allNPCs = [];
    
    // Generate surnames
    npcSurnames = GenerateNPCSurnames();
    
    // Get all buildings
    let buildings = [];
    for(let obj of gameObjects)
    {
        if (obj.isBuilding)
            buildings.push(obj);
    }
    
    // Separate houses and work buildings
    let houses = buildings.filter(b => b.buildingType === 'house' || b.buildingType === 'home');
    let workBuildings = buildings.filter(b => b.buildingType === 'court' || b.buildingType === 'firm' || b.buildingType === 'shop' || b.buildingType === 'store');
    
    // Find courthouse (gets 5 NPCs)
    let courthouse = workBuildings.find(b => b.buildingType === 'court');
    let otherWorkBuildings = workBuildings.filter(b => b.buildingType !== 'court');
    
    // Shuffle characteristics
    let shuffledCharacteristics = npcCharacteristics.slice();
    for(let i = shuffledCharacteristics.length - 1; i > 0; i--)
    {
        let j = RandInt(i + 1);
        let temp = shuffledCharacteristics[i];
        shuffledCharacteristics[i] = shuffledCharacteristics[j];
        shuffledCharacteristics[j] = temp;
    }
    
    // Create a pool of available emojis and track used ones
    let availableEmojis = npcEmojis.slice();
    let usedEmojis = [];
    
    // Assign work addresses
    let workAssignments = [];
    
    // Courthouse gets 5
    if (courthouse)
    {
        for(let i = 0; i < 5; i++)
            workAssignments.push(courthouse.address);
    }
    
    // Remaining 20 assigned randomly to other work buildings
    for(let i = 0; i < 20; i++)
    {
        if (otherWorkBuildings.length > 0)
        {
            let randomWork = otherWorkBuildings[RandInt(otherWorkBuildings.length)];
            workAssignments.push(randomWork.address);
        }
    }
    
    // Shuffle work assignments
    for(let i = workAssignments.length - 1; i > 0; i--)
    {
        let j = RandInt(i + 1);
        let temp = workAssignments[i];
        workAssignments[i] = workAssignments[j];
        workAssignments[j] = temp;
    }
    
    // Assign jobs to NPCs
    // First, identify which NPCs work at courthouse
    let courthouseAddress = courthouse ? courthouse.address : null;
    let courthouseNPCIndices = [];
    let otherNPCIndices = [];
    
    for(let i = 0; i < 25; i++)
    {
        if (courthouseAddress && workAssignments[i] === courthouseAddress)
        {
            courthouseNPCIndices.push(i);
        }
        else
        {
            otherNPCIndices.push(i);
        }
    }
    
    // Create job assignments array
    let jobAssignments = [];
    
    // All courthouse NPCs are lawyers
    if (courthouseNPCIndices.length > 0)
    {
        // Assign 'lawyer' to all courthouse NPCs
        for(let i = 0; i < courthouseNPCIndices.length; i++)
        {
            let npcIndex = courthouseNPCIndices[i];
            jobAssignments[npcIndex] = 'lawyer';
        }
    }
    
    // Assign jobs to non-courthouse NPCs
    for(let i = 0; i < otherNPCIndices.length; i++)
    {
        let npcIndex = otherNPCIndices[i];
        jobAssignments[npcIndex] = npcJobs[RandInt(npcJobs.length)];
    }
    
    // Distribute NPCs evenly among houses
    let houseAssignments = [];
    for(let i = 0; i < 25; i++)
    {
        houseAssignments.push(houses[i % houses.length].address);
    }
    // Shuffle for randomness
    for(let i = houseAssignments.length - 1; i > 0; i--)
    {
        let j = RandInt(i + 1);
        let temp = houseAssignments[i];
        houseAssignments[i] = houseAssignments[j];
        houseAssignments[j] = temp;
    }
    
    // Create 25 NPCs
    for(let i = 0; i < 25; i++)
    {
        let surname = npcSurnames[i];
        let characteristic = shuffledCharacteristics[i];
        
        // Assign a unique random emoji to each NPC
        let emoji;
        if (availableEmojis.length > 0) {
            // Pick a random emoji from available pool
            let randomIndex = RandInt(availableEmojis.length);
            emoji = availableEmojis[randomIndex];
            // Remove it from available pool and add to used
            availableEmojis.splice(randomIndex, 1);
            usedEmojis.push(emoji);
        } else {
            // Fallback: if we run out of unique emojis, pick a random one from all (shouldn't happen with 25 NPCs)
            emoji = npcEmojis[RandInt(npcEmojis.length)];
        }
        
        let spriteIndex = i; // 0-24, each NPC gets 8 consecutive sprites
        let houseAddress = houseAssignments[i];
        let workAddress = workAssignments[i];
        let job = jobAssignments[i] || npcJobs[RandInt(npcJobs.length)]; // Fallback to random job if somehow not assigned
        
        // Create NPC (will spawn in house interior)
        let npc = new NPC(new Vector2(0, 0), surname, characteristic, emoji, spriteIndex, houseAddress, workAddress, job);
        
        // ~2/3 of NPCs can sell documents
        npc.canSellDocuments = (RandInt(3) < 2);
        
        // Randomize schedule
        npc.RandomizeSchedule();
        
        // Spawn in house interior (this will create the interior if it doesn't exist)
        npc.EnterHouseInterior();
        
        // Make sure NPC is added to gameObjects (should be automatic via GameObject constructor, but verify)
        if (gameObjects.indexOf(npc) === -1)
        {
            gameObjects.push(npc);
        }
        
        allNPCs.push(npc);
    }
    
    // Debug: Log all NPCs and their jobs (only once, final list)
    DebugLogAllNPCs();
    
    // Validate calendar events to remove any for NPCs that no longer exist
    if (typeof ValidateCalendarEvents !== 'undefined')
    {
        ValidateCalendarEvents();
    }
}

// Debug function to display all NPCs and their jobs in the console
function DebugLogAllNPCs()
{
    console.log(`NPC TOWN CENSUS - Total NPCs: ${allNPCs.length}`);
    console.log('');
    
    // Simple numbered list format
    for(let i = 0; i < allNPCs.length; i++)
    {
        let npc = allNPCs[i];
        let job = npc.job || 'unemployed';
        console.log(`${i + 1}. ${npc.surname}, ${job}, home: ${npc.houseAddress}, work: ${npc.workAddress}`);
    }
    
    console.log('');
}

// Reset all NPCs at start of day (called at 06:59)
function ResetNPCsForNewDay()
{
    for(let npc of allNPCs)
    {
        // Reset to house
        npc.currentState = 'atHouse';
        npc.isIndoors = true;
        
        // Randomize schedule for new day
        npc.RandomizeSchedule();
        
        // Return to house interior
        npc.EnterHouseInterior();
    }
}

// Clear all NPCs
function ClearNPCs()
{
    allNPCs = [];
    // Remove NPCs from gameObjects
    gameObjects = gameObjects.filter(obj => !obj.isNPC);
}

// Get nearest NPC within specified distance
// Returns NPC object or null if none found
function GetNearestNPC(position, maxDistance)
{
    if (!position || !allNPCs || allNPCs.length === 0)
        return null;
    
    let nearestNPC = null;
    let nearestDistance = maxDistance;
    
    for (let npc of allNPCs)
    {
        // Skip if NPC is dead or doesn't exist
        if (!npc || npc.IsDead())
            continue;
        
        // Check if NPC is in the same interior as player (or both outdoors)
        if (currentInterior)
        {
            // Player is indoors - NPC must be in same interior
            if (!npc.isIndoors || npc.currentInterior !== currentInterior)
                continue;
        }
        else
        {
            // Player is outdoors - NPC must be outdoors
            if (npc.isIndoors)
                continue;
        }
        
        let distance = position.Distance(npc.pos);
        if (distance < nearestDistance)
        {
            nearestDistance = distance;
            nearestNPC = npc;
        }
    }
    
    return nearestNPC;
}

// Get nearest judge within specified distance
// Returns judge object or null if none found
function GetNearestJudge(position, maxDistance)
{
    if (!position || !currentInterior || !currentInterior.judge)
        return null;
    
    let judge = currentInterior.judge;
    
    // Check if judge is in the same interior as player
    if (currentInterior)
    {
        // Player is indoors - judge must be in same interior
        if (!judge.isIndoors || judge.currentInterior !== currentInterior)
            return null;
    }
    else
    {
        // Player is outdoors - judge should not be accessible
        return null;
    }
    
    let distance = position.Distance(judge.pos);
    if (distance < maxDistance)
    {
        return judge;
    }
    
    return null;
}


