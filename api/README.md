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
- `PUT /auth/profile` — actualizează exclusiv prenumele și numele utilizatorului autentificat; body: `{ "firstName": "Alex", "lastName": "Ionescu" }`
- `POST /auth/forgot-password`
- `POST /auth/change-password`

### Proprietăți și dashboard

- `GET /properties`
- `GET /dashboard?propertyId={uuid}`
- `POST /admin/migrations/collaborator-presets` — migrare administrativă idempotentă pentru instalările existente; necesită `settings.manage`
- `POST /admin/migrations/client-finance` — creează idempotent structurile compacte pentru finanțe, cheltuieli și participanți și adaugă statusul client `FINALIZED`; necesită `settings.manage`

### Clienți și QR

- `GET /clients?propertyId={uuid}&query=&qrStatus=`
- `POST /clients` — creează atomic clientul și codul său QR permanent; răspunsul include direct obiectul `qr` cu status `GENERATED`
- `GET /clients/{id}`
- `PUT /clients/{id}`
- `DELETE /clients/{id}` — ștergere logică tranzacțională pentru swipe: dezactivează clientul și QR-ul, anulează fișa activă și comisioanele neachitate; refuză cu `409` dacă există un comision achitat
- `GET /clients/{id}/financials` — returnează `{ financials, summary, expenses, collaborator }`; necesită `financials.view`. `collaborator` este `null` sau `{ id, name, role, commissionType, commissionValue, amount, paid, due, status, hasCommission }`
- `PUT /clients/{id}/financials` — salvează numai valorile de intrare; necesită `financials.view` și `clients.update`
- `GET|POST /clients/{id}/expenses`
- `PUT|DELETE /clients/{id}/expenses/{expenseId}`
- `GET|PUT /clients/{id}/participants` — listă completă a utilizatorilor activi ai proprietății, cu `isAssigned`; exclusiv administratorului
- `GET /clients/{id}/intake`
- `POST /clients/{id}/qr` — endpoint compatibil și idempotent: returnează QR-ul existent fără să-i schimbe tokenul, elimină numai expirarea istorică dacă există și creează unul doar pentru un client legacy care nu are QR
- `POST /clients/{id}/qr/share`
- `POST /clients/{id}/qr/use`
- `POST /qr/resolve`
- `GET /public/client-form/{token}` — pagină publică de urmărire a reparației; returnează numai identitatea clientului, echipamentul, problema comunicată, statusul și datele lucrării

Codurile QR sunt generate exclusiv de API și salvate în MySQL, în aceeași tranzacție cu clientul. Un cod nou nu expiră (`expiresAt: null`) și nu poate fi regenerat sau înlocuit. Valorile istorice din `expires_at` și statusurile vechi rămân în schemă pentru compatibilitatea datelor existente, însă orice QR activ este tratat ca permanent. Cererile repetate către endpointul de generare nu adaugă rânduri și nu produc evenimente de audit false. Linkurile deja emise continuă să folosească `client-form.php`, dar pagina este acum exclusiv un status public de reparație și nu mai acceptă formulare. Răspunsul public nu include telefon, email, adresă, valori financiare, note interne, serie, colaborator sau semnătură. Operațiile autentificate verifică întotdeauna că QR-ul aparține unei proprietăți accesibile utilizatorului, iar tokenul și URL-ul public sunt returnate numai utilizatorilor cu permisiunea `qr.share`.

### Finanțele clientului

`client_financials` este o extensie 1:1 a clientului și nu primește rând la crearea clientului. Un `PUT` cu toate valorile zero, moneda `RON`, curs `1` și status `UNPAID` elimină rândul existent dacă nu există cheltuieli; astfel nu sunt păstrate înregistrări goale. Câmpurile acceptate sunt `currencyCode`, `exchangeRateToRon`, `workPrice`, `diagnosticFee`, `advancePaid`, `discountPercent`, `actualPartsCost`, `displayedPartsCost`, `displayedLaborCost` și `paymentStatus` (`UNPAID` sau `PAID`). Moneda este un cod de trei litere, RON folosește obligatoriu cursul `1`, iar celelalte monede au un curs pozitiv către RON.

