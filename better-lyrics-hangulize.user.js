// ==UserScript==
// @name         Better Lyrics Hangulize
// @namespace    https://github.com/smturtle2/better-lyrics-hangulize
// @version      0.1.0
// @description  Read Better Lyrics' romanized lyrics as local Hangul pronunciation guides on YouTube Music.
// @author       smturtle2
// @copyright    2026, smturtle2
// @license      EUPL-1.2
// @homepageURL  https://github.com/smturtle2/better-lyrics-hangulize
// @supportURL   https://github.com/smturtle2/better-lyrics-hangulize/issues
// @downloadURL  https://raw.githubusercontent.com/smturtle2/better-lyrics-hangulize/main/better-lyrics-hangulize.user.js
// @updateURL    https://raw.githubusercontent.com/smturtle2/better-lyrics-hangulize/main/better-lyrics-hangulize.user.js
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

// Copyright (c) 2026 smturtle2
// SPDX-License-Identifier: EUPL-1.2
// Source: https://github.com/smturtle2/better-lyrics-hangulize

(() => {
  "use strict";

  // Pure local pronunciation conversion. Profiles describe supported romanization conventions; they cannot recover distinctions already lost by a provider.
  const LANGUAGE_IDS = new Set([
    'ja', 'ko', 'zh', 'ru', 'hi', 'ar', 'th', 'el', 'he', 'bn', 'ta', 'te',
    'ml', 'kn', 'gu', 'pa', 'mr', 'ur', 'si', 'my', 'ka', 'km', 'lo', 'fa',
  ]);

  function normalizeLanguageTag(tag) {
    if (typeof tag !== 'string') return null;
    const normalized = tag.trim().replace(/_/g, '-').toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(normalized)) return null;
    const base = normalized.split('-')[0];
    return LANGUAGE_IDS.has(base) ? base : null;
  }

  // Hangul's canonical syllable ordering: 19 initials × 21 vowels × 28 finals.
  function hangulSyllable(initial, vowel, final = 0) {
    return String.fromCharCode(0xac00 + (initial * 21 + vowel) * 28 + final);
  }

  function appendFinal(parts, final) {
    const last = parts[parts.length - 1];
    if (!last) return false;
    const code = last.charCodeAt(last.length - 1) - 0xac00;
    if (code < 0 || code >= 11172 || code % 28 !== 0) return false;
    parts[parts.length - 1] = last.slice(0, -1) + String.fromCharCode(0xac00 + code + final);
    return true;
  }

  const VOWEL = Object.freeze({
    a: 0, ae: 1, ya: 2, yae: 3, eo: 4, e: 5, yeo: 6, ye: 7,
    o: 8, wa: 9, wae: 10, oe: 11, yo: 12, u: 13, wo: 14,
    we: 15, wi: 16, yu: 17, eu: 18, ui: 19, i: 20,
  });
  const C = Object.freeze({
    g: { initial: 0 }, kk: { initial: 1 }, n: { initial: 2, final: 4 },
    d: { initial: 3 }, tt: { initial: 4 }, r: { initial: 5 },
    l: { initial: 5, final: 8, lateral: true }, m: { initial: 6, final: 16 },
    b: { initial: 7 }, pp: { initial: 8 }, s: { initial: 9 },
    ss: { initial: 10 }, ng: { initial: 11, final: 21 }, j: { initial: 12 },
    jj: { initial: 13 }, ch: { initial: 14 }, k: { initial: 15 },
    t: { initial: 16 }, p: { initial: 17 }, h: { initial: 18 },
    sh: { initial: 9, palatal: true }, ny: { initial: 2, palatal: true, final: 4 },
    ly: { initial: 5, palatal: true, lateral: true, final: 8 },
    y: { glide: 'y' }, w: { glide: 'w' },
    K: { initial: 15, final: 1 }, T: { initial: 16, final: 7 },
    P: { initial: 17, final: 17 }, G: { initial: 0, final: 1 },
    D: { initial: 3, final: 7 }, B: { initial: 7, final: 17 },
  });
  const Y_VOWELS = { 0: 2, 1: 3, 4: 6, 5: 7, 8: 12, 13: 17, 20: 20 };
  const W_VOWELS = { 0: 9, 1: 10, 4: 14, 5: 15, 8: 14, 13: 13, 20: 16 };
  const v = name => ({ vowel: VOWEL[name] });
  const vowels = (...names) => names.map(v);
  const phonemes = (...items) => items.flatMap(item => typeof item === 'string' ? [C[item]] : [item]);

  function escapeLiteral(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function tokenKey(text) {
    // Unicode ignore-case matching folds the Latin long s, while toLowerCase() alone does not. Use the same key for lookup as the native matcher uses.
    return text.toLowerCase().replace(/ſ/g, 's');
  }

  function compileTokens(table) {
    table = Object.fromEntries(Object.entries(table).map(([key, value]) => [key.normalize('NFC'), value]));
    const keys = Object.keys(table).sort((a, b) => b.length - a.length || a.localeCompare(b));
    return {
      table,
      // Literal alternatives only: no overlapping nested quantifiers or backtracking rules.
      matcher: new RegExp(`(?:${keys.map(escapeLiteral).join('|')})(?!\\p{M})`, 'iyu'),
    };
  }

  function nextVowel(phones, index) {
    const phone = phones[index];
    if (!phone) return null;
    if (phone.vowel !== undefined) return { vowel: phone.vowel, count: 1 };
    if (phone.glide && phones[index + 1]?.vowel !== undefined) {
      const raw = phones[index + 1].vowel;
      const combined = (phone.glide === 'y' ? Y_VOWELS : W_VOWELS)[raw];
      if (combined !== undefined) return { vowel: combined, count: 2 };
    }
    return null;
  }

  function renderPhones(phones) {
    const result = [];
    for (let index = 0; index < phones.length;) {
      const phone = phones[index];
      let initial = 11;
      let vowelInfo = nextVowel(phones, index);
      if (!vowelInfo) {
        if (phone.glide) {
          result.push(hangulSyllable(11, phone.glide === 'y' ? VOWEL.i : VOWEL.u));
          index++;
          continue;
        }
        initial = phone.initial;
        vowelInfo = nextVowel(phones, index + 1);
        if (!vowelInfo) {
          if (!phone.final || !appendFinal(result, phone.final)) {
            result.push(hangulSyllable(initial, phone.palatal ? VOWEL.i : VOWEL.eu));
          }
          index++;
          continue;
        }
        if (phone.lateral) appendFinal(result, 8);
        // Korean has no initial /ŋ/. Keep the nasal audible at a word start; between vowels it can close the preceding Hangul syllable instead.
        if (phone === C.ng && !appendFinal(result, 21)) result.push(hangulSyllable(11, VOWEL.eu, 21));
        index++;
        if (phone.palatal) {
          vowelInfo = { ...vowelInfo, vowel: Y_VOWELS[vowelInfo.vowel] ?? vowelInfo.vowel };
        }
      }
      index += vowelInfo.count;
      let final = 0;
      const following = phones[index];
      if (following?.final && !nextVowel(phones, index + 1)) {
        final = following.final;
        index++;
      }
      result.push(hangulSyllable(initial, vowelInfo.vowel, final));
    }
    return result.join('');
  }

  function basicVowels() {
    return { a: vowels('a'), e: vowels('e'), i: vowels('i'), o: vowels('o'), u: vowels('u') };
  }

  function basicConsonants(letters) {
    const table = {
      b: [C.b], c: [C.k], d: [C.d], f: [C.p], g: [C.g], h: [C.h],
      j: [C.j], k: [C.k], l: [C.l], m: [C.m], n: [C.n], p: [C.p],
      q: [C.k], r: [C.r], s: [C.s], t: [C.t], v: [C.b], w: [C.w],
      x: [C.k, C.s], y: [C.y], z: [C.j],
    };
    return Object.fromEntries([...letters].map(letter => [letter, table[letter]]));
  }

  function lengthVowels(includeEO = false) {
    const result = {
      ā: vowels('a', 'a'), aa: vowels('a', 'a'),
      ī: vowels('i', 'i'), ii: vowels('i', 'i'),
      ū: vowels('u', 'u'), uu: vowels('u', 'u'),
    };
    if (includeEO) Object.assign(result, {
      ē: vowels('e', 'e'), ee: vowels('e', 'e'),
      ō: vowels('o', 'o'), oo: vowels('o', 'o'),
    });
    return result;
  }

  function indicTokens(language) {
    // Shared sounds, with language-owned exceptions below. This intentionally does not guess schwa deletion or reconstruct an original script from Latin text.
    const table = {
      ...basicVowels(), ...basicConsonants('bcdfghjklmnprstvwyz'), ...lengthVowels(['ta', 'te', 'ml', 'kn', 'si'].includes(language)),
      ai: vowels('a', 'i'), au: vowels('a', 'u'),
      c: [C.j], ch: [C.ch], chh: [C.ch], jh: [C.ch],
      kh: [C.k], gh: [C.g], th: [C.t], dh: [C.d], ph: [C.p], bh: [C.b],
      sh: [C.sh], ś: [C.sh], ṣ: [C.sh], ṣh: [C.sh],
      ṭ: [C.t], ṭh: [C.t], ḍ: [C.d], ḍh: [C.d], ṇ: [C.n],
      ṅ: [C.ng], ng: [C.ng], ñ: [C.ny], ny: [C.ny],
      ṛ: [C.r], ṛh: [C.r], ṟ: [C.r], ḷ: [C.l], ḻ: [C.l], ḹ: [C.l],
      ṃ: [C.m], ṁ: [C.m], 'm̆': [C.m], 'n̆': [C.n],
      'r̥': phonemes('r', v('i')), 'r̥̄': phonemes('r', v('i'), v('i')),
      'l̥': phonemes('l', v('i')), 'l̥̄': phonemes('l', v('i'), v('i')),
      ḥ: [C.h],
    };
    // Nasal vowels retain a nasal ending rather than silently losing their mark.
    for (const [letter, name] of Object.entries({ a: 'a', e: 'e', i: 'i', o: 'o', u: 'u' })) {
      table[(letter + '\u0303').normalize('NFC')] = phonemes(v(name), 'ng');
    }
    if (language === 'hi' || language === 'ur') Object.assign(table, {
      q: [C.k], ġ: [C.g], ḳh: [C.h], ḵh: [C.h], ẖ: [C.h],
      ai: vowels('ae'), au: vowels('o'),
    });
    if (language === 'ta' || language === 'ml') Object.assign(table, { zh: [C.l], ṉ: [C.n] });
    if (language === 'ml') Object.assign(table, { 'ȧ': vowels('eu'), 'ŭ': vowels('eu') });
    if (language === 'gu' || language === 'mr') Object.assign(table, {
      ê: vowels('ae'), ô: vowels('o'), ĕ: vowels('ae'), ŏ: vowels('o'),
    });
    if (language === 'si') Object.assign(table, {
      ă: vowels('ae'), â: vowels('ae', 'ae'), æ: vowels('ae'), ǣ: vowels('ae', 'ae'),
      'n̆g': [C.n, C.g], 'n̆d': [C.n, C.d], 'm̆b': [C.m, C.b],
    });
    // Bengali a/o and Punjabi a/ə are used as supplied; romanization does not consistently encode their original-script inherent-vowel pronunciation.
    return table;
  }

  function russianTokens() {
    return {
      ...basicVowels(), ...basicConsonants('bcdfghjklmnprstvyz'),
      shch: [C.sh], šč: [C.sh], ŝ: [C.sh], zh: [C.j], ž: [C.j],
      kh: [C.h], ch: [C.ch], č: [C.ch], ts: [C.ch], c: [C.ch],
      sh: [C.sh], š: [C.sh],
      ë: vowels('yo'), yo: vowels('yo'), x: [C.h],
      yu: vowels('yu'), iu: vowels('yu'), û: vowels('yu'),
      ya: vowels('ya'), ia: vowels('ya'), â: vowels('ya'),
      ye: vowels('ye'), y: vowels('eu'), j: [C.y],
      yy: vowels('eu', 'i'), iy: vowels('i', 'i'),
      è: vowels('e'), ĭ: [C.y],
    };
  }

  function arabicTokens() {
    return {
      ...basicVowels(), ...basicConsonants('bdfghjklmnqrstwyz'), ...lengthVowels(),
      sh: [C.sh], š: [C.sh], kh: [C.h], ḫ: [C.h], gh: [C.g], ġ: [C.g],
      th: [C.s], ṯ: [C.s], dh: [C.d], ḏ: [C.d],
      ḥ: [C.h], ṣ: [C.s], ḍ: [C.d], ṭ: [C.t], ẓ: [C.j],
      q: [C.k], j: [C.j], ay: vowels('a', 'i'), aw: vowels('a', 'u'),
    };
  }

  function hebrewTokens() {
    return {
      ...basicVowels(), ...basicConsonants('bdfghjklmnpqrstvwyz'),
      sh: [C.sh], š: [C.sh], ś: [C.s], ts: [C.ch], tz: [C.ch], ṣ: [C.ch],
      kh: [C.h], ch: [C.h], ḥ: [C.h], ḵ: [C.h],
      ṿ: [C.b], ḳ: [C.k], ṭ: [C.t], ḏ: [C.d],
      ā: vowels('a'), ē: vowels('e'), ī: vowels('i'), ō: vowels('o'), ū: vowels('u'),
      ă: vowels('a'), ĕ: vowels('e'), ŏ: vowels('o'), ə: vowels('e'),
    };
  }

  function persianTokens() {
    return {
      ...basicVowels(), ...basicConsonants('bdfghjklmnpqrstvwyz'),
      ā: vowels('a', 'a'), â: vowels('a', 'a'), aa: vowels('a', 'a'),
      ī: vowels('i', 'i'), ii: vowels('i', 'i'), ee: vowels('i', 'i'),
      ū: vowels('u', 'u'), uu: vowels('u', 'u'), oo: vowels('u', 'u'),
      sh: [C.sh], š: [C.sh], ch: [C.ch], č: [C.ch], zh: [C.j], ž: [C.j],
      kh: [C.h], ḵ: [C.h], ḫ: [C.h], gh: [C.g], ġ: [C.g],
      th: [C.s], dh: [C.j], ṣ: [C.s], ṯ: [C.s], ḏ: [C.j], ẓ: [C.j],
      ḥ: [C.h], ṭ: [C.t], q: [C.g], ow: vowels('o', 'u'), ey: vowels('e', 'i'),
    };
  }

  function greekTokens() {
    return {
      ...basicVowels(), ...basicConsonants('bdfghklmnprstvyz'),
      ai: vowels('e'), ei: vowels('i'), oi: vowels('i'), yi: vowels('i'), ui: vowels('i'), ou: vowels('u'),
      ch: [C.h], kh: [C.h], th: [C.s], ph: [C.p],
      mp: [C.b], nt: [C.d], gk: [C.g], gg: [C.ng, C.g],
      ps: [C.p, C.s], x: [C.k, C.s], y: vowels('i'),
      á: vowels('a'), é: vowels('e'), í: vowels('i'), ó: vowels('o'), ú: vowels('u'),
      ý: vowels('i'), ï: vowels('i'), ü: vowels('u'),
      'ḯ': vowels('i'), 'ǘ': vowels('u'), ē: vowels('i'), ō: vowels('o'),
    };
  }

  function georgianTokens() {
    const table = {
      ...basicVowels(), ...basicConsonants('bdfghjklmnpqrstvyz'),
      sh: [C.sh], ch: [C.ch], ts: [C.ch], dz: [C.j], zh: [C.j],
      kh: [C.h], gh: [C.g], q: [C.kk], k: [C.k], p: [C.p], t: [C.t],
    };
    for (const apostrophe of ["'", '’', 'ʼ']) {
      for (const [token, consonant] of Object.entries({ k: 'kk', p: 'pp', t: 'tt', ts: 'jj', ch: 'jj', q: 'kk' })) {
        table[token + apostrophe] = [C[consonant]];
      }
    }
    return table;
  }

  function thaiTokens() {
    return {
      ...basicVowels(), ...basicConsonants('bdfghjklmnprstwy'), ...lengthVowels(true),
      kh: [C.K], th: [C.T], ph: [C.P], ch: [C.ch], ng: [C.ng],
      k: [C.K], t: [C.T], p: [C.P],
      ue: vowels('eu'), uea: vowels('eu', 'a'), oe: vowels('eo'),
      ae: vowels('ae'), ai: vowels('a', 'i'), ao: vowels('a', 'o'),
      ia: vowels('i', 'a'), ua: vowels('u', 'a'),
      ư: vowels('eu'), 'ư̄': vowels('eu', 'eu'), œ: vowels('eo'), 'œ̄': vowels('eo', 'eo'),
      æ: vowels('ae'), ǣ: vowels('ae', 'ae'), ǫ: vowels('eo'), ǭ: vowels('eo', 'eo'),
      ɛ: vowels('ae'), ɔ: vowels('eo'), ɯ: vowels('eu'), ɤ: vowels('eo'),
    };
  }

  function laoTokens() {
    // Modern Thai-like spellings form this profile. French BGN `ou` is accepted, but ambiguous unmarked `u` keeps /u/; this does not guess a BGN-only /ɯ/.
    return {
      ...basicVowels(), ...basicConsonants('bdfghjklmnprstwxy'), ...lengthVowels(true),
      kh: [C.K], th: [C.T], ph: [C.P], ch: [C.ch], ng: [C.ng], ny: [C.ny], gn: [C.ny],
      k: [C.K], t: [C.T], p: [C.P], x: [C.s],
      ue: vowels('eu'), uea: vowels('eu', 'a'), oe: vowels('eo'), ae: vowels('ae'),
      ou: vowels('u'), oua: vowels('u', 'a'), ua: vowels('u', 'a'), ia: vowels('i', 'a'),
      ai: vowels('a', 'i'), ay: vowels('a', 'i'), ao: vowels('a', 'o'),
      é: vowels('e'), è: vowels('ae'), ô: vowels('o'), ư: vowels('eu'), œ: vowels('eo'),
    };
  }

  function khmerTokens() {
    return {
      ...basicVowels(), ...basicConsonants('bdfghjklmnprstvwy'),
      kh: [C.K], th: [C.T], ph: [C.P], chh: [C.ch], ch: [C.j],
      ng: [C.ng], nh: [C.ny], ny: [C.ny], k: [C.K], t: [C.T], p: [C.P],
      â: vowels('eo'), ô: vowels('o'), ă: vowels('a'), á: vowels('a', 'a'),
      é: vowels('e', 'e'), ĕ: vowels('e'), ĭ: vowels('i'),
      ó: vowels('o', 'o'), ŏ: vowels('o'), ŭ: vowels('u'), œ: vowels('eo'),
      ae: vowels('ae'), ao: vowels('a', 'o'), eu: vowels('eu'), oe: vowels('eo'),
      ea: vowels('i', 'a'), ie: vowels('i', 'e'), ou: vowels('o', 'u'),
      ua: vowels('u', 'a'), uo: vowels('u', 'o'), ai: vowels('a', 'i'),
    };
  }

  function burmeseTokens() {
    return {
      ...basicVowels(), ...basicConsonants('bdghjklmnprstwyz'),
      ng: [C.ng], ny: [C.ny], sh: [C.sh], ch: [C.ch], gy: [C.j], ky: [C.ch],
      kh: [C.k], ph: [C.p], th: [C.s], ht: [C.t], hp: [C.p],
      aing: phonemes(v('a'), v('i'), 'ng'), aung: phonemes(v('a'), v('u'), 'ng'),
      ein: phonemes(v('e'), v('i'), 'n'), ôn: phonemes(v('o'), 'n'),
      aik: phonemes(v('a'), v('i'), 'K'), auk: phonemes(v('a'), v('u'), 'K'),
      eik: phonemes(v('e'), v('i'), 'K'), ôk: phonemes(v('o'), 'K'),
      aw: vowels('eo'), aa: vowels('a', 'a'), ee: vowels('i', 'i'), oo: vowels('u', 'u'),
      è: vowels('e'), ê: vowels('e'), ô: vowels('o'),
    };
  }

  function koreanTokens() {
    return {
      ...basicVowels(), ...basicConsonants('bdghjklmnprstwy'),
      eo: vowels('eo'), eu: vowels('eu'), ae: vowels('ae'), oe: vowels('oe'),
      ya: vowels('ya'), yae: vowels('yae'), yeo: vowels('yeo'), ye: vowels('ye'),
      yo: vowels('yo'), yu: vowels('yu'), wa: vowels('wa'), wae: vowels('wae'),
      wo: vowels('wo'), we: vowels('we'), wi: vowels('wi'), ui: vowels('ui'),
      kk: [C.kk], tt: [C.tt], pp: [C.pp], ss: [C.ss], jj: [C.jj],
      ch: [C.ch], ng: [C.ng], g: [C.G], k: [C.K], d: [C.D], t: [C.T], b: [C.B], p: [C.P],
      r: [C.r], l: [C.l],
    };
  }

  const PROFILE_FACTORIES = {
    ko: koreanTokens, ru: russianTokens, ar: arabicTokens, he: hebrewTokens,
    fa: persianTokens, el: greekTokens, ka: georgianTokens, th: thaiTokens,
    lo: laoTokens, km: khmerTokens, my: burmeseTokens,
    ...Object.fromEntries(['hi', 'bn', 'ta', 'te', 'ml', 'kn', 'gu', 'pa', 'mr', 'ur', 'si']
      .map(language => [language, () => indicTokens(language)])),
  };
  const COMPILED_PROFILES = new Map();

  function genericProfile(language) {
    if (!COMPILED_PROFILES.has(language)) {
      COMPILED_PROFILES.set(language, compileTokens(PROFILE_FACTORIES[language]()));
    }
    return COMPILED_PROFILES.get(language);
  }

  // This range includes modifier letters used in scholarly romanization. Native scripts, emoji, punctuation, and line spacing pass through without alteration.
  const ROMANIZED_RUN = /[\p{Script=Latin}\p{M}\u02b9\u02ba\u02bc\u02bf\u02be'’0-9:]+/gu;

  function convertWithProfile(text, language) {
    const { table, matcher } = genericProfile(language);
    return text.replace(ROMANIZED_RUN, original => {
      const run = original.normalize('NFC');
      const result = [];
      let pending = [];
      let matched = false;
      const flush = () => {
        if (pending.length) result.push(renderPhones(pending));
        pending = [];
      };
      for (let offset = 0; offset < run.length;) {
        matcher.lastIndex = offset;
        const match = matcher.exec(run);
        if (match) {
          matched = true;
          pending.push(...table[tokenKey(match[0])]);
          offset += match[0].length;
        } else {
          flush();
          const char = String.fromCodePoint(run.codePointAt(offset));
          result.push(char);
          offset += char.length;
        }
      }
      flush();
      return matched ? result.join('') : original;
    });
  }

  function japaneseTokens() {
    const table = {};
    const add = (spellings, initial, vowel) => {
      for (const spelling of spellings.split(' ')) table[spelling] = hangulSyllable(initial, VOWEL[vowel]);
    };
    for (const vowel of ['a', 'i', 'u', 'e', 'o']) add(vowel, 11, vowel);
    const rows = { k: 15, g: 0, n: 2, h: 18, m: 6, r: 5, b: 7, p: 17, v: 7 };
    for (const [consonant, initial] of Object.entries(rows)) {
      for (const vowel of ['a', 'i', 'u', 'e', 'o']) add(consonant + vowel, initial, vowel);
    }
    add('sa', 9, 'a'); add('shi si', 9, 'i'); add('su', 9, 'eu'); add('se', 9, 'e'); add('so', 9, 'o');
    add('za', 12, 'a'); add('ji zi di', 12, 'i'); add('zu du', 12, 'eu'); add('ze', 12, 'e'); add('zo', 12, 'o');
    add('ta', 16, 'a'); add('chi ti', 14, 'i'); add('tsu tu', 14, 'eu'); add('te', 16, 'e'); add('to', 16, 'o');
    add('da', 3, 'a'); add('de', 3, 'e'); add('do', 3, 'o');
    add('fu hu', 17, 'u');
    add('ya', 11, 'ya'); add('yu', 11, 'yu'); add('yo', 11, 'yo'); add('ye', 11, 'ye');
    add('wa', 11, 'wa'); add('wi', 11, 'wi'); add('we', 11, 'we'); add('wo', 11, 'o');
    const palatals = { ky: 15, gy: 0, ny: 2, hy: 18, my: 6, ry: 5, by: 7, py: 17, vy: 7,
      sh: 9, sy: 9, ch: 14, ty: 14, cy: 14, j: 12, jy: 12, zy: 12, dy: 12 };
    for (const [consonant, initial] of Object.entries(palatals)) {
      for (const [letter, vowel] of Object.entries({ a: 'ya', u: 'yu', o: 'yo', e: 'ye' })) {
        add(consonant + letter, initial, vowel);
      }
    }
    // Affricates already carry their palatal quality in Korean: cha/ja → 차/자.
    for (const consonant of ['ch', 'ty', 'cy', 'j', 'jy', 'zy', 'dy']) {
      const initial = ['ch', 'ty', 'cy'].includes(consonant) ? 14 : 12;
      for (const [letter, vowel] of Object.entries({ a: 'a', u: 'u', o: 'o', e: 'e' })) add(consonant + letter, initial, vowel);
    }
    for (const [consonant, initial] of Object.entries({ f: 17, ts: 14 })) {
      for (const vowel of ['a', 'i', 'e', 'o']) add(consonant + vowel, initial, vowel);
    }
    for (const [consonant, initial] of Object.entries({ kw: 15, gw: 0, qw: 15 })) {
      for (const [letter, vowel] of Object.entries({ a: 'wa', i: 'wi', e: 'we', o: 'wo' })) add(consonant + letter, initial, vowel);
    }
    add('qa', 15, 'a'); add('qi', 15, 'i'); add('qe', 15, 'e'); add('qo', 15, 'o');
    return table;
  }

  let JAPANESE_PROFILE;
  const JAPANESE_LONG_VOWELS = { ā: 'aa', ī: 'ii', ū: 'uu', ē: 'ee', ō: 'oo', â: 'aa', î: 'ii', û: 'uu', ê: 'ee', ô: 'oo' };

  function convertJapanese(text) {
    JAPANESE_PROFILE ??= compileTokens(japaneseTokens());
    const { matcher, table } = JAPANESE_PROFILE;
    return text.replace(ROMANIZED_RUN, original => {
      const run = original.normalize('NFC').replace(/[āīūēōâîûêô]/giu, letter => JAPANESE_LONG_VOWELS[letter.toLowerCase()]);
      const result = [];
      let matched = false;
      for (let offset = 0; offset < run.length;) {
        const current = run[offset].toLowerCase();
        const following = run[offset + 1]?.toLowerCase();
        // A single n before a consonant/end, or n' before a vowel, is moraic /n/.
        if (current === 'n' && (!following || (!/[aiueoy]/.test(following) && !/\p{M}/u.test(following)))) {
          matched = true;
          if (!appendFinal(result, 4)) result.push(hangulSyllable(11, VOWEL.eu, 4));
          offset += ["'", '’', 'ʼ'].includes(following) ? 2 : 1;
          continue;
        }
        // Sokuon: do not confuse nn with a doubled stop. A leading doubled stop has no preceding syllable to close, so leave its first letter visible.
        if (/[bcdfghjkpqrstvwxyz]/.test(current) &&
            (current === following || (current === 't' && run.slice(offset + 1, offset + 3).toLowerCase() === 'ch'))) {
          const final = /[kg]/.test(current) ? 1 : /[pb]/.test(current) ? 17 : 19;
          if (appendFinal(result, final)) {
            offset++;
            continue;
          }
        }
        matcher.lastIndex = offset;
        const match = matcher.exec(run);
        if (match) {
          matched = true;
          result.push(table[tokenKey(match[0])]);
          offset += match[0].length;
        } else {
          const char = String.fromCodePoint(run.codePointAt(offset));
          result.push(char);
          offset += char.length;
        }
      }
      return matched ? result.join('') : original;
    });
  }

  function pinyinTokens() {
    const final = (vowel, tail = '', coda = 0) => ({ vowel: VOWEL[vowel], tail, coda });
    const finals = {
      a: final('a'), o: final('o'), e: final('eo'), ê: final('e'),
      ai: final('a', '이'), ei: final('e', '이'), ao: final('a', '오'), ou: final('eo', '우'),
      an: final('a', '', 4), en: final('eo', '', 4), ang: final('a', '', 21), eng: final('eo', '', 21),
      er: final('eo', '', 8),
      i: final('i'), ia: final('ya'), ie: final('ye'), iao: final('ya', '오'),
      iu: final('yeo', '우'), iou: final('yeo', '우'), ian: final('ye', '', 4),
      in: final('i', '', 4), iang: final('ya', '', 21), ing: final('i', '', 21), iong: final('yu', '', 21),
      u: final('u'), ua: final('wa'), uo: final('wo'), uai: final('wa', '이'),
      ui: final('we', '이'), uei: final('we', '이'), uan: final('wa', '', 4),
      un: final('wo', '', 4), uen: final('wo', '', 4), uang: final('wa', '', 21),
      ueng: final('wo', '', 21), ong: final('u', '', 21),
      ü: final('wi'), üe: final('we'), üan: final('wi', '엔'), ün: final('wi', '', 4),
    };
    const onsets = { '': 11, b: 7, p: 17, m: 6, f: 17, d: 3, t: 16, n: 2, l: 5,
      g: 0, k: 15, h: 18, j: 12, q: 14, x: 9, zh: 13, ch: 14, sh: 9, r: 5, z: 13, c: 14, s: 10 };
    // Constrain alternatives to actual standard syllables, rather than accepting every onset/final product. No dictionary, statistical segmentation, or I/O.
    const allowed = {
      '': 'a ai an ang ao e ê ei en eng er o ou',
      b: 'a ai an ang ao ei en eng i ian iao ie in ing o u',
      p: 'a ai an ang ao ei en eng i ian iao ie in ing o ou u',
      m: 'a ai an ang ao e ei en eng i ian iao ie in ing iu o ou u',
      f: 'a an ang ei en eng o ou u',
      d: 'a ai an ang ao e ei en eng i ia ian iao ie ing iu ong ou u uan ui un uo',
      t: 'a ai an ang ao e eng i ian iao ie ing ong ou u uan ui un uo',
      n: 'a ai an ang ao e ei en eng i ian iang iao ie in ing iu ong ou u uan uo ü üe',
      l: 'a ai an ang ao e ei eng i ia ian iang iao ie in ing iu ong ou u uan un uo ü üe',
      g: 'a ai an ang ao e ei en eng ong ou u ua uai uan uang ui un uo',
      k: 'a ai an ang ao e en eng ong ou u ua uai uan uang ui un uo',
      h: 'a ai an ang ao e ei en eng ong ou u ua uai uan uang ui un uo',
      j: 'i ia ian iang iao ie in ing iong iu u ue uan un ü üe üan ün',
      q: 'i ia ian iang iao ie in ing iong iu u ue uan un ü üe üan ün',
      x: 'i ia ian iang iao ie in ing iong iu u ue uan un ü üe üan ün',
      zh: 'a ai an ang ao e ei en eng i ong ou u ua uai uan uang ui un uo',
      ch: 'a ai an ang ao e en eng i ong ou u ua uai uan uang ui un uo',
      sh: 'a ai an ang ao e ei en eng i ou u ua uai uan uang ui un uo',
      r: 'an ang ao e en eng i ong ou u uan ui un uo',
      z: 'a ai an ang ao e ei en eng i ong ou u uan ui un uo',
      c: 'a ai an ang ao e en eng i ong ou u uan ui un uo',
      s: 'a ai an ang ao e en eng i ong ou u uan ui un uo',
    };
    const table = {};
    const put = (spelling, onset, ending) => {
      table[spelling] = hangulSyllable(onset, ending.vowel, ending.coda) + ending.tail;
    };
    for (const [onset, endings] of Object.entries(allowed)) {
      for (const ending of endings.split(' ')) {
        let sound = finals[ending];
        if (['j', 'q', 'x'].includes(onset) && ending.startsWith('u')) sound = finals['ü' + ending.slice(1)];
        if (ending === 'i' && ['zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(onset)) sound = final('eu');
        put(onset + ending, onsets[onset], sound);
      }
    }
    for (const [spelling, ending] of Object.entries({
      ya: 'ia', yan: 'ian', yang: 'iang', yao: 'iao', ye: 'ie', yi: 'i', yin: 'in', ying: 'ing',
      yong: 'iong', you: 'iou', yu: 'ü', yue: 'üe', yuan: 'üan', yun: 'ün',
      wa: 'ua', wai: 'uai', wan: 'uan', wang: 'uang', wei: 'uei', wen: 'uen', weng: 'ueng', wo: 'uo', wu: 'u',
    })) put(spelling, 11, finals[ending]);
    return table;
  }

  let PINYIN_PROFILE;

  function pinyinUnits(text) {
    // Keep raw graphemes until a complete syllable consumes them. In particular, an unknown ś or an unused v/u: alias must not lose its original spelling.
    const units = [];
    for (const match of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
      const raw = match[0];
      const [base, ...marks] = raw.normalize('NFD').toLowerCase();
      let key = /^[a-z]$/.test(base) ? base : null;
      let tone = '';
      let vowelMark = '';
      for (const mark of marks) {
        if (/[\u0300\u0301\u0304\u030c]/u.test(mark) && /[aeiou]/.test(base) && !tone) {
          tone = mark;
        } else if (mark === '\u0308' && base === 'u' && !vowelMark) {
          vowelMark = 'ü';
        } else if (mark === '\u0302' && base === 'e' && !vowelMark) {
          vowelMark = 'ê';
        } else {
          key = null;
        }
      }
      if (key !== null) key = vowelMark || (key === 'v' ? 'ü' : key);
      units.push({ raw, key, tone });
    }
    // u: is one input unit, so the colon is also preserved if the alias is not part of a recognized syllable. Only a plain u uses this spelling alias.
    const combined = [];
    for (let index = 0; index < units.length; index++) {
      const unit = units[index];
      if (/^u$/i.test(unit.raw) && units[index + 1]?.raw === ':') {
        combined.push({ raw: unit.raw + ':', key: 'ü', tone: '' });
        index++;
      } else {
        combined.push(unit);
      }
    }
    return combined;
  }

  function pinyinTonePosition(spelling) {
    // Standard Pinyin places a tone on a/e first, on o in ou, otherwise on the final vowel. This distinguishes forms such as liú and guì.
    for (const vowel of ['a', 'e', 'ê']) {
      const index = spelling.indexOf(vowel);
      if (index !== -1) return index;
    }
    const ou = spelling.indexOf('ou');
    if (ou !== -1) return ou;
    for (let index = spelling.length - 1; index >= 0; index--) {
      if ('iouü'.includes(spelling[index])) return index;
    }
    return -1;
  }

  function convertPinyin(text) {
    if (!PINYIN_PROFILE) {
      const table = Object.assign(Object.create(null), pinyinTokens());
      const keys = Object.keys(table);
      PINYIN_PROFILE = {
        table,
        maxLength: Math.max(...keys.map(key => key.length)),
        tonePositions: Object.fromEntries(keys.map(key => [key, pinyinTonePosition(key)])),
      };
    }
    const { table, maxLength, tonePositions } = PINYIN_PROFILE;
    return text.replace(ROMANIZED_RUN, original => {
      const units = pinyinUnits(original);
      const length = units.length;
      // State 1 permits a vowel-initial syllable: only the start of a run, an explicit apostrophe, or a consumed numeric tone establishes that state. A raw unknown unit is a matching boundary, but not an implied apostrophe.
      const costs = [new Array(length + 1).fill(0), new Array(length + 1).fill(0)];
      const choices = [new Array(length), new Array(length)];
      for (let start = length - 1; start >= 0; start--) {
        const unit = units[start];
        const boundary = /^[\u02b9\u02bc'’]$/u.test(unit.raw) ? 1 : 0;
        const unknownCost = boundary || /^[0-9]$/.test(unit.raw) ? 0 : 1;
        for (let state = 0; state < 2; state++) {
          costs[state][start] = unknownCost + costs[boundary][start + 1];
          choices[state][start] = { end: start + 1, state: boundary, value: unit.raw, matched: 0 };
        }

        let spelling = '';
        let tonePosition = -1;
        for (let end = start; end < Math.min(length, start + maxLength); end++) {
          const next = units[end];
          if (next.key === null) break;
          spelling += next.key;
          if (next.tone) {
            if (tonePosition !== -1) break;
            tonePosition = end - start;
          }
          const value = table[spelling];
          if (value === undefined || (tonePosition !== -1 && tonePosition !== tonePositions[spelling])) continue;

          const after = end + 1;
          const candidates = [{ end: after, state: 0, value, matched: after - start }];
          // Consume one tone digit only after a complete, unaccented syllable. Numeric runs and extra digits in double tone notation stay visible.
          if (tonePosition === -1 && /^[0-5]$/.test(units[after]?.raw || '') &&
              !/^[0-9]$/.test(units[after + 1]?.raw || '')) {
            candidates.push({ end: after + 1, state: 1, value, matched: after + 1 - start });
          }
          for (let state = 0; state < 2; state++) {
            if (!state && /^[aeoê]/.test(spelling)) continue;
            for (const candidate of candidates) {
              const cost = costs[candidate.state][candidate.end];
              const current = choices[state][start];
              if (cost < costs[state][start] || (cost === costs[state][start] && candidate.matched > current.matched)) {
                costs[state][start] = cost;
                choices[state][start] = candidate;
              }
            }
          }
        }
      }
      // At most maxLength syllable extensions per unit and two boundary states: O(n * maxLength) time and O(n) space, with a fixed finite syllable table.
      const result = [];
      for (let offset = 0, state = 1; offset < length;) {
        const choice = choices[state][offset];
        result.push(choice.value);
        offset = choice.end;
        state = choice.state;
      }
      return result.join('');
    });
  }

  function convertRomanization(text, language, originalText = '') {
    const profile = normalizeLanguageTag(language);
    if (!profile || typeof text !== 'string' || !text) return null;
    // The caller supplies the matching original lyric row. Korean already has its best Hangul representation; reverse RR cannot restore lost spelling.
    if (profile === 'ko' && typeof originalText === 'string' && /[가-힣]/.test(originalText)) {
      return originalText;
    }
    const converted = profile === 'ja' ? convertJapanese(text)
      : profile === 'zh' ? convertPinyin(text)
        : convertWithProfile(text, profile);
    return converted !== text && /[가-힣]/.test(converted) ? converted : null;
  }

  // DOM integration owns observation, presentation, selection copying, and line caching. The converter above is independent of the page and never sends network requests.
  const ROOT_SELECTOR = "#tab-renderer > #blyrics-wrapper";
  const ROW_SELECTOR = ".blyrics--line";
  const SOURCE_SELECTOR = ".blyrics--romanized";
  const OWNED_SELECTOR = "[data-blh-owned]";
  const SOURCE_MARKER = "data-blh-source";
  const HIDDEN_SOURCE_SELECTOR = '[data-blh-source="hidden"]';
  const BASE_RUN_SELECTOR = ":scope > .blyrics-line-main > .blyrics-bidi-run:not(.blyrics-highlight-run)";
  const STYLE_ID = "better-lyrics-hangulize-style";
  const CACHE_LIMIT = 512;
  const CACHE_CHARACTER_LIMIT = 128 * 1024;
  const FRAME_BUDGET_MS = 4;

  const readingCache = new Map();
  let cachedCharacters = 0;
  let root = null;
  let discoveryTarget = null;
  let ancestry = [];
  let sourceStates = new WeakMap();
  let readingSources = new WeakMap();
  const trackedSources = new Set();
  const pendingSources = new Set();
  let scheduledFrame = 0;
  let suspended = false;
  let warned = false;
  let styleElement = null;

  const contentObserver = new MutationObserver(onContentChanges);
  const discoveryObserver = new MutationObserver(onDiscoveryChanges);
  const ancestryObserver = new MutationObserver(onAncestryChanges);

  function elementOf(node) {
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  }

  function isOwned(node) {
    return Boolean(elementOf(node)?.closest(OWNED_SELECTOR));
  }

  function visitSources(node, visit) {
    if (node.nodeType !== Node.ELEMENT_NODE || isOwned(node)) return;
    if (node.matches(SOURCE_SELECTOR)) visit(node);
    for (const source of node.querySelectorAll(SOURCE_SELECTOR)) {
      if (!isOwned(source)) visit(source);
    }
  }

  function enqueue(source) {
    if (!root || !root.contains(source) || isOwned(source)) return;
    pendingSources.add(source);
    scheduleFlush();
  }

  function scheduleFlush() {
    if (!scheduledFrame && !suspended && root) {
      scheduledFrame = requestAnimationFrame(flush);
    }
  }

  function enqueueKoreanSource(node) {
    const row = elementOf(node)?.closest(ROW_SELECTOR);
    if (!row || normalizeLanguageTag(row.lang) !== "ko") return;
    for (const source of row.querySelectorAll(`:scope > ${SOURCE_SELECTOR}`)) enqueue(source);
  }

  function onContentChanges(records) {
    for (const record of records) {
      if (isOwned(record.target)) continue;

      if (record.type === "attributes") {
        const target = record.target;
        if (target.matches(SOURCE_SELECTOR)) enqueue(target);
        else if (target.matches(ROW_SELECTOR)) visitSources(target, enqueue);
        continue;
      }

      if (record.type === "characterData") {
        const source = record.target.parentElement?.closest(SOURCE_SELECTOR);
        if (source) enqueue(source);
        else enqueueKoreanSource(record.target);
        continue;
      }

      let sourceContentChanged = false;
      for (const added of record.addedNodes) {
        if (isOwned(added)) continue;
        sourceContentChanged = true;
        visitSources(added, enqueue);
      }
      for (const removed of record.removedNodes) {
        if (isOwned(removed)) {
          // If another renderer removed our reading alone, restore it from its source.
          const source = readingSources.get(removed);
          if (source && sourceStates.get(source)?.reading === removed) enqueue(source);
          continue;
        }
        sourceContentChanged = true;
        // Animation frames pause in background tabs, but song changes continue. Release detached songs during mutation delivery rather than retaining them in the render queue until the user returns to this tab.
        visitSources(removed, source => {
          if (root?.isConnected && root.contains(source)) enqueue(source);
          else forgetSource(source);
        });
      }
      if (sourceContentChanged) {
        const source = elementOf(record.target)?.closest(SOURCE_SELECTOR);
        if (source) enqueue(source);
        else enqueueKoreanSource(record.target);
      }
    }
  }

  function flush() {
    scheduledFrame = 0;
    if (suspended || !root) return;
    if (!root.isConnected) {
      discover();
      return;
    }

    const deadline = performance.now() + FRAME_BUDGET_MS;
    for (const source of pendingSources) {
      pendingSources.delete(source);
      if (!root.contains(source)) forgetSource(source);
      else {
        try {
          updateSource(source);
        } catch (error) {
          forgetSource(source);
          if (!warned) {
            warned = true;
            console.warn("[Better Lyrics Hangulize] A reading could not be updated; the original remains visible.", error);
          }
        }
      }
      if (performance.now() >= deadline) break;
    }
    if (pendingSources.size) scheduleFlush();
  }

  function readRomanization(source) {
    const baseRun = source.querySelector(BASE_RUN_SELECTOR);
    if (baseRun) return baseRun.textContent;
    // Plain romanization is direct text. Unknown nested formats are left untouched.
    return source.childElementCount === 0 ? source.textContent : null;
  }

  function readOriginal(row) {
    return row.querySelector(BASE_RUN_SELECTOR)?.textContent ?? "";
  }

  function getReading(text, language, originalText) {
    // Original Korean text can disambiguate its otherwise lossy romanization.
    const key = JSON.stringify([language, text, language === "ko" ? originalText : ""]);
    if (readingCache.has(key)) {
      const hit = readingCache.get(key);
      readingCache.delete(key);
      readingCache.set(key, hit);
      return hit.value;
    }

    const value = convertRomanization(text, language, originalText);
    const characters = key.length + (value?.length ?? 0);
    if (characters <= CACHE_CHARACTER_LIMIT) {
      readingCache.set(key, { value, characters });
      cachedCharacters += characters;
      while (readingCache.size > CACHE_LIMIT || cachedCharacters > CACHE_CHARACTER_LIMIT) {
        const oldestKey = readingCache.keys().next().value;
        cachedCharacters -= readingCache.get(oldestKey).characters;
        readingCache.delete(oldestKey);
      }
    }
    return value;
  }

  function updateSource(source) {
    const row = source.closest(ROW_SELECTOR);
    if (!row || source.parentElement !== row) {
      forgetSource(source);
      return;
    }

    const text = readRomanization(source);
    const language = normalizeLanguageTag(source.lang) ?? normalizeLanguageTag(row.lang);
    const originalText = language === "ko" ? readOriginal(row) : "";
    const previous = sourceStates.get(source);
    if (previous && previous.row === row && previous.text === text &&
        previous.language === language && previous.originalText === originalText) {
      if (previous.reading && previous.reading.parentNode !== row) {
        row.insertBefore(previous.reading, source);
      }
      return;
    }

    forgetSource(source);
    const state = { row, text, language, originalText, reading: null };
    sourceStates.set(source, state);
    trackedSources.add(source);
    if (text === null || !text.trim() || !language) return;

    const reading = getReading(text, language, originalText);
    if (!reading || reading === text || !/[\uAC00-\uD7A3]/u.test(reading)) return;

    const sameAsOriginal = originalText &&
      reading.replace(/\s+/gu, " ").trim() === originalText.replace(/\s+/gu, " ").trim();
    if (!sameAsOriginal) {
      const output = document.createElement("div");
      output.className = "blh-reading";
      output.setAttribute("data-blh-owned", "");
      output.lang = "ko";
      output.dir = "ltr";
      output.textContent = reading;
      state.reading = output;
      readingSources.set(output, source);
      row.insertBefore(output, source);
    }
    source.setAttribute(SOURCE_MARKER, "hidden");
  }

  function forgetSource(source) {
    const state = sourceStates.get(source);
    sourceStates.delete(source);
    trackedSources.delete(source);
    pendingSources.delete(source);
    if (state?.reading) state.reading.remove();
    if (source.getAttribute(SOURCE_MARKER) === "hidden") source.removeAttribute(SOURCE_MARKER);
  }

  function ensureStyle() {
    if (styleElement?.isConnected) return;
    styleElement = document.createElement("style");
    styleElement.id = STYLE_ID;
    styleElement.textContent = `
      #blyrics-wrapper ${HIDDEN_SOURCE_SELECTOR} { display: none !important; }
      #blyrics-wrapper .blh-reading[data-blh-owned] {
        display: block;
        font-family: var(--blyrics-translated-font-family, var(--blyrics-font-family, sans-serif)), "Noto Sans KR", sans-serif;
        font-size: var(--blyrics-translated-font-size, 0.55em);
        font-weight: var(--blyrics-translated-font-weight, 600);
        color: var(--blyrics-translated-color, inherit);
        line-height: 1.45;
        white-space: pre-wrap;
        word-break: keep-all;
        overflow-wrap: anywhere;
        unicode-bidi: plaintext;
      }
    `;
    (document.head ?? document.documentElement).appendChild(styleElement);
  }

  function serializeCopiedFragment(fragment) {
    for (const hidden of fragment.querySelectorAll(
      `${HIDDEN_SOURCE_SELECTOR}, .blyrics-highlight-run, .blyrics-word-highlight`
    )) hidden.remove();

    const parts = [];
    const blockSelector = `${ROW_SELECTOR}, .blyrics-line-main, .blyrics-background-line, .blh-reading, .blyrics--translated, ${SOURCE_SELECTOR}`;
    function append(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.data);
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches("script, style")) return;
        if (node.tagName === "BR") {
          parts.push("\n");
          return;
        }
      }
      const block = node.nodeType === Node.ELEMENT_NODE && node.matches(blockSelector);
      if (block) parts.push("\n");
      for (const child of node.childNodes) append(child);
      if (block) parts.push("\n");
    }
    append(fragment);
    return parts.join("")
      .replace(/[\t ]+/gu, " ")
      .replace(/[\t ]*\n[\t ]*/gu, "\n")
      .replace(/\n+/gu, "\n")
      .trim();
  }

  function onCopy(event) {
    const selection = document.getSelection();
    if (!root || !event.clipboardData || !selection || selection.isCollapsed) return;
    const fragments = [];
    let hasReading = false;
    for (let index = 0; index < selection.rangeCount; index += 1) {
      const range = selection.getRangeAt(index);
      if (!root.contains(range.commonAncestorContainer)) return;
      const fragment = range.cloneContents();
      hasReading ||= Boolean(fragment.querySelector(`${OWNED_SELECTOR}, ${HIDDEN_SOURCE_SELECTOR}`)) ||
        isOwned(range.startContainer) || isOwned(range.endContainer);
      fragments.push(fragment);
    }
    if (!hasReading) return;
    const text = fragments.map(serializeCopiedFragment).filter(Boolean).join("\n");
    if (!text) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    // Better Lyrics also customizes copying. Do not let it reinsert the hidden Latin text.
    event.stopImmediatePropagation();
  }

  function watchAncestors(anchor) {
    const next = [];
    for (let parent = anchor?.parentNode; parent; parent = parent.parentNode) next.push(parent);
    if (next.length === ancestry.length && next.every((node, index) => node === ancestry[index])) return;
    ancestryObserver.disconnect();
    ancestry = next;
    for (const parent of ancestry) ancestryObserver.observe(parent, { childList: true });
  }

  function unmount() {
    contentObserver.disconnect();
    if (root) root.removeEventListener("copy", onCopy, true);
    if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
    scheduledFrame = 0;
    for (const source of trackedSources) forgetSource(source);
    pendingSources.clear();
    sourceStates = new WeakMap();
    readingSources = new WeakMap();
    root = null;
  }

  function mount(nextRoot) {
    if (root === nextRoot) return;
    unmount();
    root = nextRoot;
    discoveryObserver.disconnect();
    discoveryTarget = null;
    ensureStyle();
    watchAncestors(root);
    contentObserver.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["lang"],
    });
    root.addEventListener("copy", onCopy, true);
    visitSources(root, enqueue);
  }

  function discover() {
    if (suspended) return;
    const nextRoot = document.querySelector(ROOT_SELECTOR);
    if (nextRoot) {
      mount(nextRoot);
      return;
    }
    if (root) unmount();
    discoveryObserver.disconnect();
    discoveryTarget = document.querySelector("#tab-renderer") ?? document;
    discoveryObserver.observe(discoveryTarget, {
      childList: true,
      subtree: discoveryTarget === document,
    });
    watchAncestors(discoveryTarget);
  }

  function onDiscoveryChanges(records) {
    if (suspended || root) return;
    for (const record of records) {
      for (const added of record.addedNodes) {
        if (added.nodeType !== Node.ELEMENT_NODE) continue;
        if (added.matches("#tab-renderer, #blyrics-wrapper") ||
            added.querySelector("#tab-renderer, #blyrics-wrapper")) {
          discover();
          return;
        }
      }
    }
  }

  function onAncestryChanges() {
    if (suspended) return;
    const anchor = root ?? discoveryTarget;
    if (!anchor || (anchor !== document && !anchor.isConnected)) discover();
    else watchAncestors(anchor);
  }

  window.addEventListener("pagehide", () => {
    suspended = true;
    discoveryObserver.disconnect();
    ancestryObserver.disconnect();
    ancestry = [];
    discoveryTarget = null;
    unmount();
    styleElement?.remove();
  });
  window.addEventListener("pageshow", () => {
    if (!suspended) return;
    suspended = false;
    discover();
  });
  discover();
})();

