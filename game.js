/* =====================================================================
   TANK BATTLE - Famicom Edition
   Pure JS Canvas, 8-bit pixel art, Battle City inspired
   ===================================================================== */

(() => {
'use strict';

// ---------- Constants ----------
const CANVAS_W = 512, CANVAS_H = 480;
const TILE = 16;                       // sub-tile size
const COLS = CANVAS_W / TILE;          // 32
const ROWS = CANVAS_H / TILE;          // 30
const TANK = 32;                       // tank size 2x2 tiles
const BULLET = 8;

// Tile types
const T = { EMPTY:0, BRICK:1, STEEL:2, WATER:3, GRASS:4, ICE:5, EAGLE:6, EAGLE_DEAD:7 };

// Directions
const DIR = { UP:0, RIGHT:1, DOWN:2, LEFT:3 };
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];

// Game states
const STATE = { TITLE:0, PLAYING:1, PAUSED:2, STAGE_CLEAR:3, GAME_OVER:4 };

// ---------- DOM ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const stageEl = document.getElementById('stage');
const enemyEl = document.getElementById('enemy-count');

// ---------- Famicom Palette ----------
const C = {
  black:  '#000000',
  white:  '#fcfcfc',
  grey:   '#7c7c7c',
  red:    '#d82800',
  orange: '#fc7460',
  yellow: '#fcc442',
  brown:  '#883800',
  cream:  '#fce0a8',
  green:  '#00a800',
  lime:   '#80d010',
  blue:   '#3cbcfc',
  navy:   '#0058f8',
  silver: '#bcbcbc',
};

// ---------- Audio (Web Audio API 8-bit) ----------
const Audio = (() => {
  let ac = null;
  let musicOn = true, musicTimer = null, musicNoteIdx = 0;
  const MELODY = [[523,150],[659,150],[784,150],[1047,300],[784,150],[659,150],[523,300],[392,150],[523,150],[659,300],[523,150],[440,150],[392,300],[349,150],[440,150],[523,300],[659,150],[523,150],[440,300]];
  const BASS = [196, 196, 261, 261];
  function playNote() {
    if (!musicOn || !ac) return;
    const [freq, dur] = MELODY[musicNoteIdx % MELODY.length];
    const a = ac, o = a.createOscillator(), g = a.createGain();
    o.type='square'; o.frequency.value=freq;
    g.gain.setValueAtTime(0.025, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur/1000*0.95);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur/1000);
    if (musicNoteIdx % 2 === 0) {
      const o2 = a.createOscillator(), g2 = a.createGain();
      o2.type='triangle'; o2.frequency.value = BASS[Math.floor(musicNoteIdx/2) % BASS.length];
      g2.gain.setValueAtTime(0.04, a.currentTime);
      g2.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur/1000*1.8);
      o2.connect(g2); g2.connect(a.destination); o2.start(); o2.stop(a.currentTime + dur/1000*1.8);
    }
    musicNoteIdx++;
    musicTimer = setTimeout(playNote, dur);
  }
  function ensure() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
    }
    return ac;
  }
  function beep(freq, dur, type='square', vol=0.08) {
    const a = ensure(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + dur);
  }
  function noise(dur, vol=0.15) {
    const a = ensure(); if (!a) return;
    const bufSize = a.sampleRate * dur;
    const buf = a.createBuffer(1, bufSize, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0; i<bufSize; i++) data[i] = (Math.random()*2-1) * (1 - i/bufSize);
    const src = a.createBufferSource(); src.buffer = buf;
    const g = a.createGain(); g.gain.value = vol;
    src.connect(g); g.connect(a.destination); src.start();
  }
  return {
    init: ensure,
    shoot: () => beep(880, 0.04, 'square', 0.06),
    hit:   () => { beep(120, 0.05, 'square', 0.08); noise(0.08, 0.1); },
    boom:  () => { noise(0.25, 0.2); beep(80, 0.2, 'sawtooth', 0.1); },
    pickup:() => { beep(660, 0.05); setTimeout(()=>beep(880,0.05),60); setTimeout(()=>beep(1100,0.08),120); },
    start: () => { beep(440,0.1); setTimeout(()=>beep(660,0.1),100); setTimeout(()=>beep(880,0.15),200); },
    over:  () => { beep(220,0.2); setTimeout(()=>beep(165,0.2),200); setTimeout(()=>beep(110,0.4),400); },
    clear: () => { beep(523,0.1); setTimeout(()=>beep(659,0.1),100); setTimeout(()=>beep(784,0.1),200); setTimeout(()=>beep(1047,0.2),300); },
    music: () => { if (musicTimer) return; musicNoteIdx = 0; playNote(); },
    stopMusic: () => { if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; } },
    toggleMusic: () => { musicOn = !musicOn; if (!musicOn && musicTimer) { clearTimeout(musicTimer); musicTimer = null; } else if (musicOn) playNote(); return musicOn; },
  };
})();

// ---------- Input ----------
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyP' && game.state === STATE.PLAYING) game.state = STATE.PAUSED;
  else if (e.code === 'KeyP' && game.state === STATE.PAUSED) game.state = STATE.PLAYING;
  if (e.code === 'KeyR') resetGame(true);
  if (e.code === 'KeyM') Audio.toggleMusic && Audio.toggleMusic();
  if (e.code === 'KeyF') { document.body.classList.toggle('crt'); }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(name) {
  switch(name) {
    case 'up':    return keys['KeyW'] || keys['ArrowUp'];
    case 'down':  return keys['KeyS'] || keys['ArrowDown'];
    case 'left':  return keys['KeyA'] || keys['ArrowLeft'];
    case 'right': return keys['KeyD'] || keys['ArrowRight'];
    case 'fire':  return keys['Space'] || keys['KeyJ'];
  }
  return false;
}

