from datetime import datetime, timedelta
import json
import os
import re
import secrets
import shutil
import time
import io
import urllib.parse
import zlib
import zipfile
from xml.sax.saxutils import escape

import requests
from flask import Flask, Response, jsonify, make_response, redirect, request
from garminconnect import Garmin

SESS = '/var/lib/gpx-api/sessions'
SHARES = '/var/lib/gpx-api/shares'
SHARE_ID_RE = re.compile(r'^[a-hjkmnp-z2-9]{8}$')
SHARE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'
SHARE_TTL = 14 * 86400


def prune_shares():
    now = time.time()
    for name in os.listdir(SHARES):
        p = os.path.join(SHARES, name)
        if now - os.path.getmtime(p) > SHARE_TTL:
            os.remove(p)
SESSION_TTL = 7 * 86400
MFA_TTL = 600
SID_RE = re.compile(r'^[A-Za-z0-9_-]{20,64}$')
COOKIE = 'gpxsid'
MFA_PENDING: dict[str, tuple[Garmin, object, float]] = {}

os.makedirs(SESS, mode=0o700, exist_ok=True)
app = Flask(__name__)


def prune():
    now = time.time()
    for t in [t for t, v in MFA_PENDING.items() if now - v[2] > MFA_TTL]:
        MFA_PENDING.pop(t, None)
    for name in os.listdir(SESS):
        d = os.path.join(SESS, name)
        if now - os.path.getmtime(d) > SESSION_TTL:
            shutil.rmtree(d, ignore_errors=True)


def sess_dir(sid):
    return os.path.join(SESS, sid)


def get_client():
    sid = request.cookies.get(COOKIE, '')
    if not SID_RE.match(sid) or not os.path.isdir(sess_dir(sid)):
        return None
    d = sess_dir(sid)
    try:
        g = Garmin()
        g.login(d)
        os.utime(d)
        return g
    except Exception:
        shutil.rmtree(d, ignore_errors=True)
        return None


def friendly(e):
    s = str(e)
    if '401' in s or 'Unauthorized' in s or 'credentials' in s.lower():
        return 'Wrong email or password'
    if '429' in s or 'Too Many' in s:
        return 'Garmin is rate-limiting logins. Wait a few minutes and try again.'
    return 'Garmin login failed: ' + s[:120]


def finish_login(g):
    sid = secrets.token_urlsafe(24)
    d = sess_dir(sid)
    os.makedirs(d, mode=0o700)
    g.client.dump(d)
    name = None
    try:
        name = g.full_name or g.get_full_name()
    except Exception:
        pass
    with open(os.path.join(d, 'profile.json'), 'w') as f:
        json.dump({'name': name}, f)
    resp = make_response(jsonify(status='ok', name=name))
    secure = request.headers.get('X-Forwarded-Proto', '') == 'https'
    resp.set_cookie(COOKIE, sid, max_age=SESSION_TTL, httponly=True, secure=secure, samesite='Lax', path='/api/garmin')
    return resp


@app.post('/api/garmin/login')
def garmin_login():
    prune()
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    if not email or not password or len(email) > 200 or len(password) > 200:
        return jsonify(error='Email and password are required.'), 400
    try:
        g = Garmin(email=email, password=password, return_on_mfa=True)
        r1, r2 = g.login()
        if r1 == 'needs_mfa':
            ticket = secrets.token_urlsafe(16)
            MFA_PENDING[ticket] = (g, r2, time.time())
            return jsonify(status='mfa_required', ticket=ticket)
        return finish_login(g)
    except Exception as e:
        return jsonify(error=friendly(e)), 401


@app.post('/api/garmin/mfa')
def garmin_mfa():
    data = request.get_json(silent=True) or {}
    ticket = data.get('ticket') or ''
    code = (data.get('code') or '').strip()
    pending = MFA_PENDING.get(ticket)
    if not pending:
        return jsonify(error='This sign-in expired. Start again.'), 410
    if not re.match(r'^[0-9]{4,8}$', code):
        return jsonify(error='Enter the numeric code from your authenticator or email.'), 400
    g, state, _ = pending
    try:
        g.resume_login(state, code)
    except Exception as e:
        return jsonify(error='Code rejected: ' + str(e)[:100]), 401
    MFA_PENDING.pop(ticket, None)
    return finish_login(g)


@app.get('/api/garmin/status')
def garmin_status():
    g = get_client()
    if not g:
        return jsonify(logged_in=False)
    name = None
    try:
        with open(os.path.join(sess_dir(request.cookies[COOKIE]), 'profile.json')) as f:
            name = json.load(f).get('name')
    except Exception:
        pass
    return jsonify(logged_in=True, name=name)


