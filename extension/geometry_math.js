/* Shared geometry. Metres; Z up; THREE.Euler XYZ convention (CVAT 2.76). */
(function (root) {
    'use strict';

    // Subtype dimension profiles for vehicles according to autonomous driving labeling specifications
    const VEHICLE_SUBTYPES = {
        car: { minL: 2.8, maxL: 5.8, minW: 1.4, maxW: 2.3, minH: 1.1, maxH: 2.2 },
        truck: { minL: 5.0, maxL: 14.0, minW: 1.9, maxW: 3.0, minH: 2.0, maxH: 4.2 },
        bus: { minL: 6.5, maxL: 15.0, minW: 2.2, maxW: 3.2, minH: 2.6, maxH: 4.2 },
        van: { minL: 4.2, maxL: 6.5, minW: 1.7, maxW: 2.4, minH: 1.8, maxH: 2.8 },
        pickup: { minL: 4.5, maxL: 6.5, minW: 1.7, maxW: 2.3, minH: 1.6, maxH: 2.4 },
        contruction: { minL: 3.5, maxL: 12.0, minW: 2.0, maxW: 3.5, minH: 1.8, maxH: 4.5 },
        construction: { minL: 3.5, maxL: 12.0, minW: 2.0, maxW: 3.5, minH: 1.8, maxH: 4.5 },
        Trailer: { minL: 4.0, maxL: 16.0, minW: 1.9, maxW: 3.0, minH: 1.5, maxH: 4.5 },
        trailer: { minL: 4.0, maxL: 16.0, minW: 1.9, maxW: 3.0, minH: 1.5, maxH: 4.5 },
        Tricycle: { minL: 1.8, maxL: 3.8, minW: 0.9, maxW: 1.8, minH: 1.1, maxH: 2.2 },
        tricycle: { minL: 1.8, maxL: 3.8, minW: 0.9, maxW: 1.8, minH: 1.1, maxH: 2.2 },
        Stroller: { minL: 0.6, maxL: 1.4, minW: 0.4, maxW: 0.9, minH: 0.7, maxH: 1.4 },
        stroller: { minL: 0.6, maxL: 1.4, minW: 0.4, maxW: 0.9, minH: 0.7, maxH: 1.4 },
        Wheelchair: { minL: 0.7, maxL: 1.6, minW: 0.5, maxW: 1.1, minH: 0.7, maxH: 1.5 },
        wheelchair: { minL: 0.7, maxL: 1.6, minW: 0.5, maxW: 1.1, minH: 0.7, maxH: 1.5 },
        other: { minL: 1.5, maxL: 15.0, minW: 0.8, maxW: 3.5, minH: 0.8, maxH: 4.5 },
    };

    const BASE_DIMENSION_SPECS = {
        vehicles: { minL: 2.8, maxL: 5.8, minW: 1.4, maxW: 2.3, minH: 1.1, maxH: 2.2 },
        'two-wheels': { minL: 1.4, maxL: 2.6, minW: 0.5, maxW: 1.3, minH: 0.9, maxH: 1.9 },
        pedestrian: { minL: 0.3, maxL: 1.0, minW: 0.3, maxW: 1.0, minH: 1.3, maxH: 2.1 },
        Animal: { minL: 0.4, maxL: 2.5, minW: 0.3, maxW: 1.2, minH: 0.3, maxH: 1.8 },
        Obstacle: { minL: 0.2, maxL: 5.0, minW: 0.2, maxW: 5.0, minH: 0.2, maxH: 5.0 },
    };

    const DIMENSION_SPECS = {
        ...BASE_DIMENSION_SPECS,
        ...Object.fromEntries(Object.entries(VEHICLE_SUBTYPES).map(([k, v]) => [`vehicles:${k}`, v])),
    };

    function resolveDimensionSpec(classLabel, subType = null, profiles = DIMENSION_SPECS) {
        if (!classLabel) return null;
        const cleanLabel = String(classLabel).trim();
        const lowerLabel = cleanLabel.toLowerCase();

        // 1. Vehicles with subtype
        if (['vehicles', 'vehicle', 'car', 'cars'].includes(lowerLabel)) {
            if (subType) {
                const subKey = `vehicles:${subType}`;
                if (Object.hasOwn(profiles, subKey)) return { ...profiles[subKey], resolvedKey: subKey, subType };
                const cleanSub = String(subType).toLowerCase();
                for (const [k, v] of Object.entries(VEHICLE_SUBTYPES)) {
                    if (k.toLowerCase() === cleanSub) {
                        return { ...v, resolvedKey: `vehicles:${k}`, subType: k };
                    }
                }
            }
            return { ...(profiles.vehicles || BASE_DIMENSION_SPECS.vehicles), resolvedKey: 'vehicles', subType: subType || 'car' };
        }

        // 2. Direct key match (e.g. 'vehicles:bus' or 'two-wheels')
        if (Object.hasOwn(profiles, cleanLabel)) return { ...profiles[cleanLabel], resolvedKey: cleanLabel, subType };

        // 3. Fallback matching
        if (['two-wheels', 'two_wheels', 'bicycle', 'motorcycle', 'cyclist'].includes(lowerLabel)) {
            return { ...profiles['two-wheels'], resolvedKey: 'two-wheels', subType };
        }
        if (['pedestrian', 'person'].includes(lowerLabel)) {
            return { ...profiles.pedestrian, resolvedKey: 'pedestrian', subType };
        }
        if (['animal'].includes(lowerLabel)) {
            return { ...profiles.Animal, resolvedKey: 'Animal', subType };
        }
        if (['obstacle'].includes(lowerLabel)) {
            return { ...profiles.Obstacle, resolvedKey: 'Obstacle', subType };
        }

        return null;
    }

    const idOf = box => box.clientId ?? box.clientID ?? box.id;

    function cuboidVertices(p) {
        const [cx, cy, cz, rx, ry, rz, l, w, h] = p;
        const ax = Math.cos(rx), bx = Math.sin(rx), ay = Math.cos(ry), by = Math.sin(ry), az = Math.cos(rz), bz = Math.sin(rz);
        const vertices = [];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const x = sx * l / 2, y = sy * w / 2, z = sz * h / 2;
            const zx = az * x - bz * y, zy = bz * x + az * y;
            const yx = ay * zx + by * z, yz = -by * zx + ay * z;
            vertices.push([cx + yx, cy + ax * zy - bx * yz, cz + bx * zy + ax * yz]);
        }
        return vertices;
    }

    function parseCVAT16Points(points) {
        if (!points || points.length < 9 || !Array.from(points).every(Number.isFinite) || points.slice(6, 9).some(n => n <= 0)) return null;
        const p = Array.from(points), vertices = cuboidVertices(p);
        return {
            center: p.slice(0, 3), rotation: p.slice(3, 6), dimensions: p.slice(6, 9), length: p[6], width: p[7], height: p[8],
            zBottom: Math.min(...vertices.map(v => v[2])), yawDeg: p[5] * 180 / Math.PI, volume: p[6] * p[7] * p[8], vertices
        };
    }

    function rotateYawPoints(points, degrees) {
        if (!parseCVAT16Points(points) || !Number.isFinite(degrees)) throw new Error('Invalid box coordinates or rotation angle');
        const p = Array.from(points), angle = p[5] + degrees * Math.PI / 180;
        p[5] = Math.atan2(Math.sin(angle), Math.cos(angle)); return p;
    }

    function makePlane(a, b, c, extra = {}) {
        return {
            a, b, c, getTargetZ: (x, y) => a * x + b * y + c,
            desc: `z = ${a.toFixed(4)}x ${b < 0 ? '-' : '+'} ${Math.abs(b).toFixed(4)}y ${c < 0 ? '-' : '+'} ${Math.abs(c).toFixed(3)}m`, ...extra
        };
    }

    function fitPlane(points) {
        if (points.length < 3) return null;
        const mean = points.reduce((m, p) => m.map((v, i) => v + p[i] / points.length), [0, 0, 0]);
        let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0;
        for (const p of points) {
            const x = p[0] - mean[0], y = p[1] - mean[1], z = p[2] - mean[2];
            xx += x * x; xy += x * y; yy += y * y; xz += x * z; yz += y * z;
        }
        const det = xx * yy - xy * xy;
        if (Math.abs(det) < 1e-10) return null;
        const a = (xz * yy - yz * xy) / det, b = (yz * xx - xz * xy) / det;
        return makePlane(a, b, mean[2] - a * mean[0] - b * mean[1]);
    }

    // Legacy cuboid reference, never used as LiDAR ground by the new tool.
    function estimateRoadPlane(shapes) {
        const points = shapes.map(s => parseCVAT16Points(s.points)).filter(Boolean).map(g => [...g.center.slice(0, 2), g.zBottom]);
        points.sort((a, b) => a[2] - b[2]);
        return fitPlane(points.slice(Math.floor(points.length * 0.15), Math.ceil(points.length * 0.85))) || makePlane(0, 0, points[0]?.[2] || 0, { source: 'cuboid-reference', confidence: 0 });
    }

    function snapGroundPoints(points, plane) {
        const geom = parseCVAT16Points(points);
        if (!geom || !plane || typeof plane.getTargetZ !== 'function') throw new Error('No valid ground plane available');
        const clearances = geom.vertices.map(([x, y, z]) => z - plane.getTargetZ(x, y));
        if (!clearances.every(Number.isFinite)) throw new Error('Invalid ground plane');
        const deltaZ = -Math.min(...clearances), newPoints = Array.from(points); newPoints[2] += deltaZ;
        return {
            newPoints, oldCz: points[2], newCz: newPoints[2], deltaZ, targetGroundZ: plane.getTargetZ(points[0], points[1]),
            clearanceSpread: Math.max(...clearances) - Math.min(...clearances)
        };
    }

    function footprint(points) {
        const c = Math.cos(points[5]), s = Math.sin(points[5]);
        return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
            x *= points[6] / 2; y *= points[7] / 2; return [points[0] + c * x - s * y, points[1] + s * x + c * y];
        });
    }

    const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

    function polygonIntersection(subject, clip) {
        let output = subject;
        for (let i = 0; i < clip.length && output.length; i++) {
            const a = clip[i], b = clip[(i + 1) % clip.length], input = output; output = [];
            for (let j = 0; j < input.length; j++) {
                const p = input[j], q = input[(j + 1) % input.length], cp = cross(a, b, p), cq = cross(a, b, q);
                const pin = cp >= -1e-10, qin = cq >= -1e-10;
                if (pin) output.push(p);
                if (pin !== qin) { const t = cp / (cp - cq); output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
            }
        }
        return output;
    }

    function polygonArea(polygon) {
        return Math.abs(polygon.reduce((area, p, i) => { const q = polygon[(i + 1) % polygon.length]; return area + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2;
    }

    function orientedIoU(a, b) {
        const ga = parseCVAT16Points(a), gb = parseCVAT16Points(b);
        if (!ga || !gb || [...a.slice(3, 5), ...b.slice(3, 5)].some(r => Math.abs(r) > 1e-4)) return null;
        const height = Math.min(a[2] + a[8] / 2, b[2] + b[8] / 2) - Math.max(a[2] - a[8] / 2, b[2] - b[8] / 2);
        if (height <= 0) return 0;
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > (Math.hypot(a[6], a[7]) + Math.hypot(b[6], b[7])) / 2) return 0;
        const intersection = polygonArea(polygonIntersection(footprint(a), footprint(b))) * height;
        return Math.max(0, Math.min(1, intersection / (ga.volume + gb.volume - intersection)));
    }

    function auditCuboid(box, allBoxes = [], ground = null, profiles = DIMENSION_SPECS) {
        const geom = parseCVAT16Points(box.points), issues = [];
        const add = (severity, code, message, measured, expected) => issues.push({ severity, code, message, measured, expected });
        if (!geom) { add('CRITICAL', 'INVALID_POINTS', 'Non-finite coordinates or non-positive dimensions'); return { geom, issues }; }
        const label = box.label_name || box.labelName;
        const subType = box.subType || box.attributes?.type;
        const spec = resolveDimensionSpec(label, subType, profiles);
        const typeLabel = subType ? `${label} (${subType})` : (label || 'unknown');
        if (!spec) add('INFO', 'NO_CLASS_RULE', `No standard dimension rule configured for ${typeLabel}`);
        if (spec) {
            for (const [name, short, value] of [['LENGTH', 'L', geom.length], ['WIDTH', 'W', geom.width], ['HEIGHT', 'H', geom.height]]) {
                const lo = spec['min' + short], hi = spec['max' + short];
                if (value < lo) add('WARNING', 'UNDERSIZED_' + name, `${short} ${value.toFixed(2)}m < ${lo}m (${typeLabel})`, value, lo);
                if (value > hi) add('WARNING', 'OVERSIZED_' + name, `${short} ${value.toFixed(2)}m > ${hi}m (${typeLabel})`, value, hi);
            }
            if (geom.length < geom.width && ['vehicles', 'two-wheels'].includes(label))
                add('WARNING', 'AXIS_SWAPPED', 'Length is smaller than width: check heading/axes', geom.length / geom.width, 'L ≥ W');
        }
        let groundZ = null, deltaZ = null;
        if (ground && ground.accepted !== false && (ground.confidence == null || ground.confidence >= 0.65)) {
            groundZ = ground.getTargetZ(geom.center[0], geom.center[1]);
            deltaZ = Math.min(...geom.vertices.map(([x, y, z]) => z - ground.getTargetZ(x, y)));
            const tolerance = Math.max(0.15, (ground.rmse || 0) * 3);
            if (deltaZ < -tolerance) add('CRITICAL', 'SUBMERGED_GROUND', `Bottom submerged ${(-deltaZ * 100).toFixed(0)}cm below ground`, deltaZ, -tolerance);
            if (deltaZ > tolerance) add('WARNING', 'FLOATING_GROUND', `Bottom floating ${(deltaZ * 100).toFixed(0)}cm above ground`, deltaZ, tolerance);
        }
        if (geom.rotation.slice(0, 2).some(r => Math.abs(r) > 1e-4))
            add('INFO', 'OVERLAP_UNSUPPORTED_TILT', 'Overlap check unsupported for boxes with pitch/roll');
        for (const other of allBoxes) {
            if (idOf(other) === idOf(box)) continue;
            const iou = orientedIoU(box.points, other.points);
            if (iou !== null && iou > 0.15)
                add(iou > 0.5 ? 'CRITICAL' : 'WARNING', 'DUPLICATE_COLLISION', `Collision with Box #${idOf(other)}: IoU ${(iou * 100).toFixed(1)}%`, iou, 0.15);
        }
        return { geom, issues, groundZ, deltaZ };
    }

    function auditFrame(boxes, groundById = {}, profiles = DIMENSION_SPECS) {
        const issues = [];
        for (const box of boxes) {
            const id = idOf(box), result = auditCuboid(box, [], groundById[id], profiles);
            result.issues.forEach(issue => issues.push({ ...issue, id: `${id}:${issue.code}`, boxId: id, boxIds: [id], label: box.label_name || box.labelName }));
        }
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const iou = orientedIoU(boxes[i].points, boxes[j].points);
            if (iou !== null && iou > 0.15) {
                const a = idOf(boxes[i]), b = idOf(boxes[j]);
                issues.push({
                    id: `${Math.min(a, b)}:${Math.max(a, b)}:OVERLAP`, boxId: a, boxIds: [a, b], code: 'DUPLICATE_COLLISION',
                    severity: iou > 0.5 ? 'CRITICAL' : 'WARNING', label: boxes[i].label_name || boxes[i].labelName,
                    measured: iou, expected: 0.15, message: `Box #${a} overlaps #${b}: IoU ${(iou * 100).toFixed(1)}%`
                });
            }
        }
        return issues;
    }

    function estimateLocalGround(points, box, radius = 8) {
        const geom = parseCVAT16Points(box.points);
        const reject = reason => ({ accepted: false, confidence: 0, reason, source: 'point-cloud' });
        if (!geom) return reject('Invalid box coordinates');
        const [x, y] = geom.center, c = Math.cos(box.points[5]), s = Math.sin(box.points[5]), patches = new Map();
        for (const p of points) {
            const dx = p[0] - x, dy = p[1] - y;
            if (Math.hypot(dx, dy) > radius || (Math.abs(c * dx + s * dy) <= geom.length / 2 + 0.35 && Math.abs(-s * dx + c * dy) <= geom.width / 2 + 0.35)) continue;
            const key = `${Math.floor(p[0] / 0.6)},${Math.floor(p[1] / 0.6)}`;
            if (!patches.has(key)) patches.set(key, []); patches.get(key).push(p);
        }
        // One low representative per XY patch: dense vehicle surfaces do not
        // outvote sparse road returns simply because they contain more points.
        const candidates = [...patches.values()].map(a => { a.sort((a, b) => a[2] - b[2]); return a[Math.floor((a.length - 1) * 0.1)]; });
        if (candidates.length < 30) return reject('Insufficient ground patch candidates around box');
        let seed = 1103, best = [];
        const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < 400; i++) {
            const plane = fitPlane(Array.from({ length: 3 }, () => candidates[Math.floor(random() * candidates.length)]));
            if (!plane || Math.hypot(plane.a, plane.b) > 0.25) continue;
            const inliers = candidates.filter(p => Math.abs(p[2] - plane.getTargetZ(p[0], p[1])) < 0.055);
            if (inliers.length > best.length) best = inliers;
        }
        const plane = fitPlane(best);
        if (!plane || best.length < 24 || best.length / candidates.length < 0.35 || Math.hypot(plane.a, plane.b) > 0.25)
            return reject('Cannot segment stable ground plane');
        if (new Set(best.map(p => `${p[0] >= x},${p[1] >= y}`)).size < 3)
            return reject('Ground points distributed on one side only');
        const rmse = Math.sqrt(best.reduce((v, p) => v + (p[2] - plane.getTargetZ(p[0], p[1])) ** 2, 0) / best.length);
        if (rmse > 0.04) return reject('Ground plane fit RMSE too high (> 4cm)');
        const confidence = Math.min(0.99, 0.7 * best.length / candidates.length + 0.3 * Math.min(1, best.length / 150));
        return {
            ...plane, accepted: true, confidence, rmse, inlierCount: best.length, candidateCount: candidates.length, radius,
            source: 'point-cloud', method: 'spatial-lower-envelope-ransac', reason: 'Ground from lowest spatial grid cells, density-balanced'
        };
    }

    class GroundIndex {
        constructor(points, cellSize = 2) {
            this.cells = new Map(); this.cellSize = cellSize; this.count = 0;
            for (const p of points) {
                if (p.length < 3 || !p.slice(0, 3).every(Number.isFinite)) continue;
                const key = this.key(p[0], p[1]); if (!this.cells.has(key)) this.cells.set(key, []);
                const cell = this.cells.get(key); if (cell.length < 350) { cell.push(p); this.count++; }
            }
        }
        key(x, y) { return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`; }
        query(x, y, radius) {
            const points = [];
            for (let ix = Math.floor((x - radius) / this.cellSize); ix <= Math.floor((x + radius) / this.cellSize); ix++)
                for (let iy = Math.floor((y - radius) / this.cellSize); iy <= Math.floor((y + radius) / this.cellSize); iy++)
                    for (const p of this.cells.get(`${ix},${iy}`) || []) if (Math.hypot(p[0] - x, p[1] - y) <= radius) points.push(p);
            return points;
        }
        estimate(box, options = {}) {
            const g = parseCVAT16Points(box.points);
            if (!g) return { accepted: false, confidence: 0, reason: 'Invalid box coordinates' };
            const radius = Math.min(15, Math.max(8, Math.hypot(g.length, g.width) / 2 + 3));
            return estimateLocalGround(this.query(g.center[0], g.center[1], radius), box, radius);
        }
    }

    function extractBoxROI(points, currentBox, margin = 0.4) {
        const p = currentBox.points || currentBox, g = parseCVAT16Points(p);
        if (!g) throw new Error('Invalid box coordinates');
        const [rx, ry, rz] = g.rotation, c = Math.cos, s = Math.sin;
        return points.filter(point => {
            if (!point?.slice(0, 3).every(Number.isFinite)) return false;
            const x = point[0] - p[0], y = point[1] - p[1], z = point[2] - p[2];
            const a = c(rz) * x + s(rz) * y, b = -s(rz) * x + c(rz) * y;
            const u = c(ry) * a - s(ry) * z, v = s(ry) * a + c(ry) * z;
            return Math.abs(u) <= p[6] / 2 + margin && Math.abs(c(rx) * b + s(rx) * v) <= p[7] / 2 + margin && Math.abs(-s(rx) * b + c(rx) * v) <= p[8] / 2 + margin;
        });
    }

    function canManuallySnapGround(ground) {
        if (!ground || ground.accepted === false || ![ground.a, ground.b, ground.c].every(Number.isFinite) || Math.hypot(ground.a, ground.b) > 0.25) return false;
        return ground.confidence == null || ground.confidence >= 0.65 ||
            (ground.confidence >= 0.45 && ground.rmse <= 0.04 && ground.inlierCount >= 60);
    }

    function seededClusters(points, currentBox, ground, distance = 0.55) {
        // A plausible plane may remove road returns without authorizing a ground snap.
        // Low support confidence is distinct from a bad plane fit.
        ground = canManuallySnapGround(ground) ? ground : null;
        const p = currentBox.points, bottom = p[2] - p[8] / 2;
        const candidates = points.filter(q => q.slice(0, 3).every(Number.isFinite) && q[2] > (ground ? ground.a * q[0] + ground.b * q[1] + ground.c : bottom) + 0.08);
        // Cluster 3D occupancy cells: XY projection can connect different heights.
        // Duplicate roof returns must not multiply neighborhood work.
        const voxel = 0.12, bins = new Map(), key = q => `${Math.floor(q[0] / voxel)},${Math.floor(q[1] / voxel)},${Math.floor(q[2] / voxel)}`;
        for (const q of candidates) { const k = key(q); if (!bins.has(k)) bins.set(k, { point: q, points: [] }); bins.get(k).points.push(q); }
        const entries = [...bins.values()], representatives = entries.map(e => e.point);
        const cells = new Map(), cellKey = q => `${Math.floor(q[0] / distance)},${Math.floor(q[1] / distance)},${Math.floor(q[2] / distance)}`;
        representatives.forEach((q, i) => { const k = cellKey(q); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); });
        const neighbors = i => {
            const q = representatives[i], v = [Math.floor(q[0] / distance), Math.floor(q[1] / distance), Math.floor(q[2] / distance)], out = [];
            for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++)
                for (const j of cells.get(`${v[0] + x},${v[1] + y},${v[2] + z}`) || [])
                    if ((q[0] - representatives[j][0]) ** 2 + (q[1] - representatives[j][1]) ** 2 + (q[2] - representatives[j][2]) ** 2 <= distance * distance) out.push(j);
            return out;
        };
        const seen = new Set(), seedSet = new Set(extractBoxROI(candidates, currentBox, 0.4)), clusters = [];
        for (let i = 0; i < representatives.length; i++) {
            if (seen.has(i)) continue; seen.add(i); const near = neighbors(i); if (near.length < 4) continue;
            const members = new Set([i, ...near]), queue = [...near];
            for (let cursor = 0; cursor < queue.length; cursor++) {
                const j = queue[cursor]; if (seen.has(j)) continue; seen.add(j); const next = neighbors(j);
                if (next.length >= 4) for (const n of next) if (!members.has(n)) { members.add(n); queue.push(n); }
            }
            const cluster = [...members].flatMap(j => entries[j].points), overlap = cluster.filter(q => seedSet.has(q)).length;
            if (overlap) clusters.push({ cluster, overlap });
        }
        clusters.sort((a, b) => b.overlap - a.overlap || b.cluster.length - a.cluster.length);
        return clusters;
    }

    function selectSeedCluster(points, currentBox, ground, distance = 0.55) {
        return seededClusters(points, currentBox, ground, distance)[0]?.cluster || [];
    }

    // Local cleanup of five faces. Ground fixes the bottom; heading is immutable.
    // Unlike Auto-Fit, this does not impose class dimensions or search for a heading.
    function autoAdjustOptions(options = {}) {
        const {maxShrinkDistance = .1,maxShrinkPercent = 5}=options;
        if(!Number.isFinite(maxShrinkDistance)||maxShrinkDistance<0||maxShrinkDistance>.4||!Number.isFinite(maxShrinkPercent)||maxShrinkPercent<0||maxShrinkPercent>50)throw new Error('Shrink limits must be 0–40 cm and 0–50%');
        return {maxShrinkDistance,maxShrinkPercent};
    }
    function autoAdjustBox(points, currentBox, ground, neighborBoxes = [], options = {}) {
        const {maxShrinkDistance,maxShrinkPercent}=autoAdjustOptions(options);
        const original=Array.from(currentBox.points||currentBox);
        if(!parseCVAT16Points(original))throw new Error('Invalid box coordinates');
        if(Math.abs(original[3])>1e-6||Math.abs(original[4])>1e-6)throw new Error('Auto Adjust supports upright boxes only');
        if(!canManuallySnapGround(ground)||(ground.confidence!=null&&ground.confidence<.65))throw new Error('Reliable ground required for Auto Adjust; box unchanged');
        const plane=makePlane(ground.a,ground.b,ground.c),snap=snapGroundPoints(original,plane);
        if(Math.abs(snap.deltaZ)>1.5)throw new Error('Ground adjustment exceeds 1.5m; box unchanged');
        const base=snap.newPoints,c=Math.cos(base[5]),s=Math.sin(base[5]),owned=new Set();
        const roi=extractBoxROI(points,{points:base},.4);
        const rmse=Number.isFinite(ground.rmse)?Math.max(0,ground.rmse):0;
        const groundClearance=Math.max(.2,3*rmse);
        // Remove the entire near-ground band before clustering. Otherwise road
        // returns can bridge into the object and supply false face evidence.
        // Use each point's local plane height so slopes are handled correctly.
        const local=roi.filter(p=>p[2]-plane.getTargetZ(p[0],p[1])>groundClearance+1e-6);
        const excludedNearGroundPoints=roi.length-local.length;
        for(const box of neighborBoxes)if(parseCVAT16Points(box.points))for(const p of extractBoxROI(local,box,.02))owned.add(p);
        const clusters=seededClusters(local.filter(p=>!owned.has(p)),{points:base},ground,.45).map(({cluster})=>{
            const interior=extractBoxROI(cluster,{points:base},0),cells=new Set(interior.map(p=>p.map(v=>Math.floor(v/.08)).join(',')));
            return {cluster,inside:cells.size};
        }).filter(item=>item.inside>=10&&item.cluster.length>=20).sort((a,b)=>b.inside-a.inside);
        if(!clusters.length)throw new Error(`Insufficient object points above the ${(groundClearance*100).toFixed(0)}cm ground exclusion band; box unchanged`);
        if(clusters[1]&&clusters[1].inside>=clusters[0].inside*.8)throw new Error('Ambiguous object clusters inside this box; Auto Adjust left it unchanged');
        const cluster=clusters[0].cluster,cells=new Map();
        for(const p of cluster){const key=p.map(v=>Math.floor(v/.08)).join(',');if(!cells.has(key))cells.set(key,[c*(p[0]-base[0])+s*(p[1]-base[1]),-s*(p[0]-base[0])+c*(p[1]-base[1]),p[2]]);}
        const support=[...cells.values()];
        if(support.length<12)throw new Error('Too few occupied object cells; box unchanged');
        const extent=(band,axis)=>{let lo=Infinity,hi=-Infinity;for(const p of band){lo=Math.min(lo,p[axis]);hi=Math.max(hi,p[axis]);}return hi-lo;};
        let rejectedBoundaryCandidates=0;
        function supportedPatch(band,other){
            // A few returns or a one-dimensional noise streak are not a surface.
            // Work in occupied cells, so duplicated returns cannot buy confidence.
            const grid=new Map(),radius=.24,key=p=>p.map(v=>Math.floor(v/radius));
            for(const p of band){const k=key(p).join(',');if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p);}
            const seen=new Set();
            for(const seed of band){
                if(seen.has(seed))continue;
                const patch=[seed];seen.add(seed);
                for(let i=0;i<patch.length;i++){
                    const p=patch[i],[x,y,z]=key(p);
                    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const q of grid.get(`${x+dx},${y+dy},${z+dz}`)||[]){
                        if(!seen.has(q)&&Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2])<=radius+1e-8){seen.add(q);patch.push(q);}
                    }
                }
                if(patch.length>=6&&other.every(a=>extent(patch,a)>=Math.min(.15,base[6+a]*.15)-1e-8)&&other.some(a=>extent(patch,a)>=Math.min(.25,base[6+a]*.25)-1e-8))return patch;
            }
            return null;
        }
        function edge(axis,sign){
            const sorted=support.slice().sort((a,b)=>sign*(a[axis]-b[axis]));
            for(let i=0;i<sorted.length;i++){
                if(i&&sorted[i][axis]===sorted[i-1][axis])continue;
                let j=i;while(j<sorted.length&&sign*(sorted[j][axis]-sorted[i][axis])<=.06+1e-8)j++;
                if(j-i<6){rejectedBoundaryCandidates++;continue;}
                const band=sorted.slice(i,j),other=[0,1,2].filter(a=>a!==axis);
                const patch=supportedPatch(band,other);
                if(patch){
                    const values=patch.map(p=>p[axis]).sort((a,b)=>a-b);
                    // A local surface estimate, not the extreme of a mixed band.
                    const value=values[Math.floor(values.length/2)],uncertainOutside=support.filter(p=>sign*(p[axis]-value)<-.03-1e-8).length>=3;
                    return {value,band:patch,uncertainOutside};
                }
                rejectedBoundaryCandidates++;
            }
            return null;
        }
        const old=[-base[6]/2,base[6]/2,-base[7]/2,base[7]/2,base[2]+base[8]/2],next=old.slice();
        const names=['rear','front','right','left','top'],limitedFaces=[],retainedFaces=[];
        for(let face=0;face<5;face++){
            const axis=face<2?0:face<4?1:2,sign=face<4&&face%2===0?1:-1,e=edge(axis,sign);
            if(!e){retainedFaces.push(names[face]);continue;}
            const desired=e.value-sign*.03,shrinking=sign*(desired-old[face])>0;
            // Weak outlying returns cannot justify expansion, but may be a real
            // thin part. Do not shrink through a group of such uncertain returns.
            if(shrinking&&e.uncertainOutside){retainedFaces.push(names[face]);continue;}
            // Never walk a face across an occluded region, even on repeated
            // presses: distant evidence means preserve, not clamp-and-shrink.
            const shrinkLimit=Math.min(maxShrinkDistance,base[6+axis]*maxShrinkPercent/100);
            if(shrinking&&sign*(e.value-old[face])>shrinkLimit+1e-8){retainedFaces.push(names[face]);continue;}
            // Empty space alone is not evidence of a hidden surface. Side
            // shrinking needs vertical surface support; top needs an XY patch.
            if(shrinking&&(axis<2?extent(e.band,2)<Math.min(.25,base[8]*.2):extent(e.band,0)<Math.min(.25,base[6]*.2)||extent(e.band,1)<Math.min(.2,base[7]*.2))){retainedFaces.push(names[face]);continue;}
            const delta=desired-old[face];if(!shrinking&&Math.abs(delta)>.4+1e-8)limitedFaces.push(names[face]);
            if(Math.abs(delta)>.01)next[face]=old[face]+Math.max(-.4,Math.min(.4,delta));
        }
        const dx=(next[0]+next[1])/2,dy=(next[2]+next[3])/2,result=original.slice();
        result[0]=base[0]+c*dx-s*dy;result[1]=base[1]+s*dx+c*dy;
        result[6]=next[1]-next[0];result[7]=next[3]-next[2];
        const bottom=Math.max(...[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>plane.getTargetZ(result[0]+c*x*result[6]/2-s*y*result[7]/2,result[1]+s*x*result[6]/2+c*y*result[7]/2)));
        result[8]=next[4]-bottom;result[2]=bottom+result[8]/2;
        if(result.slice(6,9).some(v=>v<.1)||!parseCVAT16Points(result))throw new Error('Object extent is too small or ground intersects the top; box unchanged');
        if(result[8]<base[8]-Math.min(maxShrinkDistance,base[8]*maxShrinkPercent/100)-1e-8)throw new Error('Grounded height would shrink beyond the local limit; box unchanged');
        return {points:result,changed:result.some((v,i)=>Math.abs(v-original[i])>1e-6),pointCount:cluster.length,
            faceChanges:Object.fromEntries(names.map((name,i)=>[name,next[i]-old[i]])),limitedFaces,retainedFaces,groundClearance,excludedNearGroundPoints,rejectedBoundaryCandidates};
    }

    // Mouse placement is a position correction, not a dimension or heading fit.
    // Rank separate clusters by proximity to the pointer rather than point count.
    function refineCenterNearPointer(points, currentBox, ground, neighborBoxes = [], options = {}) {
        const original=Array.from(currentBox.points||currentBox);
        const fallback=reason=>({refined:false,points:original.slice(),reason,pointCount:0});
        if(!parseCVAT16Points(original))throw new Error('Invalid box coordinates');
        if(Math.abs(original[3])>1e-6||Math.abs(original[4])>1e-6)return fallback('Center refinement supports upright boxes only');
        const owned=new Set();
        for(const box of neighborBoxes){
            if(parseCVAT16Points(box.points))for(const p of extractBoxROI(points,box,.02))owned.add(p);
        }
        const available=points.filter(p=>!owned.has(p));
        const c=Math.cos(original[5]),s=Math.sin(original[5]),candidates=[];
        for(const {cluster} of seededClusters(available,{points:original},ground,.45)){
            if(cluster.length<20)continue;
            // Use occupied cells for bounds so repeated near-surface returns do
            // not pull the center toward the denser visible side of an object.
            const cells=new Map();
            for(const p of cluster){const key=p.map(v=>Math.floor(v/.12)).join(',');if(!cells.has(key))cells.set(key,p);}
            if(cells.size<10)continue;
            const xs=[],ys=[];
            for(const p of cells.values()){const dx=p[0]-original[0],dy=p[1]-original[1];xs.push(c*dx+s*dy);ys.push(-s*dx+c*dy);}
            const bounds=a=>{a.sort((a,b)=>a-b);return [a[Math.floor((a.length-1)*.01)],a[Math.ceil((a.length-1)*.99)]];};
            const [x0,x1]=bounds(xs),[y0,y1]=bounds(ys),dx=(x0+x1)/2,dy=(y0+y1)/2;
            const heading=options.adjustDirection?estimateFootprintHeading(cluster,{points:original}):null;
            let spanX=x1-x0,spanY=y1-y0;
            if(Number.isFinite(heading?.objectAxis)){
                // A rotated narrow object can look oversized in the old heading.
                // Check object size in its measured axes even if rotation is refused.
                const yaw=heading.objectAxis-(original[7]>original[6]?Math.PI/2:0),cx=Math.cos(yaw),sy=Math.sin(yaw),u=[],v=[];
                for(const p of cells.values()){const x=p[0]-original[0],y=p[1]-original[1];u.push(cx*x+sy*y);v.push(-sy*x+cx*y);}
                const [u0,u1]=bounds(u),[v0,v1]=bounds(v);spanX=u1-u0;spanY=v1-v0;
            }
            if(spanX>original[6]*1.5||spanY>original[7]*1.5||spanX<Math.max(.08,original[6]*.1)||spanY<Math.max(.08,original[7]*.1))continue;
            if(Math.abs(dx)>original[6]/2+.4||Math.abs(dy)>original[7]/2+.4)continue;
            const edgeDistance=Math.hypot(Math.max(x0,-x1,0),Math.max(y0,-y1,0));
            candidates.push({dx,dy,edgeDistance,centerDistance:Math.hypot(dx,dy),pointCount:cluster.length,heading,support:[...cells.values()]});
        }
        if(!candidates.length)return fallback('No reliable nearby object cluster');
        candidates.sort((a,b)=>a.edgeDistance-b.edgeDistance||a.centerDistance-b.centerDistance);
        const best=candidates[0],second=candidates[1];
        if(second&&Math.abs(second.edgeDistance-best.edgeDistance)<.15&&Math.abs(second.centerDistance-best.centerDistance)<.25)
            return fallback('Nearby object clusters are ambiguous; point closer to the intended object');
        const result=original.slice();result[0]+=c*best.dx-s*best.dy;result[1]+=s*best.dx+c*best.dy;
        let directionAdjusted=false,directionDeltaDegrees=0,directionWarning=null;
        if(options.adjustDirection){
            const heading=best.heading;
            if(heading.accepted){
                result[5]=heading.yaw;directionAdjusted=true;directionDeltaDegrees=heading.deltaDegrees;
                // Recenter in the final heading, without changing the dimensions.
                const cs=Math.cos(result[5]),sn=Math.sin(result[5]),xs=[],ys=[];
                for(const p of best.support){const x=p[0]-original[0],y=p[1]-original[1];xs.push(cs*x+sn*y);ys.push(-sn*x+cs*y);}
                const midpoint=a=>{a.sort((a,b)=>a-b);return (a[Math.floor((a.length-1)*.01)]+a[Math.ceil((a.length-1)*.99)])/2;};
                const dx=midpoint(xs),dy=midpoint(ys);result[0]=original[0]+cs*dx-sn*dy;result[1]=original[1]+sn*dx+cs*dy;
            }else directionWarning=heading.reason;
        }
        const alignment={longitudinal:'none',lateral:'none'},alignmentWarnings=[];
        const cs=Math.cos(result[5]),sn=Math.sin(result[5]),xs=[],ys=[];
        for(const p of best.support){const x=p[0]-result[0],y=p[1]-result[1];xs.push(cs*x+sn*y);ys.push(-sn*x+cs*y);}
        const bounds=a=>{a.sort((a,b)=>a-b);return [a[Math.floor((a.length-1)*.01)],a[Math.ceil((a.length-1)*.99)]];};
        let dx=0,dy=0;
        for(const [axis,choice,values,size] of [['longitudinal',options.moveLongitudinal,xs,result[6]],['lateral',options.moveLateral,ys,result[7]]]){
            if(!choice||choice==='none')continue;
            const [lo,hi]=bounds(values);
            if(hi-lo>size+1e-6){alignmentWarnings.push(`${axis} alignment skipped: object span exceeds box size`);continue;}
            const shift=(choice==='forward'||choice==='left')?lo+size/2:hi-size/2;
            if(axis==='longitudinal')dx=shift;else dy=shift;
            alignment[axis]=choice;
        }
        result[0]+=cs*dx-sn*dy;result[1]+=sn*dx+cs*dy;
        return {alignment,alignmentWarning:alignmentWarnings.join(' · ')||null,refined:true,points:result,pointCount:best.pointCount,shift:Math.hypot(result[0]-original[0],result[1]-original[1]),reason:null,
            directionAdjusted,directionDeltaDegrees,directionWarning};
    }

    function estimateFootprintHeading(points, currentBox) {
        const original=currentBox.points||currentBox;
        const reject=reason=>({accepted:false,yaw:original[5],deltaDegrees:0,reason});
        if(!parseCVAT16Points(original))throw new Error('Invalid box coordinates');
        if(Math.abs(original[3])>1e-6||Math.abs(original[4])>1e-6)return reject('Direction unchanged: tilted box');
        if(Math.max(original[6],original[7])/Math.min(original[6],original[7])<1.1)return reject('Direction unchanged: box footprint has no clear longest axis');
        const axisDifference=(a,b)=>.5*Math.atan2(Math.sin(2*(a-b)),Math.cos(2*(a-b)));
        const measure=cellSize=>{
            // Equal XY occupancy weights: roof/rider height and duplicate
            // near-surface returns must not dominate the top-view long axis.
            const cells=new Map();
            for(const p of points){if(!p?.slice(0,3).every(Number.isFinite))continue;const key=`${Math.floor((p[0]-original[0])/cellSize)},${Math.floor((p[1]-original[1])/cellSize)}`;if(!cells.has(key))cells.set(key,p);}
            const support=[...cells.values()];if(support.length<20)return null;
            const mx=support.reduce((sum,p)=>sum+p[0],0)/support.length,my=support.reduce((sum,p)=>sum+p[1],0)/support.length;
            let xx=0,yy=0,xy=0;for(const p of support){const x=p[0]-mx,y=p[1]-my;xx+=x*x;yy+=y*y;xy+=x*y;}
            const spread=xx+yy,contrast=Math.hypot(xx-yy,2*xy);
            if(spread/support.length<.01||contrast/spread<.3)return null;
            return {yaw:.5*Math.atan2(2*xy,xx-yy),anisotropy:contrast/spread,supportCount:support.length};
        };
        const fine=measure(.08),coarse=measure(.12);
        if(!fine||!coarse)return reject('Direction unchanged: sparse or nearly symmetric object footprint');
        if(Math.abs(axisDifference(fine.yaw,coarse.yaw))>10*Math.PI/180)return reject('Direction unchanged: unstable object axis');
        // Width may be the box's longest dimension. Keep L/W assignments and
        // forward/backward facing; only apply the nearest axial correction.
        const longAxis=original[5]+(original[7]>original[6]?Math.PI/2:0);
        const delta=axisDifference(fine.yaw,longAxis),deltaDegrees=delta*180/Math.PI;
        if(Math.abs(deltaDegrees)>30+1e-8)return {...reject('Direction unchanged: object axis requires more than 30° correction'),objectAxis:fine.yaw};
        const yaw=Math.abs(delta)<1e-10?original[5]:Math.atan2(Math.sin(original[5]+delta),Math.cos(original[5]+delta));
        return {accepted:true,yaw,deltaDegrees,reason:null,objectAxis:fine.yaw,anisotropy:fine.anisotropy,supportCount:fine.supportCount};
    }

    // Starting presets, not certified labeling standards. Users can override per key.
    const FIT_PRESETS = {
        'vehicles:car':[4.5,1.8,1.5], 'vehicles:truck':[8,2.5,3.2], 'vehicles:bus':[10,2.6,3.2],
        'vehicles:van':[5,2,2.2], 'vehicles:pickup':[5.3,1.9,1.8], 'vehicles:construction':[6,2.5,3],
        'vehicles:trailer':[10,2.5,3], 'vehicles:tricycle':[2.5,1.2,1.6],
        'vehicles:stroller':[1,.6,1], 'vehicles:wheelchair':[1.1,.7,1.2],
        'two-wheels':[2,.7,1.6], pedestrian:[.6,.6,1.7], Animal:[1.2,.6,.8], Obstacle:[1,1,1],
    };
    function validFitPreset(value) {
        return Array.isArray(value)&&value.length===3&&value.every((v,i)=>Number.isFinite(v)&&v>=.1&&v<=[30,8,8][i]);
    }
    function resolveFitPreset(label,subType=null,overrides={}) {
        const spec=resolveDimensionSpec(label,subType);
        if(!spec)return null;
        let key=spec.resolvedKey;
        if(key==='vehicles')key=`vehicles:${String(subType||'car').trim().toLowerCase()}`;
        key=key.replace(/contruction$/i,'construction');
        if(key.toLowerCase().startsWith('vehicles:'))key=key.toLowerCase();
        const value=overrides[key]??FIT_PRESETS[key];
        return {key,dimensions:validFitPreset(value)?value.slice():null,custom:Object.hasOwn(overrides,key)};
    }
    function fitPresetBox(points,classLabel,currentBox,neighborBoxes=[],presetOverride=null) {
        const original=Array.from(currentBox.points||currentBox),ground=currentBox.ground;
        if(!parseCVAT16Points(original))throw new Error('Invalid box coordinates');
        if(Math.abs(original[3])>1e-6||Math.abs(original[4])>1e-6)throw new Error('Auto-Fit supports upright boxes only');
        if(!canManuallySnapGround(ground)||ground.confidence<.65)throw new Error('Reliable ground required for preset Auto-Fit; box unchanged');
        const preset=resolveFitPreset(classLabel,currentBox.subType||currentBox.attributes?.type);
        const dimensions=presetOverride??preset?.dimensions;
        if(!preset||!validFitPreset(dimensions))throw new Error('Configure valid L/W/H preset for this class/subtype first');
        const seed=original.slice();seed.splice(6,3,...dimensions);
        // Grounded preset-size seed also recovers an initially floating/tiny box.
        seed[2]=ground.a*seed[0]+ground.b*seed[1]+ground.c+seed[8]/2;
        const owned=new Set(),seedEvidence=new Set(extractBoxROI(points,{points:original},.05));
        for(const box of neighborBoxes)if(parseCVAT16Points(box.points))for(const p of extractBoxROI(points,box,-.1))if(!seedEvidence.has(p))owned.add(p);
        const available=points.filter(p=>!owned.has(p));
        const angleDiff=(a,b)=>.5*Math.atan2(Math.sin(2*(a-b)),Math.cos(2*(a-b)));
        const bounds=a=>{a.sort((x,y)=>x-y);return [a[Math.floor((a.length-1)*.01)],a[Math.ceil((a.length-1)*.99)]];};
        const attempts=[];let lastError=null,previous=null;
        for(const radius of [.45,.3,.25,.2]){
            try{
                const candidates=seededClusters(available,{points:seed},ground,radius);
                if(!candidates.length)throw new Error('Không đủ điểm LiDAR để Auto-Fit (cần ít nhất 10 điểm)');
                const rank=candidates.map(item=>({...item,cells:new Set(extractBoxROI(item.cluster,{points:seed},.4).map(p=>p.map(v=>Math.floor(v/.12)).join(','))).size})).filter(item=>item.cells>=10).sort((a,b)=>b.cells-a.cells);
                if(!rank.length)throw new Error('Không đủ điểm LiDAR để Auto-Fit (cần ít nhất 10 điểm)');
                const xyCenter=item=>{
                    const x=bounds(item.cluster.map(p=>p[0])),y=bounds(item.cluster.map(p=>p[1]));
                    return [(x[0]+x[1])/2,(y[0]+y[1])/2];
                };
                // Disconnected roof/lower returns at the same XY footprint are
                // not a second vehicle. Ambiguity requires a different XY center.
                if(rank[1]&&rank[1].cells>=rank[0].cells*.8&&Math.hypot(...xyCenter(rank[1]).map((v,i)=>v-xyCenter(rank[0])[i]))>.25)
                    throw new Error('Ambiguous nearby objects; move the preliminary box closer to the intended object');
                const cluster=rank[0].cluster,cells=new Map();
                for(const p of cluster){const k=p.map(v=>Math.floor(v/.12)).join(',');if(!cells.has(k))cells.set(k,p);}
                const support=[...cells.values()],warnings=[];let yaw=original[5],aligned=false;
                if(!currentBox.keepDirection){
                    // Measure the long XY axis with equal occupancy weights; no rider/roof density bias.
                    const heading=estimateFootprintHeading(support,{points:seed});
                    let axis=heading.objectAxis;
                    if(Number.isFinite(axis)){
                        const c=Math.cos(axis),s=Math.sin(axis),u=bounds(support.map(p=>c*p[0]+s*p[1]));
                        // A visible bumper is a long line too, but is much shorter
                        // than the preset body. Do not mistake it for the car's side.
                        if(u[1]-u[0]<Math.max(...dimensions.slice(0,2))*.5)axis=null;
                    }
                    if(Number.isFinite(axis)){
                        const vehicle=preset.key.startsWith('vehicles:');
                        const surface=vehicle?estimateVerticalHeading(support,yaw):null;
                        if(surface?.accepted&&Math.abs(angleDiff(surface.yaw,axis))<20*Math.PI/180)axis=surface.yaw;
                        yaw=original[5]+angleDiff(axis,original[5]);yaw=Math.atan2(Math.sin(yaw),Math.cos(yaw));aligned=true;
                    }else warnings.push('Uncertain long axis; kept original direction');
                }
                const c=Math.cos(yaw),s=Math.sin(yaw),xs=[],ys=[];
                for(const p of support){const dx=p[0]-seed[0],dy=p[1]-seed[1];xs.push(c*dx+s*dy);ys.push(-s*dx+c*dy);}
                const bx=bounds(xs),by=bounds(ys),spans=[bx[1]-bx[0],by[1]-by[0]];
                if(spans.some((v,i)=>v>dimensions[i]*1.25))throw new Error('Cluster exceeds preset footprint; possible neighboring object or wrong preset');
                const center=(b,size)=>{
                    if(b[1]-b[0]>=size*.65)return (b[0]+b[1])/2;
                    warnings.push('Partially observed object; center constrained by preliminary box');
                    // Preserve the initial center when it already encloses incomplete evidence.
                    return Math.max(b[1]-size/2,Math.min(b[0]+size/2,0));
                };
                const dx=center(bx,dimensions[0]),dy=center(by,dimensions[1]);
                if(Math.hypot(dx,dy)>Math.max(dimensions[0],dimensions[1])*.6)throw new Error('Object center too far from preliminary box');
                const result=original.slice();result[0]+=c*dx-s*dy;result[1]+=s*dx+c*dy;result[5]=yaw;result.splice(6,3,...dimensions);
                const fitted=snapGroundPoints(result,makePlane(ground.a,ground.b,ground.c)).newPoints;
                attempts.push({radius,pointCount:cluster.length,status:'valid'});
                const selection={fitted,cluster,preset:{key:preset.key,dimensions:dimensions.slice()},radius,aligned,warnings:[...new Set(warnings)],attempts,excludedNeighborPoints:owned.size};
                if(radius===.45)return selection;
                if(previous&&orientedIoU(previous.fitted,fitted)>=.9)return {...previous,attempts};
                previous=selection;
            }catch(error){lastError=error;previous=null;attempts.push({radius,status:'rejected',reason:error.message});}
        }
        throw lastError||new Error('Unable to isolate a stable object for preset alignment; box unchanged');
    }

    function fitSeededBox(points, classLabel, currentBox, neighborBoxes = []) {
        // Respect only the interior of existing neighboring annotations.
        // Seed points are always retained, including overlapping annotations.
        const seedPoints = new Set(extractBoxROI(points, currentBox, 0.4)), owned = new Set();
        for (const box of neighborBoxes) {
            if (!parseCVAT16Points(box.points)) continue;
            for (const q of extractBoxROI(points, box, -0.15)) if (!seedPoints.has(q)) owned.add(q);
        }
        const available = owned.size ? points.filter(q => !owned.has(q)) : points;
        let previous = null, lastError = null;
        const attempts = [];
        for (const radius of [0.55, 0.4, 0.3, 0.25, 0.2]) {
            const cluster = selectSeedCluster(available, currentBox, currentBox.ground, radius);
            try {
                const fitted = fitBoxToCluster(cluster, classLabel, { ...currentBox, rejectOversizedCluster: true });
                attempts.push({ radius, pointCount: cluster.length, status: 'valid' });
                const result = { cluster, fitted, radius, excludedNeighborPoints: owned.size, attempts };
                if (radius === 0.55) return result;
                // Do not accept a first smaller fragment just because it fits the class.
                // Require stable geometry at two successive radii.
                if (previous && orientedIoU(previous.fitted, fitted) >= 0.9) return { ...previous, attempts };
                previous = result;
            } catch (error) {
                attempts.push({ radius, pointCount: cluster.length, status: 'rejected', reason: error.message });
                lastError = error; previous = null;
                if (!/exceeds.*dimension|vượt kích thước|insufficient.*point|không đủ điểm|XY spread|phân bố XY/i.test(error.message)) throw error;
            }
        }
        throw new Error(lastError?.message || 'Unable to separate a stable vehicle cluster; please adjust preliminary box.');
    }

    function minimumRectangleYaw(points, initialYaw) {
        const sorted = points.map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lower = [], upper = [];
        for (const p of sorted) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
        for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
        const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
        if (hull.length < 3) return initialYaw;
        let best = Infinity, yaw = initialYaw;
        const angles = [initialYaw, ...hull.map((p, i) => Math.atan2(hull[(i + 1) % hull.length][1] - p[1], hull[(i + 1) % hull.length][0] - p[0]))];
        for (let angle of angles) {
            const cs = Math.cos(angle), sn = Math.sin(angle); let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
            for (const p of hull) { const x = cs * p[0] + sn * p[1], y = -sn * p[0] + cs * p[1]; xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
            const l = xmax - xmin, w = ymax - ymin, area = l * w;
            if (w > l) angle += Math.PI / 2;
            if (area < best - 1e-8) { best = area; yaw = angle; }
        }
        return yaw;
    }

    function estimateVerticalHeading(points, initialYaw) {
        const voxels = new Map();
        for (const p of points) { const k = p.map(v => Math.floor(v / 0.08)).join(','); if (!voxels.has(k)) voxels.set(k, p); }
        let support = [...voxels.values()];
        if (support.length > 3500) { const step = Math.ceil(support.length / 3500); support = support.filter((_, i) => i % step === 0); }
        const reject = { accepted: false, yaw: initialYaw, reason: 'Insufficient vertical surfaces to determine heading axis' };
        if (support.length < 30) return reject;
        let seed = 1103, best = null;
        const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < 512; i++) {
            const a = support[Math.floor(random() * support.length)], b = support[Math.floor(random() * support.length)];
            const dx = b[0] - a[0], dy = b[1] - a[1], norm = Math.hypot(dx, dy); if (norm < 0.6) continue;
            const nx = -dy / norm, ny = dx / norm, offset = nx * a[0] + ny * a[1], cells = new Set(), levels = new Set();
            let n = 0, zmin = Infinity, zmax = -Infinity, tmin = Infinity, tmax = -Infinity;
            for (const p of support) {
                if (Math.abs(nx * p[0] + ny * p[1] - offset) > 0.045) continue;
                const t = (dx * p[0] + dy * p[1]) / norm; n++; zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
                cells.add(`${Math.floor(t / 0.2)},${Math.floor(p[2] / 0.2)}`); levels.add(Math.floor(p[2] / 0.2));
            }
            if (n < 20 || n / support.length < 0.08 || levels.size < 4 || zmax - zmin < 0.5 || tmax - tmin < 0.6 || cells.size < 16) continue;
            if (!best || cells.size > best.score) best = { yaw: Math.atan2(dy, dx), score: cells.size, inlierCount: n, verticalSpan: zmax - zmin, normal: [nx, ny], offset };
        }
        if (!best) return reject;
        const c = Math.cos(best.yaw), s = Math.sin(best.yaw); let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
        for (const p of support) { const x = c * p[0] + s * p[1], y = -s * p[0] + c * p[1]; xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
        if (ymax - ymin > xmax - xmin) best.yaw += Math.PI / 2;
        while (best.yaw - initialYaw > Math.PI / 2) best.yaw -= Math.PI;
        while (best.yaw - initialYaw < -Math.PI / 2) best.yaw += Math.PI;
        return { ...best, accepted: true, method: 'vertical-surface-ransac', yaw: Math.atan2(Math.sin(best.yaw), Math.cos(best.yaw)) };
    }

    function autoFitSearchBox(currentBox, classLabel, ground, subType = null) {
        const original = currentBox.points || currentBox;
        const effectiveSub = subType || currentBox.subType || currentBox.attributes?.type;
        const resolved = resolveDimensionSpec(classLabel, effectiveSub);
        if (!resolved) throw new Error(`No dimension rule configured for class: ${classLabel}`);
        const p = original.slice(); p[3] = p[4] = p[5] = 0; p[6] = p[7] = Math.max(original[6], original[7], resolved.maxL) * 2;
        // Search height comes from class scale and ground, never an arbitrary 1m seed.
        const trusted = ground?.accepted && ground.confidence >= 0.65;
        if (trusted) { const bottom = ground.a * p[0] + ground.b * p[1] + ground.c; p[2] = bottom + resolved.maxH / 2; p[8] = resolved.maxH; }
        else p[8] = Math.max(original[8], 2 * resolved.maxH);
        return { points: p, margin: 0.4 };
    }

    class SpatialPointIndex {
        constructor(capacity, cellSize = 2) { this.coordinates = new Float32Array(capacity * 3); this.cells = new Map(); this.count = 0; this.cellSize = cellSize; }
        add(x, y, z) { if (!Number.isFinite(x + y + z)) return; const i = this.count++; this.coordinates.set([x, y, z], i * 3); const key = `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`; if (!this.cells.has(key)) this.cells.set(key, []); this.cells.get(key).push(i); }
        query(lo, hi) { const out = [], a = this.coordinates; for (let x = Math.floor(lo[0] / this.cellSize); x <= Math.floor(hi[0] / this.cellSize); x++) for (let y = Math.floor(lo[1] / this.cellSize); y <= Math.floor(hi[1] / this.cellSize); y++) for (const i of this.cells.get(`${x},${y}`) || []) { const j = i * 3; if (a[j] >= lo[0] && a[j] <= hi[0] && a[j + 1] >= lo[1] && a[j + 1] <= hi[1] && a[j + 2] >= lo[2] && a[j + 2] <= hi[2]) out.push([a[j], a[j + 1], a[j + 2]]); } return out; }
    }

    function fitBoxToCluster(points, classLabel, currentBox) {
        const original = currentBox.points || currentBox, ground = currentBox.ground;
        if (!parseCVAT16Points(original)) throw new Error('Invalid box coordinates');
        if (Math.abs(original[3]) > 1e-6 || Math.abs(original[4]) > 1e-6) throw new Error('Auto-Fit supports upright boxes only');
        const effectiveSub = currentBox.subType || currentBox.attributes?.type;
        const resolved = resolveDimensionSpec(classLabel, effectiveSub);
        if (!resolved) throw new Error(`No dimension rule configured for class: ${classLabel}`);
        if (points.filter(p => p?.length >= 3 && p.slice(0, 3).every(Number.isFinite)).length < 10)
            throw new Error('Insufficient LiDAR points for Auto-Fit (minimum 10 points required)');
        const trusted = ground && ground.accepted !== false && (ground.confidence == null || ground.confidence >= 0.65);
        if (!trusted && !currentBox.allowGroundFallback)
            throw new Error('Ground confidence too low for Auto-Fit' + (ground?.reason ? ': ' + ground.reason : ''));
        if (trusted && ![ground.a, ground.b, ground.c].every(Number.isFinite))
            throw new Error('Invalid ground plane for Auto-Fit');
        const plane = trusted ? makePlane(ground.a, ground.b, ground.c) : makePlane(0, 0, original[2] - original[8] / 2);
        const cluster = points.filter(p => p?.length >= 3 && p.slice(0, 3).every(Number.isFinite) && p[2] >= plane.getTargetZ(p[0], p[1]) + 0.08);
        if (cluster.length < 10)
            throw new Error('Insufficient LiDAR points for Auto-Fit (minimum 10 points required)');
        const bins = new Map(); for (const p of cluster) { const k = `${Math.floor(p[0] / 0.05)},${Math.floor(p[1] / 0.05)}`; if (!bins.has(k)) bins.set(k, p); }
        const support = [...bins.values()];
        const mx = support.reduce((a, p) => a + p[0], 0) / support.length, my = support.reduce((a, p) => a + p[1], 0) / support.length;
        let xx = 0, yy = 0, xy = 0;
        for (const p of support) { const x = p[0] - mx, y = p[1] - my; xx += x * x; yy += y * y; xy += x * y; }
        const spread = xx + yy;
        if (spread < 1e-9) throw new Error('Point cluster lacks sufficient XY spread for Auto-Fit');
        let yaw = Math.hypot(xx - yy, 2 * xy) / spread < 0.1 ? original[5] : 0.5 * Math.atan2(2 * xy, xx - yy);
        if (!currentBox.keepDirection && Math.hypot(xx - yy, 2 * xy) / spread >= 0.1) yaw = minimumRectangleYaw(cluster, yaw);
        const surface = currentBox.keepDirection ? { accepted: false } : estimateVerticalHeading(cluster, original[5]);
        if (surface.accepted) yaw = surface.yaw;
        while (yaw - original[5] > Math.PI / 2) yaw -= Math.PI;
        while (yaw - original[5] < -Math.PI / 2) yaw += Math.PI;
        yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        if (currentBox.keepDirection) yaw = original[5];
        const cs = Math.cos(yaw), sn = Math.sin(yaw);
        let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmax = -Infinity;
        for (const p of cluster) {
            const x = cs * (p[0] - mx) + sn * (p[1] - my), y = -sn * (p[0] - mx) + cs * (p[1] - my);
            xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); zmax = Math.max(zmax, p[2]);
        }
        if (surface.accepted && cluster.length >= 100) {
            // Side/front evidence: trim rare lateral returns (mirrors/noise),
            // but keep sparse longitudinal tips when the far end is occluded.
            const lateral = cluster.map(p => -sn * (p[0] - mx) + cs * (p[1] - my)).sort((a, b) => a - b);
            ymin = lateral[Math.floor((lateral.length - 1) * 0.01)] - 0.04;
            ymax = lateral[Math.ceil((lateral.length - 1) * 0.99)] + 0.04;
            xmin -= 0.04; xmax += 0.04; zmax += 0.02;
        }
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const typeName = effectiveSub ? `${classLabel} (${effectiveSub})` : classLabel;
        if ((classLabel === 'vehicles' || currentBox.rejectOversizedCluster) &&
            (xmax - xmin > resolved.maxL + 0.1 || ymax - ymin > resolved.maxW + 0.1 || zmax - plane.getTargetZ(mx, my) > resolved.maxH + 0.1)) {
            throw new Error(`Cluster exceeds ${typeName} dimensions (max: ${resolved.maxL}x${resolved.maxW}x${resolved.maxH}m); may include adjacent objects.`);
        }
        const l = clamp(xmax - xmin, resolved.minL, resolved.maxL);
        const w = clamp(ymax - ymin, classLabel === 'two-wheels' ? Math.max(0.6, resolved.minW) : resolved.minW, resolved.maxW);
        const cx = mx + cs * (xmin + xmax) / 2 - sn * (ymin + ymax) / 2, cy = my + sn * (xmin + xmax) / 2 + cs * (ymin + ymax) / 2;
        const footprintPoints = [[l / 2, w / 2], [l / 2, -w / 2], [-l / 2, w / 2], [-l / 2, -w / 2]];
        const bottom = Math.max(...footprintPoints.map(([x, y]) => plane.getTargetZ(cx + cs * x - sn * y, cy + sn * x + cs * y)));
        const h = clamp(zmax - bottom, resolved.minH, resolved.maxH), result = original.slice();
        while (result.length < 16) result.push(0);
        result.splice(0, 9, cx, cy, bottom + h / 2, 0, 0, yaw, l, w, h);
        if (!trusted) { result[2] = original[2]; result[8] = original[8]; }
        if (classLabel === 'vehicles' && result[8] > resolved.maxH) {
            throw new Error(`Box height exceeds ${typeName} profile; ground confidence insufficient to adjust height.`);
        }
        return result.slice(0, 16);
    }

    const api = {
        VEHICLE_SUBTYPES, BASE_DIMENSION_SPECS, resolveDimensionSpec, FIT_PRESETS, validFitPreset, resolveFitPreset, fitPresetBox,
        fitSeededBox, autoAdjustBox, autoAdjustOptions, refineCenterNearPointer, estimateFootprintHeading, canManuallySnapGround, estimateLocalGround, estimateVerticalHeading, autoFitSearchBox,
        SpatialPointIndex, minimumRectangleYaw, selectSeedCluster, extractBoxROI, fitBoxToCluster,
        DIMENSION_SPECS, idOf, parseCVAT16Points, cuboidVertices, rotateYawPoints, makePlane, fitPlane,
        estimateRoadPlane, snapGroundPoints, footprint, polygonArea, polygonIntersection, orientedIoU,
        auditCuboid, auditFrame, GroundIndex
    };
    root.__CVAT_COPILOT_MATH = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
