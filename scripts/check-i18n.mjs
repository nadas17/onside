#!/usr/bin/env node
/**
 * i18n drift checker.
 *
 * tr.json'u referans alır (default locale), her diğer locale'in tüm anahtarlarına
 * sahip olduğunu doğrular. ICU placeholder'ları (örn. {count}) da farklı çıkmamalı.
 *
 * Kullanım:
 *   node scripts/check-i18n.mjs           # exit 1 varsa farklılık
 *   pnpm i18n:check
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const REFERENCE = "tr";
const LOCALES = ["tr", "en", "pl"];
const MESSAGES_DIR = "messages";

function flatten(obj, prefix = "") {
  const out = new Map();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
    } else {
      out.set(key, v);
    }
  }
  return out;
}

function placeholders(s) {
  if (typeof s !== "string") return new Set();
  return new Set([...s.matchAll(/\{(\w+)/g)].map((m) => m[1]));
}

async function readLocale(loc) {
  const buf = await readFile(path.join(MESSAGES_DIR, `${loc}.json`), "utf8");
  return flatten(JSON.parse(buf));
}

const reference = await readLocale(REFERENCE);
const refKeys = new Set(reference.keys());

let problems = 0;

for (const loc of LOCALES) {
  if (loc === REFERENCE) continue;
  const target = await readLocale(loc);
  const targetKeys = new Set(target.keys());

  const missing = [...refKeys].filter((k) => !targetKeys.has(k));
  const extra = [...targetKeys].filter((k) => !refKeys.has(k));

  if (missing.length) {
    console.error(`✘ ${loc}.json missing ${missing.length} key(s):`);
    missing.slice(0, 20).forEach((k) => console.error(`    ${k}`));
    if (missing.length > 20)
      console.error(`    … (+${missing.length - 20} more)`);
    problems += missing.length;
  }

  if (extra.length) {
    console.error(
      `✘ ${loc}.json has ${extra.length} key(s) not in reference (${REFERENCE}):`,
    );
    extra.slice(0, 20).forEach((k) => console.error(`    ${k}`));
    problems += extra.length;
  }

  // ICU placeholder mismatch
  for (const k of refKeys) {
    if (!targetKeys.has(k)) continue;
    const refPh = placeholders(reference.get(k));
    const tgtPh = placeholders(target.get(k));
    const missingPh = [...refPh].filter((p) => !tgtPh.has(p));
    const extraPh = [...tgtPh].filter((p) => !refPh.has(p));
    if (missingPh.length || extraPh.length) {
      console.error(
        `✘ ${loc}.json placeholder mismatch at "${k}":`,
        missingPh.length ? `missing {${missingPh.join(",")}}` : "",
        extraPh.length ? `extra {${extraPh.join(",")}}` : "",
      );
      problems += 1;
    }
  }
}

if (problems === 0) {
  console.log(
    `✓ i18n in sync — ${refKeys.size} keys × ${LOCALES.length} locales`,
  );
} else {
  console.error(`\n✘ ${problems} drift problem(s) detected`);
  process.exit(1);
}