// ---------- Stage Maps ----------
// '.'=empty, 'B'=brick, 'S'=steel, 'W'=water, 'G'=grass, 'I'=ice, 'E'=eagle
// Each map is 26 cols x 26 rows (the inner field). We center it on the 32x30 canvas.
const STAGE_W = 26, STAGE_H = 26;
const FIELD_OFFSET_X = (COLS - STAGE_W) * TILE / 2;  // (32-26)*16/2 = 48
const FIELD_OFFSET_Y = (ROWS - STAGE_H) * TILE / 2;  // (30-26)*16/2 = 32

// Helper to make wall pattern strings (26 chars per row, 26 rows)
const MAPS = [
  // Stage 1 - Classic intro
  [
    "..........................",
    "..BB..BB..BB..BB..BB..BB..",
    "..BB..BB..BB..BB..BB..BB..",
    "..BB..BB..BB..BB..BB..BB..",
    "..BB..BB..BB..BB..BB..BB..",
    "..........................",
    "..BB..BB..SS..SS..BB..BB..",
    "..BB..BB..SS..SS..BB..BB..",
    "..........................",
    "BBBB..BBBB......BBBB..BBBB",
    "BBBB..BBBB......BBBB..BBBB",
    "....BB............BB......",
    "....BB............BB......",
    "..........................",
    "..........................",
    "....BB............BB......",
    "....BB............BB......",
    "BBBB..BBBB......BBBB..BBBB",
    "BBBB..BBBB......BBBB..BBBB",
    "..........................",
    "..BB..BB..SS..SS..BB..BB..",
    "..BB..BB..SS..SS..BB..BB..",
    "..........................",
    "..........BBBB............",
    "..........BEEB............",
    "..........BEEB............",
  ],
  // Stage 2 - Maze
  [
    "..........................",
    ".BBBBBBBBBB....BBBBBBBBBB.",
    ".B........B....B........B.",
    ".B..BBBB..B....B..BBBB..B.",
    ".B..B..B..B....B..B..B..B.",
    ".B..B..B..B....B..B..B..B.",
    ".B..BBBB..B....B..BBBB..B.",
    ".B........BBBBBB........B.",
    ".BBBBBB..................B",
    "......B..WWWW..WWWW......B",
    "......B..WWWW..WWWW......B",
    "......B..................B",
    "......BBBB........BBBB....",
    "..........................",
    "..GGGG..GGGG..GGGG..GGGG..",
    "..GGGG..GGGG..GGGG..GGGG..",
    "..........................",
    "..BB..BB..SSSS..BB..BB....",
    "..BB..BB..SSSS..BB..BB....",
    "..........................",
    "..BBBB..BB....BB..BBBB....",
    "..BBBB..BB....BB..BBBB....",
    "............BB............",
    "..........BBBBBB..........",
    "..........BBEEBB..........",
    "..........BBEEBB..........",
  ],
  // Stage 3 - Fortress
  [
    "..........................",
    "..SSSSSSSSSS..SSSSSSSSSS..",
    "..S........S..S........S..",
    "..S..BBBB..S..S..BBBB..S..",
    "..S..BBBB..S..S..BBBB..S..",
    "..S........S..S........S..",
    "..SSSSSSSSSS..SSSSSSSSSS..",
    "..........................",
    "BBBBBB..............BBBBBB",
    "BBBBBB..WWWWWWWW....BBBBBB",
    "........WWWWWWWW..........",
    "..GGGG..............GGGG..",
    "..GGGG..............GGGG..",
    "..........................",
    "..........................",
    "..GGGG..............GGGG..",
    "..GGGG..............GGGG..",
    "........WWWWWWWW..........",
    "BBBBBB..WWWWWWWW....BBBBBB",
    "BBBBBB..............BBBBBB",
    "..........................",
    "..SS..SS..BBBB..SS..SS....",
    "..SS..SS..BBBB..SS..SS....",
    "............BB............",
    "..........BBBBBB..........",
    "..........BBEEBB..........",
  ],
  // Stage 4 - Open
  [
    "..........................",
    "BB......BB......BB......BB",
    "BB......BB......BB......BB",
    "..........................",
    "..BB..BB..BB..BB..BB..BB..",
    "..BB..BB..BB..BB..BB..BB..",
    "..........................",
    "SS..SS..SS..SS..SS..SS..SS",
    "SS..SS..SS..SS..SS..SS..SS",
    "..........................",
    "..WWWW..GGGG..GGGG..WWWW..",
    "..WWWW..GGGG..GGGG..WWWW..",
    "..........................",
    "BB..BB..BB..BB..BB..BB..BB",
    "BB..BB..BB..BB..BB..BB..BB",
    "..........................",
    "..GGGG..WWWW..WWWW..GGGG..",
    "..GGGG..WWWW..WWWW..GGGG..",
    "..........................",
    "SS..SS......SS......SS..SS",
    "SS..SS......SS......SS..SS",
    "..........................",
    "..BB..BB..BB..BB..BB..BB..",
    "............BB............",
    "..........BBBBBB..........",
    "..........BBEEBB..........",
  ],
  // Stage 5 - Hard
  [
    "BBBBBB..BBBBBBBBBB..BBBBBB",
    "B....B..B........B..B....B",
    "B....B..B..SSSS..B..B....B",
    "B....B..B..SSSS..B..B....B",
    "B....B..B........B..B....B",
    "BBBBBB..BBBBBBBBBB..BBBBBB",
    "..........................",
    "..GGGGGGGG..GGGGGGGG......",
    "..GGGGGGGG..GGGGGGGG......",
    "..........................",
    "..WW..WW..WW..WW..WW..WW..",
    "..WW..WW..WW..WW..WW..WW..",
    "..........................",
    "SSSS..SSSS..SSSS..SSSS....",
    "SSSS..SSSS..SSSS..SSSS....",
    "..........................",
    "..BB..BB..BB..BB..BB..BB..",
    "..BB..BB..BB..BB..BB..BB..",
    "..........................",
    "BBBB....BBBBBBBBBB....BBBB",
    "BBBB....B........B....BBBB",
    "........B..BBBB..B........",
    "........B........B........",
    "........BBBB..BBBB........",
    "..........BBEEBB..........",
    "..........BBEEBB..........",
  ],
];

