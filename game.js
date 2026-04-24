const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const hud = {
  lives: document.getElementById("lives"),
  score: document.getElementById("score"),
  enemies: document.getElementById("enemies"),
  wave: document.getElementById("wave"),
  armor: document.getElementById("armor"),
  weapon: document.getElementById("weapon"),
  eventLog: document.getElementById("eventLog"),
  startButton: document.getElementById("startButton"),
  restartButton: document.getElementById("restartButton"),
};

const TILE = 32;
const ROWS = canvas.height / TILE;
const COLS = canvas.width / TILE;
const PLAYER_SPEED = 178;
const ENEMY_SPEED = 92;
const BOSS_SPEED = 70;
const BULLET_SPEED = 380;
const PLAYER_FIRE_DELAY = 280;
const RAPID_FIRE_DELAY = 140;
const ENEMY_FIRE_DELAY = 860;
const PLAYER_SPAWN = {
  x: canvas.width / 2 - 13,
  y: canvas.height - 96,
};

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

const directionVectors = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const pickupColors = {
  shield: "#6bf0b6",
  rapid: "#ffd166",
  repair: "#8ec5ff",
};

const pickupLabels = {
  shield: "护盾",
  rapid: "速射",
  repair: "修复",
};

const enemySpawns = [
  { x: TILE * 1.5, y: TILE * 1.5 },
  { x: TILE * 12.5, y: TILE * 1.5 },
  { x: TILE * 24.5, y: TILE * 1.5 },
];

const initialTileMap = levelRows.map((row) => row.split(""));

function cloneTileMap() {
  return initialTileMap.map((row) => [...row]);
}

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

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function makeTank(options) {
  return {
    x: options.x,
    y: options.y,
    width: options.width ?? 26,
    height: options.height ?? 26,
    color: options.color,
    speed: options.speed,
    direction: options.direction ?? "up",
    turretFlash: 0,
    controls: options.controls,
    lastShot: 0,
    alive: true,
    changeDirectionAt: 0,
    hp: options.hp ?? 1,
    maxHp: options.maxHp ?? options.hp ?? 1,
    isBoss: Boolean(options.isBoss),
    armor: options.armor ?? 0,
  };
}

function makeBullet(owner, x, y, direction, friendly, damage = 1) {
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
    damage,
  };
}

function makeExplosion(x, y, color, amount, power) {
  for (let index = 0; index < amount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = randomBetween(40, power);
    game.explosions.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: randomBetween(0.25, 0.6),
      maxLife: randomBetween(0.25, 0.6),
      size: randomBetween(3, 8),
      color,
    });
  }
}

