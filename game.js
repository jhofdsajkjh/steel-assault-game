const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hud = {
  lives: document.getElementById("lives"),
  score: document.getElementById("score"),
  enemies: document.getElementById("enemies"),
  wave: document.getElementById("wave"),
};

const TILE = 32;
const ROWS = canvas.height / TILE;
const COLS = canvas.width / TILE;
const PLAYER_SPEED = 170;
const ENEMY_SPEED = 90;
const BULLET_SPEED = 360;
const PLAYER_FIRE_DELAY = 280;
const ENEMY_FIRE_DELAY = 850;

const keys = new Set();

const levelRows = [
  "##########################",
  "#....B.............B.....#",
  "#.####.#####.###.#####.#.#",
  "#......#...#...#.....#.#.#",
  "#.##.#.#.#.###.###.#.#.#.#",
  "#....#...#...#.....#...#.#",
  "######.#####.##########..#",
  "#....#.....#.....B.......#",
  "#.##.#####.#####.######.##",
  "#.#.............#........#",
  "#.#.####.###.##.#.######.#",
  "#...#..B.#...##...#......#",
  "###.#.####.########.###..#",
  "#.............#..........#",
  "#.######.###..#..###.#####",
  "#........#....#....#.....#",
  "#.######.#.#######.#.###.#",
  "#......#.#.....B...#.#...#",
];

const tileMap = levelRows.map((row) => row.split(""));

const directionVectors = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const enemySpawns = [
  { x: TILE * 1.5, y: TILE * 1.5 },
  { x: TILE * 12.5, y: TILE * 1.5 },
  { x: TILE * 24.5, y: TILE * 1.5 },
];

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getWalls() {
  const walls = [];
  const bricks = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = tileMap[row][col];
      if (cell === "#") {
        walls.push({ x: col * TILE, y: row * TILE, width: TILE, height: TILE });
      } else if (cell === "B") {
        bricks.push({
          x: col * TILE,
          y: row * TILE,
          width: TILE,
          height: TILE,
          hp: 2,
          row,
          col,
        });
      }
    }
  }
  return { walls, bricks };
}

function makeTank(x, y, color, speed, controls) {
  return {
    x,
    y,
    width: 26,
    height: 26,
    color,
    speed,
    direction: "up",
    turretFlash: 0,
    controls,
    lastShot: 0,
    alive: true,
    changeDirectionAt: 0,
  };
}

function makeBullet(owner, x, y, direction, friendly) {
  const vector = directionVectors[direction];
  return {
    owner,
    x,
    y,
    width: 6,
    height: 6,
    direction,
    vx: vector.x * BULLET_SPEED,
    vy: vector.y * BULLET_SPEED,
    friendly,
    alive: true,
  };
}

function resetBricks(bricks) {
  for (const brick of bricks) {
    tileMap[brick.row][brick.col] = "B";
  }
}

const game = {
  walls: [],
  bricks: [],
  bullets: [],
  enemies: [],
  player: null,
  score: 0,
  wave: 1,
  lives: 3,
  enemyBudget: 6,
  enemySpawnTimer: 0,
  base: { x: canvas.width / 2 - 22, y: canvas.height - 40, width: 44, height: 24, alive: true },
  state: "playing",
  message: "",
  lastTime: 0,
};

function setupGame() {
  const mapState = getWalls();
  game.walls = mapState.walls;
  game.bricks = mapState.bricks;
  game.bullets = [];
  game.enemies = [];
  game.score = 0;
  game.wave = 1;
  game.lives = 3;
  game.enemyBudget = 6;
  game.enemySpawnTimer = 0;
  game.player = makeTank(canvas.width / 2 - 13, canvas.height - 78, "#79f0d9", PLAYER_SPEED, "player");
  game.base.alive = true;
  game.state = "playing";
  game.message = "";
  game.lastTime = performance.now();
  resetBricks(game.bricks);
  updateHud();
}