Valorile calculate nu sunt stocate. API-ul folosește următoarele formule în moneda clientului:

- `subtotal = workPrice + diagnosticFee`;
- `discountAmount = subtotal × discountPercent / 100`;
- `totalDue = subtotal - discountAmount`;
- `receivedAmount = totalDue` pentru `PAID`, altfel `min(advancePaid, totalDue)`;
- `remainingDue = totalDue - receivedAmount`;
- `additionalExpenses = suma cheltuielilor`;
- `internalCosts = actualPartsCost + additionalExpenses`;
- comisionul colaboratorului se calculează din atribuirea curentă a clientului: procent din total, procent din `max(totalDue - internalCosts, 0)` sau sumă fixă;
- `gshopNet = receivedAmount - internalCosts - collaboratorCost`.

`displayedPartsCost` și `displayedLaborCost` sunt doar defalcări pentru afișare și precompletarea fișei de service; nu se adună din nou în total. Fiecare cheltuială conține doar `description` și `amount`, în moneda unică a clientului, pentru a evita repetarea cursului în fiecare rând. Prima cheltuială creează atomic rândul financiar implicit, iar acesta este păstrat cât timp există cheltuieli.

Dashboard-ul convertește valorile noi în RON cu `exchangeRateToRon`. Pentru fiecare client, `totalRevenue` primește `receivedAmount` (`totalDue` dacă plata este `PAID`, altfel `min(advancePaid, totalDue)`), `revenueOnHold` primește `totalDue - receivedAmount`, iar netul realizat este `receivedAmount - internalCosts - collaboratorCost`. Astfel avansul intră imediat în încasări și în G-Shop Net, dar restul neachitat nu umflă netul; trecerea statusului la `PAID` mută restul din on hold în încasări și în net. Reducerea este aplicată înaintea tuturor acestor calcule, iar costurile și comisionul sunt scăzute o singură dată. Aceeași formulă de net realizat este returnată în `summary.gshopNet` din profilul clientului și în dashboard.

Pentru clienții legacy fără `client_financials` și fără cheltuieli, fișele `COMPLETED`/`DELIVERED` sunt tratate ca încasate, iar fișele deschise sunt tratate ca on hold. Costurile directe și comisioanele legacy active sunt scăzute din netul realizat, fără dublarea clienților care au trecut la finanțele noi.

Participanții sunt salvați compact ca legături client–utilizator. `PUT /clients/{id}/participants` primește `{ "userIds": ["uuid"] }`, acceptă maximum 100 de ID-uri unice și refuză utilizatorii inactivi sau din altă proprietate. Toate mutațiile financiare, de cheltuieli și participanți sunt auditate pe entitatea `Client`, pentru ca evenimentele să apară în istoricul clientului.

Salvarea finanțelor recalculează comisionul activ neachitat al fișei unice din `totalDue`, `internalCosts` și regula clientului, apoi actualizează `service_sheets.collaborator_commission`. Un comision achitat nu este rescris retroactiv. Înainte de crearea fișei, `collaborator.amount` și `due` sunt estimări, iar `hasCommission` este `false`. Marcarea achitat/neachitat repară automat cazul legacy în care există client, colaborator și fișă activă, dar lipsește rândul din `commissions`.

La actualizarea unei instalări existente, apelează `POST /admin/migrations/client-finance` imediat după publicarea API-ului și înainte de folosirea dashboard-ului sau a fișelor. Reapelarea endpointului este sigură; acesta creează numai tabelele lipsă sub blocare MySQL.

### Service

