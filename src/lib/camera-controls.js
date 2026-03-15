/**
 * CAMERA CONTROLS
 *
 * 30 presets from the Luma platform API.
 * Source: GET /api/photon/v2/rich_prompt_entities/camera_controls
 *
 * Used in the SETUP panel per shot. The id maps to the platform's
 * camera_control field in the generation request.
 *
 * Categories: motion, angle, format, effect, transition
 */

export const CAMERA_CONTROLS = [
  // ─── Motion ──────────────────────────────────────────────────────────────
  { id: 'static',        name: 'Static',        category: 'motion',     keywords: ['still', 'locked', 'tripod', 'no movement', 'hold', 'fixed'] },
  { id: 'handheld',      name: 'Handheld',      category: 'motion',     keywords: ['shaky', 'shaky cam', 'jitter', 'wobble', 'unstable'] },
  { id: 'push_in',       name: 'Push In',       category: 'motion',     keywords: ['dolly in', 'move forward', 'creep in', 'glide in'] },
  { id: 'pull_out',      name: 'Pull Out',      category: 'motion',     keywords: ['dolly out', 'move backward', 'pull backward'] },
  { id: 'zoom_in',       name: 'Zoom In',       category: 'motion',     keywords: ['zoom forward', 'magnify', 'punch in', 'lens in'] },
  { id: 'zoom_out',      name: 'Zoom Out',      category: 'motion',     keywords: ['zoom back', 'widen', 'pull zoom', 'lens out'] },
  { id: 'pan_left',      name: 'Pan Left',      category: 'motion',     keywords: ['look left', 'swing left', 'sweep left', 'scan left'] },
  { id: 'pan_right',     name: 'Pan Right',     category: 'motion',     keywords: ['look right', 'swing right', 'sweep right'] },
  { id: 'tilt_up',       name: 'Tilt Up',       category: 'motion',     keywords: ['look up', 'swing up', 'pitch up'] },
  { id: 'tilt_down',     name: 'Tilt Down',     category: 'motion',     keywords: ['look down', 'swing down', 'pitch down'] },
  { id: 'truck_left',    name: 'Truck Left',    category: 'motion',     keywords: ['slide left', 'shift left', 'move left', 'glide left'] },
  { id: 'truck_right',   name: 'Truck Right',   category: 'motion',     keywords: ['slide right', 'shift right', 'move right'] },
  { id: 'pedestal_up',   name: 'Pedestal Up',   category: 'motion',     keywords: ['move up', 'elevate', 'ascend', 'boom up', 'rise up'] },
  { id: 'pedestal_down', name: 'Pedestal Down', category: 'motion',     keywords: ['move down', 'lower', 'drop down', 'descend'] },
  { id: 'orbit_left',    name: 'Orbit Left',    category: 'motion',     keywords: ['arc left', 'revolve left', 'circle left'] },
  { id: 'orbit_right',   name: 'Orbit Right',   category: 'motion',     keywords: ['arc right', 'revolve right', 'circle right'] },
  { id: 'crane_up',      name: 'Crane Up',      category: 'motion',     keywords: ['crane up', 'jib up', 'float up', 'glide up'] },
  { id: 'crane_down',    name: 'Crane Down',    category: 'motion',     keywords: ['crane down', 'jib down', 'float down'] },
  { id: 'roll_left',     name: 'Roll Left',     category: 'motion',     keywords: ['bank left', 'dutch left', 'spin left'] },
  { id: 'roll_right',    name: 'Roll Right',    category: 'motion',     keywords: ['bank right', 'dutch right', 'spin right'] },
  { id: 'dolly_zoom',    name: 'Dolly Zoom',    category: 'effect',     keywords: ['zolly', 'vertigo effect', 'hitchcock zoom', 'contra zoom'] },
  // ─── Angle ───────────────────────────────────────────────────────────────
  { id: 'low_angle',         name: 'Low Angle',         category: 'angle',  keywords: ['looking up', 'from below', 'heroic angle'] },
  { id: 'high_angle',        name: 'High Angle',        category: 'angle',  keywords: ['looking down', 'overhead', 'angled down'] },
  { id: 'ground_level',      name: 'Ground Level',      category: 'angle',  keywords: ['ground level camera shot'] },
  { id: 'eye_level',         name: 'Eye Level',         category: 'angle',  keywords: ['neutral angle', 'standard view', 'straight-on'] },
  { id: 'over_the_shoulder', name: 'Over The Shoulder', category: 'angle',  keywords: ['OTS', 'shoulder shot', 'conversation angle'] },
  { id: 'pov',               name: 'POV',               category: 'angle',  keywords: ['point of view', 'first-person', 'subjective'] },
  { id: 'overhead',          name: 'Overhead',          category: 'angle',  keywords: ['from above', "bird's eye", 'looking down'] },
  { id: 'aerial',            name: 'Aerial',            category: 'angle',  keywords: ['overhead', "bird's eye", 'high angle'] },
  { id: 'selfie',            name: 'Selfie',            category: 'angle',  keywords: ['self-portrait', "arm's length", 'front-facing'] },
  // ─── Format / Effect / Transition ─────────────────────────────────────────
  { id: 'bolt_cam',       name: 'Bolt Cam',       category: 'effect',     keywords: ['quick cut', 'sudden change', 'jump angle'] },
  { id: 'aerial_drone',   name: 'Aerial Drone',   category: 'format',     keywords: ['aerial', 'drone', 'quadcopter'] },
  { id: 'tiny_planet',    name: 'Tiny Planet',    category: 'effect',     keywords: ['stereographic projection', 'tiny world', 'fishbowl'] },
  { id: 'elevator_doors', name: 'Elevator Doors', category: 'transition', keywords: ['reveal', 'transition', 'doors part', 'opening'] },
];

