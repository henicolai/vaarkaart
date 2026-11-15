# S-57 ENC-cel -> compact JSON voor VaarKaart
import os, sys, json, glob, shutil, math
os.environ['OGR_S57_OPTIONS']='SPLIT_MULTIPOINT=ON,ADD_SOUNDG_DEPTH=ON,RETURN_LINKAGES=OFF,LNAM_REFS=OFF,UPDATES=APPLY'
import numpy as np, pyogrio, shapely
from pyogrio.raw import read
KEEP=['OBJNAM','DRVAL1','DRVAL2','VALDCO','COLOUR','COLPAT','BOYSHP','BCNSHP','CATLAM','CATCAM','CATSPM','LITCHR','SIGGRP','SIGPER','VALNMR','HEIGHT','SECTR1','SECTR2','CATWRK','VALSOU','WATLEV','CATOBS','CATRES','RESTRN','INFORM','NINFOM','VERCLR','VERCCL','VERCOP','HORCLR','CATBRG','TOPSHP','CATSLC','CATLMK','FUNCTN','CONVIS','ORIENT','TRAFIC','DEPTH','SCAMIN','CATCOA','CATACH','CATMOR','CATHAF','CATSCF','CATLIT','CATPIL','COMCHA','CATCOV','NOBJNM','CATFOG','CATSIT','CATSIW','CATROS','CATPIP','CATCBL','CATREA','CATNAV','CATTRK','CATFRY','CATWAT','NATSUR','CATDAM','CATGAT','CATSEA','ELEVAT','QUASOU','TECSOU','EXPSOU','CATMFA','CATDPG','CATCTR','CATPLE','CATPRA','CATOFP','CATSIL','LITVIS','EXCLIT','MLTYLT','BURDEP','CATLND','CATVEG','CONDTN','PEREND','PERSTA','DATEND','DATSTA','CATZOC','MARSYS','ORIENT','CATTSS']
# tekenvolgorde: vlakken eerst (onder -> boven), dan lijnen, dan punten
AREA=['DEPARE','DRGARE','UNSARE','LNDARE','LAKARE','RIVERS','CANALS','LOKBSN','DOCARE','BUAARE','VEGATN','SLOGRD','AIRARE','RUNWAY','SLCONS','PONTON','FLODOC','DRYDOC','HULKES','DAMCON','DYKCON','CAUSWY','BRIDGE','TUNNEL','BUISGL','SILTNK','LNDMRK','FORSTC','MORFAC','GATCON','WRECKS','OBSTRN','OFSPLF','PYLONS','CRANES','BERTHS','HRBFAC','SMCFAC',
      'FAIRWY','TSSLPT','TSEZNE','ISTZNE','PRCARE','DWRTPT','RECTRC','ACHARE','ACHBRT','RESARE','CTNARE','MIPARE','DMPGRD','MARCUL','CBLARE','PIPARE','SPLARE','TESARE','EXEZNE','PRDARE','OSPARE','SWPARE','PILBOP','SEAARE','LNDRGN','SBDARE','WEDKLP','ADMARE','HRBARE','M_COVR']
ALL=set(AREA)|set(['DEPCNT','COALNE','CBLSUB','CBLOHD','PIPSOL','PIPOHD','NAVLNE','RECTRC','RCRTCL','DWRTCL','TSSBND','TSELNE','FERYRT','ROADWY','RAILWY','RADLNE','STSLNE','MARCUL','FSHFAC','SLOTOP','CONVYR',
  'SOUNDG','BOYLAT','BOYCAR','BOYSPP','BOYSAW','BOYISD','BOYINB','BCNLAT','BCNCAR','BCNSPP','BCNSAW','BCNISD','LITFLT','LITVES','LIGHTS','TOPMAR','UWTROC','PILPNT','DISMAR','RSCSTA','FOGSIG','RTPBCN','RDOCAL','RDOSTA','RADSTA','SISTAT','SISTAW','CGUSTA','CTRPNT','LNDELV','DAYMAR','MAGVAR','WATTUR','CURENT','SPRING','TS_PAD','NEWOBJ'])
IENC={'bridge':'BRIDGE','berths':'BERTHS','hrbare':'HRBARE','resare':'RESARE','sistat':'SISTAT','sistaw':'SISTAW','lokbsn':'LOKBSN','cblohd':'CBLOHD','feryrt':'FERYRT','dismar':'DISMAR','rdocal':'RDOCAL','notmrk':'NOTMRK','wtwaxs':'WTWAXS','trnbsn':'TRNBSN','bunsta':'BUNSTA','termnl':'TERMNL','hrbbsn':'HRBBSN','lkbspt':'LKBSPT','prtare':'PRTARE','hulkes':'HULKES','ponton':'PONTON','flodoc':'FLODOC','achare':'ACHARE','depare':'DEPARE','lndare':'LNDARE','slcons':'SLCONS','boylat':'BOYLAT','bcnlat':'BCNLAT','daymar':'DAYMAR','boysaw':'BOYSAW','boycar':'BOYCAR','wrecks':'WRECKS','uwtroc':'UWTROC','curent':'CURENT','gatcon':'GATCON','vehtrf':'VEHTRF','excnst':'EXCNST','refdmp':'REFDMP'}
AREA+=['HRBBSN','TRNBSN','TERMNL','PRTARE','LKBSPT']
ALL|=set(AREA)|set(IENC.values())|{'PYLONS','CRANES'}
KEEP+=['CATNMK','FNCTNM','VERDAT','HORLEN','HORWID','WTWDIS','CATDIS','BUNVES','ADDMRK','CATBRT','CLSDNG','CATSLC','HORCLL','VERCSA']
AREA_ORD={c:i for i,c in enumerate(AREA)}
def clean(v):
    if v is None: return None
    if isinstance(v,np.ndarray):
        v=[str(x) for x in v.tolist() if x not in (None,'')]
        return ','.join(v) if v else None
    if isinstance(v,(np.integer,)): return int(v)
    if isinstance(v,(float,np.floating)):
        if math.isnan(v): return None
        v=float(v); return int(v) if v==int(v) else round(v,2)
    if isinstance(v,str):
        v=v.strip(); return v or None
    return str(v)