- `GET|POST /service-sheets` — `POST` permite o singură fișă activă pentru fiecare client
- `GET|PUT|DELETE /service-sheets/{id}` — ștergerea este logică și păstrează auditul
- `POST /service-sheets/{id}/signature`
- `GET /collaborators?propertyId={uuid}`
- `GET /collaborators/{id}?propertyId={uuid}`
- `POST /collaborators`
- `PUT /collaborators/{id}`
- `DELETE /collaborators/{id}?propertyId={uuid}`
- `GET /collaborator-finances?propertyId={uuid}` — totaluri achitate/de achitat, grupate pe colaborator și client
- `PUT /commissions/client-status` — marchează comisioanele unui client ca achitate sau de achitat; body: `{ "propertyId": "uuid", "collaboratorId": "uuid", "clientId": "uuid", "paid": true|false }`

Crearea unei fișe blochează tranzacțional rândul clientului și verifică existența unei fișe active, astfel încât două cereri simultane nu pot crea duplicate. Dacă fișa există, API-ul răspunde `409` cu `errors.code = SERVICE_SHEET_ALREADY_EXISTS` și `errors.serviceSheetId`. Duplicatele istorice nu sunt șterse automat. `DELETE` marchează fișa inactivă și anulată, dezactivează comisioanele ei și permite ulterior crearea unei noi fișe pentru client; dacă are un comision achitat, răspunde `409` până când acesta este marcat neachitat.

`POST /collaborators` primește datele colaboratorului și `propertyIds`, validează regula implicită de comision și returnează obiectul complet creat. `PUT /collaborators/{id}` primește obligatoriu `propertyId` în body, plus câmpurile care trebuie modificate. Modificarea regulii implicite se aplică atribuirilor viitoare și nu rescrie comisioanele istorice.

Regula implicită acceptă `FIXED` (sumă fixă), `PERCENT_NET` (procent din valoarea totală minus costurile directe) și `PERCENT_TOTAL` (procent din total). Câmpul boolean `isPreset` este evaluat în contextul proprietății cerute. O proprietate poate avea cel mult un colaborator presetat; activarea unuia îl înlocuiește atomic pe cel anterior. La creare, `isPreset: true` se aplică tuturor valorilor din `propertyIds`; la actualizare se aplică numai valorii `propertyId` din body.

Un client nou care nu include deloc câmpul `collaboratorId` moștenește colaboratorul presetat al proprietății împreună cu tipul și valoarea sa implicită. Trimiterea explicită a `collaboratorId: null` sau `collaboratorId: ""` creează ori actualizează clientul fără colaborator și șterge regula sa de comision. Din client, colaboratorul, tipul și valoarea comisionului pot fi schimbate fără a modifica regula implicită a colaboratorului.

După publicarea peste o instalare existentă, autentifică un administrator și apelează o singură dată `POST /admin/migrations/collaborator-presets`. Endpointul adaugă coloana compactă `collaborator_properties.is_preset`, unicitatea pe proprietate și extinde cele trei tipuri `ENUM`; poate fi reapelat în siguranță și nu rulează verificări DDL în cererile normale.

`DELETE /collaborators/{id}` este o ștergere logică sigură: colaboratorul dispare din lista activă, iar datele, legăturile și istoricul financiar rămân în baza de date. Cererea este refuzată cu `409` dacă există clienți activi atribuiți sau comisioane neachitate. Pentru un colaborator legat de mai multe proprietăți, utilizatorul trebuie să aibă acces la toate proprietățile înainte de ștergerea globală.

### Administrare

- `GET|POST /users`
- `PUT /users/{id}/permissions` — actualizează atomic permisiunile și, opțional, `propertyIds`; lista goală elimină accesul la toate proprietățile, iar omiterea câmpului păstrează accesul existent
- `PUT /users/{id}/password`
- `DELETE /users/{id}`
- `GET /audit-logs`
- `GET /reports`

Răspunsurile au forma `{ "data": ... }`. Erorile au forma `{ "message": "...", "errors": ... }` și un status HTTP corespunzător.