@app.get('/api/garmin/activities')
def garmin_activities():
    g = get_client()
    if not g:
        return jsonify(error='Not signed in to Garmin.'), 401
    rng = request.args.get('range', '30')
    cutoff = None if rng == 'all' else (datetime.now() - timedelta(days=int(rng))).strftime('%Y-%m-%d')
    acts, start = [], 0
    try:
        while start < 1000:
            batch = g.get_activities(start, 100) or []
            acts += [a for a in batch if is_cycling(a)]
            if len(batch) < 100 or (cutoff and batch[-1].get('startTimeLocal', '')[:10] < cutoff):
                break
            start += 100
    except Exception as e:
        return jsonify(error='Could not load activities: ' + str(e)[:100]), 502
    if cutoff:
        acts = [a for a in acts if (a.get('startTimeLocal') or '')[:10] >= cutoff]
    slim = [{
        'id': a.get('activityId'),
        'name': a.get('activityName') or 'Activity',
        'type': (a.get('activityType') or {}).get('typeKey', ''),
        'start': a.get('startTimeLocal'),
        'distance': a.get('distance') or 0,
        'duration': a.get('duration') or 0,
        'elevationGain': a.get('elevationGain'),
        'avgSpeed': a.get('averageSpeed'),
        'avgHr': a.get('averageHR'),
        'gps': bool(a.get('hasPolyline')),
    } for a in acts]
    return jsonify(activities=slim)


def is_cycling(a):
    k = (a.get('activityType') or {}).get('typeKey', '')
    return 'cycl' in k or 'bik' in k or k == 'virtual_ride'



@app.get('/api/garmin/activities/<int:aid>/gpx')
def garmin_gpx(aid):
    g = get_client()
    if not g:
        return jsonify(error='Not signed in to Garmin.'), 401
    text = None
    try:
        raw = g.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL)
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            fits = [n for n in z.namelist() if n.lower().endswith('.fit')]
            if fits:
                try:
                    name = (g.get_activity(aid) or {}).get('activityName')
                except Exception:
                    name = None
                text = fit_to_gpx(z.read(fits[0]), name)
    except Exception:
        text = None
    if text is None:
        try:
            raw = g.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.GPX)
        except Exception as e:
            return jsonify(error='Download failed: ' + str(e)[:100]), 502
        text = raw.decode('utf-8', 'ignore') if isinstance(raw, bytes) else str(raw)
    if '<trkpt' not in text:
        return jsonify(error='This activity has no GPS track.'), 422
    return Response(text, mimetype='application/gpx+xml')


@app.post('/api/share')
def share_create():
    data = request.get_data()
    if request.headers.get('Content-Encoding') != 'gzip' or not data:
        return jsonify(error='Invalid upload.'), 415
    d = zlib.decompressobj(16 + zlib.MAX_WBITS)
    try:
        text = d.decompress(data, 30_000_000)
    except zlib.error:
        return jsonify(error='Not a valid GPX route.'), 422
    if not d.eof or d.unconsumed_tail or b'<trkpt' not in text:
        return jsonify(error='Not a valid GPX route.'), 422
    prune_shares()
    for _ in range(5):
        sid = ''.join(secrets.choice(SHARE_CHARS) for _ in range(8))
        path = os.path.join(SHARES, sid + '.gpx.gz')
        if not os.path.exists(path):
            with open(path, 'wb') as f:
                f.write(data)
            return jsonify(id=sid)
    return jsonify(error='Could not create a link, try again.'), 503


@app.get('/api/share/<sid>')
def share_get(sid):
    if not SHARE_ID_RE.match(sid):
        return jsonify(error='Link not found.'), 404
    for name in (sid + '.gpx.gz', sid + '.gpx'):
        path = os.path.join(SHARES, name)
        if os.path.exists(path):
            if time.time() - os.path.getmtime(path) > SHARE_TTL:
                return jsonify(error='Link not found or expired.'), 404
            with open(path, 'rb') as f:
                body = f.read()
            if name.endswith('.gz'):
                return Response(body, mimetype='application/gpx+xml', headers={'Content-Encoding': 'gzip'})
            return Response(body, mimetype='application/gpx+xml')
    return jsonify(error='Link not found or expired.'), 404


@app.post('/api/garmin/logout')
def garmin_logout():
    sid = request.cookies.get(COOKIE, '')
    if SID_RE.match(sid):
        shutil.rmtree(sess_dir(sid), ignore_errors=True)
    resp = make_response(jsonify(status='ok'))
    resp.delete_cookie(COOKIE, path='/api/garmin')
    return resp


