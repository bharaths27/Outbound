import numpy as np, math
a=6378137.0; f=1/298.257222101; e=math.sqrt(2*f-f*f); FT=1200/3937
phi1=math.radians(42+41/60); phi2=math.radians(41+43/60); phi0=math.radians(41); lam0=math.radians(-71.5)
def _m(p): return math.cos(p)/math.sqrt(1-e*e*math.sin(p)**2)
def _t(p): return math.tan(math.pi/4-p/2)/((1-e*math.sin(p))/(1+e*math.sin(p)))**(e/2)
n=(math.log(_m(phi1))-math.log(_m(phi2)))/(math.log(_t(phi1))-math.log(_t(phi2)))
F=_m(phi1)/(n*_t(phi1)**n); r0=a*F*_t(phi0)**n
SHIFT=np.array([731100.0,2902900.0]); ORIGIN=np.array([52500.0,57500.0])
def scene_to_lnglat(x,y):
    """scene feet (BPDA city-mapping export) -> lon, lat (NAD83 ~ WGS84)"""
    X=(np.asarray(x)+ORIGIN[0]+SHIFT[0])*FT-200000; Y=r0-((np.asarray(y)+ORIGIN[1]+SHIFT[1])*FT-750000)
    r=np.sign(n)*np.hypot(X,Y); t=(r/(a*F))**(1/n); th=np.arctan2(X,Y)
    lam=th/n+lam0; p=np.pi/2-2*np.arctan(t)
    for _ in range(8): p=np.pi/2-2*np.arctan(t*((1-e*np.sin(p))/(1+e*np.sin(p)))**(e/2))
    return np.degrees(lam), np.degrees(p)