function restartLevel(keepScore = true) {
  const score = keepScore ? game.score : 0;
  const wave = keepScore ? game.wave : 1;
  const lives = keepScore ? game.lives : 3;
  const enemyBudget = Math.max(6, 5 + wave * 2);

  const mapState = getWalls();
  game.walls = mapState.walls;
  game.bricks = mapState.bricks;
  game.bullets = [];
  game.enemies = [];
  game.player = makeTank(canvas.width / 2 - 13, canvas.height - 78, "#79f0d9", PLAYER_SPEED, "player");
  game.base.alive = true;
  game.score = score;
  game.wave = wave;
  game.lives = lives;
  game.enemyBudget = enemyBudget;
  game.enemySpawnTimer = 1200;
  game.state = "playing";
  game.message = "";
  resetBricks(game.bricks);
  updateHud();
}

function updateHud() {
  hud.lives.textContent = String(game.lives);
  hud.score.textContent = String(game.score);
  hud.enemies.textContent = String(game.enemies.length + game.enemyBudget);
  hud.wave.textContent = String(game.wave);
}

function collidesWithMap(rect) {
  for (const wall of game.walls) {
    if (rectsOverlap(rect, wall)) {
      return true;
    }
  }

  for (const brick of game.bricks) {
    if (brick.hp > 0 && rectsOverlap(rect, brick)) {
      return true;
    }
  }

  return false;
}

function collidesWithTank(rect, tank) {
  return tank.alive && rectsOverlap(rect, tank);
}

