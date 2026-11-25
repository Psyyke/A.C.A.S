const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const scales = ['', 'thousand', 'million', 'billion', 'trillion'];
const ordinal = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth',
    nine: 'ninth', twelve: 'twelfth', twenty: 'twentieth', thirty: 'thirtieth', forty: 'fortieth',
    fifty: 'fiftieth', sixty: 'sixtieth', seventy: 'seventieth', eighty: 'eightieth', ninety: 'ninetieth' };

function cardinal(digits) {
    let number = BigInt(digits);
    if(number === 0n) return 'zero';
    const groups = [];
    for(let scale = 0; number > 0n; scale++, number /= 1000n) {
        const group = Number(number % 1000n);
        if(!group) continue;
        const words = [];
        if(group >= 100) words.push(small[Math.floor(group / 100)], 'hundred');
        const rest = group % 100;
        if(rest >= 20) {
            words.push(tens[Math.floor(rest / 10)]);
            if(rest % 10) words.push(small[rest % 10]);
        } else if(rest) words.push(small[rest]);
        if(scales[scale]) words.push(scales[scale]);
        groups.unshift(words.join(' '));
    }
    return groups.join(' ');
}

// The ZONOS web runtime has no text normalization. Leave ambiguous identifiers and
// formats such as times, version numbers and leading-zero codes alone.
export function normalizeZonosNumbers(text) {
    return text.replace(/(?<![\w.,:/$])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:st|nd|rd|th)?(?![\w%]|[.,:/]\d)/gi, token => {
        const match = token.match(/^([\d,]+)(?:\.(\d+))?(st|nd|rd|th)?$/i);
        const digits = match[1].replace(/,/g, '');
        if(digits.length > 15 || digits.length > 1 && digits.startsWith('0') || match[2] && match[3]) return token;
        if(match[3]) {
            const lastTwo = Number(digits.slice(-2)), last = lastTwo % 10;
            const suffix = lastTwo >= 11 && lastTwo <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[last] || 'th');
            if(match[3].toLowerCase() !== suffix) return token;
        }
        let words = cardinal(digits);
        if(match[2]) words += ` point ${[...match[2]].map(digit => small[Number(digit)]).join(' ')}`;
        if(match[3]) words = words.replace(/\b\w+$/, word => ordinal[word] || `${word}th`);
        return words;
    });
}
