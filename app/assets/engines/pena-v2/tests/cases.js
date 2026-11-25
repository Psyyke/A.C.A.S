import { Chess } from '../../libraries/chessjs/chess.js';

function position(moves) {
    const board = new Chess(), history = [];
    for(const san of moves.split(' ').filter(Boolean)) {
        history.push(board.fen());
        if(!board.move(san)) throw new Error(`Invalid development fixture move: ${san}`);
    }
    return { fen: board.fen(), history };
}

const groups = [
    ['opening-white', position(''), 'w', [
        'Why would Nf3 help here?', 'What should I play?', 'Which knight would you develop?', 'What does developing a piece mean?'
    ]],
    ['opening-black', position('e4'), 'b', [
        'What should I play?', 'Why would e5 help here?', 'What is White trying to do?', 'Is Nf6 playable?'
    ]],
    ['italian', position('e4 e5 Nf3 Nc6 Bc4 Bc5'), 'w', [
        'Why castle here?', 'What changes after c3?', 'Should I play d4 immediately?', 'Which piece needs improving?'
    ]],
    ['queens-gambit', position('d4 d5 c4 e6 Nc3 Nf6'), 'w', [
        'What is the point of Bg5?', 'What pawn break should I prepare?', 'Should I take on d5?', 'What is Black trying to do?'
    ]],
    ['caro-kann', position('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'), 'w', [
        'Why did they play Bf5?', 'What should I do about that bishop?', 'Is Ng3 sensible?', 'What changed after their last move?'
    ]],
    ['ruy-lopez-black', position('e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3'), 'b', [
        'Why castle now?', 'What is the point of d6?', 'What is White threatening?', 'Can I take the pawn on e4?'
    ]],
    ['enemy-knight', { fen: '4k3/8/5n2/8/5B2/8/8/4K3 w - - 0 1', history: [] }, 'w', [
        "What does Black's Nh5 threaten?", 'Which piece is undefended?', 'Does Kf2 defend my bishop?', 'What does with tempo mean?'
    ]],
    ['file-plan', { fen: '4r1k1/pp3ppp/2p5/3p4/3Pn3/2PBB3/P4PPP/3R2K1 w - - 0 22', history: [] }, 'w', [
        'What is the plan on the d-file?', 'Is the d-file open?', 'Which piece is stopping my rook?', 'Should I trade bishops?'
    ]],
    ['pawn-ending', { fen: '8/8/4k3/3p4/3P4/4K3/8/8 w - - 0 1', history: [] }, 'w', [
        'What should my king do?', 'What is opposition here?', 'Can I win this pawn?', 'Why not push the d-pawn?'
    ]],
    ['pin-black', position('e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bg4'), 'w', [
        'Which knight is pinned?', 'Is my knight really unable to move?', 'What does h3 change?', 'Why did Black play Bg4?'
    ]]
];

// Development fixtures are intentionally not the independent final heldout set.
export const developmentCases = groups.flatMap(([group, board, playerColor, questions]) =>
    questions.map((question, index) => ({ id: `${group}-${index + 1}`, group, ...board, playerColor, question })));