function createLevelData(tileMap) {
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

const game = {
  tileMap: cloneTileMap(),
  walls: [],
  bricks: [],
  bullets: [],
  enemies: [],
  pickups: [],
  explosions: [],
  player: null,
  score: 0,
  wave: 1,
  lives: 3,
  enemyBudget: 0,
  enemySpawnTimer: 0,
  maxActiveEnemies: 4,
  bossWave: false,
  state: "menu",
  message: "",
  eventMessage: "点击“开始任务”或按 Enter 立即出击。",
  lastTime: 0,
  pausePulse: 0,
  runStarted: false,
  base: { x: canvas.width / 2 - 22, y: canvas.height - 40, width: 44, height: 24, alive: true },
};

function playerWeaponLabel() {
  if (game.player.shieldTimer > 0 && game.player.rapidTimer > 0) {
    return "护盾 + 速射";
  }
  if (game.player.shieldTimer > 0) {
    return "护盾强化";
  }
  if (game.player.rapidTimer > 0) {
    return "高速连发";
  }
  return "标准火力";
}

function setEventLog(message) {
  game.eventMessage = message;
  hud.eventLog.textContent = message;
}

function buildPlayer() {
  return {
    ...makeTank({
      x: PLAYER_SPAWN.x,
      y: PLAYER_SPAWN.y,
      color: "#79f0d9",
      speed: PLAYER_SPEED,
      controls: "player",
      hp: 1,
    }),
    shieldTimer: 0,
    rapidTimer: 0,
    armor: 100,
  };
}

function resetBoard() {
  game.tileMap = cloneTileMap();
  const level = createLevelData(game.tileMap);
  game.walls = level.walls;
  game.bricks = level.bricks;
  game.bullets = [];
  game.enemies = [];
  game.pickups = [];
  game.explosions = [];
  game.base.alive = true;
}

function enemyBudgetForWave(wave) {
  return 5 + wave * 2;
}

function beginWave(wave, preserveScore, preserveLives) {
  resetBoard();
  game.wave = wave;
  game.score = preserveScore;
  game.lives = preserveLives;
  game.enemyBudget = enemyBudgetForWave(wave);
  game.enemySpawnTimer = 800;
  game.player = buildPlayer();
  game.player.lastShot = -PLAYER_FIRE_DELAY;
  game.bossWave = wave % 3 === 0;
  game.maxActiveEnemies = game.bossWave ? 3 : 4;

  if (game.bossWave) {
    game.enemyBudget = Math.max(4, wave + 1);
  }

  game.state = "playing";
  game.message = "";
  setEventLog(game.bossWave ? "Boss 波次来袭，准备迎战重装围攻坦克。" : `第 ${wave} 波开始，清空所有敌军坦克。`);
  updateHud();
}

function startGame() {
  game.runStarted = true;
  game.score = 0;
  game.lives = 3;
  beginWave(1, 0, 3);
}

function resetRun() {
  startGame();
}

function nextWave() {
  beginWave(game.wave + 1, game.score, game.lives);
}

function updateHud() {
  const pendingEnemies = game.enemies.filter((enemy) => enemy.alive).length + game.enemyBudget;
  hud.lives.textContent = String(game.lives);
  hud.score.textContent = String(game.score);
  hud.enemies.textContent = String(pendingEnemies);
  hud.wave.textContent = String(game.wave);
  hud.armor.textContent = String(Math.max(0, Math.round(game.player ? game.player.armor : 0)));
  hud.weapon.textContent = game.player ? playerWeaponLabel() : "离线";
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

function moveTank(tank, dx, dy, delta) {
  if (!tank.alive) {
    return;
  }

  const candidateX = clamp(tank.x + dx * tank.speed * delta, 0, canvas.width - tank.width);
  const candidateY = clamp(tank.y + dy * tank.speed * delta, 0, canvas.height - tank.height);

  if (dx !== 0 && !collidesWithMap({ ...tank, x: candidateX })) {
    let blocked = false;
    const testers = tank.controls === "player" ? game.enemies : [game.player];
    for (const other of testers) {
      if (other && other !== tank && other.alive && rectsOverlap({ ...tank, x: candidateX }, other)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      tank.x = candidateX;
    }
  }

  if (dy !== 0 && !collidesWithMap({ ...tank, y: candidateY })) {
    let blocked = false;
    const testers = tank.controls === "player" ? game.enemies : [game.player];
    for (const other of testers) {
      if (other && other !== tank && other.alive && rectsOverlap({ ...tank, y: candidateY }, other)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      tank.y = candidateY;
    }
  }
}

function fireCooldown(tank) {
  if (tank.controls === "player") {
    return tank.rapidTimer > 0 ? RAPID_FIRE_DELAY : PLAYER_FIRE_DELAY;
  }
  return tank.isBoss ? ENEMY_FIRE_DELAY * 0.75 : ENEMY_FIRE_DELAY;
}

function shoot(tank, now, friendly) {
  if (!tank.alive || now - tank.lastShot < fireCooldown(tank)) {
    return;
  }

  tank.lastShot = now;
  tank.turretFlash = 0.1;

  const dir = directionVectors[tank.direction];
  const centerX = tank.x + tank.width / 2 - 3;
  const centerY = tank.y + tank.height / 2 - 3;
  const offset = tank.isBoss ? 24 : 18;
  game.bullets.push(makeBullet(tank, centerX + dir.x * offset, centerY + dir.y * offset, tank.direction, friendly, tank.isBoss ? 18 : 10));

  if (tank.isBoss) {
    if (tank.direction === "up" || tank.direction === "down") {
      game.bullets.push(makeBullet(tank, centerX - 12, centerY + dir.y * offset, tank.direction, friendly, 10));
      game.bullets.push(makeBullet(tank, centerX + 12, centerY + dir.y * offset, tank.direction, friendly, 10));
    } else {
      game.bullets.push(makeBullet(tank, centerX + dir.x * offset, centerY - 12, tank.direction, friendly, 10));
      game.bullets.push(makeBullet(tank, centerX + dir.x * offset, centerY + 12, tank.direction, friendly, 10));
    }
  }
}

function damageBrick(brick, damage) {
  brick.hp -= damage;
  if (brick.hp <= 0) {
    game.tileMap[brick.row][brick.col] = ".";
    makeExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2, "#c96c3e", 6, 110);
  }
}

function maybeSpawnPickup(enemy) {
  const chance = enemy.isBoss ? 1 : 0.28;
  if (Math.random() > chance) {
    return;
  }

  const types = enemy.isBoss ? ["shield", "rapid", "repair"] : ["shield", "rapid", "repair"];
  const type = types[Math.floor(Math.random() * types.length)];
  game.pickups.push({
    x: enemy.x + enemy.width / 2 - 10,
    y: enemy.y + enemy.height / 2 - 10,
    width: 20,
    height: 20,
    type,
    life: 12,
  });
}

function killEnemy(enemy) {
  enemy.alive = false;
  game.score += enemy.isBoss ? 1000 : 140;
  makeExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.isBoss ? "#ff9d57" : "#ff7a59", enemy.isBoss ? 24 : 12, enemy.isBoss ? 180 : 120);
  maybeSpawnPickup(enemy);
  if (enemy.isBoss) {
    setEventLog("Boss 已被摧毁，战场暂时由你掌控。");
  }
}

function inflictPlayerDamage(amount) {
  if (game.player.shieldTimer > 0) {
    game.player.shieldTimer = Math.max(0, game.player.shieldTimer - 1.1);
    setEventLog("护盾吸收了这次冲击。");
    return;
  }

  game.player.armor -= amount;
  if (game.player.armor > 0) {
    setEventLog("装甲受损，继续机动。");
    return;
  }

  game.lives -= 1;
  makeExplosion(game.player.x + game.player.width / 2, game.player.y + game.player.height / 2, "#79f0d9", 18, 150);
  if (game.lives <= 0) {
    game.player.alive = false;
    game.state = "gameover";
    game.message = "你的坦克储备已经耗尽。";
    setEventLog("任务失败，按 R 重新发起挑战。");
    return;
  }

  game.player = buildPlayer();
  game.player.lastShot = -PLAYER_FIRE_DELAY;
  setEventLog(`一辆坦克被击毁，剩余生命 ${game.lives}。`);
}

function spawnEnemy() {
  if (game.enemyBudget <= 0 || game.enemies.filter((enemy) => enemy.alive).length >= game.maxActiveEnemies) {
    return;
  }

  const spawn = enemySpawns[Math.floor(Math.random() * enemySpawns.length)];
  const enemy = game.bossWave && game.enemyBudget === 1
    ? makeTank({
      x: spawn.x - 20,
      y: spawn.y - 20,
      width: 40,
      height: 40,
      color: "#ffb05a",
      speed: BOSS_SPEED,
      controls: "enemy",
      hp: 12 + game.wave * 2,
      maxHp: 12 + game.wave * 2,
      direction: "down",
      isBoss: true,
    })
    : makeTank({
      x: spawn.x - 13,
      y: spawn.y - 13,
      color: "#ff7a59",
      speed: ENEMY_SPEED + game.wave * 4,
      controls: "enemy",
      hp: game.wave >= 4 ? 2 : 1,
      maxHp: game.wave >= 4 ? 2 : 1,
      direction: ["down", "left", "right"][Math.floor(Math.random() * 3)],
    });

  if (collidesWithMap(enemy) || rectsOverlap(enemy, game.player)) {
    return;
  }

  enemy.changeDirectionAt = performance.now() + 800;
  game.enemies.push(enemy);
  game.enemyBudget -= 1;

  if (enemy.isBoss) {
    setEventLog("Boss 坦克已部署，保持持续火力输出。");
  }
}

function updatePlayer(delta, now) {
  const player = game.player;
  if (!player || !player.alive) {
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
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }

  moveTank(player, dx, dy, delta);

  if (keys.has("Space")) {
    shoot(player, now, true);
  }

  player.shieldTimer = Math.max(0, player.shieldTimer - delta);
  player.rapidTimer = Math.max(0, player.rapidTimer - delta);
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
    const alignX = Math.abs(player.x - enemy.x) < (enemy.isBoss ? 32 : 22);
    const alignY = Math.abs(player.y - enemy.y) < (enemy.isBoss ? 32 : 22);

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

    if (Math.random() < (enemy.isBoss ? 0.024 : 0.012) || alignX || alignY) {
      shoot(enemy, now, false);
    }
  }

  game.enemies = game.enemies.filter((enemy) => enemy.alive);
}

function updatePickups(delta) {
  for (const pickup of game.pickups) {
    pickup.life -= delta;
    if (pickup.life <= 0) {
      pickup.dead = true;
      continue;
    }

    if (game.player && rectsOverlap(pickup, game.player)) {
      pickup.dead = true;
      if (pickup.type === "shield") {
        game.player.shieldTimer = 9;
        setEventLog("护盾已激活，可以更大胆推进。");
      } else if (pickup.type === "rapid") {
        game.player.rapidTimer = 9;
        setEventLog("高速连发已装填。");
      } else if (pickup.type === "repair") {
        game.player.armor = Math.min(100, game.player.armor + 40);
        setEventLog("装甲修复完成。");
      }
      makeExplosion(pickup.x + pickup.width / 2, pickup.y + pickup.height / 2, pickupColors[pickup.type], 10, 90);
    }
  }

  game.pickups = game.pickups.filter((pickup) => !pickup.dead);
}

function updateExplosions(delta) {
  for (const particle of game.explosions) {
    particle.life -= delta;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vx *= 0.95;
    particle.vy *= 0.95;
  }

  game.explosions = game.explosions.filter((particle) => particle.life > 0);
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
        makeExplosion(bullet.x, bullet.y, "#62707b", 4, 60);
        break;
      }
    }

    if (!bullet.alive) {
      continue;
    }

    for (const brick of game.bricks) {
      if (brick.hp > 0 && rectsOverlap(bullet, brick)) {
        bullet.alive = false;
        damageBrick(brick, 1);
        break;
      }
    }

    if (!bullet.alive) {
      continue;
    }

    if (!bullet.friendly && game.player.alive && rectsOverlap(bullet, game.player)) {
      bullet.alive = false;
      inflictPlayerDamage(bullet.damage);
      continue;
    }

    if (bullet.friendly) {
      for (const enemy of game.enemies) {
        if (enemy.alive && rectsOverlap(bullet, enemy)) {
          bullet.alive = false;
          enemy.hp -= 1;
          makeExplosion(bullet.x, bullet.y, enemy.isBoss ? "#ffb05a" : "#ff7a59", 6, 80);
          if (enemy.hp <= 0) {
            killEnemy(enemy);
          }
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
      game.message = "基地已被摧毁。";
      setEventLog("基地失守，按 R 重新集结。");
      makeExplosion(game.base.x + game.base.width / 2, game.base.y + game.base.height / 2, "#ff6b57", 22, 180);
    }
  }

  game.bullets = game.bullets.filter((bullet) => bullet.alive);
}

