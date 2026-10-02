const AppDynamicSettingsCore = (() => {
    const shared = DynamicSettingsCore;
    const finiteNumber = (value, fallback = null) => {
        if(typeof value !== 'number' && typeof value !== 'string') return fallback;
        if(typeof value === 'string' && !value.trim()) return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    };
    const continuous = curve => curve?.decimal === true && !curve.boolean && !Array.isArray(curve.values);

    function normalizePoints(points, decimal = false) {
        if(!decimal) return shared.normalizePoints(points);
        if(!Array.isArray(points)) return [];
        const byX = new Map();
        points.forEach(point => {
            const x = finiteNumber(point?.x), y = finiteNumber(point?.y);
            if(x !== null && y !== null) byX.set(Math.round(x), y);
        });
        return [...byX].map(([x, y]) => ({ x, y })).sort((a, b) => a.x - b.x);
    }

    function normalizeCurve(curve, baseValue) {
        if(!continuous(curve)) return shared.normalizeCurve(curve, curve?.text ? undefined : baseValue);
        const normalized = { ...curve, points: normalizePoints(curve.points, true) };
        if(curve.variable === 'pieceCount') {
            normalized.points = normalizePoints(normalized.points.map(point => ({ ...point,
                x: Math.max(0, Math.min(shared.variables.pieceCount.max, point.x)) })), true);
        }
        const min = finiteNumber(curve.minY, -Infinity), max = finiteNumber(curve.maxY, Infinity);
        if(min > max) return { ...normalized, points: [] };
        normalized.points.forEach(point => { point.y = Math.max(min, Math.min(max, point.y)); });
        return normalized;
    }

    function evaluateCurve(curve, variableValue) {
        if(!continuous(curve)) return shared.evaluateCurve(curve, variableValue);
        if(!curve.enabled) return null;
        const x = finiteNumber(variableValue);
        if(x === null) return null;
        curve = normalizeCurve(curve);
        const points = curve.points;
        if(!points.length) return null;
        const last = points.at(-1);
        if(curve.outsideRange === 'default' && (x < points[0].x || x > last.x)) return null;
        if(x <= points[0].x) return points[0].y;
        if(x >= last.x) return last.y;
        const rightIndex = points.findIndex(point => point.x >= x);
        const left = points[rightIndex - 1], right = points[rightIndex];
        if(x === right.x) return right.y;
        if(curve.interpolation === 'step') return left.y;
        const width = right.x - left.x, t = (x - left.x) / width;
        if(curve.interpolation !== 'smooth') return finiteNumber(left.y + (right.y - left.y) * t);

        // The same monotone Hermite interpolation as the shared core, without
        // normalizing away fractional Y coordinates before interpolation.
        const slopes = points.slice(0, -1).map((point, index) =>
            (points[index + 1].y - point.y) / (points[index + 1].x - point.x));
        const tangent = index => {
            if(index === 0 || index === points.length - 1) return 0;
            const before = slopes[index - 1], after = slopes[index];
            if(before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) return 0;
            const beforeWidth = points[index].x - points[index - 1].x;
            const afterWidth = points[index + 1].x - points[index].x;
            const w1 = 2 * afterWidth + beforeWidth, w2 = afterWidth + 2 * beforeWidth;
            return (w1 + w2) / (w1 / before + w2 / after);
        };
        const t2 = t * t, t3 = t2 * t;
        return finiteNumber((2 * t3 - 3 * t2 + 1) * left.y
            + (t3 - 2 * t2 + t) * tangent(rightIndex - 1) * width
            + (-2 * t3 + 3 * t2) * right.y
            + (t3 - t2) * tangent(rightIndex) * width);
    }

    function resolveValue(baseValue, curve, context) {
        if(!continuous(curve) && !curve?.text) return shared.resolveValue(baseValue, curve, context);
        if(baseValue === undefined || !curve.enabled) return baseValue;
        if(curve.resetAtStart && (Number(context?.gameStart) || Number(context?.moveNumber) === 1)) return baseValue;
        curve = normalizeCurve(curve);
        const result = evaluateCurve(curve, shared.getVariableValue(curve.variable, context));
        if(result === null) return baseValue;
        if(curve.text) {
            const choice = curve.values?.[Math.round(result)];
            return typeof choice === 'string' ? choice : baseValue;
        }
        if(finiteNumber(baseValue) === null) return baseValue;
        const bounded = Math.max(finiteNumber(curve.minY, -Infinity), Math.min(finiteNumber(curve.maxY, Infinity), result));
        return Number.isFinite(bounded) ? bounded : baseValue;
    }

    const safe = (method, fallback) => (...args) => {
        try { return method(...args); }
        catch(error) { return fallback(...args); }
    };
    return Object.freeze({ ...shared,
        normalizePoints: safe(normalizePoints, () => []),
        normalizeCurve: safe(normalizeCurve, () => ({ points: [] })),
        evaluateCurve: safe(evaluateCurve, () => null),
        resolveValue: safe(resolveValue, baseValue => baseValue)
    });
})();