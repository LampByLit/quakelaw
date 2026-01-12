# Tiny Docket

## [🎮 PLAY TINY DOCKET NOW](https://tinydocket.up.railway.app)

> **Note**: This game is a fork of [Bounce Back](https://js13kgames.com/entries/bounce-back) by Frank Force, a boomerang roguelite game for JS13k.

---

**Tiny Docket** is a courtroom simulator where you play as a Defense Attorney in a community of varied denizens. Get assigned cases, gather real conversational testimony from witnesses, and present it to the judge. Make your case, and get rulings that have real community consequences. File claims against criminals in the neighborhood. Reach for **JUSTICE**.

This game uses **Deepseek** to simulate all NPCs. This game sources over **1000 real court cases** from across America, mostly criminal trials. Real cases are summarized, contextualized, and projected onto NPCs to simulate real practice and deliver continuous, dynamic, replayable gameplay.

---

## Gameplay Overview

### Weekly Case Cycle

**Monday Morning (07:00+)**
- Mandatory meeting at the courthouse with the judge
- Receive a new case assignment when you speak to the judge
- Case is automatically selected from a database of 1000+ real American criminal trials
- Case details are parsed using AI to extract individuals, evidence, and key facts
- NPCs in your community are assigned to witness roles based on the case
- A case file is added to your inventory
- Judge persona (name and characteristic) is regenerated each Monday

**Monday - Friday**
- Build your case by gathering evidence and testimony
- Interview witnesses (NPCs) through real-time AI-powered conversations
- Record conversations as evidence items
- Purchase documents from NPCs for evidence
- Schedule meetings with witnesses via calendar system
- Collect evidence items (recordings, documents, case files)
- Manage your time and sleep to maintain performance

**Friday**
- Mandatory meeting at the courthouse with the judge
- Present all gathered evidence to the judge
- Submit your defense statement
- Judge makes AI-powered decision based on:
  - Case summary
  - Prosecution argument (generated from NPCs with facts from gossip network)
  - Your statement
  - All evidence presented
  - Judge's unique persona and characteristics

### Judge Rulings & Community Consequences

The AI judge has full discretion to:
- **Award coins** to the player based on case quality (unlimited amount)
- **Reprimand the player** ($20 fine) for unprofessional conduct
- **Disbar the player** (game over) for extremely egregious conduct
- **Punish NPCs** with:
  - Corporeal punishment (NPC remains but is punished)
  - Banishment (NPC permanently removed from town)
  - Death sentence (NPC permanently removed)
- **Change NPC jobs** to anything (e.g., "santa claus", "court jester")
- **Change NPC names** to anything (e.g., "Dunce", "Traitor", "Hero")

### Filing Claims

After trials, you can file claims against NPCs:
- Pay $20 to file a claim with the judge
- Present evidence (recordings, documents, case files)
- Judge automatically reviews all evidence
- Judge makes decision with full discretion
- Real consequences: NPCs can be punished, rewarded, or have their jobs/names changed
- Player can be rewarded or punished based on claim merit

### Time & Calendar System

- **Day Length**: 10 minutes of real time = 24 hours in-game (1 game hour = 25 real seconds)
- **Start Time**: Each day begins at 07:00
- **Time Progression**: Time pauses when window loses focus (except in interiors)
- **Week Structure**:
  - **Sunday**: Game starts
  - **Monday**: Mandatory case assignment meeting at courthouse (07:02+)
  - **Friday**: Mandatory courthouse judgment
  - **Weekend**: Free days (no mandatory meetings)
- **Calendar System**: 
  - 28 days per month (4 weeks)
  - 12 months per year
  - Schedule meetings with NPCs, track case deadlines
  - Events can be pending, completed, or missed

### NPC Interaction System

- **AI-Powered Conversations**: Every NPC conversation is powered by Deepseek API
- **Persistent Conversations**: Each NPC remembers your conversation history (stored per session)
- **Witness Testimony**: NPCs assigned to case roles provide relevant testimony based on case facts
- **Evidence Recording**: Record conversations as evidence items (recordings)
- **Document Purchasing**: Buy documents from NPCs for evidence
- **Character Personalities**: Each NPC has unique characteristics, jobs, and behaviors
- **Gossip Network**: NPCs share facts and information with each other daily at 7:01 AM
  - Facts spread based on NPC characteristics (gossipy NPCs spread faster)
  - NPCs can learn up to 100 facts each
  - Facts learned from conversations and gossip influence NPC knowledge
  - Gossip spreads when NPCs are in the same location

### Inventory & Evidence System

- **16-slot inventory** (4x4 grid) for evidence and items
- **Evidence Types**:
  - **Recordings** (`evidence_*`): Recorded conversations with NPCs
  - **Documents** (`document_*`): Purchased or found documents
  - **Case Files** (`casefile_*`): Case summaries and witness lists
  - **Bonuses** (`bonus_*`): Legal bonuses (credibility, countersuit, exculpation)
  - **Judgments** (`judgment_*`): Judge rulings from trials
  - **Claims** (`claim_*`): Filed claims and their outcomes
- **Evidence Presentation**: All evidence in inventory is automatically presented to judge during trials
- **Evidence Management**: View evidence details, drop items, name recordings

---

## Technical Architecture

### Frontend

- **Game Engine**: Custom 2D game engine (`gameEngine.js`)
  - Object-oriented architecture
  - Tile-based level system (64x64 grid)
  - Physics and collision detection
  - Rendering pipeline with 3D shadows
  - GameObject system for entities
  - Input processing system
  - A* pathfinding for NPC navigation

- **Core Systems**:
  - `game.js`: Main game logic, player, world, buildings, interiors, time system
  - `npcs.js`: NPC generation, spawning, behavior, job system, pathfinding
  - `dialogue.js`: Conversation modal, AI message handling, evidence recording
  - `caseSystem.js`: Case initialization, parsing, witness assignment, judgment processing
  - `calendar.js`: Event scheduling, task management, time progression
  - `session.js`: Session management, game state persistence

- **Rendering**:
  - Canvas-based rendering
  - Tile-based sprite system
  - Multiple tile sets for buildings, furniture, characters
  - Pseudo-3D shadow system
  - UI modals and overlays
  - Day/night lighting cycle

### Backend

- **Server**: Node.js/Express (`server.js`)
  - RESTful API endpoints
  - Deepseek API proxy (keeps API keys secure)
  - Rate limiting (30 requests/minute per IP)
  - Session-based conversation storage
  - Case file management
  - Gossip network management

- **API Endpoints**:
  - `/api/npc/conversation/:surname`: NPC conversation handling
  - `/api/cases/list`: List available case files
  - `/api/cases/load/:filename`: Load case data
  - `/api/cases/parse`: Parse case to extract individuals/evidence
  - `/api/cases/summary`: Generate case summary
  - `/api/cases/judgment`: Judge decision for trials
  - `/api/claims/judgment`: Judge decision for claims
  - `/api/npc/generate-prosecution`: Generate prosecution argument
  - `/api/npc/gossip/process`: Process daily gossip network
  - `/api/npc/conversations/:sessionId`: Session conversation cleanup

### AI Integration (Deepseek)

- **Model**: `deepseek-chat` (configurable via `DEEPSEEK_MODEL` env var)
- **Temperature**: 0.3-0.5 depending on endpoint (balanced creativity/consistency)
- **Max Tokens**: 150-2000 depending on endpoint

**NPC Conversations**:
- Each NPC has persistent conversation history per session
- Conversations stored server-side in `data/conversations/{sessionId}/{npcSurname}.json`
- NPCs have unique characteristics, jobs, and case-related knowledge
- Conversations include game time context (day, time, date)
- NPCs share facts they know from gossip network in conversations
- Facts are extracted from conversations and added to NPC knowledge

**Case Parsing**:
- AI extracts individuals, evidence, and key facts from real case files
- Uses pattern matching and AI to identify witnesses, defendants, and evidence
- Assigns NPCs to case roles based on characteristics and availability

**Judge Decisions**:
- Judge has unique persona (name, characteristic) regenerated each Monday
- Judge reviews case summary, prosecution, player statement, evidence, and all NPCs
- Judge makes JSON-structured decisions with punishments, rewards, and rulings
- Decisions have real game consequences (NPC banishment, job changes, name changes, etc.)

**Gossip Network**:
- Facts spread between NPCs daily at 7:01 AM
- Spread rate based on NPC characteristics (gossipy: 90%, talkative: 70%, reserved: 30%, etc.)
- NPCs in same location share facts with each other
- Each NPC can store up to 100 facts
- Facts are deduplicated by content hash
- Facts learned from player conversations and from other NPCs via gossip

### Case Database

- **Location**: `cases/json/` directory
- **Format**: JSON files containing real court case data
- **Count**: 1000+ case files
- **Source**: Real American criminal trials
- **Case Selection**: Random unused case selected each Monday
- **Case Tracking**: Used cases tracked to prevent immediate repeats (resets when all used)

### Data Persistence

- **Session Storage**: Browser sessionStorage for session IDs (fresh per tab)
- **Local Storage**: Browser localStorage for game state (player data, inventory, NPCs, calendar, case progress)
- **Conversation Storage**: Server-side JSON files per session in `data/conversations/`
- **Gossip Network**: Server-side JSON file per session in `data/gossip/`
- **Save System**: Player data, inventory, NPCs, calendar events, case progress, banished NPCs
- **Session Management**: Unique session IDs for conversation isolation

### Game State Management

- **Player Data**: Health, coins, inventory (16 slots), position, home position
- **NPC Data**: All NPCs with surnames, characteristics, jobs, addresses (house and work), facts
- **Case Data**: Active case, used cases, current case number, judge persona
- **Calendar Data**: Events, tasks, scheduled meetings, missed events
- **World Data**: Buildings, interiors, furniture placement, navigation grid
- **Time Data**: Day of week, game hour, days elapsed, month, day of month

---

## Technical Specifications

### Dependencies

**Backend**:
- `express`: ^4.18.2 - Web server framework
- `cors`: ^2.8.5 - Cross-origin resource sharing
- `dotenv`: ^16.3.1 - Environment variable management
- `express-rate-limit`: ^7.5.1 - API rate limiting

**Frontend**:
- Pure JavaScript (no frameworks)
- Canvas API for rendering
- Fetch API for backend communication
- LocalStorage for game state persistence
- SessionStorage for session management

### Environment Variables

- `DEEPSEEK_API_KEY`: Required - Deepseek API key for AI features
- `DEEPSEEK_MODEL`: Optional - Deepseek model name (default: `deepseek-chat`)
- `PORT`: Optional - Server port (default: 3000)
- `DATA_DIR`: Optional - Data directory path (default: `./data`)

### System Requirements

- **Node.js**: >=18.0.0
- **Browser**: Modern browser with Canvas, LocalStorage, and SessionStorage support
- **Network**: Internet connection required for AI features

### Deployment

- **Platform**: Railway.app
- **URL**: https://tinydocket.up.railway.app
- **Static Files**: Served via Express static middleware
- **API**: RESTful endpoints for AI and case management

---
  
## Game Features

### Core Mechanics
- Real-time AI-powered NPC conversations with persistent memory
- Case-based gameplay with 1000+ real court cases
- Evidence gathering and presentation system
- Judge AI with full discretionary powers
- Community consequences from rulings (NPC banishment, job/name changes)
- Time management and calendar system
- Inventory system with multiple evidence types
- Claim filing system for post-trial actions
- Gossip network system for information spreading

### World Systems
- Procedurally generated NPCs with unique characteristics
- Building system with interiors
- Furniture placement and customization
- Day/night cycle with time progression
- Job system for NPCs
- Address system for NPCs (house and work locations)
- A* pathfinding for NPC navigation
- Navigation grid for collision detection

### UI Systems
- Dialogue modal for NPC conversations
- Calendar modal for event scheduling
- Inventory modal for evidence management
- Evidence view modal for reviewing items
- Judgment modal for trial outcomes
- Claim filing modal
- Loading and success notifications
- Sleep fade transition system

---

## Development

### Setup

```bash
npm install
```

Create a `.env` file:
```
DEEPSEEK_API_KEY=your_api_key_here
```

### Running

```bash
npm start
```

Server runs on `http://localhost:3000` (or configured PORT)

### Project Structure

```
q1k3/
├── server.js              # Backend API server
├── game.js                # Main game logic
├── gameEngine.js          # Game engine core
├── npcs.js                # NPC system
├── dialogue.js            # Conversation system
├── caseSystem.js          # Case management
├── calendar.js            # Calendar and events
├── session.js             # Session management
├── api.js                 # API utilities
├── config.js              # Configuration
├── index.html             # Main HTML file
├── cases/
│   └── json/              # 1000+ case files
├── data/
│   ├── conversations/     # Session conversation storage
│   └── gossip/            # Gossip network storage
└── package.json           # Dependencies
```

---

## Repository

This project is open source. Repository link can be added here.

---

## License

See LICENSE file for details.

---

**Built with Deepseek AI • Powered by Real American Court Cases • Justice Awaits**
