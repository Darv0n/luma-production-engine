# LUMA DREAM MACHINE — TECHNICAL REFERENCE

Last verified: March 2026 (Ray3.14 / Ray3 / Ray3 Modify)

## Core Mental Model

THE MODEL THINKS LIKE A CAMERA, NOT LIKE A PAINTER.

It simulates what a physical camera would capture. It does not compose scenes
from semantic descriptions. When you write "a man sits at a table," the model
asks: where is the camera? What lens? What light? How far? If you don't answer,
it guesses generic.

## Models

### Ray3.14 (Default)
- Native 1080p. 4x faster than Ray3. 3x cheaper.
- Best stability, fewest artifacts.
- Does NOT support Character Reference.
- Use for: any shot where a specific face doesn't need to match across shots.

### Ray3
- Use ONLY when Character Reference is needed.
- Upload face photo → tag @character in prompt → identity locked across generations.
- Slower and more expensive.

### Ray3 Modify (Video-to-Video)
- Three strength tiers: Adhere (1-3), Flex (1-3), Reimagine (1-3)
- Use for: transforming existing footage, wardrobe/environment changes.

**Decision Rule**: Does a specific face need to match across shots? YES → Ray3. NO → Ray3.14.

## Prompt Anatomy (6 Components, Order Matters)

1. **SHOT TYPE** — highest-leverage word. Sets framing, distance, composition.
2. **SUBJECT + MID-ACTION VERB** — what we see and what it's doing RIGHT NOW.
3. **SECONDARY MOTION / PHYSICS** — what makes it real (wind, reflections, particles).
4. **CAMERA MOTION** — how the camera moves (1-2 motions max).
5. **LIGHTING** — emotional infrastructure (source + quality).
6. **MOOD / EQUIPMENT PRIME** — final flavor (optional polish).

Target: 20-40 words. Sweet spot: 25-35.

## Shot Types

| Type | Camera Position | Use |
|------|----------------|-----|
| Extreme close-up (ECU) | Eyes, lips, a detail | Vulnerability, texture |
| Close-up (CU) | Face and shoulders | Emotional reading |
| Medium close-up (MCU) | Chest up | Conversation distance |
| Medium shot (MS) | Waist up | Standard coverage |
| Medium wide (MWS) | Knees up | Body language + environment |
| Wide shot (WS) | Full body + environment | Establishes space |
| Extreme wide (EWS) | Landscape scale | Insignificance, scale |

Also valid: Over-the-shoulder, POV, Low angle, High angle, Bird's eye, Dutch angle, Two-shot.

## Camera Motions (15 Built-in)

Static, Pan Left/Right, Tilt Up/Down, Push In, Pull Out, Orbit Left/Right,
Crane Up/Down, Truck Left/Right, Pedestal Up/Down, Zoom In/Out, Bolt Cam,
Aerial Drone, Elevator, Roll Left/Right, Tiny Planet.

Natural language also works: dolly zoom, steadicam tracking, handheld sway,
FPV drone, rack focus, Vertigo effect, whip pan.

Rule: 1-2 motions per clip. Three degrades coherence.
Rule: "camera holds steady" / "static" is a valid, powerful choice.

## Lighting Presets

golden hour, blue hour, volumetric lighting, Rembrandt lighting,
soft diffused light, practical lights, chiaroscuro, neon glow,
overhead fluorescent, backlight, candlelight, overcast soft light,
dappled light, soft studio light.

For max control: specify source AND quality ("warm golden hour backlight through a window, soft fill from overhead").

## Equipment Primes (Optional Polish)

Camera: "Shot on ARRI Alexa Mini LF", "Shot on ARRI Alexa", "Shot on RED Komodo"
Film stock: "Kodak Vision3 250D", "Kodak Vision3 500T", "Kodak Portra 400", "Fujifilm Pro 400H"
Film grain: "16mm film grain", "35mm film grain"
Lens: "85mm portrait lens", "50mm f/1.4", "35mm", "24mm wide angle", "macro lens", "anamorphic bokeh", "telephoto compression"
Other: "Film still", "Documentary footage"

## Non-Negotiable Rules

### Rule 1: Positive Prompting Only
NEVER: "no [X]", "without [X]", "avoid [X]", "don't include", "remove", "exclude"
ALWAYS: describe what IS present. "empty background" not "no people".

### Rule 2: Mid-Action Verbs Only
"running" → full stride. "begins to run" → hesitation. "about to run" → standing still.
Always present tense, continuous, in-progress.

### Rule 3: One Subject, One Action, One Camera Move
Per clip. Break complex scenes into multiple clips.

### Rule 4: Dead Words
vibrant, whimsical, hyper-realistic, beautiful, amazing, stunning, cinematic,
8K, 4K, masterpiece, trending, professional, high quality, detailed, best quality,
begins to, starts to, about to.

### Rule 5: 20-40 Word Sweet Spot
Under 20: model fills gaps with generic. Over 50: ignores later instructions.

## Generation Settings

| Parameter | Options |
|-----------|---------|
| Model | Ray3.14 / Ray3 |
| Mode | Text-to-Video / Image-to-Video / I2V (start+end) / Modify |
| Quality | Draft / 720p SDR / 1080p SDR / 720p HDR / 720p HDR+EXR / Hi-Fi 4K HDR |
| Aspect | 9:16 / 3:4 / 1:1 / 4:3 / 16:9 / 21:9 |
| Duration | 5s / 10s |
| Loop | Yes / No |

## Workflow

1. **Keyframe first** — generate still image per shot. I2V >> T2V quality.
2. **Draft iteration** — 10-20 drafts at Draft quality. Select 2-3 winners.
3. **Character consistency** — Ray3 + Character Reference for recurring faces.
4. **Full quality render** — winners only at 1080p SDR.
5. **Assembly** — NLE (DaVinci Resolve preferred). Color match, LUT at 20-35%.

## Credit Costs

| Generation | Credits |
|-----------|---------|
| Draft 5s | ~40 |
| 720p SDR 5s | ~200 |
| 1080p SDR 5s | ~400 |
| 1080p SDR 10s | ~800 |
| 4K upscale | ~10/image |

Plans: Plus ($29.99/mo, 10K credits), Unlimited ($94.99/mo, 10K fast + unlimited relaxed).

## Known Limits

| Limit | Fix |
|-------|-----|
| Hands/fingers | Frame tighter, "natural hand position", 20+ drafts |
| Multi-subject | 1-2 subjects per clip, wide shots for crowds |
| Morphing | I2V not T2V, shorter clips, start+end keyframes |
| Camera accuracy | Add physical specificity ("camera physically moves backward on a dolly track") |
| Text in video | Always add text in post. Never generate with Luma. |
| Clip duration | Max 10s. Extend chains to ~30s. Design storyboard with cut points. |
| Audio | No native audio on Ray models. All audio in post. Veo 3.1 for dialogue. |
| Face consistency | Character Reference on Ray3. The only reliable method. |