// ---------- Game State ----------
const game = {
  state: STATE.TITLE,
  stage: 1,
  score: 0,
  lives: 3,
  hiscore: 20000,
  field: Array.from({length: 30}, () => Array(32).fill(0)),        // 2D array of tile types (COLS x ROWS)
  player: null,
  enemies: [],
  bullets: [],
  powerups: [],
  explosions: [],
  popups: [],
  stageIntroTimer: 0,
  enemySpawnQueue: [],
  enemySpawnTimer: 0,
  spawnPoints: [],
  playerSpawn: {x:0, y:0},
  eaglePos: {x:0, y:0},
  totalEnemiesPerStage: 20,
  enemiesKilled: 0,
  enemiesOnField: 0,
  maxEnemiesOnField: 4,
  shieldedEagle: 0,    // timer for steel around base
  freezeEnemies: 0,    // timer for clock powerup
  shake: 0,
  flash: 0,
  gameOverTimer: 0,
  stageClearTimer: 0,
};

// ---------- Build field from map ----------
function buildField(mapIdx) {
  const map = MAPS[mapIdx % MAPS.length];
  const field = Array.from({length: ROWS}, () => Array(COLS).fill(T.EMPTY));
  for (let r = 0; r < STAGE_H; r++) {
    const row = map[r] || '';
    for (let c = 0; c < STAGE_W; c++) {
      const ch = row[c] || '.';
      const fx = c + FIELD_OFFSET_X / TILE;
      const fy = r + FIELD_OFFSET_Y / TILE;
      switch(ch) {
        case 'B': field[fy][fx] = T.BRICK; break;
        case 'S': field[fy][fx] = T.STEEL; break;
        case 'W': field[fy][fx] = T.WATER; break;
        case 'G': field[fy][fx] = T.GRASS; break;
        case 'I': field[fy][fx] = T.ICE; break;
        case 'E':
          field[fy][fx] = T.EAGLE;
          game.eaglePos = {x: fx*TILE, y: fy*TILE};
          break;
      }
    }
  }
  // spawn points & player spawn relative to field
  const fxOff = FIELD_OFFSET_X, fyOff = FIELD_OFFSET_Y;
  game.spawnPoints = [
    {x: fxOff + 0*TILE,           y: fyOff + 0*TILE},
    {x: fxOff + 12*TILE,          y: fyOff + 0*TILE},
    {x: fxOff + 24*TILE,          y: fyOff + 0*TILE},
  ];
  game.playerSpawn = {x: fxOff + 8*TILE, y: fyOff + 24*TILE};
  return field;
}

// ---------- Collision helpers ----------
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Check if a rectangle hits any solid tile (returns true if blocked)
function rectBlocked(x, y, w, h, byBullet=false) {
  // out of bounds (canvas edges)
  if (x < 0 || y < 0 || x + w > CANVAS_W || y + h > CANVAS_H) return true;
  const c0 = Math.floor(x / TILE), c1 = Math.floor((x + w - 1) / TILE);
  const r0 = Math.floor(y / TILE), r1 = Math.floor((y + h - 1) / TILE);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
      const t = game.field[r][c];
      if (t === T.BRICK || t === T.STEEL || t === T.EAGLE || t === T.EAGLE_DEAD) return true;
      if (!byBullet && t === T.WATER) return true;
    }
  }
  return false;
}

// ---------- Tank class ----------
class Tank {
  constructor(x, y, isPlayer, type=0) {
    this.x = x; this.y = y; this.w = TANK; this.h = TANK;
    this.dir = isPlayer ? DIR.UP : DIR.DOWN;
    this.isPlayer = isPlayer;
    this.type = type;     // enemy: 0=basic 1=fast 2=power 3=armor
    this.speed = isPlayer ? 2 : (type === 1 ? 2 : type === 2 ? 1 : 1);
    this.hp = isPlayer ? 1 : (type === 3 ? 4 : 1);
    this.cooldown = 0;
    this.fireDelay = isPlayer ? 18 : (type === 2 ? 25 : 40);
    this.bulletSpeed = isPlayer ? 4 : (type === 2 ? 5 : 3);
    this.alive = true;
    this.spawning = isPlayer ? 0 : 30;       // appear animation
    this.shield = isPlayer ? 90 : 0;          // brief invulnerability
    this.aiTimer = 0;
    this.aiDir = Math.floor(Math.random() * 4);
    this.level = 1;                            // player power level
    this.maxBullets = isPlayer ? 1 : 1;
    this.frame = 0;
    this.hasPowerup = !isPlayer && Math.random() < 0.18;
    this.flash = 0;
  }

  tryMove(dir) {
    const dirChanged = this.dir !== dir;
    this.dir = dir;
    const nx = this.x + DX[dir] * this.speed;
    const ny = this.y + DY[dir] * this.speed;
    let ax = nx, ay = ny;
    if (dirChanged) {
      if (dir === DIR.UP || dir === DIR.DOWN) ax = Math.round(this.x / (TILE/2)) * (TILE/2);
      else ay = Math.round(this.y / (TILE/2)) * (TILE/2);
    }
    if (rectBlocked(ax, ay, this.w, this.h)) return false;
    // tank-tank collision
    for (const t of allTanks()) {
      if (t === this || !t.alive) continue;
      if (rectsOverlap(ax, ay, this.w, this.h, t.x, t.y, t.w, t.h)) return false;
    }
    this.x = ax; this.y = ay;
    this.frame = (this.frame + 1) % 8;
    return true;
  }

