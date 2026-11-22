# Campus outlines from Overture Maps land use (OpenStreetMap university/college areas, ODbL): one outline per school,
# nearby pieces grouped and wrapped (no inner rings). Emerson has no OSM campus area, so its old outline is reused.
# Usage: python3 overture_campuses.py   (writes public/data/campuses.geojson)
import os
OUT_PATH = os.path.join(os.path.dirname(__file__), "../../public/data/campuses.geojson")
import pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.compute as pc, shapely.wkb as wkb, pickle, collections
fs = pfs.S3FileSystem(anonymous=True, region="us-west-2")
W,S,E,N=-71.30,42.195,-70.955,42.475
d = ds.dataset("overturemaps-us-west-2/release/2026-11-18.0/theme=base/type=land_use/", filesystem=fs, format="parquet")
f=(pc.field("bbox","xmin")>W)&(pc.field("bbox","xmax")<E)&(pc.field("bbox","ymin")>S)&(pc.field("bbox","ymax")<N)&(pc.field("class").isin(["university","college"]))
rows=d.to_table(filter=f, columns=["geometry","class","names","sources"]).to_pylist()
out=[(r["class"],(r["names"] or {}).get("primary"),wkb.loads(r["geometry"])) for r in rows]

import pickle, json
from shapely.ops import unary_union
from shapely.geometry import Polygon, MultiPolygon, mapping
rows=out
old={f["properties"]["short"]:f for f in json.load(open(OUT_PATH))["features"]}
SCHOOLS=[("Massachusetts Institute of Technology","MIT","MIT","#A31F34"),("Harvard University","Harvard University","Harvard","#A51C30"),
("Lesley University","Lesley University","Lesley","#00467F"),("Boston University","Boston University","BU","#CC0000"),
("Northeastern University","Northeastern University","Northeastern","#C8102E"),(None,"Emerson College","Emerson","#6C2C91"),
("Suffolk University","Suffolk University","Suffolk","#1F3A70"),("Berklee College of Music","Berklee College of Music","Berklee","#2D2D2D"),
("Wentworth Institute of Technology","Wentworth Institute of Technology","Wentworth","#B8860B"),("Massachusetts College of Art and Design","MassArt","MassArt","#E4002B"),
("Harvard Medical School","Harvard Medical School","Harvard Med","#A51C30"),("Emmanuel College","Emmanuel College","Emmanuel","#002F6C"),
("Boston College","Boston College","BC","#8A100B"),("Brandeis University","Brandeis University","Brandeis","#003478"),
("Tufts University","Tufts University","Tufts","#3E8EDE"),("University of Massachusetts Boston","UMass Boston","UMass Boston","#005A8B"),
("Simmons University","Simmons University","Simmons","#00205B")]
import shapely
def outline(g):
    # group pieces closer than ~80 m into one area, wrap each group in one snug outline (no inner rings)
    parts=list(g.geoms) if isinstance(g,MultiPolygon) else [g]
    groups=[]
    for p in parts:
        hit=[x for x in groups if x.distance(p)<0.001]
        for x in hit: groups.remove(x)
        groups.append(unary_union(hit+[p]))
    out=[]
    for x in groups:
        h=x.buffer(0.0005, join_style=2).buffer(-0.00045, join_style=2)  # close ~40 m gaps (streets) and keep the real edge
        if isinstance(h,MultiPolygon): h=max(h.geoms,key=lambda q:q.area)
        out.append(Polygon(h.exterior).simplify(0.00003))
    big=max(p.area for p in out)
    out=[p for p in out if p.area>=0.15*big]
    return out[0] if len(out)==1 else MultiPolygon(out)
feats=[]
for src,name,short,color in SCHOOLS:
    if src: g=unary_union([gg.buffer(0) for c,n,gg in rows if n==src])
    else:
        from shapely.geometry import shape; g=shape(old[short]["geometry"]).buffer(0)
    o=outline(g); b=o.bounds
    print(short, o.geom_type, len(getattr(o,'geoms',[o])), [round(v,4) for v in b])
    feats.append({"type":"Feature","properties":{"name":name,"short":short,"color":color},"geometry":json.loads(json.dumps(mapping(o)))})
def rnd(c): return [rnd(x) for x in c] if isinstance(c[0],(list,tuple)) else [round(c[0],5),round(c[1],5)]
for f in feats: f["geometry"]["coordinates"]=rnd(f["geometry"]["coordinates"])
json.dump({"type":"FeatureCollection","features":feats},open(OUT_PATH,"w"),separators=(",",":"))
