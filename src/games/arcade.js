export function freshRunner() { return { time: 0, y: 0, velocity: 0, obstacles: [{ x: 670, width: 25, height: 40 }], score: 0, over: false, spawn: 1.5 }; }
export function stepRunner(s, delta, jump, random = Math.random) {
  if (s.over) return s;
  const dt = Math.min(.035, Math.max(0, delta)), speed = 235 + Math.min(100, s.time * 3);
  let velocity = jump && s.y === 0 ? 510 : s.velocity;
  velocity -= 1450 * dt;
  const y = Math.max(0, s.y + velocity * dt);
  if (!y) velocity = 0;
  let obstacles = s.obstacles.map((o) => ({ ...o, x: o.x - speed * dt })).filter((o) => o.x > -50);
  let spawn = s.spawn - dt;
  if (spawn <= 0) { obstacles.push({ x: 660, width: 23, height: 32 + random() * 20 }); spawn = 1.25 + random() * .7; }
  const over = obstacles.some((o) => o.x < 98 && o.x + o.width > 66 && y < o.height - 3);
  return { time: s.time + dt, y, velocity, obstacles, spawn, score: Math.floor((s.time + dt) * 10), over };
}
export function freshFlight() { return { time: 0, y: 150, velocity: 0, pipes: [{ x: 650, gap: 150, counted: false }], score: 0, over: false, spawn: 1.8 }; }
export function stepFlight(s, delta, flap, random = Math.random) {
  if (s.over) return s;
  const dt = Math.min(.035, Math.max(0, delta));
  const velocity = flap ? -240 : s.velocity + 680 * dt;
  const y = s.y + velocity * dt;
  let score = s.score, pipes = s.pipes.map((p) => { const x = p.x - 160 * dt; if (!p.counted && x + 35 < 85) score++; return { ...p, x, counted: p.counted || x + 35 < 85 }; }).filter((p) => p.x > -40);
  let spawn = s.spawn - dt;
  if (spawn <= 0) { pipes.push({ x: 650, gap: 85 + random() * 120, counted: false }); spawn = 1.9; }
  const over = y < 10 || y > 290 || pipes.some((p) => p.x < 103 && p.x + 35 > 77 && (y - 10 < p.gap - 65 || y + 10 > p.gap + 65));
  return { time: s.time + dt, y, velocity, pipes, spawn, score, over };
}
export function shuffledPairs(random = Math.random) {
  const values = [0,1,2,3,4,5,0,1,2,3,4,5];
  for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; }
  return values;
}