function finishWave() {
  game.state = "waveclear";
  const bonus = 250 + game.wave * 50 + Math.round(game.player.armor);
  game.score += bonus;
  game.message = `第 ${game.wave} 波已肃清，奖励 +${bonus}。`;
  setEventLog("区域清空，按 Enter 进入下一波。");
}

function update(delta, now) {
  game.pausePulse += delta;
  updateExplosions(delta);

  if (game.state !== "playing") {
    updateHud();
    return;
  }

  game.enemySpawnTimer -= delta * 1000;
  if (game.enemySpawnTimer <= 0) {
    spawnEnemy();
    game.enemySpawnTimer = Math.max(700, 1650 - game.wave * 55);
  }

  updatePlayer(delta, now);
  updateEnemies(delta, now);
  updateBullets(delta);
  updatePickups(delta);

  if (game.player.turretFlash > 0) {
    game.player.turretFlash -= delta;
  }

  for (const enemy of game.enemies) {
    if (enemy.turretFlash > 0) {
      enemy.turretFlash -= delta;
    }
  }

  if (game.enemyBudget === 0 && game.enemies.length === 0 && game.state === "playing") {
    finishWave();
  }

  updateHud();
}

function drawTileField() {
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = col * TILE;
      const y = row * TILE;
      ctx.fillStyle = (row + col) % 2 === 0 ? "#17222b" : "#121c23";
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.strokeRect(x, y, TILE, TILE);
    }
  }

  for (const wall of game.walls) {
    ctx.fillStyle = "#43525d";
    ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
    ctx.fillStyle = "#6d7d8a";
    ctx.fillRect(wall.x + 4, wall.y + 4, wall.width - 8, wall.height - 8);
  }

  for (const brick of game.bricks) {
    if (brick.hp <= 0) {
      continue;
    }
    ctx.fillStyle = brick.hp === 2 ? "#cb7444" : "#8d4d2a";
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    ctx.strokeStyle = "rgba(0,0,0,0.26)";
    ctx.beginPath();
    ctx.moveTo(brick.x, brick.y + brick.height / 2);
    ctx.lineTo(brick.x + brick.width, brick.y + brick.height / 2);
    ctx.moveTo(brick.x + brick.width / 2, brick.y);
    ctx.lineTo(brick.x + brick.width / 2, brick.y + brick.height);
    ctx.stroke();
  }
}

