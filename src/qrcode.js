// Minimal QR encoder: byte mode, ECC level M, versions 1-10.
// Returns { size, modules: boolean[][] }

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gmul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function rsGenPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmul(poly[j], 1);
      next[j + 1] ^= gmul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGenPoly(ecLen);
  const res = new Array(ecLen).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) res[j] ^= gmul(gen[j + 1], factor);
    }
  }
  return res;
}

// [ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] for ECC level M, versions 1-10
const ECM = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

const ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const VERSION_INFO = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

const FORMAT_M = [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0];

function dataCapacityBytes(version) {
  const [ec, b1, d1, b2, d2] = ECM[version];
  return b1 * d1 + b2 * d2;
}

function pickVersion(byteLen) {
  for (let v = 1; v <= 10; v++) {
    const cap = dataCapacityBytes(v);
    const ccBits = v < 10 ? 8 : 16;
    const needBits = 4 + ccBits + byteLen * 8;
    if (needBits <= cap * 8) return v;
  }
  throw new Error('Payload too long for version 10 / ECC M');
}

function utf8Bytes(str) {
  const out = [];
  const enc = new TextEncoder();
  const arr = enc.encode(str);
  for (let i = 0; i < arr.length; i++) out.push(arr[i]);
  return out;
}

function buildCodewords(str) {
  const bytes = utf8Bytes(str);
  const version = pickVersion(bytes.length);
  const [ecLen, b1, d1, b2, d2] = ECM[version];
  const totalData = dataCapacityBytes(version);
  const ccBits = version < 10 ? 8 : 16;

  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, ccBits);
  for (const b of bytes) push(b, 8);

  const capBits = totalData * 8;
  const term = Math.min(4, capBits - bits.length);
  push(0, term);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }
  const pads = [0xec, 0x11];
  let p = 0;
  while (codewords.length < totalData) codewords.push(pads[p++ % 2]);

  // split into blocks
  const blocks = [];
  let pos = 0;
  for (let i = 0; i < b1; i++) {
    blocks.push(codewords.slice(pos, pos + d1));
    pos += d1;
  }
  for (let i = 0; i < b2; i++) {
    blocks.push(codewords.slice(pos, pos + d2));
    pos += d2;
  }
  const ecBlocks = blocks.map((b) => rsEncode(b, ecLen));

  // interleave
  const out = [];
  const maxData = Math.max(d1, d2 || 0);
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.length) out.push(b[i]);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const b of ecBlocks) out.push(b[i]);
  }
  return { version, codewords: out };
}

function buildMatrix(version) {
  const size = version * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

  const setF = (r, c, v) => {
    m[r][c] = v;
    reserved[r][c] = true;
  };

  // finder patterns + separators
  const finder = (row, col) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const inRing =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setF(rr, cc, inRing || inCore ? 1 : 0);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // timing patterns
  for (let i = 8; i < size - 8; i++) {
    setF(6, i, i % 2 === 0 ? 1 : 0);
    setF(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // alignment patterns
  const centers = ALIGN[version];
  const last = size - 7;
  for (const r of centers) {
    for (const c of centers) {
      // omitted only where they would collide with a finder pattern
      if ((r === 6 && c === 6) || (r === 6 && c === last) || (r === last && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setF(r + dr, c + dc, on ? 1 : 0);
        }
      }
    }
  }

  // dark module
  setF(size - 8, 8, 1);

  // reserve format areas
  for (let i = 0; i <= 8; i++) {
    if (!reserved[8][i]) setF(8, i, 0);
    if (!reserved[i][8]) setF(i, 8, 0);
  }
  for (let i = 0; i < 8; i++) {
    if (!reserved[8][size - 1 - i]) setF(8, size - 1 - i, 0);
    if (!reserved[size - 1 - i][8]) setF(size - 1 - i, 8, 0);
  }

  // reserve version info
  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      setF(r, c, 0);
      setF(c, r, 0);
    }
  }

  return { size, m, reserved };
}

function placeData(size, m, reserved, codewords) {
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  const nextBit = () => {
    if (bitIdx >= totalBits) return 0;
    const b = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
    bitIdx++;
    return b;
  };
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const row = up ? size - 1 - i : i;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (!reserved[row][c]) m[row][c] = nextBit();
      }
    }
    up = !up;
  }
}

function maskFn(id, r, c) {
  switch (id) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function penalty(grid, size) {
  let score = 0;
  // rule 1: runs of 5+
  for (let i = 0; i < size; i++) {
    let runR = 1, runC = 1;
    for (let j = 1; j < size; j++) {
      if (grid[i][j] === grid[i][j - 1]) runR++;
      else { if (runR >= 5) score += 3 + (runR - 5); runR = 1; }
      if (grid[j][i] === grid[j - 1][i]) runC++;
      else { if (runC >= 5) score += 3 + (runC - 5); runC = 1; }
    }
    if (runR >= 5) score += 3 + (runR - 5);
    if (runC >= 5) score += 3 + (runC - 5);
  }
  // rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = grid[r][c];
      if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
    }
  }
  // rule 3: finder-like patterns
  const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const match = (arr, pat) => pat.every((v, i) => arr[i] === v);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 11; c++) {
      const row = [];
      for (let k = 0; k < 11; k++) row.push(grid[r][c + k]);
      if (match(row, pat1) || match(row, pat2)) score += 40;
    }
  }
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - 11; r++) {
      const col = [];
      for (let k = 0; k < 11; k++) col.push(grid[r + k][c]);
      if (match(col, pat1) || match(col, pat2)) score += 40;
    }
  }
  // rule 4: dark ratio
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (grid[r][c]) dark++;
  const pct = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

function applyFormat(grid, size, maskId) {
  const fmt = FORMAT_M[maskId];
  for (let i = 0; i < 15; i++) {
    const bit = (fmt >> (14 - i)) & 1;
    // top-left
    if (i < 6) grid[8][i] = bit;
    else if (i === 6) grid[8][7] = bit;
    else if (i === 7) grid[8][8] = bit;
    else if (i === 8) grid[7][8] = bit;
    else grid[14 - i][8] = bit;
    // split copy
    if (i < 7) grid[size - 1 - i][8] = bit;
    else grid[8][size - 15 + i] = bit;
  }
  grid[size - 8][8] = 1;
}

function applyVersionInfo(grid, size, version) {
  if (version < 7) return;
  const vi = VERSION_INFO[version];
  for (let i = 0; i < 18; i++) {
    const bit = (vi >> i) & 1;
    const r = Math.floor(i / 3);
    const c = size - 11 + (i % 3);
    grid[r][c] = bit;
    grid[c][r] = bit;
  }
}

function encodeQR(text) {
  const { version, codewords } = buildCodewords(text);
  const { size, m, reserved } = buildMatrix(version);
  placeData(size, m, reserved, codewords);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const grid = m.map((row) => row.slice());
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!reserved[r][c] && maskFn(mask, r, c)) grid[r][c] ^= 1;
      }
    }
    applyFormat(grid, size, mask);
    applyVersionInfo(grid, size, version);
    const p = penalty(grid, size);
    if (!best || p < best.p) best = { p, grid, mask };
  }
  return { size, version, mask: best.mask, modules: best.grid.map((r) => r.map((v) => !!v)) };
}

export { encodeQR };
