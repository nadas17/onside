# ADR-0002 — Anonymous Auth + nickname-only sign-up (email/OAuth yok, 16+ checkbox yok)

**Tarih:** 2026-04-30
**Durum:** Kabul edildi
**Bağlam Phase:** Phase 1 öncesi
**Spec'te etkilediği bölümler:** §7 Auth, §15.6 RODO 16+ checkbox

## Bağlam

`HALISAHA_SPEC.md` §7 email+password + Google OAuth + (env varsa) Apple OAuth + email confirmation şart koşuyor. §15.6 sign-up'ta "16 yaşından büyüğüm" checkbox'ı zorunlu. Spec yazarı kullanıcı şu gerekçeyle bu maddeleri MVP için revize etmek istedi:

> "Auth için sadece nickname kaydı ile giriş olsun. Kayıt ilk safhada uğraştırıcı olur. Önce insanların alışması lazım."

Soru sorulduğunda **Supabase Anonymous Auth + nickname** modeli + **16+ checkbox kaldır** opsiyonu seçildi.

## Karar

### Auth modeli

- **Supabase Anonymous Auth** ile arka planda gerçek `auth.users` satırı oluşturulur (`is_anonymous = true`).
- Frontend tek modal: **nickname** input → "Başla" butonu.
- Submit: `supabase.auth.signInAnonymously()` → `profile` insert (`username = nickname`, `display_name = nickname`, `skill_level = 'intermediate'`, `skill_rating = 1000`, `preferred_position = NULL`).
- **Yok:** email, password, OAuth (Google/Apple), email confirmation, sign-up form, sign-in form, password reset.
- Session: Supabase default (30 gün rolling cookie).
- `preferred_position` default NULL — kullanıcı ilk event'e join olurken pozisyon seçer (`event_participant.position` zaten zorunlu spec §5'te).

### 16+ checkbox

- Kaldırıldı. Sign-up'ta hiçbir checkbox yok.
- Onboarding tek bir input: nickname.

### Spec ile uyum

- **§5 profile schema**: değişmez. `email` zaten yok (auth.users'dan join, anonymous user için NULL döner).
- **§5 username**: unique, `^[a-z0-9_]{3,20}$` regex, 3-20 char — aynen.
- **§6 RLS**: tüm policy'ler aynen kalır. `auth.uid()` anonymous user için de var, `auth_user_active()` helper aynen çalışır.
- **§7 sign-up flow**: tamamen yeniden yazıldı (aşağıda).
- **§7 password reset**: silindi (password yok).
- **§7 hesap silme**: korunur (kullanıcı isterse `is_banned = true` + nickname scrub).
- **§15.6**: tek checkbox kaldırıldı. RODO açısından **production öncesi legal review** zorunlu.

### Yeni sign-up flow

1. İlk ziyaret: anasayfaya git → eğer cookie'de session yoksa `<JoinModal>` (kapatılamaz değil ama "Başlamak için nickname seç").
2. Modal: tek `<input>` nickname (real-time uniqueness check, 300ms debounce).
3. Submit:
   - Client: `supabase.auth.signInAnonymously()` → server'da `profile` insert (server action).
   - `username` çakışmasında: `nickname_2`, `nickname_3` öner (spec §19 A2 edge case korunur).
4. Modal kapanır, ana sayfa tam görünür.
5. Cookie'de session var oldukça kullanıcı = aynı profile.

### Upgrade path (gelecek faz)

- Phase 9 polish veya kullanıcı talebine göre: header'da "Hesabını koru" butonu.
- Email + magic link ile `supabase.auth.linkIdentity('email', { email })` → anonymous user identified olur.
- Profile aynen kalır, sadece `auth.users.email` doldurulur, `is_anonymous = false` olur.

## Sonuçlar

### Pozitif

- 0-friction kayıt. "İsim yaz, oyna" başla.
- Spec'in §6 RLS, §9 balance, §10 Elo, §11 lifecycle, §12 chat, §13 notification — hepsi etkilenmez. `auth.uid()` her yerde aynı.
- Future-proof: `linkIdentity` ile email upgrade kapısı açık.

### Negatif / Risk

- **Cihaz değişikliği = hesap kaybı**: cookie session olduğu için tarayıcı geçmişi temizlenirse veya farklı cihazda açılırsa yeni anonymous user. UX uyarısı: profil sayfasında "Hesabını başka cihazlarda kullanmak için kaydet" prompt'u (Phase 9'da).
- **Spam / sock-puppet riski**: aynı IP'den sınırsız anonymous user oluşturulabilir. Rate limit (spec §18) korunur — anonymous sign-up için per-IP **5/dakika** sıkı limit önerilir.
- **MVP üzeri abuse**: chat profanity / report (spec §12) infrastructure'ı banned user'ı engellediği için ban edildiğinde yeni anonymous user oluşturup geri dönmek kolay. IP-based ban veya cihaz fingerprint Phase 9'a değerlendirme konusu.
- **RODO 16+ kaldırıldı**: production gitmeden önce **legal review zorunlu**. Polonya / EU regülasyonları için danışmanlık.
- **Username yine unique**: nickname çakıştığında alternatif öneri zorunlu (UX kalitesi etkilenebilir).

### Geri çevirme koşulu

Production öncesi legal review email/OAuth eklenmesini gerektirirse:

- Migration: signUp/signIn flow eklenir, "hesabını koru" buton ile mevcut anonymous user'lar `linkIdentity` ile email'e bağlanır.
- 16+ checkbox geri eklenir (sadece yeni kullanıcılar için, mevcut anonymous user'lara ban yok).

## Plan etkisi

`~/.claude/plans/spec-dosyas-n-oku-gerekliyse-enumerated-mist.md` Phase 1 bölümü bu ADR ile güncellenir:

- Email/OAuth flows silinir.
- Onboarding tek input.
- 16+ checkbox kaldırılır.
- Anonymous → identified upgrade Phase 9 backlog'una eklenir.
