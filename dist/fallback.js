export function startFallbackOcean() {
  const loading = document.querySelector('#loading');
  loading?.remove();

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-label', '可駕駛船隻的動態海面');
  document.querySelector('#app').append(canvas);
  const context = canvas.getContext('2d');
  const speedReadout = document.querySelector('#speed');
  const keys = new Set();
  let width = 0, height = 0, last = performance.now(), time = 0, speed = 0, heading = 0, freeCamera = false;

  function resize() {
    const ratio = Math.min(devicePixelRatio, 2);
    width = innerWidth; height = innerHeight;
    canvas.width = width * ratio; canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  addEventListener('resize', resize); resize();
  addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase(); keys.add(key);
    if (key === 'c') freeCamera = !freeCamera;
    if (key === 'r') { speed = 0; heading = 0; }
  });
  addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());

  function wave(x, y, scale = 1) {
    return (Math.sin(x * .018 + time * 1.4) + Math.sin(x * .041 - time * .82) * .5 + Math.sin(x * .009 + time * .45) * .7) * scale;
  }
  function drawBoat(x, y, size) {
    context.save(); context.translate(x, y); context.rotate(heading * .42);
    context.fillStyle = '#2b100a'; context.beginPath(); context.moveTo(-size*.42, size*.23); context.lineTo(size*.42, size*.23); context.lineTo(size*.26, -size*.55); context.lineTo(-size*.26, -size*.55); context.closePath(); context.fill();
    context.fillStyle = '#81401c'; context.beginPath(); context.moveTo(-size*.35, size*.15); context.lineTo(size*.35, size*.15); context.lineTo(size*.2, -size*.62); context.lineTo(-size*.2, -size*.62); context.closePath(); context.fill();
    context.fillStyle = '#eee0b9'; context.fillRect(-size*.19, -size*.25, size*.38, size*.38);
    context.fillStyle = '#10222e'; context.fillRect(-size*.14, -size*.21, size*.28, size*.18);
    context.restore();
  }
  function frame(now) {
    const delta = Math.min((now - last) / 1000, .05); last = now; time += delta;
    if (keys.has('w')) speed += delta * 3.1;
    if (keys.has('s')) speed -= delta * 2.4;
    speed *= Math.pow(.48, delta); speed = Math.max(-4, Math.min(12, speed));
    const turn = (keys.has('a') ? 1 : 0) - (keys.has('d') ? 1 : 0);
    heading += turn * delta * (.6 + Math.abs(speed) * .08) * Math.sign(speed || 1);

    const horizon = height * (freeCamera ? .38 : .34);
    const sky = context.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#74b9d5'); sky.addColorStop(1, '#cbe6df'); context.fillStyle = sky; context.fillRect(0, 0, width, horizon);
    const sea = context.createLinearGradient(0, horizon, 0, height);
    sea.addColorStop(0, '#2e7296'); sea.addColorStop(.35, '#0e496c'); sea.addColorStop(1, '#062945'); context.fillStyle = sea; context.fillRect(0, horizon, width, height - horizon);
    for (let row = 0; row < 38; row++) {
      const p = row / 38, y = horizon + p * p * (height - horizon), amplitude = 1 + p * 12;
      context.beginPath(); context.moveTo(0, y + wave(0, p, amplitude));
      for (let x = 0; x <= width; x += 12) context.lineTo(x, y + wave(x, p, amplitude));
      context.strokeStyle = `rgba(160,230,245,${.08 + p*.18})`; context.lineWidth = 1 + p * 1.2; context.stroke();
    }
    const glow = context.createRadialGradient(width*.18, horizon + height*.12, 0, width*.18, horizon + height*.12, width*.42);
    glow.addColorStop(0, 'rgba(255,247,194,.32)'); glow.addColorStop(1, 'rgba(255,247,194,0)'); context.fillStyle = glow; context.fillRect(0, horizon, width, height-horizon);
    context.globalAlpha = .18 + Math.min(Math.abs(speed) / 30, .22); context.fillStyle = '#d6f7ff'; context.beginPath(); context.moveTo(width*.5-12, height); context.lineTo(width*.5+12, height); context.lineTo(width*.5+3, height*.72); context.lineTo(width*.5-3, height*.72); context.closePath(); context.fill(); context.globalAlpha = 1;
    drawBoat(width*.5, height*.74, Math.min(width, height) * .14);
    speedReadout.textContent = Math.abs(speed * 1.94).toFixed(1);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