  shoot() {
    if (this.cooldown > 0) return;
    // bullet limit
    const myBullets = game.bullets.filter(b => b.owner === this).length;
    if (myBullets >= this.maxBullets) return;
    const cx = this.x + TANK/2 - BULLET/2;
    const cy = this.y + TANK/2 - BULLET/2;
    const bx = cx + DX[this.dir] * (TANK/2);
    const by = cy + DY[this.dir] * (TANK/2);
    game.bullets.push(new Bullet(bx, by, this.dir, this.bulletSpeed, this, this.isPlayer && this.level >= 3));
    this.cooldown = this.fireDelay;
    if (this.isPlayer) Audio.shoot();
  }

  update() {
    if (this.cooldown > 0) this.cooldown--;
    if (this.spawning > 0) { this.spawning--; return; }
    if (this.shield > 0) this.shield--;
    if (this.flash > 0) this.flash--;

    if (this.isPlayer) {
      let moved = false;
      if (pressed('up'))    moved = this.tryMove(DIR.UP);
      else if (pressed('down'))  moved = this.tryMove(DIR.DOWN);
      else if (pressed('left'))  moved = this.tryMove(DIR.LEFT);
      else if (pressed('right')) moved = this.tryMove(DIR.RIGHT);
      if (pressed('fire')) this.shoot();
    } else {
      if (game.freezeEnemies > 0) return;
      this.aiTimer--;
      if (this.aiTimer <= 0 || !this.tryMove(this.aiDir)) {
        this.aiDir = Math.floor(Math.random() * 4);
        // bias toward eagle/player
        if (Math.random() < 0.35) {
          const target = Math.random() < 0.6 ? game.eaglePos : (game.player || game.eaglePos);
          const tx = target.x - this.x, ty = target.y - this.y;
          if (Math.abs(tx) > Math.abs(ty)) this.aiDir = tx > 0 ? DIR.RIGHT : DIR.LEFT;
          else this.aiDir = ty > 0 ? DIR.DOWN : DIR.UP;
        }
        this.aiTimer = 30 + Math.floor(Math.random() * 90);
      } else {
        this.tryMove(this.aiDir);
      }
      if (Math.random() < 0.03) this.shoot();
    }
  }

  damage(byPlayer) {
    if (this.shield > 0) return false;
    this.hp--;
    this.flash = 6;
    if (this.hp <= 0) {
      this.alive = false;
      explode(this.x + TANK/2, this.y + TANK/2);
      Audio.boom();
      if (!this.isPlayer && byPlayer) {
        const score = (this.type+1) * 100;
        game.score += score;
        game.enemiesKilled++;
        scorePopup(this.x + 16, this.y, score);
        if (this.hasPowerup) spawnPowerup();
      }
      return true;
    } else {
      Audio.hit();
      return false;
    }
  }

  draw() {
    if (this.spawning > 0) { drawSpawnFx(this.x, this.y, this.spawning); return; }
    if (this.shield > 0 && Math.floor(this.shield / 4) % 2) drawShield(this.x, this.y);
    drawTank(this.x, this.y, this.dir, this.isPlayer, this.type, this.frame, this.flash, this.level);
  }
}

// ---------- Bullet ----------
class Bullet {
  constructor(x, y, dir, speed, owner, strong=false) {
    this.x = x; this.y = y; this.w = BULLET; this.h = BULLET;
    this.dir = dir; this.speed = speed; this.owner = owner;
    this.strong = strong; this.dead = false;
  }
  update() {
    this.x += DX[this.dir] * this.speed;
    this.y += DY[this.dir] * this.speed;
    // bounds
    if (this.x < 0 || this.y < 0 || this.x > CANVAS_W || this.y > CANVAS_H) {
      this.dead = true; explode(this.x, this.y, true); return;
    }
    // check all overlapping tiles
    const c0=Math.floor(this.x/TILE), c1=Math.floor((this.x+this.w-1)/TILE), r0=Math.floor(this.y/TILE), r1=Math.floor((this.y+this.h-1)/TILE);
    for (let r=r0;r<=r1;r++) for (let c=c0;c<=c1;c++) {
      if (r<0||r>=ROWS||c<0||c>=COLS) continue;
      const t=game.field[r][c];
      if (t===T.BRICK) { game.field[r][c]=T.EMPTY; if(this.strong){const nc=c+DX[this.dir],nr=r+DY[this.dir]; if(nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&game.field[nr][nc]===T.BRICK) game.field[nr][nc]=T.EMPTY;} this.dead=true; Audio.hit(); explode(this.x,this.y,true); return; }
      if (t===T.STEEL) { if(this.strong) game.field[r][c]=T.EMPTY; this.dead=true; Audio.hit(); explode(this.x,this.y,true); return; }
      if (t===T.EAGLE) { game.field[r][c]=T.EAGLE_DEAD; for(let dr=-1;dr<=2;dr++) for(let dc=-1;dc<=2;dc++){const rr=r+dr,cc=c+dc; if(rr>=0&&rr<ROWS&&cc>=0&&cc<COLS&&game.field[rr][cc]===T.EAGLE) game.field[rr][cc]=T.EAGLE_DEAD;} this.dead=true; Audio.boom(); explode(this.x,this.y); triggerGameOver(); return; }
    }
    // tanks
    if (this.owner.isPlayer) {
      for (const e of game.enemies) {
        if (e.alive && e.spawning <= 0 && rectsOverlap(this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) {
          this.dead = true; e.damage(true); return;
        }
      }
    } else {
      // enemy bullet hits player
      const p = game.player;
      if (p && p.alive && p.spawning <= 0 && rectsOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
        this.dead = true;
        if (p.damage(false)) playerDied();
        return;
      }
      // hit eagle handled above
    }
    // bullet-bullet
    for (const b of game.bullets) {
      if (b === this || b.dead) continue;
      if (b.owner.isPlayer !== this.owner.isPlayer && rectsOverlap(this.x,this.y,this.w,this.h, b.x,b.y,b.w,b.h)) {
        this.dead = true; b.dead = true; return;
      }
    }
  }
  draw() {
    ctx.fillStyle = C.cream;
    ctx.fillRect(this.x, this.y, BULLET, BULLET);
    ctx.fillStyle = C.white;
    ctx.fillRect(this.x + (this.dir===DIR.LEFT?-1:this.dir===DIR.RIGHT?1:0),
                 this.y + (this.dir===DIR.UP?-1:this.dir===DIR.DOWN?1:0), 2, 2);
  }
}

// ---------- Powerup ----------
const PWR = { STAR:0, GRENADE:1, TANK:2, SHOVEL:3, CLOCK:4, HELMET:5 };
class Powerup {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.w = TANK; this.h = TANK;
    this.type = type; this.timer = 600; this.blink = 0; this.dead = false;
  }
  update() {
    this.timer--; this.blink++;
    if (this.timer <= 0) { this.dead = true; return; }
    const p = game.player;
    if (p && p.alive && rectsOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
      applyPowerup(this.type); this.dead = true; Audio.pickup(); game.score += 500;
    }
  }
  draw() {
    if (Math.floor(this.blink / 8) % 2 === 0 && this.timer < 120) return;
    drawPowerup(this.x, this.y, this.type);
  }
}

