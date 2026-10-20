#!/usr/bin/env python3
import json
import urllib.request
import urllib.parse
import time
import math
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / 'places.json'
places = json.loads(DATA.read_text(encoding='utf-8'))

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

updated = []
for p in places:
    # Build a reasonable query; include city keywords if address contains them
    q = f"{p['name']}, {p.get('address','')}, Finland"
    params = {
        'format':'json', 'q': q, 'limit':1, 'addressdetails':1, 'countrycodes':'fi'
    }
    url = 'https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        'User-Agent':'halal-finder-checker/1.0 (your-email@example.com)',
        'From':'your-email@example.com'
    })
    # retry with exponential backoff for transient HTTP errors
    res = []
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                res = json.load(resp)
            break
        except Exception as e:
            print('TRY', attempt, 'ERR', p['id'], p['name'], type(e).__name__, str(e))
            if attempt < 3:
                time.sleep(2 ** attempt)  # 2s, 4s
            else:
                res = []
    if not res:
        print('NORESULT', p['id'], p['name'])
        time.sleep(2.5)
        continue
    r = res[0]
    lat = float(r['lat'])
    lon = float(r['lon'])
    dist = haversine(p['lat'], p['lng'], lat, lon)
    if dist > 50:  # more than 50 meters -> update
        print('UPDATE', p['id'], p['name'], 'dist_m=', int(dist), 'old=',p['lat'],p['lng'],'new=',lat,lon)
        old = (p['lat'], p['lng'])
        p['lat'] = lat
        p['lng'] = lon
        updated.append({'id':p['id'],'name':p['name'],'dist_m':int(dist),'old':old,'new':(lat,lon)})
    else:
        print('OK', p['id'], p['name'], 'dist_m=', int(dist))
    time.sleep(2.5)

if updated:
    DATA.write_text(json.dumps(places, ensure_ascii=False, indent=2), encoding='utf-8')
    print('\nWROTE', len(updated), 'updates')
else:
    print('\nNo updates')

for u in updated:
    print(u)
