import { Chess } from '../libraries/chessjs/chess.js';

// Chess words Pena can explain, most with a tiny demo board. Every demo is checked by tests, so
// when the model cites [D:fork] the picture is always right, whatever the model said.
// A demo plays its line on the overlay board and then draws its shapes on the final position.
// Terms without a fen still give the model a correct definition, they just have nothing to draw.
const red = '#ff6b6b', green = '#69db7c', blue = '#74c0fc', orange = '#ffa94d', purple = '#b197fc';
const arrow = (from, to, color) => Object.assign([from, to], { color });
const region = (label, squares, color) => ({ label, squares, anchor: squares[0], color });
const file = letter => '12345678'.split('').map(rank => letter + rank);
const rank = number => 'abcdefgh'.split('').map(letter => letter + number);
const diagonal = (from, to) => {
    const dx = Math.sign(to.charCodeAt(0) - from.charCodeAt(0)), dy = Math.sign(to[1] - from[1]);
    const squares = [from];
    while(squares.at(-1) !== to) {
        const last = squares.at(-1);
        squares.push(String.fromCharCode(last.charCodeAt(0) + dx) + (Number(last[1]) + dy));
    }
    return squares;
};
const box = (files, ranks) => [...files].flatMap(letter => [...ranks].map(number => letter + number));
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const after = (...moves) => {
    const board = new Chess();
    for(const uci of moves) board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return board.fen();
};
// Openings play from the starting position. They are also what memory listens for ("I play the Caro-Kann").
const opening = (title, aliases, meaning, line, relations = [], regions = [], loose = []) =>
    ({ title, aliases, meaning, fen: START, line, relations, regions, opening: true, loose });