function spawnPowerup() {
  // pick a random open spot
  const types = [PWR.STAR, PWR.GRENADE, PWR.TANK, PWR.SHOVEL, PWR.CLOCK, PWR.HELMET];
  const t = types[Math.floor(Math.random() * types.length)];
  for (let i = 0; i < 50; i++) {
    const x = FIELD_OFFSET_X + Math.floor(Math.random() * (STAGE_W-2)) * TILE;
    const y = FIELD_OFFSET_Y + Math.floor(Math.random() * (STAGE_H-2)) * TILE;
    if (!rectBlocked(x, y, TANK, TANK)) {
      game.powerups.push(new Powerup(x, y, t)); return;
    }
  }
}

function applyPowerup(type) {
  const p = game.player; if (!p) return;
  switch(type) {
    case PWR.STAR:
      p.level = Math.min(3, p.level + 1);
      if (p.level >= 2) p.maxBullets = 2;
      if (p.level >= 2) p.bulletSpeed = 5;
      break;
    case PWR.GRENADE:
      for (const e of game.enemies) {
        if (e.alive) { e.alive = false; explode(e.x + TANK/2, e.y + TANK/2); game.score += 200; game.enemiesKilled++; }
      }
      Audio.boom();
      break;
    case PWR.TANK:
      game.lives++;
      break;
    case PWR.SHOVEL:
      shieldEagle();
      game.shieldedEagle = 600;
      break;
    case PWR.CLOCK:
      game.freezeEnemies = 360;
      break;
    case PWR.HELMET:
      p.shield = 360;
      break;
  }
}

function shieldEagle() {
  const eg = game.eaglePos;
  const ec = Math.floor(eg.x / TILE), er = Math.floor(eg.y / TILE);
  const cells = [
    [er-1, ec-1], [er-1, ec], [er-1, ec+1], [er-1, ec+2],
    [er,   ec-1], [er,   ec+2],
    [er+1, ec-1], [er+1, ec+2],
  ];
  for (const [r,c] of cells) {
    if (r>=0 && r<ROWS && c>=0 && c<COLS && game.field[r][c] !== T.EAGLE && game.field[r][c] !== T.EAGLE_DEAD)
      game.field[r][c] = T.STEEL;
  }
}
function brickEagle() {
  const eg = game.eaglePos;
  const ec = Math.floor(eg.x / TILE), er = Math.floor(eg.y / TILE);
  const cells = [
    [er-1, ec-1], [er-1, ec], [er-1, ec+1], [er-1, ec+2],
    [er,   ec-1], [er,   ec+2],
    [er+1, ec-1], [er+1, ec+2],
  ];
  for (const [r,c] of cells) {
    if (r>=0 && r<ROWS && c>=0 && c<COLS && (game.field[r][c] === T.STEEL || game.field[r][c] === T.EMPTY))
      game.field[r][c] = T.BRICK;
  }
}

// ---------- Explosion ----------
class Explosion {
  constructor(x, y, small=false) {
    this.x = x; this.y = y; this.t = 0; this.life = small ? 10 : 24; this.small = small;
  }
  update() { this.t++; }
  draw() {
    const p = this.t / this.life;
    const size = (this.small ? 8 : 28) * (p < 0.4 ? p*2.5 : 1 - (p-0.4)/0.6);
    const half = size / 2;
    ctx.fillStyle = p < 0.5 ? C.yellow : C.red;
    ctx.fillRect(this.x - half, this.y - half, size, size);
    ctx.fillStyle = p < 0.3 ? C.white : C.orange;
    ctx.fillRect(this.x - half/2, this.y - half/2, size/2, size/2);
  }
  get dead() { return this.t >= this.life; }
}
function explode(x, y, small=false) {
  game.explosions.push(new Explosion(x, y, small));
  if (!small) game.shake = 6;
}