WAHOO_ID = os.environ.get('WAHOO_CLIENT_ID', '')
WAHOO_SECRET = os.environ.get('WAHOO_CLIENT_SECRET', '')
WAHOO_REDIRECT = os.environ.get('WAHOO_REDIRECT_URI', 'https://gpx.linkinxp.com/api/wahoo/callback')
WAHOO_HOST = 'https://api.wahooligan.com'
WAHOO_DIR = '/var/lib/gpx-api/wahoo'
WAHOO_COOKIE = 'wahoosid'
WAHOO_CYCLING = {0}
WAHOO_STATES = {}


def wahoo_save(sid, tok):
    os.makedirs(WAHOO_DIR, mode=0o700, exist_ok=True)
    rec = {
        'access': tok['access_token'],
        'refresh': tok['refresh_token'],
        'expires_at': time.time() + int(tok.get('expires_in', 7200)),
    }
    with open(os.path.join(WAHOO_DIR, sid + '.json'), 'w') as f:
        json.dump(rec, f)
    return rec


def wahoo_token_request(data):
    data.update(client_id=WAHOO_ID, client_secret=WAHOO_SECRET, redirect_uri=WAHOO_REDIRECT)
    return requests.post(WAHOO_HOST + '/oauth/token', data=data, timeout=20)


def wahoo_access(sid):
    if not SID_RE.match(sid):
        return None
    p = os.path.join(WAHOO_DIR, sid + '.json')
    if not os.path.isfile(p):
        return None
    with open(p) as f:
        rec = json.load(f)
    if time.time() > rec['expires_at'] - 60:
        r = wahoo_token_request({'grant_type': 'refresh_token', 'refresh_token': rec['refresh']})
        if r.status_code != 200:
            os.remove(p)
            return None
        rec = wahoo_save(sid, r.json())
    return rec['access']


def wahoo_get(tok, path, **params):
    return requests.get(WAHOO_HOST + path, headers={'Authorization': 'Bearer ' + tok}, params=params, timeout=20)


def fit_to_gpx(data, name=None):
    import fitdecode

    semi = 180.0 / 2**31
    pts = []
    with fitdecode.FitReader(io.BytesIO(data)) as fit:
        for fr in fit:
            if not isinstance(fr, fitdecode.FitDataMessage) or fr.name != 'record':
                continue
            v = {f.name: f.value for f in fr.fields}
            lat, lon = v.get('position_lat'), v.get('position_long')
            if lat is None or lon is None:
                continue
            pts.append((lat * semi, lon * semi, v.get('enhanced_altitude', v.get('altitude')), v.get('timestamp'), v.get('heart_rate'), v.get('cadence'), v.get('power')))
    parts = []
    for lat, lon, ele, t, hr, cad, pwr in pts:
        ext = ''
        if hr is not None or cad is not None or pwr is not None:
            ext = (
                '<extensions>'
                + ('<gpxtpx:TrackPointExtension>'
                   + (f'<gpxtpx:hr>{int(hr)}</gpxtpx:hr>' if hr is not None else '')
                   + (f'<gpxtpx:cad>{int(cad)}</gpxtpx:cad>' if cad is not None else '')
                   + '</gpxtpx:TrackPointExtension>' if hr is not None or cad is not None else '')
                + (f'<power>{int(pwr)}</power>' if pwr is not None else '')
                + '</extensions>'
            )
        parts.append(
            f'<trkpt lat="{lat:.7f}" lon="{lon:.7f}">'
            + (f'<ele>{ele:.1f}</ele>' if ele is not None else '')
            + (f'<time>{t.strftime("%Y-%m-%dT%H:%M:%SZ")}</time>' if t else '')
            + ext
            + '</trkpt>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" creator="gpx.linkinxp.com" xmlns="http://www.topografix.com/GPX/1/1" '
        'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk>'
        + (f'<name>{escape(name)}</name>' if name else '') + '<trkseg>'
        + ''.join(parts)
        + '</trkseg></trk></gpx>'
    )


@app.get('/api/wahoo/status')
def wahoo_status():
    return jsonify(configured=bool(WAHOO_ID), logged_in=bool(wahoo_access(request.cookies.get(WAHOO_COOKIE, ''))))


