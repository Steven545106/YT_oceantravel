// Raindrops (and sea spray) on the "camera lens": a transparent canvas over the game. Drops gather while it rains, swell, slide down and dry off.
import { quality } from './quality.js';

const rand = (a, b) => a + Math.random() * (b - a);

export function createLensFx() {
  const canvas = document.createElement('canvas');
  canvas.className = 'lens-fx';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  let dpr = 1, width = 0, height = 0;
  const resize = () => { dpr = Math.min(2, devicePixelRatio || 1); width = innerWidth; height = innerHeight; canvas.width = width * dpr; canvas.height = height * dpr; };
  resize(); addEventListener('resize', resize);
  const drops = [];
  let spawnDebt = 0, painted = false;

  function spawn(radiusScale = 1) {
    drops.push({ x: rand(0, width), y: rand(-.02, .9) * height, r: rand(2.5, 8) * radiusScale, life: rand(7, 16), age: 0, slide: Math.random() < .3 ? rand(14, 60) : rand(0, 4), vy: 0, trail: [] });
  }
  return {
    update(delta, { rain, spray, topDown }) {
      if (topDown) { if (drops.length || painted) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); drops.length = 0; painted = false; } return; }
      const intensity = Math.min(1, rain);
      spawnDebt += (intensity * 16 + spray * 25) * delta * quality.particles;
      // nothing on the lens and nothing new: leave the (already clear) canvas alone instead of wiping it every frame
      if (!drops.length && spawnDebt < 1) { if (painted) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); painted = false; } return; }
      painted = true;
      while (spawnDebt >= 1 && drops.length < 90 * quality.particles) { spawnDebt--; spawn(spray > intensity ? 1.1 : 1); }
      spawnDebt = Math.min(spawnDebt, 3);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const dry = intensity < .05 ? 2.2 : 1;
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.age += delta * dry;
        if (d.age >= d.life || d.y > height + 20) { drops.splice(i, 1); continue; }
        // heavy drops slide down in jerks, leaving a thin wet trail
        const wet = Math.min(1, d.r / 8);
        if (d.slide > 0 && d.age > 1.2) { d.vy += (d.slide * wet - d.vy) * Math.min(1, delta * 1.5); if (Math.random() < delta * 1.5) d.vy *= .2; d.y += d.vy * delta; d.trail.push([d.x, d.y]); if (d.trail.length > 24) d.trail.shift(); d.r = Math.max(1.6, d.r - delta * .25); }
        const alpha = Math.min(1, (d.life - d.age) / 2.5) * Math.min(1, d.age / .15);
        if (d.trail.length > 1) {
          ctx.beginPath(); ctx.moveTo(d.trail[0][0], d.trail[0][1]);
          for (const [x, y] of d.trail) ctx.lineTo(x, y);
          ctx.strokeStyle = `rgba(220,240,255,${.1 * alpha})`; ctx.lineWidth = Math.max(1, d.r * .45); ctx.lineCap = 'round'; ctx.stroke();
        }
        // a drop: slightly darker rim, bright refraction, tiny highlight
        const g = ctx.createRadialGradient(d.x - d.r * .25, d.y - d.r * .3, d.r * .1, d.x, d.y, d.r * 1.1);
        g.addColorStop(0, `rgba(235,246,255,${.5 * alpha})`); g.addColorStop(.6, `rgba(170,200,225,${.22 * alpha})`); g.addColorStop(1, `rgba(20,40,60,${.35 * alpha})`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * .86, d.r * 1.08, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${.7 * alpha})`; ctx.beginPath(); ctx.arc(d.x - d.r * .28, d.y - d.r * .34, Math.max(.7, d.r * .17), 0, Math.PI * 2); ctx.fill();
      }
    }
  };
}
