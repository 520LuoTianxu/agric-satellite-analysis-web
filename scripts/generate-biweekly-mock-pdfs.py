#!/usr/bin/env python3
"""Optional offline dev tool. Node24 + reportlab4.4.3 + --font licensed CJK TTF.
Never calls an API/AI service. Committed PDFs work without Python at build/runtime.
The font is subset-embedded, not copied into the repository as a font file.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from xml.sax.saxutils import escape
from datetime import date, timedelta

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.graphics.shapes import Drawing, Line, Circle, String

ROOT=Path(__file__).resolve().parents[1]
GREEN=colors.HexColor('#2b7852'); INK=colors.HexColor('#294337'); MUTED=colors.HexColor('#81948a')
FONT='MockCN'
TEMPLATE='biweekly-detailed-mock-v1'

def last_day(end): return str(date.fromisoformat(end)-timedelta(days=1))
def p(text,kind='body'):
    styles={
      'body':dict(fontSize=10,leading=18,spaceAfter=8,textColor=INK),
      'title':dict(fontSize=26,leading=36,spaceAfter=12,textColor=GREEN),
      'h':dict(fontSize=14,leading=23,spaceBefore=12,spaceAfter=9,textColor=GREEN),
      'small':dict(fontSize=8,leading=13,spaceAfter=6,textColor=MUTED),
    }
    return Paragraph(escape(str(text)).replace('\n','<br/>'),ParagraphStyle(kind,fontName=FONT,wordWrap='CJK',**styles[kind]))
def table(rows,widths=None):
    cells=[[p(v,'small' if i else 'body') for v in row] for i,row in enumerate(rows)]
    t=Table(cells,colWidths=widths or [170,340],hAlign='LEFT',repeatRows=1)
    t.setStyle(TableStyle([
      ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf4ef')),
      ('LINEBELOW',(0,0),(-1,0),.7,colors.HexColor('#a7c4b0')),
      ('LINEBELOW',(0,1),(-1,-1),.3,colors.HexColor('#e0e9e2')),
      ('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
      ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
    ]))
    return t

def chart(r):
    drawing=Drawing(510,155)
    lo=min(x['fvc'] for x in r['series'])-.03;hi=max(x['fvc'] for x in r['series'])+.03
    drawing.add(String(0,145,'FVC 模拟趋势 / 非卫星实测',fontName=FONT,fontSize=9,fillColor=MUTED))
    for j in range(3):
      y=35+j*43;drawing.add(Line(35,y,495,y,strokeColor=colors.HexColor('#e0e9e2'),strokeWidth=.5));drawing.add(String(0,y,f'{(lo+j*(hi-lo)/2)*100:.0f}%',fontName=FONT,fontSize=8,fillColor=MUTED))
    points=[(45+i*87,35+(x['fvc']-lo)/(hi-lo)*86) for i,x in enumerate(r['series'])]
    for a,b in zip(points,points[1:]):drawing.add(Line(*a,*b,strokeColor=GREEN,strokeWidth=2))
    for point,item in zip(points,r['series']):
      drawing.add(Circle(*point,3,fillColor=GREEN,strokeColor=GREEN));drawing.add(String(point[0]-12,15,item['date'][5:],fontName=FONT,fontSize=8,fillColor=MUTED))
    return drawing

def page_frame(canvas,doc):
    canvas.saveState();width,height=A4
    canvas.setStrokeColor(colors.HexColor('#dce8df'));canvas.line(42,height-40,width-42,height-40)
    canvas.setFillColor(MUTED);canvas.setFont(FONT,8);canvas.drawString(42,height-31,'种植双周报 / 详细演示报告 / MOCK')
    canvas.setFillColor(colors.HexColor('#a57c32'));canvas.drawString(42,25,'全部数据及文案为模拟 · 未调用AI · 不构成农学建议')
    canvas.setFillColor(MUTED);canvas.drawRightString(width-42,25,f'{doc.page} / 3');canvas.restoreState()

def render(record,path):
    r=record['report'];sha=record['snapshotSha256'];pct=lambda v:f'{round(v*100)}%'
    mean_temp=sum(d['temp'] for d in r['weather'])/len(r['weather'])
    story=[p('种植双周报','title'),p(f"{r['cropName']} · {r['label']} · {r['season']}",'h'),p(f"{r['field']} | {r['start']} — {last_day(r['end'])} | Asia/Shanghai",'small'),
      p('这是可下载的完整Mock PDF，不是真实农情报告。数据来自与网页相同的固定快照，以下解读为离线规则预置文案，未调用AI模型。','body'),
      table([['01 / 本期核心事实','模拟数值 / 证据编号'],['生育期归属',record['primaryName']+'；覆盖：'+record['coveredNames']+' [E1]'],['遥感指标',f"NDVI {r['ndvi']:.2f} / FVC {pct(r['fvc'])} / LAI {r['lai']:.2f} / NDRE {r['ndre']:.2f} [E2]"],['观测质量',f"有效观测 {r['validDays']} 日 / 有效像元 {pct(r['validFraction'])} / 最大间隔 {r['gapDays']} 天 [E2]"],['天气背景',f"降水 {r['rainTotal']} mm / 历史模拟参照 {r['historicRain']} mm / 平均气温 {mean_temp:.1f} °C [E3]"]]),Spacer(1,14),chart(r),
      p('02 / 个性化解读示例（预置Mock，非AI输出）','h'),
      p(f"{r['cropName']}本期按{record['primaryName']}主归属解读。"+(f"窗口跨越{record['coveredNames']}，不重复归档，同一指标不能直接当作两个阶段的独立观测。" if len(r['coveredGrowthPeriods'])>1 else '窗口内阶段来自模拟排期，不能据此确认真实生育进程。')+' [E1]'),
      p(f"模拟FVC为{pct(r['fvc'])}，上期参照为{pct(r['previousFvc'])}，差值为{round((r['fvc']-r['previousFvc'])*100)}个百分点。这里只描述样本数值变化，不推断出苗率、产量或灾损。FVC与LAI均尚未验证。[E2]"),
      PageBreak(),
      p('03 / 证据明细与天气背景','h'),
      p(f"本期模拟降水{r['rainTotal']} mm，低于历史模拟参照{r['historicRain']} mm。降水差异只能提供水分背景；缺少灌溉、田间墒情与有效Sentinel-1雷达等证据时，不能确定受旱或无涝风险。[E3、E4]"),
      table([['日期（Asia/Shanghai）','模拟降水 / mm','模拟气温 / °C']]+[[d['date'],str(d['rain']),f"{d['temp']:.2f}"] for d in r['weather']],[220,145,145]),
      p('04 / 对比与核查建议（预置Mock）','h'),
      p(f"历史同期FVC模拟参照{pct(r['historicFvc'])}，周边模拟参照{pct(r['peerFvc'])}。样本不代表真实历史样本量、邻域可比性或同品种条件，不提供分位数或真实长势排名。[E2]"),
      p('建议先核查种植方案与阶段日期、云掩膜/有效像元及灌溉记录；有连续偏低信号再开展田间墒情与排水核查。此清单仅演示报告结构，不构成现实处方。[E4]'),
      PageBreak(),
      p('05 / 遥感明细、限制与可追溯性','h'),
      table([['日期','NDVI','FVC','LAI','本期窗口']]+[[x['date'],f"{x['ndvi']:.2f}",pct(x['fvc']),f"{x['lai']:.2f}",'是' if x['inPeriod'] else '否'] for x in r['series']],[150,85,85,85,105]),
      p('证据索引与缺失限制','h'),
      p('[E1] 本地固定的种植季/生育期排期，报告采用[start,end)半开窗口，按起始日主归档；跨期只列一次。不是实测物候。'),
      p('[E2] 固定模拟遥感指标、观测序列与质量字段。FVC/LAI为NOT_VALIDATED概念值，缺少地面真值、FVC端元校准和LAI完整模型输入；PSRI未启用，不补零或反推。'),
      p('[E3] 固定模拟逐日天气与历史降水参照，不调用气象API，也不包含预报。'),
      p('[E4] 灌溉、墒情、完整灾害证据与真实产量均缺失；不把缺失解释为安全，不编造灾害概率、产量或损失。'),
      p('版本与快照','h'),
      table([['属性','值'],['report_id / data_kind',r['id']+' / mock'],['snapshot_sha256',sha[:32]+'\n'+sha[32:]],['template / fixture',TEMPLATE+' / mock-fixture-2'],['model / narrative','none-mock-template / 预置规则文案，非实际AI'],['policy','mock-policy-2 / 不使用真实地块事实']]),
      p('本报告与网页共享不可变Mock事实快照。正式后台另阶段编写；在明确收到对接指令前，前端持续使用Mock。','small')]
    doc=SimpleDocTemplate(str(path),pagesize=A4,leftMargin=42,rightMargin=42,topMargin=57,bottomMargin=47,title=f"MOCK {r['cropName']} {r['label']} 种植双周报",author='种植项目分析 · Mock prototype',invariant=1)
    doc.build(story,onFirstPage=page_frame,onLaterPages=page_frame,canvasmaker=Canvas)


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--font',type=Path,required=True,help='Licensed CJK TrueType font; subset-embedded only');args=parser.parse_args()
    pdfmetrics.registerFont(TTFont(FONT,str(args.font)))
    pdfmetrics.registerFontFamily(FONT,normal=FONT,bold=FONT,italic=FONT,boldItalic=FONT)
    js="""import {MOCK_REPORTS,growthPeriodNames} from './src/lib/biweekly/mock-report.ts';import{createHash}from'node:crypto';console.log(JSON.stringify(MOCK_REPORTS.map(report=>({report,snapshotSha256:createHash('sha256').update(JSON.stringify(report)).digest('hex'),primaryName:growthPeriodNames(report.crop,[report.primaryGrowthPeriod]),coveredNames:growthPeriodNames(report.crop,report.coveredGrowthPeriods)}))));"""
    records=json.loads(subprocess.check_output(['node','--input-type=module','-e',js],cwd=ROOT,text=True))
    target=ROOT/'public/biweekly-mock';target.mkdir(parents=True,exist_ok=True)
    manifest={'dataKind':'mock','templateVersion':TEMPLATE,'modelVersion':'none-mock-template','artifacts':[]}
    for record in records:
      name=record['report']['id']+'.pdf';path=target/name;render(record,path)
      # Validate that the explicit page-break template has not overflowed silently.
      info=subprocess.check_output(['pdfinfo',str(path)],text=True)
      pages=int(next(line.split(':')[1].strip() for line in info.splitlines() if line.startswith('Pages:')))
      if pages!=3:raise RuntimeError(f'{name}: expected3 pages, found{pages}; fix layout before publishing')
      manifest['artifacts'].append({'reportId':record['report']['id'],'status':'ready','url':'/biweekly-mock/'+name,'pages':pages,'snapshotSha256':record['snapshotSha256'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
      print(name,path.stat().st_size,'bytes',pages,'pages')
    (ROOT/'src/lib/biweekly/mock-pdf-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
