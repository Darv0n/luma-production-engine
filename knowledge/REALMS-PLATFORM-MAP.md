# Luma Realms Platform Map

> Comprehensive UI/UX map of app.lumalabs.ai as of 2026-03-16.
> Created by live browser exploration (Playwright). For any LLM or human
> building automation, integrations, or creative workflows against this platform.

## Platform Identity

- **URL**: `https://app.lumalabs.ai`
- **Title**: "Luma | AI Creative Agents"
- **Internal codename**: "Realms"
- **Architecture**: tldraw infinite canvas + conversational AI agent sidebar
- **Auth**: Persistent browser context (cookie-based, `.realms-session/` directory)

---

## Home Dashboard (`/`)

### Top Bar
- **Team switcher** (top-left): "D Double's team" dropdown
- **User avatar** (top-right): Account access

### Template Categories (horizontal tabs)
Templates are pre-built agent boards with system prompts for specific creative workflows.

| Category | Templates |
|----------|-----------|
| **Featured** | Brand Identity, Infographics, Product Photography, Slide Deck, Trailer |
| **Branding** | Brand Identity, Headshot Varieties, Variants Exploration |
| **Filmmaking** | Age Transformation, Before and After, Character Creator, Environmental Transformation, Trailer |
| **Marketing** | Infographics, Logo Reveal, Meme Remixing, Pitch Deck, Slide Deck, Social Media Video Ads |
| **Product Design** | Action Figures, Product Packaging, Product Photography, Sketch to Render, Virtual Models |

### Board List
- **Filters**: All | Shared | Mine
- **Search**: "Search boards..." textbox
- **New board**: "+" button
- **Board cards**: Title, edit timestamp, thumbnail grid of canvas assets
- **Board URLs**: `/board/{uuid}`

---

## Board View (`/board/{uuid}`)

### Layout (three zones)

```
+-------------------------------------------------------+
| <- BACK  BOARD NAME v         [gear] [Share]           |  TOP BAR
+-------------------------------------------------------+
|                                    |                   |
|                                    | AGENT PANEL       |
|   tldraw CANVAS                    | (right sidebar)   |
|   (infinite, zoomable,             |                   |
|    pannable)                       | - Chat history    |
|                                    | - Asset previews  |
|                                    | - Plan tracker    |
|                                    | - Input bar       |
|                                    |                   |
+------------------------------------+-------------------+
| [Select][GenImg][GenVid][GenAud] | [Frame][Shapes]     |  BOTTOM TOOLBAR
| [Text][Note][Color] | [Upload]   [Chat] [Assets]       |
+-------------------------------------------------------+
```

### Top Bar
- **Back arrow** (`<-`): Returns to home dashboard
- **Board name** + dropdown chevron: Rename board
- **Settings gear**: Opens settings menu
- **Share button**: Sharing/collaboration

### Bottom Toolbar (left to right)

#### Generation Tools (Group 1)
| Icon | Name | Shortcut | Models Available |
|------|------|----------|-----------------|
| Cursor | Select | ESC | — |
| Camera | Generate Image | — | Nano Banana, Nano Banana Pro, GPT Image 1.5, Seedream |
| Play | Generate Video | — | Ray3.14, Ray3.14 HDR, Sora 2, Veo 3, Veo 3.1, Kling 3.0, Kling 2.6 |
| Waveform | Generate Audio | — | Speech (ElevenLabs v3), Music, Sound Effects |

#### Canvas Tools (Group 2)
| Icon | Name | Shortcut |
|------|------|----------|
| Brackets | Frame | F |
| Diamond | Shapes | S |
| Aa | Text | T |
| Sticky | Note | N |
| Circle | Color | C |

#### Upload (Group 3)
| Icon | Name | Shortcut |
|------|------|----------|
| Upload | Media Upload | Ctrl+U |

### Bottom-Right Controls
| Icon | Name | Shortcut |
|------|------|----------|
| Chat bubble | Chat (toggle agent panel) | Ctrl+/ |
| Search | Assets (toggle assets panel) | Ctrl+F |

### Zoom Controls (bottom-left)
- Zoom out (`-`)
- Zoom level display (e.g., "60%", "100%")
- Zoom in (`+`)

---

## Agent Panel (Right Sidebar)

### Header
- **Board name** with dropdown chevron (switch boards / rename)
- **Minimize button** (`-`)

### Chat History
Messages display in a scrollable feed. Each agent response contains:

1. **Thinking trace** (collapsible): "Analyzed your request {duration}"
   - Click to expand internal reasoning (e.g., "The user said 'Go' - I need to follow the Seed Flow...")
   - Shows duration in seconds

2. **Tool use indicators** (collapsible):
   - **"Read"**: Agent read canvas shapes/assets for context
   - Expands to show which shapes were read
   - **"Show process" / "Hide process"**: Reveals step-by-step generation log
     - Waiting/planning steps
     - Parallel generation progress
     - QA assessment with per-asset details
     - Asset IDs

