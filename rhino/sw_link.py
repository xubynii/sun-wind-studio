#! python3
# -*- coding: utf-8 -*-
"""
Sun & Wind Link - a Rhino 7 / Rhino 8 panel that prepares a model for Sun & Wind Studio and keeps the tool in step with it.

1. Layers   Creates the layers the studies read (SW Tower and its parts, SW Shading, SW PV, SW Context, SW Terrain),
            or maps the layers you already have onto them. Moves selected objects onto a Sun & Wind layer.
2. Check    Scans what will be sent: units, closed volumes, floor plates, ground level, unmapped layers, size.
3. Link     Serves the model on http://127.0.0.1:<port> (and, when this file sits in the tool's rhino/ folder,
            the tool itself), so the browser re-imports on every change. Export JSON writes the same model to a file.

Run it with RunPythonScript (Rhino 7 and 8) or from the Rhino 8 Script Editor. Written for IronPython 2.7 and CPython 3.
Closing the panel stops the link.
"""
from __future__ import print_function, division

import os
import re
import json
import time
import threading
import webbrowser

try:
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from socketserver import ThreadingMixIn
except ImportError:  # IronPython 2.7 (Rhino 7)
    from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
    from SocketServer import ThreadingMixIn

import System
import System.Drawing
import Rhino
import Rhino.Geometry as rg
import Rhino.DocObjects as rd
import Rhino.DocObjects.Tables
import scriptcontext as sc
import Eto.Forms as forms
import Eto.Drawing as drawing

VERSION = '1.0'
STICKY = 'sun_wind_link'
DEFAULT_PORT = 8797
MAP_SECTION = 'sw.map'          # document strings: entry = layer id, value = target key
LAYER_KEY = 'sw.target'         # the same key as layer user text, so a saved .3dm carries the mapping
TOOL_URL = 'https://xubynii.github.io/sun-wind-studio/'
ALLOWED_ORIGINS = [             # sites allowed to read the model from this computer
    r'^https?://(127\.0\.0\.1|localhost)(:\d+)?$',
    r'^https://xubynii\.github\.io$',
    r'^https://claude\.ai$',
    r'^https://[a-z0-9.-]+\.claude\.ai$',
    r'^https://[a-z0-9.-]+\.claudeusercontent\.com$',
    r'^null$',                  # a copy opened from disk (file://)
]

# key, label, role, part, standard layer, colour (the tool's part colours)
TARGETS = [
    ('tower',     'Tower: sort parts by shape', 'massing', None,        'SW Tower',                  (169, 178, 188)),
    ('floor',     'Tower: floor plates',        'massing', 'floor',     'SW Tower::Floor plates',    (79, 124, 172)),
    ('ground',    'Tower: ground floor',        'massing', 'ground',    'SW Tower::Ground floor',    (140, 91, 144)),
    ('facade',    'Tower: facade',              'massing', 'facade',    'SW Tower::Facade',          (126, 138, 150)),
    ('window',    'Tower: windows',             'massing', 'window',    'SW Tower::Windows',         (95, 168, 211)),
    ('roof',      'Tower: roof',                'massing', 'roof',      'SW Tower::Roof',            (208, 106, 75)),
    ('ceiling',   'Tower: ceilings',            'massing', 'ceiling',   'SW Tower::Ceilings',        (217, 164, 65)),
    ('structure', 'Tower: structure',           'massing', 'structure', 'SW Tower::Structure',       (68, 81, 94)),
    ('core',      'Tower: core',                'massing', 'core',      'SW Tower::Core',            (176, 125, 79)),
    ('stair',     'Tower: stairs',              'massing', 'stair',     'SW Tower::Stairs',          (78, 154, 91)),
    ('mass',      'Tower: massing volume',      'massing', 'mass',      'SW Tower::Massing volume',  (150, 160, 172)),
    ('shading',   'Shading devices',            'shading', None,        'SW Shading',                (224, 138, 62)),
    ('pv',        'PV surfaces',                'pv',      None,        'SW PV',                     (46, 64, 112)),
    ('context',   'Site context',               'context', None,        'SW Context',                (196, 200, 204)),
    ('terrain',   'Terrain',                    'terrain', None,        'SW Terrain',                (150, 172, 128)),
    ('ignore',    'Ignore: never send',         'ignore',  None,        None,                        None),
]
T = dict((t[0], t) for t in TARGETS)
KEYS = [t[0] for t in TARGETS]
STD_PATHS = dict((t[4].lower(), t[0]) for t in TARGETS if t[4])

# name rules for Auto-map, checked on the layer's own name first, then on its full path
RULES = [
    (r'topo|terrain|\bdem\b|contour|grade|landform|ground surface', 'terrain'),
    (r'\bpv\b|photovolt|solar panel|bipv|collector', 'pv'),
    (r'shad|\bfins?\b|louv|brise|overhang|canop|screen|sunbreak|balcon|awning', 'shading'),
    (r'ground\s*floor|lobby|\bl0?1\b|level\s*0?1\b|\bgf\b', 'ground'),
    (r'site|context|exist|herit|plaza|road|curb|street|sidewalk|tree|future|surround|neighbo|ground', 'context'),
    (r'stair|step|tread|riser', 'stair'),
    (r'core|shaft|\blift|elev', 'core'),
    (r'column|beam|struct|brace|girder|truss|pier', 'structure'),
    (r'window|glass|glaz|\bpanes?\b|vision', 'window'),
    (r'ceil|soffit', 'ceiling'),
    (r'roof', 'roof'),
    (r'slab|floor|plate|deck|level', 'floor'),
    (r'fa.ade|curtain|cladd|wall|spandrel|mullion|panel|envelope|skin', 'facade'),
    (r'mass|volume|block|tower|building', 'tower'),
]

MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
        '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
        '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon'}


def say(msg):
    Rhino.RhinoApp.WriteLine('Sun & Wind Link: ' + msg)


def guess_key(name):
    for pat, key in RULES:
        if re.search(pat, name, re.I):
            return key
    return None


def this_dir():
    try:
        return os.path.dirname(os.path.abspath(__file__))
    except NameError:
        return None


def find_tool_dir():
    """The tool's folder: this file sits in <tool>/rhino/. Remembered once found."""
    cand = []
    remembered = sc.sticky.get(STICKY + '.tool')
    if remembered:
        cand.append(remembered)
    d = this_dir()
    if d:
        cand += [os.path.dirname(d), d]
    for c in cand:
        if c and os.path.isfile(os.path.join(c, 'index.html')) and os.path.isfile(os.path.join(c, 'link.js')):
            sc.sticky[STICKY + '.tool'] = c
            return c
    return None


# ----------------------------------------------------------------------------------------------- model

class Model(object):
    """Reads the active document: layer targets, meshes per object (cached), the payload and the check."""

    def __init__(self):
        self.cache = {}
        self.smooth = False

    @staticmethod
    def doc():
        return Rhino.RhinoDoc.ActiveDoc

    # --- layer targets
    def stored_key(self, layer):
        doc = self.doc()
        k = None
        try:
            k = doc.Strings.GetValue(MAP_SECTION, str(layer.Id))
        except Exception:
            k = None
        if not k:
            try:
                k = layer.GetUserString(LAYER_KEY)
            except Exception:
                k = None
        if not k:
            k = STD_PATHS.get(layer.FullPath.lower())
        return k if k in T else None

    def set_key(self, layer_index, key):
        doc = self.doc()
        layer = doc.Layers[layer_index]
        if key:
            doc.Strings.SetString(MAP_SECTION, str(layer.Id), key)
        else:
            try:
                doc.Strings.Delete(MAP_SECTION, str(layer.Id))
            except Exception:
                pass
        try:
            layer.SetUserString(LAYER_KEY, key or '')
            doc.Layers.Modify(layer, layer_index, True)
        except Exception:
            pass

    def layer_targets(self):
        """layer index -> (key or None, inherited?) for every layer."""
        doc = self.doc()
        own, by_id = {}, {}
        for L in doc.Layers:
            if L.IsDeleted:
                continue
            own[L.Index] = self.stored_key(L)
            by_id[str(L.Id)] = L
        out = {}
        for L in doc.Layers:
            if L.IsDeleted:
                continue
            k, inherited, cur, guard = own.get(L.Index), False, L, 0
            while k is None and guard < 12:
                guard += 1
                pid = str(cur.ParentLayerId)
                cur = by_id.get(pid)
                if cur is None:
                    break
                k = own.get(cur.Index)
                inherited = k is not None
            out[L.Index] = (k, inherited)
        return out

    @staticmethod
    def layer_visible(doc, index):
        L, guard = doc.Layers[index], 0
        while L is not None and guard < 12:
            guard += 1
            if not L.IsVisible:
                return False
            if L.ParentLayerId == System.Guid.Empty:
                return True
            i = doc.Layers.FindId(L.ParentLayerId)
            L = i if isinstance(i, rd.Layer) else None
        return True

    def objects(self):
        doc = self.doc()
        st = rd.ObjectEnumeratorSettings()
        st.NormalObjects = True
        st.LockedObjects = True
        st.HiddenObjects = False
        st.ReferenceObjects = True
        st.IncludeLights = False
        st.IncludeGrips = False
        st.IncludePhantoms = False
        vis = {}
        for o in doc.Objects.GetObjectList(st):
            li = o.Attributes.LayerIndex
            if li not in vis:
                vis[li] = self.layer_visible(doc, li)
            if vis[li]:
                yield o

    # --- meshing
    def mesh_params(self):
        return rg.MeshingParameters.QualityRenderMesh if self.smooth else rg.MeshingParameters.FastRenderMesh

    def mesh_geometry(self, g):
        """Meshes for one piece of geometry (new objects, safe to transform) and its kind, or ([], kind) if unsupported."""
        mp = self.mesh_params()
        if isinstance(g, rg.Mesh):
            return [g.DuplicateMesh()], 'mesh', g.IsClosed
        brep, kind = None, None
        if isinstance(g, rg.Extrusion):
            brep, kind = g.ToBrep(True), 'extrusion'
        elif isinstance(g, rg.Brep):
            brep, kind = g, 'polysurface'
        elif isinstance(g, rg.Surface):
            brep, kind = g.ToBrep(), 'surface'
        elif hasattr(rg, 'SubD') and isinstance(g, rg.SubD):
            m = None
            try:
                m = rg.Mesh.CreateFromSubD(g, 2)
            except Exception:
                m = None
            return ([m] if m else []), 'subd', bool(m and m.IsClosed)
        if brep is None:
            if isinstance(g, (rg.Curve, rg.Point, rg.PointCloud, rg.TextDot)) or 'Annotation' in g.GetType().Name or 'Hatch' in g.GetType().Name:
                return [], 'curve or annotation', False
            return [], g.GetType().Name, False
        ms = rg.Mesh.CreateFromBrep(brep, mp)
        return ([m for m in ms] if ms else []), kind, brep.IsSolid

    def object_meshes(self, obj):
        if isinstance(obj, rd.InstanceObject):
            out, closed = [], True
            stack = [(obj.InstanceDefinition, obj.InstanceXform, 0)]
            while stack:
                idef, xf, depth = stack.pop()
                if idef is None or depth > 8:
                    continue
                for sub in idef.GetObjects():
                    if isinstance(sub, rd.InstanceObject):
                        stack.append((sub.InstanceDefinition, xf * sub.InstanceXform, depth + 1))
                        continue
                    ms, kind, cl = self.mesh_geometry(sub.Geometry)
                    for m in ms:
                        m.Transform(xf)
                        out.append(m)
                    closed = closed and cl
            return out, 'block', closed and bool(out)
        return self.mesh_geometry(obj.Geometry)

    def entry(self, obj, scale):
        """Cached mesh text for one object: v and f strings, triangle count, closed, bounding box (metres)."""
        key = (str(obj.Id), obj.RuntimeSerialNumber, scale, self.smooth)
        hit = self.cache.get(key)
        if hit is not None:
            hit['_used'] = True
            return hit
        ms, kind, closed = self.object_meshes(obj)
        e = {'kind': kind, 'closed': closed, 'ok': False, '_used': True}
        if ms:
            m = rg.Mesh()
            for x in ms:
                if x is not None:
                    m.Append(x)
            m.Faces.ConvertQuadsToTriangles()
            try:
                m.Vertices.CombineIdentical(True, True)
            except Exception:
                pass
            m.Compact()
            if m.Faces.Count:
                pts = m.Vertices.ToPoint3dArray()
                vs = []
                z0, z1 = 1e18, -1e18
                x0, x1, y0, y1 = 1e18, -1e18, 1e18, -1e18
                for p in pts:
                    x, y, z = p.X * scale, p.Y * scale, p.Z * scale
                    vs.append('%.3f,%.3f,%.3f' % (x, y, z))
                    if z < z0: z0 = z
                    if z > z1: z1 = z
                    if x < x0: x0 = x
                    if x > x1: x1 = x
                    if y < y0: y0 = y
                    if y > y1: y1 = y
                f = m.Faces.ToIntArray(True)
                e.update({'ok': True, 'v': ','.join(vs), 'f': ','.join([str(i) for i in f]), 'tris': len(f) // 3,
                          'bb': (x0, y0, z0, x1, y1, z1)})
        self.cache[key] = e
        return e

    # --- what gets sent
    def collect(self):
        """Everything the link and the check need, in one pass."""
        doc = self.doc()
        scale = Rhino.RhinoMath.UnitScale(doc.ModelUnitSystem, Rhino.UnitSystem.Meters)
        targets = self.layer_targets()
        for v in self.cache.values():
            v['_used'] = False
        items, skipped, unmapped = [], [], {}
        for o in self.objects():
            li = o.Attributes.LayerIndex
            key = targets.get(li, (None, False))[0]
            path = doc.Layers[li].FullPath
            if key is None:
                unmapped.setdefault(path, []).append(o.Id)
                continue
            if key == 'ignore':
                continue
            e = self.entry(o, scale)
            if not e['ok']:
                skipped.append((o.Id, path, e['kind']))
                continue
            items.append({'id': o.Id, 'layer': path, 'key': key, 'e': e})
        for k in [k for k, v in self.cache.items() if not v.get('_used')]:
            del self.cache[k]
        return {'scale': scale, 'items': items, 'skipped': skipped, 'unmapped': unmapped,
                'units': str(doc.ModelUnitSystem), 'doc': doc.Name or 'Untitled'}

    def payload(self, c, rev):
        parts = []
        for it in c['items']:
            t = T[it['key']]
            parts.append('{"layer":%s,"role":"%s","part":%s,"kind":"%s","id":"%s","v":[%s],"f":[%s]}' % (
                json.dumps(it['layer']), t[2], json.dumps(t[3]), it['e']['kind'], str(it['id']), it['e']['v'], it['e']['f']))
        head = '{"swlink":"%s","rev":%d,"doc":%s,"units":"m","sourceUnits":%s,"scale":%r,"meshes":[' % (
            VERSION, rev, json.dumps(c['doc']), json.dumps(c['units']), c['scale'])
        return head + ',\n'.join(parts) + ']}'

    # --- the check
    def check(self, c):
        """[(level, text, [ids], fix or None)] - level is 'error', 'warn', 'info' or 'ok'."""
        out = []
        items = c['items']
        by = {}
        for it in items:
            by.setdefault(it['key'], []).append(it)
        tower = [it for it in items if T[it['key']][2] == 'massing']
        ids = lambda lst: [it['id'] for it in lst]

        if abs(c['scale'] - 1.0) > 1e-9:
            out.append(('info', 'Model units are %s; everything is sent in metres (x %g).' % (c['units'], c['scale']), [], None))
        if not tower:
            out.append(('error', 'Nothing is on the tower layers. Put the tower on SW Tower (or map your layers to a Tower target): every study needs a massing.', [], None))
        if (by.get('shading') or by.get('pv')) and not tower:
            out.append(('error', 'Shading and PV objects need a tower in the same model to attach to.', ids(by.get('shading', []) + by.get('pv', [])), None))
        if c['unmapped']:
            names = sorted(c['unmapped'].keys())
            n = sum(len(v) for v in c['unmapped'].values())
            allids = [i for k in names for i in c['unmapped'][k]]
            out.append(('warn', '%d visible object%s on %d unmapped layer%s %s not sent: %s%s. Map the layers or choose Ignore.' % (
                n, 's' if n != 1 else '', len(names), 's' if len(names) != 1 else '', 'are' if n != 1 else 'is',
                ', '.join(names[:5]), ' ...' if len(names) > 5 else ''), allids, None))
        if c['skipped']:
            kinds = {}
            for i, p, k in c['skipped']:
                kinds[k] = kinds.get(k, 0) + 1
            out.append(('info', 'Skipped on sent layers (only solids, surfaces, meshes, SubDs and blocks are sent): %s.' % (
                ', '.join('%d %s' % (v, k) for k, v in sorted(kinds.items()))), [s[0] for s in c['skipped']], None))

        if tower:
            bb = [it['e']['bb'] for it in tower]
            x0, y0, z0 = min(b[0] for b in bb), min(b[1] for b in bb), min(b[2] for b in bb)
            x1, y1, z1 = max(b[3] for b in bb), max(b[4] for b in bb), max(b[5] for b in bb)
            h, w = z1 - z0, max(x1 - x0, y1 - y0)
            if h > 900 or w > 400:
                out.append(('warn', 'The tower measures %.0f m tall and %.0f m across. Check the units: a model drawn in millimetres with the units set to metres comes in 1000 times too big.' % (h, w), ids(tower), None))
            elif h < 3:
                out.append(('warn', 'The tower is only %.2f m tall. Check the units (Options > Units).' % h, ids(tower), None))
            open_vol = [it for it in tower if it['key'] in ('tower', 'mass', 'core') and not it['e']['closed']]
            if open_vol:
                out.append(('warn', '%d tower volume%s not closed. The massing needs closed solids: Cap, Join or MeshRepair them, or move surfaces to Facade / Windows.' % (
                    len(open_vol), 's are' if len(open_vol) != 1 else ' is'), ids(open_vol), None))
            floors = by.get('floor', []) + by.get('ground', [])
            if floors:
                levels = []
                for z in sorted(it['e']['bb'][5] for it in floors):
                    if not levels or z - levels[-1] > 1.0:
                        levels.append(z)
                thick = [it for it in floors if it['e']['bb'][5] - it['e']['bb'][2] > 1.5]
                if len(levels) < 3:
                    out.append(('warn', 'Only %d floor-plate level%s. The tool needs three or more at storey spacing to read the storeys; otherwise it slices the mass at the floor-to-floor height you set.' % (
                        len(levels), '' if len(levels) == 1 else 's'), ids(floors), None))
                else:
                    gaps = [b - a for a, b in zip(levels, levels[1:])]
                    gaps.sort()
                    out.append(('ok', '%d floor levels, typical floor-to-floor %.2f m.' % (len(levels), gaps[len(gaps) // 2]), ids(floors), None))
                if thick:
                    out.append(('warn', '%d floor-plate object%s more than 1.5 m thick. Plates should be slabs, one per level.' % (
                        len(thick), 's are' if len(thick) != 1 else ' is'), ids(thick), None))
            else:
                out.append(('info', 'No floor plates. The tool slices the massing at the floor-to-floor height you set in Design development.', [], None))
            ground = by.get('ground', [])
            gz = max(it['e']['bb'][5] for it in ground) if ground else z0
            what = 'The ground floor' if ground else 'The tower base'
            if not by.get('terrain') and abs(gz) > 0.5:
                dz = gz / c['scale']
                out.append(('warn', '%s is at z = %.2f m. The tool reads model z = 0 as the ground; geometry below 0 becomes basement. Fix moves every sent object by %.2f m.' % (
                    what, gz, -gz), ids(ground or tower), lambda dz=dz: self.move_all(c, dz)))
            elif ground:
                out.append(('ok', 'Ground floor at z = %.2f m.' % gz, ids(ground), None))
            if math_hypot((x0 + x1) / 2, (y0 + y1) / 2) > 2000:
                out.append(('info', 'The tower is %.1f km from the origin. The tool moves it onto the parcel unless the model is in the Vancouver base model\'s coordinates.' % (
                    math_hypot((x0 + x1) / 2, (y0 + y1) / 2) / 1000.0), ids(tower), None))
            if not by.get('window') and (by.get('facade') or by.get('floor')):
                out.append(('info', 'No windows layer: the window-to-wall ratio is set in the tool instead of read from the model.', [], None))

        tris = sum(it['e']['tris'] for it in items)
        if tris > 1500000:
            out.append(('warn', '%s triangles. Live updates will be slow: switch to Fast meshes, simplify the context or turn off layers you do not need.' % format(tris, ','), [], None))
        if not any(o[0] in ('error', 'warn') for o in out) and tower:
            counts = ', '.join('%d %s' % (len(by[k]), T[k][1].split(': ')[-1].lower()) for k in KEYS if k in by)
            out.insert(0, ('ok', 'Ready: %s; %s triangles.' % (counts, format(tris, ',')), [], None))
        return out

    def move_all(self, c, dz):
        doc = self.doc()
        xf = rg.Transform.Translation(0, 0, -dz)
        sn = doc.BeginUndoRecord('Sun & Wind: ground to z = 0')
        n = 0
        try:
            for it in c['items']:
                if doc.Objects.Transform(it['id'], xf, True) != System.Guid.Empty:
                    n += 1
        finally:
            doc.EndUndoRecord(sn)
        doc.Views.Redraw()
        say('moved %d objects by %.3f (model units)' % (n, -dz))


def math_hypot(a, b):
    return (a * a + b * b) ** 0.5


# ----------------------------------------------------------------------------------------------- server

class _Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = False


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _origin_ok(self):
        o = self.headers.get('Origin')
        if not o:
            return None
        for pat in ALLOWED_ORIGINS + list(self.server.link.extra_origins):
            if re.match(pat, o):
                return o
        return False

    def _head(self, code, ctype, length):
        self.send_response(code)
        o = self._origin_ok()
        if o:
            self.send_header('Access-Control-Allow-Origin', o)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-store')
        if ctype:
            self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(length))
        self.end_headers()

    def do_OPTIONS(self):
        self._head(204, None, 0)

    def _send(self, code, ctype, body, raw=False):
        # raw: file bytes as read ('rb'). IronPython reads them as a str of byte values; encoding again would corrupt them.
        if not raw and not isinstance(body, bytes):
            body = body.encode('utf-8')
        self._head(code, ctype, len(body))
        self.wfile.write(body)

    def do_GET(self):
        try:
            link = self.server.link
            path = self.path.split('?')[0].split('#')[0]
            if path.startswith('/sw/') and self._origin_ok() is False:
                return self._send(403, 'text/plain', 'This site is not allowed to read the Rhino model. Add it under Allowed sites in Sun & Wind Link.')
            link.last_poll = time.time()
            if path == '/sw/rev':
                return self._send(200, 'application/json', json.dumps({'rev': link.rev, 'doc': link.doc_name, 'objects': link.count, 'version': VERSION}))
            if path == '/sw/model':
                return self._send(200, 'application/json', link.body or '{"swlink":"%s","rev":0,"meshes":[]}' % VERSION)
            tool = link.tool_dir
            if not tool:
                return self._send(404, 'text/plain', 'Sun & Wind Link is running; the tool folder was not found next to sw_link.py.')
            rel = path.lstrip('/') or 'index.html'
            full = os.path.normpath(os.path.join(tool, *rel.split('/')))
            if not full.startswith(os.path.normpath(tool) + os.sep) or not os.path.isfile(full):
                return self._send(404, 'text/plain', 'Not found')
            with open(full, 'rb') as fh:
                data = fh.read()
            self._send(200, MIME.get(os.path.splitext(full)[1].lower(), 'application/octet-stream'), data, raw=True)
        except Exception as ex:  # a closed browser tab, mostly
            try:
                self._send(500, 'text/plain', str(ex))
            except Exception:
                pass

    def handle_one_request(self):
        try:
            BaseHTTPRequestHandler.handle_one_request(self)
        except Exception:
            pass


# ----------------------------------------------------------------------------------------------- link

class Link(object):
    def __init__(self):
        self.model = Model()
        self.server = None
        self.thread = None
        self.port = DEFAULT_PORT
        self.rev = 0
        self.body = ''
        self.count = 0
        self.doc_name = ''
        self.dirty = True
        self.changed_at = 0.0
        self.layers_dirty = False
        self.last_poll = 0.0
        self.last_build = 0.0
        self.build_ms = 0
        self.mute = False
        self.tool_dir = find_tool_dir()
        self.extra_origins = []
        self.ui = None
        self.handlers = []

    # --- events
    def _changed(self, sender, e):
        self.dirty = True
        self.changed_at = time.time()

    def _layers(self, sender, e):
        self.dirty = True
        self.changed_at = time.time()
        if not self.mute:
            self.layers_dirty = True

    def _doc(self, sender, e):
        self.model.cache = {}
        self._layers(sender, e)

    def _idle(self, sender, e):
        try:
            if self.ui and self.layers_dirty and time.time() - self.changed_at > 0.4:
                self.layers_dirty = False
                self.ui.refresh_layers()
            if self.server and self.dirty and time.time() - self.changed_at > 0.5:
                self.build()
            if self.ui and self.server and time.time() - getattr(self, '_tick', 0) > 1.0:
                self._tick = time.time()
                self.ui.show_status()
        except Exception as ex:
            say('idle error: %s' % ex)

    def hook(self):
        if self.handlers:
            return
        D = Rhino.RhinoDoc
        pairs = [
            ('AddRhinoObject', rd.RhinoObjectEventArgs, self._changed),
            ('DeleteRhinoObject', rd.RhinoObjectEventArgs, self._changed),
            ('UndeleteRhinoObject', rd.RhinoObjectEventArgs, self._changed),
            ('ReplaceRhinoObject', rd.RhinoReplaceObjectEventArgs, self._changed),
            ('ModifyObjectAttributes', rd.RhinoModifyObjectAttributesEventArgs, self._changed),
            ('LayerTableEvent', rd.Tables.LayerTableEventArgs, self._layers),
            ('InstanceDefinitionTableEvent', rd.Tables.InstanceDefinitionTableEventArgs, self._changed),
            ('DocumentPropertiesChanged', Rhino.DocumentEventArgs, self._doc),
            ('EndOpenDocument', Rhino.DocumentOpenEventArgs, self._doc),
            ('NewDocument', Rhino.DocumentEventArgs, self._doc),
        ]
        for name, args, fn in pairs:
            try:
                h = System.EventHandler[args](fn)
                ev = getattr(D, name)
                ev += h
                self.handlers.append((name, h))
            except Exception as ex:
                say('could not watch %s (%s)' % (name, ex))
        try:
            self.idle_h = System.EventHandler(self._idle)
            Rhino.RhinoApp.Idle += self.idle_h
        except Exception as ex:
            say('could not hook idle (%s)' % ex)

    def unhook(self):
        D = Rhino.RhinoDoc
        for name, h in self.handlers:
            try:
                ev = getattr(D, name)
                ev -= h
            except Exception:
                pass
        self.handlers = []
        try:
            Rhino.RhinoApp.Idle -= self.idle_h
        except Exception:
            pass

    # --- payload
    def build(self):
        t0 = time.time()
        c = self.model.collect()
        new_body = self.model.payload(c, 0)
        if new_body != getattr(self, '_last_plain', None):
            self._last_plain = new_body
            self.rev += 1
            self.body = self.model.payload(c, self.rev)
        self.count = len(c['items'])
        self.doc_name = c['doc']
        self.dirty = False
        self.last_build = time.time()
        self.build_ms = int((time.time() - t0) * 1000)
        return c

    # --- server
    def start(self, port):
        if self.server:
            return True
        try:
            srv = _Server(('127.0.0.1', int(port)), _Handler)
        except Exception as ex:
            say('port %s is busy or blocked (%s). Pick another port.' % (port, ex))
            return False
        srv.link = self
        self.port = int(port)
        self.server = srv
        self.build()
        self.thread = threading.Thread(target=srv.serve_forever, kwargs={'poll_interval': 0.3})
        self.thread.daemon = True
        self.thread.start()
        say('serving on http://127.0.0.1:%d (rev %d, %d objects, %d ms)' % (self.port, self.rev, self.count, self.build_ms))
        return True

    def stop(self):
        srv, self.server = self.server, None
        if srv:
            try:
                srv.shutdown()
                srv.server_close()
            except Exception:
                pass
            say('link stopped')

    def tool_url(self):
        if self.server and self.tool_dir:
            return 'http://127.0.0.1:%d/?link' % self.port
        return TOOL_URL + '?link=%d' % self.port


# ----------------------------------------------------------------------------------------------- panel

def label(text, bold=False, muted=False, wrap=False):
    l = forms.Label()
    l.Text = text
    if bold:
        try:
            l.Font = drawing.Fonts.Sans(l.Font.Size, drawing.FontStyle.Bold, drawing.FontDecoration.none if hasattr(drawing.FontDecoration, 'none') else getattr(drawing.FontDecoration, 'None'))
        except Exception:
            pass
    if muted:
        l.TextColor = drawing.Colors.Gray
    if wrap:
        l.Wrap = forms.WrapMode.Word
    return l


def button(text, fn):
    b = forms.Button()
    b.Text = text
    b.Click += (lambda s, e: guarded(fn))
    return b


def guarded(fn):
    try:
        fn()
    except Exception as ex:
        say('error: %s' % ex)
        import traceback
        traceback.print_exc()


class Panel(object):
    def __init__(self, link):
        self.link = link
        self.issues = []
        f = forms.Form()
        f.Title = 'Sun & Wind Link'
        f.ClientSize = drawing.Size(470, 760)
        f.Resizable = True
        f.Minimizable = True
        try:
            f.Owner = Rhino.UI.RhinoEtoApp.MainWindow
        except Exception:
            pass
        self.form = f

        self.status = label('Link off.', wrap=True)
        self.layer_box = forms.Scrollable()
        self.layer_box.Height = 250
        self.move_dd = forms.DropDown()
        for t in TARGETS[:-1]:
            self.move_dd.Items.Add(t[1])
        self.move_dd.SelectedIndex = 0
        self.issue_list = forms.ListBox()
        self.issue_list.Height = 170
        self.issue_list.MouseDoubleClick += (lambda s, e: guarded(self.select_issue))
        self.port = forms.NumericStepper()
        self.port.MinValue = 1024
        self.port.MaxValue = 65535
        self.port.DecimalPlaces = 0
        self.port.Value = link.port
        self.go = button('Start link', self.toggle)
        self.quality = forms.DropDown()
        self.quality.Items.Add('Fast meshes')
        self.quality.Items.Add('Smooth meshes (curved facades)')
        self.quality.SelectedIndex = 1 if link.model.smooth else 0
        self.quality.SelectedIndexChanged += (lambda s, e: guarded(self.set_quality))

        lay = forms.DynamicLayout()
        lay.Padding = drawing.Padding(12)
        lay.Spacing = drawing.Size(6, 6)
        lay.Add(self.status)
        lay.Add(label('1  Layers', bold=True))
        lay.Add(label('Each layer sends its objects as one target. Sublayers follow their parent unless set. Unmapped layers are not sent.', muted=True, wrap=True))
        lay.AddSeparateRow(button('Create SW layers', self.create_layers), button('Auto-map by name', self.auto_map), button('Refresh', self.refresh_layers))
        lay.Add(self.layer_box)
        lay.AddSeparateRow(label('Selected objects to'), self.move_dd, button('Move', self.move_selected))
        lay.Add(label('2  Check', bold=True))
        lay.AddSeparateRow(button('Check model', self.run_check), button('Select objects', self.select_issue), button('Fix', self.fix_issue))
        lay.Add(self.issue_list)
        lay.Add(label('3  Live link', bold=True))
        lay.AddSeparateRow(label('Port'), self.port, self.go, button('Open the tool', self.open_tool))
        lay.AddSeparateRow(self.quality, button('Export JSON...', self.export))
        lay.Add(label('Only this computer can connect, and only from the tool\'s own sites. Closing this panel stops the link.', muted=True, wrap=True))
        f.Content = lay
        f.Closed += (lambda s, e: guarded(self.closed))
        self.refresh_layers()

    # --- layers
    def refresh_layers(self):
        doc = self.link.model.doc()
        targets = self.link.model.layer_targets()
        counts = {}
        for o in self.link.model.objects():
            li = o.Attributes.LayerIndex
            counts[li] = counts.get(li, 0) + 1
        rows = []
        for L in doc.Layers:
            if L.IsDeleted:
                continue
            key, inh = targets.get(L.Index, (None, False))
            own = self.link.model.stored_key(L)
            if counts.get(L.Index) or own or L.FullPath.lower() in STD_PATHS:
                rows.append((L, own, key if inh else None))
        rows.sort(key=lambda r: r[0].FullPath.lower())
        inner = forms.DynamicLayout()
        inner.Spacing = drawing.Size(6, 3)
        if not rows:
            inner.Add(label('No objects yet. Create the SW layers or draw on your own layers, then Refresh.', muted=True, wrap=True))
        for L, own, parent_key in rows:
            dd = forms.DropDown()
            dd.Items.Add('As parent: ' + T[parent_key][1] if parent_key else 'Not sent')
            for t in TARGETS:
                dd.Items.Add(t[1])
            dd.SelectedIndex = (KEYS.index(own) + 1) if own else 0
            dd.SelectedIndexChanged += self._on_map(L.Index)
            name = label(L.FullPath)
            name.ToolTip = L.FullPath
            inner.AddRow(name, label(str(counts.get(L.Index, 0)), muted=True), dd)
        self.layer_box.Content = inner

    def _on_map(self, index):
        def fn(sender, e):
            def go():
                i = sender.SelectedIndex
                key = KEYS[i - 1] if i > 0 else None
                self.link.mute = True
                try:
                    self.link.model.set_key(index, key)
                finally:
                    self.link.mute = False
                self.link.dirty = True
                self.link.changed_at = time.time()
                self.link.layers_dirty = True  # sublayer labels show the new parent target
            guarded(go)
        return fn

    def ensure_layer(self, key):
        doc = self.link.model.doc()
        t = T[key]
        path = t[4]
        idx = doc.Layers.FindByFullPath(path, -1)
        if idx >= 0:
            return idx
        parent = None
        if '::' in path:
            parent = self.ensure_layer('tower')
        L = rd.Layer()
        L.Name = path.split('::')[-1]
        L.Color = System.Drawing.Color.FromArgb(t[5][0], t[5][1], t[5][2])
        if parent is not None:
            L.ParentLayerId = doc.Layers[parent].Id
        idx = doc.Layers.Add(L)
        self.link.mute = True
        try:
            self.link.model.set_key(idx, key)
        finally:
            self.link.mute = False
        return idx

    def create_layers(self):
        doc = self.link.model.doc()
        before = doc.Layers.Count
        for t in TARGETS:
            if t[4]:
                self.ensure_layer(t[0])
        self.refresh_layers()
        say('%d Sun & Wind layers added' % (doc.Layers.Count - before))

    def auto_map(self):
        doc = self.link.model.doc()
        targets = self.link.model.layer_targets()
        n, left = 0, []
        used = set(o.Attributes.LayerIndex for o in self.link.model.objects())
        for L in doc.Layers:
            if L.IsDeleted or L.Index not in used or targets.get(L.Index, (None, False))[0]:
                continue
            k = guess_key(L.Name) or guess_key(L.FullPath)
            if k:
                self.link.mute = True
                try:
                    self.link.model.set_key(L.Index, k)
                finally:
                    self.link.mute = False
                n += 1
            else:
                left.append(L.FullPath)
        self.link.dirty = True
        self.refresh_layers()
        msg = 'Auto-map set %d layer%s.' % (n, '' if n == 1 else 's')
        if left:
            msg += ' Still unmapped: %s%s.' % (', '.join(left[:4]), ' ...' if len(left) > 4 else '')
        self.status.Text = msg
        say(msg)

    def move_selected(self):
        doc = self.link.model.doc()
        key = KEYS[self.move_dd.SelectedIndex]
        sel = list(doc.Objects.GetSelectedObjects(False, False))
        if not sel:
            self.status.Text = 'Select objects in Rhino first, then Move.'
            return
        idx = self.ensure_layer(key)
        sn = doc.BeginUndoRecord('Sun & Wind: move to layer')
        try:
            for o in sel:
                a = o.Attributes.Duplicate()
                a.LayerIndex = idx
                doc.Objects.ModifyAttributes(o, a, True)
        finally:
            doc.EndUndoRecord(sn)
        doc.Views.Redraw()
        self.refresh_layers()
        self.status.Text = 'Moved %d object%s to %s.' % (len(sel), '' if len(sel) == 1 else 's', T[key][4])

    # --- check
    def run_check(self):
        c = self.link.build() if self.link.server else self.link.model.collect()
        self.issues = self.link.model.check(c)
        self.issue_list.Items.Clear()
        mark = {'error': 'X ', 'warn': '! ', 'info': 'i ', 'ok': 'OK '}
        for lv, text, ids, fix in self.issues:
            self.issue_list.Items.Add(mark[lv] + text + (' [Fix]' if fix else ''))
        errs = sum(1 for i in self.issues if i[0] == 'error')
        warns = sum(1 for i in self.issues if i[0] == 'warn')
        self.status.Text = ('Check: %d error%s, %d warning%s. Double-click a line to select its objects.' % (
            errs, '' if errs == 1 else 's', warns, '' if warns == 1 else 's')) if (errs or warns) else 'Check: ready to send.'

    def _issue(self):
        i = self.issue_list.SelectedIndex
        return self.issues[i] if 0 <= i < len(self.issues) else None

    def select_issue(self):
        it = self._issue()
        if not it or not it[2]:
            return
        doc = self.link.model.doc()
        doc.Objects.UnselectAll()
        n = 0
        for i in it[2]:
            if doc.Objects.Select(i, True):
                n += 1
        doc.Views.Redraw()
        self.status.Text = '%d object%s selected.' % (n, '' if n == 1 else 's')

    def fix_issue(self):
        it = self._issue()
        if not it or not it[3]:
            self.status.Text = 'Pick a line marked [Fix] first.'
            return
        it[3]()
        self.run_check()

    # --- link
    def toggle(self):
        if self.link.server:
            self.link.stop()
        else:
            self.link.start(int(self.port.Value))
        self.show_status()

    def show_status(self):
        L = self.link
        self.go.Text = 'Stop link' if L.server else 'Start link'
        self.port.Enabled = not L.server
        if not L.server:
            self.status.Text = 'Link off. Start it, then Open the tool (or press Connect in the tool\'s Live link to Rhino).'
            return
        seen = time.time() - L.last_poll < 3
        self.status.Text = 'Link on: http://127.0.0.1:%d  |  rev %d, %d objects (%d ms)  |  %s' % (
            L.port, L.rev, L.count, L.build_ms, 'tool connected' if seen else 'waiting for the tool')

    def open_tool(self):
        if not self.link.server:
            self.link.start(int(self.port.Value))
            self.show_status()
        url = self.link.tool_url()
        if not self.link.tool_dir:
            say('tool folder not found next to this script; opening %s' % url)
        try:
            webbrowser.open(url)
        except Exception:
            psi = System.Diagnostics.ProcessStartInfo(url)
            psi.UseShellExecute = True
            System.Diagnostics.Process.Start(psi)

    def set_quality(self):
        self.link.model.smooth = self.quality.SelectedIndex == 1
        self.link.dirty = True
        self.link.changed_at = time.time()

    def export(self):
        dlg = forms.SaveFileDialog()
        dlg.Title = 'Export for Sun & Wind Studio'
        dlg.Filters.Add(forms.FileFilter('Sun & Wind model (*.json)', '.json'))
        doc = self.link.model.doc()
        try:
            dlg.FileName = os.path.splitext(doc.Name or 'model')[0] + '-sunwind.json'
        except Exception:
            pass
        if dlg.ShowDialog(self.form) != forms.DialogResult.Ok:
            return
        c = self.link.model.collect()
        body = self.link.model.payload(c, 0)
        path = dlg.FileName if dlg.FileName.lower().endswith('.json') else dlg.FileName + '.json'
        with open(path, 'wb') as fh:
            fh.write(body.encode('utf-8'))
        self.status.Text = 'Exported %d objects to %s. Choose it with Choose a .3dm file in the tool.' % (len(c['items']), path)

    def closed(self):
        self.link.stop()
        self.link.unhook()
        self.link.ui = None
        sc.sticky.pop(STICKY, None)


def main():
    old = sc.sticky.get(STICKY)
    if old is not None and old.ui is not None:
        try:
            old.ui.form.Show()
            old.ui.form.BringToFront()
            return
        except Exception:
            pass
    link = Link()
    link.hook()
    link.ui = Panel(link)
    sc.sticky[STICKY] = link
    link.ui.form.Show()
    say('panel open (v%s). Tool folder: %s' % (VERSION, link.tool_dir or 'not found, Open the tool uses ' + TOOL_URL))


if __name__ == '__main__':
    main()