function moveTank(tank, dx, dy, delta) {
  if (!tank.alive) {
    return;
  }

  const next = {
    x: clamp(tank.x + dx * tank.speed * delta, 0, canvas.width - tank.width),
    y: clamp(tank.y + dy * tank.speed * delta, 0, canvas.height - tank.height),
    width: tank.width,
    height: tank.height,
  };

  if (dx !== 0 && !collidesWithMap({ ...tank, x: next.x })) {
    let blocked = false;
    const testers = tank.controls === "player" ? game.enemies : [game.player];
    for (const other of testers) {
      if (other !== tank && other.alive && rectsOverlap({ ...tank, x: next.x }, other)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      tank.x = next.x;
    }
  }

  if (dy !== 0 && !collidesWithMap({ ...tank, y: next.y })) {
    let blocked = false;
    const testers = tank.controls === "player" ? game.enemies : [game.player];
    for (const other of testers) {
      if (other !== tank && other.alive && rectsOverlap({ ...tank, y: next.y }, other)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      tank.y = next.y;
    }
  }
}

function shoot(tank, now, friendly) {
  const cooldown = friendly ? PLAYER_FIRE_DELAY : ENEMY_FIRE_DELAY;
  if (now - tank.lastShot < cooldown || !tank.alive) {
    return;
  }

  tank.lastShot = now;
  tank.turretFlash = 0.08;
  const dir = directionVectors[tank.direction];
  const bulletX = tank.x + tank.width / 2 - 3 + dir.x * 18;
  const bulletY = tank.y + tank.height / 2 - 3 + dir.y * 18;
  game.bullets.push(makeBullet(tank, bulletX, bulletY, tank.direction, friendly));
}

function damageBrick(brick) {
  brick.hp -= 1;
  if (brick.hp <= 0) {
    tileMap[brick.row][brick.col] = ".";
  }
}

function killEnemy(enemy) {
  enemy.alive = false;
  game.score += 120;
}

function killPlayer() {
  game.lives -= 1;
  if (game.lives <= 0) {
    game.player.alive = false;
    game.state = "gameover";
    game.message = "The base fell. Battle over.";
  } else {
    game.player = makeTank(canvas.width / 2 - 13, canvas.height - 78, "#79f0d9", PLAYER_SPEED, "player");
  }
}

function nextWave() {
  game.wave += 1;
  game.enemyBudget = 5 + game.wave * 2;
  restartLevel(true);
}

function spawnEnemy() {
  if (game.enemyBudget <= 0 || game.enemies.length >= 4) {
    return;
  }
  const spawn = enemySpawns[Math.floor(Math.random() * enemySpawns.length)];
  const enemy = makeTank(spawn.x - 13, spawn.y - 13, "#ff7a59", ENEMY_SPEED + game.wave * 4, "enemy");
  enemy.direction = ["down", "left", "right"][Math.floor(Math.random() * 3)];

  if (collidesWithMap(enemy) || collidesWithTank(enemy, game.player)) {
    return;
  }

  game.enemies.push(enemy);
  game.enemyBudget -= 1;
}

function updatePlayer(delta, now) {
  const player = game.player;
  if (!player.alive) {
    return;
  }

  let dx = 0;
  let dy = 0;

  if (keys.has("ArrowUp") || keys.has("KeyW")) {
    dy = -1;
    player.direction = "up";
  } else if (keys.has("ArrowDown") || keys.has("KeyS")) {
    dy = 1;
    player.direction = "down";
  }

  if (keys.has("ArrowLeft") || keys.has("KeyA")) {
    dx = -1;
    player.direction = "left";
  } else if (keys.has("ArrowRight") || keys.has("KeyD")) {
    dx = 1;
    player.direction = "right";
  }

  if (dx !== 0 && dy !== 0) {
    const scale = Math.SQRT1_2;
    dx *= scale;
    dy *= scale;
  }

  moveTank(player, dx, dy, delta);

  if (keys.has("Space")) {
    shoot(player, now, true);
  }
}

function pickEnemyDirection(enemy) {
  const options = ["up", "down", "left", "right"];
  enemy.direction = options[Math.floor(Math.random() * options.length)];
  enemy.changeDirectionAt = performance.now() + 700 + Math.random() * 1200;
}

function updateEnemies(delta, now) {
  for (const enemy of game.enemies) {
    if (!enemy.alive) {
      continue;
    }

    if (now > enemy.changeDirectionAt) {
      pickEnemyDirection(enemy);
    }

    const player = game.player;
    const alignX = Math.abs(player.x - enemy.x) < 22;
    const alignY = Math.abs(player.y - enemy.y) < 22;

    if (alignX) {
      enemy.direction = player.y < enemy.y ? "up" : "down";
    } else if (alignY) {
      enemy.direction = player.x < enemy.x ? "left" : "right";
    }

    const vec = directionVectors[enemy.direction];
    const before = { x: enemy.x, y: enemy.y };
    moveTank(enemy, vec.x, vec.y, delta);

    if (enemy.x === before.x && enemy.y === before.y) {
      pickEnemyDirection(enemy);
    }

    if (Math.random() < 0.012 || alignX || alignY) {
      shoot(enemy, now, false);
    }
  }

  game.enemies = game.enemies.filter((enemy) => enemy.alive);
}

function updateBullets(delta) {
  for (const bullet of game.bullets) {
    if (!bullet.alive) {
      continue;
    }

    bullet.x += bullet.vx * delta;
    bullet.y += bullet.vy * delta;

    if (
      bullet.x < -bullet.width ||
      bullet.y < -bullet.height ||
      bullet.x > canvas.width ||
      bullet.y > canvas.height
    ) {
      bullet.alive = false;
      continue;
    }

    for (const wall of game.walls) {
      if (rectsOverlap(bullet, wall)) {
        bullet.alive = false;
        break;
      }
    }

    if (!bullet.alive) {
      continue;
    }

    for (const brick of game.bricks) {
      if (brick.hp > 0 && rectsOverlap(bullet, brick)) {
        bullet.alive = false;
        damageBrick(brick);
        break;
      }
    }

    if (!bullet.alive) {
      continue;
    }

    if (!bullet.friendly && game.player.alive && rectsOverlap(bullet, game.player)) {
      bullet.alive = false;
      killPlayer();
      continue;
    }

    if (bullet.friendly) {
      for (const enemy of game.enemies) {
        if (enemy.alive && rectsOverlap(bullet, enemy)) {
          bullet.alive = false;
          killEnemy(enemy);
          break;
        }
      }
    }

    if (!bullet.alive) {
      continue;
    }

    if (game.base.alive && rectsOverlap(bullet, game.base)) {
      bullet.alive = false;
      game.base.alive = false;
      game.state = "gameover";
      game.message = "The base was destroyed. Mission failed.";
    }
  }

  game.bullets = game.bullets.filter((bullet) => bullet.alive);
}

function update(delta, now) {
  if (game.state !== "playing") {
    return;
  }

  game.enemySpawnTimer -= delta * 1000;
  if (game.enemySpawnTimer <= 0) {
    spawnEnemy();
    game.enemySpawnTimer = Math.max(800, 1700 - game.wave * 60);
  }

  updatePlayer(delta, now);
  updateEnemies(delta, now);
  updateBullets(delta);

  if (game.player.turretFlash > 0) {
    game.player.turretFlash -= delta;
  }

  for (const enemy of game.enemies) {
    if (enemy.turretFlash > 0) {
      enemy.turretFlash -= delta;
    }
  }

  if (game.enemyBudget === 0 && game.enemies.length === 0) {
    game.state = "victory";
    game.message = "Wave cleared. Press R for the next assault.";
  }

  updateHud();
}

function drawTileField() {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = col * TILE;
      const y = row * TILE;

      ctx.fillStyle = (row + col) % 2 === 0 ? "#19242c" : "#162128";
      ctx.fillRect(x, y, TILE, TILE);

      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.strokeRect(x, y, TILE, TILE);
    }
  }

  for (const wall of game.walls) {
    ctx.fillStyle = "#3f4e58";
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    ctx.fillStyle = "#61717e";
    ctx.fillRect(wall.x + 4, wall.y + 4, wall.width - 8, wall.height - 8);
  }

  for (const brick of game.bricks) {
    if (brick.hp <= 0) {
      continue;
    }
    ctx.fillStyle = brick.hp === 2 ? "#c96c3e" : "#8f4d29";
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.moveTo(brick.x, brick.y + brick.height / 2);
    ctx.lineTo(brick.x + brick.width, brick.y + brick.height / 2);
    ctx.moveTo(brick.x + brick.width / 2, brick.y);
    ctx.lineTo(brick.x + brick.width / 2, brick.y + brick.height);
    ctx.stroke();
  }
}