R=lambda a: [round(float(x),6) for x in a]
def flat(coords):
    # gehele getallen (graden x 1e6), eerste punt absoluut, daarna verschillen
    c=np.rint(np.asarray(coords)[:,:2]*1e6).astype(np.int64)
    d=np.vstack([c[:1],np.diff(c,axis=0)])
    return d.reshape(-1).tolist()
def flatf(coords):
    c=np.asarray(coords)[:,:2]; return R(c.reshape(-1))
def conv(src,out):
    name=os.path.basename(src)[:-4]
    meta,_,_,flds=read(src,layer='DSID'); D=dict(zip(meta['fields'],[f[0] for f in flds]))
    feats=[]; snd=[]; bb=[180,90,-180,-90]; cov=[]
    for L,_ in pyogrio.list_layers(src):
        LL=IENC.get(L,L)
        if LL not in ALL: continue
        try: meta,_,geoms,flds=read(src,layer=L)
        except Exception as e: print('  !',L,e); continue
        if geoms is None: continue
        names=list(meta['fields']); cols=dict(zip(names,flds))
        up={n.upper():n for n in names}
        keep=[n for n in dict.fromkeys(KEEP) if n in up]
        for i,wkb in enumerate(geoms):
            if wkb is None: continue
            g=shapely.from_wkb(wkb)
            if g.is_empty: continue
            L=LL
            if L=='SOUNDG':
                snd+= [round(g.x,6),round(g.y,6),clean(cols['DEPTH'][i])]; continue
            p={}
            for n in keep:
                v=clean(cols[up[n]][i])
                if v is not None: p[n]=v
            parts=list(g.geoms) if g.geom_type.startswith('Multi') or g.geom_type=='GeometryCollection' else [g]
            for q in parts:
                t=q.geom_type
                if t=='Point': gt,co=0,R([q.x,q.y])
                elif t=='LineString': gt,co=1,flat(q.coords)
                elif t=='Polygon': gt,co=2,[flat(q.exterior.coords)]+[flat(r.coords) for r in q.interiors]
                else: continue
                b=q.bounds; bb=[min(bb[0],b[0]),min(bb[1],b[1]),max(bb[2],b[2]),max(bb[3],b[3])]
                if L=='M_COVR':
                    if p.get('CATCOV')==1 and gt==2: cov.append([flatf(q.exterior.coords)])
                    continue
                feats.append([L,gt,co,p])
    feats.sort(key=lambda f:(-f[1], AREA_ORD.get(f[0],999) if f[1]==2 else 0))
    o={'q':1000000,'n':name,'s':int(D.get('DSPM_CSCL') or 0),'ed':str(D.get('DSID_EDTN')),'up':str(D.get('DSID_UPDN')),'d':str(D.get('DSID_ISDT')),'t':clean(D.get('DSID_COMT')),
       'bb':[round(x,6) for x in bb],'cov':cov,'snd':snd,'f':feats}
    json.dump(o,open(out,'w'),separators=(',',':'),ensure_ascii=False)
    return o
if __name__=='__main__':
    srcroot,outdir=sys.argv[1],sys.argv[2]; os.makedirs(outdir,exist_ok=True); os.makedirs('src',exist_ok=True)
    cat=[]
    for cel in sorted(os.listdir(srcroot)):
        fs=glob.glob(f'{srcroot}/{cel}/*/*/{cel}.[0-9][0-9][0-9]')+glob.glob(f'{srcroot}/{cel}/{cel}.[0-9][0-9][0-9]')
        if not any(f.endswith('.000') for f in fs): continue
        d=f'src/{cel}'; os.makedirs(d,exist_ok=True)
        for f in fs: shutil.copy(f,d)
        o=conv(f'{d}/{cel}.000',f'{outdir}/{cel}.json')
        sz=os.path.getsize(f'{outdir}/{cel}.json')
        cat.append({**({'mz':int(os.environ['MZ'])} if os.environ.get('MZ') else {}),'n':cel,'s':o['s'],'bb':o['bb'],'ed':o['ed'],'up':o['up'],'d':o['d'],'t':o['t'],'kb':sz//1024,'cov':[c[0] for c in o['cov']]})
        print(cel,o['s'],o['ed'],o['up'],o['d'],len(o['f']),len(o['snd'])//3,sz//1024,'kB',len(fs),'bestanden')
    json.dump(cat,open(f'{outdir}/index.json','w'),separators=(',',':'),ensure_ascii=False)
