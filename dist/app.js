(() => {
  document.querySelector('#loading')?.remove();
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', '可駕駛船隻的動態海面');
  document.querySelector('#app').append(canvas);
  const ctx = canvas.getContext('2d');
  const speedReadout = document.querySelector('#speed');
  const keys = new Set();
  let width = 0, height = 0, last = performance.now(), time = 0, speed = 0, heading = 0, wideView = false, animationFrame = 0;

  function resize() {
    const ratio = Math.min(devicePixelRatio, 2);
    width = innerWidth; height = innerHeight;
    canvas.width = width * ratio; canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function ripple(x, row, amplitude) {
    return (Math.sin(x * .014 + row * 2.3 + time * 1.18) + Math.sin(x * .034 - row * 4.7 - time * .73) * .38 + Math.sin(x * .006 + time * .29) * .65) * amplitude;
  }

  function drawBoat(x, y, size) {
    ctx.save();
    ctx.translate(x, y + Math.sin(time * 1.6) * 2);
    ctx.rotate(heading * .34);
    ctx.shadowColor = '#010912'; ctx.shadowBlur = size * .38; ctx.shadowOffsetY = size * .22;
    ctx.fillStyle = '#120a08'; ctx.beginPath();
    ctx.moveTo(-size * .44, size * .18); ctx.lineTo(size * .44, size * .18); ctx.lineTo(size * .27, -size * .57); ctx.lineTo(-size * .27, -size * .57); ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'transparent';
    const hull = ctx.createLinearGradient(0, -size * .62, 0, size * .2);
    hull.addColorStop(0, '#a84a1d'); hull.addColorStop(.62, '#6a2513'); hull.addColorStop(1, '#2a0d0b');
    ctx.fillStyle = hull; ctx.beginPath();
    ctx.moveTo(-size * .36, size * .1); ctx.lineTo(size * .36, size * .1); ctx.lineTo(size * .21, -size * .64); ctx.lineTo(-size * .21, -size * .64); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0dba9'; ctx.fillRect(-size * .17, -size * .3, size * .34, size * .38);
    ctx.fillStyle = '#092737'; ctx.fillRect(-size * .13, -size * .26, size * .26, size * .18);
    ctx.fillStyle = '#c8eeff'; ctx.globalAlpha = .7; ctx.fillRect(-size * .105, -size * .245, size * .21, size * .045); ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawSky(horizon, sunX, sunY) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#06152f'); sky.addColorStop(.46, '#173d64'); sky.addColorStop(.78, '#739ab5'); sky.addColorStop(1, '#e4c59b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, horizon);
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.min(width, height) * .31);
    sunGlow.addColorStop(0, 'rgba(255,247,205,.98)'); sunGlow.addColorStop(.12, 'rgba(255,216,140,.55)'); sunGlow.addColorStop(1, 'rgba(255,190,112,0)');
    ctx.fillStyle = sunGlow; ctx.fillRect(0, 0, width, horizon + height * .2);
    ctx.fillStyle = '#fff5ce'; ctx.beginPath(); ctx.arc(sunX, sunY, Math.max(10, width * .012), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(8,24,43,.28)';
    for (let cloud = 0; cloud < 7; cloud++) {
      const x = ((cloud * 271 + 83) % width) - width * .14;
      const y = horizon * (.14 + (cloud % 3) * .1);
      ctx.beginPath(); ctx.ellipse(x, y, width * .19, height * .024, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawWater(horizon, sunX) {
    const sea = ctx.createLinearGradient(0, horizon, 0, height);
    sea.addColorStop(0, '#345f7d'); sea.addColorStop(.28, '#0a405d'); sea.addColorStop(.7, '#062a43'); sea.addColorStop(1, '#03182d');
    ctx.fillStyle = sea; ctx.fillRect(0, horizon, width, height - horizon);
    const rows = 54;
    for (let row = 0; row < rows; row++) {
      const near = row / (rows - 1);
      const top = horizon + near * near * (height - horizon);
      const bottom = horizon + Math.pow(Math.min(1, near + 1 / rows), 2) * (height - horizon) + 2;
      const amplitude = 1.2 + near * near * 15;
      ctx.beginPath(); ctx.moveTo(0, top + ripple(0, row, amplitude));
      for (let x = 0; x <= width + 15; x += 15) ctx.lineTo(x, top + ripple(x, row, amplitude));
      for (let x = width + 15; x >= 0; x -= 15) ctx.lineTo(x, bottom + ripple(x, row + 1, amplitude * 1.08));
      ctx.closePath();
      ctx.fillStyle = `rgba(${8 + Math.floor(20 * near)}, ${64 + Math.floor(52 * near)}, ${91 + Math.floor(54 * near)}, ${.07 + near * .13})`;
      ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, top + ripple(0, row, amplitude));
      for (let x = 0; x <= width + 15; x += 15) ctx.lineTo(x, top + ripple(x, row, amplitude));
      ctx.strokeStyle = `rgba(154, 221, 232, ${.045 + near * .23})`; ctx.lineWidth = .5 + near * 1.35; ctx.stroke();
    }
    for (let streak = 0; streak < 24; streak++) {
      const depth = (streak + 1) / 25;
      const y = horizon + depth * depth * (height - horizon);
      const halfWidth = 5 + depth * width * .22;
      const shift = Math.sin(time * 1.7 + streak * 3.2) * (4 + depth * 16);
      ctx.strokeStyle = `rgba(255, 231, 166, ${.05 + depth * .17})`; ctx.lineWidth = 1 + depth * 2.6;
      ctx.beginPath(); ctx.moveTo(sunX - halfWidth + shift, y); ctx.lineTo(sunX + halfWidth + shift, y + ripple(sunX, streak, 1.8)); ctx.stroke();
    }
    const foreground = ctx.createLinearGradient(0, height * .68, 0, height);
    foreground.addColorStop(0, 'rgba(0,0,0,0)'); foreground.addColorStop(1, 'rgba(0,12,28,.4)'); ctx.fillStyle = foreground; ctx.fillRect(0, height * .68, width, height * .32);
  }

  function frame(now) {
    const delta = Math.min((now - last) / 1000, .05);
    last = now; time += delta;
    if (keys.has('w')) speed += delta * 3.3;
    if (keys.has('s')) speed -= delta * 2.5;
    speed *= Math.pow(.46, delta); speed = Math.max(-4, Math.min(12, speed));
    const turn = (keys.has('a') ? 1 : 0) - (keys.has('d') ? 1 : 0);
    heading += turn * delta * (.58 + Math.abs(speed) * .09) * Math.sign(speed || 1);
    const horizon = height * (wideView ? .48 : .41);
    const sunX = width * .7 + Math.sin(heading) * width * .07;
    drawSky(horizon, sunX, horizon * .28);
    drawWater(horizon, sunX);
    ctx.globalAlpha = .16 + Math.min(Math.abs(speed) / 25, .24); ctx.fillStyle = '#d7f4fa'; ctx.beginPath();
    ctx.moveTo(width * .5 - 17, height); ctx.lineTo(width * .5 + 17, height); ctx.lineTo(width * .5 + 4, height * .73); ctx.lineTo(width * .5 - 4, height * .73); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
    drawBoat(width * .5, height * .73, Math.min(width, height) * .15);
    speedReadout.textContent = Math.abs(speed * 1.94).toFixed(1);
    animationFrame = requestAnimationFrame(frame);
  }

  addEventListener('resize', resize);
  addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase(); keys.add(key);
    if (key === 'c') wideView = !wideView;
    if (key === 'r') { speed = 0; heading = 0; }
  });
  addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  window.__oceanFallback = {
    canvas,
    stop: () => cancelAnimationFrame(animationFrame)
  };
  resize(); animationFrame = requestAnimationFrame(frame);
})();
