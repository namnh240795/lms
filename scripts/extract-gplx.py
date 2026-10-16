"""Extract official question text, underlined answer keys, and illustration crops."""
import json,re,hashlib
from pathlib import Path
import pdfplumber
source=Path('data/gplx/official-600.pdf')
image_dir=Path('apps/web/public/gplx');image_dir.mkdir(parents=True,exist_ok=True)
questions=[];current=None;option=None;image_count=0
with pdfplumber.open(source) as pdf:
 for page in pdf.pages[4:]:
  words=page.extract_words(y_tolerance=4,x_tolerance=2)
  lines=[]
  for word in words:
   if word['top']<54:continue
   if any(im['x0']-1<=word['x0'] and word['x1']<=im['x1']+1 and im['top']<=word['top']<=im['bottom'] for im in page.images):continue
   row=next((row for row in reversed(lines[-3:]) if abs(row['top']-word['top'])<4),None)
   if row is None:row={'top':word['top'],'bottom':word['bottom'],'words':[]};lines.append(row)
   row['words'].append(word);row['bottom']=max(row['bottom'],word['bottom'])
  lines.sort(key=lambda row:row['top'])
  headers=[]
  for row in lines:
   row['text']=' '.join(w['text'] for w in sorted(row['words'],key=lambda w:w['x0']))
   match=re.match(r'^Câu\s+(\d+)[.:]\s*(.*)',row['text'])
   if match:headers.append((int(match[1]),row['top']))
  for number,top in headers:
   bottom=next((y for n,y in headers if y>top),page.height-40)
   images=[im for im in page.images if top<im['top']<bottom]
   if images:
    x0=min(im['x0'] for im in images)-3;x1=max(im['x1'] for im in images)+3
    y0=min(im['top'] for im in images)-3;y1=max(im['bottom'] for im in images)+3
    path=image_dir/f'question-{number:03}.png'
    page.crop((x0,y0,x1,y1)).to_image(resolution=130).save(path)
    image_count+=1
  expanded=[]
  for row in lines:
   words=sorted(row['words'],key=lambda w:w['x0']); groups=[[]]
   for word in words:
    if groups[-1] and re.fullmatch(r'[1-6]\.',word['text']) and word['x0']-groups[-1][-1]['x1']>18:groups.append([])
    groups[-1].append(word)
   for group in groups:expanded.append({**row,'words':group,'text':' '.join(w['text'] for w in group)})
  in_chapter=False
  for row in expanded:
   text=row['text']
   if text.startswith('CHƯƠNG'):in_chapter=True;continue
   match=re.match(r'^Câu\s+(\d+)[.:]\s*(.*)',text)
   if match:
    in_chapter=False
    current={'number':int(match[1]),'prompt':match[2],'options':[],'sourcePages':[page.page_number]}
    path=image_dir/f"question-{current['number']:03}.png"
    if path.exists():current['image']=f"/gplx/{path.name}"
    questions.append(current);option=None;continue
   if in_chapter or current is None:continue
   if page.page_number not in current['sourcePages']:current['sourcePages'].append(page.page_number)
   # Captions belonging to illustrations are already preserved inside crops.
   if False:continue
   match=re.match(r'^([1-6])\.\s+(.*)',text)
   if match:
    option={'id':match[1],'text':match[2],'underlined':False};current['options'].append(option)
   elif option:option['text']+=' '+text
   else:current['prompt']+=' '+text
   if option:
    underlines=[rect for rect in page.rects if rect['height']<2 and rect['width']>10 and abs(rect['top']-row['bottom'])<5 and rect['x0']<max(w['x1'] for w in row['words']) and rect['x1']>min(w['x0'] for w in row['words'])]
    if underlines:option['underlined']=True
for q in questions:
 keys=[o['id'] for o in q['options'] if o.pop('underlined')]
 q['correctOptionId']=keys[0] if len(keys)==1 else None
 q['answerCandidates']=keys
 if q['number']==3:
  for choice in q['options']:choice['text']=choice['text'].replace('đường b ộ','đường bộ')
 q['prompt']=re.sub(r'\s+',' ',q['prompt']).strip()
errors=[{'number':q['number'],'answers':q['answerCandidates'],'options':len(q['options'])} for q in questions if q['correctOptionId'] is None or not 2<=len(q['options'])<=6]
report={'pages':188,'questions':len(questions),'uniqueNumbers':len(set(q['number'] for q in questions)),'illustrations':image_count,'errors':errors,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
Path('data/gplx/questions.json').write_text(json.dumps(questions,ensure_ascii=False,indent=2)+'\n')
Path('data/gplx/extraction-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