function drawTank(tank) {
  if (!tank || !tank.alive) {
    return;
  }

  ctx.save();
  ctx.translate(tank.x + tank.width / 2, tank.y + tank.height / 2);
  const rotations = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
  ctx.rotate(rotations[tank.direction]);

  ctx.fillStyle = tank.color;
  ctx.fillRect(-tank.width / 2, -tank.height / 2, tank.width, tank.height);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(-tank.width / 3.3, -tank.height / 3.3, tank.width / 1.65, tank.height / 1.65);
  ctx.fillStyle = "#0f1720";
  ctx.fillRect(-4, -tank.height / 2 - (tank.isBoss ? 16 : 9), 8, tank.isBoss ? 28 : 22);
  ctx.fillStyle = tank.turretFlash > 0 ? "#ffe082" : "#24313c";
  ctx.beginPath();
  ctx.arc(0, 0, tank.isBoss ? 9 : 6, 0, Math.PI * 2);
  ctx.fill();

  if (tank.isBoss) {
    ctx.strokeStyle = "rgba(255, 224, 130, 0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-tank.width / 2 + 3, -tank.height / 2 + 3, tank.width - 6, tank.height - 6);

    const barWidth = 42;
    const ratio = tank.hp / tank.maxHp;
    ctx.fillStyle = "rgba(5, 8, 14, 0.9)";
    ctx.fillRect(-barWidth / 2, tank.height / 2 + 10, barWidth, 6);
    ctx.fillStyle = "#ff8b63";
    ctx.fillRect(-barWidth / 2, tank.height / 2 + 10, barWidth * ratio, 6);
  }

  if (tank.controls === "player" && tank.shieldTimer > 0) {
    ctx.strokeStyle = "rgba(107, 240, 182, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(tank.width, tank.height) / 1.15 + Math.sin(game.pausePulse * 7) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBullets() {
  for (const bullet of game.bullets) {
    ctx.fillStyle = bullet.friendly ? "#ffe082" : "#ff8a65";
    ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
  }
}

function drawBase() {
  ctx.fillStyle = game.base.alive ? "#f5b93a" : "#a94442";
  ctx.fillRect(game.base.x, game.base.y, game.base.width, game.base.height);
  ctx.fillStyle = "#182127";
  ctx.fillRect(game.base.x + 10, game.base.y + 6, 24, 12);
}

function drawPickups() {
  for (const pickup of game.pickups) {
    ctx.fillStyle = pickupColors[pickup.type];
    ctx.fillRect(pickup.x, pickup.y, pickup.width, pickup.height);
    ctx.fillStyle = "rgba(8, 15, 25, 0.72)";
    ctx.fillRect(pickup.x + 4, pickup.y + 4, pickup.width - 8, pickup.height - 8);
    ctx.fillStyle = pickupColors[pickup.type];
    ctx.font = '700 11px Consolas, "Liberation Mono", monospace';
    ctx.textAlign = "center";
    ctx.fillText(pickupLabels[pickup.type].charAt(0), pickup.x + pickup.width / 2, pickup.y + 14);
  }
}

function drawExplosions() {
  for (const particle of game.explosions) {
    const alpha = particle.life / particle.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTopBanner() {
  ctx.fillStyle = "rgba(5, 8, 14, 0.45)";
  ctx.fillRect(14, 12, 220, 30);
  ctx.fillStyle = "#f6f4ee";
  ctx.font = '700 14px Consolas, "Liberation Mono", monospace';
  ctx.textAlign = "left";
  ctx.fillText(`第 ${game.wave} 波`, 26, 31);
  ctx.fillStyle = game.bossWave ? "#ffb05a" : "#6bf0b6";
  ctx.fillText(game.bossWave ? "BOSS 区域" : "标准突击", 104, 31);
}

function drawOverlay() {
  if (game.state === "playing") {
    return;
  }

  ctx.fillStyle = "rgba(5, 8, 14, 0.72)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f6f4ee";
  ctx.font = '900 42px Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';

  if (game.state === "menu") {
    ctx.fillText("钢铁突击", canvas.width / 2, canvas.height / 2 - 66);
    ctx.font = '500 21px "Microsoft YaHei UI", "Segoe UI", sans-serif';
    ctx.fillStyle = "#d3d7d5";
    ctx.fillText("守住基地，争夺补给，击溃每隔三波出现的 Boss。", canvas.width / 2, canvas.height / 2 - 22);
    ctx.fillText("按 Enter 或点击“开始任务”立即出击。", canvas.width / 2, canvas.height / 2 + 16);
    ctx.fillStyle = "#f5b93a";
    ctx.fillText("操作：WASD / 方向键移动，空格开火。", canvas.width / 2, canvas.height / 2 + 58);
    return;
  }

  if (game.state === "paused") {
    ctx.fillText("已暂停", canvas.width / 2, canvas.height / 2 - 14);
    ctx.font = '500 21px "Microsoft YaHei UI", "Segoe UI", sans-serif';
    ctx.fillStyle = "#d3d7d5";
    ctx.fillText("按 P 返回前线。", canvas.width / 2, canvas.height / 2 + 28);
    return;
  }

  ctx.fillText(game.state === "waveclear" ? "区域肃清" : "任务失败", canvas.width / 2, canvas.height / 2 - 30);
  ctx.font = '500 21px "Microsoft YaHei UI", "Segoe UI", sans-serif';
  ctx.fillStyle = "#d3d7d5";
  ctx.fillText(game.message, canvas.width / 2, canvas.height / 2 + 8);
  ctx.fillStyle = "#f5b93a";
  ctx.fillText(game.state === "waveclear" ? "按 Enter 进入下一波。" : "按 R 开始新的挑战。", canvas.width / 2, canvas.height / 2 + 46);
}

function draw() {
  drawTileField();
  drawBase();
  drawPickups();
  drawTank(game.player);
  for (const enemy of game.enemies) {
    drawTank(enemy);
  }
  drawBullets();
  drawExplosions();
  drawTopBanner();
  drawOverlay();
}

function togglePause() {
  if (game.state === "playing") {
    game.state = "paused";
    setEventLog("战斗模拟已暂停。");
  } else if (game.state === "paused") {
    game.state = "playing";
    setEventLog("重新投入战斗。");
  }
}

function handleEnterAction() {
  if (game.state === "menu") {
    startGame();
  } else if (game.state === "waveclear") {
    nextWave();
  }
}

function loop(now) {
  const delta = Math.min((now - game.lastTime) / 1000, 0.03);
  game.lastTime = now;

  update(delta, now);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "KeyW", "KeyA", "KeyS", "KeyD", "KeyR", "KeyP", "Enter"].includes(event.code)) {
    event.preventDefault();
  }

  keys.add(event.code);

  if (event.code === "KeyR") {
    resetRun();
  }

  if (event.code === "KeyP") {
    togglePause();
  }

  if (event.code === "Enter") {
    handleEnterAction();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

hud.startButton.addEventListener("click", startGame);
hud.restartButton.addEventListener("click", resetRun);

game.player = buildPlayer();
updateHud();
setEventLog(game.eventMessage);
game.lastTime = performance.now();
requestAnimationFrame(loop);