// ---------- ScorePopup ----------
class ScorePopup {
  constructor(x, y, score) {
    this.x = x; this.y = y; this.text = '+' + score; this.t = 0; this.life = 50;
    this.color = score >= 500 ? '#80d010' : score >= 300 ? '#fcc442' : '#fcfcfc';
  }
  update() { this.t++; this.y -= 0.6; }
  draw() {
    const alpha = this.t < this.life*0.7 ? 1 : (1 - (this.t - this.life*0.7) / (this.life*0.3));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000'; ctx.font = 'bold 10px "Press Start 2P", monospace'; ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x + 1, this.y + 1);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
  get dead() { return this.t >= this.life; }
}
function scorePopup(x, y, score) { game.popups.push(new ScorePopup(x, y, score)); }

// ---------- Tanks ----------
function allTanks() {
  const list = game.enemies.slice();
  if (game.player) list.push(game.player);
  return list;
}

// ---------- Sprites (drawn directly) ----------
function drawTank(x, y, dir, isPlayer, type, frame, flash, level=1) {
  ctx.save();
  ctx.translate(x + TANK/2, y + TANK/2);
  ctx.rotate(dir * Math.PI / 2);
  const c = isPlayer
    ? (level >= 3 ? C.lime : level >= 2 ? C.cream : C.yellow)
    : (type===0 ? C.silver : type===1 ? C.cream : type===2 ? C.blue : C.red);
  const dark = isPlayer ? C.brown : C.grey;
  // tracks (animated)
  const trackOff = (frame % 4) < 2 ? 0 : 2;
  ctx.fillStyle = dark;
  ctx.fillRect(-16, -16 + trackOff, 5, 32 - trackOff*2);
  ctx.fillRect(11, -16 + trackOff, 5, 32 - trackOff*2);
  ctx.fillStyle = '#000';
  for (let i = -14; i < 16; i += 4) {
    ctx.fillRect(-16, i, 5, 2);
    ctx.fillRect(11, i, 5, 2);
  }
  // body
  ctx.fillStyle = flash > 0 ? C.white : c;
  ctx.fillRect(-10, -12, 20, 24);
  // body shading
  ctx.fillStyle = dark;
  ctx.fillRect(-10, 8, 20, 4);
  ctx.fillRect(-10, -12, 4, 24);
  // turret
  ctx.fillStyle = flash > 0 ? C.white : (isPlayer ? C.brown : C.black);
  ctx.fillRect(-6, -8, 12, 12);
  ctx.fillStyle = flash > 0 ? C.white : c;
  ctx.fillRect(-4, -6, 8, 8);
  // barrel
  ctx.fillStyle = flash > 0 ? C.white : dark;
  ctx.fillRect(-2, -16, 4, 12);
  ctx.fillStyle = '#000';
  ctx.fillRect(-1, -16, 2, 2);
  // armor pips for armored enemy
  if (!isPlayer && type === 3) {
    ctx.fillStyle = C.yellow;
    ctx.fillRect(-8, -4, 2, 2); ctx.fillRect(6, -4, 2, 2);
    ctx.fillRect(-8, 4, 2, 2); ctx.fillRect(6, 4, 2, 2);
  }
  // power level star
  if (isPlayer && level >= 2) {
    ctx.fillStyle = C.yellow;
    ctx.fillRect(-1, -1, 2, 2);
  }
  ctx.restore();
}

function drawSpawnFx(x, y, t) {
  const stage = Math.floor(t / 6) % 4;
  ctx.save();
  ctx.translate(x + TANK/2, y + TANK/2);
  ctx.fillStyle = stage % 2 ? C.white : C.cream;
  const sizes = [4, 14, 8, 20];
  const s = sizes[stage];
  ctx.fillRect(-s/2, -s/2, s, s);
  ctx.fillStyle = stage % 2 ? C.cream : C.white;
  ctx.fillRect(-s/3, -s/3, s*2/3, s*2/3);
  ctx.restore();
}

function drawShield(x, y) {
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 2, y - 2, TANK + 4, TANK + 4);
  ctx.strokeStyle = C.cream;
  ctx.strokeRect(x, y, TANK, TANK);
}

function drawPowerup(x, y, type) {
  ctx.fillStyle = C.black;
  ctx.fillRect(x+2, y+2, TANK-4, TANK-4);
  ctx.fillStyle = C.white;
  ctx.fillRect(x+4, y+4, TANK-8, TANK-8);
  // icon
  ctx.fillStyle = C.red;
  const cx = x + TANK/2, cy = y + TANK/2;
  switch(type) {
    case PWR.STAR:
      ctx.fillStyle = C.yellow;
      ctx.fillRect(cx-7, cy-2, 14, 4);
      ctx.fillRect(cx-2, cy-7, 4, 14);
      ctx.fillRect(cx-5, cy-5, 10, 10);
      ctx.fillStyle = C.red;
      ctx.fillRect(cx-3, cy-3, 6, 6);
      break;
    case PWR.GRENADE:
      ctx.fillStyle = C.black;
      ctx.fillRect(cx-5, cy-3, 10, 9);
      ctx.fillRect(cx-3, cy-7, 6, 4);
      ctx.fillStyle = C.red;
      ctx.fillRect(cx-1, cy-9, 2, 2);
      break;
    case PWR.TANK:
      drawTank(x, y, DIR.UP, true, 0, 0, 0, 1);
      break;
    case PWR.SHOVEL:
      ctx.fillStyle = C.brown;
      ctx.fillRect(cx-1, cy-8, 2, 10);
      ctx.fillStyle = C.silver;
      ctx.fillRect(cx-5, cy+2, 10, 6);
      break;
    case PWR.CLOCK:
      ctx.fillStyle = C.yellow;
      ctx.fillRect(cx-8, cy-8, 16, 16);
      ctx.fillStyle = C.black;
      ctx.fillRect(cx-1, cy-6, 2, 7);
      ctx.fillRect(cx-1, cy-1, 6, 2);
      break;
    case PWR.HELMET:
      ctx.fillStyle = C.silver;
      ctx.fillRect(cx-7, cy-5, 14, 4);
      ctx.fillRect(cx-7, cy-1, 14, 4);
      ctx.fillStyle = C.grey;
      ctx.fillRect(cx-7, cy+3, 14, 2);
      break;
  }
}

