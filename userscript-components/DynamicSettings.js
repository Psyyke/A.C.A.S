const DynamicSettingsCore = (() => {
    const variables = Object.freeze({
        __proto__: null,
        pieceCount: Object.freeze({
            label: 'Piece Count',
            min: 0,
            max: 32,
            getValue: safeMethod(context => context?.pieceCount, () => null)
        }),
        moveNumber: Object.freeze({ label: 'Move Number', min: 1, max: 1000,
            getValue: safeMethod(context => context?.moveNumber, () => null) }),
        evaluation: Object.freeze({ label: 'Evaluation (your advantage, cp)', min: -10000, max: 10000,
            getValue: safeMethod(context => context?.evaluation, () => null) })
    });

    // Accept data, not objects with custom coercion or values such as Symbols.
    function finiteNumber(value, fallback = null) {
        const type = typeof value;
        if(type !== 'number' && type !== 'string' && type !== 'boolean') return fallback;
        if(type === 'string' && !value.trim()) return fallback;
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function contextKey(instanceID) {
        return typeof instanceID === 'string' || typeof instanceID === 'number' && Number.isFinite(instanceID)
            ? String(instanceID) : null;
    }

    function baseFallback(baseValue) {
        return typeof baseValue === 'number' && Number.isFinite(baseValue) ? Math.round(baseValue) : baseValue;
    }

    // One boundary protects every public method, including hostile getters/proxies.
    // Fallbacks only inspect primitive types or create fresh, safe return values.
    function safeMethod(method, fallback) {
        return (...args) => {
            try { return method(...args); }
            catch(e) { return fallback(...args); }
        };
    }

    function getVariableValue(variable, context) {
        if(typeof variable !== 'string' || !Object.hasOwn(variables, variable)) return null;
        const definition = variables[variable];
        const value = finiteNumber(definition.getValue(context));
        if(value === null) return null;
        return variable === 'pieceCount' ? Math.max(definition.min, Math.min(definition.max, Math.round(value))) : Math.round(value);
    }

    function formatVariableValue(variable, value) {
        if(variable !== 'evaluation') {
            return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
        }
        value = finiteNumber(value);
        if(value === null) return '';
        return value === 0 ? 'Equal (0 cp)' : `${value > 0 ? 'Winning' : 'Losing'} (${value > 0 ? '+' : ''}${value} cp)`;
    }

    function normalizePoints(points) {
        if(!Array.isArray(points)) return [];
        const byX = new Map();
        points.forEach(point => {
            if(!point || typeof point !== 'object') return;
            const x = finiteNumber(point.x);
            const y = finiteNumber(point.y);
            if(x !== null && y !== null) byX.set(Math.round(x), Math.round(y));
        });
        return [...byX].map(([x, y]) => ({ x, y })).sort((a, b) => a.x - b.x);
    }

    function normalizeCurve(curve, baseValue) {
        if(!curve || typeof curve !== 'object' || Array.isArray(curve)) return { points: [] };
        const boolean = typeof baseValue === 'boolean' || curve.boolean === true;
        const normalized = { ...curve, points: normalizePoints(curve.points) };
        if(curve.variable === 'pieceCount') {
            normalized.points = normalizePoints(normalized.points.map(point => ({ ...point,
                x: Math.max(variables.pieceCount.min, Math.min(variables.pieceCount.max, point.x)) })));
        }
        if(boolean) Object.assign(normalized, { boolean: true, interpolation: 'step', minY: 0, maxY: 1 });
        if(Array.isArray(curve.values)) {
            normalized.values = [...curve.values];
            Object.assign(normalized, { interpolation: 'step', minY: 0, maxY: Math.max(0, curve.values.length - 1) });
        }
        const minY = Math.ceil(finiteNumber(normalized.minY, -Infinity));
        const maxY = Math.floor(finiteNumber(normalized.maxY, Infinity));
        if(minY > maxY) return { ...normalized, points: [] };
        normalized.points.forEach(point => {
            point.y = Math.max(minY, Math.min(maxY, point.y));
        });
        return normalized;
    }

    function evaluateCurve(curve, variableValue) {
        if(!curve || typeof curve !== 'object' || Array.isArray(curve) || !curve.enabled) return null;
        const x = finiteNumber(variableValue);
        if(x === null) return null;
        curve = normalizeCurve(curve);
        const points = curve.points;
        if(!points.length) return null;
        const last = points[points.length - 1];
        if(curve.outsideRange === 'default' && (x < points[0].x || x > last.x)) return null;
        if(x <= points[0].x) return points[0].y;
        if(x >= last.x) return last.y;

        const rightIndex = points.findIndex(point => point.x >= x);
        const left = points[rightIndex - 1];
        const right = points[rightIndex];
        if(!left || !right) return null;
        // A step changes at the point itself, not just after its X coordinate.
        if(x === right.x) return right.y;
        const width = right.x - left.x;
        if(width <= 0 || curve.interpolation === 'step') return left.y;

        const t = (x - left.x) / width;
        if(curve.interpolation === 'smooth') {
            const slopes = points.slice(0, -1).map((point, index) =>
                (points[index + 1].y - point.y) / (points[index + 1].x - point.x)
            );
            const tangent = index => {
                if(index === 0 || index === points.length - 1) return 0;
                const before = slopes[index - 1];
                const after = slopes[index];
                if(before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) return 0;
                const beforeWidth = points[index].x - points[index - 1].x;
                const afterWidth = points[index + 1].x - points[index].x;
                const w1 = 2 * afterWidth + beforeWidth;
                const w2 = afterWidth + 2 * beforeWidth;
                return (w1 + w2) / (w1 / before + w2 / after);
            };
            const m0 = tangent(rightIndex - 1) * width;
            const m1 = tangent(rightIndex) * width;
            const t2 = t * t;
            const t3 = t2 * t;
            return finiteNumber((2 * t3 - 3 * t2 + 1) * left.y
                + (t3 - 2 * t2 + t) * m0
                + (-2 * t3 + 3 * t2) * right.y
                + (t3 - t2) * m1);
        }

        return finiteNumber(left.y + (right.y - left.y) * t);
    }

    function coerceSettingValue(value, baseValue, curve) {
        if(Array.isArray(curve.values)) {
            const choice = curve.values[Math.round(value)];
            return typeof choice === typeof baseValue && (typeof choice === 'string' || typeof choice === 'boolean'
                || typeof choice === 'number' && Number.isFinite(choice)) ? choice : baseValue;
        }
        if(typeof baseValue === 'boolean') return Number(value) >= 0.5;
        if(typeof baseValue === 'number') {
            const numericValue = finiteNumber(value);
            if(numericValue === null) return baseValue;
            const bounded = Math.max(
                finiteNumber(curve.minY, -Infinity),
                Math.min(finiteNumber(curve.maxY, Infinity), numericValue)
            );
            const rounded = Math.round(bounded);
            return Number.isFinite(rounded) ? rounded : baseValue;
        }
        return baseValue;
    }

    function resolveValue(baseValue, curve, context) {
        // Ordinary settings without a graph keep their existing value/type semantics.
        if(!curve || typeof curve !== 'object' || Array.isArray(curve)) return baseValue;
        const fallback = baseFallback(baseValue);
        if(baseValue === undefined || !curve.enabled) return fallback;
        if(curve.resetAtStart && (finiteNumber(context?.gameStart, 0) !== 0 || finiteNumber(context?.moveNumber) === 1)) return fallback;
        curve = normalizeCurve(curve, baseValue);
        const variableValue = getVariableValue(curve.variable, context);
        const result = evaluateCurve(curve, variableValue);
        if(result === null) return fallback;
        return coerceSettingValue(result, fallback, curve);
    }

    function getContextFromFen(fen) {
        if(typeof fen !== 'string' || !fen.trim()) return {};
        const fields = fen.trim().split(/\s+/);
        return {
            pieceCount: (fields[0].match(/[rnbqkpRNBQKP]/g) ?? []).length,
            moveNumber: Math.max(1, Math.round(finiteNumber(fields[5], 1))),
            gameStart: 0
        };
    }

    const contexts = new Map();
    const defaultContext = Object.create(null);

    function setContext(instanceID, context) {
        if(!context || typeof context !== 'object' || Array.isArray(context)) return;
        const instanceKey = contextKey(instanceID);
        if(instanceID != null && instanceKey === null) return;
        // Validate the entire update before committing it, so a getter failure
        // cannot leave a previously valid instance context partially changed.
        const target = Object.assign(Object.create(null), instanceID == null ? defaultContext : contexts.get(instanceKey));
        Object.entries(context ?? {}).forEach(([key, value]) => {
            if(!Object.hasOwn(variables, key) && key !== 'gameStart') return;
            if(value === undefined) return;
            const number = finiteNumber(value);
            if(number === null) {
                delete target[key];
                return;
            }
            target[key] = number;
        });
        if(instanceID != null) contexts.set(instanceKey, target);
        else {
            Object.keys(defaultContext).forEach(key => delete defaultContext[key]);
            Object.assign(defaultContext, target);
        }
    }

    function getContext(instanceID) {
        return { ...defaultContext, ...(instanceID == null ? {} : contexts.get(contextKey(instanceID))) };
    }

    function removeContext(instanceID) {
        const instanceKey = contextKey(instanceID);
        if(instanceKey !== null) contexts.delete(instanceKey);
    }

    function getContexts() {
        return [...contexts].map(([instanceID, context]) => ({ instanceID, context: { ...defaultContext, ...context } }));
    }

    return Object.freeze({
        variables,
        getVariableValue: safeMethod(getVariableValue, () => null),
        formatVariableValue: safeMethod(formatVariableValue, () => ''),
        normalizePoints: safeMethod(normalizePoints, () => []),
        normalizeCurve: safeMethod(normalizeCurve, () => ({ points: [] })),
        evaluateCurve: safeMethod(evaluateCurve, () => null),
        resolveValue: safeMethod(resolveValue, baseFallback),
        getContextFromFen: safeMethod(getContextFromFen, () => ({})),
        setContext: safeMethod(setContext, () => undefined),
        getContext: safeMethod(getContext, () => ({})),
        getContexts: safeMethod(getContexts, () => []),
        removeContext: safeMethod(removeContext, () => undefined)
    });
})();