3. **Plan tracking**: "Created plan X/Y" or "Updated plan X/Y"
   - Collapsible checklist with progress icons
   - Steps show completed (checkmark) vs pending (circle)
   - Agent creates multi-step plans, gates between steps for human approval

4. **Asset display**: Generated images shown as inline thumbnails in chat
   - Click to select on canvas
   - Thumbnails link to canvas positions

5. **Feedback**: Thumbs up / thumbs down buttons on agent responses

### Agent Modes (dropdown in input bar)
| Mode | Purpose |
|------|---------|
| **Create** | Generate assets (images, video, audio) — default |
| **Brainstorm** | Ideation and exploration without generation |

### Input Bar
- **Textbox**: "What do you want to do?" — natural language input
- **Mode selector**: Create / Brainstorm dropdown (left)
- **Agent indicator**: Shows "agent" label
- **Microphone button**: Voice input
- **Send button**: Submit message (gold arrow)

---

## Assets Panel (Right Sidebar — alternate view)

Toggle with Ctrl+F or Assets button.

- **Search**: "Search assets..." with Ctrl+F shortcut
- **Filter button**: Filter/sort options
- **Asset list**: Thumbnail + name + type label for each canvas asset
- Types: text, image, video, audio, frame, shape

---

## Asset Selection (clicking an asset on canvas)

### Selection Toolbar (floating above selected asset)
| Button | Name | Shortcut | Purpose |
|--------|------|----------|---------|
| Circle | Color | — | Change border/label color |
| Refresh | Rerun | Shift+R | Re-generate with same prompt |
| Expand | Full Size | Space | View at full resolution |
| Brackets | Create Frame | F | Wrap in a frame container |
| Download | Download | Shift+D | Download asset file |
| Tag | Label | — | Add organizational labels |
| Info | Info | I | View generation metadata |

### Inline Prompt
- **"Type..." textbox**: Appears below selection toolbar
- Allows prompt modification directly on the selected asset

### Selection Handles
- 8 resize handles (corners + midpoints) around selected asset
- Standard tldraw selection behavior (drag, resize, rotate)

---

## Right-Click Context Menu (on image assets)

### Generation Actions
| Action | Has Submenu | Purpose |
|--------|-------------|---------|
| **Make Video** | Yes (model picker) | Generate video from this image (I2V) |
| **Make Image** | Yes (model picker) | Generate variation/remix of this image |
| **Modify Image** | Yes | Edit/transform the image |
| **Latent Blend** | No | Blend with another image in latent space |
| **Reframe** | No | AI outpainting to change aspect ratio |
| **Remove Background** | No | Background removal |
| **Extract Palette** | No | Pull color palette from image |

### Organization
| Action | Purpose |
|--------|---------|
| **Labels** | Categorize/tag the asset (submenu) |

### Utilities
| Action | Purpose |
|--------|---------|
| **Copy** | Copy to clipboard (submenu — likely image/prompt/link) |
| **Open Image in New Tab** | Full-res view in new browser tab |
| **Download Image** | Save to local disk |
| **Info** (I) | Generation metadata (model, prompt, settings) |
| **Report** | Flag content |

### Command Search
- **"Start typing..." textbox** at top of context menu
- Type to filter/search available actions

---

## Model Registry (as of 2026-03-16)

### Image Generation
| Model | Tier | Notes |
|-------|------|-------|
| Nano Banana | Standard | Luma's native image model |
| Nano Banana Pro | Premium | Higher quality, Gemini-based |
| GPT Image 1.5 | External | OpenAI's image model |
| Seedream | External | ByteDance's image model |

### Video Generation
| Model | Tier | Notes |
|-------|------|-------|
| Ray3.14 | Standard | Luma's latest video model |
| Ray3.14 HDR | Premium | HDR variant, richer color/dynamic range |
| Sora 2 | External | OpenAI's video model |
| Veo 3 | External | Google DeepMind video |
| Veo 3.1 | External | Google DeepMind latest |
| Kling 3.0 | External | Kuaishou's latest |
| Kling 2.6 | External | Kuaishou's stable |

### Audio Generation
| Type | Model | Notes |
|------|-------|-------|
| Speech | ElevenLabs v3 | Text-to-speech |
| Music | Unknown | Music generation |
| Sound Effects | Unknown | SFX generation |

---

## Settings Menu (gear icon)

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| Keyboard Shortcuts | Link | — | Opens shortcut reference (Shift+/) |
| Show Inspector | Toggle | ON | Show asset inspector panel (Ctrl+\) |
| Show Minimap | Toggle | OFF | Canvas minimap overlay |
| Show Asset Model Labels | Toggle | OFF | Display which model generated each asset |
| Always Snap | Toggle | ON | Snap-to-grid behavior |
| Enable Notifications | Toggle | ON | Browser notifications |
| Theme | Submenu | System | System / Light / Dark |
| Voice Language | Submenu | — | Language for voice input |
| Account | Link | — | Account settings |
| Report Bug | Link | — | Bug report form |

---

## Agent Workflow Patterns (observed from live boards)

