<?php
$token = preg_replace('/[^a-fA-F0-9-]/', '', (string)($_GET['token'] ?? ''));
?><!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#075cff">
  <title>Status reparație · G-Shop</title>
  <style>
    :root{color-scheme:light dark;--blue:#075cff;--blue-soft:#eaf1ff;--navy:#07152d;--bg:#f5f8fd;--card:#fff;--text:#071534;--muted:#62718a;--line:#e4eaf3;--green:#14a83b;--green-soft:#e9f9ed;--orange:#f39000;--orange-soft:#fff4de;--red:#e7354c;--red-soft:#fdecef;--purple:#7c3aed;--shadow:0 14px 40px rgba(23,48,90,.08)}
    *{box-sizing:border-box}
    html{background:var(--bg)}
    body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
    button{font:inherit}
    .page{width:100%;max-width:720px;margin:auto;padding:calc(18px + env(safe-area-inset-top)) 14px calc(36px + env(safe-area-inset-bottom))}
    .brand{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 0 16px}
    .mark{width:48px;height:48px;border-radius:15px;background:linear-gradient(145deg,#1676ff,#06319c);display:grid;place-items:center;color:#fff;font-size:25px;font-weight:900;box-shadow:0 8px 20px rgba(7,92,255,.22)}
    .brand h1{font-size:23px;line-height:1.1;margin:0;letter-spacing:-.4px}.brand p{font-size:12px;margin:4px 0 0;color:var(--muted)}
    .private{min-height:44px;border:1px solid var(--line);background:var(--blue-soft);border-radius:14px;padding:10px 13px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;font-weight:650;margin-bottom:14px}
    .private span:first-child{color:var(--blue);font-size:16px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:19px;padding:18px;margin-bottom:14px;box-shadow:var(--shadow)}
    .hero{border:0;color:#fff;padding:22px;background:linear-gradient(135deg,#075cff,#07389d);overflow:hidden;position:relative}
    .hero:after{content:"";position:absolute;width:190px;height:190px;border-radius:50%;right:-80px;top:-105px;background:rgba(255,255,255,.09)}
    .hero-top{display:flex;align-items:flex-start;gap:14px;position:relative;z-index:1}.hero-copy{flex:1;min-width:0}
    .eyebrow{font-size:11px;font-weight:850;letter-spacing:1.15px;color:#dce8ff;margin:0 0 8px}
    .hero h2{font-size:29px;line-height:1.12;letter-spacing:-.7px;margin:0 0 9px;overflow-wrap:anywhere}.hero-description{font-size:15px;line-height:1.5;color:#f4f7ff;margin:0;max-width:510px}
    .hero-icon{flex:0 0 62px;width:62px;height:62px;border-radius:20px;background:rgba(255,255,255,.15);display:grid;place-items:center;font-size:30px;font-weight:850}
    .updated{display:flex;align-items:center;gap:7px;color:#dce8ff;font-size:12px;font-weight:600;margin-top:20px;position:relative;z-index:1}
    .client{display:flex;align-items:center;gap:13px}.icon-box{width:47px;height:47px;flex:0 0 47px;border-radius:15px;background:var(--blue-soft);color:var(--blue);display:grid;place-items:center;font-size:22px}
    .client-copy{min-width:0;flex:1}.kicker{font-size:11px;line-height:1.3;font-weight:800;letter-spacing:.7px;color:var(--muted);margin:0 0 3px}.client h3,.section h3{font-size:18px;line-height:1.25;margin:0}.client small{display:block;color:var(--muted);font-size:12px;margin-top:3px}
    .section-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}.section-head>div:last-child{min-width:0}.section-head p{color:var(--muted);font-size:12px;margin:3px 0 0}
    .info{background:var(--bg);border-radius:14px;padding:15px}.info strong{display:block;font-size:15px;margin-bottom:7px}.info p{color:var(--muted);font-size:14px;line-height:1.52;margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
    .timeline{display:flex;padding-top:4px}.step{flex:1;text-align:center;min-width:0}.rail{height:26px;position:relative;display:flex;justify-content:center}.dot{position:relative;z-index:2;width:25px;height:25px;border-radius:50%;border:2px solid var(--line);background:var(--bg);display:grid;place-items:center;color:#fff;font-size:13px;font-weight:900}.line{position:absolute;left:50%;top:11px;width:100%;height:3px;background:var(--line)}.step.done .dot{border-color:var(--blue);background:var(--blue)}.step.done .line{background:var(--blue)}.step:last-child .line{display:none}.step-label{font-size:10px;line-height:1.3;color:var(--muted);font-weight:650;margin-top:7px;overflow-wrap:anywhere}.step.done .step-label{color:var(--text)}
    .cancelled{display:flex;align-items:flex-start;gap:10px;padding:14px;border-radius:14px;background:var(--red-soft);color:var(--text);font-size:14px;line-height:1.45}.cancelled b{color:var(--red);font-size:20px;line-height:1}
    .dates{display:grid;gap:7px}.date-row{min-height:56px;display:flex;align-items:center;gap:12px;padding:6px 0}.date-row+.date-row{border-top:1px solid var(--line)}.date-row .date-icon{width:42px;height:42px;border-radius:13px;background:var(--bg);display:grid;place-items:center;font-size:19px}.date-row small{display:block;color:var(--muted);font-size:12px;margin-bottom:2px}.date-row strong{font-size:14px}
    .refresh{width:100%;min-height:50px;border:0;border-radius:14px;background:var(--blue-soft);color:var(--blue);font-weight:800;cursor:pointer;display:flex;justify-content:center;align-items:center;gap:8px}.refresh:disabled{opacity:.58;cursor:wait}.refresh:active{transform:scale(.99)}
    .footer{text-align:center;color:var(--muted);font-size:11px;line-height:1.5;padding:14px 18px 0}
    .state{text-align:center;padding:36px 22px}.state-icon{width:68px;height:68px;border-radius:22px;background:var(--blue-soft);color:var(--blue);font-size:30px;display:grid;place-items:center;margin:0 auto 16px}.state h2{font-size:20px;margin:0 0 7px}.state p{color:var(--muted);line-height:1.5;margin:0}.spinner{width:28px;height:28px;border:3px solid var(--line);border-top-color:var(--blue);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    .hidden{display:none!important}
    @media(max-width:380px){.page{padding-left:10px;padding-right:10px}.card{padding:15px;border-radius:17px}.hero{padding:19px}.hero h2{font-size:25px}.hero-icon{width:52px;height:52px;flex-basis:52px;border-radius:17px;font-size:25px}.step-label{font-size:9px}.private{font-size:11px}}
    @media(prefers-color-scheme:dark){:root{--bg:#040c1a;--card:#07152d;--text:#f8faff;--muted:#9cacbf;--line:#1c3657;--blue-soft:#0b2d69;--green-soft:#0b3520;--orange-soft:#39270c;--red-soft:#351722;--shadow:0 14px 40px rgba(0,0,0,.16)}.hero{background:linear-gradient(135deg,#075cff,#062967)}.private{background:#102541}.info,.date-row .date-icon,.dot{background:#102541}}
  </style>
</head>
<body>
  <main class="page">
    <header class="brand"><div class="mark">G</div><div><h1>G-Shop</h1><p id="propertyName">Urmărire reparație</p></div></header>
    <div class="private"><span>●</span><span>Link privat. Nu îl distribui altor persoane.</span></div>

    <section id="loading" class="card state"><div class="state-icon"><div class="spinner"></div></div><h2>Încărcăm statusul</h2><p>Preluăm cele mai noi informații din service.</p></section>
    <section id="error" class="card state hidden"><div class="state-icon">!</div><h2>Link indisponibil</h2><p id="errorText">Statusul nu a putut fi încărcat.</p><button class="refresh" id="errorRetry" type="button" style="margin-top:18px">↻ Încearcă din nou</button></section>

    <div id="content" class="hidden">
      <section class="card hero" id="hero">
        <div class="hero-top"><div class="hero-copy"><p class="eyebrow">STATUSUL REPARAȚIEI</p><h2 id="statusLabel">Client înregistrat</h2><p class="hero-description" id="statusDescription"></p></div><div class="hero-icon" id="statusIcon">✓</div></div>
        <div class="updated">↻ <span id="updatedAt">Actualizat acum</span></div>
      </section>

      <section class="card client"><div class="icon-box">♙</div><div class="client-copy"><p class="kicker">CLIENT</p><h3 id="clientName"></h3><small id="sheetNumber" class="hidden"></small></div></section>

      <section id="repairContent" class="hidden">
        <section class="card section"><div class="section-head"><div class="icon-box">▣</div><div><h3>Echipamentul tău</h3><p>Informațiile lucrării curente</p></div></div><div class="info"><strong id="equipment"></strong><p id="reportedIssue" class="hidden"></p></div></section>

        <section class="card section"><div class="section-head"><div class="icon-box">⌁</div><div><h3>Progresul reparației</h3><p>Etapele sunt actualizate de service</p></div></div>
          <div id="timeline" class="timeline">
            <div class="step"><div class="rail"><div class="dot">✓</div><div class="line"></div></div><div class="step-label">Înregistrat</div></div>
            <div class="step"><div class="rail"><div class="dot">✓</div><div class="line"></div></div><div class="step-label">Verificare</div></div>
            <div class="step"><div class="rail"><div class="dot">✓</div><div class="line"></div></div><div class="step-label">În lucru</div></div>
            <div class="step"><div class="rail"><div class="dot">✓</div><div class="line"></div></div><div class="step-label">Finalizat</div></div>
            <div class="step"><div class="rail"><div class="dot">✓</div></div><div class="step-label">Predat</div></div>
          </div>
          <div id="cancelled" class="cancelled hidden"><b>!</b><span>Lucrarea este anulată. Pentru detalii, contactează unitatea service.</span></div>
        </section>

        <section id="dates" class="card dates"></section>
      </section>

      <button class="refresh" id="refresh" type="button">↻ Actualizează statusul</button>
      <p class="footer">Datele sunt afișate direct din sistemul G-Shop al unității service.</p>
    </div>
  </main>
  <script>
    const token=<?php echo json_encode($token, JSON_UNESCAPED_SLASHES); ?>;
    const endpoint='./index.php/public/client-form/'+encodeURIComponent(token);
    const STATUS={
      NEW:{label:'Fișă creată',description:'Fișa a fost creată și urmează verificarea.',icon:'▤',color:'#075cff'},
      WAITING:{label:'În așteptare',description:'Echipamentul așteaptă preluarea de către echipa service.',icon:'◷',color:'#f39000'},
      VERIFYING:{label:'În verificare',description:'Echipamentul este verificat pentru stabilirea diagnosticului.',icon:'⌕',color:'#7c3aed'},
      IN_PROGRESS:{label:'În lucru',description:'Echipa lucrează în acest moment la reparație.',icon:'⚙',color:'#075cff'},
      WAITING_PARTS:{label:'Așteptăm piesele',description:'Reparația este în curs și așteaptă piesele necesare.',icon:'◇',color:'#f39000'},
      COMPLETED:{label:'Reparație finalizată',description:'Lucrarea este finalizată. Service-ul te va contacta pentru predare.',icon:'✓',color:'#14a83b'},
      DELIVERED:{label:'Echipament predat',description:'Echipamentul reparat a fost predat clientului.',icon:'✓',color:'#14a83b'},
      CANCELLED:{label:'Reparație anulată',description:'Lucrarea a fost anulată. Contactează service-ul pentru detalii.',icon:'×',color:'#e7354c'}
    };
    const STEP={NEW:0,WAITING:0,VERIFYING:1,IN_PROGRESS:2,WAITING_PARTS:2,COMPLETED:3,DELIVERED:4,CANCELLED:-1};
    const $=id=>document.getElementById(id);
    const setText=(id,value)=>{$(id).textContent=value??''};
    const show=id=>$(id).classList.remove('hidden');
    const hide=id=>$(id).classList.add('hidden');
    const formatDate=(value,withTime=false)=>{if(!value)return '—';const options=withTime?{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'short',year:'numeric'};return new Intl.DateTimeFormat('ro-RO',options).format(new Date(value))};
    const addDate=(icon,label,value)=>{if(!value)return;const row=document.createElement('div');row.className='date-row';const iconBox=document.createElement('div');iconBox.className='date-icon';iconBox.textContent=icon;const copy=document.createElement('div');const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=formatDate(value);copy.append(small,strong);row.append(iconBox,copy);$('dates').append(row)};

    function render(data){
      setText('propertyName',data.propertyName||'Urmărire reparație');
      setText('clientName',data.client.name);
      const repair=data.repair;
      const current=repair?STATUS[repair.status]:null;
      setText('statusLabel',current?.label||'Client înregistrat');
      setText('statusDescription',current?.description||'Fișa de service se pregătește. Revino în curând pentru actualizări.');
      setText('statusIcon',current?.icon||'○');
      $('hero').style.background=`linear-gradient(135deg,${current?.color||'#075cff'},#073075)`;
      setText('updatedAt','Actualizat '+formatDate(repair?.updatedAt||data.client.updatedAt,true));
      if(repair){
        show('repairContent');show('sheetNumber');setText('sheetNumber','Fișa '+repair.number);
        setText('equipment',[repair.brand,repair.model,repair.equipment].filter(Boolean).join(' · ')||'Echipament înregistrat');
        if(repair.reportedIssue){show('reportedIssue');setText('reportedIssue',repair.reportedIssue)}else hide('reportedIssue');
        const cancelled=repair.status==='CANCELLED';
        $('timeline').classList.toggle('hidden',cancelled);$('cancelled').classList.toggle('hidden',!cancelled);
        document.querySelectorAll('.step').forEach((step,index)=>step.classList.toggle('done',index<=STEP[repair.status]));
        $('dates').replaceChildren();addDate('▣','Primit în service',repair.receivedAt);addDate('⚑','Termen estimat',repair.estimatedAt);addDate('✓','Finalizat',repair.completedAt);
      }else{hide('repairContent');hide('sheetNumber')}
    }

    async function load(){
      hide('error');const firstLoad=$('content').classList.contains('hidden');if(firstLoad)show('loading');
      const button=$('refresh');button.disabled=true;button.textContent='↻ Se actualizează…';
      try{const response=await fetch(endpoint,{headers:{Accept:'application/json'},cache:'no-store'});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.message||'Statusul nu a putut fi încărcat.');render(payload.data);hide('loading');hide('error');show('content')}
      catch(error){hide('loading');if(firstLoad){hide('content');show('error');setText('errorText',error.message||'Statusul nu a putut fi încărcat.')}}
      finally{button.disabled=false;button.textContent='↻ Actualizează statusul'}
    }
    $('refresh').addEventListener('click',load);$('errorRetry').addEventListener('click',load);load();
  </script>
</body>
</html>
