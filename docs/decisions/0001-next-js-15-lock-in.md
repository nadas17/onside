# ADR-0001 — Next.js 15.5.x lock-in (Next 16 değil)

**Tarih:** 2026-04-30
**Durum:** Kabul edildi
**Bağlam Phase:** Phase 0 — Bootstrap

## Bağlam

`HALISAHA_SPEC.md` Section 2 "Tech Stack (Kilitli — değiştirme)" tablosunda Next.js 15 belirtilmiş. Phase 0 bootstrap sırasında `npx create-next-app@latest` Next.js 16.2.4 indirdi. Next 16, Next 15'in stable major güncellemesi (Apr 2026 itibarıyla); App Router, Server Components, Server Actions semantics'inde bozucu değişiklik minimal.

## Karar

Next.js 15.5.x (en güncel 15.x patch — şu anda 15.5.15) kullanılır. `create-next-app@^15` ile yeniden scaffold edildi. `package.json` dependency: `"next": "15.5.15"`, `"eslint-config-next": "15.5.15"`.

## Sebep

1. **Spec'e uyum.** Spec yazarı kullanıcı "kilitli — değiştirme" demiş. Plan onaylanırken bu maddenin değişmediği teyit edildi.
2. **Risk azaltma.** Next 16'da subtle breaking change'ler olabilir (örn `next.config` tipleri, API route signature, fetch caching default'u). MVP süresince bu sürprizleri yaşamak istemeyiz.
3. **Bağımlılık uyumluluğu.** `next-intl@4`, `@supabase/ssr@0.10`, `eslint-config-next` Next 15 ile sorunsuz. Next 16 ile bazı paketler hâlâ peer warning üretebilir.

## Sonuçları

- (+) Spec'in geri kalanı (özellikle middleware pattern'leri, server actions, dynamic routes) Next 15 docs'u referans alarak yazılır.
- (+) `eslint-config-next@15.5.15` Next 15.5 ile uyumlu — built-in lint kuralları doğru.
- (–) Next 16'nın yeni özellikleri (örn yeni cache APIs) kullanılamaz. Phase 9 sonrasında upgrade adayı.

## Geri çevirme koşulu

- Spec yazarı `Next.js 16'ya geç` derse, ayrı bir ADR ile karar yenilenir. Migration: `pnpm up next@latest eslint-config-next@latest` + `next.config.ts` audit.
