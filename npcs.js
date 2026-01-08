///////////////////////////////////////////////////////////////////////////////
// NPC System

// NPC sprite images (tiles3.png and tiles4.png)
let tileImage3 = null;
let tileImage4 = null;
let npcSpritesLoaded = 0;

// NPC management
let allNPCs = []; // All NPCs in the game
let npcSurnames = []; // Pool of unique surnames
let npcCharacteristics = ['rude', 'joyful', 'insane', 'flirtatious', 'grumpy', 'cheerful', 'mysterious', 'talkative', 'quiet', 'energetic', 'lazy', 'nervous', 'confident', 'shy', 'bold', 'cautious', 'friendly', 'hostile', 'curious', 'indifferent', 'optimistic', 'pessimistic', 'wise', 'foolish', 'brave'];
// Use emoji filenames directly (OpenMoji format) - these are emojis we verified exist as simple files
// Each NPC gets a unique emoji from this list
// Removed emojis that only exist as sequences (1F642-1F64E) - they don't exist as simple files
let npcEmojis = ['1F608', '1F609', '1F618', '1F619', '1F620', '1F621', '1F622', '1F623', '1F624', '1F625', '1F626', '1F627', '1F62A', '1F62B', '1F62C', '1F62D', '1F62E', '1F62F', '1F630', '1F631', '1F632', '1F633', '1F634', '1F635', '1F636', '1F637', '1F63A', '1F63B', '1F63C', '1F63D', '1F63E', '1F63F', '1F640', '1F641', '1F64F'];

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
    let surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Hill', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Phillips', 'Evans', 'Turner', 'Parker', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Cox', 'Ward', 'Richardson', 'Watson', 'Brooks', 'Wood', 'James', 'Bennett', 'Gray', 'Hughes', 'Price', 'Sanders', 'Myers', 'Long', 'Ross', 'Foster', 'Schmidt', 'Mueller', 'Weber', 'Fischer', 'Wagner', 'Becker', 'Schneider', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf', 'Schroeder', 'Hoffman', 'Schaefer', 'Keller', 'Lange', 'Werner', 'Krause', 'Meier', 'Lehmann', 'Rossi', 'Romano', 'Ferrari', 'Esposito', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Costa', 'Fontana', 'Caruso', 'Mancini', 'Rizzo', 'Lombardi', 'Moretti', 'bin laden', 'dogface', 'the realest', 'big ounce', 'el wiz', 'fuquer'];
    
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
    constructor(pos, surname, characteristic, emoji, spriteIndex, houseAddress, workAddress)
    {
        super(pos, 0, 0, 0.5, 0.4, 1); // Same size as player
        this.surname = surname;
        this.characteristic = characteristic;
        this.emoji = emoji;
        this.spriteIndex = spriteIndex; // 0-indexed across tiles3.png and tiles4.png (0-15 for 8 sprites each)
        this.houseAddress = houseAddress;
        this.workAddress = workAddress;
        this.isNPC = 1;
        
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
        
        // Stuck detection
        this.lastPosition = this.pos.Clone();
        this.stuckTimer = new Timer();
        this.stuckTimer.Set(0); // Start checking immediately
        this.stuckThreshold = 0.15; // Consider stuck if moved less than this in 2 seconds
        this.stuckTime = 2.0; // Time before considering stuck
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
                        this.targetPos = workBuilding.pos.Clone();
                        this.targetPos.y += workBuilding.size.y + 0.3;
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
                    this.targetPos = workBuilding.pos.Clone();
                    this.targetPos.y += workBuilding.size.y + 0.3;
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
                        this.targetPos = houseBuilding.pos.Clone();
                        this.targetPos.y += houseBuilding.size.y + 0.3;
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
                    this.targetPos = houseBuilding.pos.Clone();
                    this.targetPos.y += houseBuilding.size.y + 0.3;
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
    IsPositionClear(pos, checkDistance = 0.5)
    {
        // Check level collision
        if (!level.IsAreaClear(pos, this.collisionSize, this))
            return false;
        
        // Check for rocks and other solid objects
        let data = level.GetDataFromPos(pos);
        if (data.IsSolid())
            return false;
        
        // Check distance to buildings (avoid getting too close)
        for(let obj of gameObjects)
        {
            if (obj.isBuilding && obj !== this)
            {
                let distToBuilding = pos.Distance(obj.pos);
                let buildingSolidRadius = obj.size.x * 0.9; // Building solid area
                if (distToBuilding < buildingSolidRadius + this.collisionSize + 0.2)
                {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    // Check if path ahead is clear
    IsPathClear(direction, lookAheadDistance = 0.8)
    {
        let checkPos = this.pos.Clone();
        let normalizedDir = direction.Clone().Normalize();
        checkPos.Add(normalizedDir.Clone().Multiply(lookAheadDistance));
        return this.IsPositionClear(checkPos);
    }
    
    // Find alternative direction when blocked
    FindAlternativeDirection(targetDir, blockedDir)
    {
        // Try perpendicular directions first (left and right relative to target)
        let perp1 = new Vector2(-blockedDir.y, blockedDir.x); // 90 degrees left
        let perp2 = new Vector2(blockedDir.y, -blockedDir.x); // 90 degrees right
        
        // Try left perpendicular
        if (this.IsPathClear(perp1))
        {
            // Blend with target direction for smoother movement
            let blended = targetDir.Clone().Multiply(0.3).Add(perp1.Clone().Multiply(0.7));
            return blended.Normalize();
        }
        
        // Try right perpendicular
        if (this.IsPathClear(perp2))
        {
            let blended = targetDir.Clone().Multiply(0.3).Add(perp2.Clone().Multiply(0.7));
            return blended.Normalize();
        }
        
        // Try opposite direction (back away)
        let opposite = blockedDir.Clone().Multiply(-1);
        if (this.IsPathClear(opposite))
        {
            return opposite.Normalize();
        }
        
        // Try small angle variations
        for(let angle = -PI/3; angle <= PI/3; angle += PI/12)
        {
            let rotated = blockedDir.Clone().Rotate(angle);
            if (this.IsPathClear(rotated))
            {
                let blended = targetDir.Clone().Multiply(0.5).Add(rotated.Clone().Multiply(0.5));
                return blended.Normalize();
            }
        }
        
        // Last resort: try random direction
        return RandVector(1).Normalize();
    }
    
    // Improved pathfinding with obstacle avoidance
    UpdatePathfinding()
    {
        if (!this.targetPos)
            return;
        
        let toTarget = this.targetPos.Clone().Subtract(this.pos);
        let distance = toTarget.Length();
        
        if (distance < 0.3)
        {
            // Close enough, stop
            this.velocity.Set(0, 0);
            this.targetPos = null;
            this.detourAngle = 0;
            return;
        }
        
        // Normalize direction to target
        let targetDir = toTarget.Clone().Normalize();
        
        // Check if stuck (not moving much)
        let movedDistance = this.pos.Distance(this.lastPosition);
        if (this.stuckTimer.Get() > this.stuckTime)
        {
            if (movedDistance < this.stuckThreshold)
            {
                // We're stuck! Try a detour
                this.detourAngle += RandBetween(PI/4, PI/2) * (Rand() > 0.5 ? 1 : -1);
                let detourDir = targetDir.Clone().Rotate(this.detourAngle);
                
                // Try detour direction
                if (this.IsPathClear(detourDir))
                {
                    targetDir = detourDir;
                }
                else
                {
                    // Detour also blocked, try alternative
                    targetDir = this.FindAlternativeDirection(targetDir, targetDir);
                }
                
                // Reset stuck timer
                this.stuckTimer.Set(0);
                this.lastPosition = this.pos.Clone();
            }
            else
            {
                // We're moving, reset stuck tracking
                this.stuckTimer.Set(0);
                this.lastPosition = this.pos.Clone();
                this.detourAngle = 0;
            }
        }
        else
        {
            // Check if direct path is clear
            if (!this.IsPathClear(targetDir))
            {
                // Path blocked, find alternative
                targetDir = this.FindAlternativeDirection(targetDir, targetDir);
                // Reset detour angle when we find a new path
                this.detourAngle = 0;
            }
            else
            {
                // Path is clear, gradually reduce detour if we were detouring
                if (Math.abs(this.detourAngle) > 0.01)
                {
                    this.detourAngle *= 0.9; // Gradually return to direct path
                }
            }
        }
        
        // Set velocity towards target (or detour)
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
                        // Target is south of building (entrance)
                        this.targetPos = workBuilding.pos.Clone();
                        this.targetPos.y += workBuilding.size.y + 0.3;
                    }
                }
                else if (this.currentState === 'travelingToHouse')
                {
                    let houseBuilding = this.FindBuildingByAddress(this.houseAddress);
                    if (houseBuilding)
                    {
                        // Target is south of building (entrance)
                        this.targetPos = houseBuilding.pos.Clone();
                        this.targetPos.y += houseBuilding.size.y + 0.3;
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
                    DrawEmoji(this.emoji, emojiPos.x|0, emojiPos.y|0, 16 * cameraScale, 'center');
                    
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
        
        // Create NPC (will spawn in house interior)
        let npc = new NPC(new Vector2(0, 0), surname, characteristic, emoji, spriteIndex, houseAddress, workAddress);
        
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


