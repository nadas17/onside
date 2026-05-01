# ADR-0003 — Etkinlik katılımı organizer onayına bağlı (instant join kaldırıldı)

**Tarih:** 2026-04-30
**Durum:** Kabul edildi
**Bağlam Phase:** Phase 4 sonu / Phase 5 başı geçişi
**Spec'te etkilediği bölümler:** §0 north-star journey adım 3, §11 lifecycle, §19 P1-P9

## Bağlam

Spec §0 north-star journey:

> "Katıl" → pozisyon seç → onay. **Anında kadroda görünür**.

Phase 4'te bu davranış birebir uygulandı. Spec yazarı kullanıcı şu gerekçeyle revize etti:

> "Maça katılım fonksiyonu çalışıyor fakat maçı oluşturan kişiye davet gitmesi gerekli. Maçı oluşturan kişinin kontrolünde olmalı."

Yani: kullanıcı bir etkinliğe katılmak istediğinde organizer'ın **onayını** beklemeli.

Soru turunda 4 nokta netleşti:

1. **Kapsam**: tüm etkinlikler onay-modunda (toggle yok, tek kural).
2. **Pending capacity tutmaz**: sadece `confirmed` katılımcılar `capacity`'e sayılır.
3. **Mevcut katılımlar**: test verisi olarak silinir; sıfırdan başla.
4. **Reddetme sebebi**: opsiyonel.

## Karar

### Status state machine (`participant_status`)

```
                                 ┌─→ confirmed ─┬─→ cancelled (kullanıcı/organizer)
   pending ───[organizer approve]┘              │
       │                                        ├─→ no_show / attended (Phase 7)
       └─→ cancelled (organizer reject; kullanıcı withdraw)
```

- **Yeni başlangıç durumu**: `pending` (eskiden `confirmed`).
- `confirmed` artık sadece organizer onayıyla.
- `cancelled` hem organizer reject hem kullanıcı withdraw için aynı kalır; ayrım `rejected_reason` kolonuyla yapılır (NULL = self-cancel, NOT NULL = reject).

### Capacity hesabı

- `confirmed_count(event_id)` aynı kalır — sadece `status = 'confirmed'` sayar.
- `event.status` open ↔ full geçişi `confirmed_count` ≥ capacity tetiklenir.
- Pending sayısının limiti yok (Phase 9'da abuse görülürse rate-limit eklenir).

### RPC değişiklikleri

- `join_event(uuid, position)` → INSERT `status = 'pending'`. Capacity check yine var ama `confirmed_count`'a bakar (full ise organizer henüz onaylamamış demektir, yine de talep insert edilebilir? **Hayır**: full'da yeni talep alınmaz çünkü organizer'ın seçimi olmuş demektir; öyle olsa "Kadro dolu" döner.)
- `approve_participant(uuid)` (organizer-only) — pending → confirmed; capacity check + open→full transition.
- `reject_participant(uuid, reason text)` — pending → cancelled + `rejected_reason`.
- `cancel_rsvp(uuid)` — kullanıcı pending VEYA confirmed satırını kendisi cancel eder.
- `kick_participant(uuid, uuid)` — organizer confirmed satırı cancel eder (aynı kalır).

### UI etkisi

- `JoinButton` states: "Maça katıl" → "Talep gönder"; "Talebim onay bekliyor" + "Talebimi geri çek"; "Onaylandı (GK olarak)" + "Kaydımı iptal et".
- `RosterList`: confirmed'ler ana liste (mevcut); organizer için ek "Onay bekleyen talepler" bölümü (approve/reject butonları).

### Spec sapmaları (yazılı kayıt)

- §0 adım 3: "Anında kadroda" → **organizer onayından sonra kadroda**.
- §1 "private events yok": geçerli kalır — etkinlik HÂLÂ public, sadece roster'a girmek onay gerekiyor.
- §11 lifecycle: aynı kalır; participant_status'taki değişim event status'ünü etkilemez (sadece confirmed_count).
- §19 P1 ("Kapasite dolu → button disabled"): değişti — "Kadro dolu (onaylananlar)" mesajı.

### Mevcut data

- Migration 0005 `event_participant` tablosunu `TRUNCATE` eder. Phase 4 testlerinde eklenen confirmed satırlar silinir. Yeni katılımlar approval flow'undan geçer.

## Sonuçlar

### Pozitif

- Organizer'a tam kontrol — toxicity, skill mismatch, friend group filtering organic olarak çalışır.
- Spec §1 "private events yok" maddesini bozmadan benzer kontrol sağlar (etkinlik public, roster organizer-curated).
- Pending limiti yok → organizer'a esnek seçim havuzu.
- Reddetme opsiyonel reason → fast UX.

### Negatif / Risk

- **Spam pending**: bir kullanıcı her etkinliğe talep gönderebilir. Phase 9'da per-user/per-event rate-limit (ör. 3 pending/saat).
- **Kullanıcı bekleme**: anında kadroya girmenin verdiği gratification kayboldu. UX olarak organizer'a "talebim ne zaman cevaplanacak" bilgisi eklenmeli (Phase 5+ chat sistem mesajı veya Phase 9 notification).
- **No-show çift sayım**: Phase 7'de no_show flag pending değil confirmed kullanıcılar için anlamlı (zaten öyle).
- **Edge case (full + reject + new pending)**: organizer X'i reject etti, capacity 1 boşaldı, yeni talepler gelir. Sıralama / FIFO Phase 9'da değerlendirilebilir.

### Geri çevirme koşulu

Production öncesi UX araştırmasında "anında kadroya girmek" daha iyi gelirse: `event` tablosuna `requires_approval boolean default true` flag eklenir, RPC'ler bu flag'e göre dallanır. Tek migration.

## Plan etkisi

`~/.claude/plans/spec-dosyas-n-oku-gerekliyse-enumerated-mist.md` Phase 4 bölümü bu ADR ile güncellenir:

- "joinEvent atomic transaction" → "joinEvent pending insert"
- Yeni: approve_participant, reject_participant
- "anında confirmed" → "pending → onay → confirmed"
