"""Compare one real regression in Top/Side/Front using a shared reference basis."""
import json, math
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

root = Path(__file__).resolve().parents[1]
data = json.loads((root/'tests/fixtures/autofit-job9426-frame29-box62.json').read_text(encoding='utf-8'))
report = json.loads((root/'docs/verification/autofit-real-case-1.4.0.json').read_text(encoding='utf-8'))
reference = report['referenceBox']['points']
points = np.unique(np.array(data['roiPoints'] + data['groundSupport']), axis=0)
origin = np.array(reference[:3]); yaw = reference[5]
rotation = np.array([[math.cos(yaw), math.sin(yaw), 0],[-math.sin(yaw), math.cos(yaw), 0],[0,0,1]])
points = (points-origin) @ rotation.T
points = points[(np.abs(points[:,0])<3.3)&(np.abs(points[:,1])<1.9)&(np.abs(points[:,2])<1.8)]

def vertices(p):
    cs, sn = math.cos(p[5]), math.sin(p[5])
    return (np.array([[p[0]+cs*x-sn*y,p[1]+sn*x+cs*y,p[2]+z]
        for x in [-p[6]/2,p[6]/2] for y in [-p[7]/2,p[7]/2] for z in [-p[8]/2,p[8]/2]])-origin) @ rotation.T

def hull(values):
    values=sorted(set(map(tuple,values)))
    def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lower=[];upper=[]
    for p in values:
        while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
        lower.append(p)
    for p in reversed(values):
        while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
        upper.append(p)
    poly=lower[:-1]+upper[:-1]
    return np.array(poly+[poly[0]])

plt.style.use('dark_background')
fig,axes=plt.subplots(1,3,figsize=(15,5),gridspec_kw={'width_ratios':[1.5,1.5,1]})
colors={'oldBox':'#ff7373','newBox':'#58bfff','referenceBox':'#73e2a7'}
for ax,(title,indices) in zip(axes,[('Top (XY)',[0,1]),('Side (XZ)',[0,2]),('Front (YZ)',[1,2])]):
    ax.scatter(points[:,indices[0]],points[:,indices[1]],s=.6,c='#c1cbd4',alpha=.4,rasterized=True)
    for name,color in colors.items():
        poly=hull(vertices(report[name]['points'])[:,indices]);ax.plot(poly[:,0],poly[:,1],color=color,lw=1.9,linestyle='--' if name=='referenceBox' else '-')
    ax.set_title(title);ax.set_aspect('equal');ax.grid(alpha=.1);ax.set_xlabel('metres');ax.set_ylabel('metres')
fig.suptitle('Job 9426 / frame 29 / box 62 — actual exported LiDAR\nReference orientation used only for display; not as input to fitting',fontsize=12)
fig.legend([Line2D([0],[0],color=colors[k],lw=2,ls='--' if k=='referenceBox' else '-') for k in colors],['Old auto-fit','New 1.4.0','User reference'],loc='lower center',ncol=3)
fig.tight_layout(rect=[0,.06,1,.87])
fig.savefig(root/'docs/verification/autofit-real-case-1.4.0.png',dpi=160)
