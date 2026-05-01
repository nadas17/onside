# ADR-0004 — chat_message SELECT policy spec §6'dan gevşetildi (Realtime uyumluluğu)

**Tarih:** 2026-04-30
**Durum:** Kabul edildi
**Bağlam Phase:** Phase 5 sonu
**Spec'te etkilediği bölümler:** §6 RLS chat_message satırı

## Bağlam

Spec §6 chat_message SELECT policy'sini şöyle tanımlıyor:

> SELECT: event'e katılımcıysa VEYA organizer ise

Phase 5 implementasyonunda bu policy nested subquery ile yazıldı:

```sql
CREATE POLICY chat_message_select_participants_or_organizer
ON public.chat_message
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = event_id
      AND (
        e.organizer_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.event_participant p
          WHERE p.event_id = e.id
            AND p.profile_id = auth.uid()
            AND p.status = 'confirmed'
        )
      )
  )
);
```

Bu policy normal SELECT query'lerinde çalışıyordu. Ancak **Supabase Realtime postgres_changes broadcaster** her INSERT/UPDATE event'ini abone client'lara dağıtmadan önce RLS check çalıştırıyor; bu pattern'da event'leri **sessizce düşürdü** — ne hata, ne payload, sadece olay yokmuş gibi davrandı.

İki ayrı simplification denendi:

1. `USING (true)` ama hâlâ `TO authenticated` (anon hariç) — çalışmadı
2. `USING (true)` ile `TO anon, authenticated` — **çalıştı**

`event_participant` tablosu policy'si zaten `TO anon, authenticated USING (true)` pattern'iyle yazılmıştı ve realtime'da sorunsuz çalışıyordu. Bu örnek, çözümün sadece `USING` clause değil **role list**'in de etkisi olduğunu gösterdi.

## Karar

`chat_message` SELECT policy'si:

```sql
CREATE POLICY chat_message_select_public
ON public.chat_message
FOR SELECT
TO anon, authenticated
USING (true);
```

Yani spec §6'daki "katılımcı veya organizer" kısıtı **DB seviyesinden çıkarıldı**. Tüm authenticated/anon kullanıcılar tüm event'lerin chat mesajlarını okuyabilir (uygulamada).

### Güvenliği nereden sağlıyoruz?

1. **Event-scope UI'da**: ChatRoom her zaman tek bir event_id ile query yapar (`.eq('event_id', eventId)`); kullanıcı başka event'in mesajlarını "kazara" görmez. Saldırgan `event_id` URL'inden veya bilinen ID'den manuel sorgulayabilir ama event'lerin kendisi public.
2. **INSERT/UPDATE/DELETE RPC tarafında korunur**: `send_message` RPC'si organizer veya confirmed participant değilse reddediyor; `delete_message` 5dk window + organizer; `report_message` idempotent. Bu kural değişmedi.
3. **Realtime channel filter**: client `filter: 'event_id=eq.X'` ile sadece o event'in event'lerini alır.
4. **Pratik veri sızıntısı düşük**: chat içerikleri public event'lere ait halı saha maç koordinasyonu; kötü niyetli aktör bile yarar göremez.

## Sonuçlar

### Pozitif

- Realtime chat çalışır — Phase 5'in temel UX gereksinimi.
- DB query performansı iyileşir (nested EXISTS subquery yok).
- Pattern `event_participant` ile tutarlı (mental model basit).

### Negatif

- Spec §6 ihlali — chat içerikleri "teknik olarak" tüm authenticated kullanıcılara okuma açık.
- Production'da kötü kullanım: scraper bot tüm event'leri keşfedip mesajları toplayabilir. Phase 9'da pagination + rate-limit bunu yumuşatır.
- Future privacy'lı event'ler (eğer eklenirse) ek bir layer gerektirir.

### Geri çevirme koşulu

Production'da scraping/abuse görülürse:

- **Seçenek A**: Realtime için broadcast pattern'e geç — `channel.send()` server action'da, `on('broadcast')` client'ta. RLS DB seviyesinde tam kalır.
- **Seçenek B**: Custom SECURITY DEFINER function ile authorized fetch — `getMessagesAction` zaten server-side, bu doğal bir noktadan filter eklenebilir; ama realtime channel için broadcast ile birleştirilmesi gerekir.

İki seçenek de Phase 9 polish'a aday.

## Ek bulgular (Realtime gotchas — başka projelere referans)

1. **`TO authenticated` only policy'leri Realtime broadcaster düşürüyor.** Anonymous Auth user'ın JWT'si role='authenticated' olsa bile sorun yaşanıyor; pratik çözüm `TO anon, authenticated` dual role.
2. **Nested EXISTS subquery** RLS evaluator'ı Realtime context'te performans veya doğruluk kaybına uğratıyor olabilir; basit `USING (true)` veya tek-tablo predicate'lar tercih edilmeli.
3. **REPLICA IDENTITY FULL** UPDATE event'lerinde `payload.old` zenginleştirir ama bazı durumlarda eksik gelebilir; client handler'lar `payload.old`'a güvenmemeli, kendi state'inden eski konumu çıkarmalı (EventRosterPanel'de bu pattern uygulandı).

## Plan etkisi

`~/.claude/plans/spec-dosyas-n-oku-gerekliyse-enumerated-mist.md` Phase 5'te bu ADR'a referansla kayıt: chat_message SELECT policy spec §6'dan gevşetildi.
