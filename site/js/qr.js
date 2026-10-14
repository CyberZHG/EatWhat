const QR = (() => {
  const LEVELS = {
    L: {
      bits: 1,
      ecc: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
      blocks: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    },
    M: {
      bits: 0,
      ecc: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
      blocks: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    },
  };

  const rawModules = ver => {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const align = Math.floor(ver / 7) + 2;
      n -= (25 * align - 10) * align - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  };

  const dataCodewords = (ver, lv) => Math.floor(rawModules(ver) / 8) - lv.ecc[ver] * lv.blocks[ver];

  const gfMul = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  };

  function rsDivisor(degree) {
    const out = new Array(degree).fill(0);
    out[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < out.length; j++) {
        out[j] = gfMul(out[j], root);
        if (j + 1 < out.length) out[j] ^= out[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return out;
  }

  function rsRemainder(data, divisor) {
    const out = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ out.shift();
      out.push(0);
      divisor.forEach((coef, i) => { out[i] ^= gfMul(coef, factor); });
    }
    return out;
  }

  function addEcc(data, ver, lv) {
    const numBlocks = lv.blocks[ver];
    const eccLen = lv.ecc[ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const numShort = numBlocks - raw % numBlocks;
    const shortLen = Math.floor(raw / numBlocks);
    const divisor = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, divisor);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => {
        if (i !== shortLen - eccLen || j >= numShort) out.push(b[i]);
      });
    }
    return out;
  }

  function alignPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const out = [6];
    for (let pos = ver * 4 + 10; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  function build(ver, lv, codewords, mask) {
    const size = ver * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => {
      m[y][x] = dark;
      fn[y][x] = true;
    };
    for (let i = 0; i < size; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
        }
      }
    };
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    const align = alignPositions(ver);
    align.forEach((ay, i) => align.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }));
    const drawFormat = msk => {
      const data = (lv.bits << 3) | msk;
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      const bit = i => ((bits >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6));
      set(8, 8, bit(7));
      set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) !== 0;
        const a = size - 11 + i % 3, b = Math.floor(i / 3);
        set(a, b, dark);
        set(b, a, dark);
      }
    }
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const up = ((right + 1) & 2) === 0;
          const y = up ? size - 1 - vert : vert;
          if (!fn[y][x] && i < codewords.length * 8) {
            m[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
    const MASKS = [
      (x, y) => (x + y) % 2 === 0,
      (x, y) => y % 2 === 0,
      x => x % 3 === 0,
      (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
      (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
    ];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
    }
    drawFormat(mask);
    return m;
  }

  function penalty(m) {
    const size = m.length;
    let score = 0, dark = 0;
    for (let a = 0; a < size; a++) {
      let runR = 1, runC = 1;
      for (let b = 0; b < size; b++) {
        if (m[a][b]) dark++;
        if (b > 0) {
          if (m[a][b] === m[a][b - 1]) runR++;
          else runR = 1;
          if (m[b][a] === m[b - 1][a]) runC++;
          else runC = 1;
          if (runR === 5) score += 3;
          else if (runR > 5) score++;
          if (runC === 5) score += 3;
          else if (runC > 5) score++;
        }
        if (a > 0 && b > 0 && m[a][b] === m[a - 1][b] && m[a][b] === m[a][b - 1] && m[a][b] === m[a - 1][b - 1]) score += 3;
      }
    }
    const total = size * size;
    score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return score;
  }

  function encode(bytes, level = 'M') {
    const order = level === 'L' ? ['L'] : [level, 'L'];
    for (const name of order) {
      const lv = LEVELS[name];
      for (let ver = 1; ver <= 40; ver++) {
        const cap = dataCodewords(ver, lv) * 8;
        const ccBits = ver <= 9 ? 8 : 16;
        const need = 4 + ccBits + bytes.length * 8;
        if (need > cap || bytes.length >= 1 << ccBits) continue;
        const bits = [];
        const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
        push(4, 4);
        push(bytes.length, ccBits);
        bytes.forEach(b => push(b, 8));
        push(0, Math.min(4, cap - bits.length));
        push(0, (8 - bits.length % 8) % 8);
        for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
        const data = [];
        for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
        const codewords = addEcc(data, ver, lv);
        let best = null, bestScore = Infinity;
        for (let mask = 0; mask < 8; mask++) {
          const m = build(ver, lv, codewords, mask);
          const s = penalty(m);
          if (s < bestScore) {
            best = m;
            bestScore = s;
          }
        }
        return { modules: best, version: ver, level: name };
      }
    }
    return null;
  }

  function draw(canvas, modules, scale, fg = '#000', bg = '#fff') {
    const quiet = 4;
    const n = modules.length + quiet * 2;
    canvas.width = canvas.height = n * scale;
    const g = canvas.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = fg;
    modules.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) g.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }));
  }

  const capacity = (level = 'L') => dataCodewords(40, LEVELS[level]) - 3;

  return { encode, draw, capacity };
})();
