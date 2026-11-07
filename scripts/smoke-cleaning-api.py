"""Exercise the deployed cleaning property with one disposable test client/order.
No WhatsApp messages or push notifications are sent. Only this script's records
are removed; production clients are never edited.
"""
import json
from pathlib import Path
import urllib.request
import urllib.error
import uuid
import io
import base64
from PIL import Image, ImageDraw
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
state=json.loads((ROOT/'tmp/cleaning-deployment.json').read_text(encoding='utf-8'))
BASE='https://curatatorie-canapele.ro/app-api'
MAIN='https://reparatiicalculatoare-bucuresti.ro/app-api'
property_id=state['property']['id']
checks=[]
def request(path, method='GET', body=None, expected=200, auth=True, base=BASE):
    headers={'Accept':'application/json','Content-Type':'application/json'}
    if auth: headers['Authorization']='Bearer '+state['accessToken']
    req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
    try:
        with urllib.request.urlopen(req,timeout=35) as response: status=response.status;raw=response.read()
    except urllib.error.HTTPError as error: status=error.code;raw=error.read()
    if status!=expected: raise AssertionError(f'{method} {path.split("?")[0]}: HTTP {status}, expected {expected}: {raw[:700]!r}')
    payload=json.loads(raw)
    return payload.get('data',payload)