export const CAMERA_CONTROL_BY_ID = Object.fromEntries(
  CAMERA_CONTROLS.map((c) => [c.id, c])
);

export const CAMERA_CONTROL_CATEGORIES = ['motion', 'angle', 'effect', 'format', 'transition'];

/**
 * Group controls by category for the dropdown.
 */
export function groupedControls() {
  const groups = {};
  for (const cat of CAMERA_CONTROL_CATEGORIES) {
    groups[cat] = CAMERA_CONTROLS.filter((c) => c.category === cat);
  }
  return groups;
}

/**
 * Preview video URL for a camera control.
 * Base URL from Luma CDN.
 */
export function controlPreviewUrl(id) {
  const nameMap = {
    static: 'Static',
    handheld: 'Shaky%20Cam',
    zoom_in: 'Zoom%20In',
    zoom_out: 'Zoom%20Out',
    pan_left: 'Pan%20Left%20ALT',
    pan_right: 'Pan%20Right%20ALT',
    tilt_up: 'Tilt%20Up',
    tilt_down: 'Tilt%20Down',
    push_in: 'Push%20In',
    pull_out: 'Pull%20Out',
    truck_left: 'Truck%20Left',
    truck_right: 'Truck%20Right',
    pedestal_up: 'Pedestal%20Up',
    pedestal_down: 'Pedestal%20Down',
    orbit_left: 'Orbit%20Left',
    orbit_right: 'Orbit%20Right',
    crane_up: 'Crane%20Up',
    crane_down: 'Crane%20Down',
    roll_left: 'Roll%20Right',   // Luma CDN has these swapped
    roll_right: 'Roll%20Left',
    dolly_zoom: 'Dolly%20Zoom',
    bolt_cam: 'Bolt%20Cam',
    aerial_drone: 'Aerial%20Drone',
    tiny_planet: 'Tiny%20Planet',
    elevator_doors: 'Elevator%20Doors',
  };
  const file = nameMap[id];
  if (!file) return null;
  const base1 = 'https://static.cdn-luma.com/files/camera_control_previews/';
  const base2 = 'https://static.cdn-luma.com/files/b64dcd4ced594d41/';
  const inBase2 = ['pan_left', 'pan_right', 'bolt_cam', 'aerial_drone', 'tiny_planet', 'elevator_doors', 'roll_left', 'roll_right'];
  const base = inBase2.includes(id) ? base2 : base1;
  return `${base}${file}_256.mp4`;
}
