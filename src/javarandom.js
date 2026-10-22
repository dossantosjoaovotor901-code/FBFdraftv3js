'use strict';
// Reimplementacao do java.util.Random (LCG de 48 bits).
// As habilidades de cada carta sao sorteadas com semente = id da carta; usar o MESMO
// gerador do Java garante que toda carta continue com as mesmas habilidades de antes.
const MASK48 = (1n << 48n) - 1n;
const MULT = 0x5DEECE66Dn;

class JavaRandom {
  constructor(seed) {
    this.seed = (BigInt.asUintN(64, BigInt(seed)) ^ MULT) & MASK48;
  }
  next(bits) {
    this.seed = (this.seed * MULT + 0xBn) & MASK48;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }
  nextInt(bound) {
    if (bound <= 0) throw new Error('bound must be positive');
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    let bits, val;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) > 2147483647);
    return val;
  }
  nextDouble() {
    return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
  }
}

/** String.hashCode() do Java (int de 32 bits). */
function javaHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

/** Equivalente a CardLogic.seeded(p, salt) do backend Java. */
function seededFor(id, name, salt) {
  const idv = id == null ? BigInt(javaHash(String(name == null ? '?' : name))) : BigInt(id);
  const w = (x) => BigInt.asIntN(64, x);
  let z = w(w((idv + 0x9E3779B97F4A7C15n) * 0xBF58476D1CE4E5B9n) ^ w(BigInt(salt) * 0x94D049BB133111EBn));
  z = w(z ^ (BigInt.asUintN(64, z) >> 31n));
  z = w(z * 0x94D049BB133111EBn);
  z = w(z ^ (BigInt.asUintN(64, z) >> 29n));
  return new JavaRandom(z);
}

module.exports = { JavaRandom, javaHash, seededFor };