client_id=sheet_id=None
try:
    request('/clients?propertyId='+property_id,expected=401,auth=False)
    properties=request('/properties',base=MAIN)
    assert any(p['id']==property_id for p in properties)
    for endpoint in ['dashboard','clients','service-sheets','technicians','collaborators','whatsapp-messages','reports','audit-logs','service-documents/register']:
        request('/'+endpoint+'?propertyId='+property_id)
    checks.append('property, authentication and module endpoints')
    tag=uuid.uuid4().hex[:8]
    client=request('/clients','POST',{'propertyId':property_id,'firstName':'TEST CURATARE','lastName':tag,'phone':'0700000000','email':'test@example.com','address':'Str. Test nr. 1','city':'București','collaborators':[]},expected=201)
    client_id=client['id']
    (ROOT/'tmp/cleaning-smoke-records.json').write_text(json.dumps({'clientId':client_id}),encoding='utf-8')
    sheet=request('/service-sheets','POST',{'propertyId':property_id,'clientId':client_id,'equipment':'Canapea 3 locuri','reportedIssue':'Curățare tapițerie și perne','technicianName':'Echipă TEST','approveRepair':True,'partsCost':0,'laborCost':0,'totalCost':0},expected=201)
    sheet_id=sheet['id']
    (ROOT/'tmp/cleaning-smoke-records.json').write_text(json.dumps({'clientId':client_id,'sheetId':sheet_id}),encoding='utf-8')
    slots=request('/service-sheets/'+sheet_id+'/documents')
    assert [s['type'] for s in slots]==['INTAKE','EXIT'],slots
    finance=request('/clients/'+client_id+'/financials')
    cleaning={'items':[{'article':'Canapea 220 cm','service':'Curățare șezut, spătar și brațe','quantity':1,'unitPrice':250},{'article':'Fotoliu','service':'Curățare tapițerie','quantity':2,'unitPrice':80}], 'serviceAddress':'București, Str. Test nr. 1','interventionAt':'2026-11-03T10:30:00+00:00','technicianName':'Echipă TEST','notes':'Exemplu de verificare - fără client real.','paymentMethod':'Card','costs':{'currencyCode':'RON','diagnosticFee':30,'discountPercent':10,'advancePaid':100}}
    payload={'cleaning':cleaning,'documentAt':'2026-11-03T10:30:00+00:00','agreementAt':'2026-11-03T10:30:00+00:00','syncCleaningFinancials':True,'financialUpdatedAt':finance['financials'].get('updatedAt')}
    doc=request('/service-sheets/'+sheet_id+'/documents/EXIT','POST',payload,expected=201)
    assert doc['available'] and doc['url'].startswith(BASE+'/')
    assert doc['cleaning']['costs']['totalDue']==396
    with urllib.request.urlopen(doc['url'],timeout=30) as response:
        pdf=response.read();assert pdf.startswith(b'%PDF-')
        (ROOT/'tmp/pdfs/cleaning-live-exit.pdf').write_bytes(pdf)
    current=request('/clients/'+client_id+'/financials')
    assert current['summary']['totalDue']==396 and current['summary']['remainingDue']==296
    assert request('/service-sheets/'+sheet_id)['totalCost']==396
    checks.append('EXIT without INTAKE, PDF download, canonical finance/report amounts')
    payload['financialUpdatedAt']=current['financials'].get('updatedAt')
    intake=request('/service-sheets/'+sheet_id+'/documents/INTAKE','POST',payload,expected=201)
    assert intake['available']
    with urllib.request.urlopen(intake['url'],timeout=30) as response:(ROOT/'tmp/pdfs/cleaning-live-intake.pdf').write_bytes(response.read())
    finance=request('/clients/'+client_id+'/financials')
    payload['financialUpdatedAt']=finance['financials'].get('updatedAt')
    cleaning['items'][0]['unitPrice']=350
    changed=request('/service-sheets/'+sheet_id+'/documents/EXIT','POST',payload)
    assert changed['cleaning']['costs']['totalDue']==486 and changed['url']!=doc['url']
    assert request('/service-sheets/'+sheet_id)['totalCost']==486
    stored=request('/service-sheets/'+sheet_id+'/documents')
    assert next(d for d in stored if d['type']=='INTAKE')['cleaning']['costs']['totalDue']==486
    checks.append('edited values persist and synchronize both existing documents')
    # The actual Finances endpoint must refresh both PDFs, including old public URLs.
    original_identity={d['type']:(d['id'],d['number'],d['documentAt'],d['agreementAt']) for d in stored}
    for payment_status,paid,remaining in [('UNPAID',125,395),('PAID',520,0),('UNPAID',125,395)]:
        saved=request('/clients/'+client_id+'/financials','PUT',{'workPrice':610,'diagnosticFee':40,'discountPercent':20,'advancePaid':125,'paymentStatus':payment_status})
        assert saved['summary']['totalDue']==520 and saved['summary']['remainingDue']==remaining
        updated=request('/service-sheets/'+sheet_id+'/documents')
        for item in updated:
            assert (item['id'],item['number'],item['documentAt'],item['agreementAt'])==original_identity[item['type']]
            costs=item['cleaning']['costs']
            assert costs['totalDue']==520 and costs['receivedAmount']==paid and costs['remainingDue']==remaining
            assert round(sum(line['totalPrice'] for line in item['cleaning']['items']),2)==610
            assert [line['article'] for line in item['cleaning']['items']]==['Canapea 220 cm','Fotoliu']
        with urllib.request.urlopen(changed['url'],timeout=35) as response:
            text=' '.join(p.extract_text() for p in PdfReader(io.BytesIO(response.read())).pages)
            assert '520,00' in text and f'{remaining},00' in text
    stored=updated
    checks.append('Finances updates both PDFs immediately; PAID zero balance; UNPAID restores advance; old links stay current')
    with urllib.request.urlopen(changed['url'],timeout=30) as response:
        reader=PdfReader(io.BytesIO(response.read()))
        pdf_text=' '.join(p.extract_text() for p in reader.pages)
        assert intake['number'] in pdf_text and 'Fișa de intrare de referință' in pdf_text
    before_signature={d['type']:d['url'] for d in stored}
    canvas=Image.new('RGBA',(600,180),(255,255,255,0));draw=ImageDraw.Draw(canvas)
    draw.text((40,40),'TEST SIGNATURE',fill=(7,21,45,255),font_size=36)
    draw.line([(40,100),(350,100)],fill=(7,21,45,255),width=4)
    image_bytes=io.BytesIO();canvas.save(image_bytes,format='PNG')
    signature='data:image/png;base64,'+base64.b64encode(image_bytes.getvalue()).decode()
    signed=request('/service-sheets/'+sheet_id+'/signature','POST',{'signature':signature})
    assert signed['signedAt'] and signed['signatureUrl'].startswith(BASE+'/')
    signed_docs=request('/service-sheets/'+sheet_id+'/documents')
    for signed_doc in signed_docs:
        assert signed_doc['url']!=before_signature[signed_doc['type']]
        with urllib.request.urlopen(signed_doc['url'],timeout=30) as response:
            pdf_bytes=response.read();reader=PdfReader(io.BytesIO(pdf_bytes))
            assert sum(len(page.images) for page in reader.pages)>=2,'Missing PDF signature image'
            (ROOT/('tmp/pdfs/cleaning-signed-'+signed_doc['type'].lower()+'.pdf')).write_bytes(pdf_bytes)
    checks.append('intake reference and date; client signature regenerates both existing PDFs')
    for status,remaining in [('PAID',0),('UNPAID',395)]:
        request('/clients/'+client_id+'/financials','PUT',{'paymentStatus':status})
        signed_docs=request('/service-sheets/'+sheet_id+'/documents')
        for item in signed_docs:
            assert item['cleaning']['costs']['remainingDue']==remaining
            with urllib.request.urlopen(item['url'],timeout=35) as response:
                reader=PdfReader(io.BytesIO(response.read()))
                assert sum(len(p.images) for p in reader.pages)>=2
    checks.append('financial changes preserve existing signatures on both documents')
    request('/service-sheets/'+sheet_id+'/documents/WARRANTY','POST',{},expected=422)
    qr=request('/clients/'+client_id+'/qr','POST',{})
    public_url=qr.get('publicUrl') or qr.get('qr',{}).get('publicUrl') or client.get('qr',{}).get('publicUrl')
    assert public_url and public_url.startswith(BASE+'/'),qr
    resolved=request('/qr/resolve','POST',{'data':public_url,'propertyId':property_id,'action':'OPEN_PROFILE','device':'Automated cleaning verification'})
    assert resolved['clientId']==client_id
    request('/qr/resolve','POST',{'data':public_url,'propertyId':'11111111-1111-4111-8111-111111111111'},expected=422)
    other=request('/clients?propertyId=11111111-1111-4111-8111-111111111111&query='+tag,base=MAIN)
    assert not other['data']
    checks.append('QR URL, scan resolution and property isolation')
    # Derive the token from the document route without assuming the QR landing URL format.
    token=intake['url'].split('/public/client-form/')[1].split('/')[0]
    public=request('/public/client-form/'+token,auth=False)
    assert public['promotion']['imageUrl'].startswith(BASE+'/assets/cleaning/business-card.png')
    dossier=public['repair']['dossierUrl']
    assert dossier.endswith('/dossier/'+sheet_id)
    with urllib.request.urlopen(dossier,timeout=35) as response:
        dossier_bytes=response.read();reader=PdfReader(io.BytesIO(dossier_bytes))
        assert len(reader.pages)==3
        assert 'FIȘĂ DE INTRARE A COMENZII' in reader.pages[0].extract_text()
        assert 'FIȘĂ DE IEȘIRE A COMENZII' in reader.pages[1].extract_text()
        assert len(reader.pages[-1]['/Annots'])==5
        assert '520,00' in reader.pages[0].extract_text() and '520,00' in reader.pages[1].extract_text()
        assert reader.pages[0].get_contents().get_data().count(b' Do') >= 2
        (ROOT/'tmp/pdfs/cleaning-live-dossier.pdf').write_bytes(dossier_bytes)
    request('/public/client-form/'+str(uuid.uuid4())+'/dossier/'+sheet_id,expected=404,auth=False)
    request('/public/client-form/'+token+'/dossier/'+str(uuid.uuid4()),expected=404,auth=False)
    with urllib.request.urlopen(BASE+'/index.php/public/cleaning-business-card.pdf',timeout=35) as response:
        assert len(PdfReader(io.BytesIO(response.read())).pages)==1
    for signed_doc in signed_docs:
        with urllib.request.urlopen(signed_doc['url'],timeout=35) as response:
            pages=PdfReader(io.BytesIO(response.read())).pages
            assert len(pages)==2 and len(pages[-1]['/Annots'])==5
    checks.append('public advert, two-page individual PDFs, three-page dossier, saved values, private token/order access')
    request('/service-sheets/'+sheet_id+'/documents/EXIT','DELETE')
    request('/public/client-form/'+token+'/dossier/'+sheet_id,expected=404,auth=False)
    assert request('/public/client-form/'+token,auth=False)['repair']['dossierUrl'] is None
    slots=request('/service-sheets/'+sheet_id+'/documents')
    assert not next(d for d in slots if d['type']=='EXIT')['available']
    assert next(d for d in slots if d['type']=='INTAKE')['available']
    checks.append('independent document deletion')
    print('\n'.join('OK: '+check for check in checks))
finally:
    if sheet_id: request('/service-sheets/'+sheet_id,'DELETE')
    if client_id: request('/clients/'+client_id,'DELETE')
    print('Temporary test order removed; test client deactivated.')