function drawBrick(x, y) {
  ctx.fillStyle = '#a04020';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = '#601810';
  ctx.fillRect(x, y, TILE, 2);
  ctx.fillRect(x, y+TILE/2, TILE, 2);
  ctx.fillRect(x+TILE/2-1, y, 2, TILE/2);
  ctx.fillRect(x+2, y+TILE/2, 2, TILE/2);
  ctx.fillStyle = C.cream;
  ctx.fillRect(x+1, y+1, 2, 1);
  ctx.fillRect(x+TILE/2+1, y+TILE/2+1, 2, 1);
}
function drawSteel(x, y) {
  ctx.fillStyle = C.silver;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = C.white;
  ctx.fillRect(x+1, y+1, TILE-2, 2);
  ctx.fillRect(x+1, y+1, 2, TILE-2);
  ctx.fillStyle = C.grey;
  ctx.fillRect(x+1, y+TILE-3, TILE-2, 2);
  ctx.fillRect(x+TILE-3, y+1, 2, TILE-2);
}
function drawWater(x, y, t) {
  ctx.fillStyle = C.navy;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = C.blue;
  const off = Math.floor(t / 20) % 2 ? 0 : 4;
  ctx.fillRect(x+2+off, y+3, 4, 1);
  ctx.fillRect(x+8-off, y+9, 4, 1);
  ctx.fillRect(x+4, y+13, 4, 1);
}
function drawGrass(x, y) {
  ctx.fillStyle = C.green;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = C.lime;
  for (let i = 0; i < 6; i++) {
    const px = x + ((i*5) % TILE);
    const py = y + ((i*7) % TILE);
    ctx.fillRect(px, py, 2, 2);
  }
  ctx.fillStyle = '#005800';
  ctx.fillRect(x+1, y+10, 2, 3);
  ctx.fillRect(x+10, y+4, 2, 3);
}
function drawIce(x, y) {
  ctx.fillStyle = '#d8f0ff';
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = C.white;
  ctx.fillRect(x+2, y+2, 4, 1);
  ctx.fillRect(x+8, y+10, 4, 1);
}
function drawEagle(x, y, dead) {
  // eagle occupies 2x2 tiles; only draw when this is top-left corner of those 2x2
  ctx.fillStyle = dead ? C.grey : C.cream;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = dead ? '#444' : C.brown;
  // Simple eagle silhouette in 16x16 (top-left), neighbors will draw their parts
  ctx.fillRect(x+4, y+2, 8, 4);
  ctx.fillRect(x+6, y+6, 4, 4);
  ctx.fillRect(x+2, y+10, 12, 4);
  ctx.fillStyle = '#000';
  ctx.fillRect(x+5, y+3, 2, 2);
  ctx.fillRect(x+9, y+3, 2, 2);
}

function drawField() { if (!game.field) return;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = game.field[r][c];
      const x = c * TILE, y = r * TILE;
      switch(t) {
        case T.BRICK: drawBrick(x, y); break;
        case T.STEEL: drawSteel(x, y); break;
        case T.WATER: drawWater(x, y, game.tick); break;
        case T.ICE:   drawIce(x, y); break;
        case T.EAGLE: drawEagle(x, y, false); break;
        case T.EAGLE_DEAD: drawEagle(x, y, true); break;
      }
    }
  }
}
function drawGrassOverlay() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (game.field[r][c] === T.GRASS) drawGrass(c * TILE, r * TILE);
    }
  }
}

// ---------- Game flow ----------
function startGame() {
  game.state = STATE.PLAYING;
  game.stage = 1;
  game.score = 0;
  game.lives = 3;
  Audio.start();
  loadStage(game.stage);
  overlay.classList.remove('show');
  setTimeout(() => Audio.music && Audio.music(), 800);
}

function loadStage(stageNum) {
  game.field = buildField(stageNum - 1);
  game.enemies = [];
  game.bullets = [];
  game.powerups = [];
  game.explosions = [];
  game.enemiesKilled = 0;
  game.enemiesOnField = 0;
  game.shieldedEagle = 0;
  game.freezeEnemies = 0;
  game.stageClearTimer = 0;
  // Build enemy queue: mix of types based on stage difficulty
  game.enemySpawnQueue = [];
  for (let i = 0; i < game.totalEnemiesPerStage; i++) {
    let type;
    const r = Math.random();
    const difficulty = Math.min(1, (stageNum - 1) / 5);
    if (r < 0.4 - difficulty*0.2) type = 0;          // basic
    else if (r < 0.65) type = 1;                      // fast
    else if (r < 0.85) type = 2;                      // power
    else type = 3;                                    // armor
    game.enemySpawnQueue.push(type);
  }
  game.enemySpawnTimer = 0;
  game.player = new Tank(game.playerSpawn.x, game.playerSpawn.y, true);
  game.maxEnemiesOnField = Math.min(4, 2 + Math.floor(stageNum / 2));
  game.popups = [];
  game.stageIntroTimer = 120;
  updateHUD();
}

function spawnEnemyIfReady() {
  if (game.enemySpawnQueue.length === 0) return;
  if (game.enemiesOnField >= game.maxEnemiesOnField) return;
  game.enemySpawnTimer--;
  if (game.enemySpawnTimer > 0) return;
  const sp = game.spawnPoints[Math.floor(Math.random() * game.spawnPoints.length)];
  // ensure spot clear
  for (const t of allTanks()) {
    if (t.alive && rectsOverlap(sp.x, sp.y, TANK, TANK, t.x, t.y, t.w, t.h)) {
      game.enemySpawnTimer = 30; return;
    }
  }
  const type = game.enemySpawnQueue.shift();
  const e = new Tank(sp.x, sp.y, false, type);
  game.enemies.push(e);
  game.enemiesOnField++;
  game.enemySpawnTimer = 180;
}

function playerDied() {
  game.lives--;
  game.player = null;
  if (game.lives < 0) { triggerGameOver(); return; }
  setTimeout(() => {
    if (game.state === STATE.PLAYING) {
      game.player = new Tank(game.playerSpawn.x, game.playerSpawn.y, true);
    }
  }, 1000);
}