function drawTank(tank) {
  if (!tank.alive) {
    return;
  }

  ctx.save();
  ctx.translate(tank.x + tank.width / 2, tank.y + tank.height / 2);
  const rotations = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
  ctx.rotate(rotations[tank.direction]);

  ctx.fillStyle = tank.color;
  ctx.fillRect(-13, -13, 26, 26);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.fillRect(-8, -8, 16, 16);
  ctx.fillStyle = "#0f1720";
  ctx.fillRect(-4, -22, 8, 22);
  ctx.fillStyle = tank.turretFlash > 0 ? "#ffe082" : "#24313c";
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBullets() {
  for (const bullet of game.bullets) {
    ctx.fillStyle = bullet.friendly ? "#ffe082" : "#ff8a65";
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
  }
}

function drawBase() {
  ctx.fillStyle = game.base.alive ? "#f7b733" : "#a94442";
  ctx.fillRect(game.base.x, game.base.y, game.base.width, game.base.height);
  ctx.fillStyle = "#182127";
  ctx.fillRect(game.base.x + 10, game.base.y + 6, 24, 12);
}

function drawOverlay() {
  if (game.state === "playing") {
    return;
  }

  ctx.fillStyle = "rgba(5, 8, 14, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f2f3ef";
  ctx.font = '900 36px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';
  ctx.fillText(game.state === "victory" ? "WAVE CLEAR" : "GAME OVER", canvas.width / 2, canvas.height / 2 - 18);
  ctx.font = '500 20px "Microsoft YaHei UI", "Segoe UI", sans-serif';
  ctx.fillStyle = "#ced4d3";
  ctx.fillText(game.message, canvas.width / 2, canvas.height / 2 + 20);
  ctx.fillStyle = "#f7b733";
  ctx.fillText("Press R to continue", canvas.width / 2, canvas.height / 2 + 56);
}

function draw() {
  drawTileField();
  drawBase();
  drawTank(game.player);
  for (const enemy of game.enemies) {
    drawTank(enemy);
  }
  drawBullets();
  drawOverlay();
}

function loop(now) {
  const delta = Math.min((now - game.lastTime) / 1000, 0.03);
  game.lastTime = now;

  update(delta, now);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyR"].includes(event.code)) {
    event.preventDefault();
  }

  keys.add(event.code);

  if (event.code === "KeyR") {
    if (game.state === "victory") {
      nextWave();
    } else {
      restartLevel(false);
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

setupGame();
requestAnimationFrame(loop);
