'use strict';

// Reimplementacao FIEL do java.util.Random + do mix de 64 bits usado em
// CardLogic.seeded(). Precisa ser identica para que cada carta (semente = id)
// receba SEMPRE as mesmas habilidades, sem depender do banco.
//
// Toda aritmetica de 64 bits usa BigInt com mascara, imitando o overflow de
// long do Java.

const MASK64 = (1n << 64n) - 1n;
const MASK48 = (1n << 48n) - 1n;
const MULT = 0x5DEECE66Dn;
const ADD = 0xBn;

function toSigned64(v) {
  v &= MASK64;
  return v >= (1n << 63n) ? v - (1n << 64n) : v;
}

// Deslocamento logico a direita (>>>) em 64 bits.
function ushr64(v, n) {
  return (v & MASK64) >> BigInt(n);
}

class JavaRandom {
  constructor(seedLong) {
    // new Random(seed): (seed ^ 0x5DEECE66D) & ((1<<48)-1)
    this.seed = (BigInt(seedLong) ^ MULT) & MASK48;
  }

  _next(bits) {
    this.seed = (this.seed * MULT + ADD) & MASK48;
    // (int)(seed >>> (48 - bits)) -> inteiro de 32 bits com sinal
    let r = this.seed >> BigInt(48 - bits);
    let n = Number(r & 0xFFFFFFFFn);
    if (n >= 0x80000000) n -= 0x100000000;
    return n;
  }

  // nextInt(bound) fiel ao OpenJDK.
  nextInt(bound) {
    if (bound <= 0) throw new Error('bound must be positive');
    // potencia de 2
    if ((bound & -bound) === bound) {
      const big = BigInt(bound) * BigInt(this._next(31));
      return Number(big >> 31n);
    }
    let bits, val;
    do {
      bits = this._next(31);
      val = bits % bound;
    } while (bits - val + (bound - 1) < 0);
    return val;
  }

  nextDouble() {
    const hi = BigInt(this._next(26));
    const lo = BigInt(this._next(27));
    const combined = (hi << 27n) + lo;
    return Number(combined) * Math.pow(2, -53);
  }
}

// String.hashCode() do Java (32 bits com sinal). So usado quando a carta nao tem id.
function javaStringHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

// CardLogic.seeded(p, salt): produz a semente (long) para o JavaRandom.
function seededValue(idLong, salt) {
  let id = BigInt(idLong);
  let z = (((id + 0x9E3779B97F4A7C15n) & MASK64) * 0xBF58476D1CE4E5B9n) & MASK64;
  z = z ^ ((BigInt(salt) * 0x94D049BB133111EBn) & MASK64);
  z &= MASK64;
  z = z ^ ushr64(z, 31);
  z = (z * 0x94D049BB133111EBn) & MASK64;
  z = z ^ ushr64(z, 29);
  z &= MASK64;
  return toSigned64(z);
}

module.exports = { JavaRandom, javaStringHash, seededValue, toSigned64 };
