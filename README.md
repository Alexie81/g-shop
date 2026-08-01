# G-Shop

Aplicație mobilă Expo/React Native pentru gestionarea activității de service: clienți, coduri QR, formulare publice, fișe de service, semnături electronice, colaboratori, comisioane, utilizatori, permisiuni, rapoarte și audit.

Interfața folosește identitatea G-Shop din `logo/logo.png`, este responsive pentru Android, iPhone, web și tabletă și suportă Light, Dark și tema sistemului.

## Pornire rapidă

Cerințe: Node.js 20+ și aplicația Expo Go instalată pe telefon.

```bash
npm install
copy .env.example .env
npx expo start
```

API-ul de producție este configurat implicit la:

```text
https://reparatiicalculatoare-bucuresti.ro/app-api
```

Cont inițial: `admin` / `admin`. Schimbă parola imediat din **Mai mult → Setări**.

### Android

1. Rulează `npx expo start`.
2. Deschide Expo Go pe telefon.
3. Scanează codul QR afișat în terminal sau în Expo DevTools.

Pentru un emulator Android pornit, folosește `npm run android`.

### iOS

Pe macOS/iPhone folosește `npm run ios` sau scanează codul Expo cu aplicația Camera. Proiectul este universal și include suport de tabletă.

### Web

```bash
npm run web
```

Camera web necesită HTTPS sau `localhost`. Semnarea pe ecran și formularele sunt compatibile și pe web.

## Verificări

```bash
npm run typecheck
npm run lint
npx expo-doctor
npx expo export --platform android
```

## Workspaces

Aplicația tratează proprietățile ca workspaces separate:

- **Reparații Calculatoare București** (`SERVICE`) — dashboard, clienți, QR, fișe, colaboratori, utilizatori, rapoarte și audit.
- **Calculatoare Profesionale** (`SHOP`) — navigație separată și pagină premium „În lucru”. Funcțiile magazinului sunt dezactivate prin `EXPO_PUBLIC_SHOP_MODULE_ENABLED=false`.

Schimbarea proprietății resetează ruta activă și reconstruiește taburile. Proprietatea și tema sunt păstrate local; datele operaționale rămân exclusiv în MySQL online.

## Securitate

- acces MySQL numai prin API HTTPS;
- access token cu viață scurtă și refresh token rotit;
- sesiune persistentă în Expo SecureStore numai când „Ține-mă minte” este bifat;
- verificarea permisiunilor în API, nu doar în UI;
- cod QR cu identificator aleator, fără date personale;
- semnătură PNG stocată ca fișier, nu BLOB în MySQL;
- jurnal de audit pentru autentificare, clienți, QR, fișe, semnături, utilizatori, parole și permisiuni;
- valorile „înainte/după”, utilizatorul, proprietatea, IP-ul, dispozitivul și ora sunt asociate fiecărei modificări relevante.

## Structură

```text
app/            rute Expo Router și ecrane
components/     componente UI și module vizuale
constants/      proprietăți, roluri și permisiuni
contexts/       autentificare, proprietate, temă și toast
hooks/          încărcare asincronă reutilizabilă
repositories/   contracte și implementarea REST
services/       client API și stocare securizată
theme/          paletă Light/Dark, spațiere și radius
types/          modelele TypeScript
utils/          formatare și calcule comisioane
api/            API PHP, schema compactă și pagina publică de status
```

## Backend

Instrucțiunile serverului, schema și lista endpointurilor sunt în [api/README.md](api/README.md). Configurația reală `.env` a serverului este ignorată de Git. Scriptul `scripts/deploy-api.ps1` publică fișierele prin FTPS explicit și transferă segmentat fișierele mari pentru compatibilitate LiteSpeed.

Formula comisionului procentual este:

```text
valoare netă = valoare totală - costuri directe
comision = valoare netă × procent / 100
```

Pentru sumă fixă, comisionul este valoarea configurată.