function triggerGameOver() {
  if (game.state !== STATE.PLAYING) return;
  game.state = STATE.GAME_OVER;
  game.gameOverTimer = 180;
  Audio.over();
}

function checkStageClear() {
  if (game.enemySpawnQueue.length === 0 && game.enemies.every(e => !e.alive)) {
    if (game.stageClearTimer === 0) {
      game.stageClearTimer = 120;
      Audio.clear();
    }
  }
}

function nextStage() {
  game.stage++;
  game.score += 1000;
  if (game.score > game.hiscore) game.hiscore = game.score;
  loadStage(game.stage);
  game.state = STATE.PLAYING;
}

function resetGame(toTitle) {
  if (toTitle) {
    game.state = STATE.TITLE;
    overlay.classList.add('show');
  }
}

// ---------- HUD ----------
function updateHUD() {
  scoreEl.textContent = String(game.score).padStart(6, '0');
  livesEl.textContent = Math.max(0, game.lives);
  stageEl.textContent = game.stage;
  enemyEl.textContent = game.enemySpawnQueue.length + game.enemies.filter(e=>e.alive).length;
  document.getElementById('hiscore').textContent = String(game.hiscore).padStart(6, '0');
}

// ---------- Main loop ----------
game.tick = 0;
function loop() {
  game.tick++;

  // Update
  if (game.state === STATE.PLAYING) {
    if (game.freezeEnemies > 0) game.freezeEnemies--;
    if (game.shieldedEagle > 0) {
      game.shieldedEagle--;
      if (game.shieldedEagle === 0) brickEagle();
    }
    if (game.player) game.player.update();
    for (const e of game.enemies) if (e.alive) e.update();
    // remove dead enemies (after a frame so explosion can show)
    game.enemies = game.enemies.filter(e => {
      if (!e.alive) game.enemiesOnField = Math.max(0, game.enemiesOnField - 1);
      return e.alive;
    });
    for (const b of game.bullets) if (!b.dead) b.update();
    game.bullets = game.bullets.filter(b => !b.dead);
    for (const pu of game.powerups) if (!pu.dead) pu.update();
    game.powerups = game.powerups.filter(pu => !pu.dead);
    for (const pp of game.popups) if (!pp.dead) pp.update();
    game.popups = game.popups.filter(pp => !pp.dead);
    if (game.stageIntroTimer > 0) game.stageIntroTimer--;
    spawnEnemyIfReady();
    checkStageClear();
    if (game.stageClearTimer > 0) {
      game.stageClearTimer--;
      if (game.stageClearTimer === 0) nextStage();
    }
  } else if (game.state === STATE.GAME_OVER) {
    game.gameOverTimer--;
    if (game.gameOverTimer <= 0) resetGame(true);
  }

  for (const ex of game.explosions) if (!ex.dead) ex.update();
  game.explosions = game.explosions.filter(ex => !ex.dead);

  // Render
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Field background subtle
  ctx.fillStyle = '#080808';
  ctx.fillRect(FIELD_OFFSET_X, FIELD_OFFSET_Y, STAGE_W*TILE, STAGE_H*TILE);

  let shakeX = 0, shakeY = 0;
  if (game.shake > 0) { shakeX = (Math.random()-0.5)*4; shakeY = (Math.random()-0.5)*4; game.shake--; }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawField();
  for (const pu of game.powerups) pu.draw();
  if (game.player && game.player.alive) game.player.draw();
  for (const e of game.enemies) if (e.alive) e.draw();
  for (const b of game.bullets) b.draw();
  drawGrassOverlay();
  for (const ex of game.explosions) ex.draw();
  for (const pp of game.popups) pp.draw();
  if (game.stageIntroTimer > 0 && game.state === STATE.PLAYING) {
    const alpha = game.stageIntroTimer > 30 ? 0.7 : (game.stageIntroTimer/30)*0.7;
    ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#fcc442'; ctx.font = 'bold 28px "Press Start 2P", monospace'; ctx.textAlign = 'center';
    ctx.fillText('STAGE ' + game.stage, CANVAS_W/2, CANVAS_H/2 - 6);
    ctx.fillStyle = '#80d010'; ctx.font = '12px "Press Start 2P", monospace';
    ctx.fillText('READY', CANVAS_W/2, CANVAS_H/2 + 28);
  }

  ctx.restore();

  // Freeze indicator
  if (game.freezeEnemies > 0) {
    ctx.fillStyle = 'rgba(60, 188, 252, 0.1)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  // Overlays
  if (game.state === STATE.PAUSED) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = C.yellow;
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', CANVAS_W/2, CANVAS_H/2);
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = C.white;
    ctx.fillText('Press P to resume', CANVAS_W/2, CANVAS_H/2 + 30);
  }
  if (game.state === STATE.GAME_OVER) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = C.red;
    ctx.font = '28px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', CANVAS_W/2, CANVAS_H/2);
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = C.white;
    ctx.fillText('Score: ' + game.score, CANVAS_W/2, CANVAS_H/2 + 30);
    ctx.fillText('Press R to restart', CANVAS_W/2, CANVAS_H/2 + 50);
  }
  if (game.stageClearTimer > 0 && game.state === STATE.PLAYING) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = C.lime;
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('STAGE ' + game.stage + ' CLEAR!', CANVAS_W/2, CANVAS_H/2);
  }

  updateHUD();
  requestAnimationFrame(loop);
}

// Start
startBtn.addEventListener('click', () => { Audio.init(); startGame(); });
window.addEventListener('keydown', e => {
  if (game.state === STATE.TITLE && (e.code === 'Enter' || e.code === 'Space')) { Audio.init(); startGame(); }
});

// Kick off
requestAnimationFrame(loop);

})();