@app.get('/api/wahoo/login')
def wahoo_login():
    if not WAHOO_ID:
        return jsonify(error='Wahoo is not configured on this server.'), 503
    sid = request.cookies.get(WAHOO_COOKIE, '')
    if not SID_RE.match(sid):
        sid = secrets.token_urlsafe(24)
    now = time.time()
    for k in [k for k, v in WAHOO_STATES.items() if v[1] < now]:
        del WAHOO_STATES[k]
    state = secrets.token_urlsafe(16)
    WAHOO_STATES[state] = (sid, now + 600)
    q = urllib.parse.urlencode({
        'client_id': WAHOO_ID,
        'redirect_uri': WAHOO_REDIRECT,
        'response_type': 'code',
        'scope': 'user_read workouts_read offline_data',
        'state': state,
    })
    resp = make_response(redirect(f'{WAHOO_HOST}/oauth/authorize?{q}'))
    secure = request.headers.get('X-Forwarded-Proto', '') == 'https'
    resp.set_cookie(WAHOO_COOKIE, sid, max_age=SESSION_TTL, httponly=True, secure=secure, samesite='Lax', path='/api')
    return resp


@app.get('/api/wahoo/callback')
def wahoo_callback():
    entry = WAHOO_STATES.pop(request.args.get('state', ''), None)
    if not entry or entry[1] < time.time() or 'code' not in request.args:
        return redirect('/?wahoo=failed')
    r = wahoo_token_request({'grant_type': 'authorization_code', 'code': request.args['code']})
    if r.status_code != 200:
        return redirect('/?wahoo=failed')
    wahoo_save(entry[0], r.json())
    return redirect('/?wahoo=connected')


@app.get('/api/wahoo/workouts')
def wahoo_workouts():
    tok = wahoo_access(request.cookies.get(WAHOO_COOKIE, ''))
    if not tok:
        return jsonify(error='Not connected to Wahoo.'), 401
    rng = request.args.get('range', '30')
    cutoff = None if rng == 'all' else (datetime.now() - timedelta(days=int(rng))).strftime('%Y-%m-%d')
    out, page = [], 1
    while page <= 10:
        r = wahoo_get(tok, '/v1/workouts', page=page, per_page=100, order_by='starts', order_dir='desc')
        if r.status_code != 200:
            return jsonify(error='Could not load Wahoo workouts.'), 502
        data = r.json()
        items = data.get('workouts', [])
        for w in items:
            if w.get('workout_type_id') not in WAHOO_CYCLING:
                continue
            if cutoff and (w.get('starts') or '')[:10] < cutoff:
                continue
            s = w.get('workout_summary') or {}
            out.append({
                'id': w.get('id'),
                'name': w.get('name') or 'Ride',
                'type': 'cycling',
                'start': w.get('starts'),
                'distance': s.get('distance_accum') or 0,
                'duration': s.get('duration_active_accum') or (w.get('minutes') or 0) * 60,
                'elevationGain': s.get('ascent_accum'),
                'avgSpeed': s.get('speed_avg'),
                'avgHr': s.get('heart_rate_avg'),
                'gps': bool(s.get('file')),
            })
        if not items or (cutoff and (items[-1].get('starts') or '')[:10] < cutoff) or page >= data.get('total_pages', 1):
            break
        page += 1
    return jsonify(activities=out)


@app.get('/api/wahoo/workouts/<int:wid>/gpx')
def wahoo_gpx(wid):
    tok = wahoo_access(request.cookies.get(WAHOO_COOKIE, ''))
    if not tok:
        return jsonify(error='Not connected to Wahoo.'), 401
    r = wahoo_get(tok, f'/v1/workouts/{wid}')
    if r.status_code != 200:
        return jsonify(error='Could not load this workout.'), 502
    url = ((r.json().get('workout_summary') or {}).get('file') or {}).get('url')
    if not url:
        return jsonify(error='This workout has no file yet.'), 422
    fr = requests.get(url, timeout=60)
    if fr.status_code != 200:
        return jsonify(error='Download failed.'), 502
    try:
        text = fit_to_gpx(fr.content)
    except Exception:
        return jsonify(error='Could not read this workout file.'), 422
    if '<trkpt' not in text:
        return jsonify(error='This workout has no GPS track.'), 422
    return Response(text, mimetype='application/gpx+xml')


@app.post('/api/wahoo/logout')
def wahoo_logout():
    sid = request.cookies.get(WAHOO_COOKIE, '')
    if SID_RE.match(sid):
        try:
            os.remove(os.path.join(WAHOO_DIR, sid + '.json'))
        except FileNotFoundError:
            pass
    resp = make_response(jsonify(status='ok'))
    resp.delete_cookie(WAHOO_COOKIE, path='/api')
    return resp