/*
                      EUROPEAN UNION PUBLIC LICENCE v. 1.2
                      EUPL © the European Union 2007, 2016

This European Union Public Licence (the ‘EUPL’) applies to the Work (as defined
below) which is provided under the terms of this Licence. Any use of the Work,
other than as authorised under this Licence is prohibited (to the extent such
use is covered by a right of the copyright holder of the Work).

The Work is provided under the terms of this Licence when the Licensor (as
defined below) has placed the following notice immediately following the
copyright notice for the Work:

        Licensed under the EUPL

or has expressed by any other means his willingness to license under the EUPL.

1. Definitions

In this Licence, the following terms have the following meaning:

- ‘The Licence’: this Licence.

- ‘The Original Work’: the work or software distributed or communicated by the
  Licensor under this Licence, available as Source Code and also as Executable
  Code as the case may be.

- ‘Derivative Works’: the works or software that could be created by the
  Licensee, based upon the Original Work or modifications thereof. This Licence
  does not define the extent of modification or dependence on the Original Work
  required in order to classify a work as a Derivative Work; this extent is
  determined by copyright law applicable in the country mentioned in Article 15.

- ‘The Work’: the Original Work or its Derivative Works.

- ‘The Source Code’: the human-readable form of the Work which is the most
  convenient for people to study and modify.

- ‘The Executable Code’: any code which has generally been compiled and which is
  meant to be interpreted by a computer as a program.

- ‘The Licensor’: the natural or legal person that distributes or communicates
  the Work under the Licence.

- ‘Contributor(s)’: any natural or legal person who modifies the Work under the
  Licence, or otherwise contributes to the creation of a Derivative Work.

- ‘The Licensee’ or ‘You’: any natural or legal person who makes any usage of
  the Work under the terms of the Licence.

- ‘Distribution’ or ‘Communication’: any act of selling, giving, lending,
  renting, distributing, communicating, transmitting, or otherwise making
  available, online or offline, copies of the Work or providing access to its
  essential functionalities at the disposal of any other natural or legal
  person.

2. Scope of the rights granted by the Licence

The Licensor hereby grants You a worldwide, royalty-free, non-exclusive,
sublicensable licence to do the following, for the duration of copyright vested
in the Original Work:

- use the Work in any circumstance and for all usage,
- reproduce the Work,
- modify the Work, and make Derivative Works based upon the Work,
- communicate to the public, including the right to make available or display
  the Work or copies thereof to the public and perform publicly, as the case may
  be, the Work,
- distribute the Work or copies thereof,
- lend and rent the Work or copies thereof,
- sublicense rights in the Work or copies thereof.

Those rights can be exercised on any media, supports and formats, whether now
known or later invented, as far as the applicable law permits so.

In the countries where moral rights apply, the Licensor waives his right to
exercise his moral right to the extent allowed by law in order to make effective
the licence of the economic rights here above listed.

The Licensor grants to the Licensee royalty-free, non-exclusive usage rights to
any patents held by the Licensor, to the extent necessary to make use of the
rights granted on the Work under this Licence.

3. Communication of the Source Code

The Licensor may provide the Work either in its Source Code form, or as
Executable Code. If the Work is provided as Executable Code, the Licensor
provides in addition a machine-readable copy of the Source Code of the Work
along with each copy of the Work that the Licensor distributes or indicates, in
a notice following the copyright notice attached to the Work, a repository where
the Source Code is easily and freely accessible for as long as the Licensor
continues to distribute or communicate the Work.

4. Limitations on copyright

Nothing in this Licence is intended to deprive the Licensee of the benefits from
any exception or limitation to the exclusive rights of the rights owners in the
Work, of the exhaustion of those rights or of other applicable limitations
thereto.

5. Obligations of the Licensee

The grant of the rights mentioned above is subject to some restrictions and
obligations imposed on the Licensee. Those obligations are the following:

Attribution right: The Licensee shall keep intact all copyright, patent or
trademarks notices and all notices that refer to the Licence and to the
disclaimer of warranties. The Licensee must include a copy of such notices and a
copy of the Licence with every copy of the Work he/she distributes or
communicates. The Licensee must cause any Derivative Work to carry prominent
notices stating that the Work has been modified and the date of modification.

Copyleft clause: If the Licensee distributes or communicates copies of the
Original Works or Derivative Works, this Distribution or Communication will be
done under the terms of this Licence or of a later version of this Licence
unless the Original Work is expressly distributed only under this version of the
Licence — for example by communicating ‘EUPL v. 1.2 only’. The Licensee
(becoming Licensor) cannot offer or impose any additional terms or conditions on
the Work or Derivative Work that alter or restrict the terms of the Licence.

Compatibility clause: If the Licensee Distributes or Communicates Derivative
Works or copies thereof based upon both the Work and another work licensed under
a Compatible Licence, this Distribution or Communication can be done under the
terms of this Compatible Licence. For the sake of this clause, ‘Compatible
Licence’ refers to the licences listed in the appendix attached to this Licence.
Should the Licensee's obligations under the Compatible Licence conflict with
his/her obligations under this Licence, the obligations of the Compatible
Licence shall prevail.

Provision of Source Code: When distributing or communicating copies of the Work,
the Licensee will provide a machine-readable copy of the Source Code or indicate
a repository where this Source will be easily and freely available for as long
as the Licensee continues to distribute or communicate the Work.

Legal Protection: This Licence does not grant permission to use the trade names,
trademarks, service marks, or names of the Licensor, except as required for
reasonable and customary use in describing the origin of the Work and
reproducing the content of the copyright notice.

6. Chain of Authorship

The original Licensor warrants that the copyright in the Original Work granted
hereunder is owned by him/her or licensed to him/her and that he/she has the
power and authority to grant the Licence.

Each Contributor warrants that the copyright in the modifications he/she brings
to the Work are owned by him/her or licensed to him/her and that he/she has the
power and authority to grant the Licence.

Each time You accept the Licence, the original Licensor and subsequent
Contributors grant You a licence to their contributions to the Work, under the
terms of this Licence.

7. Disclaimer of Warranty

The Work is a work in progress, which is continuously improved by numerous
Contributors. It is not a finished work and may therefore contain defects or
‘bugs’ inherent to this type of development.

For the above reason, the Work is provided under the Licence on an ‘as is’ basis
and without warranties of any kind concerning the Work, including without
limitation merchantability, fitness for a particular purpose, absence of defects
or errors, accuracy, non-infringement of intellectual property rights other than
copyright as stated in Article 6 of this Licence.

This disclaimer of warranty is an essential part of the Licence and a condition
for the grant of any rights to the Work.

8. Disclaimer of Liability

Except in the cases of wilful misconduct or damages directly caused to natural
persons, the Licensor will in no event be liable for any direct or indirect,
material or moral, damages of any kind, arising out of the Licence or of the use
of the Work, including without limitation, damages for loss of goodwill, work
stoppage, computer failure or malfunction, loss of data or any commercial
damage, even if the Licensor has been advised of the possibility of such damage.
However, the Licensor will be liable under statutory product liability laws as
far such laws apply to the Work.

9. Additional agreements

While distributing the Work, You may choose to conclude an additional agreement,
defining obligations or services consistent with this Licence. However, if
accepting obligations, You may act only on your own behalf and on your sole
responsibility, not on behalf of the original Licensor or any other Contributor,
and only if You agree to indemnify, defend, and hold each Contributor harmless
for any liability incurred by, or claims asserted against such Contributor by
the fact You have accepted any warranty or additional liability.

10. Acceptance of the Licence

The provisions of this Licence can be accepted by clicking on an icon ‘I agree’
placed under the bottom of a window displaying the text of this Licence or by
affirming consent in any other similar way, in accordance with the rules of
applicable law. Clicking on that icon indicates your clear and irrevocable
acceptance of this Licence and all of its terms and conditions.

Similarly, you irrevocably accept this Licence and all of its terms and
conditions by exercising any rights granted to You by Article 2 of this Licence,
such as the use of the Work, the creation by You of a Derivative Work or the
Distribution or Communication by You of the Work or copies thereof.

11. Information to the public

In case of any Distribution or Communication of the Work by means of electronic
communication by You (for example, by offering to download the Work from a
remote location) the distribution channel or media (for example, a website) must
at least provide to the public the information requested by the applicable law
regarding the Licensor, the Licence and the way it may be accessible, concluded,
stored and reproduced by the Licensee.

12. Termination of the Licence

The Licence and the rights granted hereunder will terminate automatically upon
any breach by the Licensee of the terms of the Licence.

Such a termination will not terminate the licences of any person who has
received the Work from the Licensee under the Licence, provided such persons
remain in full compliance with the Licence.

13. Miscellaneous

Without prejudice of Article 9 above, the Licence represents the complete
agreement between the Parties as to the Work.

If any provision of the Licence is invalid or unenforceable under applicable
law, this will not affect the validity or enforceability of the Licence as a
whole. Such provision will be construed or reformed so as necessary to make it
valid and enforceable.

The European Commission may publish other linguistic versions or new versions of
this Licence or updated versions of the Appendix, so far this is required and
reasonable, without reducing the scope of the rights granted by the Licence. New
versions of the Licence will be published with a unique version number.

All linguistic versions of this Licence, approved by the European Commission,
have identical value. Parties can take advantage of the linguistic version of
their choice.

14. Jurisdiction

Without prejudice to specific agreement between parties,

- any litigation resulting from the interpretation of this License, arising
  between the European Union institutions, bodies, offices or agencies, as a
  Licensor, and any Licensee, will be subject to the jurisdiction of the Court
  of Justice of the European Union, as laid down in article 272 of the Treaty on
  the Functioning of the European Union,

- any litigation arising between other parties and resulting from the
  interpretation of this License, will be subject to the exclusive jurisdiction
  of the competent court where the Licensor resides or conducts its primary
  business.

15. Applicable Law

Without prejudice to specific agreement between parties,

- this Licence shall be governed by the law of the European Union Member State
  where the Licensor has his seat, resides or has his registered office,

- this licence shall be governed by Belgian law if the Licensor has no seat,
  residence or registered office inside a European Union Member State.

Appendix

‘Compatible Licences’ according to Article 5 EUPL are:

- GNU General Public License (GPL) v. 2, v. 3
- GNU Affero General Public License (AGPL) v. 3
- Open Software License (OSL) v. 2.1, v. 3.0
- Eclipse Public License (EPL) v. 1.0
- CeCILL v. 2.0, v. 2.1
- Mozilla Public Licence (MPL) v. 2
- GNU Lesser General Public Licence (LGPL) v. 2.1, v. 3
- Creative Commons Attribution-ShareAlike v. 3.0 Unported (CC BY-SA 3.0) for
  works other than software
- European Union Public Licence (EUPL) v. 1.1, v. 1.2
- Québec Free and Open-Source Licence — Reciprocity (LiLiQ-R) or Strong
  Reciprocity (LiLiQ-R+).

The European Commission may update this Appendix to later versions of the above
licences without producing a new version of the EUPL, as long as they provide
the rights granted in Article 2 of this Licence and protect the covered Source
Code from exclusive appropriation.

All other changes or additions to this Appendix require the production of a new
EUPL version.
*/
