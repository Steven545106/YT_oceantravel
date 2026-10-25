// Reads Data/coast/outline.bin (written by scripts/build_regions.py write_outline): the list of coast chunks and the
// always-loaded outline islands of each, as zigzag varints after the magic 'RLC1'.
// Each chunk comes back as { id, country, file, islands, bounds, polys, cut }: `polys` are delta-encoded integer rings
// in 1 / `outlineScale` degrees, the same shape as a full-detail chunk file, so one decoder builds both.
export function decodeCoastOutline(buffer, { countries, chunkDegrees, outlineScale }) {
  const bytes = new Uint8Array(buffer);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== 'RLC1') throw new Error('coast/outline.bin: unknown format');
  let offset = 4;
  const next = () => {
    let value = 0, shift = 1, byte;
    do {
      byte = bytes[offset++];
      value += (byte & 127) * shift;
      shift *= 128;
    } while (byte & 128);
    return value % 2 ? -(value + 1) / 2 : value / 2;
  };
  const chunks = new Array(next());
  for (let c = 0; c < chunks.length; c++) {
    const country = countries[next()].code, cx = next(), cy = next(), islands = next();
    const ox = cx * chunkDegrees * outlineScale, oy = cy * chunkDegrees * outlineScale;
    const bounds = [(ox + next()) / outlineScale, (oy + next()) / outlineScale, (ox + next()) / outlineScale, (oy + next()) / outlineScale];
    const polys = new Array(next()), cut = [];
    for (let p = 0; p < polys.length; p++) {
      const header = next(), count = Math.floor(header / 2);
      if (header % 2) cut.push(p);
      const flat = new Array(count * 2);
      for (let i = 0; i < count * 2; i++) flat[i] = next();
      flat[0] += ox;
      flat[1] += oy;
      polys[p] = flat;
    }
    const id = `${country}-${cx}-${cy}`;
    chunks[c] = { id, country, file: `coast/${id}.json`, islands, bounds, polys, cut };
  }
  return chunks;
}
