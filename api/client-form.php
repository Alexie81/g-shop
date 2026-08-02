<?php
$token = preg_replace('/[^a-fA-F0-9-]/', '', (string)($_GET['token'] ?? ''));
?><!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#ffffff">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Status reparație · G-Shop</title>
  <style>
    :root{color-scheme:only light;--blue:#075cff;--blue-dark:#063ba4;--blue-soft:#edf4ff;--ink:#071534;--muted:#67758d;--line:#e3e9f2;--canvas:#f5f7fb;--white:#fff;--green:#12a946;--green-soft:#eaf9ef;--orange:#f19900;--orange-soft:#fff6e5;--red:#e7354c;--red-soft:#fff0f2;--purple:#7c3aed;--status:#075cff;--status-soft:#edf4ff;--shadow:0 18px 50px rgba(24,46,84,.09)}
    *{box-sizing:border-box}
    html{background:var(--canvas);scroll-behavior:smooth;overflow-x:hidden}
    body{margin:0;min-height:100vh;overflow-x:hidden;background:radial-gradient(circle at 50% -120px,#eaf2ff 0,rgba(234,242,255,0) 390px),var(--canvas);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    button,a{font:inherit;-webkit-tap-highlight-color:transparent}
    button{border:0}
    .page{width:100%;max-width:640px;margin:0 auto;padding:calc(16px + env(safe-area-inset-top)) 14px calc(42px + env(safe-area-inset-bottom))}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:4px 3px 17px}
    .brand{display:flex;align-items:center;min-width:0;gap:11px}
    .brand-logo{width:53px;height:53px;flex:0 0 53px;object-fit:contain;filter:drop-shadow(0 9px 12px rgba(7,92,255,.2))}
    .brand-copy{min-width:0}.brand-title{margin:0;font-size:19px;line-height:1.1;font-weight:900;letter-spacing:-.35px}.brand-subtitle{margin:4px 0 0;color:var(--muted);font-size:11px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .secure{height:34px;flex:0 0 auto;border:1px solid #dce6f5;border-radius:999px;padding:0 11px;background:rgba(255,255,255,.8);display:flex;align-items:center;gap:6px;color:#4f607b;font-size:10px;font-weight:800;box-shadow:0 6px 18px rgba(27,49,85,.05)}
    .secure svg{width:14px;height:14px;color:var(--blue)}
    .surface{background:var(--white);border:1px solid var(--line);border-radius:24px;box-shadow:var(--shadow);margin-bottom:14px}
    .summary{position:relative;overflow:hidden;padding:22px}
    .summary:before{content:"";position:absolute;width:180px;height:180px;border-radius:50%;right:-105px;top:-105px;background:var(--status-soft)}
    .summary:after{content:"";position:absolute;height:4px;left:22px;right:22px;top:0;border-radius:0 0 8px 8px;background:linear-gradient(90deg,var(--status),#62a2ff);animation:glow 2.8s ease-in-out infinite}
    .summary-head{position:relative;z-index:1;display:flex;align-items:flex-start;gap:15px}
    .status-icon{width:58px;height:58px;flex:0 0 58px;border-radius:19px;background:var(--status-soft);color:var(--status);display:grid;place-items:center;font-size:27px;font-weight:900;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--status) 12%,transparent)}
    .summary-copy{min-width:0;flex:1}.eyebrow{margin:1px 0 6px;color:var(--status);font-size:10px;font-weight:900;letter-spacing:1.15px}.summary h1{font-size:27px;line-height:1.12;letter-spacing:-.75px;margin:0 0 8px}.status-description{color:var(--muted);font-size:13px;line-height:1.5;margin:0;max-width:460px}
    .current-pill{display:inline-flex;align-items:center;gap:7px;margin-top:13px;min-height:31px;border-radius:999px;padding:0 11px;background:var(--status-soft);color:var(--status);font-size:11px;font-weight:850}.pulse{width:7px;height:7px;border-radius:50%;background:var(--status);box-shadow:0 0 0 0 color-mix(in srgb,var(--status) 45%,transparent);animation:pulse 1.9s infinite}
    .summary-bottom{position:relative;z-index:1;margin-top:19px;padding-top:16px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;gap:12px}
    .client-mini{min-width:0;display:flex;align-items:center;gap:10px}.avatar{width:39px;height:39px;flex:0 0 39px;border-radius:14px;background:linear-gradient(145deg,#075cff,#0d79ff);color:#fff;display:grid;place-items:center;font-size:12px;font-weight:900}.client-name{font-size:13px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sheet-number{display:block;margin-top:2px;color:var(--muted);font-size:10px;font-weight:650}
    .updated{flex:0 0 auto;text-align:right;color:var(--muted);font-size:10px;line-height:1.35}.updated strong{display:block;color:var(--ink);font-size:11px}
    .section{padding:20px}.section-heading{display:flex;align-items:center;gap:12px;margin-bottom:18px}.section-icon{width:44px;height:44px;flex:0 0 44px;border-radius:15px;background:var(--blue-soft);color:var(--blue);display:grid;place-items:center}.section-icon svg{width:21px;height:21px}.section-title{min-width:0;flex:1}.section-title h2{font-size:17px;line-height:1.2;margin:0}.section-title p{color:var(--muted);font-size:11px;line-height:1.45;margin:3px 0 0}
    .timeline{display:flex;flex-direction:column}.timeline-step{display:flex;gap:13px;min-height:92px;opacity:0;transform:translateY(9px);animation:step-in .42s ease forwards;animation-delay:calc(var(--index) * 75ms)}
    .timeline-marker{position:relative;width:40px;flex:0 0 40px;display:flex;justify-content:center}.timeline-dot{position:relative;z-index:2;width:32px;height:32px;border-radius:50%;border:2px solid var(--line);background:#f3f6fa;color:#91a0b4;display:grid;place-items:center;font-size:11px;font-weight:900;transition:.35s ease}.timeline-line{position:absolute;z-index:1;top:30px;bottom:-2px;left:19px;width:2px;background:var(--line);overflow:hidden}.timeline-line:after{content:"";position:absolute;inset:0;background:linear-gradient(var(--green),#59d784);transform:scaleY(0);transform-origin:top;transition:transform .5s ease}.timeline-step:last-child .timeline-line{display:none}
    .timeline-content{flex:1;min-width:0;margin-bottom:10px;border:1px solid transparent;border-radius:17px;padding:5px 12px 13px;transition:.35s ease}.timeline-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.timeline-name{font-size:14px;font-weight:850}.timeline-state{flex:0 0 auto;min-height:25px;border-radius:999px;padding:0 9px;background:#f1f4f8;color:#8694a8;display:flex;align-items:center;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.35px}.timeline-description{color:var(--muted);font-size:11px;line-height:1.45;margin:6px 0 0}
    .timeline-step.done .timeline-dot{border-color:var(--green);background:var(--green);color:#fff}.timeline-step.done .timeline-line:after{transform:scaleY(1)}.timeline-step.done .timeline-state{background:var(--green-soft);color:var(--green)}
    .timeline-step.current .timeline-dot{border-color:var(--status);background:var(--white);color:var(--status);box-shadow:0 0 0 6px var(--status-soft);animation:active-dot 2s ease-in-out infinite}.timeline-step.current .timeline-line{background:linear-gradient(to bottom,var(--status-soft),var(--line))}.timeline-step.current .timeline-line:before{content:"";position:absolute;z-index:2;left:0;top:-18px;width:2px;height:24px;border-radius:2px;background:var(--status);box-shadow:0 0 8px var(--status);animation:line-flow 1.7s ease-in-out infinite}.timeline-step.current .timeline-content{border-color:color-mix(in srgb,var(--status) 18%,var(--line));background:linear-gradient(135deg,var(--status-soft),#fff 72%);padding:13px 13px 14px;box-shadow:0 9px 26px color-mix(in srgb,var(--status) 9%,transparent)}.timeline-step.current .timeline-state{background:var(--status);color:#fff}.timeline-step.current .timeline-name{color:var(--status)}
    .timeline-step.future .timeline-content{opacity:.66}
    .cancelled{display:flex;align-items:flex-start;gap:11px;padding:15px;border-radius:16px;background:var(--red-soft);color:var(--ink);font-size:13px;line-height:1.5}.cancelled-icon{width:30px;height:30px;flex:0 0 30px;border-radius:10px;background:#fff;color:var(--red);display:grid;place-items:center;font-weight:900}
    .equipment-box{border:1px solid var(--line);border-radius:18px;padding:16px;background:linear-gradient(135deg,#f8faff,#fff)}.equipment-name{font-size:15px;font-weight:850;margin:0}.equipment-issue{color:var(--muted);font-size:12px;line-height:1.55;margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.meta-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:12px}.meta{min-height:64px;border-radius:15px;background:#f5f7fb;padding:10px}.meta-label{display:block;color:var(--muted);font-size:9px;font-weight:750;margin-bottom:5px}.meta-value{display:block;font-size:11px;line-height:1.35;font-weight:850;overflow-wrap:anywhere}
    .quick-contact{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;max-width:100%;margin-bottom:14px;padding:5px;background:#fff;border:1px solid var(--line);border-radius:20px;box-shadow:0 12px 34px rgba(24,46,84,.07)}.quick-contact .action{min-width:0;padding-left:8px;padding-right:8px}.quick-contact .action-wa{background:#18b75b;color:#fff;border-color:#18b75b;box-shadow:0 9px 22px rgba(24,183,91,.18)}
    .contact{position:relative;overflow:hidden;padding:20px;background:linear-gradient(145deg,#fff,#f5f9ff)}.contact:after{content:"";position:absolute;width:150px;height:150px;border-radius:50%;right:-90px;bottom:-100px;background:#e5efff}.contact-head{position:relative;z-index:1;display:flex;align-items:center;gap:12px}.contact-copy{min-width:0;flex:1}.contact-copy h2{font-size:17px;margin:0}.contact-copy p{color:var(--muted);font-size:11px;line-height:1.45;margin:4px 0 0}.contact-actions{position:relative;z-index:1;display:grid;grid-template-columns:1.35fr 1fr;gap:10px;margin-top:16px}
    .action{min-height:52px;border-radius:16px;padding:0 14px;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:9px;font-size:12px;font-weight:900;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}.action:active{transform:scale(.975)}.action svg{width:19px;height:19px}.action-call{background:linear-gradient(135deg,#075cff,#0d79ff);color:#fff;box-shadow:0 10px 24px rgba(7,92,255,.22)}.action-wa{background:#eafbf1;color:#129748;border:1px solid #ccefd9}.action-email{grid-column:1/-1;background:#f0f4fa;color:#315170;border:1px solid var(--line)}
    .refresh{width:100%;min-height:51px;border:1px solid #d8e5fa;border-radius:16px;background:#eef4ff;color:var(--blue);font-weight:900;cursor:pointer;display:flex;justify-content:center;align-items:center;gap:9px;transition:transform .18s ease,background .18s ease}.refresh:disabled{opacity:.62;cursor:wait}.refresh:active{transform:scale(.985)}.refresh svg{width:18px;height:18px}.refresh.loading svg{animation:spin .8s linear infinite}
    .footer{text-align:center;color:#8a96a8;font-size:10px;line-height:1.55;padding:9px 20px 0}.footer strong{color:#66758b}
    .state{text-align:center;padding:42px 24px}.state-icon{width:68px;height:68px;border-radius:23px;background:var(--blue-soft);color:var(--blue);display:grid;place-items:center;margin:0 auto 17px}.state h1{font-size:20px;margin:0 0 7px}.state p{color:var(--muted);font-size:13px;line-height:1.5;margin:0}.spinner{width:28px;height:28px;border:3px solid #cfddf2;border-top-color:var(--blue);border-radius:50%;animation:spin .8s linear infinite}.error-symbol{font-size:28px;font-weight:900}
    .hidden{display:none!important}
    #content.reveal>.surface,#content.reveal>.quick-contact,#content.reveal>.refresh,#content.reveal>.footer{animation:card-in .48s cubic-bezier(.2,.75,.25,1) both;animation-delay:var(--delay,0ms)}
    @keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{70%{box-shadow:0 0 0 8px transparent}}@keyframes active-dot{50%{box-shadow:0 0 0 10px transparent;transform:scale(1.05)}}@keyframes line-flow{0%{transform:translateY(0);opacity:0}25%{opacity:1}100%{transform:translateY(66px);opacity:0}}@keyframes glow{50%{opacity:.58;transform:scaleX(.94)}}@keyframes step-in{to{opacity:1;transform:none}}@keyframes card-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
    @media(max-width:430px){.page{padding-left:10px;padding-right:10px}.topbar{padding-left:4px;padding-right:4px}.secure{display:none}.summary{padding:19px}.summary:after{left:19px;right:19px}.status-icon{width:50px;height:50px;flex-basis:50px;border-radius:17px;font-size:23px}.summary h1{font-size:24px}.section,.contact{padding:17px}.meta-grid{grid-template-columns:1fr 1fr}.contact-actions{grid-template-columns:1fr}.action-email{grid-column:auto}.timeline-step{gap:9px}.timeline-content{padding-left:8px;padding-right:8px}.timeline-step.current .timeline-content{padding-left:11px;padding-right:11px}.timeline-step.current .timeline-top{align-items:flex-start;flex-direction:column;gap:6px}}
    @media(max-width:340px){.brand-logo{width:46px;height:46px;flex-basis:46px}.brand-title{font-size:17px}.summary-head{gap:11px}.summary h1{font-size:22px}.summary-bottom{align-items:flex-start;flex-direction:column}.updated{text-align:left}.timeline-top{align-items:flex-start;flex-direction:column;gap:6px}.contact-actions{gap:8px}.quick-contact{grid-template-columns:1fr}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
  </style>
</head>
<body>
  <main class="page">
    <header class="topbar">
      <div class="brand"><img class="brand-logo" src="./assets/logo.png" alt="G-Shop"><div class="brand-copy"><p class="brand-title">G-Shop</p><p class="brand-subtitle" id="propertyName">Urmărire reparație</p></div></div>
      <div class="secure" title="Link privat și securizat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span>Link privat</span></div>
    </header>

    <section id="loading" class="surface state"><div class="state-icon"><div class="spinner"></div></div><h1>Se încarcă statusul</h1><p>Preluăm cele mai noi informații direct din service.</p></section>
    <section id="error" class="surface state hidden"><div class="state-icon"><span class="error-symbol">!</span></div><h1>Link indisponibil</h1><p id="errorText">Statusul nu a putut fi încărcat.</p><button class="refresh" id="errorRetry" type="button" style="margin-top:18px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0-2.3 5.7L20 14"/><path d="M20 5v6h-6"/></svg>Încearcă din nou</button></section>

    <div id="content" class="hidden">
      <section class="surface summary" style="--delay:0ms">
        <div class="summary-head"><div class="status-icon" id="statusIcon">●</div><div class="summary-copy"><p class="eyebrow">STATUSUL REPARAȚIEI</p><h1 id="statusLabel">Client înregistrat</h1><p class="status-description" id="statusDescription"></p><div class="current-pill"><span class="pulse"></span><span id="statusPill">Actualizat în timp real</span></div></div></div>
        <div class="summary-bottom"><div class="client-mini"><div class="avatar" id="clientInitials">GS</div><div style="min-width:0"><div class="client-name" id="clientName"></div><span class="sheet-number" id="sheetNumber">Fișă în curs de creare</span></div></div><div class="updated"><strong>Ultima actualizare</strong><span id="updatedAt">acum</span></div></div>
      </section>

      <nav id="quickContact" class="quick-contact hidden" aria-label="Contact rapid" style="--delay:45ms"><a id="quickCallButton" class="action action-call"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9.1 10.9a16 16 0 0 0 4 4l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/></svg>Sună acum</a><a id="quickWhatsappButton" class="action action-wa" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.2 9.2 0 0 1-3.8-.9L3 21l1.8-5a8.4 8.4 0 1 1 16.2-4.5Z"/><path d="M8.7 8.2c.3 3 2.1 4.8 5.1 5.1"/></svg>WhatsApp</a></nav>

      <section id="repairContent" class="hidden">
        <section class="surface section" style="--delay:70ms">
          <div class="section-heading"><div class="section-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg></div><div class="section-title"><h2>Parcursul reparației</h2><p>Vezi etapa curentă și ce urmează în continuare</p></div></div>
          <div id="timeline" class="timeline">
            <article class="timeline-step" data-index="0" style="--index:0"><div class="timeline-marker"><div class="timeline-dot">1</div><div class="timeline-line"></div></div><div class="timeline-content"><div class="timeline-top"><span class="timeline-name">Înregistrare</span><span class="timeline-state">Urmează</span></div><p class="timeline-description">Fișa și echipamentul sunt înregistrate în service.</p></div></article>
            <article class="timeline-step" data-index="1" style="--index:1"><div class="timeline-marker"><div class="timeline-dot">2</div><div class="timeline-line"></div></div><div class="timeline-content"><div class="timeline-top"><span class="timeline-name">Diagnosticare</span><span class="timeline-state">Urmează</span></div><p class="timeline-description">Echipa verifică echipamentul și stabilește intervenția.</p></div></article>
            <article class="timeline-step" data-index="2" style="--index:2"><div class="timeline-marker"><div class="timeline-dot">3</div><div class="timeline-line"></div></div><div class="timeline-content"><div class="timeline-top"><span class="timeline-name">Reparație</span><span class="timeline-state">Urmează</span></div><p class="timeline-description">Echipa efectuează lucrarea necesară asupra echipamentului.</p></div></article>
            <article class="timeline-step" data-index="3" style="--index:3"><div class="timeline-marker"><div class="timeline-dot">4</div><div class="timeline-line"></div></div><div class="timeline-content"><div class="timeline-top"><span class="timeline-name">Așteptăm piesele</span><span class="timeline-state">Urmează</span></div><p class="timeline-description">Dacă este necesar, așteptăm sosirea pieselor pentru a continua lucrarea.</p></div></article>
            <article class="timeline-step" data-index="4" style="--index:4"><div class="timeline-marker"><div class="timeline-dot">5</div><div class="timeline-line"></div></div><div class="timeline-content"><div class="timeline-top"><span class="timeline-name">Finalizare</span><span class="timeline-state">Urmează</span></div><p class="timeline-description">Reparația este verificată și pregătită pentru predare.</p></div></article>
            <article class="timeline-step" data-index="5" style="--index:5"><div class="timeline-marker"><div class="timeline-dot">6</div></div><div class="timeline-content"><div class="timeline-top"><span class="timeline-name">Predare</span><span class="timeline-state">Urmează</span></div><p class="timeline-description">Echipamentul este predat clientului și lucrarea se încheie.</p></div></article>
          </div>
          <div id="cancelled" class="cancelled hidden"><div class="cancelled-icon">!</div><span>Lucrarea a fost anulată. Contactează unitatea service pentru mai multe detalii.</span></div>
        </section>

        <section class="surface section" style="--delay:140ms">
          <div class="section-heading"><div class="section-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div><div class="section-title"><h2>Echipamentul tău</h2><p>Detaliile lucrării curente</p></div></div>
          <div class="equipment-box"><p class="equipment-name" id="equipment"></p><p class="equipment-issue hidden" id="reportedIssue"></p></div>
          <div class="meta-grid"><div class="meta"><span class="meta-label">PRIMIT ÎN SERVICE</span><strong class="meta-value" id="receivedAt">—</strong></div><div class="meta"><span class="meta-label">TERMEN ESTIMAT</span><strong class="meta-value" id="estimatedAt">În curs de stabilire</strong></div><div class="meta"><span class="meta-label">FINALIZAT</span><strong class="meta-value" id="completedAt">—</strong></div></div>
        </section>
      </section>

      <section id="contact" class="surface contact hidden" style="--delay:210ms">
        <div class="contact-head"><div class="section-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9.1 10.9a16 16 0 0 0 4 4l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/></svg></div><div class="contact-copy"><h2>Ai nevoie de ajutor?</h2><p>Intră rapid în legătură cu echipa <span id="contactProperty">G-Shop</span>.</p></div></div>
        <div class="contact-actions"><a id="callButton" class="action action-call hidden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L9.1 10.9a16 16 0 0 0 4 4l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/></svg>Sună G-Shop acum</a><a id="whatsappButton" class="action action-wa hidden" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.2 9.2 0 0 1-3.8-.9L3 21l1.8-5a8.4 8.4 0 1 1 16.2-4.5Z"/><path d="M8.7 8.2c.3 3 2.1 4.8 5.1 5.1"/></svg>WhatsApp</a><a id="emailButton" class="action action-email hidden"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>Trimite un email</a></div>
      </section>

      <button class="refresh" id="refresh" type="button" style="--delay:260ms"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 11a8 8 0 1 0-2.3 5.7L20 14"/><path d="M20 5v6h-6"/></svg><span>Actualizează statusul</span></button>
      <p class="footer" style="--delay:300ms">Date actualizate direct din sistemul <strong>G-Shop</strong> al unității service.<br>Acest link este privat și destinat exclusiv clientului.</p>
    </div>
  </main>
  <script>
    const token=<?php echo json_encode($token, JSON_UNESCAPED_SLASHES); ?>;
    const endpoint='./index.php/public/client-form/'+encodeURIComponent(token);
    const STATUS={
      NEW:{label:'Fișă creată',description:'Am înregistrat echipamentul și fișa ta de service.',icon:'▤',color:'#075cff',soft:'#edf4ff'},
      WAITING:{label:'În așteptare',description:'Echipamentul este înregistrat și așteaptă preluarea de către echipa tehnică.',icon:'◷',color:'#f19900',soft:'#fff6e5'},
      VERIFYING:{label:'În verificare',description:'Echipa verifică echipamentul pentru a stabili diagnosticul și pașii următori.',icon:'⌕',color:'#7c3aed',soft:'#f4edff'},
      IN_PROGRESS:{label:'În lucru',description:'Reparația este în desfășurare. Echipa lucrează la echipamentul tău.',icon:'⚙',color:'#075cff',soft:'#edf4ff'},
      WAITING_PARTS:{label:'Așteptăm piesele',description:'Intervenția este pregătită și așteptăm piesele necesare pentru continuare.',icon:'◇',color:'#f19900',soft:'#fff6e5'},
      COMPLETED:{label:'Reparație finalizată',description:'Echipamentul este pregătit. Echipa service te va contacta pentru predare.',icon:'✓',color:'#12a946',soft:'#eaf9ef'},
      DELIVERED:{label:'Echipament predat',description:'Echipamentul a fost predat, iar lucrarea este încheiată.',icon:'✓',color:'#12a946',soft:'#eaf9ef'},
      CANCELLED:{label:'Reparație anulată',description:'Lucrarea a fost anulată. Contactează service-ul pentru mai multe informații.',icon:'×',color:'#e7354c',soft:'#fff0f2'}
    };
    const STEP={NEW:0,WAITING:0,VERIFYING:1,IN_PROGRESS:2,WAITING_PARTS:3,COMPLETED:4,DELIVERED:5,CANCELLED:-1};
    const $=id=>document.getElementById(id);
    const setText=(id,value)=>{$(id).textContent=value??''};
    const show=id=>$(id).classList.remove('hidden');
    const hide=id=>$(id).classList.add('hidden');
    const formatDate=(value,withTime=false)=>{if(!value)return '—';const date=new Date(value);if(Number.isNaN(date.getTime()))return '—';const options=withTime?{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'short',year:'numeric'};return new Intl.DateTimeFormat('ro-RO',options).format(date)};
    const initials=name=>String(name||'G Shop').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
    const whatsappPhone=value=>{let digits=String(value||'').replace(/\D/g,'');if(digits.startsWith('00'))digits=digits.slice(2);if(digits.startsWith('0'))digits='40'+digits.slice(1);return digits};

    function renderTimeline(status,current){
      const cancelled=status==='CANCELLED';
      $('timeline').classList.toggle('hidden',cancelled);
      $('cancelled').classList.toggle('hidden',!cancelled);
      if(cancelled)return;
      document.querySelectorAll('.timeline-step').forEach((step,index)=>{
        const done=index<current;const active=index===current;
        step.classList.toggle('done',done);step.classList.toggle('current',active);step.classList.toggle('future',index>current);
        const dot=step.querySelector('.timeline-dot');const state=step.querySelector('.timeline-state');
        dot.textContent=done?'✓':String(index+1);
        state.textContent=done?'Finalizat':active?(STATUS[status]?.label||'Acum'):'Urmează';
      });
    }

    function renderContact(data){
      const contact=data.contact||{};const phone=String(contact.phone||'').trim();const email=String(contact.email||'').trim();
      setText('contactProperty',data.propertyName||'G-Shop');
      if(phone){const tel=phone.replace(/[^\d+]/g,'');$('callButton').href='tel:'+tel;$('quickCallButton').href='tel:'+tel;show('callButton');const wa=whatsappPhone(phone);if(wa){const waUrl='https://wa.me/'+wa+'?text='+encodeURIComponent('Bună ziua! Vă contactez în legătură cu statusul reparației mele.');$('whatsappButton').href=waUrl;$('quickWhatsappButton').href=waUrl;show('whatsappButton');show('quickContact')}}
      if(email){$('emailButton').href='mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent('Întrebare despre statusul reparației');show('emailButton')}
      if(phone||email)show('contact');else hide('contact');
    }

    function render(data){
      setText('propertyName',data.propertyName||'Urmărire reparație');
      document.title='Status reparație · '+(data.propertyName||'G-Shop');
      setText('clientName',data.client.name);setText('clientInitials',initials(data.client.name));
      const repair=data.repair;const current=repair?STATUS[repair.status]:null;
      document.documentElement.style.setProperty('--status',current?.color||'#075cff');document.documentElement.style.setProperty('--status-soft',current?.soft||'#edf4ff');
      setText('statusLabel',current?.label||'Client înregistrat');
      setText('statusDescription',current?.description||'Fișa de service se pregătește. Revino în curând pentru actualizări.');
      setText('statusIcon',current?.icon||'○');setText('statusPill',repair?.status==='DELIVERED'?'Proces încheiat':'Actualizat în timp real');
      setText('updatedAt',formatDate(repair?.updatedAt||data.client.updatedAt,true));
      if(repair){
        show('repairContent');setText('sheetNumber','Fișa '+repair.number);
        setText('equipment',[repair.brand,repair.model,repair.equipment].filter(Boolean).join(' · ')||'Echipament înregistrat');
        if(repair.reportedIssue){show('reportedIssue');setText('reportedIssue',repair.reportedIssue)}else hide('reportedIssue');
        setText('receivedAt',formatDate(repair.receivedAt));setText('estimatedAt',repair.estimatedAt?formatDate(repair.estimatedAt):'În curs de stabilire');setText('completedAt',repair.completedAt?formatDate(repair.completedAt):'—');
        renderTimeline(repair.status,STEP[repair.status]);
      }else{hide('repairContent');setText('sheetNumber','Fișă în curs de creare')}
      renderContact(data);
      $('content').classList.remove('reveal');requestAnimationFrame(()=>$('content').classList.add('reveal'));
    }

    async function load(){
      hide('error');const firstLoad=$('content').classList.contains('hidden');if(firstLoad)show('loading');
      const button=$('refresh');button.disabled=true;button.classList.add('loading');button.querySelector('span').textContent='Se actualizează…';
      try{const response=await fetch(endpoint,{headers:{Accept:'application/json'},cache:'no-store'});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||'Statusul nu a putut fi încărcat.');render(payload.data);hide('loading');hide('error');show('content')}
      catch(error){hide('loading');if(firstLoad){hide('content');show('error');setText('errorText',error.message||'Statusul nu a putut fi încărcat.')}}
      finally{button.disabled=false;button.classList.remove('loading');button.querySelector('span').textContent='Actualizează statusul'}
    }
    $('refresh').addEventListener('click',load);$('errorRetry').addEventListener('click',load);load();
  </script>
</body>
</html>
