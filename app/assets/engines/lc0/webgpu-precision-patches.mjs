export function patchPackedAccumulation(source, halfProducts = false) {
    if(halfProducts) {
        const patches = [
            ['var acc: array<vec4<${type}>, rowPerThread>;', 'var acc: array<vec4<f32>, rowPerThread>;', 1],
            ['var acc : array<array<${type}, colPerThread>, rowPerThread>;',
                'var acc : array<array<f32, colPerThread>, rowPerThread>;', 1],
            ['ACached * BCached[innerCol]', 'f32(ACached * BCached[innerCol])', 2],
            ['globalCol, acc[innerRow]);', 'globalCol, vec4<${type}>(acc[innerRow]));', 1],
            ['gCol, acc[innerRow][innerCol]);', 'gCol, ${type}(acc[innerRow][innerCol]));', 1],
            ['        acc[innerRow][innerCol]);', '        ${type}(acc[innerRow][innerCol]));', 1]
        ];
        for(let i = 0; i < 4; i++) {
            patches.push([`BCached${i} * ACached${i}[i] + acc[i]`,
                `vec4<f32>(BCached${i} * ACached${i}[i]) + acc[i]`, 1]);
            patches.push([`BCached${i} * ACached.${'xyzw'[i]} + acc[i]`,
                `vec4<f32>(BCached${i} * ACached.${'xyzw'[i]}) + acc[i]`, 1]);
        }
        return applyPatches(source, patches);
    }
    const patches = [
        ['var acc: array<vec4<${type}>, rowPerThread>;', 'var acc: array<vec4<f32>, rowPerThread>;', 1],
        ['var acc : array<array<${type}, colPerThread>, rowPerThread>;',
            'var acc : array<array<f32, colPerThread>, rowPerThread>;', 1],
        ['let BCached0 = mm_Bsub[k * innerElementSize][tileCol];',
            'let BCached0 = vec4<f32>(mm_Bsub[k * innerElementSize][tileCol]);', 1],
        ['let BCached1 = mm_Bsub[k * innerElementSize + 1][tileCol];',
            'let BCached1 = vec4<f32>(mm_Bsub[k * innerElementSize + 1][tileCol]);', 1],
        ['let BCached2 = mm_Bsub[k * innerElementSize + 2][tileCol];',
            'let BCached2 = vec4<f32>(mm_Bsub[k * innerElementSize + 2][tileCol]);', 1],
        ['let BCached3 = mm_Bsub[k * innerElementSize + 3][tileCol];',
            'let BCached3 = vec4<f32>(mm_Bsub[k * innerElementSize + 3][tileCol]);', 1],
        ['let ACached0 = mm_Asub[k * innerElementSize][localRow];',
            'let ACached0 = vec4<f32>(mm_Asub[k * innerElementSize][localRow]);', 1],
        ['let ACached1 = mm_Asub[k * innerElementSize + 1][localRow];',
            'let ACached1 = vec4<f32>(mm_Asub[k * innerElementSize + 1][localRow]);', 1],
        ['let ACached2 = mm_Asub[k * innerElementSize + 2][localRow];',
            'let ACached2 = vec4<f32>(mm_Asub[k * innerElementSize + 2][localRow]);', 1],
        ['let ACached3 = mm_Asub[k * innerElementSize + 3][localRow];',
            'let ACached3 = vec4<f32>(mm_Asub[k * innerElementSize + 3][localRow]);', 1],
        ['let ACached = mm_Asub[tileRow + i][k];',
            'let ACached = vec${innerElementSize}<f32>(mm_Asub[tileRow + i][k]);', 1],
        ['ACached * BCached[innerCol]', 'f32(ACached) * f32(BCached[innerCol])', 2],
        ['globalCol, acc[innerRow]);', 'globalCol, vec4<${type}>(acc[innerRow]));', 1],
        ['gCol, acc[innerRow][innerCol]);', 'gCol, ${type}(acc[innerRow][innerCol]));', 1],
        ['        acc[innerRow][innerCol]);', '        ${type}(acc[innerRow][innerCol]));', 1]
    ];
    return applyPatches(source, patches);
}

function applyPatches(source, patches) {
    for(const [before, after, count] of patches) {
        if(source.split(before).length - 1 !== count)
            throw new Error(`ONNX Runtime packed accumulator patch no longer matches: ${before}`);
        source = source.replaceAll(before, after);
    }
    return source;
}