export const glossary = {
    // Tactics
    fork: { aliases: ['forks', 'forking', 'forked', 'double attack', 'family fork', 'royal fork', 'pawn fork', 'knight fork'],
        meaning: 'one piece attacks two or more enemy pieces at the same time, so only one can be saved',
        fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', line: ['d5c7'],
        relations: [arrow('c7', 'e8', red), arrow('c7', 'a8', red)], regions: [region('Fork', ['c7'], orange)] },
    pin: { aliases: ['pins', 'pinned', 'pinning', 'absolute pin', 'relative pin'],
        meaning: 'a piece cannot move, or should not, because a more valuable piece stands behind it on the same line. Against the king it is an absolute pin and moving is illegal',
        fen: '4k3/8/8/8/1b6/2N5/8/4K3 w - - 0 1',
        relations: [arrow('b4', 'c3', red), arrow('c3', 'e1', red)], regions: [region('Pinned', ['c3'], red)] },
    skewer: { aliases: ['skewers', 'skewered', 'skewering'],
        meaning: 'a valuable piece is attacked and when it steps aside, the piece behind it falls, a reversed pin',
        fen: '4q3/8/8/4k3/8/8/8/R6K w - - 0 1', line: ['a1e1', 'e5d5', 'e1e8'],
        relations: [], regions: [region('Won', ['e8'], green)] },
    'discovered attack': { aliases: ['discovered check', 'discovery', 'discovered attacks', 'discovered'],
        meaning: 'moving one piece uncovers an attack by the piece behind it, so you get two threats with one move',
        fen: '4k3/8/8/8/8/8/4N3/4R1K1 w - - 0 1', line: ['e2c3'],
        relations: [arrow('e1', 'e8', red)], regions: [region('Line opened', ['e2', 'e3', 'e4', 'e5', 'e6', 'e7'], orange)], weak: ['discovered'] },
    'double check': { aliases: ['double checks', 'double-check'],
        meaning: 'two pieces give check at once, usually through a discovery. Nothing can block or capture both, so the king must move',
        fen: '4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1', line: ['e4f6'],
        relations: [arrow('e1', 'e8', red), arrow('f6', 'e8', red)], regions: [region('Two checks', ['f6', 'e1'], orange)] },
    'hanging piece': { aliases: ['hanging', 'hangs', 'hang', 'undefended', 'en prise', 'loose piece', 'loose pieces', 'free piece', 'hanging pieces'],
        meaning: 'a piece that is attacked and not defended, it can simply be taken',
        fen: '4k3/8/8/3n4/8/8/3R4/4K3 w - - 0 1',
        relations: [arrow('d2', 'd5', red)], regions: [region('Hanging', ['d5'], red)], weak: ['hanging', 'hangs', 'hang', 'undefended', 'free piece'] },
    'x-ray': { aliases: ['xray', 'x-rays', 'x-ray attack'],
        meaning: 'a piece attacks or defends through another piece standing on the same line',
        fen: '3r2k1/5ppp/8/8/8/8/3R1PPP/3R2K1 w - - 0 1',
        relations: [arrow('d1', 'd8', blue)], regions: [region('X-ray', ['d1', 'd2'], blue)] },
    deflection: { aliases: ['deflect', 'deflecting', 'deflected', 'deflections'],
        meaning: 'forcing a defending piece away from the square or line it guards, here e5 chases the knight that guards h7',
        fen: '5rk1/5pp1/5n2/6N1/4P3/7Q/8/6K1 w - - 0 1', line: ['e4e5', 'f6d5', 'h3h7'],
        relations: [arrow('g5', 'h7', green)], regions: [region('Guard chased away', ['f6'], orange), region('Mate', ['h7'], red)], weak: ['deflect', 'deflected'] },
    decoy: { aliases: ['decoys', 'decoying', 'lure', 'luring'],
        meaning: 'a sacrifice that lures a piece, often the king, onto a square where a tactic works, here the king is pulled into a knight fork',
        fen: '1q1n2k1/6pp/8/4N3/8/8/6PP/5RK1 w - - 0 1', line: ['f1f8', 'g8f8', 'e5d7'],
        relations: [arrow('d7', 'f8', red), arrow('d7', 'b8', red)], regions: [region('Lured here', ['f8'], orange)], weak: ['lure', 'luring'] },
    'overloaded piece': { aliases: ['overloading', 'overloaded', 'overload', 'overworked piece', 'overworked'],
        meaning: 'one defender has two jobs at once, so taking one thing leaves the other unguarded',
        fen: '7k/3b4/6b1/4n3/8/8/8/K2R2R1 w - - 0 1', line: ['d1d7', 'e5d7', 'g1g6'],
        relations: [arrow('e5', 'd7', orange), arrow('e5', 'g6', orange)], regions: [region('Two jobs', ['e5'], red)] },
    'removing the defender': { aliases: ['remove the defender', 'removal of the defender', 'undermining', 'eliminating the defender', 'take the defender', 'capturing the defender'],
        meaning: 'capturing or chasing away the piece that guards something, so the guarded piece or square falls',
        fen: '6k1/3p4/2n5/1B2b3/8/8/8/4R1K1 w - - 0 1', line: ['b5c6', 'd7c6', 'e1e5'],
        relations: [arrow('c6', 'e5', orange)], regions: [region('The defender', ['c6'], red)] },
    'trapped piece': { aliases: ['trapped', 'trap a piece', 'trapping', 'no squares', 'nowhere to go'],
        meaning: 'a piece with no safe square to go to, so it can be attacked and won',
        fen: '6k1/8/4b3/8/8/8/PPK5/8 b - - 0 1', line: ['e6a2', 'b2b3'],
        relations: [arrow('c2', 'b1', red), arrow('c2', 'b3', red)], regions: [region('Trapped', ['a2'], red)], weak: ['trapped', 'trapping', 'no squares', 'nowhere to go'] },
    'perpetual check': { aliases: ['perpetual', 'perpetual checks', 'endless checks'],
        meaning: 'checks the king can never escape, so the game ends in a draw by repetition. A great rescue when you are losing',
        fen: '5rk1/8/8/q7/8/8/2Q2PPP/6K1 w - - 0 1', line: ['c2g6', 'g8h8', 'g6h6', 'h8g8', 'h6g6', 'g8h8'],
        relations: [], regions: [region('Back and forth', ['g6', 'h6'], orange)] },
    sacrifice: { aliases: ['sacrifices', 'sac', 'sacs', 'sacrificing', 'sacrificed', 'sack'],
        meaning: 'giving up material on purpose to get something bigger, like an attack, a mate or a better position',
        fen: '5rk1/5ppp/4p3/4P3/8/3B1N2/5PPP/3Q1RK1 w - - 0 1', line: ['d3h7', 'g8h7', 'f3g5', 'h7g8', 'd1h5'],
        relations: [arrow('h5', 'h7', red)], regions: [region('Bishop given up', ['h7'], orange)], weak: ['sack', 'sacrificed'] },
    'greek gift': { aliases: ['greek gift sacrifice', 'bxh7', 'classic bishop sacrifice'],
        meaning: 'the bishop sacrifice on h7 (h2 for Black) against a castled king, usually followed by a knight check on g5 and the queen joining the attack',
        fen: '5rk1/5ppp/4p3/4P3/8/3B1N2/5PPP/3Q1RK1 w - - 0 1', line: ['d3h7', 'g8h7', 'f3g5', 'h7g8', 'd1h5'],
        relations: [arrow('h5', 'h7', red), arrow('g5', 'h7', red)], regions: [region('Mate threat', ['h7'], red)], title: 'Greek gift' },
    exchange: { aliases: ['the exchange', 'exchange sacrifice', 'exchange sac', 'up the exchange', 'down the exchange', 'win the exchange', 'won the exchange'],
        meaning: 'a rook for a bishop or knight. Winning a rook for a minor piece is winning the exchange, giving one up on purpose is an exchange sacrifice',
        fen: '2r3k1/5ppp/8/8/8/2N5/1P3PPP/6K1 b - - 0 1', line: ['c8c3', 'b2c3'],
        relations: [], regions: [region('Rook gave itself for a knight', ['c3'], orange)], weak: ['exchange'] },
    interference: { aliases: ['interfere', 'interfering', 'cut the line'],
        meaning: 'putting a piece between an enemy piece and what it defends, cutting the line between them', weak: ['interfere', 'interfering'] },
    zwischenzug: { aliases: ['intermezzo', 'in-between move', 'intermediate move', 'zwischenzugs'],
        meaning: 'an in-between move. Instead of the expected recapture or reply, you first play a stronger forcing move, like a check' },
    desperado: { aliases: ['desperados'],
        meaning: 'a piece that is lost anyway grabs as much material as it can before it goes' },
    windmill: { aliases: ['windmills'],
        meaning: 'a repeating discovered check that lets a rook or bishop take piece after piece while the king shuffles back and forth' },
    clearance: { aliases: ['clearance sacrifice', 'line clearance', 'square clearance'],
        meaning: 'moving a piece out of the way, often with a threat, so another piece can use its square or line' },
    // Mates
    checkmate: { aliases: ['mate', 'mated', 'checkmated', 'checkmates', 'mates'],
        meaning: 'the king is in check and has no way out, game over',
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', line: ['d1d8'],
        relations: [arrow('d8', 'g8', red)], regions: [region('Checkmate', ['g8'], red)], weak: ['mate', 'mated', 'mates', 'checkmate', 'checkmated', 'checkmates'] },
    'back rank mate': { aliases: ['back rank', 'back-rank', 'back rank weakness', 'back rank mates', 'weak back rank'],
        meaning: 'a king trapped behind its own pawns on the last rank gets mated by a rook or queen, a pawn move like h3 gives it air',
        fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', line: ['d1d8'],
        relations: [arrow('d8', 'g8', red)], regions: [region('Own pawns trap the king', ['f7', 'g7', 'h7'], red)] },
    'smothered mate': { aliases: ['smothered', 'smother mate'],
        meaning: 'a knight mates a king that is boxed in by its own pieces',
        fen: '6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', line: ['g5f7'],
        relations: [arrow('f7', 'h8', red)], regions: [region('Own pieces box it in', ['g8', 'g7', 'h7'], red)] },
    "anastasia's mate": { aliases: ['anastasia mate', 'anastasias mate'], title: "Anastasia's mate",
        meaning: 'a knight and a rook or queen mate a king on the edge. The knight takes the escape squares and the rook checks down the file',
        fen: 'r7/4N1pk/8/8/8/3R4/5PPP/6K1 w - - 0 1', line: ['d3h3'],
        relations: [arrow('h3', 'h7', red), arrow('e7', 'g8', orange), arrow('e7', 'g6', orange)], regions: [region('Mate', ['h7'], red)] },
    'arabian mate': { aliases: ['arabian'], title: 'Arabian mate',
        meaning: 'a rook and a knight mate a king in the corner, the knight guards the rook and the last escape square',
        fen: '7k/1R6/5N2/8/8/8/5PPP/6K1 w - - 0 1', line: ['b7h7'],
        relations: [arrow('f6', 'h7', orange), arrow('f6', 'g8', orange)], regions: [region('Mate', ['h8'], red)] },
    "boden's mate": { aliases: ['boden mate', 'bodens mate'], title: "Boden's mate",
        meaning: 'two bishops on crossing diagonals mate a king, usually one castled queenside, while its own pieces block the escape',
        fen: '2kr4/p2n4/2p5/8/5B2/8/5PPP/5BK1 w - - 0 1', line: ['f1a6'],
        relations: [arrow('a6', 'c8', red), arrow('f4', 'b8', orange)], regions: [region('Mate', ['c8'], red)] },
    'epaulette mate': { aliases: ['epaulet mate'], title: 'Epaulette mate',
        meaning: 'a queen mates a king boxed in by its own rooks on both sides, like shoulder pads',
        fen: '3rkr2/8/8/8/8/8/Q4PPP/6K1 w - - 0 1', line: ['a2e6'],
        relations: [arrow('e6', 'e8', red)], regions: [region('Own rooks block', ['d8', 'f8'], red)] },
    "scholar's mate": { aliases: ['scholars mate', 'four move checkmate', '4 move checkmate', 'four move mate'], title: "Scholar's mate",
        meaning: 'a quick queen and bishop mate on f7 (f2 for White). Defending f7 calmly stops it, and the early queen can then be chased',
        fen: START, line: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'],
        relations: [arrow('c4', 'f7', red)], regions: [region('Mate on f7', ['f7'], red)] },
    "fool's mate": { aliases: ['fools mate', 'two move checkmate', '2 move checkmate', 'fastest checkmate'], title: "Fool's mate",
        meaning: 'the fastest possible checkmate. After the weakening pawn moves f3 and g4, the queen mates on h4',
        fen: START, line: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
        relations: [arrow('h4', 'e1', red)], regions: [region('Opened diagonal', ['f2', 'g3'], orange)] },
    "legal's mate": { aliases: ['legal mate', 'legals mate', 'legal trap'], title: "Légal's mate",
        meaning: 'an opening trap where a knight ignores the pin on it and gives up the queen, then the minor pieces mate the king',
        fen: START, line: ['e2e4', 'e7e5', 'g1f3', 'd7d6', 'f1c4', 'c8g4', 'b1c3', 'g7g6', 'f3e5', 'g4d1', 'c4f7', 'e8e7', 'c3d5'],
        relations: [], regions: [region('Mate', ['e7'], red)] },
    'ladder mate': { aliases: ['lawnmower mate', 'rook roller', 'two rook mate', 'two rooks mate', 'staircase mate'], title: 'Ladder mate',
        meaning: 'two rooks, or a queen and a rook, take turns checking and cutting off ranks until the king is mated on the edge',
        fen: '3k4/R7/8/8/8/8/8/1R4K1 w - - 0 1', line: ['b1b8'],
        relations: [arrow('b8', 'd8', red)], regions: [region('Cut off', rank(7), orange)] },
    'mating net': { aliases: ['mating nets', 'mating attack', 'mating pattern', 'mating patterns'],
        meaning: 'pieces surrounding the enemy king so mate cannot be stopped anymore' },
    luft: { aliases: ['escape square', 'air for the king', 'breathing room'],
        meaning: 'a pawn move in front of the castled king, like h3, that gives it a square to escape back rank mates',
        fen: '3r2k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', line: ['h2h3'],
        relations: [arrow('d8', 'd1', red)], regions: [region('Escape square', ['h2'], green)], weak: ['breathing room'] },
    stalemate: { aliases: ['stalemated', 'stalemates'],
        meaning: 'the side to move has no legal move but is not in check, the game is a draw',
        fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',
        relations: [arrow('f7', 'g8', red), arrow('f7', 'g7', red), arrow('g6', 'h7', red)], regions: [region('No safe square', ['g8', 'g7', 'h7'], red)] },
    'insufficient material': { aliases: ['not enough material', 'cannot mate', "can't mate"],
        meaning: 'neither side has enough pieces left to ever give checkmate, like king and bishop against king, so it is a draw',
        fen: '8/8/4k3/8/8/2B5/8/4K3 w - - 0 1',
        relations: [], regions: [region('Bishop alone cannot mate', ['c3'], orange)] },
    'threefold repetition': { aliases: ['repetition', 'three fold repetition', 'draw by repetition', 'repeat moves', 'repeating moves'],
        meaning: 'when the same position comes up three times with the same side to move, the player can claim a draw', weak: ['repetition'] },
    'fifty move rule': { aliases: ['50 move rule', '50-move rule', 'fifty-move rule'],
        meaning: 'after fifty moves by each side with no capture and no pawn move, a draw can be claimed' },
    elo: { aliases: ['elo rating', 'chess rating', 'rating points'],
        meaning: 'a number that measures playing strength from results against other rated players. Beating stronger players gains more points, losing to weaker ones costs more. It has nothing to do with material on the board' },
    // Rules and basics
    castling: { aliases: ['castle', 'castles', 'castled', 'short castle', 'long castle', 'castling short', 'castling long', 'castle kingside', 'castle queenside'],
        meaning: 'the king jumps two squares toward a rook and the rook hops over it. It tucks the king away and wakes up the rook. You cannot castle out of, through or into check',
        fen: 'r3k2r/pppqbppp/2np1n2/4p3/4P3/2NP1N2/PPPQBPPP/R3K2R w KQkq - 0 8', line: ['e1g1'],
        relations: [], regions: [region('King safety', ['f2', 'g2', 'h2'], green)], weak: ['castle', 'castles', 'castled', 'castling'] },
    promotion: { aliases: ['promote', 'promoting', 'promotes', 'queening', 'queen the pawn', 'underpromotion', 'underpromote'],
        meaning: 'a pawn reaching the last rank turns into a queen, rook, bishop or knight',
        fen: '8/4P1k1/8/8/8/8/8/4K3 w - - 0 1', line: ['e7e8q'],
        relations: [], regions: [region('New queen', ['e8'], green)], weak: ['promote', 'promoting', 'promotes', 'promotion'] },
    'en passant': { aliases: ['e.p.', 'en-passant', 'enpassant'],
        meaning: 'a pawn that just jumped two squares can be captured as if it had moved only one, but only right away',
        fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', line: ['e5d6'],
        relations: [], regions: [region('Captured pawn was here', ['d5'], red)] },
    development: { aliases: ['develop', 'developing', 'undeveloped', 'develops', 'developed'],
        meaning: 'bringing knights and bishops off the back rank early so they join the fight',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', line: ['g1f3', 'b8c6', 'f1c4'],
        relations: [], regions: [region('Developed', ['f3', 'c4'], green), region('Still home', ['b1', 'c1'], orange)], weak: ['develop', 'developing', 'develops', 'developed', 'development'] },
    'opening principles': { aliases: ['opening principle', 'opening basics', 'opening rules'],
        meaning: 'control the center, develop knights and bishops quickly, castle early and avoid moving the same piece twice without a reason',
        fen: START, line: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'],
        relations: [], regions: [region('Center', ['e4', 'e5'], blue), region('Developed and castled', ['f3', 'c4', 'g1'], green)] },
    center: { aliases: ['centre', 'central', 'center control', 'centralization', 'centralize', 'centralise', 'the middle'],
        meaning: 'the squares d4, d5, e4 and e5. Pieces there reach the most squares and pawns there gain space',
        fen: START, line: ['e2e4', 'e7e5', 'd2d4'],
        relations: [], regions: [region('Center', ['d4', 'd5', 'e4', 'e5'], blue)], weak: ['center', 'centre', 'central', 'centralize', 'centralise', 'the middle'] },
    tempo: { aliases: ['tempi', 'tempos', 'with tempo', 'gain a tempo', 'lose a tempo', 'gaining time'],
        meaning: 'one move of time. You gain a tempo when a useful move also forces a reply, like developing while hitting the queen',
        fen: START, line: ['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3'],
        relations: [arrow('c3', 'd5', red)], regions: [region('Develops with tempo', ['c3'], green)], weak: ['tempo', 'tempi', 'tempos', 'gaining time'] },
    initiative: { aliases: ['the initiative', 'seize the initiative'],
        meaning: 'having the moves that force the opponent to react, so you set the agenda and they are kept busy', weak: ['initiative'] },
    material: { aliases: ['material advantage', 'material edge', 'material deficit', 'material balance', 'extra pawn', 'extra piece', 'extra rook', 'extra knight', 'extra bishop', 'extra queen'],
        meaning: 'the pieces each side has. Typical values are pawn 1, knight or bishop 3, rook 5 and queen 9; a material lead alone does not prove a winning position', weak: ['material'] },
    'knight on the rim': { aliases: ['knight on the edge', 'on the rim', 'rim is dim', 'knights on the rim'],
        meaning: 'a knight on the edge reaches fewer squares, which is why people say a knight on the rim is dim',
        fen: '6k1/8/8/8/N7/8/8/6K1 w - - 0 1',
        relations: [], regions: [region('Only four squares', ['b6', 'c5', 'c3', 'b2'], orange)] },
    // Strategy and structure
    'pawn break': { aliases: ['break', 'breaks', 'lever', 'pawn lever', 'breakthrough', 'pawn breaks'],
        meaning: 'a pawn move that hits an enemy pawn to open lines and free your position',
        fen: 'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3', line: ['c7c5'],
        relations: [arrow('c5', 'd4', red)], regions: [region('Break', ['c5'], orange), region('Target', ['d4'], red)], weak: ['break', 'breaks', 'lever', 'breakthrough'] },
    outpost: { aliases: ['outposts', 'strong square', 'knight outpost'],
        meaning: 'a square in enemy territory protected by your pawn that no enemy pawn can ever attack, perfect for a knight',
        fen: 'r2q1rk1/pp3ppp/3p4/3Np3/4P3/8/PPP2PPP/R2QK2R w KQ - 0 12',
        relations: [arrow('e4', 'd5', green)], regions: [region('Outpost', ['d5'], blue)] },
    'isolated pawn': { aliases: ['isolani', 'isolated', 'iqp', 'isolated queen pawn', 'isolated pawns'],
        meaning: 'a pawn with no friendly pawns on the files next to it, so only pieces can defend it',
        fen: 'r1bq1rk1/pp2bppp/2n1pn2/8/3P4/2N2N2/PP2BPPP/R1BQ1RK1 w - - 0 10',
        relations: [], regions: [region('Isolani', ['d4'], red), region('Blockade', ['d5'], blue)], weak: ['isolated'] },
    'passed pawn': { aliases: ['passer', 'passed', 'passers', 'passed pawns'],
        meaning: 'a pawn with no enemy pawn in front of it or on the files next to it, nothing but pieces can stop it promoting',
        fen: '8/5k2/8/1P6/8/8/5K2/8 w - - 0 1',
        relations: [arrow('b5', 'b8', green)], regions: [region('Passed pawn', ['b5'], green), region('Free path', ['b6', 'b7', 'b8'], blue)], weak: ['passed'] },
    'outside passed pawn': { aliases: ['outside passer', 'outside passed pawns'],
        meaning: 'a passed pawn far away from the other pawns. It drags the enemy king away so your king can feast on the other side',
        fen: '8/5p2/5kpp/8/P7/5KPP/5P2/8 w - - 0 1',
        relations: [arrow('a4', 'a8', green)], regions: [region('Outside passer', ['a4'], green), region('Where the king wants to go', ['g6', 'h6', 'f7'], orange)] },
    'connected passed pawns': { aliases: ['connected passers', 'connected passed pawn', 'connected pawns'],
        meaning: 'two passed pawns on neighboring files that protect each other as they march, very hard to stop',
        fen: '6k1/p7/8/3PP3/8/8/6K1/8 w - - 0 1',
        relations: [arrow('d5', 'd8', green), arrow('e5', 'e8', green)], regions: [region('Connected passers', ['d5', 'e5'], green)], weak: ['connected pawns'] },
    'protected passed pawn': { aliases: ['protected passer', 'protected passed pawns'],
        meaning: 'a passed pawn defended by another pawn, so the enemy king cannot simply take it',
        fen: '6k1/8/p7/4P3/3P4/8/8/6K1 w - - 0 1',
        relations: [arrow('d4', 'e5', green)], regions: [region('Protected passer', ['e5'], green)] },
    'backward pawn': { aliases: ['backward', 'backward pawns'],
        meaning: 'a pawn left behind by its neighbors that cannot safely advance, the square in front of it becomes a hole',
        fen: 'r1bqkb1r/1p3ppp/p1np1n2/4p3/4P3/1NN5/PPP2PPP/R1BQKB1R w KQkq - 0 8',
        relations: [arrow('e4', 'd5', red)], regions: [region('Backward', ['d6'], red), region('Hole', ['d5'], orange)], weak: ['backward'] },
    'doubled pawns': { aliases: ['doubled', 'doubled pawn'],
        meaning: 'two pawns of the same color on one file. They cannot protect each other and block one another',
        fen: '4k3/pp3ppp/8/8/8/2P5/P1P2PPP/4K3 w - - 0 1',
        relations: [], regions: [region('Doubled', ['c2', 'c3'], red)], weak: ['doubled'] },
    'hanging pawns': { aliases: ['hanging pawn pair'],
        meaning: 'two pawns side by side on half open files with no friendly pawns next to them. Strong in the center while they stand, targets once they get stuck',
        fen: 'r2q1rk1/p3bppp/1p2pn2/8/2PP4/5N2/P4PPP/R2QR1K1 w - - 0 1',
        relations: [], regions: [region('Hanging pawns', ['c4', 'd4'], orange)] },
    'pawn chain': { aliases: ['chain', 'pawn chains', 'base of the chain'],
        meaning: 'pawns linked diagonally, each protecting the next. Attack the base because nothing protects it',
        fen: 'rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/2P5/PP3PPP/RNBQKBNR b KQkq - 0 4',
        relations: [arrow('c3', 'd4', green), arrow('d4', 'e5', green), arrow('c5', 'd4', red)], regions: [region('Chain', ['c3', 'd4', 'e5'], green), region('Base', ['c3'], orange)], weak: ['chain'] },
    'pawn islands': { aliases: ['pawn island', 'islands'],
        meaning: 'groups of pawns separated by files with no friendly pawns. Fewer islands usually means a healthier structure',
        fen: '6k1/pp3ppp/8/8/3P4/2P5/P5PP/6K1 w - - 0 1',
        relations: [], regions: [region('Island', ['a2'], orange), region('Island', ['c3', 'd4'], orange), region('Island', ['g2', 'h2'], orange)], weak: ['islands'] },
    'pawn majority': { aliases: ['majority', 'queenside majority', 'kingside majority', 'pawn majorities'],
        meaning: 'more pawns than the opponent on one side of the board, which can be turned into a passed pawn',
        fen: '6k1/pp3ppp/8/8/8/8/PPP2PPP/6K1 w - - 0 1',
        relations: [], regions: [region('Three against two', ['a2', 'b2', 'c2'], green)], weak: ['majority'] },
    'minority attack': { aliases: ['minority'],
        meaning: 'attacking with fewer pawns, like two against three, to create a weakness in the enemy pawn chain',
        fen: 'r1bq1rk1/pp2bppp/2p2n2/3p4/3P4/2NBPN2/PPQ2PPP/R3K2R w KQ - 0 10', line: ['b2b4', 'a7a6', 'b4b5'],
        relations: [arrow('b5', 'c6', red)], regions: [region('Two attackers', ['a2', 'b5'], green), region('Three defenders', ['a6', 'b7', 'c6'], red)], weak: ['minority'] },
    'weak square': { aliases: ['hole', 'holes', 'weak squares', 'weakness', 'weaknesses'],
        meaning: 'a square your pawns can no longer protect, enemy pieces can settle there for good',
        fen: 'r1bqkb1r/1p3ppp/p1np1n2/4p3/4P3/1NN5/PPP2PPP/R1BQKB1R w KQkq - 0 8', line: ['c3d5'],
        relations: [], regions: [region('Hole', ['d5'], orange)], weak: ['hole', 'holes', 'weakness', 'weaknesses'] },
    'space advantage': { aliases: ['more space', 'gain space', 'gaining space', 'cramped', 'cramped position', 'space'],
        meaning: 'pawns further up the board give your pieces more room behind them and cramp the opponent',
        fen: after('e2e4', 'e7e6', 'd2d4', 'd7d5', 'e4e5'),
        relations: [], regions: [region('Space-gaining pawns', ['d4', 'e5'], green), region('Room behind', box('defgh', '234'), blue)], weak: ['space', 'cramped', 'gain space'] },
    blockade: { aliases: ['blockader', 'blockading', 'blockaded', 'blockades'],
        meaning: 'putting a piece, ideally a knight, right in front of an enemy passed pawn so it cannot advance',
        fen: '6k1/8/3n4/3P4/8/8/8/6K1 w - - 0 1',
        relations: [], regions: [region('Blockader', ['d6'], blue), region('Stopped', ['d5'], red)], weak: ['blockaded'] },
    prophylaxis: { aliases: ['prophylactic', 'prophylactic move'],
        meaning: 'a quiet move that stops the opponent\'s idea before it happens. Here h3 rules out a pin with ...Bg4',
        fen: after('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d3', 'd7d6'), line: ['h2h3'],
        relations: [arrow('h3', 'g4', green)], regions: [region('No ...Bg4 now', ['g4'], green)] },
    'pawn storm': { aliases: ['pawn storms', 'storming', 'opposite side castling', 'opposite castling', 'castled on opposite sides'],
        meaning: 'pushing several pawns at the enemy king to rip open its shelter, typical when the kings castled on opposite sides',
        fen: 'r1bq1rk1/pp2ppbp/2np1np1/8/3NP1PP/2N1BP2/PPPQ4/2KR3R w - - 0 12', line: ['h4h5'],
        relations: [arrow('h5', 'g6', red)], regions: [region('Storm', ['g4', 'h5'], orange), region('Target', ['g8'], red)], weak: ['storming'] },
    'open file': { aliases: ['open files', 'open line', 'open lines'],
        meaning: 'a file with no pawns on it. Rooks and queens love them because they can reach deep into enemy land',
        fen: '6k1/pp3ppp/8/8/8/8/PP3PPP/3R2K1 w - - 0 1',
        relations: [arrow('d1', 'd8', blue)], regions: [region('Open d-file', file('d'), blue)], weak: ['open line', 'open lines'] },
    'half-open file': { aliases: ['half-open files', 'semi-open file', 'semi-open files', 'half open', 'semi open'],
        meaning: 'a file where only the enemy has a pawn. Your rook presses down it at that pawn',
        fen: '6k1/pp3ppp/2p5/8/8/8/PP3PPP/2R3K1 w - - 0 1',
        relations: [arrow('c1', 'c6', red)], regions: [region('Half-open c-file', ['c1', 'c2', 'c3', 'c4', 'c5'], blue)], weak: ['half open', 'semi open'] },
    battery: { aliases: ['batteries', 'doubling rooks', 'doubled rooks', 'double the rooks', 'stack the rooks'],
        meaning: 'two pieces lined up on the same line, like queen and rook on a file, so their power adds up',
        fen: '6k1/pp3ppp/8/8/8/8/PP1Q1PPP/3R2K1 w - - 0 1',
        relations: [arrow('d1', 'd2', blue), arrow('d2', 'd8', blue)], regions: [region('Battery', ['d1', 'd2'], blue)] },
    'rook on the seventh': { aliases: ['seventh rank', '7th rank', 'rooks on the seventh', 'pig on the seventh', 'pigs on the seventh', 'second rank'],
        meaning: 'a rook on the opponent\'s second rank (the seventh for White) eats pawns from the side and boxes in the king',
        fen: '6k1/ppR2ppp/8/8/8/8/5PPP/6K1 w - - 0 1',
        relations: [arrow('c7', 'b7', red), arrow('c7', 'f7', red)], regions: [region('Seventh rank', rank(7), orange)], weak: ['second rank'] },
    'rook behind passed pawn': { aliases: ['tarrasch rule', 'rook behind the passed pawn', 'rooks behind passed pawns', 'rook behind the passer', 'behind the passer'],
        meaning: 'rooks belong behind passed pawns, yours or the enemy\'s, because they gain power as the pawn advances. This is the Tarrasch rule',
        fen: '1r6/6k1/8/1P6/8/8/6K1/1R6 w - - 0 1',
        relations: [arrow('b1', 'b5', green)], regions: [region('Behind the passer', ['b1'], green), region('In front, getting passive', ['b8'], orange)] },
    'king safety': { aliases: ['king shelter', 'pawn shield', 'exposed king', 'king exposure', 'unsafe king', 'safe king'],
        meaning: 'keeping the king covered by pawns and pieces, an exposed king gets attacked',
        fen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7',
        relations: [], regions: [region('Pawn shield', ['f2', 'g2', 'h2'], green), region('King home', ['g1', 'h1', 'f1'], blue)], weak: ['safe king'] },
    'king activity': { aliases: ['active king', 'activate the king', 'centralize the king', 'king march'],
        meaning: 'in the endgame the king becomes a fighting piece, and a central active king often decides the game',
        fen: '7k/6pp/8/8/4K3/8/6PP/8 w - - 0 1',
        relations: [], regions: [region('Active king', ['e4'], green), region('Passive king', ['h8'], orange)] },
    'bad bishop': { aliases: ['good bishop', 'bad bishops', 'good bishops'],
        meaning: 'a bishop stuck behind its own pawns fixed on its color. A good bishop has its pawns on the other color',
        fen: 'rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/2P5/PP3PPP/RNBQKBNR b KQkq - 0 4',
        relations: [], regions: [region('Bad bishop', ['c8'], orange), region('Own pawns in the way', ['d5', 'e6'], red)] },
    'bishop pair': { aliases: ['two bishops', 'pair of bishops', 'the bishops'],
        meaning: 'having both bishops while the opponent does not. Together they cover every square and shine in open positions',
        fen: 'r3k2r/pp1n1ppp/2p1p3/8/3P4/2B2B2/PP3PPP/R3K2R w KQkq - 0 15',
        relations: [arrow('c3', 'h8', blue), arrow('f3', 'b7', blue)], regions: [region('Bishop pair', ['c3', 'f3'], blue)], weak: ['the bishops'] },
    'opposite colored bishops': { aliases: ['opposite colour bishops', 'opposite-colored bishops', 'bishops of opposite color', 'opposite color bishops', 'ocb'],
        meaning: 'each side has one bishop and they run on different colors. Very drawish in endgames, but strong for the attacker in middlegames',
        fen: '6k1/4bppp/8/8/8/3B4/5PPP/6K1 w - - 0 1',
        relations: [], regions: [region('Light squares only', ['d3'], blue), region('Dark squares only', ['e7'], purple)] },
    fianchetto: { aliases: ['fianchettoed', 'fianchettoing', 'fianchettos'],
        meaning: 'a bishop developed to g2 or b2 (g7 or b7 for Black) after a knight pawn move, aiming down the long diagonal',
        fen: 'rnbqkbnr/ppp1pppp/8/3p4/8/6P1/PPPPPPBP/RNBQK1NR b KQkq - 1 2',
        relations: [arrow('g2', 'a8', blue)], regions: [region('Long diagonal', diagonal('h1', 'a8'), blue)] },
    gambit: { aliases: ['gambits', 'gambiting'],
        meaning: 'giving up a pawn or more in the opening for faster development or attack',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2', line: ['e5f4'],
        relations: [], regions: [region('Pawn offered', ['f4'], orange), region('Open f-file', ['f1', 'f2', 'f3'], blue)] },
    simplification: { aliases: ['simplify', 'simplifying', 'trade down', 'trading down', 'trade pieces'],
        meaning: 'trading pieces to reach a simpler position, smart when you are ahead in material because your extra stuff counts for more', weak: ['simplify', 'simplifying', 'trade pieces'] },
    counterplay: { aliases: ['counter play', 'counterattack', 'counter attack'],
        meaning: 'active chances of your own, so the opponent cannot just carry out their plan in peace', weak: ['counterattack', 'counter attack'] },
    compensation: { aliases: ['comp', 'enough compensation'],
        meaning: 'what you get for material you gave up, like a lead in development, an attack or a strong pawn', weak: ['comp'] },
    'color complex': { aliases: ['colour complex', 'weak color complex', 'weak dark squares', 'weak light squares', 'dark squares', 'light squares'],
        meaning: 'a group of squares of one color that your pawns and bishop no longer guard, enemy pieces can use all of them', weak: ['dark squares', 'light squares'] },
    // Endgames
    opposition: { aliases: ['the opposition', 'direct opposition', 'take the opposition'],
        meaning: 'kings face each other with one square between. The side NOT to move holds the opposition and wins the standoff',
        fen: '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1', line: ['e6d6', 'e4f5'],
        relations: [], regions: [region('White king marches in', ['f5'], green), region('Gap', ['e5'], orange)] },
    zugzwang: { aliases: ['zugzwang', 'mutual zugzwang'],
        meaning: 'any move makes your position worse, you would love to pass but chess does not allow it',
        fen: '8/8/4k3/8/4K3/4P3/8/8 b - - 0 1',
        relations: [], regions: [region('Black must give way', ['d6', 'f6', 'd7', 'e7', 'f7'], red), region('Standoff', ['e4', 'e6'], blue)] },
    'key squares': { aliases: ['key square', 'critical squares'],
        meaning: 'squares that win a king and pawn endgame once your king reaches them, whoever is to move. For a pawn on e4 they are d6, e6 and f6',
        fen: '4k3/8/8/8/4P3/4K3/8/8 w - - 0 1',
        relations: [], regions: [region('Key squares', ['d6', 'e6', 'f6'], green)] },
    'rule of the square': { aliases: ['square of the pawn', 'the square rule', 'pawn square'],
        meaning: 'imagine a square from the pawn to its promotion rank. If the defending king can step inside it, it catches the pawn',
        fen: '8/8/8/5k2/P7/8/8/7K b - - 0 1', line: ['f5e5'],
        relations: [arrow('a4', 'a8', orange)], regions: [region('The square', box('abcde', '45678'), blue)] },
    triangulation: { aliases: ['triangulate', 'triangulating'],
        meaning: 'the king takes three moves to come back to a square, losing a tempo on purpose so the opponent has to move in zugzwang' },
    'lucena position': { aliases: ['lucena', 'building a bridge', 'build a bridge'], title: 'Lucena position',
        meaning: 'the key winning rook endgame. The king stands on the queening square in front of its pawn, the enemy king is cut off and the rook builds a bridge to block checks',
        fen: '3K4/3P1k2/8/8/8/8/2r5/4R3 w - - 0 1',
        relations: [arrow('e1', 'e8', blue)], regions: [region('On the queening square', ['d8'], green), region('Cut off', ['f7'], red), region('Bridge rank', ['e4'], orange)] },
    'philidor position': { aliases: ['philidor', 'third rank defense', 'third rank defence'], title: 'Philidor position',
        meaning: 'the classic rook endgame draw. The defending rook holds the third rank until the pawn advances, then checks from behind',
        fen: '4k3/7R/r7/3KP3/8/8/8/8 w - - 0 1',
        relations: [], regions: [region('Third rank wall', rank(6), blue), region('Defending king', ['e8'], green)] },
    'wrong colored bishop': { aliases: ['wrong bishop', 'wrong-colored bishop', 'wrong colour bishop', 'wrong rook pawn'],
        meaning: 'a bishop that cannot cover the queening corner of a rook pawn, so the lone defending king draws in that corner',
        fen: '7k/8/7P/8/8/3B4/8/6K1 w - - 0 1',
        relations: [], regions: [region('Dark corner the bishop never touches', ['h8'], red)] },
    fortress: { aliases: ['fortresses', 'build a fortress'],
        meaning: 'a defensive setup the stronger side cannot break through, so the game is drawn despite less material' },
    // Openings
    'italian game': opening('Italian Game', ['giuoco piano', 'italian opening', 'italian'],
        '1.e4 e5 2.Nf3 Nc6 3.Bc4. The bishop eyes f7 and White aims for quick development and central play',
        ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'], [arrow('c4', 'f7', orange)], [], ['italian']),
    'ruy lopez': opening('Ruy Lopez', ['spanish opening', 'spanish game', 'ruy', 'spanish'],
        '1.e4 e5 2.Nf3 Nc6 3.Bb5. The bishop pressures the knight that defends e5, one of the oldest and deepest openings',
        ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'], [arrow('b5', 'c6', orange), arrow('c6', 'e5', blue)], [], ['spanish', 'ruy']),
    'sicilian defense': opening('Sicilian Defense', ['sicilian', 'the sicilian'],
        '1.e4 c5. Black fights for d4 from the side and gets an unbalanced, sharp game',
        ['e2e4', 'c7c5'], [arrow('c5', 'd4', orange)]),
    najdorf: opening('Najdorf Sicilian', ['najdorf sicilian', 'najdorf variation'],
        'the Sicilian line 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6, flexible and one of the sharpest openings there is',
        ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6'], [], [region('The Najdorf move', ['a6'], orange)]),
    dragon: opening('Sicilian Dragon', ['sicilian dragon', 'dragon variation', 'dragon'],
        'the Sicilian line 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 g6. Black puts the bishop on the long diagonal, and the kings often castle on opposite sides',
        ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'g7g6'], [], [region('Long diagonal home', ['g7'], orange)], ['dragon']),
    'french defense': opening('French Defense', ['french', 'the french'],
        '1.e4 e6 2.d4 d5. Solid and counterattacking, but the light squared bishop can get stuck behind the e6 pawn',
        ['e2e4', 'e7e6', 'd2d4', 'd7d5'], [arrow('d5', 'e4', red)], [region('Problem bishop', ['c8'], orange)], ['french']),
    'caro-kann defense': opening('Caro-Kann Defense', ['caro-kann', 'caro', 'the caro'],
        '1.e4 c6 2.d4 d5. Solid like the French, but the light squared bishop gets out before ...e6',
        ['e2e4', 'c7c6', 'd2d4', 'd7d5'], [arrow('d5', 'e4', red), arrow('c8', 'f5', green)], [], ['caro']),
    'scandinavian defense': opening('Scandinavian Defense', ['scandinavian', 'scandi', 'center counter', 'centre counter'],
        '1.e4 d5. Black hits e4 at once, and after 2.exd5 Qxd5 the queen comes out early',
        ['e2e4', 'd7d5', 'e4d5', 'd8d5'], [], [region('Early queen', ['d5'], orange)]),
    'pirc defense': opening('Pirc Defense', ['pirc'],
        '1.e4 d6 2.d4 Nf6 3.Nc3 g6. Black fianchettoes and lets White build a center to strike at it later',
        ['e2e4', 'd7d6', 'd2d4', 'g8f6', 'b1c3', 'g7g6'], [], [region('White center', ['d4', 'e4'], blue)]),
    'alekhine defense': opening('Alekhine Defense', ['alekhine', "alekhine's defense"],
        '1.e4 Nf6. Black tempts the White pawns forward so they can be attacked later',
        ['e2e4', 'g8f6'], [arrow('f6', 'e4', red)]),
    'petrov defense': opening('Petrov Defense', ['petrov', 'petroff', 'petroff defense', 'russian game'],
        '1.e4 e5 2.Nf3 Nf6. Black counterattacks e4 instead of defending e5, very solid',
        ['e2e4', 'e7e5', 'g1f3', 'g8f6'], [arrow('f6', 'e4', red), arrow('f3', 'e5', red)]),
    'scotch game': opening('Scotch Game', ['scotch', 'scotch opening'],
        '1.e4 e5 2.Nf3 Nc6 3.d4. White opens the center right away',
        ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4'], [arrow('d4', 'e5', red)], [], ['scotch']),
    'vienna game': opening('Vienna Game', ['vienna', 'vienna opening'],
        '1.e4 e5 2.Nc3. A flexible start that can turn into f4 gambits or calm play',
        ['e2e4', 'e7e5', 'b1c3'], [], [region('Ready for f4', ['f2'], orange)], ['vienna']),
    "king's gambit": opening("King's Gambit", ['kings gambit'],
        '1.e4 e5 2.f4. White gives a pawn to open the f-file and grab the center, sharp and romantic',
        ['e2e4', 'e7e5', 'f2f4'], [arrow('f4', 'e5', red)], [region('Pawn offered', ['f4'], orange)]),
    'evans gambit': opening('Evans Gambit', ['evans'],
        '1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4. White gives a pawn for fast development and a big center',
        ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4'], [arrow('b4', 'c5', red)], [], ['evans']),
    'fried liver attack': opening('Fried Liver Attack', ['fried liver'],
        '1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Ng5 d5 5.exd5 Nxd5 6.Nxf7. A knight sacrifice on f7 that drags the Black king out',
        ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5', 'f6d5', 'g5f7'], [arrow('f7', 'd8', red), arrow('f7', 'h8', red)], [region('Sacrifice', ['f7'], red)]),
    "queen's gambit": opening("Queen's Gambit", ['queens gambit', 'qgd', 'qga', "queen's gambit declined", "queen's gambit accepted"],
        '1.d4 d5 2.c4. White offers the c-pawn to pull Black\'s d-pawn away from the center',
        ['d2d4', 'd7d5', 'c2c4'], [arrow('c4', 'd5', red)]),
    'slav defense': opening('Slav Defense', ['slav', 'the slav'],
        '1.d4 d5 2.c4 c6. Black supports d5 with a pawn and keeps the light squared bishop free',
        ['d2d4', 'd7d5', 'c2c4', 'c7c6'], [arrow('c6', 'd5', green)], [], ['slav']),
    'london system': opening('London System', ['london', 'the london'],
        '1.d4 with an early Bf4 and e3. A solid setup that is easy to learn and works against almost anything',
        ['d2d4', 'd7d5', 'c1f4', 'g8f6', 'e2e3'], [], [region('London setup', ['d4', 'e3', 'f4'], blue)], ['london']),
    "king's indian defense": opening("King's Indian Defense", ["king's indian", 'kings indian', 'kings indian defense'],
        '1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6. Black lets White take the center and strikes back later with ...e5 or ...c5',
        ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6'], [arrow('g7', 'd4', orange)], [region('White center', ['c4', 'd4', 'e4'], blue)]),
    'grunfeld defense': opening('Grünfeld Defense', ['grunfeld', 'gruenfeld', 'grünfeld', 'grünfeld defense'],
        '1.d4 Nf6 2.c4 g6 3.Nc3 d5. Black invites a big White center and then attacks it with pieces and ...c5',
        ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'd7d5'], [arrow('d5', 'c4', red)]),
    'nimzo-indian defense': opening('Nimzo-Indian Defense', ['nimzo-indian', 'nimzo', 'nimzo indian'],
        '1.d4 Nf6 2.c4 e6 3.Nc3 Bb4. Black pins the knight to fight for e4 and may double White\'s pawns',
        ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4'], [arrow('b4', 'c3', red), arrow('c3', 'e1', red)]),
    'catalan opening': opening('Catalan Opening', ['catalan'],
        '1.d4 Nf6 2.c4 e6 3.g3. White fianchettoes the bishop to press down the long diagonal',
        ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'g2g3'], [], [region('Bishop goes to g2', ['g2'], blue)], ['catalan']),
    'dutch defense': opening('Dutch Defense', ['dutch', 'the dutch', 'stonewall'],
        '1.d4 f5. Black grabs control of e4 and often aims for a kingside attack, at some cost to king safety',
        ['d2d4', 'f7f5'], [arrow('f5', 'e4', orange)], [], ['dutch', 'stonewall']),
    'english opening': opening('English Opening', ['english', 'the english'],
        '1.c4. White controls d5 from the side and often fianchettoes the king\'s bishop',
        ['c2c4'], [arrow('c4', 'd5', orange)], [], ['english']),
    bongcloud: opening('Bongcloud', ['bongcloud attack', 'bong cloud'],
        '1.e4 e5 2.Ke2. A joke opening that walks the king out for no reason at all',
        ['e2e4', 'e7e5', 'e1e2'], [], [region('Why', ['e2'], red)])
};

// Matching is span based and longest first, so "back rank mate" is one concept and not also "mate".
// Apostrophes are optional and spaces match hyphens, so "kings gambit" and "caro kann" still match.
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrasePattern = phrase => escape(phrase.toLowerCase()).replace(/'/g, "'?").replace(/(?:\\-|\s)+/g, '[\\s-]+').replace(/defen[cs]e/g, 'defen[cs]e');
const phrases = Object.entries(glossary)
    .flatMap(([term, entry]) => [term, ...entry.aliases].map(phrase => ({ phrase, term, weak: Boolean(entry.weak?.includes(phrase)), loose: Boolean(entry.loose?.includes(phrase)),
        pattern: new RegExp(`(?<![a-z0-9])${phrasePattern(phrase)}(?![a-z0-9])`, 'g') })))
    .sort((a, b) => b.phrase.length - a.phrase.length);
// Bare names like "French" or "London" only count as openings when the words around them say so.
const openingContext = /\b(?:the|opening|openings|defen[cs]e|variation|line|lines|gambit|system|attack|repertoire|play|plays|playing|played|against|as white|as black|main|favou?rite)\b/;

// Preserve offsets for speech cues while excluding ordinary non-chess uses of these words.
export function literalChessText(text) {
    return String(text || '').replace(/\b(?:central (?:question|issue|point|idea|theme|topic|concern|message|problem|role)|cent(?:er|re) of (?:attention|interest|discussion)|(?:at|in) the (?:very )?cent(?:er|re) of (?:the |this |that )?(?:question|discussion|debate)|(?:in|into) (?:the )?(?:spot)?light of|check (?:out|your (?:settings|browser|connection|microphone)|the (?:settings|browser|connection))|pin (?:it |that |this )?down|fork in the road|develop(?:ing|ment)? (?:an? |the )?(?:app|application|software)|opening (?:the |a )?(?:app|application|window|settings|browser))\b/gi,
        match => ' '.repeat(match.length));
}

export function glossaryMentions(text) {
    const lower = literalChessText(text).toLowerCase().replace(/[\u2018\u2019]/g, "'");
    const found = [];
    for(const item of phrases) {
        for(const match of lower.matchAll(item.pattern)) {
            const index = match.index, end = index + match[0].length;
            if(found.some(other => index < other.end && end > other.index)) continue;
            if(item.loose) {
                const start = Math.max(0, ...[...lower.slice(0, index).matchAll(/[.!?,;:]/g)].map(stop => stop.index + 1));
                const stop = lower.slice(end).search(/[.!?,;:]/);
                if(!openingContext.test(lower.slice(start, stop < 0 ? lower.length : end + stop))) continue;
            }
            found.push({ term: item.term, phrase: item.phrase, index, end, weak: item.weak });
        }
    }
    return found.sort((a, b) => a.index - b.index);
}

// Unique terms in the order they were mentioned.
export function glossaryTerms(text) {
    return [...new Set(glossaryMentions(text).map(item => item.term))];
}

export function definitionReply(question) {
    const mentions = glossaryMentions(question);
    if(mentions.length !== 1
        || /\b(?:my|your|our|their|here|this (?:position|move|piece)|why|how|should)\b|\b[a-h][1-8]\b/i.test(question)) return null;
    const mention = mentions[0];
    const before = question.slice(0, mention.index).trim().replace(/[\u2018\u2019]/g, "'");
    const after = question.slice(mention.end).replace(/[?.!]+$/, '').trim();
    if(!/^(?:please\s+)?(?:(?:can|could) you\s+)?(?:what(?:'s| is| are| does| do)(?: (?:an?|the))?|define(?: (?:an?|the))?|explain (?:an?|the|the term))$/i.test(before)
        || !/^(?:(?:mean|means)(?: in chess)?|in chess)?(?:\s*please)?$/i.test(after)) return null;
    const term = mention.term, entry = glossary[term];
    const title = entry.title || term[0].toUpperCase() + term.slice(1);
    return `${title}: ${entry.meaning.replace(/[.!?]$/, '')}.`;
}

// A definition introduces hypothetical roles, not occupants of the player's board.
// Keep that scope through explanatory sentences until the speaker returns to a concrete position.
export function definitionSpans(text, question = '') {
    const spans = [], mentions = glossaryMentions(text);
    const queried = definitionReply(question) && glossaryMentions(question)[0];
    let active = null;
    for(const { segment, index } of new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)) {
        const named = mentions.find(mention => mention.index >= index && mention.end <= index + segment.length
            && /^(?:\s|["'(])*(?:(?:an?|the)\s+|in\s+(?:an?|the)\s+)?$/i.test(text.slice(index, mention.index))
            && /^\s*(?::|(?:is|means|happens|occurs|involves|describes)\b)/i.test(text.slice(mention.end))
            // "Material is equal" describes the board, while "Material is the sum of..." defines the word.
            && (!mention.weak || /^\s*(?::|(?:means|happens|occurs|involves|describes)\b|is\s+(?!(?:an?|one)\s+(?:\w+\s+)?(?:pawn|piece|exchange|knight|bishop|rook|queen)s?\s+(?:up|down|ahead|behind|short)\b)(?:(?:an?|the|when|where|what|how|having|being)\b|\w+ing\s+(?:your|the|an?|its|their|pieces|pawns|out|up)\b))/i.test(text.slice(mention.end))));
        const concrete = /\b(?:your|our|their|white(?:'s)?|black(?:'s)?)\s+(?:(?:[a-z]+|[a-h][1-8])[- ]+){0,2}(?:king|queen|rook|bishop|knight|pawn|piece)s?\b|\b(?:here|in (?:this|the current|our) position|on (?:this|our|the live) board)\b|\b[a-h][1-8]\b/i.test(segment);
        const genericSubject = segment.match(/^\s*(?:(?:an?|any|each|every)\s+(?:\w+\s+)?(?:piece|pawn|knight|bishop|rook|queen|king)\b|(?:pieces|pawns|knights|bishops|rooks|queens|kings)\b)/i);
        const predicate = genericSubject && segment.slice(genericSubject[0].length);
        const rule = genericSubject && (/\b(?:if|when|whenever|generally|usually|in chess)\b/i.test(segment)
            || /^\s+(?:(?:can|may)\s+)?(?:moves?|captures?|attacks?)\s+(?:only\s+)?(?:diagonally|horizontally|vertically|in (?:an? )?(?:L[- ]shape|straight lines?)|(?:one|two|1|2) squares?|(?:along|on) (?:an? |the )?(?:file|rank|diagonal)s?)\b/i.test(predicate)
            || /^\s+(?:is|are)\s+(?:an?\s+|worth\b|the most\b)/i.test(predicate));
        const example = /^\s*(?:for example|for instance|suppose|imagine|in (?:this|an?) example)\b/i.test(segment);
        const genericDefinition = named && /^\s*(?::\s*(?:an?|one|two)\s+(?:piece|pawn|knight|bishop|rook|queen|king)\b|(?:is|means)\s+(?:when|where)\b)/i.test(text.slice(named.end));
        if(named && (!concrete || genericDefinition && !/\b(?:here|in this position|on this board)\b/i.test(segment))) active = named;
        else if(concrete && !(active && example)) active = null;
        else if(index === 0 && queried) active = { ...queried, index: 0, end: 0 };
        else if(rule) active = { term: null, index, end: index };
        if(active) spans.push({ index, end: index + segment.length, term: active.term,
            mention: named || (index === 0 ? active : null) });
    }
    return spans;
}

export const hasDemo = term => Boolean(glossary[term]?.fen);
export const demoId = term => term.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
export const demoTerm = id => Object.keys(glossary).find(term => demoId(term) === id) || null;
export const termTitle = term => glossary[term]?.title || term;

// Fact kinds from the fact sheet that show the same idea as a glossary term on the live board.
const kindTerms = { 'attacked by a cheaper piece': 'hanging piece', 'double attack': 'fork', 'king activity': 'king activity' };
export function kindTerm(kind) {
    const base = String(kind || '').replace(/^opponent /, '');
    return kindTerms[base] || glossaryTerms(base)[0] || null;
}

export function demo(term) {
    const entry = glossary[term];
    if(!entry?.fen) return null;
    const board = new Chess(entry.fen);
    const frames = [];
    for(const uci of entry.line || []) {
        const beforeFen = board.fen();
        const move = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        if(!move) return null;
        frames.push({ san: move.san, from: move.from, to: move.to, color: move.color, beforeFen, fen: board.fen() });
    }
    return { term, title: termTitle(term), meaning: entry.meaning, fen: entry.fen, frames, finalFen: board.fen(),
        references: { squares: [], moves: [], frames: [], relations: entry.relations || [], regions: entry.regions || [] } };
}
