import { developmentCases } from './cases.js';

const from = (id, options) => ({ ...developmentCases.find(item => item.id === id), ...options });

export const coachingCases = [
    from('opening-white-1', { id: 'quiet-white', domain: 'quiet', focusMove: 'g1f3', question: 'What useful job would Nf3 do here, and what is another reasonable idea?' }),
    from('opening-black-2', { id: 'quiet-black', domain: 'quiet', focusMove: 'e7e5', question: 'What would e5 change for Black? Give me one practical idea, not just an engine move.' }),
    from('file-plan-3', { id: 'blocked-rook', domain: 'contrast', focusMove: 'd3e2', subjectSquares: ['d1'], rayQueries: [{ square: 'd1', dx: 0, dy: 1 }], question: 'Would Be2 help my rook on d1, or would the d-file still have a blocker?' }),
    from('pin-black-3', { id: 'pin-counterplay', domain: 'contrast', focusMove: 'h2h3', subjectSquares: ['c3', 'f3'], question: 'What does h3 actually change? Does it free either of my knights immediately?' }),
    from('enemy-knight-3', { id: 'enemy-conditional', domain: 'opponent', focusMove: 'e1f2', opponentMove: 'f6h5', subjectSquares: ['f4'], question: 'After Kf2, what would Black\'s Nh5 attack, and is my bishop defended?' }),
    from('caro-kann-3', { id: 'bishop-reply', domain: 'opponent', focusMove: 'e4g3', subjectSquares: ['f5'], question: 'What is the point of Ng3 against that bishop, and can Black do something about it?' })
];