### 1. Template Seed Flow
- Agent reads canvas shapes on board load ("Read shape")
- Finds the brief/context document (text notes, images)
- Delivers a welcome message describing what it will create
- Asks the human to provide direction or use the existing brief

### 2. Plan-Then-Execute
- Agent creates a numbered plan (e.g., "Created plan 0/6")
- Steps are visible as a checklist
- Agent executes steps sequentially, updating progress ("1/6", "2/6", etc.)
- Plans can be "Updated" mid-execution when direction changes

### 3. Direction Gates
- After generating variations, agent pauses and asks human to choose
- "Which direction hits hardest?" pattern
- Human selects, agent uses that as style reference for remaining work
- This is NOT automatic — requires human response in chat

### 4. Batch Generation with QA
- Agent generates multiple variations in parallel
- Runs internal QA assessment on all results
- Reports scores and detailed observations in "Show process" log
- Assigns internal asset IDs (e.g., "3kCz-GAI")
- Groups results in labeled frames on canvas

### 5. Style Cascade
- Approved direction from early steps becomes style reference
- Agent uses it to maintain visual consistency across remaining generations
- Explicit in plans: "Generate Shots 2 & 3 using approved Shot 1 as style ref"

---

## Canvas Objects

### Types
- **Images**: Generated or uploaded, with alt-text containing the prompt
- **Videos**: Generated clips
- **Audio**: Generated speech/music/SFX
- **Frames**: Container groups with titles (e.g., "Shot 1 Keyframes — Chrome Spokes ECU")
- **Text**: Rich text blocks
- **Notes**: Sticky notes (yellow background)
- **Shapes**: Geometric primitives

### Frame Naming Convention
- Agent names frames descriptively: "{Shot N} {Type} — {Description}"
- Frames group related variations together
- Clicking a frame heading in the agent panel navigates canvas to that frame

---

## Keyboard Shortcuts (confirmed)

| Key | Action |
|-----|--------|
| ESC | Select tool |
| F | Frame tool |
| S | Shapes tool |
| T | Text tool |
| N | Note tool |
| C | Color tool |
| I | Info panel (on selection) |
| Space | Full size view (on selection) |
| Shift+R | Rerun generation (on selection) |
| Shift+D | Download (on selection) |
| Shift+/ | Keyboard shortcuts panel |
| Ctrl+U | Media upload |
| Ctrl+/ | Toggle chat panel |
| Ctrl+F | Toggle assets panel / search |
| Ctrl+\ | Toggle inspector |

---

## Automation Notes (for RealmsSession / War Room)

### Agent Chat Selectors (confirmed working)
- Input: `textbox` with placeholder "What do you want to do?"
- Submit: `button[type="submit"]` or arrow button
- The agent input is in the RIGHT sidebar, not in the tldraw canvas

### Canvas Interaction
- Assets have `img` elements with full prompts as alt text
- Frames have `heading` elements with titles
- Selection triggers floating toolbar with `data-test-id` attributes:
  - `selection-toolbar-rerun`
  - `selection-toolbar-fullscreen`
  - `selection-toolbar-frame`
  - `selection-toolbar-download`
  - `selection-toolbar-label`
  - `selection-toolbar-info`
  - `selection-toolbar-color`

### Right-Click Actions (programmatic)
- Right-click any image to access Make Video / Make Image / Modify / Latent Blend / Reframe / Remove BG / Extract Palette
- Model submenus match toolbar model lists
- "Start typing..." command palette at top of context menu

### SSE / Real-time
- Generation progress visible in agent chat (step-by-step "Show process")
- Canvas updates in real-time as assets are generated
- Plan progress updates live ("0/6" → "1/6" → etc.)

### Critical Path for Automation
1. Navigate to board → `page.goto('https://app.lumalabs.ai/board/{id}')`
2. Wait for agent panel → look for "What do you want to do?" textbox
3. Send prompt → fill textbox, click send button
4. Wait for response → watch for new elements in chat history
5. Capture results → screenshot canvas or parse img alt texts for prompts
6. Right-click for actions → `page.mouse.click(x, y, { button: 'right' })`
7. Select model from submenu → click menuitem by name

---

## What Changed Since Previous Intel

Previous intel (REALMS-INTEL.md) was from insider video transcripts.
This map is from live exploration. Key updates:

1. **Model roster expanded**: Veo 3.1, Kling 2.6, Seedream added since last audit
2. **Audio generation confirmed**: Speech (ElevenLabs v3), Music, Sound Effects
3. **Context menu fully mapped**: Latent Blend, Extract Palette, Remove Background are new
4. **Plan system confirmed**: Multi-step plans with progress tracking, direction gates
5. **Show process confirmed**: Full generation log with QA assessment per asset
6. **Inline prompt on selection**: "Type..." textbox appears on selected assets
7. **Command palette in context menu**: "Start typing..." search at top of right-click menu
8. **Theme system**: System/Light/Dark modes available
9. **Voice input**: Microphone button + Voice Language setting confirmed
