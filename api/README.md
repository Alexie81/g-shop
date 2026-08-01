# G-Shop API

API REST PHP 8 + MySQL pentru aplicația Expo G-Shop. Aplicația mobilă nu se conectează niciodată direct la MySQL; toate operațiile trec prin HTTPS, autentificare și verificarea permisiunilor.

## Configurare

1. Copiază `.env.example` în `.env` pe server și completează datele MySQL, `APP_KEY` și un `INSTALL_TOKEN` unic.
2. Publică dosarul în `public_html/app-api/`.
3. Accesează o singură dată `https://domeniu/app-api/install.php?token=...`.
4. Instalarea creează `.installed`, iar endpointul nu mai poate fi refolosit.
5. Autentificarea inițială este `admin` / `admin`; parola trebuie schimbată imediat din Setări.

## Securitate și spațiu

- UUID-urile sunt stocate în `BINARY(16)`, nu `CHAR(36)`.
- Tokenul QR este un UUID v4 aleator de 128 biți, stocat în 16 bytes și nu conține date personale.
- Access tokenurile sunt JWT HMAC cu viață scurtă; în DB se păstrează doar hashul SHA-256 al refresh tokenului.
- Semnăturile și atașamentele sunt fișiere pe disc; MySQL păstrează numai calea.
- Relațiile N:M sunt normalizate, iar indexurile sunt limitate la filtrele folosite.
- Auditul păstrează doar câmpurile efectiv modificate și exclude parole, tokenuri și semnături.
- Ștergerea unui utilizator este soft-delete, pentru a păstra trasabilitatea auditului.

Pentru a urmări spațiul folosit:

```sql
SELECT table_name,
       ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY data_length + index_length DESC;
```

## Endpointuri

### Autentificare

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/forgot-password`
- `POST /auth/change-password`

### Proprietăți și dashboard

- `GET /properties`
- `GET /dashboard?propertyId={uuid}`

### Clienți și QR

- `GET /clients?propertyId={uuid}&query=&qrStatus=`
- `POST /clients` — creează atomic clientul și codul său QR permanent; răspunsul include direct obiectul `qr` cu status `GENERATED`
- `GET /clients/{id}`
- `PUT /clients/{id}`
- `GET /clients/{id}/intake`
- `POST /clients/{id}/qr` — endpoint compatibil și idempotent: returnează QR-ul existent fără să-i schimbe tokenul; creează unul doar pentru un client legacy care nu are QR
- `POST /clients/{id}/qr/share`
- `POST /clients/{id}/qr/use`
- `POST /qr/resolve`
- `GET|POST /public/client-form/{token}`

Codurile QR sunt generate exclusiv de API și salvate în MySQL, în aceeași tranzacție cu clientul. Un cod nou nu expiră (`expiresAt: null`) și nu poate fi regenerat sau înlocuit. Valorile istorice din `expires_at` și statusurile vechi rămân în schemă pentru compatibilitatea datelor existente, însă orice QR activ este tratat ca permanent. Cererile repetate către endpointul de generare nu adaugă rânduri și nu produc evenimente de audit false. Formularul public poate fi trimis o singură dată (`409` la repetare), inclusiv când sosesc cereri simultane, dar același QR rămâne permanent valid pentru scanare. Operațiile autentificate verifică întotdeauna că QR-ul aparține unei proprietăți accesibile utilizatorului, iar tokenul și URL-ul public sunt returnate numai utilizatorilor cu permisiunea `qr.share`.

### Service

- `GET|POST /service-sheets`
- `GET|PUT /service-sheets/{id}`
- `POST /service-sheets/{id}/signature`
- `GET /collaborators?propertyId={uuid}`
- `GET /collaborators/{id}?propertyId={uuid}`
- `POST /collaborators`
- `PUT /collaborators/{id}`
- `DELETE /collaborators/{id}?propertyId={uuid}`
- `GET /collaborator-finances?propertyId={uuid}` — totaluri achitate/de achitat, grupate pe colaborator și client
- `PUT /commissions/client-status` — marchează comisioanele unui client ca achitate sau de achitat; body: `{ "propertyId": "uuid", "collaboratorId": "uuid", "clientId": "uuid", "paid": true|false }`

`POST /collaborators` primește datele colaboratorului și `propertyIds`, validează regula implicită de comision și returnează obiectul complet creat. `PUT /collaborators/{id}` primește obligatoriu `propertyId` în body, plus câmpurile care trebuie modificate. Modificarea regulii implicite se aplică atribuirilor viitoare și nu rescrie comisioanele istorice.

`DELETE /collaborators/{id}` este o ștergere logică sigură: colaboratorul dispare din lista activă, iar datele, legăturile și istoricul financiar rămân în baza de date. Cererea este refuzată cu `409` dacă există clienți activi atribuiți sau comisioane neachitate. Pentru un colaborator legat de mai multe proprietăți, utilizatorul trebuie să aibă acces la toate proprietățile înainte de ștergerea globală.

### Administrare

- `GET|POST /users`
- `PUT /users/{id}/permissions`
- `PUT /users/{id}/password`
- `DELETE /users/{id}`
- `GET /audit-logs`
- `GET /reports`

Răspunsurile au forma `{ "data": ... }`. Erorile au forma `{ "message": "...", "errors": ... }` și un status HTTP corespunzător.
